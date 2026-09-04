const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Controle do Instagram (janela popup com IG Saver)
  openInstagram: (username) => ipcRenderer.send('open-instagram-profile', username),

  // Sessão do Instagram (login/logout via cookies)
  openInstagramLogin: () => ipcRenderer.invoke('open-instagram-login'),
  openInstagramOAuth: (authUrl) => ipcRenderer.invoke('open-instagram-oauth', authUrl),
  checkInstagramSession: () => ipcRenderer.invoke('check-instagram-session'),
  logoutInstagram: () => ipcRenderer.invoke('logout-instagram'),
  onLoginComplete: (callback) => {
    ipcRenderer.removeAllListeners('instagram-login-complete')
    ipcRenderer.on('instagram-login-complete', (event, value) => callback(value))
  },
  removeLoginComplete: () => ipcRenderer.removeAllListeners('instagram-login-complete'),

  // Download automático com janela oculta
  startIgDownload: (params) => ipcRenderer.invoke('start-ig-download', params),
  cancelIgDownload: () => ipcRenderer.send('cancel-ig-download'),
  onDownloadLog: (callback) => {
    ipcRenderer.removeAllListeners('ig-download-log')
    ipcRenderer.on('ig-download-log', (event, value) => callback(value))
  },
  removeDownloadLog: () => ipcRenderer.removeAllListeners('ig-download-log'),

  // Downloads capturados pelo Electron
  onDownloadStatus: (callback) => {
    ipcRenderer.removeAllListeners('download-status')
    ipcRenderer.on('download-status', (event, value) => callback(value))
  },
  removeDownloadStatus: () => ipcRenderer.removeAllListeners('download-status'),

  // Seleção de diretório nativo
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Controle do navegador IG integrado
  showIgBrowser: (bounds, partitionName, proxyUrl) => ipcRenderer.send('show-ig-browser', bounds, partitionName, proxyUrl),
  hideIgBrowser: () => ipcRenderer.send('hide-ig-browser'),
  updateIgBrowserBounds: (bounds) => ipcRenderer.send('update-ig-browser-bounds', bounds),
  igBrowserGoBack: () => ipcRenderer.send('ig-browser-back'),
  igBrowserGoForward: () => ipcRenderer.send('ig-browser-forward'),
  igBrowserReload: () => ipcRenderer.send('ig-browser-reload'),
  igBrowserGoHome: () => ipcRenderer.send('ig-browser-home'),
  igBrowserGoToUrl: (url) => ipcRenderer.send('ig-browser-go-to-url', url),
  setIgFavoritesMenu: (payload) => ipcRenderer.send('set-ig-favorites-menu', payload),
  onIgFavoritesMenuClosed: (callback) => {
    ipcRenderer.removeAllListeners('ig-favorites-menu-closed')
    ipcRenderer.on('ig-favorites-menu-closed', () => callback())
  },
  removeIgFavoritesMenuClosed: () => ipcRenderer.removeAllListeners('ig-favorites-menu-closed'),
  triggerDownload: (url, filename) => ipcRenderer.send('ig-browser-download-url', url, filename),
  onIgBrowserNavigated: (callback) => {
    ipcRenderer.removeAllListeners('ig-browser-navigated')
    ipcRenderer.on('ig-browser-navigated', (event, data) => callback(data))
  },
  removeIgBrowserNavigated: () => ipcRenderer.removeAllListeners('ig-browser-navigated'),
  setDownloadFolder: (folder) => ipcRenderer.send('set-download-folder', folder),

  // Google bloqueia autenticação em WebContentsView. Abre um Chrome real,
  // mantendo um perfil externo isolado para cada conta do MultiLogin.
  openExternalProfileBrowser: (profileKey, proxyUrl, url, sessionCookies) =>
    ipcRenderer.invoke('open-external-profile-browser', profileKey, proxyUrl, url, sessionCookies),
  onExternalBrowserStatus: (callback) => {
    ipcRenderer.removeAllListeners('external-browser-status')
    ipcRenderer.on('external-browser-status', (event, value) => callback(value))
  },
  removeExternalBrowserStatus: () => ipcRenderer.removeAllListeners('external-browser-status'),
  startExternalInstagramLogin: (profileKey, username, proxyUrl) =>
    ipcRenderer.invoke('start-external-instagram-login', profileKey, username, proxyUrl),
  cancelExternalInstagramLogin: (profileKey) =>
    ipcRenderer.send('cancel-external-instagram-login', profileKey),

  // Login de Perfil do MultiLogin
  openProfileLogin: (username, partitionName, proxyUrl) => ipcRenderer.invoke('open-profile-login', username, partitionName, proxyUrl),
  onProfileLoginComplete: (callback) => {
    const listener = (event, value) => callback(value)
    ipcRenderer.on('profile-login-complete', listener)
    return () => ipcRenderer.removeListener('profile-login-complete', listener)
  },
  removeProfileLoginComplete: () => ipcRenderer.removeAllListeners('profile-login-complete'),

  // Polling de auth no navegador interno
  startAuthSessionPoll: (partitionName, username) => ipcRenderer.send('start-auth-session-poll', partitionName, username),
  stopAuthSessionPoll: () => ipcRenderer.send('stop-auth-session-poll'),

  // Meta OAuth Deep Link listener (viraldog://auth/callback)
  onMetaOAuthComplete: (callback) => {
    const listener = (event, value) => callback(value)
    ipcRenderer.on('meta-oauth-complete', listener)
    return () => ipcRenderer.removeListener('meta-oauth-complete', listener)
  },
  removeMetaOAuthComplete: () => ipcRenderer.removeAllListeners('meta-oauth-complete'),
})
