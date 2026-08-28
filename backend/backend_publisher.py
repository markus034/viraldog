"""
Publisher module — Publishes content to Instagram (Reels, Carousel, Stories),
with cross-posting to TikTok and YouTube Shorts, repost management, and
best-time suggestions.
"""
import time
import os
import json
import requests
from datetime import datetime, timedelta
from instagrapi import Client
from sqlalchemy.orm import Session
from database import Config, Post, PostAnalytics, Account, AccountProfile
import backend_ai_service as ai_service
from utils import get_config_val





def extract_video_thumbnail(video_path: str) -> str:
    """
    Gera uma thumbnail JPEG para o vídeo para evitar falhas do MoviePy/Instagrapi.
    """
    if not video_path or not os.path.exists(video_path):
        return None
    thumb_path = os.path.splitext(video_path)[0] + "_thumb.jpg"
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        cap.set(cv2.CAP_PROP_POS_MSEC, 500)
        success, frame = cap.read()
        if not success:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            success, frame = cap.read()
        if success and frame is not None:
            cv2.imwrite(thumb_path, frame)
            cap.release()
            return thumb_path
        cap.release()
    except Exception as e:
        print(f"[extract_video_thumbnail] cv2 falhou: {e}")

    try:
        import subprocess
        from utils import get_ffmpeg_exe
        ffmpeg_bin = get_ffmpeg_exe()
        cmd = [ffmpeg_bin, "-y", "-ss", "00:00:00.500", "-i", video_path, "-vframes", "1", "-q:v", "2", thumb_path]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if os.path.exists(thumb_path):
            return thumb_path
    except Exception as e:
        print(f"[extract_video_thumbnail] ffmpeg falhou: {e}")

    return None


# ─── Instagrapi Publishing ───

def publish_via_instagrapi(video_path: str, caption: str, cookies_json: str, proxy_url: str = None) -> str:
    """
    Publishes a local video to Reels using the user's cookies/session (instagrapi).
    """
    if not cookies_json:
        raise ValueError("Nenhum cookie de sessão do Instagram encontrado para esta conta.")
        
    cl = Client()
    
    # Set proxy if provided
    if proxy_url:
        cl.set_proxy(proxy_url)
    
    try:
        cookies = json.loads(cookies_json)
        cl.set_country("BR")
        cl.set_locale("pt_BR")
        cl.set_timezone_offset(-3 * 3600)
        
        cookies_dict = {}
        if isinstance(cookies, list):
            for c in cookies:
                cookies_dict[c.get('name')] = c.get('value')
        else:
            cookies_dict = cookies
            
        cl.login_by_sessionid(cookies_dict.get('sessionid'))
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "too many" in err_str.lower():
            raise Exception("Bloqueio temporário do Instagram por excesso de requisições (Rate Limit 429). Aguarde 15 a 30 minutos antes de tentar novamente.")
        elif any(k in err_str.lower() for k in ["login_required", "checkpoint", "challenge", "feedback_required"]):
            raise Exception("Sessão do Instagram expirou ou requer verificação de segurança. Atualize o login na aba Perfis.")
        raise Exception(f"Falha ao autenticar cookies do Instagram: {e}")
        
    try:
        thumb_path = extract_video_thumbnail(video_path)
        if thumb_path and os.path.exists(thumb_path):
            media = cl.clip_upload(video_path, caption, thumbnail=thumb_path)
        else:
            media = cl.clip_upload(video_path, caption)
        return media.pk
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "too many" in err_str.lower():
            raise Exception("Instagram bloqueou o upload por excesso de requisições (Rate Limit 429). Aguarde alguns minutos.")
        raise Exception(f"Erro ao subir Reels via automação local: {e}")





# ─── Repost Management ───

def check_repost_eligible(db: Session, min_days: int = 30, min_engagement: float = 5.0) -> list:
    """
    Find posts that are eligible for automatic reposting.
    Criteria: published, high engagement, posted at least X days ago, not already reposted.
    """
    cutoff = datetime.utcnow() - timedelta(days=min_days)
    
    eligible = db.query(Post).filter(
        Post.status == "posted",
        Post.is_repost == False,
        Post.created_at <= cutoff,
        Post.engagement_score >= min_engagement
    ).all()
    
    # Filter out posts that already have a repost scheduled
    result = []
    for post in eligible:
        existing_repost = db.query(Post).filter(
            Post.original_post_id == post.id,
            Post.is_repost == True
        ).first()
        
        if not existing_repost:
            result.append({
                "id": post.id,
                "video_path": post.video_path,
                "caption": post.caption,
                "engagement_score": post.engagement_score,
                "posted_at": post.created_at.isoformat() if post.created_at else None
            })
    
    return result


def create_repost(db: Session, original_post_id: int, scheduled_time: datetime = None) -> Post:
    """
    Create a repost of a high-performing post with a varied caption.
    """
    original = db.query(Post).filter(Post.id == original_post_id).first()
    if not original:
        raise ValueError(f"Post #{original_post_id} não encontrado.")
    
    # Generate varied caption
    try:
        new_caption = ai_service.generate_caption_variation(db, original.caption or "")
    except Exception:
        new_caption = original.caption  # Fallback to original if AI fails
    
    # Schedule for next available best time if not specified
    if not scheduled_time:
        scheduled_time = datetime.utcnow() + timedelta(hours=24)
    
    repost = Post(
        video_path=original.video_path,
        caption=new_caption,
        scheduled_time=scheduled_time,
        account_username=original.account_username,
        status="pending",
        post_type=original.post_type,
        is_repost=True,
        original_post_id=original.id
    )
    db.add(repost)
    db.commit()
    db.refresh(repost)
    
    return repost


# ─── Best Time Suggestion ───

def suggest_best_time(db: Session, account_username: str = None) -> dict:
    """
    Suggest the next best time to post based on historical analytics.
    Returns a datetime suggestion with reasoning.
    """
    from backend_analytics import get_best_posting_times
    
    best_times = get_best_posting_times(db, account_username)
    
    if not best_times:
        # Default: tomorrow at 9 AM
        tomorrow = datetime.utcnow().replace(hour=12, minute=0, second=0) + timedelta(days=1)
        return {
            "suggested_time": tomorrow.isoformat(),
            "reason": "Sem dados de analytics. Horário padrão sugerido: 9h (BRT).",
            "confidence": "low"
        }
    
    # Find the next occurrence of the best time slot
    now = datetime.utcnow()
    day_map = {"Segunda": 0, "Terça": 1, "Quarta": 2, "Quinta": 3, "Sexta": 4, "Sábado": 5, "Domingo": 6}
    
    best = best_times[0]
    target_weekday = day_map.get(best["day"], 0)
    target_hour = best["hour"]
    
    # Calculate days until target weekday
    current_weekday = now.weekday()
    days_ahead = (target_weekday - current_weekday) % 7
    if days_ahead == 0 and now.hour >= target_hour:
        days_ahead = 7  # Next week
    
    suggested = now.replace(hour=target_hour, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    
    return {
        "suggested_time": suggested.isoformat(),
        "reason": f"Baseado em {best.get('sample_count', 0)} posts anteriores, {best['day']} às {target_hour}h tem engajamento médio de {best['avg_engagement']}%.",
        "confidence": "high" if best.get("sample_count", 0) >= 5 else "medium",
        "all_suggestions": best_times
    }


# ─── Official Instagram Graph API Publishing ───

def _resolve_media_url(file_path: str, public_base_url: str = "") -> str:
    """Helper to convert local file path to accessible public URL or keep existing URL."""
    if not file_path:
        return ""
    if file_path.startswith("http://") or file_path.startswith("https://"):
        return file_path
    
    base = public_base_url.rstrip("/") if public_base_url else "http://localhost:8000"
    filename = os.path.basename(file_path)
    return f"{base}/uploads/{filename}"


def publish_via_official_api(video_path: str, caption: str, access_token: str, ig_user_id: str,
                             post_type: str = "reel", carousel_images: list = None,
                             public_base_url: str = "") -> str:
    """
    Publishes content via official Instagram Graph API (Instagram Login / Content Publishing API).
    Supports Reels, Single Images, and Carousels.
    """
    if not access_token or not ig_user_id:
        raise ValueError("Token de acesso ou ID da conta do Instagram não informado.")

    base_url = f"https://graph.facebook.com/v19.0/{ig_user_id}/media"

    # 1. Carrossel
    if post_type == "carousel" and carousel_images and len(carousel_images) > 0:
        child_ids = []
        for img_item in carousel_images:
            item_url = _resolve_media_url(img_item, public_base_url)
            is_video = img_item.lower().endswith(('.mp4', '.mov', '.avi'))
            child_payload = {
                "access_token": access_token,
                "is_carousel_item": "true",
            }
            if is_video:
                child_payload["media_type"] = "VIDEO"
                child_payload["video_url"] = item_url
            else:
                child_payload["image_url"] = item_url

            c_res = requests.post(base_url, data=child_payload, timeout=30)
            if c_res.status_code != 200:
                raise Exception(f"Erro ao criar item do carrossel na Meta API: {c_res.text}")
            child_id = c_res.json().get("id")
            if child_id:
                child_ids.append(child_id)

        # Criar container pai do carrossel
        parent_payload = {
            "caption": caption,
            "media_type": "CAROUSEL",
            "children": ",".join(child_ids),
            "access_token": access_token,
        }
        res = requests.post(base_url, data=parent_payload, timeout=30)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de carrossel na Meta API: {res.text}")
        container_id = res.json().get("id")

    # 2. Imagem Única
    elif post_type in ["image", "photo"] or (video_path and video_path.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))):
        image_url = _resolve_media_url(video_path, public_base_url)
        payload = {
            "caption": caption,
            "image_url": image_url,
            "access_token": access_token,
        }
        res = requests.post(base_url, data=payload, timeout=30)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de imagem na Meta API: {res.text}")
        container_id = res.json().get("id")

    # 3. Reels / Vídeo
    else:
        video_url = _resolve_media_url(video_path, public_base_url)
        payload = {
            "caption": caption,
            "media_type": "REELS",
            "video_url": video_url,
            "access_token": access_token,
        }
        res = requests.post(base_url, data=payload, timeout=30)
        if res.status_code != 200:
            raise Exception(f"Erro ao criar container de Reel na Meta API: {res.text}")
        container_id = res.json().get("id")

    if not container_id:
        raise Exception("Container ID não retornado pela API do Instagram.")

    # 4. Aguardar processamento do container pela Meta
    check_url = f"https://graph.facebook.com/v19.0/{container_id}"
    for attempt in range(40):
        time.sleep(3)
        check_res = requests.get(check_url, params={"fields": "status_code,status", "access_token": access_token}, timeout=10)
        if check_res.status_code == 200:
            status_data = check_res.json()
            status_code = status_data.get("status_code")
            if status_code == "FINISHED":
                break
            elif status_code == "ERROR":
                error_msg = status_data.get("status", "Erro desconhecido")
                raise Exception(f"Falha no processamento da mídia pela API da Meta: {error_msg}")

    # 5. Publicar o Container
    publish_url = f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish"
    pub_res = requests.post(publish_url, data={"creation_id": container_id, "access_token": access_token}, timeout=30)
    if pub_res.status_code != 200:
        raise Exception(f"Erro ao publicar container na API Oficial da Meta: {pub_res.text}")

    return pub_res.json().get("id", container_id)


# ─── Funções Oficiais de Agendamento Meta Graph API (v21.0) ───

def agendar_post_imagem(token: str, insta_id: str, url_imagem: str, legenda: str, data_agendamento: datetime) -> dict:
    """
    Agenda uma foto única no Feed.
    data_agendamento: datetime (mínimo 15 min, máximo 75 dias no futuro)
    """
    timestamp = int(data_agendamento.timestamp())
    url = f"https://graph.facebook.com/v21.0/{insta_id}/media"
    
    payload = {
        "image_url": url_imagem,
        "caption": legenda or "",
        "scheduled_publish_time": timestamp,
        "access_token": token
    }
    
    res = requests.post(url, data=payload, timeout=30)
    data = res.json()
    if res.status_code != 200 or "id" not in data:
        error_msg = data.get("error", {}).get("message") or res.text
        raise Exception(f"Erro na Meta API ao agendar imagem: {error_msg}")
    return data


def agendar_reels(token: str, insta_id: str, url_video: str, legenda: str, data_agendamento: datetime) -> dict:
    """
    Agenda um vídeo no formato Reels.
    """
    timestamp = int(data_agendamento.timestamp())
    url = f"https://graph.facebook.com/v21.0/{insta_id}/media"
    
    payload = {
        "media_type": "REELS",
        "video_url": url_video,
        "caption": legenda or "",
        "share_to_feed": True,
        "scheduled_publish_time": timestamp,
        "access_token": token
    }
    
    res = requests.post(url, data=payload, timeout=30)
    data = res.json()
    if res.status_code != 200 or "id" not in data:
        error_msg = data.get("error", {}).get("message") or res.text
        raise Exception(f"Erro na Meta API ao agendar Reels: {error_msg}")
    return data


def agendar_carrossel(token: str, insta_id: str, lista_urls_imagens: list, legenda: str, data_agendamento: datetime) -> dict:
    """
    Agenda um carrossel de 2 a 10 imagens.
    """
    if len(lista_urls_imagens) < 2:
        raise ValueError("O carrossel precisa de no mínimo 2 imagens.")
    if len(lista_urls_imagens) > 10:
        raise ValueError("O carrossel suporta no máximo 10 imagens.")

    ids_filhos = []
    url_base = f"https://graph.facebook.com/v21.0/{insta_id}/media"
    
    # Passo 1: Criar o contêiner individual de cada imagem
    for url_img in lista_urls_imagens:
        payload_filho = {
            "image_url": url_img,
            "is_carousel_item": True,
            "access_token": token
        }
        res_filho = requests.post(url_base, data=payload_filho, timeout=30).json()
        if "id" in res_filho:
            ids_filhos.append(res_filho["id"])
        else:
            error_msg = res_filho.get("error", {}).get("message") or str(res_filho)
            raise Exception(f"Erro ao criar item do carrossel: {error_msg}")
            
    # Passo 2: Criar o contêiner Pai com a legenda e o scheduled_publish_time
    timestamp = int(data_agendamento.timestamp())
    payload_pai = {
        "media_type": "CAROUSEL",
        "children": ",".join(ids_filhos),
        "caption": legenda or "",
        "scheduled_publish_time": timestamp,
        "access_token": token
    }
    
    res_pai = requests.post(url_base, data=payload_pai, timeout=30).json()
    if "id" in res_pai:
        return res_pai
    else:
        error_msg = res_pai.get("error", {}).get("message") or str(res_pai)
        raise Exception(f"Erro ao criar carrossel: {error_msg}")


from database import Config, Post, PostAnalytics, Account, AccountProfile


# ─── Unified Publish Entrypoint ───

def publish_post(video_path: str, caption: str, cookies_json: str, db: Session,
                 account_username: str = None, post_type: str = "reel",
                 carousel_images: list = None, cross_targets: list = None) -> str:
    """
    Publish content using active session cookies and proxy via instagrapi.
    """
    proxy_url = None
    if account_username:
        clean_user = account_username.strip().lstrip('@')
        acc = db.query(Account).filter((Account.username == clean_user) | (Account.display_name == account_username)).first()
        if acc:
            proxy_url = acc.proxy_url
            if not cookies_json and acc.session_cookies:
                cookies_json = acc.session_cookies

    # Publish via instagrapi
    media_id = publish_via_instagrapi(video_path, caption, cookies_json, proxy_url)
    return media_id
