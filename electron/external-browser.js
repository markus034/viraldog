/**
 * Opens a real Chrome window with one persistent, isolated profile per
 * MultiLogin account. Google explicitly blocks account sign-in in embedded
 * browser frameworks, so authentication must happen in a supported browser.
 */
const { app, ipcMain, screen } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const GOOGLE_LOGIN_URL = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2F&hl=pt-BR'
const INSTAGRAM_LOGIN_URL = 'https://www.instagram.com/accounts/login/'
const INSTAGRAM_LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const activeInstagramMonitors = new Map()
const spawnedBrowserProcesses = new Set()

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function findChromeExecutable() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null
}

function sanitizeProfileKey(profileKey) {
  const safeKey = String(profileKey || 'global')
    .replace(/^persist:/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
  return safeKey || 'global'
}

function normalizeUrl(requestedUrl) {
  try {
    const parsed = new URL(requestedUrl || GOOGLE_LOGIN_URL)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return GOOGLE_LOGIN_URL
    if (parsed.hostname === 'accounts.google.com') return GOOGLE_LOGIN_URL
    return parsed.toString()
  } catch (error) {
    return GOOGLE_LOGIN_URL
  }
}

function parseProxyForChrome(proxyUrl) {
  if (!proxyUrl) return { proxyServer: null, requiresAuthentication: false }

  try {
    const parsed = new URL(proxyUrl)
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(parsed.protocol)) {
      return { proxyServer: null, requiresAuthentication: false }
    }
    const protocol = parsed.protocol === 'https:' ? 'http:' : parsed.protocol
    return {
      proxyServer: `${protocol}//${parsed.hostname}:${parsed.port}`,
      requiresAuthentication: Boolean(parsed.username || parsed.password),
    }
  } catch (error) {
    return { proxyServer: null, requiresAuthentication: false }
  }
}

function isGoogleAccountUrl(url) {
  try {
    return new URL(url).hostname === 'accounts.google.com'
  } catch (error) {
    return false
  }
}

function getEnabledExtensionsForProfile(extensionsConfig = null) {
  const extensionPaths = []
  const builtinDir = app && app.isPackaged
    ? path.join(process.resourcesPath, 'extensions')
    : path.join(__dirname, 'extensions')

  let userDataExtDir = null
  try {
    userDataExtDir = path.join(app.getPath('userData'), 'extensions')
  } catch (e) {}

  let perProfileConfig = {}
  if (extensionsConfig) {
    try {
      perProfileConfig = typeof extensionsConfig === 'string' ? JSON.parse(extensionsConfig) : extensionsConfig
    } catch (e) {}
  }

  const scanDir = (dir) => {
    if (!dir || !fs.existsSync(dir)) return
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const extPath = path.join(dir, entry.name)
          const manifestPath = path.join(extPath, 'manifest.json')
          if (fs.existsSync(manifestPath)) {
            const extId = entry.name
            // Se foi desabilitado especificamente para este perfil
            if (perProfileConfig && perProfileConfig[extId] === false) {
              continue
            }
            extensionPaths.push(extPath)
          }
        }
      }
    } catch (e) {
      console.warn('[ExternalBrowser] Erro ao escanear diretório de extensões:', dir, e.message)
    }
  }

  scanDir(builtinDir)
  if (userDataExtDir) scanDir(userDataExtDir)

  return [...new Set(extensionPaths)]
}

function buildChromeArguments({
  isolatedProfileDir,
  proxy,
  url,
  enableInstagramCapture = false,
  fingerprint = null,
  extensionsConfig = null,
  windowPosition = null,
  windowSize = null,
}) {
  const extensionPaths = getEnabledExtensionsForProfile(extensionsConfig)

  let fpObj = null
  if (fingerprint) {
    try {
      fpObj = typeof fingerprint === 'string' ? JSON.parse(fingerprint) : fingerprint
    } catch (e) {}
  }

  const lang = fpObj?.lang || 'pt-BR'
  const windowWidth = windowSize?.width || fpObj?.windowWidth || 1280
  const windowHeight = windowSize?.height || fpObj?.windowHeight || 800

  const args = [
    `--user-data-dir=${isolatedProfileDir}`,
    '--profile-directory=Default',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    `--disk-cache-dir=${path.join(isolatedProfileDir, 'Cache')}`,
    `--lang=${lang}`,
    `--window-size=${Math.round(windowWidth)},${Math.round(windowHeight)}`,
    '--disable-features=WebAuthentication,WebAuthenticationConditionalUI,WebAuthenticationResidentKeys,WebAuthenticationNewPasskeyUI,PasskeyManagement,WebAuthenticationClientCapabilities,WebAuthenticationHybridLink,WebAuthenticationPhoneSupport',
    '--disable-webauthn',
    '--disable-fido-u2f-request',
    '--disable-web-security-for-fido',
  ]

  if (windowPosition && windowPosition.x !== undefined && windowPosition.y !== undefined) {
    args.push(`--window-position=${Math.round(windowPosition.x)},${Math.round(windowPosition.y)}`)
  }

  if (fpObj?.userAgent) {
    args.push(`--user-agent=${fpObj.userAgent}`)
  }

  if (extensionPaths.length > 0) {
    args.push(`--load-extension=${extensionPaths.join(',')}`)
  }

  // O navegador cotidiano fica completamente livre de automação. A porta de
  // depuração só é ligada se explicitamente solicitada para captura de sessão.
  if (enableInstagramCapture) args.push('--remote-debugging-port=0')
  if (proxy.proxyServer) args.push(`--proxy-server=${proxy.proxyServer}`)
  args.push(normalizeUrl(url))
  return args
}

function parseRawOrJsonCookies(cookiesInput) {
  if (!cookiesInput) return []
  const input = String(cookiesInput).trim()
  if (!input) return []

  if (input.startsWith('[') || input.startsWith('{')) {
    try {
      const parsed = JSON.parse(input)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const result = list.map(c => {
        const name = String(c.name || c.key || '').trim()
        const value = String(c.value || '').trim()
        const rawDomain = String(c.domain || '.instagram.com').trim()
        const domain = rawDomain.startsWith('.') ? rawDomain : `.${rawDomain}`
        return {
          name,
          value,
          url: 'https://www.instagram.com/',
          domain,
          path: c.path || '/',
          secure: c.secure !== undefined ? Boolean(c.secure) : true,
          httpOnly: c.httpOnly !== undefined ? Boolean(c.httpOnly) : (name === 'sessionid' || name === 'mid'),
          sameSite: c.sameSite || 'Lax',
        }
      }).filter(c => c.name && c.value)
      if (result.length > 0) return result
    } catch (e) {}
  }

  const pairs = input.split(';').map(s => s.trim()).filter(Boolean)
  const result = []
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx > 0) {
      const name = pair.slice(0, eqIdx).trim()
      const value = pair.slice(eqIdx + 1).trim()
      if (name && value) {
        result.push({
          name,
          value,
          url: 'https://www.instagram.com/',
          domain,
          path: '/',
          secure: true,
          httpOnly: name === 'sessionid' || name === 'mid',
          sameSite: 'Lax'
        })
      }
    }
  }
  return result
}

async function injectCookiesViaCdp(profileDir, sessionCookies, targetUrl) {
  const cookies = parseRawOrJsonCookies(sessionCookies)
  if (!cookies || cookies.length === 0) return

  let client = null
  try {
    client = await connectToProfileDevTools(profileDir, 10000, true)
    await client.command('Network.enable')
    await client.command('Network.setCookies', { cookies })
    if (targetUrl) {
      await client.command('Page.navigate', { url: targetUrl })
    }
  } catch (err) {
    console.error('[ExternalBrowser] Falha ao injetar cookies via CDP:', err.message)
  } finally {
    if (client) {
      try { client.close() } catch (e) {}
    }
  }
}

function openExternalProfileBrowser({
  profileKey,
  proxyUrl,
  url,
  sessionCookies,
  enableInstagramCapture = false,
  fingerprint = null,
  extensionsConfig = null,
  windowPosition = null,
  windowSize = null,
}) {
  const browserPath = findChromeExecutable()
  if (!browserPath) {
    return Promise.resolve({
      success: false,
      error: 'Google Chrome ou Microsoft Edge não foi encontrado neste computador.',
    })
  }

  const isolatedProfileDir = path.join(
    app.getPath('userData'),
    'external-browser-profiles',
    sanitizeProfileKey(profileKey),
  )
  fs.mkdirSync(isolatedProfileDir, { recursive: true })

  const proxy = parseProxyForChrome(proxyUrl)
  const args = buildChromeArguments({
    isolatedProfileDir,
    proxy,
    url: url || 'https://www.instagram.com/',
    enableInstagramCapture,
    fingerprint,
    extensionsConfig,
    windowPosition,
    windowSize,
  })

  return new Promise((resolve) => {
    let settled = false
    const child = spawn(browserPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    spawnedBrowserProcesses.add(child)
    child.on('exit', () => {
      spawnedBrowserProcesses.delete(child)
    })

    child.once('error', (error) => {
      spawnedBrowserProcesses.delete(child)
      if (settled) return
      settled = true
      resolve({ success: false, error: error.message })
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()

      if (enableInstagramCapture && sessionCookies) {
        injectCookiesViaCdp(isolatedProfileDir, sessionCookies, url).catch(() => {})
      }

      resolve({
        success: true,
        browser: path.basename(browserPath).toLowerCase().includes('edge') ? 'Microsoft Edge' : 'Google Chrome',
        requiresProxyAuthentication: proxy.requiresAuthentication,
        profileDir: isolatedProfileDir,
      })
    })
  })
}

function closeAllProfileBrowsers() {
  let count = 0
  for (const proc of spawnedBrowserProcesses) {
    try {
      if (proc.pid) {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
        } else {
          proc.kill('SIGTERM')
        }
        count++
      }
    } catch (e) {}
  }
  spawnedBrowserProcesses.clear()
  return { success: true, count }
}

async function openMultipleProfileBrowsers({ accounts, layout = 'grid', syncUrl = null }) {
  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    return { success: false, error: 'Nenhuma conta informada.' }
  }

  let workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    if (primaryDisplay && primaryDisplay.workArea) {
      workArea = primaryDisplay.workArea
    }
  } catch (e) {
    console.warn('[ExternalBrowser] Erro ao obter dimensões da tela:', e.message)
  }

  const N = accounts.length
  let cols = 1
  let rows = 1

  if (layout === 'grid') {
    if (N === 2) {
      cols = 2
      rows = 1
    } else if (N === 3 || N === 4) {
      cols = 2
      rows = 2
    } else if (N === 5 || N === 6) {
      cols = 3
      rows = 2
    } else if (N > 6) {
      cols = Math.ceil(Math.sqrt(N))
      rows = Math.ceil(N / cols)
    }
  }

  const cellWidth = Math.floor(workArea.width / cols)
  const cellHeight = Math.floor(workArea.height / rows)

  const results = []
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i]
    let windowPosition = null
    let windowSize = null

    if (layout === 'grid') {
      const col = i % cols
      const row = Math.floor(i / cols)
      windowPosition = {
        x: workArea.x + (col * cellWidth),
        y: workArea.y + (row * cellHeight),
      }
      windowSize = {
        width: cellWidth,
        height: cellHeight,
      }
    } else if (layout === 'cascade') {
      const baseWidth = Math.floor(workArea.width * 0.7)
      const baseHeight = Math.floor(workArea.height * 0.8)
      const offset = 35
      const maxOffsetCols = Math.max(1, Math.floor((workArea.width - baseWidth) / offset))
      const maxOffsetRows = Math.max(1, Math.floor((workArea.height - baseHeight) / offset))
      windowPosition = {
        x: workArea.x + ((i % maxOffsetCols) * offset),
        y: workArea.y + ((i % maxOffsetRows) * offset),
      }
      windowSize = {
        width: baseWidth,
        height: baseHeight,
      }
    }

    const res = await openExternalProfileBrowser({
      profileKey: acc.profile_key,
      proxyUrl: acc.proxy,
      url: syncUrl || acc.last_url || 'https://www.instagram.com/',
      sessionCookies: acc.session_cookies,
      fingerprint: acc.fingerprint_json,
      extensionsConfig: acc.extensions_config_json,
      windowPosition,
      windowSize,
    })
    results.push(res)

    if (i < accounts.length - 1) {
      await delay(1200) // 1.2s delay between spawns
    }
  }

  return {
    success: true,
    openedCount: results.filter((r) => r.success).length,
    total: accounts.length,
    results,
  }
}

function createCdpClient(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const pendingCommands = new Map()
    let nextCommandId = 1
    let opened = false

    const failPendingCommands = (error) => {
      for (const { reject: rejectCommand, timeout } of pendingCommands.values()) {
        clearTimeout(timeout)
        rejectCommand(error)
      }
      pendingCommands.clear()
    }

    socket.addEventListener('open', () => {
      opened = true
      resolve({
        command(method, params = {}) {
          return new Promise((resolveCommand, rejectCommand) => {
            const id = nextCommandId++
            const timeout = setTimeout(() => {
              pendingCommands.delete(id)
              rejectCommand(new Error(`Chrome não respondeu ao comando ${method}.`))
            }, 8000)
            pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        close() {
          socket.close()
        },
      })
    })
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch (error) {
        return
      }
      if (!message.id || !pendingCommands.has(message.id)) return
      const pending = pendingCommands.get(message.id)
      pendingCommands.delete(message.id)
      clearTimeout(pending.timeout)
      if (message.error) pending.reject(new Error(message.error.message || 'Erro do Chrome DevTools.'))
      else pending.resolve(message.result || {})
    })
    socket.addEventListener('error', () => {
      const error = new Error('Não foi possível conectar ao perfil externo do Chrome.')
      if (!opened) reject(error)
      failPendingCommands(error)
    })
    socket.addEventListener('close', () => {
      failPendingCommands(new Error('O Chrome foi fechado antes da conclusão do login.'))
    })
  })
}

async function findAnyPageWebSocket(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Chrome DevTools respondeu com HTTP ${response.status}.`)

  const targets = await response.json()
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
  return page?.webSocketDebuggerUrl || null
}

async function findInstagramPageWebSocket(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`Chrome DevTools respondeu com HTTP ${response.status}.`)

  const targets = await response.json()
  const instagramPage = targets.find((target) => {
    if (target.type !== 'page' || !target.webSocketDebuggerUrl) return false
    try {
      const hostname = new URL(target.url).hostname.replace(/^www\./, '').toLowerCase()
      return hostname === 'instagram.com' || hostname.endsWith('.instagram.com')
    } catch (error) {
      return false
    }
  })
  return instagramPage?.webSocketDebuggerUrl || null
}

async function connectToProfileDevTools(profileDir, timeoutMs = 20000, matchAnyPage = false) {
  const activePortFile = path.join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(activePortFile)) {
        const [port] = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/)
        if (port) {
          const pageWebSocket = matchAnyPage
            ? await findAnyPageWebSocket(port)
            : await findInstagramPageWebSocket(port)
          if (pageWebSocket) return await createCdpClient(pageWebSocket)
        }
      }
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw lastError || new Error('O Chrome não disponibilizou a aba para conexão DevTools.')
}

function normalizeInstagramCookies(cookies) {
  return cookies
    .filter((cookie) => {
      const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase()
      return domain === 'instagram.com' || domain.endsWith('.instagram.com')
    })
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      expirationDate: cookie.expires > 0 ? cookie.expires : undefined,
      sameSite: cookie.sameSite || 'Unspecified',
    }))
}

async function monitorInstagramLogin({ profileKey, profileDir, username, getMainWindow }) {
  const monitor = { cancelled: false }
  const previousMonitor = activeInstagramMonitors.get(profileKey)
  if (previousMonitor) previousMonitor.cancelled = true
  activeInstagramMonitors.set(profileKey, monitor)

  let client = null
  try {
    client = await connectToProfileDevTools(profileDir)
    await client.command('Network.enable')
    const deadline = Date.now() + INSTAGRAM_LOGIN_TIMEOUT_MS

    while (!monitor.cancelled && Date.now() < deadline) {
      const result = await client.command('Network.getCookies', {
        urls: ['https://www.instagram.com/'],
      })
      const instagramCookies = normalizeInstagramCookies(result.cookies || [])
      if (instagramCookies.some((cookie) => cookie.name === 'sessionid' && cookie.value)) {
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('profile-login-complete', {
            success: true,
            profileKey,
            username,
            cookiesJson: JSON.stringify(instagramCookies),
          })
        }
        return
      }
      await delay(2000)
    }

    if (!monitor.cancelled) throw new Error('Tempo esgotado. Abra o Chrome novamente para concluir o login.')
  } catch (error) {
    if (!monitor.cancelled) {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('profile-login-complete', {
          success: false,
          profileKey,
          username,
          error: error.message,
        })
      }
    }
  } finally {
    client?.close()
    if (activeInstagramMonitors.get(profileKey) === monitor) activeInstagramMonitors.delete(profileKey)
  }
}

function registerExternalBrowserHandlers(getMainWindow) {
  ipcMain.handle('open-external-profile-browser', async (_event, profileKey, proxyUrl, url, sessionCookies, fingerprint, extensionsConfig) => {
    const result = await openExternalProfileBrowser({ profileKey, proxyUrl, url, sessionCookies, fingerprint, extensionsConfig })
    return {
      success: result.success,
      browser: result.browser,
      error: result.error,
      requiresProxyAuthentication: result.requiresProxyAuthentication,
    }
  })

  ipcMain.handle('open-multiple-profile-browsers', async (_event, accounts, layout, syncUrl) => {
    return await openMultipleProfileBrowsers({ accounts, layout, syncUrl })
  })

  ipcMain.handle('close-all-profile-browsers', async () => {
    return closeAllProfileBrowsers()
  })

  ipcMain.handle('start-external-instagram-login', async (_event, profileKey, username, proxyUrl) => {
    const result = await openExternalProfileBrowser({
      profileKey,
      proxyUrl,
      url: INSTAGRAM_LOGIN_URL,
      enableInstagramCapture: true,
    })
    if (result.success) {
      monitorInstagramLogin({
        profileKey,
        profileDir: result.profileDir,
        username,
        getMainWindow,
      })
    }
    return {
      success: result.success,
      browser: result.browser,
      error: result.error,
      requiresProxyAuthentication: result.requiresProxyAuthentication,
    }
  })

  ipcMain.on('cancel-external-instagram-login', (_event, profileKey) => {
    const monitor = activeInstagramMonitors.get(profileKey)
    if (monitor) monitor.cancelled = true
  })
}

module.exports = {
  GOOGLE_LOGIN_URL,
  buildChromeArguments,
  isGoogleAccountUrl,
  openExternalProfileBrowser,
  openMultipleProfileBrowsers,
  closeAllProfileBrowsers,
  registerExternalBrowserHandlers,
}
