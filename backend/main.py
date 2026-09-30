"""ViralDog API — Application entry point."""
import os
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import init_db, APP_DATA_DIR
from scheduler import run_scheduler
from rate_limiter import limiter, get_client_ip
from fastapi import Request
from fastapi.responses import JSONResponse
from routers.accounts import router as accounts_router
from routers.settings import router as settings_router
from routers.downloads import router as downloads_router
from routers.editing import router as editing_router
from routers.videos import router as videos_router
from routers.publishing import router as publishing_router
from routers.cloud import router as cloud_router
from routers.auth import router as auth_router
from routers.legal import router as legal_router
from routers.warmup import router as warmup_router
from routers.extensions import router as extensions_router


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


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Ignorar requisições OPTIONS (CORS preflight), rotas estáticas e rotas do editor/renderização
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/"):
        return await call_next(request)
    
    # Rotas de renderização de vídeo e edição não devem sofrer rate limiting restritivo
    if path.startswith("/api/editor/"):
        return await call_next(request)
    
    # Login tem seu próprio rate limit dedicado mais rígido (5 req/min)
    if path == "/api/auth/login":
        return await call_next(request)

    client_ip = get_client_ip(request)
    is_loopback = client_ip in ("127.0.0.1", "::1", "localhost", "testclient")

    # Para conexões locais (Desktop Electron / localhost), não bloquear uso contínuo da UI
    if is_loopback and not os.getenv("STRICT_LOCAL_RATE_LIMIT"):
        response = await call_next(request)
        return response

    max_reqs = int(os.getenv("API_RATE_LIMIT", "300"))
    allowed, retry_after, remaining = limiter.check(f"api:{client_ip}", max_requests=max_reqs, window_seconds=60)
    
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Limite de requisições excedido. Aguarde {retry_after} segundos.",
                "retry_after": retry_after
            },
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(max_reqs),
                "X-RateLimit-Remaining": "0"
            }
        )

    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(max_reqs)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return response

app.include_router(accounts_router)
app.include_router(settings_router)
app.include_router(downloads_router)
app.include_router(editing_router)
app.include_router(videos_router)
app.include_router(publishing_router)
app.include_router(cloud_router)
app.include_router(auth_router)
app.include_router(legal_router)
app.include_router(warmup_router)
app.include_router(extensions_router)

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


