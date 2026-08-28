"""Shared utility functions used across backend modules."""
import os
import sys
import glob
import shutil
import hashlib
import threading
from sqlalchemy.orm import Session
from database import Config, Account

_RESOLVED_FFMPEG = None

def get_ffmpeg_exe() -> str:
    """
    Bulletproof FFmpeg resolver across development, virtualenv, PyInstaller frozen builds,
    and Electron packaged production distributions.
    """
    global _RESOLVED_FFMPEG
    if _RESOLVED_FFMPEG and os.path.isfile(_RESOLVED_FFMPEG):
        return _RESOLVED_FFMPEG

    candidates = []

    # 1. Environment variable if valid
    env_exe = os.getenv("IMAGEIO_FFMPEG_EXE")
    if env_exe:
        candidates.append(env_exe)

    # 2. Frozen/PyInstaller locations (sys._MEIPASS or sys.executable dir)
    base_dirs = []
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            base_dirs.append(sys._MEIPASS)
        base_dirs.append(os.path.dirname(sys.executable))
        base_dirs.append(os.path.join(os.path.dirname(sys.executable), "_internal"))

    # Also check backend dir and parent dirs
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    base_dirs.extend([
        backend_dir,
        os.path.join(backend_dir, "_internal"),
        os.path.dirname(backend_dir),
        os.path.join(os.path.dirname(backend_dir), "resources", "backend"),
        os.path.join(os.path.dirname(backend_dir), "resources", "backend", "_internal"),
    ])

    for b in base_dirs:
        if not b or not os.path.isdir(b):
            continue
        candidates.extend([
            os.path.join(b, "ffmpeg.exe"),
            os.path.join(b, "ffmpeg"),
            os.path.join(b, "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe"),
            os.path.join(b, "_internal", "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe"),
            os.path.join(b, "_internal", "ffmpeg.exe"),
        ])
        # Glob for any ffmpeg-win*.exe in binaries
        bin_dir = os.path.join(b, "imageio_ffmpeg", "binaries")
        if os.path.isdir(bin_dir):
            candidates.extend(glob.glob(os.path.join(bin_dir, "*ffmpeg*.*")))
        bin_dir_int = os.path.join(b, "_internal", "imageio_ffmpeg", "binaries")
        if os.path.isdir(bin_dir_int):
            candidates.extend(glob.glob(os.path.join(bin_dir_int, "*ffmpeg*.*")))

    # 3. Check native imageio_ffmpeg if available
    try:
        import imageio_ffmpeg
        img_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if img_exe:
            candidates.append(img_exe)
    except Exception:
        pass

    # 4. System PATH
    system_which = shutil.which("ffmpeg")
    if system_which:
        candidates.append(system_which)

    # Validate candidates
    for cand in candidates:
        if cand and os.path.isfile(cand):
            _RESOLVED_FFMPEG = os.path.abspath(cand)
            os.environ["IMAGEIO_FFMPEG_EXE"] = _RESOLVED_FFMPEG
            return _RESOLVED_FFMPEG

    # If all failed, fallback to "ffmpeg"
    _RESOLVED_FFMPEG = "ffmpeg"
    return _RESOLVED_FFMPEG



def get_config_val(db: Session, key: str) -> str:
    """Get a single config value from the database."""
    cfg = db.query(Config).filter(Config.key == key).first()
    return cfg.value if cfg else ""


def get_config_directory(db: Session, key: str, default_subfolder: str = "") -> str:
    cfg = db.query(Config).filter(Config.key == key).first()
    if cfg and cfg.value and cfg.value.strip():
        return os.path.abspath(cfg.value.strip())
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if default_subfolder:
        return os.path.abspath(os.path.join(base_dir, "downloads", default_subfolder))
    else:
        return os.path.abspath(os.path.join(base_dir, "downloads"))


def get_absolute_path(path: str, db: Session) -> str:
    if not path:
        return ""
    norm = os.path.normpath(path)
    if os.path.isabs(norm):
        return norm
    out_dir = get_config_directory(db, "output_directory")
    candidate1 = os.path.abspath(os.path.join(out_dir, norm))
    if os.path.exists(candidate1):
        return candidate1
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    candidate2 = os.path.abspath(os.path.join(backend_dir, norm))
    if os.path.exists(candidate2):
        return candidate2
    return candidate1


def compute_file_hash(file_path: str) -> str:
    """Compute SHA256 hash of a file for deduplication."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def get_account_info(db, username):
    """Helper to get cookies and proxy for an account."""
    cookies = None
    proxy = None
    if username:
        acc = db.query(Account).filter(Account.username == username).first()
        if acc:
            cookies = acc.session_cookies
            proxy = acc.proxy_url
    return cookies, proxy


# ─── Thread-safe session_videos ──────────────────────────────────────

import time as _time
from datetime import datetime

class _SessionVideos:
    """Thread-safe collection tracking edited videos in current session."""
    def __init__(self):
        self._items: dict = {}  # normpath -> {"category": str, "added_at": float}
        self._lock = threading.Lock()

    def add(self, path: str, category: str = "edited"):
        if not path or category != "edited":
            return
        norm = os.path.normpath(path)
        with self._lock:
            self._items[norm] = {
                "category": "edited",
                "added_at": _time.time()
            }

    def clear(self):
        with self._lock:
            self._items.clear()

    def __contains__(self, path: str) -> bool:
        if not path:
            return False
        with self._lock:
            return os.path.normpath(path) in self._items

    def __iter__(self):
        with self._lock:
            return iter(list(self._items.keys()))

    def get_all(self, db=None) -> list:
        with self._lock:
            items_copy = dict(self._items)

        videos = []
        for path, meta in items_copy.items():
            if meta.get("category") == "edited" and os.path.exists(path) and os.path.isfile(path):
                stat = os.stat(path)
                videos.append({
                    "name": os.path.basename(path),
                    "path": path,
                    "size": stat.st_size,
                    "category": "edited",
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
                })
        videos.sort(key=lambda x: x["created_at"], reverse=True)
        return videos

session_videos = _SessionVideos()
session_uploads = session_videos



# ─── Filesystem cache with TTL ───────────────────────────────────────

import time as _time

class _FSCache:
    """Simple in-memory cache with TTL for filesystem scan results."""
    def __init__(self, ttl_seconds: int = 30):
        self._cache: dict = {}
        self._ts: dict = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def get(self, key: str):
        with self._lock:
            if key not in self._cache:
                return None
            if _time.time() - self._ts[key] > self._ttl:
                del self._cache[key]
                del self._ts[key]
                return None
            return self._cache[key]

    def set(self, key: str, value):
        with self._lock:
            self._cache[key] = value
            self._ts[key] = _time.time()

    def invalidate(self, key: str = None):
        with self._lock:
            if key:
                self._cache.pop(key, None)
                self._ts.pop(key, None)
            else:
                self._cache.clear()
                self._ts.clear()

fs_cache = _FSCache(ttl_seconds=30)
