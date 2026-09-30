import os
import shutil
import json
import zipfile
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from database import APP_DATA_DIR, SessionLocal, Config
from schemas import ExtensionToggleRequest
from routers.auth import get_current_user

router = APIRouter(prefix="/api/extensions", tags=["extensions"])

USER_EXTENSIONS_DIR = os.path.join(APP_DATA_DIR, "extensions")
os.makedirs(USER_EXTENSIONS_DIR, exist_ok=True)

# Diretório de extensões embutidas no projeto (dev ou packaged)
BUILTIN_EXTENSIONS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "electron", "extensions"))


def _get_extension_info(ext_dir: str, ext_id: str) -> Optional[Dict[str, Any]]:
    manifest_path = os.path.join(ext_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        return None

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        name = manifest.get("name", ext_id)
        version = manifest.get("version", "1.0.0")
        description = manifest.get("description", "Extensão do navegador")

        return {
            "id": ext_id,
            "name": name,
            "version": version,
            "description": description,
            "path": ext_dir,
            "is_builtin": ext_dir.startswith(BUILTIN_EXTENSIONS_DIR)
        }
    except Exception as e:
        print(f"Erro ao ler manifesto da extensão {ext_id}: {e}")
        return None


def _get_global_disabled_extensions() -> List[str]:
    db = SessionLocal()
    try:
        cfg = db.query(Config).filter(Config.key == "disabled_extensions_json").first()
        if cfg and cfg.value:
            return json.loads(cfg.value)
        return []
    except Exception:
        return []
    finally:
        db.close()


def _set_global_disabled_extensions(disabled_list: List[str]):
    db = SessionLocal()
    try:
        cfg = db.query(Config).filter(Config.key == "disabled_extensions_json").first()
        val = json.dumps(disabled_list)
        if not cfg:
            db.add(Config(key="disabled_extensions_json", value=val))
        else:
            cfg.value = val
        db.commit()
    except Exception as e:
        print(f"Erro ao salvar configurações de extensões: {e}")
    finally:
        db.close()


@router.get("")
def list_extensions():
    """Retorna todas as extensões disponíveis (embutidas e customizadas)."""
    extensions = []
    disabled = _get_global_disabled_extensions()
    found_ids = set()

    # 1. Checar extensões embutidas
    if os.path.exists(BUILTIN_EXTENSIONS_DIR):
        for item in os.listdir(BUILTIN_EXTENSIONS_DIR):
            ext_path = os.path.join(BUILTIN_EXTENSIONS_DIR, item)
            if os.path.isdir(ext_path):
                info = _get_extension_info(ext_path, item)
                if info:
                    info["enabled"] = item not in disabled
                    extensions.append(info)
                    found_ids.add(item)

    # 2. Checar extensões customizadas do usuário
    if os.path.exists(USER_EXTENSIONS_DIR):
        for item in os.listdir(USER_EXTENSIONS_DIR):
            if item in found_ids:
                continue
            ext_path = os.path.join(USER_EXTENSIONS_DIR, item)
            if os.path.isdir(ext_path):
                info = _get_extension_info(ext_path, item)
                if info:
                    info["enabled"] = item not in disabled
                    extensions.append(info)
                    found_ids.add(item)

    # Garantir que catálogo mínimo tenha itens conhecidos caso ainda não existam pastas
    default_catalog = [
        {
            "id": "cookie-editor",
            "name": "Cookie-Editor",
            "version": "1.12.0",
            "description": "Visualize, edite e exporte cookies de sessão facilmente.",
            "category": "Utilitário",
            "icon": "cookie",
            "is_builtin": True
        },
        {
            "id": "ig-saver",
            "name": "Dog Saver (Instagram & TikTok)",
            "version": "3.0.5",
            "description": "Download de Reels, Stories, Posts do Instagram e vídeos do TikTok em alta qualidade sem marca d'água.",
            "category": "Download",
            "icon": "download_for_offline",
            "is_builtin": True
        },
        {
            "id": "canvas-defender",
            "name": "Canvas & WebGL Defender",
            "version": "1.3.4",
            "description": "Proteção ativa contra fingerprinting gráfico e canvas tracking.",
            "category": "Anti-Detect",
            "icon": "shield",
            "is_builtin": True
        },
        {
            "id": "google-translate",
            "name": "Google Tradutor",
            "version": "2.0.1",
            "description": "Tradução rápida de legendas e páginas de outros idiomas.",
            "category": "Produtividade",
            "icon": "translate",
            "is_builtin": True
        }
    ]

    result = []
    for default_item in default_catalog:
        existing = next((e for e in extensions if e["id"] == default_item["id"]), None)
        if existing:
            existing.update({
                "category": default_item["category"],
                "icon": default_item["icon"]
            })
            result.append(existing)
        else:
            default_item["enabled"] = default_item["id"] not in disabled
            default_item["path"] = os.path.join(BUILTIN_EXTENSIONS_DIR, default_item["id"])
            result.append(default_item)

    # Adicionar extensões customizadas adicionais
    for ext in extensions:
        if not any(r["id"] == ext["id"] for r in result):
            ext["category"] = "Personalizada"
            ext["icon"] = "extension"
            result.append(ext)

    return result


@router.post("/toggle")
def toggle_extension(req: ExtensionToggleRequest):
    """Ativa ou desativa uma extensão globalmente."""
    disabled = _get_global_disabled_extensions()
    if req.enabled:
        if req.extension_id in disabled:
            disabled.remove(req.extension_id)
    else:
        if req.extension_id not in disabled:
            disabled.append(req.extension_id)

    _set_global_disabled_extensions(disabled)
    return {"status": "success", "extension_id": req.extension_id, "enabled": req.enabled}


@router.post("/upload")
async def upload_custom_extension(file: UploadFile = File(...)):
    """Faz upload e descompacta uma extensão no formato .zip."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Apenas arquivos compactados .zip de extensões são aceitos.")

    ext_name = os.path.splitext(file.filename)[0].lower().replace(" ", "-")
    dest_dir = os.path.join(USER_EXTENSIONS_DIR, ext_name)
    os.makedirs(dest_dir, exist_ok=True)

    zip_path = os.path.join(USER_EXTENSIONS_DIR, f"{ext_name}_temp.zip")
    with open(zip_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(dest_dir)

        # Se houver pasta interna contendo o manifest.json
        manifest_path = os.path.join(dest_dir, "manifest.json")
        if not os.path.exists(manifest_path):
            subdirs = [d for d in os.listdir(dest_dir) if os.path.isdir(os.path.join(dest_dir, d))]
            if len(subdirs) == 1 and os.path.exists(os.path.join(dest_dir, subdirs[0], "manifest.json")):
                sub_dir_path = os.path.join(dest_dir, subdirs[0])
                for f_item in os.listdir(sub_dir_path):
                    shutil.move(os.path.join(sub_dir_path, f_item), dest_dir)
                os.rmdir(sub_dir_path)

        info = _get_extension_info(dest_dir, ext_name)
        if not info:
            shutil.rmtree(dest_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail="O arquivo .zip não contém um manifest.json válido de extensão.")

        return {
            "status": "success",
            "message": f"Extensão '{info['name']}' instalada com sucesso!",
            "extension": info
        }
    except Exception as ex:
        shutil.rmtree(dest_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Erro ao extrair extensão: {str(ex)}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)
