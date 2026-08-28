"""Authentication and OAuth endpoints for Meta / Instagram Graph API."""
import os
import requests
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, Config, Account

router = APIRouter(prefix="/api/auth/meta", tags=["auth_meta"])


class MetaExchangeRequest(BaseModel):
    code: Optional[str] = None
    access_token: Optional[str] = None
    redirect_uri: Optional[str] = None


class MetaLinkRequest(BaseModel):
    account_id: Optional[int] = None
    username: str
    fb_access_token: str
    fb_ig_account_id: str
    instagram_user_id: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class MetaTestRequest(BaseModel):
    fb_access_token: str
    fb_ig_account_id: str


DEFAULT_META_APP_ID = "1640190021019907"


def get_config_val(db: Session, key: str, default: str = "") -> str:
    cfg = db.query(Config).filter(Config.key == key).first()
    return cfg.value if cfg and cfg.value else default


@router.get("/config")
def get_meta_config(db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    app_secret = get_config_val(db, "meta_app_secret")
    public_base_url = get_config_val(db, "public_media_base_url")
    return {
        "meta_app_id": app_id,
        "has_app_secret": bool(app_secret),
        "public_media_base_url": public_base_url,
    }


@router.get("/url")
def get_meta_oauth_url(redirect_uri: str, db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    if not app_id:
        raise HTTPException(
            status_code=400,
            detail="Meta App ID não configurado. Adicione seu App ID nas Configurações.",
        )

    scopes = [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
    ]
    scope_str = ",".join(scopes)
    auth_url = (
        f"https://www.facebook.com/v19.0/dialog/oauth"
        f"?client_id={app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scope_str}"
        f"&response_type=code"
    )
    return {"auth_url": auth_url, "app_id": app_id}


@router.post("/exchange")
def exchange_meta_token(req: MetaExchangeRequest, db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id")
    app_secret = get_config_val(db, "meta_app_secret")

    user_access_token = req.access_token

    # 1. Se recebemos o 'code', trocar por token de curto prazo
    if req.code:
        if not app_id or not app_secret:
            raise HTTPException(
                status_code=400,
                detail="Meta App ID e App Secret são necessários para trocar o código por token.",
            )
        token_url = "https://graph.facebook.com/v19.0/oauth/access_token"
        params = {
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": req.redirect_uri or "https://localhost:5173",
            "code": req.code,
        }
        res = requests.get(token_url, params=params, timeout=15)
        if res.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"Erro ao trocar código na Meta API: {res.text}",
            )
        data = res.json()
        user_access_token = data.get("access_token")

    if not user_access_token:
        raise HTTPException(
            status_code=400,
            detail="Nenhum token retornado ou fornecido.",
        )

    # 2. Obter Long-Lived Token (60 dias) se App Secret estiver configurado
    long_lived_token = user_access_token
    if app_id and app_secret:
        try:
            ll_res = requests.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": user_access_token,
                },
                timeout=15,
            )
            if ll_res.status_code == 200:
                ll_data = ll_res.json()
                long_lived_token = ll_data.get("access_token", user_access_token)
        except Exception as e:
            print(f"Aviso: Não foi possível estender token para 60 dias: {e}")

    # 3. Buscar Páginas e Contas do Instagram vinculadas
    # GET /me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}
    accounts_res = requests.get(
        "https://graph.facebook.com/v19.0/me/accounts",
        params={
            "fields": "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
            "access_token": long_lived_token,
        },
        timeout=15,
    )

    if accounts_res.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao buscar contas vinculadas no Facebook/Instagram: {accounts_res.text}",
        )

    pages_data = accounts_res.json().get("data", [])
    discovered_ig_accounts = []

    for page in pages_data:
        page_name = page.get("name")
        page_token = page.get("access_token") or long_lived_token
        ig_biz = page.get("instagram_business_account")
        if ig_biz:
            discovered_ig_accounts.append({
                "facebook_page_name": page_name,
                "facebook_page_id": page.get("id"),
                "instagram_business_account_id": ig_biz.get("id"),
                "username": ig_biz.get("username"),
                "display_name": ig_biz.get("name") or ig_biz.get("username"),
                "avatar_url": ig_biz.get("profile_picture_url"),
                "page_access_token": page_token,
                "user_access_token": long_lived_token,
            })

    return {
        "status": "success",
        "long_lived_token": long_lived_token,
        "instagram_accounts": discovered_ig_accounts,
        "raw_pages_count": len(pages_data),
    }


@router.post("/link")
def link_meta_account(req: MetaLinkRequest, db: Session = Depends(get_db)):
    acc = None
    if req.account_id:
        acc = db.query(Account).filter(Account.id == req.account_id).first()
    
    if not acc and req.username:
        acc = db.query(Account).filter(Account.username == req.username).first()

    if not acc:
        # Criar nova conta no banco
        acc = Account(
            username=req.username,
            display_name=req.display_name or req.username,
            status="active",
            folder="Geral",
            platform="instagram",
        )
        db.add(acc)

    acc.auth_mode = "official"
    acc.fb_access_token = req.fb_access_token
    acc.fb_ig_account_id = req.fb_ig_account_id
    acc.instagram_user_id = req.instagram_user_id or req.fb_ig_account_id
    if req.display_name:
        acc.display_name = req.display_name
    if req.avatar_url:
        acc.avatar_url = req.avatar_url
    acc.status = "active"

    db.commit()
    db.refresh(acc)

    return {
        "status": "success",
        "message": f"Conta @{acc.username} conectada com sucesso via API Oficial da Meta!",
        "account_id": acc.id,
        "username": acc.username,
        "auth_mode": acc.auth_mode,
        "fb_ig_account_id": acc.fb_ig_account_id,
    }


# ─── Instagram Direct Login Endpoints (instagram.com/oauth/authorize) ───

from fastapi.responses import HTMLResponse


class InstagramExchangeRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


class InstagramSaveRequest(BaseModel):
    nickname: str
    username: str
    user_id: str
    access_token: str
    avatar_url: Optional[str] = None


@router.get("/direct/url")
def get_instagram_direct_oauth_url(redirect_uri: Optional[str] = None, db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    public_base = get_config_val(db, "public_media_base_url")

    # Resolver redirect_uri seguro (HTTPS se configurado ou repassado)
    target_redirect = redirect_uri
    if public_base:
        target_redirect = f"{public_base.rstrip('/')}/api/auth/meta/callback"
    elif not target_redirect:
        target_redirect = "http://localhost:8000/api/auth/meta/callback"

    scopes = [
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
        "instagram_business_content_publish",
        "instagram_business_manage_insights",
    ]
    scope_str = ",".join(scopes)
    
    # Endpoint oficial direto da API do Instagram
    auth_url = (
        f"https://api.instagram.com/oauth/authorize"
        f"?enable_fb_login=0"
        f"&force_authentication=1"
        f"&client_id={app_id}"
        f"&redirect_uri={target_redirect}"
        f"&response_type=code"
        f"&scope={scope_str}"
    )
    return {
        "auth_url": auth_url,
        "app_id": app_id,
        "redirect_uri": target_redirect,
        "logout_url": "https://www.instagram.com/accounts/logout/",
    }


@router.get("/callback", response_class=HTMLResponse)
def instagram_oauth_callback(code: Optional[str] = None, error: Optional[str] = None, error_description: Optional[str] = None):
    """Callback HTML leve que envia o código para a janela principal e fecha o popup automaticamente."""
    if error or not code:
        err_msg = error_description or error or "Autorização cancelada."
        return f"""
        <!DOCTYPE html>
        <html>
        <head><title>Autorização Instagram</title></head>
        <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
            <h2 style="color: #e11d48;">Erro na autorização</h2>
            <p style="color: #666;">{err_msg}</p>
            <script>
                if (window.opener) {{
                    window.opener.postMessage({{ type: 'IG_OAUTH_ERROR', error: '{err_msg}' }}, '*');
                }}
                setTimeout(() => window.close(), 2500);
            </script>
        </body>
        </html>
        """

    # Sucesso: envia código e fecha
    return f"""
    <!DOCTYPE html>
    <html>
    <head><title>Instagram Conectado</title></head>
    <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #000; color: #fff;">
        <div style="text-align: center;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#0084FF" style="margin-bottom: 12px;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <h3 style="margin: 0 0 8px 0; font-size: 16px;">Conectado com sucesso!</h3>
            <p style="color: #888; font-size: 13px; margin: 0;">Retornando ao ViralDog...</p>
        </div>
        <script>
            if (window.opener) {{
                window.opener.postMessage({{ type: 'IG_OAUTH_SUCCESS', code: '{code}' }}, '*');
            }}
            window.close();
        </script>
    </body>
    </html>
    """


@router.post("/direct/exchange")
def exchange_instagram_direct_token(req: InstagramExchangeRequest, db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id")
    app_secret = get_config_val(db, "meta_app_secret")

    if not app_id or not app_secret:
        raise HTTPException(
            status_code=400,
            detail="Meta App ID e App Secret são necessários nas Configurações.",
        )

    # 1. Trocar código por short-lived token em api.instagram.com
    token_url = "https://api.instagram.com/oauth/access_token"
    data = {
        "client_id": app_id,
        "client_secret": app_secret,
        "grant_type": "authorization_code",
        "redirect_uri": req.redirect_uri or "http://localhost:8000/api/auth/meta/callback",
        "code": req.code,
    }

    res = requests.post(token_url, data=data, timeout=20)
    if res.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao trocar código no Instagram: {res.text}",
        )

    token_data = res.json()
    short_token = token_data.get("access_token")
    user_id = str(token_data.get("user_id", ""))

    if not short_token:
        raise HTTPException(status_code=400, detail="Token não retornado pelo Instagram.")

    # 2. Obter Long-Lived Token (60 dias)
    long_lived_token = short_token
    try:
        ll_res = requests.get(
            "https://graph.instagram.com/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": app_secret,
                "access_token": short_token,
            },
            timeout=15,
        )
        if ll_res.status_code == 200:
            ll_data = ll_res.json()
            long_lived_token = ll_data.get("access_token", short_token)
    except Exception as e:
        print(f"Aviso ao trocar por token de 60 dias: {e}")

    # 3. Buscar perfil do usuário no Instagram Graph API
    profile_res = requests.get(
        "https://graph.instagram.com/v19.0/me",
        params={
            "fields": "user_id,username,name,profile_picture_url",
            "access_token": long_lived_token,
        },
        timeout=15,
    )

    username = "instagram_user"
    display_name = ""
    avatar_url = ""

    if profile_res.status_code == 200:
        pdata = profile_res.json()
        username = pdata.get("username", username)
        display_name = pdata.get("name") or username
        avatar_url = pdata.get("profile_picture_url", "")
        user_id = str(pdata.get("user_id") or pdata.get("id") or user_id)

    return {
        "status": "success",
        "user_id": user_id,
        "username": username,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "access_token": long_lived_token,
    }


@router.post("/direct/save")
def save_instagram_account(req: InstagramSaveRequest, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.username == req.username).first()
    
    if not acc:
        acc = Account(
            username=req.username,
            display_name=req.nickname.strip() or req.username,
            status="active",
            folder="Geral",
            platform="instagram",
        )
        db.add(acc)

    acc.display_name = req.nickname.strip() or req.username
    acc.auth_mode = "official"
    acc.fb_access_token = req.access_token
    acc.fb_ig_account_id = req.user_id
    acc.instagram_user_id = req.user_id
    if req.avatar_url:
        acc.avatar_url = req.avatar_url
    acc.status = "active"

    db.commit()
    db.refresh(acc)

    return {
        "status": "success",
        "message": f"Conta @{acc.username} salva com sucesso!",
        "account_id": acc.id,
        "username": acc.username,
        "display_name": acc.display_name,
        "avatar_url": acc.avatar_url,
        "auth_mode": acc.auth_mode,
    }

