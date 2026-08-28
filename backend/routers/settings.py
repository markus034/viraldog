"""Config/settings endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db, Config
from schemas import SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])
PROTECTED_CONFIG_KEYS = {"multilogin_automation_token"}


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    configs = db.query(Config).all()
    return {c.key: c.value for c in configs if c.key not in PROTECTED_CONFIG_KEYS}


@router.post("")
def update_settings(req: SettingsUpdate, db: Session = Depends(get_db)):
    for key, val in req.settings.items():
        if key in PROTECTED_CONFIG_KEYS:
            continue
        cfg = db.query(Config).filter(Config.key == key).first()
        if cfg:
            cfg.value = str(val)
        else:
            db.add(Config(key=key, value=str(val)))
    db.commit()
    return {"status": "success"}
