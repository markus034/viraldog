"""ViralDog API — Application entry point."""
import os
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db, APP_DATA_DIR
from scheduler import run_scheduler
from routers.accounts import router as accounts_router
from routers.settings import router as settings_router
from routers.downloads import router as downloads_router
from routers.editing import router as editing_router
from routers.videos import router as videos_router
from routers.publishing import router as publishing_router
from routers.cloud import router as cloud_router
from routers.auth import router as auth_router
from routers.legal import router as legal_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    threading.Thread(target=run_scheduler, daemon=True).start()
    yield


app = FastAPI(title="ViralDog API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts_router)
app.include_router(settings_router)
app.include_router(downloads_router)
app.include_router(editing_router)
app.include_router(videos_router)
app.include_router(publishing_router)
app.include_router(cloud_router)
app.include_router(auth_router)
app.include_router(legal_router)

# Serve uploaded avatars as static files
AVATARS_DIR = os.path.join(APP_DATA_DIR, "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=AVATARS_DIR), name="avatars")

# Serve uploaded videos statically
UPLOADS_DIR = os.path.join(APP_DATA_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


