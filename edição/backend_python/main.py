import os
import json
import uuid
import shutil
import asyncio
from typing import Dict, List
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from processor import detect_content_bbox, detect_template_hole, compose_video

app = FastAPI(title="Autodark Grid Studio API")

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.abspath("./data")
ORIGINALS_DIR = os.path.join(DATA_DIR, "originals")
TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")
THUMBNAILS_DIR = os.path.join(DATA_DIR, "thumbnails")
OUTPUT_DIR = os.path.join(DATA_DIR, "output")
CACHE_FILE = os.path.join(DATA_DIR, "cache.json")

# Ensure folders exist
for folder in [ORIGINALS_DIR, TEMPLATES_DIR, THUMBNAILS_DIR, OUTPUT_DIR]:
    os.makedirs(folder, exist_ok=True)

# State
active_connections: List[WebSocket] = []
jobs: Dict[str, dict] = {}
template_config = {
    "path": "",
    "width": 0,
    "height": 0,
    "hole": None # [x, y, w, h]
}

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_cache(cache_data):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=2)

# Broadcast updates to connected clients
async def broadcast_status(job_id: str, status: str, progress: float, details: str = "", extra: dict = None):
    payload = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "details": details,
    }
    if extra:
        payload.update(extra)
        
    if job_id in jobs:
        jobs[job_id].update(payload)
        
    disconnected = []
    for conn in active_connections:
        try:
            await conn.send_json({"type": "job_update", "data": payload})
        except:
            disconnected.append(conn)
    for conn in disconnected:
        if conn in active_connections:
            active_connections.remove(conn)

async def process_job_worker(job_id: str):
    job = jobs[job_id]
    video_path = job["video_path"]
    filename = job["filename"]
    
    # 1. Detection Phase
    await broadcast_status(job_id, "detectando", 25.0, "Analisando variância temporal do vídeo...")
    try:
        if job.get("mode") == "auto":
            # Real OpenCV temporal variance detection
            x, y, w, h, confidence = detect_content_bbox(video_path)
            bbox = [x, y, w, h]
        else:
            # Manual / custom calibration
            bbox = job.get("manual_bbox", [0, 0, 100, 100]) # Fallback or values
            confidence = 1.0
            
        jobs[job_id]["bbox"] = bbox
        jobs[job_id]["confidence"] = confidence
    except Exception as e:
        await broadcast_status(job_id, "falhou", 100.0, f"Erro na detecção: {str(e)}")
        return

    # Check cache
    cache = load_cache()
    cache_key = f"{filename}_{json.dumps(bbox)}_{json.dumps(template_config['hole'])}"
    if cache_key in cache and os.path.exists(cache[cache_key]):
        # Serve cached result
        await broadcast_status(job_id, "concluído", 100.0, "Vídeo recuperado do cache de disco!", {
            "output_url": f"/data/output/{os.path.basename(cache[cache_key])}",
            "bbox": bbox
        })
        return

    # 2. Composition Phase
    await broadcast_status(job_id, "compondo", 60.0, "Removendo moldura antiga e colando no novo template...")
    try:
        output_filename = f"out_{job_id}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        
        # Check if we have template and hole configuration
        if not template_config["path"] or not template_config["hole"]:
            await broadcast_status(job_id, "falhou", 100.0, "Nenhum template PNG válido configurado.")
            return
            
        # Compose via FFmpeg
        compose_video(
            video_path=video_path,
            template_path=template_config["path"],
            output_path=output_path,
            crop_bbox=bbox,
            hole_bbox=template_config["hole"]
        )
        
        # Save to cache
        cache[cache_key] = output_path
        save_cache(cache)
        
        await broadcast_status(job_id, "concluído", 100.0, "Processamento concluído com sucesso!", {
            "output_url": f"/data/output/{output_filename}",
            "bbox": bbox
        })
        
    except Exception as e:
        await broadcast_status(job_id, "falhou", 100.0, f"Erro na composição: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        # Send initial jobs list
        await websocket.send_json({"type": "init", "jobs": list(jobs.values()), "template": template_config})
        while True:
            await websocket.receive_text() # keep alive
    except WebSocketDisconnect:
        active_connections.remove(websocket)

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    job_id = str(uuid.uuid4())[:8]
    filename = f"{job_id}_{file.filename}"
    video_path = os.path.join(ORIGINALS_DIR, filename)
    
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract temporary thumbnail via OpenCV
    thumb_filename = f"{job_id}.jpg"
    thumb_path = os.path.join(THUMBNAILS_DIR, thumb_filename)
    
    cap = cv2.VideoCapture(video_path)
    if cap.isOpened():
        # Read a frame near the 5-second mark or first frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, 30)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(thumb_path, frame)
    cap.release()
    
    jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename,
        "video_path": video_path,
        "thumbnail_url": f"/data/thumbnails/{thumb_filename}",
        "status": "na fila",
        "progress": 0.0,
        "details": "Aguardando início do processamento...",
        "mode": "auto",
        "bbox": None,
        "confidence": 0.0
    }
    
    # Trigger auto-detection in background
    background_tasks.add_task(process_job_worker, job_id)
    return jobs[job_id]

@app.post("/api/upload-template")
async def upload_template(file: UploadFile = File(...)):
    global template_config
    filename = f"template_{file.filename}"
    template_path = os.path.join(TEMPLATES_DIR, filename)
    
    with open(template_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Detect transparency hole
    hole = detect_template_hole(template_path)
    
    # Read resolution
    img = cv2.imread(template_path)
    h, w, _ = img.shape
    
    template_config = {
        "path": template_path,
        "width": w,
        "height": h,
        "hole": hole,
        "url": f"/data/templates/{filename}"
    }
    
    # Notify clients
    for conn in active_connections:
        await conn.send_json({"type": "template_update", "data": template_config})
        
    return template_config

class RecalibrateRequest(BaseModel):
    job_id: str
    x: int
    y: int
    w: int
    h: int

@app.post("/api/recalibrate")
async def recalibrate(req: RecalibrateRequest, background_tasks: BackgroundTasks):
    if req.job_id not in jobs:
        return {"error": "Job not found"}
        
    job = jobs[req.job_id]
    job["mode"] = "manual"
    job["manual_bbox"] = [req.x, req.y, req.w, req.h]
    job["status"] = "na fila"
    job["progress": 0.0]
    
    background_tasks.add_task(process_job_worker, req.job_id)
    return job

# Serve assets
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
