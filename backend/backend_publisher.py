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


# ─── Official Instagram Graph API Publishing (v22.0) ───

def check_24h_post_limit(db: Session, ig_user_id: str = None, account_username: str = None) -> bool:
    """
    Checks if account has reached Meta's 100 posts per 24-hour rolling window limit.
    Returns True if allowed to publish, False if limit reached.
    """
    cutoff = datetime.utcnow() - timedelta(hours=24)
    query = db.query(Post).filter(
        Post.status == "posted",
        (Post.published_at >= cutoff) | ((Post.published_at == None) & (Post.created_at >= cutoff))
    )
    if ig_user_id:
        query = query.filter(Post.ig_user_id == str(ig_user_id))
    elif account_username:
        query = query.filter(Post.account_username == account_username)
    else:
        return True
    count = query.count()
    print(f"[Meta RateLimit] Publicações da conta {account_username or ig_user_id} nas últimas 24h: {count}/100")
    return count < 100


def publish_via_official_api(video_path: str, caption: str, access_token: str, ig_user_id: str,
                             post_type: str = "reel", carousel_images: list = None,
                             db: Session = None) -> str:
    """
    Publishes content via official Meta Instagram Graph API v22.0.
    Uploads local media to Cloud Storage (S3/R2) or public server, creates container,
    waits for FINISHED status, and executes media_publish.
    """
    import cloud_storage
    if not access_token or not ig_user_id:
        raise ValueError("Token de acesso ou ID da conta do Instagram não informado.")

    base_url = f"https://graph.facebook.com/v22.0/{ig_user_id}/media"
    uploaded_keys_to_clean = []

    try:
        # 1. Carrossel
        if post_type == "carousel" and carousel_images and len(carousel_images) > 0:
            child_ids = []
            for item_path in carousel_images:
                item_url, s3_key = cloud_storage.upload_media_for_meta(item_path, db=db)
                if s3_key:
                    uploaded_keys_to_clean.append(s3_key)

                is_video = item_path.lower().endswith(('.mp4', '.mov', '.avi'))
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
                    raise Exception(f"Erro ao criar item de carrossel na Meta API: {c_res.text}")
                child_id = c_res.json().get("id")
                if child_id:
                    child_ids.append(child_id)

            parent_payload = {
                "caption": caption or "",
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
            image_url, s3_key = cloud_storage.upload_media_for_meta(video_path, db=db)
            if s3_key:
                uploaded_keys_to_clean.append(s3_key)

            payload = {
                "caption": caption or "",
                "image_url": image_url,
                "access_token": access_token,
            }
            res = requests.post(base_url, data=payload, timeout=30)
            if res.status_code != 200:
                raise Exception(f"Erro ao criar container de foto na Meta API: {res.text}")
            container_id = res.json().get("id")

        # 3. Reels / Vídeo
        else:
            video_url, s3_key = cloud_storage.upload_media_for_meta(video_path, db=db)
            if s3_key:
                uploaded_keys_to_clean.append(s3_key)

            payload = {
                "caption": caption or "",
                "media_type": "REELS",
                "video_url": video_url,
                "share_to_feed": "true",
                "access_token": access_token,
            }
            res = requests.post(base_url, data=payload, timeout=30)
            if res.status_code != 200:
                raise Exception(f"Erro ao criar container de Reels na Meta API: {res.text}")
            container_id = res.json().get("id")

        if not container_id:
            raise Exception("Container ID não retornado pela API da Meta.")

        # 4. Polling do status do container até FINISHED
        check_url = f"https://graph.facebook.com/v22.0/{container_id}"
        print(f"[Meta API] Aguardando processamento do container {container_id}...")
        status_ok = False
        for attempt in range(40):  # 40 * 3s = 120s timeout
            time.sleep(3)
            check_res = requests.get(
                check_url,
                params={"fields": "status_code,status", "access_token": access_token},
                timeout=12
            )
            if check_res.status_code == 200:
                sdata = check_res.json()
                code = sdata.get("status_code")
                if code == "FINISHED":
                    status_ok = True
                    break
                elif code == "ERROR":
                    err_detail = sdata.get("status", "Erro desconhecido durante o processamento da mídia.")
                    raise Exception(f"Processamento rejeitado pela Meta API: {err_detail}")

        if not status_ok:
            raise Exception("Tempo limite esgotado aguardando processamento do vídeo pela Meta.")

        # 5. Publicar o Container
        publish_url = f"https://graph.facebook.com/v22.0/{ig_user_id}/media_publish"
        pub_res = requests.post(
            publish_url,
            data={"creation_id": container_id, "access_token": access_token},
            timeout=30
        )
        if pub_res.status_code != 200:
            raise Exception(f"Erro ao publicar mídia na Meta API: {pub_res.text}")

        media_id = pub_res.json().get("id", container_id)
        print(f"[Meta API] Mídia publicada com sucesso! ID: {media_id}")
        return media_id

    finally:
        # Cleanup arquivos temporários do Cloud Storage
        for k in uploaded_keys_to_clean:
            try:
                cloud_storage.delete_from_storage(k, db=db)
            except Exception:
                pass


# ─── Unified Publish Entrypoint ───

def publish_post(video_path: str, caption: str, cookies_json: str, db: Session,
                 account_username: str = None, post_type: str = "reel",
                 carousel_images: list = None, cross_targets: list = None) -> str:
    """
    Unified publishing entrypoint.
    Automatically determines whether to publish via official Meta Graph API or instagrapi cookies.
    """
    acc = None
    if account_username:
        clean_user = account_username.strip().lstrip('@')
        acc = db.query(Account).filter(
            (Account.username == clean_user) |
            (Account.display_name == account_username) |
            (Account.ig_username == clean_user)
        ).first()

    # Checar se a conta utiliza API Oficial da Meta
    is_official = False
    if acc:
        if acc.auth_mode == "official" or acc.fb_access_token or acc.access_token:
            is_official = True

    if is_official and acc:
        if getattr(acc, "revoked", False):
            raise Exception(f"A conta @{acc.username} foi desautorizada na Meta. Por favor, reconecte nas Definições.")

        ig_user_id = acc.ig_user_id or acc.fb_ig_account_id or acc.instagram_user_id
        token = acc.access_token or acc.fb_access_token
        if not token or not ig_user_id:
            raise Exception(f"Conta oficial @{acc.username} incompleta (token ou ID da conta ausente).")

        # Verificar limite de 100 posts por 24h
        if not check_24h_post_limit(db, ig_user_id=ig_user_id, account_username=acc.username):
            raise Exception(f"Limite móvel da Meta de 100 publicações em 24h atingido para @{acc.username}.")

        media_id = publish_via_official_api(
            video_path=video_path,
            caption=caption,
            access_token=token,
            ig_user_id=ig_user_id,
            post_type=post_type or "reel",
            carousel_images=carousel_images,
            db=db
        )
        return media_id

    # Fallback para automação por cookies (instagrapi)
    proxy_url = None
    if acc:
        proxy_url = acc.proxy_url
        if not cookies_json and acc.session_cookies:
            cookies_json = acc.session_cookies

    media_id = publish_via_instagrapi(video_path, caption, cookies_json, proxy_url)
    return media_id
