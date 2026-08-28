# -*- mode: python ; coding: utf-8 -*-
"""
ViralDog Backend — PyInstaller spec
Bundles the FastAPI backend (main.py) as a standalone directory executable.
Run: pyinstaller viraldog.spec
Output: dist/main/ (a directory with main.exe + all deps)
"""

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# ── Hidden imports that PyInstaller misses via static analysis ──
hiddenimports = [
    # FastAPI / Uvicorn internals
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    # SQLAlchemy dialects
    'sqlalchemy.dialects.sqlite',
    # Pydantic v2 core
    'pydantic.v1',
    'pydantic_core',
    # Pillow
    'PIL._tkinter_finder',
    # instaloader
    'instaloader',
    # yt-dlp uses dynamic extractor imports
    'yt_dlp',
    'yt_dlp.extractor',
    'yt_dlp.extractor.tiktok',
    # imageio_ffmpeg (downloads ffmpeg binary)
    'imageio_ffmpeg',
    # email (used by some http libs)
    'email.mime.text',
    'email.mime.multipart',
    # multipart
    'multipart',
    # Routers (dynamically imported)
    'routers.accounts',
    'routers.downloads',
    'routers.editing',
    'routers.publishing',
    'routers.settings',
    'routers.videos',
    'routers.cloud',
    'routers.auth',
    # Modules
    'database',
    'scheduler',
    'backend_publisher',
    'backend_editor',
    'backend_ai_service',
    'backend_downloader',
    'backend_analytics',
    'proxy_manager',
    'task_queue',
    'tiktok_downloader',
    'utils',
    'instagrapi',
    'openai',
    'anthropic',
    'google.generativeai',
    'numpy',
]

# ── Collect data files ──
datas = []
# imageio_ffmpeg ships its own ffmpeg binary
datas += collect_data_files('imageio_ffmpeg')
# fonts for offline drawing
if os.path.exists('fonts'):
    datas += [('fonts', 'fonts')]
# templates
if os.path.exists('templates'):
    datas += [('templates', 'templates')]
# instaloader data
datas += collect_data_files('instaloader')
# yt-dlp extractor support files
datas += collect_data_files('yt_dlp')
hiddenimports += collect_submodules('yt_dlp.extractor')
# Certifi (SSL certs for requests/httpx)
datas += collect_data_files('certifi')
datas += collect_data_files('instagrapi')

# ── Analysis ──
a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Explicitly exclude heavy ML libs not needed for packaging
    excludes=[
        'torch', 'torchvision', 'torchaudio',
        'whisper',
        'openai_whisper',
        'matplotlib', 'notebook', 'ipython',
        'psycopg2', 'psycopg2_binary',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,  # Sem janela preta no produto final
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='main',
)
