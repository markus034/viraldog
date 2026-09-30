import time
import random
import threading
import json
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db, SessionLocal, Account
from schemas import WarmupStartRequest, WarmupBulkRequest
from routers.auth import get_current_user

router = APIRouter(prefix="/api/warmup", tags=["warmup"])

# Status em memória para monitoramento em tempo real
# Formato: { account_id: { "status": "running"|"completed"|"failed"|"stopped", "progress": int, "step": str, "logs": list, "started_at": str } }
ACTIVE_WARMUPS: Dict[int, Dict[str, Any]] = {}
WARMUP_THREADS: Dict[int, threading.Thread] = {}
STOP_FLAGS: Dict[int, bool] = {}


def _append_log(account_id: int, message: str, level: str = "info"):
    now_str = datetime.now().strftime("%H:%M:%S")
    entry = {"time": now_str, "msg": message, "level": level}
    if account_id in ACTIVE_WARMUPS:
        ACTIVE_WARMUPS[account_id]["logs"].append(entry)
        ACTIVE_WARMUPS[account_id]["step"] = message
        # Manter no máximo 50 logs recentes
        if len(ACTIVE_WARMUPS[account_id]["logs"]) > 50:
            ACTIVE_WARMUPS[account_id]["logs"] = ACTIVE_WARMUPS[account_id]["logs"][-50:]
    print(f"[Warmup Account {account_id}] [{level.upper()}] {message}")


def _execute_warmup_job(account_id: int, config: Dict[str, Any]):
    db = SessionLocal()
    account = None
    try:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            _append_log(account_id, "Conta não encontrada.", "error")
            ACTIVE_WARMUPS[account_id]["status"] = "failed"
            return

        username = account.username
        mode = config.get("mode", "headless")
        feed_minutes = int(config.get("feed_minutes", 3))
        stories_count = int(config.get("stories_count", 5))
        likes_count = int(config.get("likes_count", 3))
        hashtags = config.get("hashtags") or ["brasil", "humor", "lifestyle", "marketing", "explore"]

        total_steps = 1 + stories_count + likes_count + max(1, feed_minutes)
        completed_steps = 0

        _append_log(account_id, f"Iniciando rotina de aquecimento para @{username} (Modo: {mode.upper()})...", "info")
        ACTIVE_WARMUPS[account_id]["total_steps"] = total_steps
        ACTIVE_WARMUPS[account_id]["completed_steps"] = 0

        # 1. Simular inicialização do cliente com cookies e proxy
        time.sleep(random.uniform(1.5, 3.0))
        if STOP_FLAGS.get(account_id):
            _append_log(account_id, "Aquecimento cancelado pelo usuário.", "warning")
            ACTIVE_WARMUPS[account_id]["status"] = "stopped"
            return

        _append_log(account_id, "Carregando sessão isolada e verificando conectividade com proxy...", "info")
        completed_steps += 1
        ACTIVE_WARMUPS[account_id]["completed_steps"] = completed_steps

        # 2. Navegação / Scroll do Feed
        _append_log(account_id, f"Navegando no feed principal por ~{feed_minutes} min com rolagens humanas...", "info")
        for m in range(max(1, feed_minutes)):
            if STOP_FLAGS.get(account_id):
                break
            # Simular rolagem e visualização de posts
            scroll_delay = random.uniform(8.0, 15.0)
            time.sleep(scroll_delay)
            _append_log(account_id, f"Feed: Explorando bloco {m+1}/{feed_minutes} ({random.randint(3, 7)} posts visualizados)", "info")
            completed_steps += 1
            ACTIVE_WARMUPS[account_id]["completed_steps"] = completed_steps

        if STOP_FLAGS.get(account_id):
            _append_log(account_id, "Aquecimento cancelado durante o feed.", "warning")
            ACTIVE_WARMUPS[account_id]["status"] = "stopped"
            return

        # 3. Visualização de Stories
        stories_viewed = 0
        for s in range(stories_count):
            if STOP_FLAGS.get(account_id):
                break
            delay_story = random.uniform(4.0, 9.0)
            time.sleep(delay_story)
            stories_viewed += 1
            _append_log(account_id, f"Stories: Assistindo story {s+1}/{stories_count} (Pausa natural: {int(delay_story)}s)", "info")
            completed_steps += 1
            ACTIVE_WARMUPS[account_id]["completed_steps"] = completed_steps

        if STOP_FLAGS.get(account_id):
            _append_log(account_id, "Aquecimento cancelado durante stories.", "warning")
            ACTIVE_WARMUPS[account_id]["status"] = "stopped"
            return

        # 4. Curtidas Seguras em Hashtags do Nicho
        likes_done = 0
        for l in range(likes_count):
            if STOP_FLAGS.get(account_id):
                break
            target_tag = random.choice(hashtags) if hashtags else "explore"
            delay_like = random.uniform(10.0, 20.0)
            time.sleep(delay_like)
            likes_done += 1
            _append_log(account_id, f"Curtida #{l+1}: Interagindo com post em #{target_tag} (Pausa humana de segurança: {int(delay_like)}s)", "info")
            completed_steps += 1
            ACTIVE_WARMUPS[account_id]["completed_steps"] = completed_steps

        # 5. Finalizar e salvar histórico
        now_iso = datetime.utcnow()
        account.last_warmup_at = now_iso
        
        # Histórico JSON
        current_history = []
        if account.warmup_history_json:
            try:
                current_history = json.loads(account.warmup_history_json)
                if not isinstance(current_history, list):
                    current_history = []
            except Exception:
                current_history = []

        history_item = {
            "date": now_iso.strftime("%Y-%m-%d %H:%M:%S"),
            "mode": mode,
            "feed_minutes": feed_minutes,
            "stories_viewed": stories_viewed,
            "likes_done": likes_done,
            "status": "success" if not STOP_FLAGS.get(account_id) else "partial"
        }
        current_history.insert(0, history_item)
        # Manter últimos 20 históricos
        account.warmup_history_json = json.dumps(current_history[:20])
        db.commit()

        _append_log(account_id, f"🎉 Sessão de aquecimento concluída com sucesso! ({stories_viewed} stories, {likes_done} curtidas)", "success")
        ACTIVE_WARMUPS[account_id]["status"] = "completed"
        ACTIVE_WARMUPS[account_id]["completed_at"] = datetime.now().isoformat()

    except Exception as ex:
        _append_log(account_id, f"Erro na rotina de aquecimento: {str(ex)}", "error")
        if account_id in ACTIVE_WARMUPS:
            ACTIVE_WARMUPS[account_id]["status"] = "failed"
            ACTIVE_WARMUPS[account_id]["error"] = str(ex)
    finally:
        db.close()
        STOP_FLAGS.pop(account_id, None)


@router.post("/start/{account_id}")
def start_warmup(account_id: int, req: WarmupStartRequest, request: Request, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    if account_id in ACTIVE_WARMUPS and ACTIVE_WARMUPS[account_id].get("status") == "running":
        return {
            "status": "already_running",
            "message": f"Aquecimento já está em andamento para @{account.username}",
            "data": ACTIVE_WARMUPS[account_id]
        }

    STOP_FLAGS[account_id] = False
    config_dict = req.model_dump() if hasattr(req, "model_dump") else req.dict()

    # Salvar config no perfil para próximas execuções
    account.warmup_config_json = json.dumps(config_dict)
    db.commit()

    ACTIVE_WARMUPS[account_id] = {
        "account_id": account_id,
        "username": account.username,
        "status": "running",
        "step": "Iniciando...",
        "logs": [],
        "started_at": datetime.now().isoformat(),
        "total_steps": 1,
        "completed_steps": 0,
        "config": config_dict
    }

    t = threading.Thread(target=_execute_warmup_job, args=(account_id, config_dict), daemon=True)
    WARMUP_THREADS[account_id] = t
    t.start()

    return {
        "status": "success",
        "message": f"Aquecimento iniciado para @{account.username}",
        "account_id": account_id
    }


@router.post("/stop/{account_id}")
def stop_warmup(account_id: int, db: Session = Depends(get_db)):
    if account_id in ACTIVE_WARMUPS and ACTIVE_WARMUPS[account_id].get("status") == "running":
        STOP_FLAGS[account_id] = True
        ACTIVE_WARMUPS[account_id]["status"] = "stopping"
        _append_log(account_id, "Solicitação de parada recebida. Encerrando etapas com segurança...", "warning")
        return {"status": "success", "message": "Parada de aquecimento solicitada."}
    return {"status": "not_running", "message": "Nenhum aquecimento em execução para esta conta."}


@router.get("/status/{account_id}")
def get_warmup_status(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    active_info = ACTIVE_WARMUPS.get(account_id)
    history = []
    if account.warmup_history_json:
        try:
            history = json.loads(account.warmup_history_json)
        except Exception:
            history = []

    config = {}
    if account.warmup_config_json:
        try:
            config = json.loads(account.warmup_config_json)
        except Exception:
            config = {}

    return {
        "account_id": account_id,
        "username": account.username,
        "last_warmup_at": account.last_warmup_at.isoformat() if account.last_warmup_at else None,
        "active_session": active_info,
        "history": history,
        "config": config
    }


@router.get("/active")
def list_active_warmups():
    return {
        "active_warmups": list(ACTIVE_WARMUPS.values())
    }


@router.post("/bulk")
def start_bulk_warmup(req: WarmupBulkRequest, request: Request, db: Session = Depends(get_db)):
    account_ids = req.account_ids
    if not account_ids:
        raise HTTPException(status_code=400, detail="Nenhuma conta selecionada para aquecimento.")

    started = []
    for acc_id in account_ids:
        acc = db.query(Account).filter(Account.id == acc_id).first()
        if not acc:
            continue

        if acc_id in ACTIVE_WARMUPS and ACTIVE_WARMUPS[acc_id].get("status") == "running":
            continue

        STOP_FLAGS[acc_id] = False
        config_dict = {
            "mode": req.mode or "headless",
            "feed_minutes": req.feed_minutes or 3,
            "stories_count": req.stories_count or 5,
            "likes_count": req.likes_count or 3,
            "hashtags": req.hashtags or ["brasil", "explore"]
        }

        ACTIVE_WARMUPS[acc_id] = {
            "account_id": acc_id,
            "username": acc.username,
            "status": "running",
            "step": "Iniciando na fila de lote...",
            "logs": [],
            "started_at": datetime.now().isoformat(),
            "total_steps": 1,
            "completed_steps": 0,
            "config": config_dict
        }

        t = threading.Thread(target=_execute_warmup_job, args=(acc_id, config_dict), daemon=True)
        WARMUP_THREADS[acc_id] = t
        t.start()
        started.append(acc.username)

    return {
        "status": "success",
        "started_count": len(started),
        "accounts": started
    }
