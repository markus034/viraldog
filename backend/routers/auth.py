"""
Authentication and OAuth endpoints for Meta / Instagram Graph API v22.0.
Supports:
- Meta Facebook Login OAuth flow (/auth/login and /auth/callback)
- Deauthorization Webhook (POST /webhooks/deauthorize)
- Data Deletion Callback (POST /webhooks/data-deletion)
- Instagram Direct Login fallback
"""
import os
import secrets
import base64
import hashlib
import hmac
import json
import requests
import jwt
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, Config, Account, Post, User

router = APIRouter(tags=["auth_meta"])

# App ID e Client ID oficiais obtidos no painel do Meta for Developers (Instagram Login)
DEFAULT_META_APP_ID = "1313148545209043"
META_BUSINESS_APP_ID = "1532052538134583"
OAUTH_STATE_CACHE = {}  # {state: {"owner_user_id": str, "redirect_uri": str, "flow": str, "expires_at": datetime}}
JWT_SECRET = os.getenv("JWT_SECRET", "viraldog_super_secret_jwt_key_2026_safe")
JWT_ALGORITHM = "HS256"


# ─── User Authentication Utilities & Handlers ───

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return f"{salt}:{pw_hash}"


def verify_password(password: str, hashed: str) -> bool:
    if not hashed or ":" not in hashed:
        return False
    salt, original_hash = hashed.split(":", 1)
    new_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return hmac.compare_digest(new_hash, original_hash)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=30))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "").strip()
    elif request.query_params.get("token"):
        token = request.query_params.get("token")

    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except Exception:
        return None


class UserRegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class UserLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/api/auth/register")
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="E-mail inválido.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres.")
    
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado no ViralDog.")
    
    new_user = User(
        email=email,
        password_hash=hash_password(req.password),
        name=req.name or email.split("@")[0],
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id), "email": new_user.email})
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name
        }
    }


@router.post("/api/auth/login")
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada.")

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name
        }
    }


@router.get("/api/auth/me")
def get_me(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name
    }



def get_config_val(db: Session, key: str, default: str = "") -> str:
    env_val = os.getenv(key.upper()) or os.getenv(key)
    if env_val:
        return env_val.strip()
    cfg = db.query(Config).filter(Config.key == key).first()
    return cfg.value.strip() if cfg and cfg.value else default


def parse_signed_request(signed_request: str, secret: str) -> Optional[dict]:
    """Decodes and validates a Meta signed_request payload using HMAC-SHA256."""
    try:
        if "." not in signed_request:
            return None
        encoded_sig, payload = signed_request.split(".", 1)
        # Base64url decode signature
        sig = base64.urlsafe_b64decode(encoded_sig + "=" * (-len(encoded_sig) % 4))
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode("utf-8"))

        # Verify signature if secret provided
        if secret:
            expected_sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
            if not hmac.compare_digest(sig, expected_sig):
                print("[Meta Webhook] Assinatura HMAC inválida no signed_request.")
                return None
        return data
    except Exception as e:
        print(f"[Meta Webhook] Erro ao decodificar signed_request: {e}")
        return None


# ─── Pydantic Request Models ───

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


class StorageTestRequest(BaseModel):
    s3_endpoint_url: Optional[str] = None
    s3_bucket_name: Optional[str] = None
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_public_base_url: Optional[str] = None


# ─── Settings / Configuration Endpoints ───

@router.get("/api/auth/meta/config")
def get_meta_config(db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    app_secret = get_config_val(db, "meta_app_secret")
    redirect_uri = get_config_val(db, "meta_redirect_uri")
    public_base_url = get_config_val(db, "public_media_base_url")
    return {
        "meta_app_id": app_id,
        "has_app_secret": bool(app_secret),
        "meta_redirect_uri": redirect_uri,
        "public_media_base_url": public_base_url,
    }


@router.post("/api/settings/test-storage")
def test_storage(req: StorageTestRequest, db: Session = Depends(get_db)):
    from cloud_storage import test_storage_connection
    custom_cfg = req.dict(exclude_none=True)
    res = test_storage_connection(custom_config=custom_cfg, db=db)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


# ─── Official Meta OAuth 2.0 Flow (v22.0) ───

def _resolve_redirect_uri(request: Request, db: Session, client_redirect: Optional[str] = None) -> str:
    if client_redirect:
        return client_redirect
    configured = get_config_val(db, "meta_redirect_uri")
    if configured:
        return configured
    # Fallback para host da requisição atual
    host = request.headers.get("host", "localhost:8000")
    scheme = "https" if "https" in request.headers.get("x-forwarded-proto", "") else ("http" if "localhost" in host or "127.0.0.1" in host else "https")
    return f"{scheme}://{host}/auth/callback"


@router.get("/auth/login")
@router.get("/api/auth/meta/login")
def meta_login(
    request: Request,
    owner_user_id: str = "default",
    redirect_uri: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Step 1 of OAuth Flow:
    Generates CSRF state and redirects user to Meta Facebook Login dialog.
    """
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    if not app_id:
        raise HTTPException(status_code=400, detail="Meta App ID não configurado nas Configurações.")

    target_redirect = _resolve_redirect_uri(request, db, redirect_uri)

    # Clean old states
    now = datetime.utcnow()
    for st in list(OAUTH_STATE_CACHE.keys()):
        if OAUTH_STATE_CACHE[st]["expires_at"] < now:
            OAUTH_STATE_CACHE.pop(st, None)

    state = secrets.token_urlsafe(24)
    OAUTH_STATE_CACHE[state] = {
        "owner_user_id": owner_user_id,
        "redirect_uri": target_redirect,
        "expires_at": now + timedelta(minutes=15)
    }

    flow = request.query_params.get("flow", "instagram")
    if flow == "instagram":
        scopes = ["instagram_business_basic", "instagram_business_content_publish"]
        scope_str = ",".join(scopes)
        auth_url = (
            f"https://www.instagram.com/oauth/authorize"
            f"?force_reauth=true"
            f"&client_id={app_id}"
            f"&redirect_uri={requests.utils.quote(target_redirect, safe='')}"
            f"&response_type=code"
            f"&scope={scope_str}"
            f"&state={state}"
        )
    else:
        scopes = [
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
            "business_management",
        ]
        scope_str = ",".join(scopes)
        auth_url = (
            f"https://www.facebook.com/v22.0/dialog/oauth"
            f"?client_id={app_id}"
            f"&redirect_uri={requests.utils.quote(target_redirect, safe='')}"
            f"&scope={scope_str}"
            f"&response_type=code"
            f"&state={state}"
        )

    return RedirectResponse(url=auth_url)


@router.get("/api/auth/meta/url")
def get_meta_oauth_url(
    request: Request,
    owner_user_id: Optional[str] = None,
    redirect_uri: Optional[str] = None,
    flow: Optional[str] = "instagram",
    db: Session = Depends(get_db)
):
    """Returns the auth URL as JSON for frontend modals/popups (default: Instagram Login direto)."""
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    if not app_id:
        raise HTTPException(status_code=400, detail="Meta App ID não configurado.")

    user = get_current_user(request, db)
    effective_user_id = str(user.id) if user else (owner_user_id or "default")

    target_redirect = _resolve_redirect_uri(request, db, redirect_uri)
    state = secrets.token_urlsafe(24)
    selected_flow = flow or request.query_params.get("flow", "instagram")
    OAUTH_STATE_CACHE[state] = {
        "owner_user_id": effective_user_id,
        "redirect_uri": target_redirect,
        "flow": selected_flow,
        "expires_at": datetime.utcnow() + timedelta(minutes=15)
    }

    if selected_flow == "instagram":
        scopes = ["instagram_business_basic", "instagram_business_content_publish"]
        scope_str = ",".join(scopes)
        auth_url = (
            f"https://www.instagram.com/oauth/authorize"
            f"?force_reauth=true"
            f"&client_id={app_id}"
            f"&redirect_uri={requests.utils.quote(target_redirect, safe='')}"
            f"&response_type=code"
            f"&scope={scope_str}"
            f"&state={state}"
        )
    else:
        scopes = [
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
            "business_management",
        ]
        scope_str = ",".join(scopes)
        auth_url = (
            f"https://www.facebook.com/v22.0/dialog/oauth"
            f"?client_id={app_id}"
            f"&redirect_uri={requests.utils.quote(target_redirect, safe='')}"
            f"&scope={scope_str}"
            f"&response_type=code"
            f"&state={state}"
        )
    return {"auth_url": auth_url, "state": state, "redirect_uri": target_redirect, "flow": selected_flow}


@router.get("/auth/callback", response_class=HTMLResponse)
@router.get("/api/auth/meta/callback", response_class=HTMLResponse)
def meta_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Step 2 of OAuth Flow:
    Handles code exchange, long-lived token extension, pages/IG account discovery,
    and automatic database persistence.
    """
    def _render_error_html(msg: str):
        return f"""<!DOCTYPE html>
        <html><head><title>Erro na Autorização — ViralDog</title></head>
        <body style="background:#090a0f; color:#f43f5e; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0;">
            <div style="background:#12151f; border:1px solid #27272a; padding:32px; border-radius:12px; max-width:480px; text-align:center;">
                <h3 style="margin-top:0;">Falha na Conexão com a Meta</h3>
                <p style="color:#a1a1aa; font-size:14px;">{msg}</p>
                <script>
                    if (window.opener) {{
                        window.opener.postMessage({{ type: 'META_OAUTH_ERROR', error: '{msg}' }}, '*');
                    }}
                    setTimeout(() => window.close(), 3500);
                </script>
            </div>
        </body></html>"""

    if error or not code:
        msg = error_description or error or "Autorização cancelada pelo usuário."
        return _render_error_html(msg)

    # 1. Validar State
    owner_user_id = "default"
    saved_redirect = None
    flow = "instagram"
    if state and state in OAUTH_STATE_CACHE:
        state_info = OAUTH_STATE_CACHE.pop(state)
        owner_user_id = state_info.get("owner_user_id", "default")
        saved_redirect = state_info.get("redirect_uri")
        flow = state_info.get("flow", "instagram")

    target_redirect = saved_redirect or _resolve_redirect_uri(request, db)

    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    app_secret = get_config_val(db, "meta_app_secret")
    if not app_secret:
        return _render_error_html("Meta App Secret não configurado no ViralDog. Configure nas Definições antes de conectar.")

    # Se o fluxo for do Instagram Login direto, tenta via api.instagram.com
    if flow == "instagram":
        ig_token_data = {
            "client_id": app_id,
            "client_secret": app_secret,
            "grant_type": "authorization_code",
            "redirect_uri": target_redirect,
            "code": code,
        }
        res_ig = requests.post("https://api.instagram.com/oauth/access_token", data=ig_token_data, timeout=15)
        if res_ig.status_code == 200:
            ig_json = res_ig.json()
            short_token = ig_json.get("access_token")
            ig_user_id = str(ig_json.get("user_id", ""))

            # Obter token de longa duração (~60 dias)
            ll_res = requests.get(
                "https://graph.instagram.com/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": app_secret,
                    "access_token": short_token,
                },
                timeout=15,
            )
            long_lived_token = short_token
            expires_in_sec = 5184000
            if ll_res.status_code == 200:
                ll_json = ll_res.json()
                long_lived_token = ll_json.get("access_token", short_token)
                expires_in_sec = int(ll_json.get("expires_in", 5184000))

            token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in_sec)

            # Buscar perfil do Instagram
            me_res = requests.get(
                "https://graph.instagram.com/v22.0/me",
                params={
                    "fields": "user_id,username,name,profile_picture_url,account_type",
                    "access_token": long_lived_token,
                },
                timeout=15,
            )
            ig_user_data = me_res.json() if me_res.status_code == 200 else {}
            ig_username = ig_user_data.get("username") or f"ig_{ig_user_id}"
            ig_name = ig_user_data.get("name") or ig_username
            ig_avatar = ig_user_data.get("profile_picture_url")

            account = db.query(Account).filter(Account.username == ig_username).first()
            if not account and ig_user_id:
                account = db.query(Account).filter(Account.fb_ig_account_id == ig_user_id).first()

            if not account:
                account = Account(username=ig_username)
                db.add(account)

            account.display_name = ig_name
            account.avatar_url = ig_avatar or account.avatar_url
            account.status = "active"
            account.auth_mode = "official_api"
            account.fb_access_token = long_lived_token
            account.fb_ig_account_id = ig_user_id
            account.fb_token_expires_at = token_expires_at
            if hasattr(account, 'owner_user_id'):
                account.owner_user_id = owner_user_id

            db.commit()
            db.refresh(account)

            # Retorno de sucesso com Deep Link
            first_username = account.username
            deep_link_url = f"viraldog://auth/callback?status=success&username={first_username}&count=1"
            return HTMLResponse(f"""<!DOCTYPE html>
            <html><head><title>Instagram Conectado — ViralDog</title></head>
            <body style="background:#090a0f; color:#10b981; font-family:-apple-system,BlinkMacSystemFont,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center;">
                <div style="background:#12151f; border:1px solid #27272a; padding:40px; border-radius:16px; max-width:440px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
                    <div style="font-size:48px; margin-bottom:16px;">🎉</div>
                    <h2 style="color:#ffffff; margin:0 0 8px 0; font-size:20px;">Conta Conectada com Sucesso!</h2>
                    <p style="color:#a1a1aa; font-size:14px; margin-bottom:24px;">Sua conta <strong>@{first_username}</strong> foi vinculada via Instagram API Oficial.</p>
                    <a href="{deep_link_url}" style="display:inline-block; background:#0071E3; color:#fff; padding:12px 24px; border-radius:10px; text-decoration:none; font-weight:bold; font-size:13px;">Voltar para o ViralDog</a>
                    <script>
                        try {{ window.location.href = '{deep_link_url}'; }} catch(e) {{}}
                        if (window.opener) {{
                            window.opener.postMessage({{
                                type: 'META_OAUTH_SUCCESS',
                                accounts: [{{"id": {account.id}, "username": "{account.username}", "name": "{account.display_name}"}}]
                            }}, '*');
                        }}
                        setTimeout(() => window.close(), 3000);
                    </script>
                </div>
            </body></html>""")

    # 2. Fluxo Tradicional Facebook: Trocar code por token curto
    token_url = "https://graph.facebook.com/v22.0/oauth/access_token"
    token_params = {
        "client_id": app_id,
        "client_secret": app_secret,
        "redirect_uri": target_redirect,
        "code": code,
    }
    res_short = requests.get(token_url, params=token_params, timeout=15)
    if res_short.status_code != 200:
        return _render_error_html(f"Erro ao obter token da Meta: {res_short.text}")

    short_token_data = res_short.json()
    short_token = short_token_data.get("access_token")

    # 3. Trocar token curto por token de longa duração (~60 dias)
    ll_params = {
        "grant_type": "fb_exchange_token",
        "client_id": app_id,
        "client_secret": app_secret,
        "fb_exchange_token": short_token,
    }
    res_ll = requests.get(token_url, params=ll_params, timeout=15)
    long_lived_token = short_token
    expires_in_sec = 5184000  # Default 60 dias
    if res_ll.status_code == 200:
        ll_data = res_ll.json()
        long_lived_token = ll_data.get("access_token", short_token)
        expires_in_sec = int(ll_data.get("expires_in", 5184000))

    token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in_sec)

    # 4. Buscar as Páginas do Facebook do usuário: GET /me/accounts
    pages_res = requests.get(
        "https://graph.facebook.com/v22.0/me/accounts",
        params={
            "fields": "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
            "access_token": long_lived_token,
        },
        timeout=15,
    )

    if pages_res.status_code != 200:
        return _render_error_html(f"Erro ao buscar Páginas do Facebook: {pages_res.text}")

    pages_data = pages_res.json().get("data", [])
    connected_accounts = []

    for page in pages_data:
        page_id = page.get("id")
        page_name = page.get("name")
        page_access_token = page.get("access_token") or long_lived_token
        ig_biz = page.get("instagram_business_account")

        if not ig_biz:
            # Tenta buscar diretamente pelo ID da página caso não tenha vindo aninhado
            ig_check = requests.get(
                f"https://graph.facebook.com/v22.0/{page_id}",
                params={"fields": "instagram_business_account", "access_token": page_access_token},
                timeout=10,
            )
            if ig_check.status_code == 200:
                ig_biz = ig_check.json().get("instagram_business_account")

        if ig_biz and ig_biz.get("id"):
            ig_id = str(ig_biz.get("id"))
            # Buscar detalhes do perfil
            ig_username = ig_biz.get("username")
            ig_name = ig_biz.get("name")
            ig_avatar = ig_biz.get("profile_picture_url")

            if not ig_username:
                info_res = requests.get(
                    f"https://graph.facebook.com/v22.0/{ig_id}",
                    params={"fields": "username,name,profile_picture_url", "access_token": page_access_token},
                    timeout=10,
                )
                if info_res.status_code == 200:
                    idata = info_res.json()
                    ig_username = idata.get("username")
                    ig_name = idata.get("name") or ig_username
                    ig_avatar = idata.get("profile_picture_url")

            final_username = ig_username or f"ig_{ig_id}"

            # 7. Salvar / Atualizar no banco de dados
            acc = db.query(Account).filter(
                (Account.ig_user_id == ig_id) | (Account.username == final_username)
            ).first()

            if not acc:
                acc = Account(
                    username=final_username,
                    display_name=ig_name or final_username,
                    status="active",
                    folder="Geral",
                    platform="instagram",
                )
                db.add(acc)

            acc.owner_user_id = owner_user_id
            acc.ig_user_id = ig_id
            acc.ig_username = final_username
            acc.username = final_username
            acc.fb_page_id = page_id
            acc.fb_page_name = page_name
            acc.access_token = page_access_token
            acc.fb_access_token = page_access_token
            acc.fb_ig_account_id = ig_id
            acc.instagram_user_id = ig_id
            acc.token_expires_at = token_expires_at
            acc.connected_at = datetime.utcnow()
            acc.auth_mode = "official"
            acc.status = "active"
            acc.revoked = False
            if ig_avatar:
                acc.avatar_url = ig_avatar
            if ig_name:
                acc.display_name = ig_name

            db.commit()
            db.refresh(acc)

            connected_accounts.append({
                "id": acc.id,
                "username": acc.username,
                "display_name": acc.display_name,
                "ig_user_id": acc.ig_user_id,
                "fb_page_name": acc.fb_page_name,
                "avatar_url": acc.avatar_url,
            })

    if not connected_accounts:
        return _render_error_html(
            "Nenhuma Conta Profissional do Instagram (Business ou Creator) vinculada às suas Páginas do Facebook foi encontrada. "
            "Certifique-se de que sua conta do Instagram é Profissional e está vinculada a uma Página do Facebook."
        )

    # 8. Sucesso! Notificar a janela principal
    accounts_json = json.dumps(connected_accounts)
    accounts_summary = ", ".join([f"@{a['username']}" for a in connected_accounts])

    return f"""<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Instagram Conectado com Sucesso</title>
        <style>
            body {{
                background: #090a0f;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }}
            .card {{
                background: #12151f;
                border: 1px solid #1e2433;
                border-radius: 16px;
                padding: 40px 32px;
                max-width: 440px;
                text-align: center;
                box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            }}
            .icon {{
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 32px;
                margin-bottom: 20px;
            }}
            h2 {{ margin: 0 0 8px 0; font-size: 20px; }}
            p {{ color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 20px 0; }}
            .acc-badge {{
                display: inline-block;
                background: #1e2433;
                padding: 6px 14px;
                border-radius: 999px;
                font-size: 13px;
                font-weight: 600;
                color: #38bdf8;
                margin-bottom: 20px;
            }}
            .btn-open {{
                display: inline-block;
                background: #0071e3;
                color: #ffffff;
                font-size: 14px;
                font-weight: 600;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 12px;
                box-shadow: 0 4px 14px rgba(0,113,227,0.3);
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">✓</div>
            <h2>Conta Conectada!</h2>
            <div class="acc-badge">{accounts_summary}</div>
            <p>Sua conta oficial da Meta foi autorizada e sincronizada com o ViralDog com sucesso.</p>
            <div>
                <a id="deepLinkBtn" href="viraldog://auth/callback?status=success" class="btn-open">
                    Abrir ViralDog Desktop
                </a>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 18px; margin-bottom: 0;">Redirecionando de volta ao app...</p>
        </div>
        <script>
            const accounts = {accounts_json};
            const firstUser = accounts[0] ? accounts[0].username : '';
            const deepLinkUri = 'viraldog://auth/callback?status=success&username=' + encodeURIComponent(firstUser);
            
            // Tenta abrir direto no executável Desktop
            try {{
                window.location.href = deepLinkUri;
            }} catch (e) {{}}

            if (window.opener) {{
                window.opener.postMessage({{
                    type: 'META_OAUTH_SUCCESS',
                    status: 'success',
                    accounts: accounts
                }}, '*');
            }}
            setTimeout(() => {{
                if (window.opener) window.close();
            }}, 2500);
        </script>
    </body>
    </html>"""


# ─── Meta Webhooks (Deauthorization & Data Deletion) ───

@router.post("/webhooks/deauthorize")
async def meta_deauthorize_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Mandatory Meta Webhook:
    Called when a user revokes access to ViralDog inside Facebook/Instagram settings.
    Decodes signed_request, marks account as revoked, and cancels pending posts.
    """
    signed_request = None

    # Check form-data or JSON body
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        signed_request = form.get("signed_request")
    else:
        try:
            body = await request.json()
            signed_request = body.get("signed_request")
        except Exception:
            pass

    if not signed_request:
        raise HTTPException(status_code=400, detail="signed_request ausente no webhook.")

    app_secret = get_config_val(db, "meta_app_secret")
    payload = parse_signed_request(signed_request, app_secret)

    if not payload:
        raise HTTPException(status_code=400, detail="signed_request inválido.")

    user_id = payload.get("user_id")
    print(f"[Meta Webhook] Desautorização recebida para Meta user_id: {user_id}")

    if user_id:
        user_id_str = str(user_id)
        # Encontrar contas associadas ao ID da Meta
        accounts = db.query(Account).filter(
            (Account.ig_user_id == user_id_str) |
            (Account.fb_ig_account_id == user_id_str) |
            (Account.instagram_user_id == user_id_str) |
            (Account.fb_page_id == user_id_str)
        ).all()

        for acc in accounts:
            acc.revoked = True
            acc.status = "revoked"
            print(f"[Meta Webhook] Conta @{acc.username} marcada como revogada.")

            # Pausar posts pendentes da conta
            pending_posts = db.query(Post).filter(
                Post.status == "pending",
                (Post.account_username == acc.username) | (Post.ig_user_id == acc.ig_user_id)
            ).all()

            for post in pending_posts:
                post.status = "failed"
                post.error_message = "Conta desautorizada na Meta. Reconecte a conta para restabelecer os agendamentos."

        db.commit()

    return {"status": "success", "message": "Desautorização processada com sucesso."}


@router.post("/webhooks/data-deletion")
async def meta_data_deletion_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Mandatory Meta Data Deletion Request Callback:
    Returns confirmation code and tracking URL as required by Meta Platform Policy.
    """
    signed_request = None
    content_type = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        signed_request = form.get("signed_request")
    else:
        try:
            body = await request.json()
            signed_request = body.get("signed_request")
        except Exception:
            pass

    app_secret = get_config_val(db, "meta_app_secret")
    payload = parse_signed_request(signed_request, app_secret) if signed_request else {}

    user_id = payload.get("user_id", "unknown") if payload else "unknown"
    confirmation_code = f"del_{secrets.token_hex(8)}"

    print(f"[Meta Webhook] Solicitação de exclusão de dados recebida para user_id: {user_id}. Código: {confirmation_code}")

    if user_id != "unknown":
        user_id_str = str(user_id)
        accounts = db.query(Account).filter(
            (Account.ig_user_id == user_id_str) |
            (Account.fb_ig_account_id == user_id_str) |
            (Account.instagram_user_id == user_id_str)
        ).all()
        for acc in accounts:
            acc.revoked = True
            acc.status = "deleted"
            acc.access_token = None
            acc.fb_access_token = None
            acc.session_cookies = None
        db.commit()

    host = request.headers.get("host", "localhost:8000")
    scheme = "https" if "https" in request.headers.get("x-forwarded-proto", "") else ("http" if "localhost" in host else "https")
    tracking_url = f"{scheme}://{host}/exclusao-de-dados?code={confirmation_code}"

    return JSONResponse(content={
        "url": tracking_url,
        "confirmation_code": confirmation_code
    })


# ─── Instagram Direct Login Endpoints (Retrocompatibilidade) ───

class InstagramExchangeRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


class InstagramSaveRequest(BaseModel):
    nickname: str
    username: str
    user_id: str
    access_token: str
    avatar_url: Optional[str] = None


@router.get("/api/auth/meta/direct/url")
def get_instagram_direct_oauth_url(redirect_uri: Optional[str] = None, db: Session = Depends(get_db)):
    app_id = get_config_val(db, "meta_app_id", DEFAULT_META_APP_ID)
    public_base = get_config_val(db, "public_media_base_url")

    target_redirect = redirect_uri
    if public_base:
        target_redirect = f"{public_base.rstrip('/')}/auth/callback"
    elif not target_redirect:
        target_redirect = "http://localhost:8000/auth/callback"

    scopes = [
        "instagram_business_basic",
        "instagram_business_content_publish",
    ]
    scope_str = ",".join(scopes)
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
    }


@router.post("/api/auth/meta/direct/save")
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
    acc.access_token = req.access_token
    acc.fb_access_token = req.access_token
    acc.fb_ig_account_id = req.user_id
    acc.ig_user_id = req.user_id
    acc.instagram_user_id = req.user_id
    acc.revoked = False
    acc.status = "active"
    if req.avatar_url:
        acc.avatar_url = req.avatar_url

    db.commit()
    db.refresh(acc)
    return {
        "status": "success",
        "message": f"Conta @{acc.username} salva com sucesso!",
        "account_id": acc.id,
        "username": acc.username,
    }
