"""
Cloud Sync Router — Endpoints for VPS 24/7 Publishing & Account Sync.
"""
import os
import shutil
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session
from database import get_db, Account, Post, APP_DATA_DIR

router = APIRouter(prefix="/api/cloud", tags=["cloud"])

UPLOADS_DIR = os.path.join(APP_DATA_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

VPS_API_KEY = os.getenv("VIRALDOG_API_KEY", "")


def verify_api_key(x_viraldog_key: Optional[str] = Header(None)):
    """Validates API Key if configured on VPS environment."""
    expected_key = os.getenv("VIRALDOG_API_KEY", "").strip()
    if expected_key:
        if not x_viraldog_key or x_viraldog_key.strip() != expected_key:
            raise HTTPException(status_code=401, detail="Chave de API (X-ViralDog-Key) inválida ou não informada.")
    return True


@router.get("/health")
def cloud_health_check(x_viraldog_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Ping endpoint to verify VPS connection status and authentication."""
    # If API key is set, verify it
    expected_key = os.getenv("VIRALDOG_API_KEY", "").strip()
    key_required = bool(expected_key)
    auth_ok = True
    if key_required:
        auth_ok = bool(x_viraldog_key and x_viraldog_key.strip() == expected_key)

    total_pending = db.query(Post).filter(Post.status == "pending").count()
    total_posted = db.query(Post).filter(Post.status == "posted").count()
    total_accounts = db.query(Account).count()

    return {
        "status": "online",
        "app": "ViralDog Cloud Server",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "key_required": key_required,
        "authenticated": auth_ok,
        "stats": {
            "pending_posts": total_pending,
            "posted_posts": total_posted,
            "accounts_count": total_accounts
        }
    }


@router.post("/sync-account")
def sync_account_to_cloud(
    account_data: dict,
    authorized: bool = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Syncs an Instagram account (with cookies, tokens, and settings) from Desktop to VPS.
    """
    try:
        username = str(account_data.get("username") or account_data.get("display_name") or "").replace("@", "").strip()
        if not username:
            raise HTTPException(status_code=400, detail="Nome de usuário (username) é obrigatório.")

        acc = db.query(Account).filter(Account.username == username).first()
        if not acc:
            acc = Account(username=username)
            db.add(acc)

        # Sync fields safely
        if "session_cookies" in account_data and account_data["session_cookies"]:
            acc.session_cookies = account_data["session_cookies"]
        if "proxy_url" in account_data:
            acc.proxy_url = account_data["proxy_url"]
        if "fb_access_token" in account_data:
            acc.fb_access_token = account_data["fb_access_token"]
        if "fb_ig_account_id" in account_data:
            acc.fb_ig_account_id = account_data["fb_ig_account_id"]
        if "auth_mode" in account_data:
            acc.auth_mode = account_data["auth_mode"]
        if "avatar_url" in account_data:
            acc.avatar_url = account_data["avatar_url"]
        if "display_name" in account_data:
            acc.display_name = account_data["display_name"]
        if "folder" in account_data:
            acc.folder = account_data["folder"]
        if "notes" in account_data:
            acc.notes = account_data["notes"]
        if "tags" in account_data:
            acc.tags = account_data["tags"]
        if "token_expires_at" in account_data and account_data["token_expires_at"]:
            try:
                acc.token_expires_at = datetime.fromisoformat(str(account_data["token_expires_at"]))
            except Exception:
                pass

        acc.status = "active"
        db.commit()
        db.refresh(acc)

        return {
            "success": True,
            "message": f"Conta @{username} sincronizada com a VPS com sucesso.",
            "account_id": acc.id,
            "username": acc.username
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro interno ao sincronizar conta: {str(e)}")


@router.post("/upload-video")
async def upload_video_to_cloud(
    file: UploadFile = File(...),
    custom_name: Optional[str] = Form(None),
    authorized: bool = Depends(verify_api_key)
):
    """
    Uploads a video (.mp4/.mov) from the Desktop client to the VPS storage.
    Returns the absolute path on the VPS to be used in scheduled posts.
    """
    filename = custom_name or file.filename or f"video_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.mp4"
    # Ensure safe filename
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
    if not safe_filename:
        safe_filename = f"video_{int(datetime.utcnow().timestamp())}.mp4"

    # Prepend timestamp to avoid collision if desired
    unique_filename = f"{int(datetime.utcnow().timestamp())}_{safe_filename}"
    target_path = os.path.join(UPLOADS_DIR, unique_filename)

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(target_path)

    return {
        "success": True,
        "filename": unique_filename,
        "video_path": target_path,
        "size_bytes": file_size,
        "url": f"/uploads/{unique_filename}"
    }
