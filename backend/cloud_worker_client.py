"""
Cloud Worker Client module for ViralDog Desktop Backend.
Handles sending scheduled publishing jobs to the 24/7 Cloud Worker,
and syncing back publication status (posted/failed/media_id) when the app runs.
"""
import os
import json
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from database import Config, Post, Account, SessionLocal
import cloud_storage


def _get_cfg(db: Optional[Session], key: str, default: str = "") -> str:
    env_val = os.getenv(key.upper()) or os.getenv(key)
    if env_val:
        return env_val.strip()
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        cfg = db.query(Config).filter(Config.key == key).first()
        if cfg and cfg.value:
            return cfg.value.strip()
        return default
    finally:
        if close_db:
            db.close()


def is_cloud_worker_configured(db: Optional[Session] = None) -> bool:
    """Returns True if both Cloud Worker URL and Secret Key are present and S3/R2 storage is ready."""
    worker_url = _get_cfg(db, "cloud_worker_url")
    worker_secret = _get_cfg(db, "cloud_worker_secret")
    storage_ok = cloud_storage.is_storage_configured(db)
    return bool(worker_url and worker_secret and storage_ok)


def test_cloud_worker_connection(worker_url: str, worker_secret: str) -> Dict[str, Any]:
    """Tests connection and authentication with a remote Cloud Worker."""
    if not worker_url:
        return {"status": "error", "message": "URL do Cloud Worker não fornecida."}

    norm_url = worker_url.strip().rstrip("/")
    if not norm_url.startswith("http://") and not norm_url.startswith("https://"):
        norm_url = f"https://{norm_url}"

    try:
        # 1. Health check
        health_res = requests.get(f"{norm_url}/health", timeout=10)
        if health_res.status_code != 200:
            return {"status": "error", "message": f"Servidor respondeu com status {health_res.status_code} no healthcheck."}
        
        health_data = health_res.json()

        # 2. Secret authentication check
        sync_res = requests.post(
            f"{norm_url}/api/jobs/sync",
            headers={"X-Worker-Secret": worker_secret.strip()},
            json={"local_post_ids": []},
            timeout=10
        )
        if sync_res.status_code == 401:
            return {"status": "error", "message": "Conectado ao servidor, mas a Chave Secreta (X-Worker-Secret) está incorreta."}
        elif sync_res.status_code != 200:
            return {"status": "error", "message": f"Erro de validação na API: {sync_res.text}"}

        return {
            "status": "success",
            "message": "Conectado com sucesso ao Cloud Worker 24/7!",
            "details": health_data
        }
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"Não foi possível conectar ao servidor: {e}"}


def schedule_job_to_cloud(
    post: Post,
    account: Account,
    db: Session
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Uploads media to Cloud Storage (R2/S3) and sends scheduled job to Cloud Worker.
    Returns: (success, cloud_job_id, error_message)
    """
    worker_url = _get_cfg(db, "cloud_worker_url")
    worker_secret = _get_cfg(db, "cloud_worker_secret")

    if not worker_url or not worker_secret:
        return False, None, "Cloud Worker não configurado nas Configurações."

    norm_url = worker_url.strip().rstrip("/")
    if not norm_url.startswith("http://") and not norm_url.startswith("https://"):
        norm_url = f"https://{norm_url}"

    # Identificar credenciais oficiais da Meta
    access_token = account.access_token or account.fb_access_token
    ig_user_id = account.ig_user_id or account.fb_ig_account_id or account.instagram_user_id

    if not access_token or not ig_user_id:
        return False, None, f"A conta @{account.username} não possui Token ou ID da Meta Oficial."

    try:
        # 1. Upload das mídias para S3/R2
        cleanup_key = None
        carousel_urls = []
        media_url = ""

        if post.post_type == "carousel" and post.carousel_image_paths:
            img_list = json.loads(post.carousel_image_paths)
            for p in img_list:
                url, s3_k = cloud_storage.upload_media_for_meta(p, db=db)
                carousel_urls.append(url)
            media_url = carousel_urls[0] if carousel_urls else ""
        else:
            media_url, cleanup_key = cloud_storage.upload_media_for_meta(post.video_path, db=db)

        # Montar configuração do S3 para permitir cleanup após publicação
        s3_cfg = {
            "s3_endpoint_url": _get_cfg(db, "s3_endpoint_url"),
            "s3_bucket_name": _get_cfg(db, "s3_bucket_name"),
            "s3_access_key": _get_cfg(db, "s3_access_key"),
            "s3_secret_key": _get_cfg(db, "s3_secret_key"),
        }

        # Formatar data ISO UTC
        sched_time = post.scheduled_time
        if sched_time.tzinfo is None:
            sched_time_iso = sched_time.replace(tzinfo=timezone.utc).isoformat()
        else:
            sched_time_iso = sched_time.astimezone(timezone.utc).isoformat()

        payload = {
            "local_post_id": post.id,
            "account_username": account.username,
            "ig_user_id": str(ig_user_id),
            "access_token": access_token,
            "media_url": media_url,
            "carousel_urls": carousel_urls if carousel_urls else None,
            "post_type": post.post_type or "reel",
            "caption": post.caption or "",
            "scheduled_time": sched_time_iso,
            "cleanup_s3_key": cleanup_key,
            "s3_config": s3_cfg
        }

        res = requests.post(
            f"{norm_url}/api/jobs",
            headers={
                "X-Worker-Secret": worker_secret,
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=30
        )

        if res.status_code not in [200, 201]:
            return False, None, f"Cloud Worker recusou o agendamento: {res.text}"

        res_data = res.json()
        job_id = res_data.get("job_id")
        return True, job_id, None

    except Exception as e:
        return False, None, f"Falha ao enviar post para Cloud Worker: {e}"


def sync_cloud_jobs(db: Session, post_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """
    Fetches status updates from Cloud Worker for scheduled posts and updates local SQLite database.
    """
    worker_url = _get_cfg(db, "cloud_worker_url")
    worker_secret = _get_cfg(db, "cloud_worker_secret")

    if not worker_url or not worker_secret:
        return {"synced": 0, "status": "skipped", "message": "Cloud Worker não configurado."}

    norm_url = worker_url.strip().rstrip("/")
    if not norm_url.startswith("http://") and not norm_url.startswith("https://"):
        norm_url = f"https://{norm_url}"

    # Se não especificou post_ids, busca todos os posts locais pendentes ou com cloud_job_id
    if not post_ids:
        cloud_posts = db.query(Post).filter(
            (Post.is_cloud_scheduled == True) | (Post.cloud_job_id != None),
            Post.status.in_(["pending", "processing"])
        ).all()
        target_ids = [p.id for p in cloud_posts]
    else:
        target_ids = post_ids

    if not target_ids:
        # Também busca os últimos 30 posts da nuvem para atualizar qualquer status pendente
        sync_payload = {"local_post_ids": None}
    else:
        sync_payload = {"local_post_ids": target_ids}

    try:
        res = requests.post(
            f"{norm_url}/api/jobs/sync",
            headers={"X-Worker-Secret": worker_secret},
            json=sync_payload,
            timeout=15
        )

        if res.status_code != 200:
            return {"synced": 0, "status": "error", "message": f"Erro na sincronização: {res.text}"}

        data = res.json()
        jobs = data.get("jobs", [])
        updated_count = 0

        for job in jobs:
            local_id = job.get("local_post_id")
            if not local_id:
                continue

            local_post = db.query(Post).filter(Post.id == local_id).first()
            if not local_post:
                continue

            cloud_status = job.get("status")
            if cloud_status == "posted":
                if local_post.status != "posted":
                    local_post.status = "posted"
                    local_post.ig_media_id = job.get("ig_media_id") or local_post.ig_media_id
                    pub_time_str = job.get("published_at")
                    if pub_time_str:
                        try:
                            local_post.published_at = datetime.fromisoformat(pub_time_str.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
                        except Exception:
                            local_post.published_at = datetime.utcnow()
                    else:
                        local_post.published_at = datetime.utcnow()
                    local_post.error_message = None
                    updated_count += 1
            elif cloud_status == "failed":
                if local_post.status != "failed":
                    local_post.status = "failed"
                    local_post.error_message = job.get("error_message") or "Erro desconhecido na publicação em nuvem."
                    updated_count += 1

        db.commit()
        return {
            "synced": updated_count,
            "status": "success",
            "total_cloud_jobs": len(jobs)
        }
    except Exception as e:
        return {"synced": 0, "status": "error", "message": str(e)}
