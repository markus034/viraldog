"""Publishing, scheduling, repost, and AI caption endpoints."""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from database import get_db, Post, Account
from schemas import SchedulePostRequest, BulkScheduleRequest, AIRequest, RepostRequest
import backend_ai_service as ai_service
import backend_publisher as publisher
import backend_analytics as analytics

router = APIRouter(tags=["publishing"])


@router.post("/api/ai/caption")
def generate_ai_caption(req: AIRequest, db: Session = Depends(get_db)):
    try:
        caption = ai_service.generate_caption(db, req.video_title)
        return {"status": "success", "caption": caption}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _parse_scheduled_dt(scheduled_time_str: str) -> datetime:
    """Parses ISO string from frontend (with Z or timezone offset or naive) to UTC datetime."""
    raw = (scheduled_time_str or "").strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    local_tz = datetime.now().astimezone().tzinfo
    return dt.replace(tzinfo=local_tz).astimezone(timezone.utc).replace(tzinfo=None)


@router.post("/api/posts")
def schedule_post(req: SchedulePostRequest, db: Session = Depends(get_db)):
    if req.account_username:
        clean_user = req.account_username.strip().lstrip('@')
        acc = db.query(Account).filter((Account.username == clean_user) | (Account.display_name == req.account_username)).first()
        if not acc:
            raise HTTPException(status_code=400, detail=f"Conta {req.account_username} não encontrada.")
        if not acc.session_cookies:
            raise HTTPException(
                status_code=400,
                detail=f"A conta @{req.account_username} não possui sessão ativa de cookies salva."
            )

    try:
        dt_utc = _parse_scheduled_dt(req.scheduled_time)
    except Exception:
        raise HTTPException(status_code=400, detail="Data/hora inválida. Formato correto: YYYY-MM-DDTHH:MM:SS ou ISO UTC.")

    post = Post(
        video_path=req.video_path, caption=req.caption, scheduled_time=dt_utc,
        account_username=req.account_username, status="pending", post_type=req.post_type,
        carousel_image_paths=json.dumps(req.carousel_image_paths) if req.carousel_image_paths else None
    )
    db.add(post)
    db.commit()
    return {"status": "success", "post_id": post.id}


@router.post("/api/posts/bulk")
def bulk_schedule_posts(req: BulkScheduleRequest, db: Session = Depends(get_db)):
    if not req.posts:
        raise HTTPException(status_code=400, detail="Nenhum post fornecido para agendamento em massa.")

    created_ids = []

    for item in req.posts:
        if item.account_username:
            clean_user = item.account_username.strip().lstrip('@')
            acc = db.query(Account).filter((Account.username == clean_user) | (Account.display_name == item.account_username)).first()
            if acc and not acc.session_cookies:
                raise HTTPException(
                    status_code=400,
                    detail=f"A conta {item.account_username} não possui sessão de cookies salva."
                )

        try:
            dt_utc = _parse_scheduled_dt(item.scheduled_time)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Data/hora inválida para o vídeo: {item.video_path}")

        post = Post(
            video_path=item.video_path,
            caption=item.caption,
            scheduled_time=dt_utc,
            account_username=item.account_username,
            status="pending",
            post_type=item.post_type or "reel"
        )
        db.add(post)
        created_ids.append(post)

    db.commit()
    return {"status": "success", "count": len(created_ids)}


@router.get("/api/posts")
def list_posts(db: Session = Depends(get_db)):
    posts = db.query(Post).order_by(Post.scheduled_time.asc()).all()
    accounts = db.query(Account).all()
    acc_map = {}
    for a in accounts:
        if a.username:
            acc_map[a.username] = a.display_name or a.username
            acc_map[str(a.id)] = a.display_name or a.username
        if a.display_name:
            acc_map[a.display_name] = a.display_name

    return [{
        "id": p.id, "video_path": p.video_path, "caption": p.caption,
        "scheduled_time": (p.scheduled_time.isoformat() + "Z") if p.scheduled_time else None,
        "status": p.status, "ig_media_id": p.ig_media_id, "error_message": p.error_message,
        "account_username": acc_map.get(p.account_username, p.account_username),
        "account_raw_username": p.account_username,
        "post_type": p.post_type or "reel",
        "is_repost": p.is_repost, "engagement_score": p.engagement_score,
        "cross_post_targets": json.loads(p.cross_post_targets) if p.cross_post_targets else [],
        "created_at": p.created_at.isoformat() if p.created_at else None,
    } for p in posts]


@router.post("/api/posts/{post_id}/retry")
def retry_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    
    if post.account_username:
        acc = db.query(Account).filter(Account.username == post.account_username).first()
        if acc:
            has_session = bool(acc.session_cookies)
            has_token = bool(acc.fb_access_token)
            if not has_session and not has_token:
                raise HTTPException(
                    status_code=400,
                    detail=f"A conta @{post.account_username} continua sem sessão de cookies no Instagram. Atualize a sessão na aba Perfis."
                )

    post.status = "pending"
    post.error_message = None
    now = datetime.utcnow()
    if post.scheduled_time and post.scheduled_time < now:
        post.scheduled_time = now
    db.commit()
    return {"status": "success", "post_id": post.id}


@router.delete("/api/posts/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    db.delete(post)
    db.commit()
    return {"status": "success"}


@router.get("/api/posts/suggest-time")
def suggest_time(account_username: Optional[str] = None, db: Session = Depends(get_db)):
    return publisher.suggest_best_time(db, account_username)


@router.post("/api/posts/repost")
def create_repost(req: RepostRequest, db: Session = Depends(get_db)):
    try:
        scheduled = datetime.fromisoformat(req.scheduled_time) if req.scheduled_time else None
        repost = publisher.create_repost(db, req.original_post_id, scheduled)
        return {"status": "success", "post_id": repost.id, "caption": repost.caption}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/posts/repost-eligible")
def get_repost_eligible(db: Session = Depends(get_db)):
    return publisher.check_repost_eligible(db)


# ── Analytics ──

@router.get("/api/analytics/overview")
def analytics_overview(period: int = 30, account_username: Optional[str] = None, db: Session = Depends(get_db)):
    return analytics.get_analytics_overview(db, period, account_username)

@router.get("/api/analytics/followers")
def analytics_followers(period: int = 90, account_username: Optional[str] = None, db: Session = Depends(get_db)):
    return analytics.get_follower_history(db, period, account_username)

@router.get("/api/analytics/best-times")
def analytics_best_times(account_username: Optional[str] = None, db: Session = Depends(get_db)):
    return analytics.get_best_posting_times(db, account_username)

@router.post("/api/analytics/collect")
def analytics_collect_trigger(account_username: Optional[str] = None, db: Session = Depends(get_db)):
    try:
        analytics.collect_post_analytics(db, account_username)
        analytics.collect_follower_snapshot(db, account_username)
        return {"status": "success", "message": "Coleta de métricas iniciada."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Proxy ──

@router.post("/api/proxy/test")
def test_proxy_endpoint(proxy_url: str = Form(...)):
    import proxy_manager
    return proxy_manager.test_proxy(proxy_url)

@router.get("/api/proxy/test-all")
def test_all_proxies(db: Session = Depends(get_db)):
    import proxy_manager
    return proxy_manager.test_all_account_proxies(db)


# ── Task Queue ──

@router.get("/api/tasks")
def list_tasks(include_completed: bool = False):
    from task_queue import task_queue
    return task_queue.list_tasks(include_completed)

@router.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    from task_queue import task_queue
    status = task_queue.get_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return status

@router.delete("/api/tasks/{task_id}")
def cancel_task(task_id: str):
    from task_queue import task_queue
    return {"status": "cancelled" if task_queue.cancel(task_id) else "failed"}
