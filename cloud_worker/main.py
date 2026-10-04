"""
ViralDog Cloud Worker — Autônomo 24/7 na Nuvem
Publica mídias agendadas na Meta Graph API v22.0 mesmo com o computador local desligado.
"""
import os
import json
import time
import uuid
import threading
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import requests
from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, Boolean, select
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from dotenv import load_dotenv

load_dotenv()

# Configurações do Ambiente
WORKER_SECRET_KEY = os.getenv("WORKER_SECRET_KEY", "viraldog-cloud-secret-2026")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./worker.db")

# Ajuste para Render/Railway postgres:// -> postgresql://
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configuração do Banco de Dados
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    local_post_id = Column(Integer, index=True, nullable=True)
    account_username = Column(String, nullable=True)
    ig_user_id = Column(String, nullable=False)
    access_token = Column(Text, nullable=False)
    media_url = Column(Text, nullable=False)
    carousel_urls_json = Column(Text, nullable=True)
    post_type = Column(String, default="reel")  # reel, image, carousel
    caption = Column(Text, nullable=True)
    scheduled_time = Column(DateTime, index=True, nullable=False)  # UTC
    status = Column(String, default="pending", index=True)  # pending, processing, posted, failed, cancelled
    ig_media_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    cleanup_s3_key = Column(String, nullable=True)
    cover_url = Column(Text, nullable=True)
    cleanup_cover_s3_key = Column(String, nullable=True)
    s3_config_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)


Base.metadata.create_all(bind=engine)

# Migração suave para garantir colunas em bancos SQLite/Postgres existentes
try:
    with engine.connect() as conn:
        from sqlalchemy import text
        for col, col_type in [("cover_url", "TEXT"), ("cleanup_cover_s3_key", "VARCHAR")]:
            try:
                conn.execute(text(f"ALTER TABLE scheduled_jobs ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass
except Exception:
    pass


# FastAPI App
app = FastAPI(
    title="ViralDog Cloud Worker",
    description="Agendador autônomo na nuvem para publicações do Instagram via Meta Graph API v22.0",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_secret(x_worker_secret: Optional[str] = Header(None)):
    """Verifica autenticação via Header X-Worker-Secret."""
    expected = WORKER_SECRET_KEY.strip()
    if not x_worker_secret or x_worker_secret.strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Chave de autenticação do Cloud Worker inválida ou não fornecida (X-Worker-Secret)."
        )
    return True


# Schemas
class CreateJobRequest(BaseModel):
    local_post_id: Optional[int] = None
    account_username: Optional[str] = None
    ig_user_id: str
    access_token: str
    media_url: str
    carousel_urls: Optional[List[str]] = None
    post_type: Optional[str] = "reel"
    caption: Optional[str] = ""
    scheduled_time: str  # ISO string UTC
    cleanup_s3_key: Optional[str] = None
    cover_url: Optional[str] = None
    cleanup_cover_s3_key: Optional[str] = None
    s3_config: Optional[Dict[str, Any]] = None


class SyncRequest(BaseModel):
    local_post_ids: Optional[List[int]] = None
    since_utc: Optional[str] = None


# Publicador Meta Graph API v22.0
def cleanup_s3_file(cleanup_s3_key: str, s3_config: dict):
    if not cleanup_s3_key or not s3_config:
        return
    try:
        import boto3
        from botocore.config import Config as BotoConfig
        endpoint = s3_config.get("s3_endpoint_url")
        if endpoint and not endpoint.startswith("http"):
            endpoint = f"https://{endpoint}"
        
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=s3_config.get("s3_access_key"),
            aws_secret_access_key=s3_config.get("s3_secret_key"),
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto" if "r2.cloudflarestorage.com" in (endpoint or "") else "us-east-1"
        )
        bucket = s3_config.get("s3_bucket_name")
        client.delete_object(Bucket=bucket, Key=cleanup_s3_key)
        print(f"[CloudWorker] Arquivo temporário {cleanup_s3_key} removido do Cloud Storage.")
    except Exception as e:
        print(f"[CloudWorker] Falha na limpeza de {cleanup_s3_key} do Cloud Storage: {e}")


def execute_meta_publish(job: ScheduledJob) -> str:
    """Executa a publicação oficial na Meta Graph API v22.0."""
    access_token = job.access_token
    ig_user_id = job.ig_user_id
    caption = job.caption or ""
    post_type = job.post_type or "reel"
    media_url = job.media_url
    carousel_urls = json.loads(job.carousel_urls_json) if job.carousel_urls_json else None

    if access_token.startswith("IGA") or access_token.startswith("IGQ") or "instagram.com" in str(ig_user_id):
        graph_host = "https://graph.instagram.com"
    else:
        graph_host = "https://graph.facebook.com"

    base_url = f"{graph_host}/v22.0/{ig_user_id}/media"

    # 1. Carrossel
    if post_type == "carousel" and carousel_urls and len(carousel_urls) > 0:
        child_ids = []
        for item_url in carousel_urls:
            is_video = any(item_url.lower().split("?")[0].endswith(ext) for ext in [".mp4", ".mov", ".avi"])
            child_payload = {
                "access_token": access_token,
                "is_carousel_item": "true",
            }
            if is_video:
                child_payload["media_type"] = "VIDEO"
                child_payload["video_url"] = item_url
            else:
                child_payload["image_url"] = item_url

            c_res = requests.post(base_url, data=child_payload, timeout=35)
            if c_res.status_code != 200:
                raise Exception(f"Erro ao criar item carrossel: {c_res.text}")
            child_id = c_res.json().get("id")
            if child_id:
                child_ids.append(child_id)

        parent_payload = {
            "caption": caption,
            "media_type": "CAROUSEL",
            "children": ",".join(child_ids),
            "access_token": access_token,
        }
        res = requests.post(base_url, data=parent_payload, timeout=35)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de carrossel: {res.text}")
        container_id = res.json().get("id")

    # 2. Imagem Única
    elif post_type in ["image", "photo"] or any(media_url.lower().split("?")[0].endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"]):
        payload = {
            "caption": caption,
            "image_url": media_url,
            "access_token": access_token,
        }
        res = requests.post(base_url, data=payload, timeout=35)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de foto: {res.text}")
        container_id = res.json().get("id")

    # 3. Reels / Vídeo
    else:
        payload = {
            "caption": caption,
            "media_type": "REELS",
            "video_url": media_url,
            "share_to_feed": "true",
            "access_token": access_token,
        }
        if getattr(job, "cover_url", None):
            payload["cover_url"] = job.cover_url
            print(f"[CloudWorker] Capa personalizada anexada ao Reels: {job.cover_url}")

        res = requests.post(base_url, data=payload, timeout=35)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de Reels: {res.text}")
        container_id = res.json().get("id")

    if not container_id:
        raise Exception("Container ID não retornado pela API da Meta.")

    # 4. Polling até status FINISHED
    check_url = f"{graph_host}/v22.0/{container_id}"
    status_ok = False
    for attempt in range(40):  # 40 * 3s = 120s
        time.sleep(3)
        check_res = requests.get(
            check_url,
            params={"fields": "status_code,status", "access_token": access_token},
            timeout=15
        )
        if check_res.status_code == 200:
            sdata = check_res.json()
            code = sdata.get("status_code")
            if code == "FINISHED":
                status_ok = True
                break
            elif code == "ERROR":
                err_detail = sdata.get("status", "Erro durante processamento de mídia na Meta.")
                raise Exception(f"Processamento rejeitado pela Meta API: {err_detail}")

    if not status_ok:
        raise Exception("Tempo limite esgotado aguardando processamento da mídia pela Meta.")

    # 5. Publicar container
    publish_url = f"{graph_host}/v22.0/{ig_user_id}/media_publish"
    pub_res = requests.post(
        publish_url,
        data={"creation_id": container_id, "access_token": access_token},
        timeout=35
    )
    if pub_res.status_code != 200:
        raise Exception(f"Erro ao publicar mídia na Meta API: {pub_res.text}")

    media_id = pub_res.json().get("id", container_id)
    return str(media_id)


# Loop do Agendador em Segundo Plano (Cron 24/7)
def background_scheduler_loop():
    print("[CloudWorker] Background scheduler daemon iniciado (24/7).")
    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.utcnow()
                pending_jobs = db.query(ScheduledJob).filter(
                    ScheduledJob.status == "pending",
                    ScheduledJob.scheduled_time <= now
                ).all()

                for job in pending_jobs:
                    print(f"[CloudWorker] Iniciando publicação do Job #{job.id} (Local #{job.local_post_id}) para @{job.account_username}...")
                    job.status = "processing"
                    db.commit()

                    try:
                        media_id = execute_meta_publish(job)
                        job.status = "posted"
                        job.ig_media_id = media_id
                        job.published_at = datetime.utcnow()
                        job.error_message = None
                        print(f"[CloudWorker] ✅ Job #{job.id} publicado com sucesso! Instagram Media ID: {media_id}")

                        # Cleanup opcional de S3
                        if job.s3_config_json:
                            try:
                                s3_cfg = json.loads(job.s3_config_json)
                                if job.cleanup_s3_key:
                                    cleanup_s3_file(job.cleanup_s3_key, s3_cfg)
                                if getattr(job, "cleanup_cover_s3_key", None):
                                    cleanup_s3_file(job.cleanup_cover_s3_key, s3_cfg)
                            except Exception as c_err:
                                print(f"[CloudWorker] Falha ao limpar S3: {c_err}")

                    except Exception as err:
                        err_str = str(err)
                        print(f"[CloudWorker] ❌ Falha ao publicar Job #{job.id}: {err_str}")
                        job.status = "failed"
                        job.error_message = err_str

                    db.commit()
                    time.sleep(3)  # intervalo de segurança entre posts
            finally:
                db.close()
        except Exception as loop_err:
            print(f"[CloudWorker] Erro no loop do agendador: {loop_err}")

        time.sleep(30)  # Checar novos agendamentos a cada 30 segundos


# Iniciar thread do agendador ao carregar
worker_thread = threading.Thread(target=background_scheduler_loop, daemon=True)
worker_thread.start()


# Endpoints
@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "online",
        "worker": "ViralDog Cloud Worker",
        "version": "1.0.0",
        "time_utc": datetime.utcnow().isoformat(),
        "active_jobs_check": "running_daemon"
    }


@app.post("/api/jobs")
def create_or_update_job(
    req: CreateJobRequest,
    authorized: bool = Depends(verify_secret),
    db: Session = Depends(get_db)
):
    try:
        # Parse scheduled_time ISO
        raw_time = req.scheduled_time.strip()
        if raw_time.endswith("Z"):
            raw_time = raw_time[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw_time)
        if dt.tzinfo is not None:
            dt_utc = dt.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            dt_utc = dt

        # Verificar se já existe um job para este local_post_id pendente
        existing_job = None
        if req.local_post_id:
            existing_job = db.query(ScheduledJob).filter(
                ScheduledJob.local_post_id == req.local_post_id,
                ScheduledJob.status.in_(["pending", "processing"])
            ).first()

        carousel_json = json.dumps(req.carousel_urls) if req.carousel_urls else None
        s3_json = json.dumps(req.s3_config) if req.s3_config else None

        if existing_job:
            existing_job.account_username = req.account_username
            existing_job.ig_user_id = req.ig_user_id
            existing_job.access_token = req.access_token
            existing_job.media_url = req.media_url
            existing_job.carousel_urls_json = carousel_json
            existing_job.post_type = req.post_type or "reel"
            existing_job.caption = req.caption
            existing_job.scheduled_time = dt_utc
            existing_job.cleanup_s3_key = req.cleanup_s3_key
            existing_job.cover_url = req.cover_url
            existing_job.cleanup_cover_s3_key = req.cleanup_cover_s3_key
            existing_job.s3_config_json = s3_json
            existing_job.status = "pending"
            db.commit()
            db.refresh(existing_job)
            return {
                "status": "updated",
                "job_id": existing_job.id,
                "scheduled_time_utc": existing_job.scheduled_time.isoformat()
            }

        job = ScheduledJob(
            local_post_id=req.local_post_id,
            account_username=req.account_username,
            ig_user_id=req.ig_user_id,
            access_token=req.access_token,
            media_url=req.media_url,
            carousel_urls_json=carousel_json,
            post_type=req.post_type or "reel",
            caption=req.caption,
            scheduled_time=dt_utc,
            cleanup_s3_key=req.cleanup_s3_key,
            cover_url=req.cover_url,
            cleanup_cover_s3_key=req.cleanup_cover_s3_key,
            s3_config_json=s3_json,
            status="pending"
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        return {
            "status": "created",
            "job_id": job.id,
            "scheduled_time_utc": job.scheduled_time.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao agendar job na nuvem: {e}")


@app.post("/api/jobs/sync")
def sync_jobs(
    req: SyncRequest,
    authorized: bool = Depends(verify_secret),
    db: Session = Depends(get_db)
):
    query = db.query(ScheduledJob)
    if req.local_post_ids:
        query = query.filter(ScheduledJob.local_post_id.in_(req.local_post_ids))
    elif req.since_utc:
        try:
            since_dt = datetime.fromisoformat(req.since_utc.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
            query = query.filter(ScheduledJob.created_at >= since_dt)
        except Exception:
            pass

    jobs = query.order_by(ScheduledJob.scheduled_time.desc()).limit(200).all()
    results = []
    for j in jobs:
        results.append({
            "job_id": j.id,
            "local_post_id": j.local_post_id,
            "account_username": j.account_username,
            "status": j.status,
            "scheduled_time": j.scheduled_time.isoformat() if j.scheduled_time else None,
            "published_at": j.published_at.isoformat() if j.published_at else None,
            "ig_media_id": j.ig_media_id,
            "error_message": j.error_message
        })

    return {"status": "success", "jobs": results}


@app.delete("/api/jobs/{job_id}")
def cancel_job(
    job_id: str,
    authorized: bool = Depends(verify_secret),
    db: Session = Depends(get_db)
):
    job = db.query(ScheduledJob).filter(ScheduledJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado.")

    if job.status == "processing":
        raise HTTPException(status_code=400, detail="Job já está sendo processado.")

    job.status = "cancelled"
    db.commit()
    return {"status": "cancelled", "job_id": job_id}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
