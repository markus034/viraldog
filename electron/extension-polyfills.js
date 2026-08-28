/**
 * Extension Polyfills — chrome.offscreen and chrome.runtime.getContexts
 * polyfills for the IG Saver extension running in Electron.
 */
const { BrowserWindow, session } = require('electron')

let offscreenWin = null

async function ensureOffscreenWindow(extensionPath) {
  if (offscreenWin && !offscreenWin.isDestroyed()) return

  const extensions = session.defaultSession.getAllExtensions()
  const igSaverExt = extensions.find(ext => ext.path.replace(/\\/g, '/').includes('ig-saver'))
  if (!igSaverExt) {
    console.log('[Offscreen] Extensão IG Saver não encontrada, pulando polyfill')
    return
  }

  offscreenWin = new BrowserWindow({
    show: false, width: 1, height: 1,
    webPreferences: { nodeIntegration: false, contextIsolation: false, session: session.defaultSession }
  })

  const offscreenUrl = `chrome-extension://${igSaverExt.id}/offscreen.html`
  try {
    await offscreenWin.loadURL(offscreenUrl)
    console.log(`[Offscreen] Polyfill carregado: ${offscreenUrl}`)
  } catch (err) {
    console.error('[Offscreen] Falha:', err.message)
    try {
      await offscreenWin.loadURL(`file://${extensionPath.replace(/\\/g, '/')}/offscreen.html`)
    } catch (err2) {
      console.error('[Offscreen] Fallback falhou:', err2.message)
    }
  }
  offscreenWin.on('closed', () => { offscreenWin = null })
}

const POLYFILL_CODE = `
(function() {
  if (typeof chrome !== 'undefined') {
    if (!chrome.offscreen) {
      chrome.offscreen = {
        createDocument: function() { return Promise.resolve(); },
        closeDocument: function() { return Promise.resolve(); },
        Reason: { BLOBS: 'BLOBS' }
      };
    }
    if (chrome.runtime && !chrome.runtime.getContexts) {
      chrome.runtime.getContexts = function(filter) {
        if (filter && filter.contextTypes && filter.contextTypes.includes('OFFSCREEN_DOCUMENT')) {
          return Promise.resolve([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
        }
        return Promise.resolve([]);
      };
    }
  }
})();
`

function injectOffscreenPolyfill(webContents) {
  if (webContents.isDestroyed()) return
  webContents.executeJavaScript(POLYFILL_CODE).catch(err => {
    if (!err.message.includes('destroyed')) console.error('[Polyfill] Erro:', err.message)
  })
  webContents.on('did-finish-load', () => {
    if (!webContents.isDestroyed()) webContents.executeJavaScript(POLYFILL_CODE).catch(() => {})
  })
}

function setupPolyfillInjection(loadedExtension) {
  const { app, webContents: wcModule } = require('electron')
  app.on('web-contents-created', (event, webContents) => {
    const url = webContents.getURL()
    if (url.includes(loadedExtension.id) || url.includes('ig-saver')) {
      injectOffscreenPolyfill(webContents)
    }
  })
  for (const wc of wcModule.getAllWebContents()) {
    const url = wc.getURL()
    if (url.includes(loadedExtension.id) || url.includes('ig-saver')) {
      injectOffscreenPolyfill(wc)
    }
  }
}

module.exports = { ensureOffscreenWindow, injectOffscreenPolyfill, setupPolyfillInjection }
