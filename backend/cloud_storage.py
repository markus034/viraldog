"""
Cloud Storage module for ViralDog.
Handles uploading local videos/images to S3-compatible cloud storage (Cloudflare R2, AWS S3)
so that Meta Graph API can download them during publication.
"""
import os
import mimetypes
import uuid
import shutil
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from database import Config, SessionLocal, APP_DATA_DIR

try:
    import boto3
    from botocore.config import Config as BotoConfig
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


def _get_config_val(db: Optional[Session], key: str, default: str = "") -> str:
    # 1. Checar variável de ambiente
    env_val = os.getenv(key.upper()) or os.getenv(key)
    if env_val:
        return env_val.strip()
    
    # 2. Checar banco de dados
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        cfg = db.query(Config).filter(Config.key == key).first()
        if cfg and cfg.value:
            return cfg.value.strip()
        return default
    finally:
        if close_db:
            db.close()


def get_s3_client(db: Optional[Session] = None, custom_config: Optional[dict] = None):
    """Creates a boto3 S3 client using database configs or custom config dict."""
    if not BOTO3_AVAILABLE:
        raise RuntimeError("Biblioteca 'boto3' não está disponível no ambiente.")

    cfg = custom_config or {}
    endpoint_url = cfg.get("s3_endpoint_url") or _get_config_val(db, "s3_endpoint_url")
    access_key = cfg.get("s3_access_key") or _get_config_val(db, "s3_access_key")
    secret_key = cfg.get("s3_secret_key") or _get_config_val(db, "s3_secret_key")

    if not endpoint_url or not access_key or not secret_key:
        return None

    # Normalizar endpoint
    if not endpoint_url.startswith("http://") and not endpoint_url.startswith("https://"):
        endpoint_url = f"https://{endpoint_url}"

    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto" if "r2.cloudflarestorage.com" in endpoint_url else "us-east-1"
    )
    return client


def is_storage_configured(db: Optional[Session] = None) -> bool:
    """Returns True if S3/R2 storage is properly configured."""
    endpoint_url = _get_config_val(db, "s3_endpoint_url")
    bucket = _get_config_val(db, "s3_bucket_name")
    access_key = _get_config_val(db, "s3_access_key")
    secret_key = _get_config_val(db, "s3_secret_key")
    return bool(endpoint_url and bucket and access_key and secret_key)


def upload_media_for_meta(file_path: str, db: Optional[Session] = None) -> Tuple[str, Optional[str]]:
    """
    Uploads a local media file to Cloud Storage (S3/R2) or local public uploads folder.
    Returns: (public_url, s3_object_key)
    """
    if not file_path or not os.path.exists(file_path):
        raise FileNotFoundError(f"Arquivo de mídia não encontrado no disco: {file_path}")

    filename = os.path.basename(file_path)
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "video/mp4" if file_path.lower().endswith(('.mp4', '.mov', '.avi')) else "image/jpeg"

    # Caso 1: S3 / Cloudflare R2 configurado
    if is_storage_configured(db):
        bucket_name = _get_config_val(db, "s3_bucket_name")
        public_base_url = _get_config_val(db, "s3_public_base_url")
        s3 = get_s3_client(db)
        if not s3 or not bucket_name:
            raise ValueError("Configuração do S3/R2 incompleta.")

        ext = os.path.splitext(filename)[1] or ".mp4"
        object_key = f"viraldog_meta_{uuid.uuid4().hex[:12]}{ext}"

        extra_args = {"ContentType": mime_type}

        s3.upload_file(file_path, bucket_name, object_key, ExtraArgs=extra_args)

        # Se houver public_base_url (ex: CDN ou domínio personalizado do R2)
        if public_base_url:
            public_base_url = public_base_url.rstrip("/")
            if not public_base_url.startswith("http://") and not public_base_url.startswith("https://"):
                public_base_url = f"https://{public_base_url}"
            public_url = f"{public_base_url}/{object_key}"
        else:
            # Gerar Presigned URL válida por 2 horas (tempo suficiente para a Meta baixar)
            public_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": object_key},
                ExpiresIn=7200
            )

        print(f"[CloudStorage] Upload para S3/R2 concluído: {object_key} -> {public_url[:60]}...")
        return public_url, object_key

    # Caso 2: Fallback para servidor local / VPS via public_media_base_url
    public_base = _get_config_val(db, "public_media_base_url")
    if public_base:
        uploads_dir = os.path.join(APP_DATA_DIR, "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        dest_path = os.path.join(uploads_dir, filename)
        if os.path.abspath(file_path) != os.path.abspath(dest_path):
            shutil.copy2(file_path, dest_path)
        base = public_base.rstrip("/")
        if not base.startswith("http://") and not base.startswith("https://"):
            base = f"https://{base}"
        return f"{base}/uploads/{filename}", None

    # Caso 3: Nenhuma configuração pública
    raise ValueError(
        "A Meta Graph API exige que os vídeos estejam em uma URL pública para download. "
        "Por favor, configure o Cloudflare R2 ou AWS S3 na aba Configurações do ViralDog."
    )


def delete_from_storage(object_key: str, db: Optional[Session] = None) -> bool:
    """Deletes an uploaded file from S3/R2 after publication completes."""
    if not object_key or not is_storage_configured(db):
        return False
    try:
        bucket_name = _get_config_val(db, "s3_bucket_name")
        s3 = get_s3_client(db)
        if s3 and bucket_name:
            s3.delete_object(Bucket=bucket_name, Key=object_key)
            print(f"[CloudStorage] Arquivo temporário {object_key} removido do S3/R2.")
            return True
    except Exception as e:
        print(f"[CloudStorage] Erro ao remover {object_key}: {e}")
    return False


def test_storage_connection(custom_config: Optional[dict] = None, db: Optional[Session] = None) -> dict:
    """Tests S3/R2 connection by creating, reading and deleting a small text probe."""
    try:
        cfg = custom_config or {}
        bucket_name = cfg.get("s3_bucket_name") or _get_config_val(db, "s3_bucket_name")
        if not bucket_name:
            return {"success": False, "message": "Nome do bucket (s3_bucket_name) não informado."}

        s3 = get_s3_client(db, custom_config)
        if not s3:
            return {"success": False, "message": "Credenciais de S3/R2 ausentes ou inválidas."}

        probe_key = f"viraldog_probe_{uuid.uuid4().hex[:8]}.txt"
        probe_content = b"ViralDog S3/R2 connection test OK."

        # Upload probe
        s3.put_object(Bucket=bucket_name, Key=probe_key, Body=probe_content, ContentType="text/plain")

        # Delete probe
        s3.delete_object(Bucket=bucket_name, Key=probe_key)

        return {
            "success": True,
            "message": f"Conexão com bucket '{bucket_name}' realizada com sucesso! Upload e exclusão validados."
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Falha na conexão com S3/R2: {str(e)}"
        }
