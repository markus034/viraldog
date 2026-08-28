/**
 * ViralDog Desktop — Electron main process entry point.
 * Orchestrates backend startup, window management, and module initialization.
 */
const { app, BrowserWindow, session, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn } = require('child_process')
const { chromeUA, configureChromeSession } = require('./browser-identity')

// ── Identity do App ──────────────────────────────────────────────────────────
// Isso é necessário no Windows para que o ícone do aplicativo (icon.ico)
// apareça corretamente na barra de tarefas (Taskbar).
app.setAppUserModelId('com.viraldog.desktop')

// ── Flags de estabilidade do Chromium (antes de app.whenReady) ────────────
// Roda o Network Service DENTRO do processo principal (evita "Utility killed")
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2')
app.commandLine.appendSwitch('disable-dev-shm-usage')
// Remover identificação do Electron das headers HTTP (evita bloqueio do Google)
app.commandLine.appendSwitch('disable-features', 'AutoupgradeMixedContent')
app.commandLine.appendSwitch('no-sandbox')
// Usar o Chromium real do Electron, sem anunciar uma versão divergente.
app.userAgentFallback = chromeUA

// ── Flags de performance do Chromium ─────────────────────────────────────
// GPU / Hardware Acceleration — melhora rendering e scroll do Instagram
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-oop-rasterization')
app.commandLine.appendSwitch('enable-accelerated-video-decode')
app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode')
// Rede — protocolo QUIC (HTTP/3) e TCP fast open para carregamento mais rápido
app.commandLine.appendSwitch('enable-quic')
app.commandLine.appendSwitch('quic-max-packet-length', '1350')
// Rendering
app.commandLine.appendSwitch('enable-smooth-scrolling')
app.commandLine.appendSwitch('enable-begin-frame-scheduling')
// Reduz latência de input no renderer
app.commandLine.appendSwitch('disable-renderer-backgrounding')

const downloadManager = require('./download-manager')
const extensionPolyfills = require('./extension-polyfills')
const instagramSession = require('./instagram-session')
const igBrowser = require('./ig-browser')
const externalBrowser = require('./external-browser')

let pyProc = null
let mainWindow = null
const proxyAuthCredentials = {}

// ── Resolução de caminhos ──────────────────────────────────────────────────

function getDownloadsDir() {
  if (app.isPackaged) {
    // Packaged: salvar em %APPDATA%\ViralDog\downloads (mesmo que o backend usa)
    return path.join(app.getPath('userData'), 'downloads')
  }
  // Dev: pasta downloads na raiz do projeto
  return path.join(__dirname, '../downloads')
}

// ── Backend ────────────────────────────────────────────────────────────────

function startPythonBackend() {
  let exe, args, cwd

  if (app.isPackaged) {
    // Packaged: usar main.exe compilado pelo PyInstaller em extraResources
    exe = path.join(process.resourcesPath, 'backend', 'main.exe')
    args = []
    cwd = path.join(process.resourcesPath, 'backend')
  } else {
    // Dev: uvicorn via venv
    exe = path.join(__dirname, '../backend/venv/Scripts/python.exe')
    args = ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000']
  }
  const env = { ...process.env }
  if (app.isPackaged) {
    const backendInternal = path.join(cwd, '_internal')
    env.PATH = `${cwd};${backendInternal};${env.PATH || ''}`
    const ffmpegCandidate = path.join(cwd, 'ffmpeg.exe')
    if (fs.existsSync(ffmpegCandidate)) {
      env.IMAGEIO_FFMPEG_EXE = ffmpegCandidate
    }
  }

  pyProc = spawn(exe, args, { cwd, env, shell: false })
  pyProc.stdout.on('data', (data) => console.log(`Backend: ${data}`))
  pyProc.stderr.on('data', (data) => console.error(`Backend: ${data}`))
  pyProc.on('error', (err) => console.error('Falha ao iniciar backend:', err))
}

/**
 * Aguarda o backend FastAPI responder em /api/dashboard (health check).
 * Tenta a cada 500ms por até maxAttempts vezes.
 */
function waitForBackend(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    let done = false

    const check = () => {
      if (done) return
      attempts++
      const req = http.get('http://127.0.0.1:8000/api/dashboard', (res) => {
        res.resume() // consumir body para liberar a conexão
        if (!done && res.statusCode < 500) {
          done = true
          resolve()
        } else if (!done) {
          retry()
        }
      })
      req.on('error', () => { if (!done) retry() })
      req.setTimeout(400, () => { req.destroy() }) // destroy sem retry — retry já vem do 'error'
    }

    const retry = () => {
      if (done) return
      if (attempts >= maxAttempts) {
        done = true
        reject(new Error('Backend não respondeu após 15 segundos.'))
      } else {
        setTimeout(check, 500)
      }
    }

    check()
  })
}

// ── Splash Screen ──────────────────────────────────────────────────────────

function showSplash(win) {
  const logoData = fs.readFileSync(path.join(__dirname, 'assets', 'logo-cachorro-preto-branco.png')).toString('base64')

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #f5f5f7;
    display: grid;
    place-items: center;
    height: 100vh;
    padding: 32px;
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1d1d1f;
    user-select: none;
  }
  .splash {
    width: min(100%, 440px);
    padding: 48px;
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
    text-align: center;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 40px;
  }
  .brand-logo {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }
  .brand-name {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .eyebrow {
    margin-bottom: 8px;
    color: #86868b;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  .progress {
    height: 4px;
    margin-top: 32px;
    background: #e8e8ed;
    border-radius: 999px;
    overflow: hidden;
  }
  .progress-bar {
    width: 40%;
    height: 100%;
    background: #0071e3;
    border-radius: inherit;
    animation: progress 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes progress {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(360%); }
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 20px;
    margin-top: 16px;
    color: #86868b;
    font-size: 13px;
    line-height: 20px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #0071e3;
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1); }
  }
  @media (max-width: 520px) {
    body { padding: 20px; }
    .splash { padding: 40px 32px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress-bar, .status-dot { animation: none; }
    .progress-bar { width: 65%; }
  }
</style>
</head>
<body>
  <main class="splash" aria-labelledby="loading-title">
    <div class="brand" aria-label="ViralDog">
      <img class="brand-logo" src="data:image/png;base64,${logoData}" alt="">
      <span class="brand-name">ViralDog</span>
    </div>
    <p class="eyebrow">Espaço de trabalho</p>
    <h1 id="loading-title">Tudo pronto em instantes.</h1>
    <div class="progress" role="progressbar" aria-label="Carregando o ViralDog">
      <div class="progress-bar"></div>
    </div>
    <p class="status" role="status" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <span id="status-text">Iniciando serviços...</span>
    </p>
  </main>
  <script>
    const messages = ['Preparando seu ambiente...', 'Finalizando configurações...']
    const statusText = document.getElementById('status-text')
    messages.forEach((message, index) => {
      setTimeout(() => { statusText.textContent = message }, (index + 1) * 4000)
    })
  </script>
</body>
</html>
  `)}`)
}

function getExtensionsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'extensions')
  }
  return path.join(__dirname, 'extensions')
}

// ── Window ─────────────────────────────────────────────────────────────────

async function createWindow() {
  const extensionsBase = getExtensionsDir()
  const extensionPath = path.join(extensionsBase, 'ig-saver')
  const cookieEditorPath = path.join(extensionsBase, 'cookie-editor')

  if (fs.existsSync(cookieEditorPath)) {
    await session.defaultSession.loadExtension(cookieEditorPath).then((ext) => {
      console.log(`Loaded extension: ${ext.name}`)
    }).catch(err => {
      console.log('Failed to load Cookie Editor extension:', err.message)
    })
  }

  let loadedExtension = null
  if (fs.existsSync(extensionPath)) {
    await session.defaultSession.loadExtension(extensionPath).then((ext) => {
      console.log(`Loaded extension: ${ext.name}`)
      loadedExtension = ext
    }).catch(err => {
      console.log('Failed to load IG Saver extension:', err.message)
    })
  }

  await extensionPolyfills.ensureOffscreenWindow(extensionPath)
  if (loadedExtension) extensionPolyfills.setupPolyfillInjection(loadedExtension)

  mainWindow = new BrowserWindow({
    width: 1300, height: 900, show: false,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.maximize()
  mainWindow.show()
  downloadManager.setMainWindow(mainWindow)

  // Mostrar splash enquanto o backend sobe
  showSplash(mainWindow)

  // Aguardar backend e depois carregar o app
  waitForBackend(30)
    .then(() => {
      // Sync the download folder with whatever is saved in the backend DB config.
      // This must run BEFORE any download event fires, so the correct path is set
      // from the very first download — not just after the Settings page is opened.
      http.get('http://127.0.0.1:8000/api/settings', (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          try {
            const settings = JSON.parse(data)
            if (settings.download_directory && settings.download_directory.trim()) {
              const dir = settings.download_directory.trim()
              downloadManager.setDownloadFolder(dir)
              if (!fs.existsSync(dir)) {
                try { fs.mkdirSync(dir, { recursive: true }) } catch (err) {}
              }
              try { session.defaultSession.setDownloadPath(dir) } catch (err) {}
              console.log(`[main] Download folder synced from backend config: ${dir}`)
            }
          } catch (e) {
            console.warn('[main] Could not parse /api/settings response:', e.message)
          }
        })
      }).on('error', (err) => {
        console.warn('[main] Could not fetch /api/settings for download folder sync:', err.message)
      })

      // Populate Electron's in-memory shortcode dedup cache from the backend DB
      downloadManager.loadDownloadedShortcodes()

      if (app.isPackaged) {
        mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'dist', 'index.html'))
      } else {
        mainWindow.loadURL('http://localhost:5173').catch(() => {
          mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'))
        })
      }
    })
    .catch((err) => {
      console.error(err.message)
      if (app.isPackaged) {
        mainWindow.loadFile(path.join(process.resourcesPath, 'frontend', 'dist', 'index.html'))
      } else {
        mainWindow.loadURL('http://localhost:5173').catch(() => {
          mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'))
        })
      }
    })

  mainWindow.on('closed', () => {
    mainWindow = null
    downloadManager.setMainWindow(null)
    igBrowser.cleanupIgView()
  })
}

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Remove the default native menu bar (File, Edit, View, Window)
  Menu.setApplicationMenu(null)

  startPythonBackend()

  const downloadsDir = getDownloadsDir()
  if (!fs.existsSync(downloadsDir)) {
    try { fs.mkdirSync(downloadsDir, { recursive: true }) } catch (err) {}
  }
  try { session.defaultSession.setDownloadPath(downloadsDir) } catch (err) {}

  // Aplica a mesma identidade coerente a requests e ao renderer.
  configureChromeSession(session.defaultSession)

  downloadManager.setDownloadFolder(downloadsDir)
  downloadManager.setupExtensionDownloadInterceptor(session.defaultSession)

  const getMainWindow = () => mainWindow
  instagramSession.registerSessionHandlers(getMainWindow, proxyAuthCredentials)
  igBrowser.registerBrowserHandlers(getMainWindow, proxyAuthCredentials)
  externalBrowser.registerExternalBrowserHandlers(getMainWindow)

  app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy) {
      const key = `${authInfo.host}:${authInfo.port}`
      const creds = proxyAuthCredentials[key]
      if (creds) {
        event.preventDefault()
        callback(creds.username, creds.password)
      }
    }
  })

  app.on('child-process-gone', (event, details) => {
    if (details.type === 'Utility' && details.reason !== 'clean-exit') {
      console.error(`[Electron] Process crashed: ${details.type} — ${details.reason}`)
    }
  })

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('will-quit', () => { if (pyProc) pyProc.kill() })
