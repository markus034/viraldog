/**
 * IG Browser — Embedded Instagram WebContentsView,
 * download automation, and directory selection handlers.
 */
const { BrowserWindow, WebContentsView, ipcMain, dialog, session } = require('electron')
const path = require('path')
const fs = require('fs')
const downloadManager = require('./download-manager')
const { configureChromeSession, getNavigatorPatchScript } = require('./browser-identity')
const { isGoogleAccountUrl, openExternalProfileBrowser } = require('./external-browser')

// ── File Chooser: abre dialog nativo e devolve conteúdo do arquivo como base64 ──
ipcMain.handle('open-file-dialog', async (event, options = {}) => {
  // Converter o atributo accept do HTML em extensões para o dialog do Electron.
  // O Instagram usa: "image/jpeg,image/png,image/gif" ou "image/*" ou ".jpg,.png"
  const MIME_TO_EXT = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/jpg':  ['jpg', 'jpeg'],
    'image/png':  ['png'],
    'image/gif':  ['gif'],
    'image/webp': ['webp'],
    'image/bmp':  ['bmp'],
    'image/svg+xml': ['svg'],
    'image/heic': ['heic', 'heif'],
    'image/*':    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif'],
    'video/mp4':  ['mp4'],
    'video/quicktime': ['mov'],
    'video/x-msvideo': ['avi'],
    'video/x-matroska': ['mkv'],
    'video/webm': ['webm'],
    'video/*':    ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'],
  }

  let extensions = []
  if (options.accept) {
    const parts = options.accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    for (const part of parts) {
      if (MIME_TO_EXT[part]) {
        // MIME type conhecido (ex: "image/jpeg") ou wildcard (ex: "image/*")
        extensions.push(...MIME_TO_EXT[part])
      } else if (part.startsWith('.')) {
        // Extensão direta (ex: ".jpg")
        extensions.push(part.slice(1))
      } else if (part.includes('/')) {
        // MIME type desconhecido — ignorar (não adicionar lixo)
      } else {
        extensions.push(part)
      }
    }
    // Remover duplicatas
    extensions = [...new Set(extensions)]
  }

  // Se não conseguiu converter nada útil, mostrar todos os arquivos
  const filters = extensions.length > 0
    ? [
        { name: 'Arquivos compatíveis', extensions },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    : [
        { name: 'Imagens e Vídeos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]

  const result = await dialog.showOpenDialog({
    title: 'Selecionar arquivo',
    properties: ['openFile'],
    filters
  })

  if (result.canceled || !result.filePaths.length) return null

  const filePath = result.filePaths[0]
  const data = fs.readFileSync(filePath)
  const base64 = data.toString('base64')
  const filename = path.basename(filePath)
  const ext = path.extname(filename).toLowerCase().replace('.', '')
  const mimeMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm'
  }
  const mimeType = mimeMap[ext] || 'application/octet-stream'

  return { filename, mimeType, base64 }
})


let igView = null
let hiddenDownloadWin = null
const configuredProxies = new Map()
let authPollInterval = null
const configuredSessions = new Set() // sessões já inicializadas (UA + download)
let activeExternalBrowserContext = { profileKey: 'global', proxyUrl: null }

function sendFavoritesMenuCommand(open, anchorX = 0) {
  if (!igView || igView.webContents.isDestroyed()) return
  const safeAnchorX = Math.max(0, Math.min(10000, Number(anchorX) || 0))
  const payload = JSON.stringify({
    type: 'VIRALDOG_SET_IG_FAVORITES_MENU',
    open: open === true,
    anchorX: safeAnchorX,
  })
  igView.webContents.executeJavaScript(
    `window.postMessage(${payload}, window.location.origin)`,
    true
  ).catch(() => {})
}

function registerBrowserHandlers(getMainWindow, proxyAuthCredentials) {

  const sendLog = (message, type = 'info') => {
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('ig-download-log', {
        message, type,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    }
  }

  ipcMain.on('open-instagram-profile', (event, username) => {
    const partitionName = `persist:instagram-${String(username).toLowerCase()}`
    const win = new BrowserWindow({
      width: 1200, height: 800,
      webPreferences: { nodeIntegration: false, contextIsolation: false, session: session.fromPartition(partitionName) }
    })
    win.loadURL(`https://www.instagram.com/${username}/reels/`)
  })

  // Polling de autenticação no navegador interno — detecta sessionid numa partition específica
  ipcMain.on('start-auth-session-poll', (event, partitionName, username) => {
    if (authPollInterval) { clearInterval(authPollInterval); authPollInterval = null }
    if (!partitionName) return

    const targetSession = session.fromPartition(partitionName, { cache: true })

    authPollInterval = setInterval(async () => {
      try {
        const cookies = await targetSession.cookies.get({ domain: '.instagram.com', name: 'sessionid' })
        if (cookies.length > 0) {
          clearInterval(authPollInterval)
          authPollInterval = null
          const allCookies = await targetSession.cookies.get({ domain: '.instagram.com' })
          const cookiesJson = JSON.stringify(allCookies)
          const mw = getMainWindow()
          if (mw && !mw.isDestroyed()) {
            mw.webContents.send('profile-login-complete', { success: true, username, cookiesJson })
          }
        }
      } catch (err) { /* ignora */ }
    }, 2000)
  })

  ipcMain.on('stop-auth-session-poll', () => {
    if (authPollInterval) { clearInterval(authPollInterval); authPollInterval = null }
  })

  ipcMain.handle('select-directory', async () => {
    const mw = getMainWindow()
    const result = await dialog.showOpenDialog(mw, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('start-ig-download', async (event, params) => {
    const { profile, mediaType } = params
    if (hiddenDownloadWin && !hiddenDownloadWin.isDestroyed()) hiddenDownloadWin.close()

    const partitionName = `persist:instagram-${String(profile).toLowerCase()}`
    sendLog(`Iniciando sessão para @${profile}...`)
    hiddenDownloadWin = new BrowserWindow({
      show: true, width: 1280, height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: false, session: session.fromPartition(partitionName) }
    })

    const targetUrl = mediaType === 'videos'
      ? `https://www.instagram.com/${profile}/reels/`
      : `https://www.instagram.com/${profile}/`

    sendLog(`Navegando para ${targetUrl}...`)
    hiddenDownloadWin.loadURL(targetUrl)

    hiddenDownloadWin.webContents.on('did-finish-load', () => {
      const currentUrl = hiddenDownloadWin.webContents.getURL()
      if (currentUrl.includes('/accounts/login')) {
        sendLog('Sessão expirada — faça login em Definições.', 'error')
        hiddenDownloadWin.close()
        return
      }
      sendLog('Página carregada. Aguardando IG Saver injetar...', 'info')
      setTimeout(() => {
        sendLog('Procurando botões de download...', 'info')
        hiddenDownloadWin.webContents.executeJavaScript(`
          (function() {
            let mainBtn = document.getElementById("ig-saver-btn");
            if (mainBtn) { mainBtn.click(); return "popup_opened"; }
            const selectors = [
              '#ig-saver-btn', '[data-ig-saver-post-btn] button', '[data-ig-saver]',
              '.igSaverBtn', 'button[title*="IG Saver"]', 'button[aria-label*="Baixar"]',
              'button[aria-label*="Download"]', 'a[title*="Download"]'
            ]
            let total = 0
            selectors.forEach(sel => {
              document.querySelectorAll(sel).forEach(b => { b.click(); total++ })
            })
            return total
          })()
        `).then(res => {
          if (res === "popup_opened") sendLog('Popup do IG Saver aberto! Ajuste as opções na janela aberta.', 'success')
          else if (res > 0) sendLog(`${res} botões clicados. Aguardando downloads...`, 'success')
          else sendLog('Botões ainda não visíveis — role a página ou aguarde.', 'info')
        }).catch(err => sendLog(`Erro ao injetar script: ${err.message}`, 'error'))
      }, 4000)
    })

    hiddenDownloadWin.webContents.on('did-navigate', (e, url) => {
      if (url.includes('/login')) {
        sendLog('Redirecionado para login — faça login em Definições.', 'error')
        hiddenDownloadWin.close()
      }
    })

    hiddenDownloadWin.on('closed', () => { hiddenDownloadWin = null; sendLog('Sessão de download encerrada.') })
    return { started: true }
  })

  ipcMain.on('cancel-ig-download', () => {
    if (hiddenDownloadWin && !hiddenDownloadWin.isDestroyed()) {
      sendLog('Download cancelado pelo usuário.', 'error')
      hiddenDownloadWin.close()
      hiddenDownloadWin = null
    }
  })

  ipcMain.on('set-download-folder', (event, folder) => {
    const dir = folder || path.join(__dirname, '../downloads')
    downloadManager.setDownloadFolder(dir)
    console.log(`Download folder set to: ${dir}`)
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }) } catch (err) {}
    }
    try { session.defaultSession.setDownloadPath(dir) } catch (err) {}
  })

  // ── IG Browser (WebContentsView) ──

  ipcMain.on('show-ig-browser', async (event, bounds, partitionName, proxyUrl) => {
    const mw = getMainWindow()
    if (!mw || mw.isDestroyed()) return

    let targetSession = session.defaultSession
    activeExternalBrowserContext = {
      profileKey: partitionName || 'global',
      proxyUrl: proxyUrl || null,
    }
    if (partitionName) {
      targetSession = session.fromPartition(partitionName, { cache: true })
      if (!configuredProxies.has(partitionName) || configuredProxies.get(partitionName) !== proxyUrl) {
        configuredProxies.set(partitionName, proxyUrl)
        if (proxyUrl) {
          // Chromium proxyRules aceita apenas: scheme://host:port (SEM credenciais)
          // Credenciais são enviadas via evento 'login' (407 challenge)
          let parsedProxyRules = proxyUrl
          // Regex aceita barra opcional: http://user:pass@host:port/
          const match = proxyUrl.match(/^(https?|socks[45]?):\/\/(?:([^:@]+):([^@]+)@)?([^:/]+):(\d+)\/?$/)
          if (match) {
            const [_, protocol, username, password, host, port] = match
            const normalizedProto = protocol === 'https' ? 'http' : protocol
            if (username && password) {
              // Salvar credenciais para responder ao 407 via evento login
              proxyAuthCredentials[`${host}:${port}`] = { username, password }
            }
            // Passar APENAS host:port (sem credenciais) — Chromium não aceita @ no proxyRules
            parsedProxyRules = `${normalizedProto}://${host}:${port}`
          } else if (/^[^:/]+:\d+\/?$/.test(proxyUrl)) {
            parsedProxyRules = `http://${proxyUrl.replace(/\/$/, '')}`
          }
          console.log(`[Proxy] Setting for ${partitionName}: ${parsedProxyRules}`)
          await targetSession.setProxy({ proxyRules: parsedProxyRules, proxyBypassRules: '<local>' })
        } else {
          console.log(`[Proxy] Clearing proxy for ${partitionName}`)
          await targetSession.setProxy({})
        }
      }
    }

    // Configurar UA e download path apenas uma vez por sessão
    if (!configuredSessions.has(targetSession)) {
      configuredSessions.add(targetSession)
      const currentFolder = downloadManager.getDownloadFolder()
      if (currentFolder) {
        try { targetSession.setDownloadPath(currentFolder) } catch (err) {}
      }
      downloadManager.setupExtensionDownloadInterceptor(targetSession)

      configureChromeSession(targetSession)

      // Desabilitar verificador ortográfico (não é necessário num browser embutido)
      try { targetSession.setSpellCheckerEnabled(false) } catch (err) {}
      // Cache DNS e recursos para acelerar navegação subsequente
      try { targetSession.clearAuthCache() } catch (err) {}
    }

    if (igView && (igView.webContents.session !== targetSession)) {
      try { mw.contentView.removeChildView(igView) } catch (err) {}
      igView = null
    }

    if (!igView) {
      igView = new WebContentsView({
        webPreferences: {
          session: targetSession,
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload-browser.js'),
          sandbox: false,
          backgroundThrottling: false,    // Mantém FPS mesmo sem foco
          enablePreferredSizeMode: false, // Reduz overhead de layout
        }
      })
      // NOTE: addChildView is called AFTER setBounds below, so the view is
      // never added to the window at 0,0 full-size (which would show a black
      // screen over the React UI while Instagram is still loading).

      // ── Injeção no mundo principal (não funciona via preload com contextIsolation) ──
      // executeJavaScript roda no contexto da PÁGINA, não no isolated world.
      // Isso garante que a identidade do navegador vista pelo Google seja a
      // mesma em headers e no JavaScript. Passkeys permanecem nativas.
      const INJECT_SCRIPT = getNavigatorPatchScript()

      // Injetar no início de cada navegação (antes dos scripts da página)
      igView.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return
        downloadManager.rememberInstagramProfile(igView.webContents.session, url)
        igView.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })
      igView.webContents.on('dom-ready', () => {
        igView.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })

      // O Google bloqueia login em browsers embutidos por política. Ao entrar
      // em accounts.google.com, continuar em um Chrome real com perfil isolado.
      const redirectGoogleLogin = (event, url) => {
        if (!isGoogleAccountUrl(url)) return
        event.preventDefault()
        openExternalProfileBrowser({
          ...activeExternalBrowserContext,
          url,
        }).then((result) => {
          const currentMainWindow = getMainWindow()
          if (currentMainWindow && !currentMainWindow.isDestroyed()) {
            currentMainWindow.webContents.send('external-browser-status', result)
          }
        })
      }
      igView.webContents.on('will-navigate', redirectGoogleLogin)
      igView.webContents.on('will-redirect', redirectGoogleLogin)

      const sendNav = (url) => {
        downloadManager.rememberInstagramProfile(igView.webContents.session, url)
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send('ig-browser-navigated', {
            url, title: igView.webContents.getTitle(),
            canGoBack: igView.webContents.canGoBack(), canGoForward: igView.webContents.canGoForward()
          })
        }
      }
      igView.webContents.on('did-navigate', (e, url) => sendNav(url))
      igView.webContents.on('did-navigate-in-page', (e, url) => sendNav(url))
      igView.webContents.on('did-finish-load', () => sendNav(igView.webContents.getURL()))


      // Autenticação de proxy diretamente no WebContentsView
      igView.webContents.on('login', (event, authInfo, callback) => {
        if (authInfo.isProxy) {
          const key = `${authInfo.host}:${authInfo.port}`
          const creds = proxyAuthCredentials[key]
          if (creds) {
            event.preventDefault()
            callback(creds.username, creds.password)
            console.log(`[Proxy] Auth enviada para ${key}`)
          }
        }
      })

      // Abrir links que usam target=_blank dentro do próprio igView
      igView.webContents.setWindowOpenHandler(({ url }) => {
        if (isGoogleAccountUrl(url)) {
          openExternalProfileBrowser({
            ...activeExternalBrowserContext,
            url,
          }).then((result) => {
            const currentMainWindow = getMainWindow()
            if (currentMainWindow && !currentMainWindow.isDestroyed()) {
              currentMainWindow.webContents.send('external-browser-status', result)
            }
          })
          return { action: 'deny' }
        }
        igView.webContents.loadURL(url)
        return { action: 'deny' }
      })

      // Erro de carregamento — mostrar página de erro amigável
      igView.webContents.on('did-fail-load', (e, errorCode, errorDescription, url, isMainFrame) => {
        if (errorCode === -3) return // ERR_ABORTED = redirect normal, ignorar
        if (!isMainFrame) return    // ignorar erros de sub-recursos
        console.error(`[igView] Failed to load ${url}: ${errorCode} ${errorDescription}`)

        const isProxyError = errorCode === -130 || errorCode === -112 || errorCode === -21
        const title = isProxyError ? 'Erro de Proxy' : 'Falha ao Carregar'
        const msg = isProxyError
          ? `Não foi possível conectar através do proxy.<br><b>Código:</b> ${errorCode}<br>Verifique se o proxy está ativo e as credenciais estão corretas.`
          : `${errorDescription}<br><b>URL:</b> ${url}<br><b>Código:</b> ${errorCode}`

        const errorPage = `data:text/html;charset=utf-8,${encodeURIComponent(`
          <!DOCTYPE html><html><head><meta charset="UTF-8">
          <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { background:#0a0a0f; color:#fff; font-family:'Segoe UI',sans-serif;
                   display:flex; align-items:center; justify-content:center; height:100vh; }
            .box { text-align:center; max-width:480px; padding:40px; }
            .icon { font-size:52px; margin-bottom:20px; }
            h2 { font-size:22px; margin-bottom:12px; color:#ff6b6b; }
            p { font-size:14px; color:#aaa; line-height:1.6; margin-bottom:24px; }
            button { background:#6c63ff; color:#fff; border:none; padding:12px 28px;
                     border-radius:8px; font-size:14px; cursor:pointer; }
            button:hover { background:#5a52e0; }
          </style></head><body>
          <div class="box">
            <div class="icon">${isProxyError ? '🔌' : '⚠️'}</div>
            <h2>${title}</h2>
            <p>${msg}</p>
            <button onclick="location.href='${url}'">Tentar Novamente</button>
          </div></body></html>`
        )}`
        igView.webContents.loadURL(errorPage)
      })

      igView.webContents.loadURL('https://www.instagram.com/')
    }

    igView.setVisible(true)
    downloadManager.rememberInstagramProfile(targetSession, igView.webContents.getURL())
    const children = mw.contentView.children
    if (!children.includes(igView)) mw.contentView.addChildView(igView)
    igView.setBounds({
      x: Math.round(bounds.x), y: Math.round(bounds.y),
      width: Math.round(bounds.width), height: Math.round(bounds.height)
    })
    // Force the main renderer to repaint after the child view is positioned.
    // Without this, on Windows the area behind the WebContentsView can stay
    // black when the sidebar collapses/expands or the view is re-added.
    try { mw.webContents.invalidate() } catch (err) {}
  })

  ipcMain.on('hide-ig-browser', () => {
    sendFavoritesMenuCommand(false)
    if (igView) {
      igView.setVisible(false)
      igView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) {
      if (igView) {
        try { mw.contentView.removeChildView(igView) } catch (err) {}
      }
      // Always force a repaint so the main React view is fully visible again
      try { mw.webContents.invalidate() } catch (err) {}
      mw.webContents.send('ig-favorites-menu-closed')
    }
  })

  ipcMain.on('update-ig-browser-bounds', (event, bounds) => {
    const mw = getMainWindow()
    if (igView && mw && !mw.isDestroyed()) {
      igView.setBounds({
        x: Math.round(bounds.x), y: Math.round(bounds.y),
        width: Math.round(bounds.width), height: Math.round(bounds.height)
      })
    }
  })

  ipcMain.on('ig-browser-back', () => { if (igView && igView.webContents.canGoBack()) igView.webContents.goBack() })
  ipcMain.on('ig-browser-forward', () => { if (igView && igView.webContents.canGoForward()) igView.webContents.goForward() })
  ipcMain.on('ig-browser-reload', () => { if (igView) igView.webContents.reload() })
  ipcMain.on('ig-browser-home', () => { if (igView) igView.webContents.loadURL('https://www.instagram.com/') })
  ipcMain.on('set-ig-favorites-menu', (_event, payload) => {
    sendFavoritesMenuCommand(payload?.open === true, payload?.anchorX)
  })
  ipcMain.on('ig-browser-favorites-menu-closed', (event) => {
    if (!igView || event.sender.id !== igView.webContents.id) return
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) mw.webContents.send('ig-favorites-menu-closed')
  })
  ipcMain.on('ig-browser-go-to-url', (event, url) => {
    if (!igView) return
    let targetUrl = url.trim()
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      // Parece um domínio válido (ex: google.com, ipinfo.io, whatismyip.com)
      const looksLikeDomain = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})(\/.*)?$/.test(targetUrl)
      if (looksLikeDomain) {
        targetUrl = `https://${targetUrl}`
      } else {
        // Texto puro → pesquisa Google
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`
      }
    }
    downloadManager.rememberInstagramProfile(igView.webContents.session, targetUrl)
    igView.webContents.loadURL(targetUrl)
  })


  // ── Dedup: prevent duplicate download requests at the IPC level ──
  const recentDownloadUrls = new Map() // url -> timestamp
  const IPC_DEDUP_MS = 3000

  ipcMain.on('ig-browser-current-download-profile', (event, username) => {
    const safeUsername = downloadManager.sanitizeProfileName(username)
    if (!safeUsername) return
    downloadManager.rememberInstagramProfile(
      event.sender.session,
      `https://www.instagram.com/${safeUsername}/`
    )
    try {
      const logDir = path.join(__dirname, '../downloads')
      fs.mkdirSync(logDir, { recursive: true })
      fs.appendFileSync(path.join(logDir, 'download_debug.log'),
        `[PROFILE_HINT] ${new Date().toISOString()} | profile: ${safeUsername}\n`)
    } catch (error) {}
  })

  ipcMain.on('ig-browser-download-url', (event, url, filename) => {
    if (!url) return

    // Clean expired entries and check for duplicates
    const now = Date.now()
    for (const [key, ts] of recentDownloadUrls) {
      if (now - ts > IPC_DEDUP_MS) recentDownloadUrls.delete(key)
    }
    if (recentDownloadUrls.has(url)) {
      console.log(`[IG Download] IPC duplicate blocked: ${filename || 'unknown'}`)
      return
    }
    recentDownloadUrls.set(url, now)

    console.log(`[IG Download] Received download request: ${filename || 'unknown'} from ${url.substring(0, 80)}...`)
    try {
      const logDir = path.join(__dirname, '../downloads')
      fs.mkdirSync(logDir, { recursive: true })
      fs.appendFileSync(path.join(logDir, 'download_debug.log'),
        `[IPC_REQUEST] ${new Date().toISOString()} | filename: ${filename || 'N/A'} | url: ${url.substring(0, 160)}\n`)
    } catch (error) {}

    // Store the extension-provided filename (e.g. "username/20240727_1500_CxAbC123.mp4")
    // so the will-download handler in download-manager.js can use it to determine
    // the correct profile folder and clean filename.
    if (filename) {
      downloadManager.setPendingFilename(url, filename)
    }

    // Use igView's webContents if available, otherwise use the sender's webContents
    const target = (igView && !igView.webContents.isDestroyed()) ? igView.webContents : event.sender
    if (target && !target.isDestroyed()) {
      // Align the session fallback with this exact download. If Chromium changes
      // the media URL during a redirect, the encoded author must still beat the
      // profile remembered from previous navigation.
      const requestedName = filename ? path.basename(filename) : ''
      const downloadProfile = downloadManager.resolveProfileName(requestedName, filename)
      if (downloadProfile) {
        downloadManager.rememberInstagramProfile(
          target.session,
          `https://www.instagram.com/${downloadProfile}/`
        )
      }
      // downloadURL triggers the session's 'will-download' event
      // which is handled by download-manager.js
      target.downloadURL(url)
    } else {
      console.error('[IG Download] No available webContents to trigger download')
    }
  })
}

function cleanupIgView() { igView = null }

module.exports = { registerBrowserHandlers, cleanupIgView }
