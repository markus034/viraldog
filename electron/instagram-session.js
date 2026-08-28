/**
 * Instagram Session Manager — Login, session verification,
 * and cookie extraction for Instagram accounts.
 */
const { BrowserWindow, session, ipcMain } = require('electron')
const path = require('path')
const { configureChromeSession, getNavigatorPatchScript } = require('./browser-identity')

function registerSessionHandlers(getMainWindow, proxyAuthCredentials) {

  ipcMain.handle('open-instagram-oauth', async (event, authUrl) => {
    return new Promise(async (resolve) => {
      // Usar partição isolada com dados limpos para forçar prompt de login (usuário e senha)
      const cleanSession = session.fromPartition('persist:ig_oauth_fresh')
      try {
        await cleanSession.clearStorageData()
      } catch (e) {}

      configureChromeSession(cleanSession)

      const oauthWin = new BrowserWindow({
        width: 600,
        height: 750,
        title: 'Conectar Instagram API — ViralDog',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: cleanSession,
          preload: path.join(__dirname, 'preload-browser.js'),
          sandbox: false
        }
      })

      const INJECT_SCRIPT = getNavigatorPatchScript()

      oauthWin.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return
        oauthWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })
      oauthWin.webContents.on('dom-ready', () => {
        oauthWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })

      oauthWin.loadURL(authUrl)

      oauthWin.on('closed', () => {
        resolve({ closed: true })
      })
    })
  })

  ipcMain.handle('open-instagram-login', async () => {
    const targetSession = session.defaultSession

    configureChromeSession(targetSession)

    return new Promise((resolve) => {
      // Abrir navegador livre
      const loginWin = new BrowserWindow({
        width: 1200, height: 800,
        title: 'Navegador — faça login no Instagram quando quiser',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: targetSession,
          preload: path.join(__dirname, 'preload-browser.js'),
          sandbox: false,
        }
      })

      const INJECT_SCRIPT = getNavigatorPatchScript()

      loginWin.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return
        loginWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })
      loginWin.webContents.on('dom-ready', () => {
        loginWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })

      loginWin.loadURL('https://www.google.com')

      let resolved = false
      let pollInterval = null

      const checkForSession = async () => {
        if (resolved || loginWin.isDestroyed()) return
        try {
          const cookies = await targetSession.cookies.get({ domain: '.instagram.com', name: 'sessionid' })
          if (cookies.length > 0) {
            resolved = true
            clearInterval(pollInterval)
            const mw = getMainWindow()
            if (mw && !mw.isDestroyed()) mw.webContents.send('instagram-login-complete', { success: true })
            setTimeout(() => { if (!loginWin.isDestroyed()) loginWin.close() }, 1200)
            resolve({ success: true })
          }
        } catch (err) { /* ignora erros de polling */ }
      }

      pollInterval = setInterval(checkForSession, 2000)

      loginWin.on('closed', () => {
        clearInterval(pollInterval)
        if (!resolved) resolve({ success: false })
      })
    })
  })

  ipcMain.handle('check-instagram-session', async () => {
    try {
      const cookies = await session.defaultSession.cookies.get({ domain: '.instagram.com', name: 'sessionid' })
      return { loggedIn: cookies.length > 0 }
    } catch (err) { return { loggedIn: false } }
  })

  ipcMain.handle('logout-instagram', async () => {
    try {
      const allCookies = await session.defaultSession.cookies.get({ domain: '.instagram.com' })
      for (const cookie of allCookies) {
        const cookieUrl = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`
        await session.defaultSession.cookies.remove(cookieUrl, cookie.name)
      }
      return { success: true }
    } catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('open-profile-login', async (event, username, partitionName, proxyUrl) => {
    const targetSession = session.fromPartition(partitionName, { cache: true })

    if (proxyUrl) {
      let parsedProxyRules = proxyUrl
      const match = proxyUrl.match(/^(https?|socks5?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/)
      if (match) {
        const [_, protocol, user, pass, host, port] = match
        if (user && pass) {
          proxyAuthCredentials[`${host}:${port}`] = { username: user, password: pass }
          parsedProxyRules = `${protocol}://${host}:${port}`
        }
      }
      await targetSession.setProxy({ proxyRules: parsedProxyRules, proxyBypassRules: '<local>' })
    } else {
      await targetSession.setProxy({})
    }

    configureChromeSession(targetSession)

    return new Promise((resolve) => {
      // Abrir navegador livre — o usuário navega como quiser
      // O sistema detecta automaticamente os cookies do Instagram quando o login for feito
      const loginWin = new BrowserWindow({
        width: 1200, height: 800,
        title: `Navegador — @${username} (faça login no Instagram quando quiser)`,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: targetSession,
          preload: path.join(__dirname, 'preload-browser.js'),
          sandbox: false,
        }
      })

      const INJECT_SCRIPT = getNavigatorPatchScript()

      loginWin.webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return
        loginWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })
      loginWin.webContents.on('dom-ready', () => {
        loginWin.webContents.executeJavaScript(INJECT_SCRIPT).catch(() => {})
      })

      // Abrir em página neutra — sem forçar o Instagram
      loginWin.loadURL('https://www.google.com')

      let resolved = false
      let pollInterval = null

      // Polling silencioso: verifica se cookies do Instagram aparecem
      const checkForSession = async () => {
        if (resolved || loginWin.isDestroyed()) return
        try {
          const cookies = await targetSession.cookies.get({ domain: '.instagram.com', name: 'sessionid' })
          if (cookies.length > 0) {
            resolved = true
            clearInterval(pollInterval)
            const allCookies = await targetSession.cookies.get({ domain: '.instagram.com' })
            const cookiesJson = JSON.stringify(allCookies)
            const mw = getMainWindow()
            if (mw && !mw.isDestroyed()) {
              mw.webContents.send('profile-login-complete', { success: true, username, cookiesJson })
            }
            setTimeout(() => { if (!loginWin.isDestroyed()) loginWin.close() }, 1200)
            resolve({ success: true, cookiesJson })
          }
        } catch (err) { /* ignora erros de polling */ }
      }

      // Verificar a cada 2 segundos
      pollInterval = setInterval(checkForSession, 2000)

      loginWin.on('closed', () => {
        clearInterval(pollInterval)
        if (!resolved) resolve({ success: false })
      })
    })
  })

}

module.exports = { registerSessionHandlers }
