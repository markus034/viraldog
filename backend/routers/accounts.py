import os
import shutil
import json
import requests
import threading
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import get_db, SessionLocal, Account, AccountProfile, Post, FollowerSnapshot, APP_DATA_DIR
from schemas import CookieAccountCreate, AccountPatchRequest, AccountProfileUpdate
from routers.auth import get_current_user

AVATARS_DIR = os.path.join(APP_DATA_DIR, "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _download_and_save_avatar_job(account_id: int):
    """Worker para buscar e baixar a foto oficial de perfil do Instagram."""
    db = SessionLocal()
    try:
        acc = db.query(Account).filter(Account.id == account_id).first()
        if not acc or not acc.username:
            return

        pic_url = None

        # 1. Tentar obter via instagrapi caso haja sessão
        if acc.session_cookies:
            try:
                from backend_analytics import _init_instagrapi_client
                cl = _init_instagrapi_client(acc)
                if cl:
                    u = None
                    try:
                        u = cl.account_info()
                    except Exception:
                        pass
                    if not u:
                        try:
                            u = cl.user_info_by_username(acc.username)
                        except Exception:
                            pass
                    if u and getattr(u, 'profile_pic_url', None):
                        pic_url = str(u.profile_pic_url)
            except Exception as e:
                print(f"Instagrapi avatar fetch notice (@{acc.username}): {e}")

        # 2. Tentar obter via web profile info público
        if not pic_url:
            try:
                from backend_analytics import _fetch_public_profile_info
                info = _fetch_public_profile_info(acc.username, acc.proxy_url)
                if info.get('profile_pic_url'):
                    pic_url = info['profile_pic_url']
            except Exception as e:
                print(f"Public avatar fetch notice (@{acc.username}): {e}")

        # 3. Se obteve a URL da imagem, baixar e gravar localmente
        if pic_url:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            proxies = {"http": acc.proxy_url, "https": acc.proxy_url} if acc.proxy_url else None
            r = requests.get(pic_url, headers=headers, proxies=proxies, timeout=12)
            if r.status_code == 200 and len(r.content) > 400:
                filename = f"account_{acc.id}.jpg"
                dest_path = os.path.join(AVATARS_DIR, filename)
                with open(dest_path, "wb") as f:
                    f.write(r.content)
                timestamp = int(datetime.utcnow().timestamp())
                acc.avatar_url = f"/avatars/{filename}?t={timestamp}"
                db.commit()
                print(f"[ViralDog] Foto de perfil baixada com sucesso para @{acc.username}: {acc.avatar_url}")
    except Exception as ex:
        print(f"Erro ao salvar avatar para conta {account_id}: {ex}")
    finally:
        db.close()


def trigger_avatar_sync(account_id: int):
    threading.Thread(target=_download_and_save_avatar_job, args=(account_id,), daemon=True).start()


@router.get("")
def list_accounts(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    query = db.query(Account)
    if user:
        query = query.filter(Account.owner_user_id == str(user.id))
    else:
        # Se requisição não autenticada no modo local
        query = query.filter((Account.owner_user_id == "default") | (Account.owner_user_id == None))
    accounts = query.all()
    return [{
        "id": a.id, "username": a.username, "status": a.status,
        "proxy_url": a.proxy_url, "notes": a.notes, "tags": a.tags,
        "folder": a.folder or "Geral",
        "platform": a.platform or "instagram",
        "display_name": a.display_name,
        "avatar_url": a.avatar_url,
        "auth_mode": a.auth_mode or "cookies",
        "last_opened_at": a.last_opened_at.isoformat() if a.last_opened_at else None,
        "token_expires_at": a.token_expires_at.isoformat() if a.token_expires_at else None,
        "fb_token_expires_at": a.fb_token_expires_at.isoformat() if a.fb_token_expires_at else None,
        "has_session": bool(a.session_cookies),
        "has_official_token": bool(a.fb_access_token),
        "fb_ig_account_id": a.fb_ig_account_id,
        "created_at": a.created_at.isoformat() if a.created_at else None
    } for a in accounts]


@router.post("/cookie")
def create_account_with_cookies(req: CookieAccountCreate, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    owner_user_id = str(user.id) if user else "default"

    clean_user = req.username.replace("@", "").strip()
    # Buscar apenas dentro das contas do próprio usuário
    acc = db.query(Account).filter(Account.owner_user_id == owner_user_id, Account.username == clean_user).first()
    
    cookies = req.cookies_json if req.cookies_json else None
    if acc:
        if cookies:
            acc.session_cookies = cookies
        acc.status = "active"
        if req.proxy_url:
            acc.proxy_url = req.proxy_url
        if req.folder:
            acc.folder = req.folder
    else:
        acc = Account(username=req.username, session_cookies=cookies, status="active", proxy_url=req.proxy_url, folder=req.folder or "Geral")
        db.add(acc)
    db.commit()
    db.refresh(acc)

    # Disparar download automático da foto do Instagram
    if not acc.avatar_url or cookies:
        trigger_avatar_sync(acc.id)

    return {"status": "success", "username": req.username, "id": acc.id}


@router.post("/{account_id}/open")
def touch_account_open(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    acc.last_opened_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "last_opened_at": acc.last_opened_at.isoformat()}


@router.patch("/{account_id}")
def patch_account(account_id: int, req: AccountPatchRequest, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    if user and acc.owner_user_id and acc.owner_user_id != str(user.id) and acc.owner_user_id != "default":
        raise HTTPException(status_code=403, detail="Acesso não autorizado a esta conta.")

    old_username = acc.username
    update_data = req.model_dump(exclude_unset=True) if hasattr(req, "model_dump") else req.dict(exclude_unset=True)
    if "username" in update_data and req.username:
        clean_user = req.username.replace("@", "").strip()
        acc.username = clean_user
        acc.display_name = clean_user
    elif "display_name" in update_data and req.display_name:
        clean_name = req.display_name.replace("@", "").strip()
        acc.username = clean_name
        acc.display_name = clean_name

    # Cascade updates to existing posts and snapshots
    if old_username and acc.username and old_username != acc.username:
        db.query(Post).filter(Post.account_username == old_username).update({"account_username": acc.username})
        db.query(FollowerSnapshot).filter(FollowerSnapshot.account_username == old_username).update({"account_username": acc.username})

    if "status" in update_data: acc.status = req.status
    if "notes" in update_data: acc.notes = req.notes
    if "tags" in update_data: acc.tags = req.tags
    if "folder" in update_data: acc.folder = req.folder
    if "proxy_url" in update_data: acc.proxy_url = req.proxy_url
    if "platform" in update_data: acc.platform = req.platform
    if "session_cookies" in update_data: acc.session_cookies = req.session_cookies
    if "avatar_url" in update_data: acc.avatar_url = req.avatar_url
    if "auth_mode" in update_data: acc.auth_mode = req.auth_mode
    if "fb_access_token" in update_data: acc.fb_access_token = req.fb_access_token
    if "fb_ig_account_id" in update_data: acc.fb_ig_account_id = req.fb_ig_account_id
    if "instagram_user_id" in update_data: acc.instagram_user_id = req.instagram_user_id
    if "token_expires_at" in update_data:
        if req.token_expires_at:
            try:
                acc.token_expires_at = datetime.fromisoformat(req.token_expires_at)
            except Exception:
                pass
        else:
            acc.token_expires_at = None
    if "last_opened_at" in update_data:
        if req.last_opened_at:
            try:
                acc.last_opened_at = datetime.fromisoformat(req.last_opened_at)
            except Exception:
                acc.last_opened_at = datetime.utcnow()
        else:
            acc.last_opened_at = None
    db.commit()
    db.refresh(acc)

    # Disparar busca e download da foto de perfil se não tiver foto ou se a sessão mudou
    if not acc.avatar_url or "session_cookies" in update_data:
        trigger_avatar_sync(acc.id)

    return {"status": "success", "username": acc.username, "display_name": acc.display_name, "avatar_url": acc.avatar_url}


@router.post("/{account_id}/sync-avatar")
def sync_account_avatar(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    _download_and_save_avatar_job(account_id)
    db.refresh(acc)
    return {"status": "success", "avatar_url": acc.avatar_url}


@router.delete("/{account_id}")
def delete_account(account_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    if user and acc.owner_user_id and acc.owner_user_id != str(user.id) and acc.owner_user_id != "default":
        raise HTTPException(status_code=403, detail="Acesso não autorizado a esta conta.")
    db.delete(acc)
    db.commit()
    return {"status": "success"}


@router.post("/{account_id}/avatar")
async def upload_avatar(account_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a profile picture for an account."""
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    # Save file to avatars directory
    ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    filename = f"account_{account_id}{ext}"
    dest_path = os.path.join(AVATARS_DIR, filename)
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Store relative URL with cache buster timestamp
    timestamp = int(datetime.utcnow().timestamp())
    avatar_url = f"/avatars/{filename}?t={timestamp}"
    acc.avatar_url = avatar_url
    db.commit()
    return {"status": "success", "avatar_url": avatar_url}


@router.get("/{account_id}/profile")
def get_account_profile(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    profile = db.query(AccountProfile).filter(AccountProfile.account_id == account_id).first()
    return {
        "id": acc.id, "username": acc.username, "proxy_url": acc.proxy_url,
        "caption_style": profile.caption_style if profile else "",
        "posting_schedule": profile.posting_schedule if profile else "[]",
        "timezone": profile.timezone if profile else "America/Sao_Paulo",
        "auto_repost_enabled": profile.auto_repost_enabled if profile else False,
        "auto_repost_days": profile.auto_repost_days if profile else 30,
        "min_engagement_for_repost": profile.min_engagement_for_repost if profile else 5.0,
    }


@router.put("/{account_id}/profile")
def update_account_profile(account_id: int, req: AccountProfileUpdate, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    if req.proxy_url is not None: acc.proxy_url = req.proxy_url

    profile = db.query(AccountProfile).filter(AccountProfile.account_id == account_id).first()
    if not profile:
        profile = AccountProfile(account_id=account_id)
        db.add(profile)
    if req.caption_style is not None: profile.caption_style = req.caption_style
    if req.posting_schedule is not None: profile.posting_schedule = req.posting_schedule
    if req.timezone is not None: profile.timezone = req.timezone
    if req.auto_repost_enabled is not None: profile.auto_repost_enabled = req.auto_repost_enabled
    if req.auto_repost_days is not None: profile.auto_repost_days = req.auto_repost_days
    if req.min_engagement_for_repost is not None: profile.min_engagement_for_repost = req.min_engagement_for_repost
    db.commit()
    return {"status": "success"}
