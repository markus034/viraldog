/**
 * IG Browser — Embedded Instagram WebContentsView,
 * download automation, and directory selection handlers.
 */
const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const downloadManager = require('./download-manager')
const extensionPolyfills = require('./extension-polyfills')
const { configureChromeSession, getNavigatorPatchScript } = require('./browser-identity')
const { isGoogleAccountUrl, openExternalProfileBrowser } = require('./external-browser')

// ── Local HTTP API for Extension Background Workers ──
// Service workers cannot use ipcRenderer, so the background.js reaches the
// main process via a plain HTTP request to 127.0.0.1 on this fixed port.
// Port chosen to be unlikely to conflict with common dev servers.
const LOCAL_API_PORT = 37421
let localApiServer = null

function startLocalApiServer(downloadMgr) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      // Allow extension background workers to call in
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end()
        return
      }

      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        try {
          if (req.method === 'POST' && (req.url === '/build-zip' || req.url === '/download-batch')) {
            const params = body ? JSON.parse(body) : {}
            const { username, items, filename, taskId, concurrency } = params
            console.log(`[LocalAPI] batch-download: @${username} (${items?.length || 0} items)`)
            const result = await downloadMgr.downloadBatchDirectNative(username, items || [], {
              filename, concurrency: concurrency || 8, taskId
            })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, downloaded: result.downloaded || 0, failed: result.failed || 0, skipped: result.skipped || 0, zipPath: result.zipPath }))
            return
          }

          if (req.method === 'POST' && req.url === '/download-single') {
            const params = body ? JSON.parse(body) : {}
            const { url, filename, username } = params
            console.log(`[LocalAPI] download-single: ${filename} (@${username})`)
            const result = await downloadMgr.downloadSingleFileNative(url, filename, username)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'POST' && req.url === '/scan-progress') {
            const payload = body ? JSON.parse(body) : {}
            const mw = downloadMgr.getMainWindow ? downloadMgr.getMainWindow() : null
            if (mw && !mw.isDestroyed()) {
              mw.webContents.send('ig-scan-progress', payload)
              if (payload.message) {
                mw.webContents.send('ig-download-log', {
                  message: payload.message,
                  type: payload.status === 'error' ? 'error' : payload.status === 'done' ? 'success' : 'info',
                  timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                })
              }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
            return
          }

          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Not Found' }))
        } catch (err) {
          console.error('[LocalAPI] Request error on ' + req.url + ':', err.message)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
      })
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use — another instance may be running, that's fine
        console.warn(`[LocalAPI] Port ${LOCAL_API_PORT} already in use, skipping server start`)
        resolve(null)
      } else {
        console.error('[LocalAPI] Server error:', err.message)
        resolve(null)
      }
    })
    // Bind to 127.0.0.1 only — never exposed to the network
    server.listen(LOCAL_API_PORT, '127.0.0.1', () => {
      localApiServer = server
      console.log(`[LocalAPI] Listening on 127.0.0.1:${LOCAL_API_PORT}`)
      resolve(LOCAL_API_PORT)
    })
  })
}

function getExtensionsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'extensions')
  }
  return path.join(__dirname, 'extensions')
}

async function loadExtensionsForSession(targetSession) {
  if (!targetSession) return
  const extensionsBase = getExtensionsDir()
  const extensionPath = path.join(extensionsBase, 'ig-saver')
  const cookieEditorPath = path.join(extensionsBase, 'cookie-editor')

  if (fs.existsSync(cookieEditorPath)) {
    try {
      const ext = await targetSession.loadExtension(cookieEditorPath, { allowFileAccess: true })
      console.log(`[Session Extension] Loaded ${ext.name}`)
    } catch (err) {
      if (!err.message.includes('already loaded') && !err.message.includes('Extension is already loaded')) {
        console.warn(`[Session Extension] Cookie Editor:`, err.message)
      }
    }
  }

  if (fs.existsSync(extensionPath)) {
    try {
      const ext = await targetSession.loadExtension(extensionPath, { allowFileAccess: true })
      console.log(`[Session Extension] Loaded ${ext.name}`)
      if (ext) {
        extensionPolyfills.setupPolyfillInjection(ext)
        await extensionPolyfills.ensureOffscreenWindow(extensionPath, targetSession)
      }
    } catch (err) {
      if (!err.message.includes('already loaded') && !err.message.includes('Extension is already loaded')) {
        console.warn(`[Session Extension] IG Saver:`, err.message)
      }
    }
  }
}

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

let favoritesMigrationDone = false

function getFavoritesFilePath() {
  return path.join(app.getPath('userData'), 'browser_favorites.json')
}

function migratePreviousFavoritesOnDisk() {
  if (favoritesMigrationDone) return
  favoritesMigrationDone = true
  try {
    const currentFavs = readBrowserFavorites()
    const appData = process.env.APPDATA || path.join(app.getPath('appData'))
    const userDirs = [
      app.getPath('userData'),
      path.join(appData, 'viraldog-desktop'),
      path.join(appData, 'ViralDog')
    ]
    let changed = false

    for (const dir of userDirs) {
      if (!fs.existsSync(dir)) continue
      function walk(current, depth = 0) {
        if (depth > 6) return
        try {
          const items = fs.readdirSync(current, { withFileTypes: true })
          for (const item of items) {
            const full = path.join(current, item.name)
            if (item.isDirectory()) {
              walk(full, depth + 1)
            } else if (item.name.endsWith('.ldb') || item.name.endsWith('.log')) {
              try {
                const buf = fs.readFileSync(full)
                const str = buf.toString('latin1')
                const igMatch = str.match(/ig_saver_favorite_profiles.*?(\[.*?\])/)
                if (igMatch) {
                  try {
                    const list = JSON.parse(igMatch[1])
                    if (Array.isArray(list)) {
                      for (const u of list) {
                        const norm = String(u).trim().replace(/^@+/, '')
                        if (norm && !currentFavs.instagram.some(x => x.toLowerCase() === norm.toLowerCase())) {
                          currentFavs.instagram.push(norm)
                          changed = true
                        }
                      }
                    }
                  } catch(e) {}
                }
                const ttMatch = str.match(/dog_saver_tiktok_favorite_profiles.*?(\[.*?\])/)
                if (ttMatch) {
                  try {
                    const list = JSON.parse(ttMatch[1])
                    if (Array.isArray(list)) {
                      for (const u of list) {
                        const norm = String(u).trim().replace(/^@+/, '')
                        if (norm && !currentFavs.tiktok.some(x => x.toLowerCase() === norm.toLowerCase())) {
                          currentFavs.tiktok.push(norm)
                          changed = true
                        }
                      }
                    }
                  } catch(e) {}
                }
              } catch(e) {}
            }
          }
        } catch(e) {}
      }
      walk(dir)
    }

    if (changed) {
      writeBrowserFavorites(currentFavs)
    }
  } catch (err) {
    console.error('Error during migratePreviousFavoritesOnDisk:', err)
  }
}

function readBrowserFavorites() {
  try {
    const file = getFavoritesFilePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return {
        instagram: Array.isArray(data?.instagram) ? data.instagram : [],
        tiktok: Array.isArray(data?.tiktok) ? data.tiktok : []
      }
    }
  } catch (err) {
    console.error('Error reading browser_favorites.json:', err)
  }
  return { instagram: [], tiktok: [] }
}

function writeBrowserFavorites(favorites) {
  try {
    const file = getFavoritesFilePath()
    fs.writeFileSync(file, JSON.stringify(favorites, null, 2), 'utf8')
  } catch (err) {
    console.error('Error writing browser_favorites.json:', err)
  }
}

function syncFavoritesToBrowserView(favorites) {
  if (!igView || igView.webContents.isDestroyed()) return
  const igPayload = JSON.stringify(favorites.instagram || [])
  const ttPayload = JSON.stringify(favorites.tiktok || [])
  igView.webContents.executeJavaScript(`
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'ig_saver_favorite_profiles': ${igPayload},
          'dog_saver_tiktok_favorite_profiles': ${ttPayload}
        });
      }
    } catch(e) {}
  `, true).catch(() => {})
}

let favoritesPopoverWin = null

function closeFavoritesPopover() {
  if (favoritesPopoverWin && !favoritesPopoverWin.isDestroyed()) {
    try {
      favoritesPopoverWin.close()
    } catch (e) {}
    favoritesPopoverWin = null
  }
}

function toggleFavoritesPopover(bounds, currentProfile, getMainWindow) {
  if (favoritesPopoverWin && !favoritesPopoverWin.isDestroyed()) {
    closeFavoritesPopover()
    return
  }

  const mw = getMainWindow ? getMainWindow() : null
  if (!mw || mw.isDestroyed()) return

  const mwBounds = mw.getContentBounds()
  const popoverWidth = 320
  const popoverHeight = 390

  let targetX = Math.round(mwBounds.x + (bounds?.x || 0))
  let targetY = Math.round(mwBounds.y + (bounds?.y || 0) + (bounds?.height || 0) + 6)

  if (targetX + popoverWidth > mwBounds.x + mwBounds.width - 10) {
    targetX = mwBounds.x + mwBounds.width - popoverWidth - 10
  }
  if (targetX < mwBounds.x + 10) {
    targetX = mwBounds.x + 10
  }

  favoritesPopoverWin = new BrowserWindow({
    parent: mw,
    x: targetX,
    y: targetY,
    width: popoverWidth,
    height: popoverHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  const popoverFile = path.join(__dirname, 'favorites-popover.html')
  let query = []
  if (currentProfile && currentProfile.platform && currentProfile.username) {
    query.push(`platform=${encodeURIComponent(currentProfile.platform)}`)
    query.push(`username=${encodeURIComponent(currentProfile.username)}`)
  }
  const queryString = query.length > 0 ? `?${query.join('&')}` : ''

  favoritesPopoverWin.loadFile(popoverFile, { search: queryString }).catch(() => {})

  favoritesPopoverWin.once('ready-to-show', () => {
    if (favoritesPopoverWin && !favoritesPopoverWin.isDestroyed()) {
      favoritesPopoverWin.show()
    }
  })

  favoritesPopoverWin.on('blur', () => {
    closeFavoritesPopover()
  })
}

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

async function registerBrowserHandlers(getMainWindow, proxyAuthCredentials) {
  migratePreviousFavoritesOnDisk()

  // Start the local API server so extension background workers can call build-zip
  await startLocalApiServer(downloadManager).catch(err => {
    console.error('[LocalAPI] Failed to start:', err.message)
  })

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

  ipcMain.handle('select-files', async (event, options = {}) => {
    const mw = getMainWindow()
    const isMultiple = options.multiple !== false
    const result = await dialog.showOpenDialog(mw, {
      properties: isMultiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: options.filters || [
        { name: 'Mídias (Vídeos e Fotos)', extensions: ['mp4', 'mov', 'avi', 'jpg', 'jpeg', 'png', 'webp'] },
        { name: 'Vídeos (Reels)', extensions: ['mp4', 'mov', 'avi'] },
        { name: 'Fotos (Feed)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('start-ig-download', async (event, params) => {
    const { profile, mediaType } = params
    if (hiddenDownloadWin && !hiddenDownloadWin.isDestroyed()) hiddenDownloadWin.close()

    const partitionName = `persist:instagram-${String(profile).toLowerCase()}`
    const targetSession = session.fromPartition(partitionName)
    await loadExtensionsForSession(targetSession)
    sendLog(`Iniciando sessão para @${profile}...`)
    hiddenDownloadWin = new BrowserWindow({
      show: true, width: 1280, height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: false, session: targetSession }
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
    try {
      const downSession = session.fromPartition('persist:viraldog_downloader_isolated')
      downSession.setDownloadPath(dir)
    } catch (err) {}
  })

  // ── Handler para consultar sessões conectadas (Instagram e TikTok) ──
  ipcMain.handle('get-downloader-sessions', async () => {
    try {
      const downSession = session.fromPartition('persist:viraldog_downloader_isolated')
      const allCookies = await downSession.cookies.get({})
      
      const igCookies = allCookies.filter(c => (c.domain && c.domain.includes('instagram.com')))
      const ttCookies = allCookies.filter(c => (c.domain && c.domain.includes('tiktok.com')))
      
      const igUserIdCookie = igCookies.find(c => c.name === 'ds_user_id')
      const igSessionCookie = igCookies.find(c => c.name === 'sessionid')
      const ttSessionCookie = ttCookies.find(c => c.name === 'sessionid' || c.name === 'passport_csrf_token' || c.name === 'msToken')
      
      const isIgConnected = Boolean(igSessionCookie || (igUserIdCookie && igUserIdCookie.value))
      const isTtConnected = Boolean(ttSessionCookie && ttCookies.length > 2)
      
      return {
        success: true,
        sessions: {
          instagram: {
            connected: isIgConnected,
            userId: igUserIdCookie ? igUserIdCookie.value : null,
            cookieCount: igCookies.length
          },
          tiktok: {
            connected: isTtConnected,
            cookieCount: ttCookies.length
          }
        }
      }
    } catch (err) {
      console.error('Error fetching downloader sessions:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Handler para deslogar/limpar sessão isolada do Baixador (alvo específico ou tudo) ──
  ipcMain.handle('clear-downloader-session', async () => {
    try {
      const downSession = session.fromPartition('persist:viraldog_downloader_isolated')
      await downSession.clearStorageData()
      if (igView && !igView.webContents.isDestroyed()) {
        igView.webContents.loadURL('https://www.instagram.com/accounts/login/')
      }
      return { success: true }
    } catch (err) {
      console.error('Error clearing downloader session:', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('clear-downloader-session-target', async (event, target = 'all') => {
    try {
      const downSession = session.fromPartition('persist:viraldog_downloader_isolated')
      
      if (target === 'instagram') {
        const cookies = await downSession.cookies.get({})
        for (const c of cookies) {
          if (c.domain && c.domain.includes('instagram.com')) {
            const url = `http${c.secure ? 's' : ''}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`
            await downSession.cookies.remove(url, c.name).catch(() => {})
          }
        }
        await downSession.cookies.flushStore()
        if (igView && !igView.webContents.isDestroyed()) {
          const currentUrl = igView.webContents.getURL()
          if (currentUrl.includes('instagram.com')) {
            igView.webContents.loadURL('https://www.instagram.com/accounts/login/')
          }
        }
      } else if (target === 'tiktok') {
        const cookies = await downSession.cookies.get({})
        for (const c of cookies) {
          if (c.domain && c.domain.includes('tiktok.com')) {
            const url = `http${c.secure ? 's' : ''}://${c.domain.startsWith('.') ? c.domain.slice(1) : c.domain}${c.path || '/'}`
            await downSession.cookies.remove(url, c.name).catch(() => {})
          }
        }
        await downSession.cookies.flushStore()
        if (igView && !igView.webContents.isDestroyed()) {
          const currentUrl = igView.webContents.getURL()
          if (currentUrl.includes('tiktok.com')) {
            igView.webContents.loadURL('https://www.tiktok.com/login')
          }
        }
      } else {
        // all
        await downSession.clearStorageData()
        if (igView && !igView.webContents.isDestroyed()) {
          igView.webContents.loadURL('https://www.instagram.com/accounts/login/')
        }
      }
      
      return { success: true }
    } catch (err) {
      console.error('Error clearing downloader session target:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Handler para importar cookies para a sessão persistente do Baixador / Perfil ──
  ipcMain.handle('import-cookies', async (event, cookiesText, partitionName) => {
    try {
      if (!cookiesText || typeof cookiesText !== 'string' || !cookiesText.trim()) {
        return { success: false, error: 'Nenhum cookie informado.' }
      }

      const effectivePartition = partitionName || 'persist:viraldog_downloader_isolated'
      const targetSession = session.fromPartition(effectivePartition, { cache: true })

      let parsedCookies = []
      const raw = cookiesText.trim()

      // 1. Tentar parsear como JSON (Cookie-Editor / EditThisCookie / array de cookies)
      if (raw.startsWith('[') || raw.startsWith('{')) {
        try {
          const json = JSON.parse(raw)
          if (Array.isArray(json)) {
            parsedCookies = json
          } else if (typeof json === 'object' && json !== null) {
            parsedCookies = Object.entries(json).map(([k, v]) => ({
              name: k,
              value: String(v),
              domain: '.instagram.com',
              path: '/'
            }))
          }
        } catch (jsonErr) {
          // Continuar para parser de texto
        }
      }

      // 2. Se não foi parseado como JSON, tenta parsear como chave=valor (HTTP Header / Netscape)
      if (parsedCookies.length === 0) {
        const pairs = raw.split(/[\n;]+/).map(s => s.trim()).filter(Boolean)
        for (const line of pairs) {
          if (line.startsWith('#')) continue
          const tabParts = line.split('\t')
          if (tabParts.length >= 7) {
            parsedCookies.push({
              domain: tabParts[0],
              path: tabParts[2],
              secure: tabParts[3] === 'TRUE',
              expirationDate: parseInt(tabParts[4], 10) || undefined,
              name: tabParts[5],
              value: tabParts[6]
            })
          } else {
            const eqIdx = line.indexOf('=')
            if (eqIdx > 0) {
              const name = line.substring(0, eqIdx).trim()
              const value = line.substring(eqIdx + 1).trim()
              if (name && value) {
                parsedCookies.push({
                  name,
                  value,
                  domain: '.instagram.com',
                  path: '/'
                })
              }
            }
          }
        }
      }

      if (parsedCookies.length === 0) {
        return { success: false, error: 'Formato de cookies não reconhecido. Use JSON do Cookie-Editor ou texto chave=valor.' }
      }

      let importedCount = 0
      for (const c of parsedCookies) {
        if (!c || !c.name || c.value === undefined) continue

        const cookieName = String(c.name).trim()
        const cookieVal = String(c.value).trim()
        if (!cookieName || !cookieVal) continue

        let isTikTok = Boolean(
          (c.domain && c.domain.includes('tiktok')) ||
          (c.url && c.url.includes('tiktok'))
        )

        let defaultDomain = isTikTok ? '.tiktok.com' : '.instagram.com'
        let defaultUrl = isTikTok ? 'https://www.tiktok.com/' : 'https://www.instagram.com/'

        let domain = c.domain ? String(c.domain).trim() : defaultDomain
        let path = c.path || '/'
        let secure = c.secure !== undefined ? Boolean(c.secure) : true
        let httpOnly = c.httpOnly !== undefined ? Boolean(c.httpOnly) : false

        let sameSite = undefined
        if (typeof c.sameSite === 'string') {
          const s = c.sameSite.toLowerCase().replace(/[^a-z_]/g, '')
          if (s === 'no_restriction' || s === 'none') sameSite = 'no_restriction'
          else if (s === 'lax') sameSite = 'lax'
          else if (s === 'strict') sameSite = 'strict'
        }

        let cleanDomain = domain.startsWith('.') ? domain.slice(1) : domain
        let url = `https://${cleanDomain}${path.startsWith('/') ? path : '/' + path}`
        if (!cleanDomain.includes('.')) {
          url = defaultUrl
          domain = defaultDomain
        }

        const cookieDetails = {
          url,
          name: cookieName,
          value: cookieVal,
          domain,
          path,
          secure,
          httpOnly
        }

        if (sameSite) {
          cookieDetails.sameSite = sameSite
        }

        if (c.expirationDate && typeof c.expirationDate === 'number' && !isNaN(c.expirationDate)) {
          cookieDetails.expirationDate = Math.floor(c.expirationDate)
        }

        let success = false

        // Tentativa 1: com domain e url originais
        try {
          await targetSession.cookies.set(cookieDetails)
          success = true
        } catch (e1) {
          // Tentativa 2: com URL padrão e domain padrão
          try {
            const fallbackDetails = {
              ...cookieDetails,
              url: defaultUrl,
              domain: defaultDomain
            }
            await targetSession.cookies.set(fallbackDetails)
            success = true
          } catch (e2) {
            // Tentativa 3: apenas url, sem campo domain explícito
            try {
              const minimalDetails = {
                url: defaultUrl,
                name: cookieName,
                value: cookieVal,
                path: '/',
                secure: true
              }
              await targetSession.cookies.set(minimalDetails)
              success = true
            } catch (e3) {
              console.warn(`[Cookie Import] Failed to set cookie ${cookieName}:`, e1.message, e2.message, e3.message)
            }
          }
        }

        if (success) importedCount++
      }

      await targetSession.cookies.flushStore()

      // Detectar plataforma de destino (TikTok vs Instagram)
      let detectedPlatform = 'instagram'
      const isTikTokCookie = parsedCookies.some(c =>
        (c.domain && c.domain.toLowerCase().includes('tiktok')) ||
        (c.url && c.url.toLowerCase().includes('tiktok')) ||
        (c.name && (c.name.startsWith('tt_') || c.name === 'msToken' || c.name === 'passport_csrf_token' || c.name === 's_v_web_id'))
      )
      if (isTikTokCookie) {
        detectedPlatform = 'tiktok'
      }

      if (igView && !igView.webContents.isDestroyed()) {
        const targetUrl = detectedPlatform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/'
        downloadManager.rememberInstagramProfile(igView.webContents.session, targetUrl)
        igView.webContents.loadURL(targetUrl)
      }

      return { success: true, count: importedCount, platform: detectedPlatform }
    } catch (err) {
      console.error('Error importing cookies:', err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── IG Browser (WebContentsView) ──

  ipcMain.on('show-ig-browser', async (event, bounds, partitionName, proxyUrl) => {
    const mw = getMainWindow()
    if (!mw || mw.isDestroyed()) return

    const effectivePartition = partitionName || 'persist:viraldog_downloader_isolated'
    let targetSession = session.fromPartition(effectivePartition, { cache: true })
    activeExternalBrowserContext = {
      profileKey: effectivePartition,
      proxyUrl: proxyUrl || null,
    }
    if (effectivePartition) {
      if (!configuredProxies.has(effectivePartition) || configuredProxies.get(effectivePartition) !== proxyUrl) {
        configuredProxies.set(effectivePartition, proxyUrl)
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

    // Configurar UA, extensões e download path apenas uma vez por sessão
    if (!configuredSessions.has(targetSession)) {
      configuredSessions.add(targetSession)
      await loadExtensionsForSession(targetSession)
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
    try { igView.webContents.setAudioMuted(false) } catch (e) {}
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
    closeFavoritesPopover()
    sendFavoritesMenuCommand(false)
    pauseIgMedia()
    if (igView) {
      // Desloca para fora da área visível sem desconectar da janela para manter tarefas em segundo plano ativas
      igView.setBounds({ x: -10000, y: -10000, width: 800, height: 600 })
    }
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) {
      // Força repintura para garantir visibilidade da interface React
      try { mw.webContents.invalidate() } catch (err) {}
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

  // ── Universal Browser Favorites (Instagram & TikTok) ──
  ipcMain.on('toggle-favorites-popover', (event, { bounds, currentProfile } = {}) => {
    toggleFavoritesPopover(bounds, currentProfile, getMainWindow)
  })

  ipcMain.on('close-favorites-popover', () => {
    closeFavoritesPopover()
  })

  ipcMain.handle('get-browser-favorites', () => {
    return readBrowserFavorites()
  })

  ipcMain.handle('add-browser-favorite', (event, { platform, username }) => {
    if (!platform || !username) return { success: false }
    const normUser = String(username).trim().replace(/^@+/, '')
    if (!normUser) return { success: false }
    const favs = readBrowserFavorites()
    const list = favs[platform] || []
    if (!list.some(u => u.toLowerCase() === normUser.toLowerCase())) {
      list.unshift(normUser)
      favs[platform] = list
      writeBrowserFavorites(favs)
      syncFavoritesToBrowserView(favs)
      const mw = getMainWindow()
      if (mw && !mw.isDestroyed()) mw.webContents.send('browser-favorites-updated', favs)
    }
    return { success: true, favorites: favs }
  })

  ipcMain.handle('remove-browser-favorite', (event, { platform, username }) => {
    if (!platform || !username) return { success: false }
    const normUser = String(username).trim().replace(/^@+/, '')
    const favs = readBrowserFavorites()
    const list = favs[platform] || []
    favs[platform] = list.filter(u => u.toLowerCase() !== normUser.toLowerCase())
    writeBrowserFavorites(favs)
    syncFavoritesToBrowserView(favs)
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) mw.webContents.send('browser-favorites-updated', favs)
    return { success: true, favorites: favs }
  })

  ipcMain.on('ig-browser-sync-favorite', (event, { platform, username, active }) => {
    if (!platform || !username) return
    const normUser = String(username).trim().replace(/^@+/, '')
    const favs = readBrowserFavorites()
    const list = favs[platform] || []
    const exists = list.some(u => u.toLowerCase() === normUser.toLowerCase())
    if (active && !exists) {
      list.unshift(normUser)
      favs[platform] = list
      writeBrowserFavorites(favs)
    } else if (!active && exists) {
      favs[platform] = list.filter(u => u.toLowerCase() !== normUser.toLowerCase())
      writeBrowserFavorites(favs)
    }
    syncFavoritesToBrowserView(favs)
    const mw = getMainWindow()
    if (mw && !mw.isDestroyed()) mw.webContents.send('browser-favorites-updated', favs)
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

  // ── Native Bulk / ZIP Build Handler ──
  ipcMain.handle('ig-browser-build-zip-native', async (event, params = {}) => {
    const { username, items, filename, taskId, concurrency } = params
    console.log(`[IG Download] Bulk ZIP build requested for @${username} (${items?.length || 0} items)`)
    try {
      const result = await downloadManager.buildZipNative(username, items || [], {
        filename,
        concurrency: concurrency || 4,
        taskId
      })
      return {
        success: true,
        downloaded: result.downloaded || 0,
        failed: result.failed || 0,
        zipPath: result.zipPath
      }
    } catch (err) {
      console.error('[IG Download] Error in buildZipNative:', err)
      return {
        success: false,
        error: err.message || String(err),
        downloaded: 0,
        failed: items?.length || 1
      }
    }
  })
}

function pauseIgMedia() {
  if (igView && !igView.webContents.isDestroyed()) {
    try {
      igView.webContents.setAudioMuted(true)
      igView.webContents.executeJavaScript(`
        try {
          const media = document.querySelectorAll('video, audio');
          media.forEach(el => {
            if (!el.paused) el.pause();
          });
        } catch(e) {}
      `).catch(() => {})
    } catch (e) {}
  }
}

function cleanupIgView() {
  if (igView) {
    try {
      if (!igView.webContents.isDestroyed()) {
        igView.webContents.setAudioMuted(true)
        igView.webContents.executeJavaScript(`
          try {
            document.querySelectorAll('video, audio').forEach(el => {
              try { el.pause(); el.src = ''; el.srcObject = null; el.remove(); } catch(e) {}
            });
          } catch(e) {}
        `).catch(() => {})
        igView.webContents.stop()
        igView.webContents.loadURL('about:blank').catch(() => {})
      }
    } catch (e) {}
    try {
      if (igView.webContents && !igView.webContents.isDestroyed()) {
        igView.webContents.destroy()
      }
    } catch (e) {}
    igView = null
  }
  if (localApiServer) {
    try { localApiServer.close() } catch (e) {}
    localApiServer = null
  }
}

module.exports = { registerBrowserHandlers, cleanupIgView, pauseIgMedia }
