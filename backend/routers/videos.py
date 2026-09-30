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


SUPPORTED_VIDEO_EXTS = ('.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.ts', '.wmv')
SUPPORTED_IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp')
SUPPORTED_ALL_MEDIA_EXTS = SUPPORTED_VIDEO_EXTS + SUPPORTED_IMAGE_EXTS


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
    seen_paths = set()
    videos = []

    # 1. Videos editados na sessão ativa
    for v in session_videos.get_all(db):
        norm = os.path.normpath(v["path"])
        seen_paths.add(norm)
        videos.append(v)

    # 2. Escanear pastas configuradas de editados e baixados
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    download_dir = get_config_directory(db, "download_directory", "downloaded")

    def _scan_dir(dir_path: str, category: str):
        if not dir_path or not os.path.exists(dir_path) or not os.path.isdir(dir_path):
            return
        for root, dirs, files in os.walk(dir_path):
            if any(skip in root for skip in ("temp_previews", "thumbnails", "music", "templates", ".git", "node_modules")):
                continue
            for file in files:
                if file.lower().endswith(SUPPORTED_VIDEO_EXTS):
                    full_path = os.path.normpath(os.path.join(root, file))
                    if full_path not in seen_paths and os.path.isfile(full_path):
                        seen_paths.add(full_path)
                        try:
                            stat = os.stat(full_path)
                            videos.append({
                                "name": file,
                                "path": full_path,
                                "size": stat.st_size,
                                "category": category,
                                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
                            })
                        except Exception:
                            continue

    _scan_dir(edited_dir, "edited")
    _scan_dir(download_dir, "downloaded")

    videos.sort(key=lambda x: x["created_at"], reverse=True)
    return videos


@router.post("/api/videos/reset")
def reset_session_videos():
    session_videos.clear()
    fs_cache.invalidate()
    return {"status": "success", "message": "Lista de vídeos da sessão limpa."}


@router.get("/api/videos/scan-folder")
def scan_videos_in_folder(path: str):
    if not path or not path.strip():
        return []

    decoded_path = urllib.parse.unquote(path).strip('\'"')
    decoded_path = os.path.normpath(decoded_path)

    def _get_media_info(file_path: str, stat_obj):
        is_img = file_path.lower().endswith(SUPPORTED_IMAGE_EXTS)
        return {
            "name": os.path.basename(file_path),
            "path": file_path,
            "size": stat_obj.st_size,
            "category": "folder",
            "media_type": "image" if is_img else "video",
            "post_type": "image" if is_img else "reel",
            "created_at": datetime.fromtimestamp(stat_obj.st_ctime).isoformat()
        }

    # Se o usuário informou diretamente o caminho de um arquivo
    if os.path.isfile(decoded_path):
        if decoded_path.lower().endswith(SUPPORTED_ALL_MEDIA_EXTS):
            try:
                stat = os.stat(decoded_path)
                return [_get_media_info(decoded_path, stat)]
            except Exception:
                pass
        return []

    if not os.path.exists(decoded_path) or not os.path.isdir(decoded_path):
        return []

    media_items = []
    seen_paths = set()
    for root, dirs, files in os.walk(decoded_path):
        if any(skip in root for skip in ("temp_previews", "thumbnails", "music", "templates", ".git", "node_modules")):
            continue
        for file in files:
            if file.lower().endswith(SUPPORTED_ALL_MEDIA_EXTS):
                full_path = os.path.normpath(os.path.join(root, file))
                if full_path not in seen_paths and os.path.isfile(full_path):
                    seen_paths.add(full_path)
                    try:
                        stat = os.stat(full_path)
                        media_items.append(_get_media_info(full_path, stat))
                    except Exception:
                        continue

    media_items.sort(key=lambda x: x["created_at"], reverse=True)
    return media_items


@router.get("/api/videos/file")
def get_video_file(path: str, db: Session = Depends(get_db)):
    decoded_path = urllib.parse.unquote(path).strip('\'"')
    abs_path = get_absolute_path(decoded_path, db)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return FileResponse(abs_path)
