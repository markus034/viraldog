/**
 * Opens a real Chrome window with one persistent, isolated profile per
 * MultiLogin account. Google explicitly blocks account sign-in in embedded
 * browser frameworks, so authentication must happen in a supported browser.
 */
const { app, ipcMain } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const GOOGLE_LOGIN_URL = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2F&hl=pt-BR'
const INSTAGRAM_LOGIN_URL = 'https://www.instagram.com/accounts/login/'
const INSTAGRAM_LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const activeInstagramMonitors = new Map()

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

function buildChromeArguments({ isolatedProfileDir, proxy, url, enableInstagramCapture = false }) {
  const extensionPaths = []
  const { app } = require('electron')
  const extensionsDir = app && app.isPackaged
    ? path.join(process.resourcesPath, 'extensions')
    : path.join(__dirname, 'extensions')
  const cookieEditorDir = path.join(extensionsDir, 'cookie-editor')

  if (fs.existsSync(cookieEditorDir)) {
    extensionPaths.push(cookieEditorDir)
  }

  const args = [
    `--user-data-dir=${isolatedProfileDir}`,
    '--profile-directory=Default',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    `--disk-cache-dir=${path.join(isolatedProfileDir, 'Cache')}`,
    '--lang=pt-BR',
  ]

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
          domain: '.instagram.com',
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

function openExternalProfileBrowser({ profileKey, proxyUrl, url, sessionCookies, enableInstagramCapture = false }) {
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
  })

  return new Promise((resolve) => {
    let settled = false
    const child = spawn(browserPath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    child.once('error', (error) => {
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
      // Solicita ao Chrome somente cookies aplicáveis ao Instagram. Cookies do
      // Google e de outros sites não são lidos nem transferidos para o ViralDog.
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
  ipcMain.handle('open-external-profile-browser', async (_event, profileKey, proxyUrl, url, sessionCookies) => {
    const result = await openExternalProfileBrowser({ profileKey, proxyUrl, url, sessionCookies })
    return {
      success: result.success,
      browser: result.browser,
      error: result.error,
      requiresProxyAuthentication: result.requiresProxyAuthentication,
    }
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
  registerExternalBrowserHandlers,
}
