"""
TikTok Downloader module using yt-dlp.
"""
import os
import re
import yt_dlp
from sqlalchemy.orm import Session
from database import DownloadedVideo
from utils import compute_file_hash


def validate_video_url(url: str) -> str:
    url = url.strip()
    if not url:
        raise ValueError("URL do TikTok vazia")
    if "tiktok.com" not in url:
        raise ValueError("URL inválida do TikTok")
    return url


def normalize_profile(profile: str) -> tuple[str, str]:
    profile = profile.strip()
    if not profile:
        raise ValueError("Nome de usuário do TikTok vazio")
    username = profile.lstrip("@").split("/")[-1]
    profile_url = f"https://www.tiktok.com/@{username}"
    return profile_url, username


def download_video(url: str, download_dir: str, db: Session, skip_duplicates: bool = True, progress_cb=None) -> dict:
    os.makedirs(download_dir, exist_ok=True)
    
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'outtmpl': os.path.join(download_dir, '%(id)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
    }
    
    if progress_cb:
        def ydl_hook(d):
            if d['status'] == 'downloading':
                p = d.get('_percent_str', '0%').strip()
                progress_cb(f"Baixando: {p}")
            elif d['status'] == 'finished':
                progress_cb("Download concluído, finalizando...")
        ydl_opts['progress_hooks'] = [ydl_hook]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        
    video_id = info.get('id', '')
    title = info.get('title', '')
    uploader = info.get('uploader', '')
    
    file_hash = compute_file_hash(filename) if os.path.exists(filename) else ""
    
    # Save to database
    rec = DownloadedVideo(
        shortcode=video_id,
        filename=os.path.basename(filename),
        local_path=filename,
        profile_source=uploader,
        file_hash=file_hash,
    )
    db.add(rec)
    db.commit()
    
    return {
        "shortcode": video_id,
        "filename": os.path.basename(filename),
        "local_path": filename,
        "title": title,
        "uploader": uploader,
    }


def download_profile(profile_url: str, count: int, download_dir: str, db: Session, skip_duplicates: bool = True, progress_cb=None) -> list[dict]:
    os.makedirs(download_dir, exist_ok=True)
    
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best',
        'outtmpl': os.path.join(download_dir, '%(uploader)s_%(id)s.%(ext)s'),
        'playlistend': count,
        'quiet': True,
        'no_warnings': True,
    }
    
    results = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        playlist_info = ydl.extract_info(profile_url, download=True)
        entries = playlist_info.get('entries', []) if playlist_info else []
        for entry in entries[:count]:
            if not entry:
                continue
            filename = ydl.prepare_filename(entry)
            video_id = entry.get('id', '')
            uploader = entry.get('uploader', '')
            file_hash = compute_file_hash(filename) if os.path.exists(filename) else ""
            
            rec = DownloadedVideo(
                shortcode=video_id,
                filename=os.path.basename(filename),
                local_path=filename,
                profile_source=uploader,
                file_hash=file_hash,
            )
            db.add(rec)
            results.append({
                "shortcode": video_id,
                "filename": os.path.basename(filename),
                "local_path": filename,
            })
        db.commit()
    return results
