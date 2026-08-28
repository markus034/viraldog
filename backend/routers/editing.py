"""Video editing endpoints — templates, music, subtitles, preview, batch, save."""
import io
import os
import shutil
import time
import re
import uuid
import zipfile
import json
import base64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from PIL import Image
from database import get_db, SessionLocal, Config, TemplateLibrary, APP_DATA_DIR
from schemas import PreviewVideoRequest, EditBatchRequest
from utils import get_config_directory, get_absolute_path, fs_cache, session_videos
import backend_editor as editor
from task_queue import task_queue

router = APIRouter(tags=["editing"])

TEMPLATE_LIBRARY_DIR = os.path.join(APP_DATA_DIR, "template_library")
TEMPLATE_THUMBNAILS_DIR = os.path.join(TEMPLATE_LIBRARY_DIR, "thumbnails")
os.makedirs(TEMPLATE_THUMBNAILS_DIR, exist_ok=True)


def _template_payload(item: TemplateLibrary) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "width": item.width,
        "height": item.height,
        "hole": {
            "x": item.hole_x,
            "y": item.hole_y,
            "width": item.hole_width,
            "height": item.hole_height,
        },
        "has_alpha": item.has_alpha,
        "origin": item.origin,
        "extra_config": json.loads(item.extra_config) if item.extra_config else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "file_url": f"/api/editor/templates/{item.id}/file",
        "thumbnail_url": f"/api/editor/templates/{item.id}/thumbnail",
    }


@router.get("/api/editor/templates")
def list_editor_templates(db: Session = Depends(get_db)):
    items = db.query(TemplateLibrary).order_by(TemplateLibrary.created_at.desc()).all()
    return [_template_payload(item) for item in items]


@router.post("/api/editor/templates")
async def save_editor_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    origin: str = Form("uploaded"),
    hole_x: int = Form(0),
    hole_y: int = Form(0),
    hole_width: int = Form(1080),
    hole_height: int = Form(1920),
    extra_config: str = Form(None),
    profile_image: UploadFile = File(None),
    watermark_image: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    clean_name = re.sub(r"[^\w\-. ]+", "", name, flags=re.UNICODE).strip()[:120]
    if not clean_name:
        raise HTTPException(status_code=400, detail="Informe um nome para o template.")
    if origin not in {"created", "uploaded"}:
        raise HTTPException(status_code=400, detail="Origem do template inválida.")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="O template precisa ser uma imagem.")

    contents = await file.read()
    if not contents or len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem vazia ou maior que 25 MB.")

    # Save template profile image if uploaded
    if profile_image is not None:
        try:
            avatars_dir = os.path.join(APP_DATA_DIR, "avatars")
            os.makedirs(avatars_dir, exist_ok=True)
            profile_contents = await profile_image.read()
            if profile_contents:
                profile_uuid = uuid.uuid4().hex
                ext = os.path.splitext(profile_image.filename or "")[1].lower() or ".png"
                if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
                    ext = ".png"
                profile_filename = f"template_avatar_{profile_uuid}{ext}"
                profile_filepath = os.path.join(avatars_dir, profile_filename)
                with open(profile_filepath, "wb") as f_out:
                    f_out.write(profile_contents)
                profile_url = f"/avatars/{profile_filename}"
                if extra_config:
                    try:
                        cfg = json.loads(extra_config)
                        cfg["profileImage"] = profile_url
                        extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating extra_config profileImage: {json_err}")
        except Exception as avatar_err:
            print(f"Error saving template profile image: {avatar_err}")

    # Save template watermark image if uploaded
    if watermark_image is not None:
        try:
            avatars_dir = os.path.join(APP_DATA_DIR, "avatars")
            os.makedirs(avatars_dir, exist_ok=True)
            watermark_contents = await watermark_image.read()
            if watermark_contents:
                watermark_uuid = uuid.uuid4().hex
                ext = os.path.splitext(watermark_image.filename or "")[1].lower() or ".png"
                if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
                    ext = ".png"
                watermark_filename = f"template_watermark_{watermark_uuid}{ext}"
                watermark_filepath = os.path.join(avatars_dir, watermark_filename)
                with open(watermark_filepath, "wb") as f_out:
                    f_out.write(watermark_contents)
                watermark_url = f"/avatars/{watermark_filename}"
                if extra_config:
                    try:
                        cfg = json.loads(extra_config)
                        if "imageOverlay" in cfg:
                            cfg["imageOverlay"]["imageUrl"] = watermark_url
                        extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating extra_config imageOverlay: {json_err}")
        except Exception as watermark_err:
            print(f"Error saving template watermark image: {watermark_err}")

    template_id = uuid.uuid4().hex
    file_path = os.path.join(TEMPLATE_LIBRARY_DIR, f"{template_id}.png")
    thumbnail_path = os.path.join(TEMPLATE_THUMBNAILS_DIR, f"{template_id}.png")
    try:
        source = Image.open(io.BytesIO(contents))
        source.load()
        source = source.convert("RGBA")
        width, height = source.size
        if width < 1 or height < 1:
            raise ValueError("invalid dimensions")
        source.save(file_path, format="PNG")
        thumb = source.copy()
        thumb.thumbnail((270, 480), Image.Resampling.LANCZOS)
        thumb.save(thumbnail_path, format="PNG", optimize=True)
    except Exception as exc:
        for candidate in (file_path, thumbnail_path):
            if os.path.exists(candidate):
                os.remove(candidate)
        raise HTTPException(status_code=400, detail="Arquivo de imagem inválido.") from exc

    hx = max(0, min(hole_x, width - 1))
    hy = max(0, min(hole_y, height - 1))
    hw = max(1, min(hole_width, width - hx))
    hh = max(1, min(hole_height, height - hy))
    has_alpha = source.getextrema()[3][0] < 255
    item = TemplateLibrary(
        id=template_id,
        name=clean_name,
        file_path=file_path,
        thumbnail_path=thumbnail_path,
        width=width,
        height=height,
        hole_x=hx,
        hole_y=hy,
        hole_width=hw,
        hole_height=hh,
        has_alpha=has_alpha,
        origin=origin,
        extra_config=extra_config,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _template_payload(item)


@router.put("/api/editor/templates/{template_id}")
async def update_editor_template(
    template_id: str,
    file: UploadFile = File(None),
    name: str = Form(...),
    hole_x: int = Form(0),
    hole_y: int = Form(0),
    hole_width: int = Form(1080),
    hole_height: int = Form(1920),
    extra_config: str = Form(None),
    profile_image: UploadFile = File(None),
    watermark_image: UploadFile = File(None),
    db: Session = Depends(get_db),
):
    item = db.query(TemplateLibrary).filter(TemplateLibrary.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    clean_name = re.sub(r"[^\w\-. ]+", "", name, flags=re.UNICODE).strip()[:120]
    if not clean_name:
        raise HTTPException(status_code=400, detail="Informe um nome para o template.")

    # Save template profile image if uploaded
    if profile_image is not None:
        try:
            avatars_dir = os.path.join(APP_DATA_DIR, "avatars")
            os.makedirs(avatars_dir, exist_ok=True)
            profile_contents = await profile_image.read()
            if profile_contents:
                profile_uuid = uuid.uuid4().hex
                ext = os.path.splitext(profile_image.filename or "")[1].lower() or ".png"
                if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
                    ext = ".png"
                profile_filename = f"template_avatar_{profile_uuid}{ext}"
                profile_filepath = os.path.join(avatars_dir, profile_filename)
                with open(profile_filepath, "wb") as f_out:
                    f_out.write(profile_contents)
                profile_url = f"/avatars/{profile_filename}"
                if extra_config:
                    try:
                        cfg = json.loads(extra_config)
                        cfg["profileImage"] = profile_url
                        extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating extra_config profileImage: {json_err}")
                elif item.extra_config:
                    try:
                        cfg = json.loads(item.extra_config)
                        cfg["profileImage"] = profile_url
                        item.extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating item.extra_config profileImage: {json_err}")
        except Exception as avatar_err:
            print(f"Error saving template profile image: {avatar_err}")

    # Save template watermark image if uploaded
    if watermark_image is not None:
        try:
            avatars_dir = os.path.join(APP_DATA_DIR, "avatars")
            os.makedirs(avatars_dir, exist_ok=True)
            watermark_contents = await watermark_image.read()
            if watermark_contents:
                watermark_uuid = uuid.uuid4().hex
                ext = os.path.splitext(watermark_image.filename or "")[1].lower() or ".png"
                if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
                    ext = ".png"
                watermark_filename = f"template_watermark_{watermark_uuid}{ext}"
                watermark_filepath = os.path.join(avatars_dir, watermark_filename)
                with open(watermark_filepath, "wb") as f_out:
                    f_out.write(watermark_contents)
                watermark_url = f"/avatars/{watermark_filename}"
                if extra_config:
                    try:
                        cfg = json.loads(extra_config)
                        if "imageOverlay" in cfg:
                            cfg["imageOverlay"]["imageUrl"] = watermark_url
                        extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating extra_config imageOverlay: {json_err}")
                elif item.extra_config:
                    try:
                        cfg = json.loads(item.extra_config)
                        if "imageOverlay" in cfg:
                            cfg["imageOverlay"]["imageUrl"] = watermark_url
                        item.extra_config = json.dumps(cfg)
                    except Exception as json_err:
                        print(f"Error updating item.extra_config imageOverlay: {json_err}")
        except Exception as watermark_err:
            print(f"Error saving template watermark image: {watermark_err}")

    item.name = clean_name
    item.hole_x = hole_x
    item.hole_y = hole_y
    item.hole_width = hole_width
    item.hole_height = hole_height
    if extra_config is not None:
        item.extra_config = extra_config

    if file is not None:
        if not (file.content_type or "").startswith("image/"):
            raise HTTPException(status_code=400, detail="O template precisa ser uma imagem.")
        contents = await file.read()
        if not contents or len(contents) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Imagem vazia ou maior que 25 MB.")

        try:
            source = Image.open(io.BytesIO(contents))
            source.load()
            source = source.convert("RGBA")
            width, height = source.size
            if width < 1 or height < 1:
                raise ValueError("invalid dimensions")
            source.save(item.file_path, format="PNG")
            thumb = source.copy()
            thumb.thumbnail((270, 480), Image.Resampling.LANCZOS)
            thumb.save(item.thumbnail_path, format="PNG", optimize=True)
            item.width = width
            item.height = height
            item.has_alpha = source.getextrema()[3][0] < 255
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Arquivo de imagem inválido.") from exc

    item.created_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return _template_payload(item)


@router.post("/api/editor/templates/{template_id}/scan")
async def scan_editor_template(
    template_id: str,
    db: Session = Depends(get_db),
):
    item = db.query(TemplateLibrary).filter(TemplateLibrary.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    # 1. Crop profile image locally (offline)
    profile_image_data_uri = None
    try:
        source = Image.open(item.file_path)
        source = source.convert("RGBA")
        
        # PROFILE_IMAGE_BOX: auto-detect circular avatar or fall back to default
        cx, cy, r = 200, 200, 110 # default center=(200, 200), r=110 => box=(90, 90, 310, 310)
        try:
            import numpy as np
            # Crop 400x400 area where the avatar is expected to be
            search_area = source.crop((0, 0, 400, 400))
            arr = np.array(search_area)
            gray = np.mean(arr[:, :, :3], axis=2)
            
            # Simple Sobel-like edge filter
            gx = np.zeros_like(gray)
            gy = np.zeros_like(gray)
            gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
            gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
            grad = np.sqrt(gx**2 + gy**2)
            
            best_score = 0
            best_circle = (200, 200, 110)
            
            # Coarse search
            for cx_c in range(100, 300, 4):
                for cy_c in range(100, 300, 4):
                    for r_c in range(70, 130, 4):
                        angles = np.linspace(0, 2*np.pi, 50)
                        xs = (cx_c + r_c * np.cos(angles)).astype(int)
                        ys = (cy_c + r_c * np.sin(angles)).astype(int)
                        valid = (xs >= 0) & (xs < 400) & (ys >= 0) & (ys < 400)
                        score = np.mean(grad[ys[valid], xs[valid]])
                        if score > best_score:
                            best_score = score
                            best_circle = (cx_c, cy_c, r_c)
                            
            # Fine search
            ccx, ccy, cr = best_circle
            best_score_fine = 0
            best_circle_fine = best_circle
            for cx_f in range(max(100, ccx-6), min(300, ccx+7)):
                for cy_f in range(max(100, ccy-6), min(300, ccy+7)):
                    for r_f in range(max(70, cr-6), min(130, cr+7)):
                        angles = np.linspace(0, 2*np.pi, 100)
                        xs = (cx_f + r_f * np.cos(angles)).astype(int)
                        ys = (cy_f + r_f * np.sin(angles)).astype(int)
                        valid = (xs >= 0) & (xs < 400) & (ys >= 0) & (ys < 400)
                        score = np.mean(grad[ys[valid], xs[valid]])
                        if score > best_score_fine:
                            best_score_fine = score
                            best_circle_fine = (cx_f, cy_f, r_f)
                            
            if best_score_fine >= 10.0:
                cx, cy, r = best_circle_fine
        except Exception as detection_err:
            print(f"Error auto-detecting template profile circle: {detection_err}")
            cx, cy, r = 200, 200, 110
            
        profile_box = (cx - r, cy - r, cx + r, cy + r)
        profile_img = source.crop(profile_box)
        
        buffered = io.BytesIO()
        profile_img.save(buffered, format="PNG")
        profile_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        profile_image_data_uri = f"data:image/png;base64,{profile_base64}"
    except Exception as exc:
        print(f"Error cropping profile image: {exc}")

    # 2. Extract text using AI Vision (online)
    try:
        from backend_ai_service import scan_template_image
        scanned_data = scan_template_image(db, item.file_path)
    except Exception as exc:
        print(f"Error scanning template with AI: {exc}")
        # Fallback values from template DB name
        fallback_name = item.name or "Nome do perfil"
        fallback_username = "@" + re.sub(r"\s+", "", fallback_name.lower())
        scanned_data = {
            "profileName": fallback_name,
            "profileUsername": fallback_username,
            "profileVerified": False,
            "text": ""
        }

    return {
        "profileName": scanned_data.get("profileName") or "Nome do perfil",
        "profileUsername": scanned_data.get("profileUsername") or "@usuario",
        "profileVerified": bool(scanned_data.get("profileVerified")),
        "profileImage": profile_image_data_uri,
        "text": scanned_data.get("text") or ""
    }


def _template_file(template_id: str, thumbnail: bool, db: Session):
    item = db.query(TemplateLibrary).filter(TemplateLibrary.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    path = item.thumbnail_path if thumbnail else item.file_path
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Arquivo do template não encontrado.")
    return FileResponse(path, media_type="image/png", filename=None if thumbnail else f"{item.name}.png")


@router.get("/api/editor/templates/{template_id}/file")
def get_editor_template_file(template_id: str, db: Session = Depends(get_db)):
    return _template_file(template_id, False, db)


@router.get("/api/editor/templates/{template_id}/thumbnail")
def get_editor_template_thumbnail(template_id: str, db: Session = Depends(get_db)):
    return _template_file(template_id, True, db)


@router.delete("/api/editor/templates/{template_id}")
def delete_editor_template(template_id: str, db: Session = Depends(get_db)):
    item = db.query(TemplateLibrary).filter(TemplateLibrary.id == template_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    
    if item.file_path and os.path.isfile(item.file_path):
        try:
            os.remove(item.file_path)
        except Exception as e:
            print(f"Erro ao remover arquivo original do template: {e}")
            
    if item.thumbnail_path and os.path.isfile(item.thumbnail_path):
        try:
            os.remove(item.thumbnail_path)
        except Exception as e:
            print(f"Erro ao remover miniatura do template: {e}")
            
    db.delete(item)
    db.commit()
    return {"status": "success", "message": "Template excluído com sucesso."}


@router.post("/api/edit/upload-template")
async def upload_template(file: UploadFile = File(...), db: Session = Depends(get_db)):
    out_dir = get_config_directory(db, "output_directory")
    templates_dir = os.path.join(out_dir, "templates")
    os.makedirs(templates_dir, exist_ok=True)
    file_path = os.path.abspath(os.path.join(templates_dir, file.filename))
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    detected_header, detected_bottom = editor.detect_template_video_zone(file_path)
    return {"status": "success", "template_path": file_path,
            "detected_header_height": detected_header, "detected_bottom_y": detected_bottom}


@router.get("/api/edit/analyze-template")
async def analyze_template(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Template file not found")
    detected_header, detected_bottom = editor.detect_template_video_zone(path)
    return {"status": "success", "template_path": path,
            "detected_header_height": detected_header, "detected_bottom_y": detected_bottom}


@router.get("/api/editor/video-content-bounds")
async def get_video_content_bounds(path: str, db: Session = Depends(get_db)):
    path = get_absolute_path(path, db)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video file not found")
    try:
        t, b, l, r = editor.detect_video_content_bounds(path)
        info = editor.get_video_info(path)
        return {"status": "success", "top": t, "bottom": b, "left": l, "right": r,
                "video_width": info["width"], "video_height": info["height"]}
    except Exception as e:
        print(f"get_video_content_bounds error: {e}")
        info = editor.get_video_info(path)
        return {"status": "ok", "top": 0, "bottom": 0, "left": 0, "right": 0,
                "video_width": info["width"], "video_height": info["height"]}


@router.post("/api/edit/upload-music")
async def upload_music(file: UploadFile = File(...), db: Session = Depends(get_db)):
    out_dir = get_config_directory(db, "output_directory")
    music_dir = os.path.join(out_dir, "music")
    os.makedirs(music_dir, exist_ok=True)
    file_path = os.path.abspath(os.path.join(music_dir, file.filename))
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    return {"status": "success", "music_path": file_path}


@router.post("/api/edit/generate-subtitles")
def generate_subtitles_endpoint(video_path: str = Form(...), db: Session = Depends(get_db)):
    video_path = get_absolute_path(video_path, db)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Arquivo de vídeo não encontrado.")
    wm = db.query(Config).filter(Config.key == "whisper_mode").first()
    mode = wm.value if wm else "api"
    api_key = None
    if mode == "api":
        ak = db.query(Config).filter(Config.key == "openai_api_key").first()
        api_key = ak.value if ak else None
    ms = db.query(Config).filter(Config.key == "whisper_model_size").first()
    model_size = ms.value if ms else "base"
    try:
        srt_content = editor.generate_subtitles(video_path, mode, api_key, model_size)
        return {"status": "success", "srt_content": srt_content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_whisper_config(db):
    wm = db.query(Config).filter(Config.key == "whisper_mode").first()
    ak = db.query(Config).filter(Config.key == "openai_api_key").first()
    return wm.value if wm else "api", ak.value if ak else None


@router.post("/api/edit/preview")
def edit_preview(req: PreviewVideoRequest, db: Session = Depends(get_db)):
    video_path = get_absolute_path(req.video_path, db)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Vídeo não encontrado.")
    req.video_path = video_path

    out_dir = get_config_directory(db, "output_directory")
    temp_dir = os.path.join(out_dir, "temp_previews")
    os.makedirs(temp_dir, exist_ok=True)
    name = os.path.splitext(os.path.basename(req.video_path))[0]
    out_path = os.path.join(temp_dir, f"preview_{name}_{int(time.time())}.mp4")

    local_srt = None
    if req.params.generate_subtitles:
        whisper_mode, api_key = _get_whisper_config(db)
        try:
            local_srt = editor.generate_subtitles(req.video_path, whisper_mode, api_key)
        except Exception as e:
            print(f"Whisper error for preview: {e}")
            local_srt = "1\n00:00:00,000 --> 00:00:03,000\n[Legenda de Teste]"

    try:
        kwargs = req.params.to_editor_kwargs()
        kwargs["generate_thumb"] = False
        kwargs["preview_duration"] = 3.0
        kwargs["srt_content"] = local_srt
        res_path = editor.edit_video(input_path=req.video_path, output_path=out_path, **kwargs)
        return {"status": "success", "preview_path": res_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/editor/save-videos-zip")
async def save_editor_videos_zip(
    files: list[UploadFile] = File(...),
    filenames: list[str] = Form(...),
    template_name: str = Form("template"),
    db: Session = Depends(get_db),
):
    """Receive N rendered video blobs, write them directly into the edited_directory."""
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    date_str = datetime.now().strftime("%d-%m-%Y")
    clean_template = os.path.splitext(template_name)[0].strip() or "template"
    target_dir = os.path.join(edited_dir, f"{clean_template}_{date_str}")
    os.makedirs(target_dir, exist_ok=True)

    saved = []
    for upload, filename in zip(files, filenames):
        if not os.path.splitext(filename)[1]:
            filename += ".webm"
        target_path = os.path.join(target_dir, filename)
        if os.path.exists(target_path):
            base, ext = os.path.splitext(filename)
            c = 2
            while os.path.exists(os.path.join(target_dir, f"{base}_{c}{ext}")):
                c += 1
            target_path = os.path.join(target_dir, f"{base}_{c}{ext}")
        try:
            with open(target_path, "wb") as f:
                shutil.copyfileobj(upload.file, f)
            saved.append(os.path.basename(target_path))
            session_videos.add(target_path, "edited")
        except Exception as e:
            print(f"Failed to save {filename}: {e}")

    fs_cache.invalidate()
    return {"status": "success", "saved": saved, "folder": target_dir, "count": len(saved)}


@router.post("/api/editor/download-videos-zip")
async def download_editor_videos_zip(
    files: list[UploadFile] = File(...),
    filenames: list[str] = Form(...),
    template_name: str = Form("template"),
    db: Session = Depends(get_db),
):
    """Receive N rendered video blobs, save to edited_directory AND return a zip for browser download."""
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    date_str = datetime.now().strftime("%d-%m-%Y")
    clean_template = os.path.splitext(template_name)[0].strip() or "template"
    target_dir = os.path.join(edited_dir, f"{clean_template}_{date_str}")
    os.makedirs(target_dir, exist_ok=True)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for upload, filename in zip(files, filenames):
            if not os.path.splitext(filename)[1]:
                filename += ".webm"
            target_path = os.path.join(target_dir, filename)
            if os.path.exists(target_path):
                base, ext = os.path.splitext(filename)
                c = 2
                while os.path.exists(os.path.join(target_dir, f"{base}_{c}{ext}")):
                    c += 1
                target_path = os.path.join(target_dir, f"{base}_{c}{ext}")
                filename = os.path.basename(target_path)
            try:
                data = await upload.read()
                with open(target_path, "wb") as f:
                    f.write(data)
                zf.writestr(filename, data)
                session_videos.add(target_path, "edited")
            except Exception as e:
                print(f"Failed to save {filename}: {e}")

    fs_cache.invalidate()
    zip_buffer.seek(0)
    zip_name = f"{clean_template}_{date_str}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )



@router.post("/api/editor/compose-and-save")
async def compose_and_save_endpoint(
    video: UploadFile = File(...),
    template: UploadFile = File(None),
    watermark: UploadFile = File(None),
    params: str = Form(...),
    db: Session = Depends(get_db),
):
    import json
    import tempfile

    # Parse composition parameters
    try:
        p = json.loads(params)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parâmetros JSON inválidos: {str(e)}")

    # Setup directories
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    date_str = datetime.now().strftime("%d-%m-%Y")
    template_name = p.get("template_name", "template")
    clean_template = os.path.splitext(template_name)[0].strip() or "template"
    target_dir = os.path.join(edited_dir, f"{clean_template}_{date_str}")
    os.makedirs(target_dir, exist_ok=True)

    # Save inputs to temporary files
    temp_files = []
    
    # Video input
    video_ext = os.path.splitext(video.filename)[1] or ".mp4"
    temp_video = tempfile.mktemp(suffix=video_ext)
    temp_files.append(temp_video)
    with open(temp_video, "wb") as f:
        shutil.copyfileobj(video.file, f)

    # Template input (if provided)
    temp_template = None
    if template:
        tmpl_ext = os.path.splitext(template.filename)[1] or ".png"
        temp_template = tempfile.mktemp(suffix=tmpl_ext)
        temp_files.append(temp_template)
        with open(temp_template, "wb") as f:
            shutil.copyfileobj(template.file, f)

    # Watermark input (if provided)
    temp_watermark = None
    if watermark:
        wm_ext = os.path.splitext(watermark.filename)[1] or ".png"
        temp_watermark = tempfile.mktemp(suffix=wm_ext)
        temp_files.append(temp_watermark)
        with open(temp_watermark, "wb") as f:
            shutil.copyfileobj(watermark.file, f)

    # Output filename
    filename = p.get("filename", "output.mp4")
    if not os.path.splitext(filename)[1]:
        filename += ".mp4"
    
    # Resolve target output path (avoid collisions)
    target_path = os.path.join(target_dir, filename)
    if os.path.exists(target_path):
        base, ext = os.path.splitext(filename)
        c = 2
        while os.path.exists(os.path.join(target_dir, f"{base}_{c}{ext}")):
            c += 1
        target_path = os.path.join(target_dir, f"{base}_{c}{ext}")
    
    # Compose
    try:
        editor.compose_editor_video(
            input_path=temp_video,
            output_path=target_path,
            template_path=temp_template,
            bbox_x=int(p.get("bbox_x", 0)),
            bbox_y=int(p.get("bbox_y", 0)),
            bbox_w=int(p.get("bbox_w", 0)) if p.get("bbox_w") else None,
            bbox_h=int(p.get("bbox_h", 0)) if p.get("bbox_h") else None,
            hole_x=int(p.get("hole_x", 0)),
            hole_y=int(p.get("hole_y", 0)),
            hole_w=int(p.get("hole_w", 0)) if p.get("hole_w") else None,
            hole_h=int(p.get("hole_h", 0)) if p.get("hole_h") else None,
            template_w=int(p.get("template_w", 1080)),
            template_h=int(p.get("template_h", 1920)),
            mirrored=bool(p.get("mirrored", False)),
            video_scale=float(p.get("video_scale", 100)) / 100.0,
            trim_start=float(p.get("trim_start", 0.0)),
            trim_end=float(p.get("trim_end", 0.0)) if p.get("trim_end") else None,
            anti_duplicity=bool(p.get("anti_duplicity", False)),
            text_enabled=bool(p.get("text_enabled", False)),
            text_content=str(p.get("text_content", "")),
            text_pos_x_pct=float(p.get("text_pos_x_pct", 50.0)),
            text_pos_y_pct=float(p.get("text_pos_y_pct", 85.0)),
            text_size=int(p.get("text_size", 16)),
            text_color=str(p.get("text_color", "#ffffff")),
            text_bold=bool(p.get("text_bold", True)),
            text_shadow=bool(p.get("text_shadow", True)),
            text_shadow_color=str(p.get("text_shadow_color", "#000000")),
            text_shadow_opacity=int(p.get("text_shadow_opacity", 80)),
            text_shadow_blur=int(p.get("text_shadow_blur", 7)),
            text_shadow_distance=int(p.get("text_shadow_distance", 6)),
            text_shadow_angle=int(p.get("text_shadow_angle", 45)),
            text_bg_color=str(p.get("text_bg_color", "#000000")) if p.get("text_bg_color") else None,
            text_bg_opacity=int(p.get("text_bg_opacity", 60)),
            text_font_family=str(p.get("text_font_family", "Arial")),
            text_align=str(p.get("text_align", "center")),
            text_stroke_enabled=bool(p.get("text_stroke_enabled", False)),
            text_stroke_color=str(p.get("text_stroke_color", "#000000")),
            text_stroke_width=int(p.get("text_stroke_width", 3)),
            text_line_spacing=int(p.get("text_line_spacing", 0)),
            text_width_pct=int(p.get("text_width_pct", 80)),
            watermark_path=temp_watermark,
            watermark_opacity=float(p.get("watermark_opacity", 100)) / 100.0,
            watermark_pos_x_pct=float(p.get("watermark_pos_x_pct", 50.0)),
            watermark_pos_y_pct=float(p.get("watermark_pos_y_pct", 50.0)),
            watermark_scale_pct=float(p.get("watermark_scale_pct", 25.0)),
        )
    except Exception as e:
        # Cleanup temp inputs
        for tf in temp_files:
            if os.path.exists(tf):
                try: os.remove(tf)
                except: pass
        raise HTTPException(status_code=500, detail=f"Erro na composição do vídeo: {str(e)}")

    # Cleanup temp inputs
    for tf in temp_files:
        if os.path.exists(tf):
            try: os.remove(tf)
            except: pass

    fs_cache.invalidate()
    session_videos.add(target_path, "edited")
    return {"status": "success", "saved_path": target_path, "folder": target_dir,
            "filename": os.path.basename(target_path)}


@router.post("/api/editor/save-video")
def save_editor_video(file: UploadFile = File(...), filename: str = Form(...),
                      template_name: str = Form("template"), db: Session = Depends(get_db)):
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    date_str = datetime.now().strftime("%d-%m-%Y")
    clean_template = os.path.splitext(template_name)[0].strip() or "template"
    target_dir = os.path.join(edited_dir, f"{clean_template}_{date_str}")
    os.makedirs(target_dir, exist_ok=True)

    if not os.path.splitext(filename)[1]:
        filename = filename + ".webm"
    target_path = os.path.join(target_dir, filename)
    if os.path.exists(target_path):
        base, ext = os.path.splitext(filename)
        c = 2
        while os.path.exists(os.path.join(target_dir, f"{base}_{c}{ext}")): c += 1
        target_path = os.path.join(target_dir, f"{base}_{c}{ext}")

    try:
        with open(target_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        session_videos.add(target_path, "edited")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar o arquivo: {str(e)}")

    fs_cache.invalidate()
    return {"status": "success", "saved_path": target_path, "folder": target_dir,
            "filename": os.path.basename(target_path)}


@router.post("/api/edit/batch")
def edit_batch(req: EditBatchRequest, db: Session = Depends(get_db)):
    edited_dir = get_config_directory(db, "edited_directory", "edited")
    batch_dir = os.path.join(edited_dir, f"lote_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}")
    os.makedirs(batch_dir, exist_ok=True)

    whisper_mode, api_key = ("api", None)
    if req.params.generate_subtitles:
        whisper_mode, api_key = _get_whisper_config(db)

    def do_batch_edit(progress_cb):
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        edited_files = []
        total = len(req.video_paths)
        start_time = time.time()
        lock = threading.Lock()
        video_statuses = {p: {"name": os.path.basename(p), "status": "queued", "progress": 0, "error": None}
                          for p in req.video_paths}
        errors_log = []
        completed_count = 0

        progress_cb(0, "Iniciando processamento em lote...", metadata={
            "videos": video_statuses, "errors": errors_log,
            "elapsed_seconds": 0, "estimated_remaining_seconds": None
        })

        max_workers = max(1, (os.cpu_count() or 4) // 2)

        def process_single_video(path):
            nonlocal completed_count
            path = get_absolute_path(path, db)
            if not os.path.exists(path):
                with lock:
                    video_statuses[path] = {"name": os.path.basename(path), "status": "failed", "progress": 0,
                                            "error": "Arquivo não encontrado."}
                    errors_log.append(f"{os.path.basename(path)}: Arquivo não encontrado.")
                    completed_count += 1
                    progress_cb(int((completed_count / total) * 100), f"Processando... [{completed_count}/{total}]",
                                metadata={"videos": video_statuses, "errors": errors_log,
                                          "elapsed_seconds": int(time.time() - start_time)})
                return None

            video_params = req.params
            if req.custom_params and path in req.custom_params:
                video_params = req.custom_params[path]

            base_name = os.path.basename(path)
            name = os.path.splitext(base_name)[0]
            out_path = os.path.join(batch_dir, f"edited_{name}_{int(time.time())}.mp4")

            with lock: video_statuses[path]["status"] = "running"

            local_srt = None
            if video_params.generate_subtitles:
                try:
                    with lock: video_statuses[path]["progress"] = 5
                    local_srt = editor.generate_subtitles(path, whisper_mode, api_key)
                except Exception as e:
                    print(f"Whisper error for {path}: {e}")

            try:
                def per_video_progress(pct, msg):
                    with lock:
                        video_statuses[path]["progress"] = pct
                        overall = int(sum(v["progress"] for v in video_statuses.values()) / total)
                        elapsed = time.time() - start_time
                        done_equiv = sum(v["progress"] for v in video_statuses.values()) / 100.0
                        est_rem = (elapsed / done_equiv) * (total - done_equiv) if done_equiv > 0 else None
                        progress_cb(overall, f"Processando {base_name}: {pct}%", metadata={
                            "videos": video_statuses, "errors": errors_log,
                            "elapsed_seconds": int(elapsed),
                            "estimated_remaining_seconds": int(est_rem) if est_rem else None
                        })

                kwargs = video_params.to_editor_kwargs()
                kwargs["srt_content"] = local_srt
                kwargs["progress_callback"] = per_video_progress
                res_path = editor.edit_video(input_path=path, output_path=out_path, **kwargs)
                with lock:
                    video_statuses[path]["status"] = "completed"
                    video_statuses[path]["progress"] = 100
                    edited_files.append(res_path)
                    session_videos.add(res_path, "edited")
            except Exception as e:
                err_msg = str(e)
                print(f"Error editing {path}: {err_msg}")
                with lock:
                    video_statuses[path]["status"] = "failed"
                    video_statuses[path]["progress"] = 0
                    video_statuses[path]["error"] = err_msg
                    errors_log.append(f"{base_name}: {err_msg}")

            with lock:
                completed_count += 1
                elapsed = time.time() - start_time
                overall = int(sum(v["progress"] for v in video_statuses.values()) / total)
                progress_cb(overall, f"Concluído [{completed_count}/{total}]",
                            metadata={"videos": video_statuses, "errors": errors_log,
                                      "elapsed_seconds": int(elapsed)})
            return out_path

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(process_single_video, p) for p in req.video_paths]
            for future in as_completed(futures):
                future.result()

        fs_cache.invalidate()
        return edited_files

    task_id = task_queue.submit("edit_batch", do_batch_edit,
                                description=f"Editando {len(req.video_paths)} vídeos em lote")
    return {"status": "queued", "task_id": task_id}
