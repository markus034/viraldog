"""Download endpoints — single, profile, stories, register, ZIP upload."""
import os
import re
import time
import shutil
import zipfile
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db, SessionLocal, DownloadedVideo
from schemas import (DownloadSingleRequest, DownloadProfileRequest,
                     DownloadStoriesRequest, DownloadRegisterRequest, ImportDirectoryRequest,
                     TikTokVideoDownloadRequest, TikTokProfileDownloadRequest)
from utils import (get_config_directory, get_absolute_path, compute_file_hash,
                   get_account_info, session_uploads, fs_cache)
import backend_downloader as downloader
import tiktok_downloader
from task_queue import task_queue

router = APIRouter(tags=["downloads"])


@router.get("/api/download/check")
def check_already_downloaded(shortcode: str, db: Session = Depends(get_db)):
    """Check if a video shortcode was already downloaded. Used by Electron before saving."""
    exists = downloader.is_already_downloaded(db, shortcode)
    existing = None
    if exists:
        from database import DownloadedVideo
        rec = db.query(DownloadedVideo).filter(DownloadedVideo.shortcode == shortcode).first()
        if rec:
            existing = {"local_path": rec.local_path, "profile_source": rec.profile_source}
    return {"exists": exists, "shortcode": shortcode, "existing": existing}


@router.get("/api/download/shortcodes")
def list_downloaded_shortcodes(db: Session = Depends(get_db)):
    """Return all known shortcodes for Electron's in-memory dedup cache."""
    from database import DownloadedVideo
    rows = db.query(DownloadedVideo.shortcode).all()
    return {"shortcodes": [r.shortcode for r in rows if r.shortcode]}


@router.post("/api/download/tiktok/video")
def download_tiktok_video(req: TikTokVideoDownloadRequest):
    try:
        normalized_url = tiktok_downloader.validate_video_url(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def do_download(progress_cb):
        db_inner = SessionLocal()
        try:
            download_dir = get_config_directory(db_inner, "download_directory", "downloaded")
            return tiktok_downloader.download_video(
                normalized_url, download_dir, db_inner, req.skip_duplicates, progress_cb
            )
        finally:
            db_inner.close()

    task_id = task_queue.submit(
        "tiktok_video_download",
        do_download,
        description="Download de vídeo do TikTok",
    )
    return {"status": "queued", "task_id": task_id}


@router.post("/api/download/tiktok/profile")
def download_tiktok_profile(req: TikTokProfileDownloadRequest):
    try:
        profile_url, username = tiktok_downloader.normalize_profile(req.profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def do_download(progress_cb):
        db_inner = SessionLocal()
        try:
            download_dir = get_config_directory(db_inner, "download_directory", "downloaded")
            return tiktok_downloader.download_profile(
                profile_url, req.count, download_dir, db_inner,
                req.skip_duplicates, progress_cb
            )
        finally:
            db_inner.close()

    task_id = task_queue.submit(
        "tiktok_profile_download",
        do_download,
        description=f"Download de {req.count} vídeos de @{username}",
    )
    return {"status": "queued", "task_id": task_id}


@router.post("/api/download/single")
def download_single(req: DownloadSingleRequest, db: Session = Depends(get_db)):
    cookies, proxy = get_account_info(db, req.account_username)
    download_dir = get_config_directory(db, "download_directory", "downloaded")
    try:
        file_path = downloader.download_single_post(req.url, cookies, download_dir, db, proxy)
        return {"status": "success", "file_path": file_path, "filename": os.path.basename(file_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/download/profile")
def download_profile(req: DownloadProfileRequest, db: Session = Depends(get_db)):
    cookies, proxy = get_account_info(db, req.account_username)
    download_dir = get_config_directory(db, "download_directory", "downloaded")

    if req.count > 5:
        def do_download(progress_cb):
            db_inner = SessionLocal()
            try:
                return downloader.download_profile_reels(
                    req.profile_name, req.count, cookies, download_dir,
                    db_inner, proxy, req.min_views, req.min_likes,
                    req.sort_by, req.skip_duplicates, progress_cb
                )
            finally:
                db_inner.close()
        task_id = task_queue.submit("download_batch", do_download,
                                   description=f"Download de {req.count} vídeos de @{req.profile_name}")
        return {"status": "queued", "task_id": task_id}

    try:
        files = downloader.download_profile_reels(
            req.profile_name, req.count, cookies, download_dir,
            db, proxy, req.min_views, req.min_likes, req.sort_by, req.skip_duplicates
        )
        return {"status": "success", "files": files, "count": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/download/stories")
def download_stories(req: DownloadStoriesRequest, db: Session = Depends(get_db)):
    cookies, proxy = get_account_info(db, req.account_username)
    if not cookies:
        raise HTTPException(status_code=400, detail="Cookies de sessão obrigatórios para baixar Stories.")
    download_dir = get_config_directory(db, "download_directory", "downloaded")
    try:
        files = downloader.download_stories(req.username, cookies, download_dir, db, proxy)
        return {"status": "success", "files": files, "count": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/download/register")
def register_download_endpoint(req: DownloadRegisterRequest, db: Session = Depends(get_db)):
    file_path = get_absolute_path(req.file_path, db)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado localmente.")

    try:
        file_hash = compute_file_hash(file_path)
    except Exception:
        file_hash = None

    shortcode = req.shortcode
    if not shortcode:
        base = os.path.basename(file_path)
        name, _ = os.path.splitext(base)
        shortcode = name.split("_")[-1] if "_" in name else name

    existing = db.query(DownloadedVideo).filter(DownloadedVideo.shortcode == shortcode).first()
    if existing:
        return {"status": "already_registered", "id": existing.id, "file_path": existing.local_path}

    dv = DownloadedVideo(
        url=req.url or f"https://www.instagram.com/p/{shortcode}/",
        shortcode=shortcode, profile_source=req.profile_source or "ig_saver",
        local_path=file_path, file_hash=file_hash
    )
    db.add(dv)
    db.commit()
    db.refresh(dv)
    return {"status": "success", "id": dv.id, "file_path": dv.local_path}


@router.post("/api/download/zip-upload")
async def upload_zip_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    out_dir = get_config_directory(db, "download_directory", "downloaded")
    os.makedirs(out_dir, exist_ok=True)
    filename = file.filename
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Apenas arquivos ZIP são permitidos.")

    temp_zip_path = os.path.join(out_dir, f"temp_{int(time.time())}_{filename}")
    with open(temp_zip_path, "wb") as buffer:
        buffer.write(await file.read())

    try:
        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            namelist = zip_ref.namelist()
            root_dirs = set()
            has_files_at_root = False
            for name in namelist:
                nn = name.replace('\\', '/')
                parts = nn.split('/')
                if nn.endswith('/'):
                    if parts[0]: root_dirs.add(parts[0])
                else:
                    if len(parts) == 1: has_files_at_root = True
                    else: root_dirs.add(parts[0])

            if len(root_dirs) == 1 and not has_files_at_root:
                root_dir_name = list(root_dirs)[0]
                target_extract_dir = out_dir
                folder_to_rename = os.path.join(out_dir, root_dir_name)
            else:
                zip_name = os.path.splitext(filename)[0]
                target_extract_dir = os.path.join(out_dir, zip_name)
                folder_to_rename = target_extract_dir

            os.makedirs(target_extract_dir, exist_ok=True)
            zip_ref.extractall(target_extract_dir)

        try: os.remove(temp_zip_path)
        except Exception: pass

        final_folder_path = folder_to_rename
        if folder_to_rename and os.path.exists(folder_to_rename):
            folder_name = os.path.basename(folder_to_rename)
            if '_instagram' in folder_name.lower():
                new_name = re.sub(r'_instagram', '', folder_name, flags=re.IGNORECASE)
                new_path = os.path.join(os.path.dirname(folder_to_rename), new_name)
                if os.path.exists(new_path):
                    c = 1
                    while os.path.exists(f"{new_path}_{c}"): c += 1
                    new_path = f"{new_path}_{c}"
                os.rename(folder_to_rename, new_path)
                final_folder_path = new_path

        fs_cache.invalidate()
        return {"status": "success", "filename": filename, "path": final_folder_path}
    except Exception as e:
        if os.path.exists(temp_zip_path):
            try: os.remove(temp_zip_path)
            except Exception: pass
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo ZIP: {str(e)}")


@router.post("/api/import/upload")
async def import_upload(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    out_dir = get_config_directory(db, "output_directory")
    uploads_dir = os.path.join(out_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    imported = []

    for file in files:
        filename = file.filename
        if not filename.lower().endswith(".mp4"):
            continue
        dest_path = os.path.abspath(os.path.join(uploads_dir, filename))
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(dest_path):
            dest_path = os.path.join(uploads_dir, f"{base}_{counter}{ext}")
            counter += 1

        with open(dest_path, "wb") as buffer:
            buffer.write(await file.read())

        file_hash = compute_file_hash(dest_path)

        existing = db.query(DownloadedVideo).filter(DownloadedVideo.file_hash == file_hash).first()
        if existing:
            if os.path.exists(existing.local_path):
                try: os.remove(dest_path)
                except Exception: pass
                session_uploads.add(existing.local_path)
                imported.append({"id": existing.shortcode, "name": os.path.basename(existing.local_path),
                                 "path": existing.local_path, "size": os.path.getsize(existing.local_path), "category": "raw"})
            else:
                existing.local_path = dest_path
                db.commit()
                session_uploads.add(dest_path)
                imported.append({"id": existing.shortcode, "name": os.path.basename(dest_path),
                                 "path": dest_path, "size": os.path.getsize(dest_path), "category": "raw"})
            continue

        shortcode = f"local_{os.path.splitext(os.path.basename(dest_path))[0]}"
        if db.query(DownloadedVideo).filter(DownloadedVideo.shortcode == shortcode).first():
            shortcode = f"{shortcode}_{file_hash[:8]}"

        dv = DownloadedVideo(url=None, shortcode=shortcode, profile_source="local_upload",
                             local_path=dest_path, file_hash=file_hash, downloaded_at=datetime.utcnow())
        db.add(dv)
        session_uploads.add(dest_path)
        imported.append({"id": shortcode, "name": os.path.basename(dest_path),
                         "path": dest_path, "size": os.path.getsize(dest_path), "category": "raw"})

    db.commit()
    fs_cache.invalidate()
    return {"status": "success", "imported": imported, "count": len(imported)}


@router.post("/api/import/directory")
def import_directory(req: ImportDirectoryRequest, db: Session = Depends(get_db)):
    dir_path = req.directory_path
    if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
        raise HTTPException(status_code=404, detail="Diretório não encontrado ou inválido.")

    out_dir = get_config_directory(db, "output_directory")
    uploads_dir = os.path.join(out_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    imported = []

    try: files = os.listdir(dir_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler diretório: {str(e)}")

    for file in files:
        if not file.lower().endswith(".mp4"): continue
        src_path = os.path.join(dir_path, file)
        if not os.path.isfile(src_path): continue

        try: file_hash = compute_file_hash(src_path)
        except Exception: continue

        if req.skip_duplicates:
            existing = db.query(DownloadedVideo).filter(DownloadedVideo.file_hash == file_hash).first()
            if existing:
                session_uploads.add(existing.local_path)
                continue

        dest_path = os.path.abspath(os.path.join(uploads_dir, file))
        base, ext = os.path.splitext(file)
        counter = 1
        while os.path.exists(dest_path):
            dest_path = os.path.join(uploads_dir, f"{base}_{counter}{ext}")
            counter += 1

        try: shutil.copy2(src_path, dest_path)
        except Exception: continue

        shortcode = f"local_{os.path.splitext(os.path.basename(dest_path))[0]}"
        if db.query(DownloadedVideo).filter(DownloadedVideo.shortcode == shortcode).first():
            shortcode = f"{shortcode}_{file_hash[:8]}"

        dv = DownloadedVideo(url=None, shortcode=shortcode, profile_source="local_folder",
                             local_path=dest_path, file_hash=file_hash, downloaded_at=datetime.utcnow())
        db.add(dv)
        session_uploads.add(dest_path)
        imported.append({"id": shortcode, "name": os.path.basename(dest_path)})

    db.commit()
    fs_cache.invalidate()
    return {"status": "success", "imported": imported, "count": len(imported)}
