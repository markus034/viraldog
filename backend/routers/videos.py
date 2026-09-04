"""Video listing, scanning, and file serving endpoints."""
import os
import urllib.parse
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from database import get_db, Account, Post
from utils import get_config_directory, get_absolute_path, session_uploads, session_videos, fs_cache

router = APIRouter(tags=["videos"])


@router.get("/api/dashboard")
def get_dashboard_stats(db: Session = Depends(get_db)):
    download_dir = get_config_directory(db, "download_directory", "downloaded")
    edited_dir = get_config_directory(db, "edited_directory", "edited")

    cache_key = f"download_count:{download_dir}:{edited_dir}"
    total_downloads = fs_cache.get(cache_key)
    if total_downloads is None:
        total_downloads = 0
        for directory in (download_dir, edited_dir):
            if os.path.exists(directory):
                total_downloads += sum(len(files) for _, _, files in os.walk(directory))
        fs_cache.set(cache_key, total_downloads)

    total_accounts = db.query(Account).count()
    pending_posts = db.query(Post).filter(Post.status == "pending").count()
    completed_posts = db.query(Post).filter(Post.status == "posted").count()
    failed_posts = db.query(Post).filter(Post.status == "failed").count()

    recent_posts = db.query(Post).order_by(Post.created_at.desc()).limit(5).all()
    recent_activity = [{
        "id": p.id, "type": p.post_type or "reel",
        "title": f"Post: {os.path.basename(p.video_path)}",
        "status": p.status,
        "time": p.scheduled_time.isoformat() if p.scheduled_time else "",
        "is_repost": p.is_repost, "engagement_score": p.engagement_score
    } for p in recent_posts]

    return {
        "total_downloads": total_downloads, "total_accounts": total_accounts,
        "pending_posts": pending_posts, "completed_posts": completed_posts,
        "failed_posts": failed_posts, "recent_activity": recent_activity
    }


@router.get("/api/videos")
def list_videos(db: Session = Depends(get_db)):
    return session_videos.get_all(db)


@router.post("/api/videos/reset")
def reset_session_videos():
    session_videos.clear()
    fs_cache.invalidate()
    return {"status": "success", "message": "Lista de vídeos da sessão limpa."}


@router.get("/api/videos/scan-folder")
def scan_videos_in_folder(path: str):
    decoded_path = urllib.parse.unquote(path)
    if not os.path.exists(decoded_path) or not os.path.isdir(decoded_path):
        raise HTTPException(status_code=404, detail="Diretório não encontrado ou inválido.")
    videos = []
    for root, dirs, files in os.walk(decoded_path):
        if any(skip in root for skip in ("temp_previews", "thumbnails", "music", "templates")):
            continue
        for file in files:
            if file.endswith(".mp4"):
                full_path = os.path.normpath(os.path.join(root, file))
                videos.append({"name": file, "path": full_path, "size": os.path.getsize(full_path),
                                "created_at": datetime.fromtimestamp(os.path.getctime(full_path)).isoformat()})
    videos.sort(key=lambda x: x["created_at"], reverse=True)
    return videos


@router.get("/api/videos/file")
def get_video_file(path: str, db: Session = Depends(get_db)):
    decoded_path = urllib.parse.unquote(path)
    abs_path = get_absolute_path(decoded_path, db)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return FileResponse(abs_path)
