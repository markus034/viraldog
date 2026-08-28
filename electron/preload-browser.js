/**
 * preload-browser.js
 * Roda no contexto isolado do renderer ANTES de qualquer script da página.
 * Oculta a identidade do Electron para que o Google (e outros sites) não
 * detectem o app como WebView/browser embutido.
 */

const { contextBridge, ipcRenderer } = require('electron')

const {
  brands,
  chromeUA: CHROME_UA,
  chromeVersion: CHROME_FULL_VERSION,
  fullVersionList: fullBrands,
} = require('./browser-identity')

// ── Expor electronAPI para o mundo MAIN (acessível via window.electronAPI) ──
// O interceptor.js da extensão IG Saver (rodando em world: MAIN) precisa de
// triggerDownload para enviar URLs de vídeo ao main process via IPC.
// Sem isso, o download cai num fallback DOM (<a>) que apenas abre o vídeo
// no browser em vez de salvar na pasta configurada.
contextBridge.exposeInMainWorld('electronAPI', {
  triggerDownload: (url, filename) => ipcRenderer.send('ig-browser-download-url', url, filename),
})

// Content scripts run in an isolated JavaScript world. Listen for their
// postMessage requests here as well, so downloads do not depend on the MAIN
// world being able to see window.electronAPI.
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (!event.data || event.data.type !== 'IG_SAVER_DOWNLOAD_REQUEST') return
  if (!event.data.url) return
  ipcRenderer.send(
    'ig-browser-download-url',
    event.data.url,
    event.data.filename || ''
  )
})

// Keep the toolbar button in sync when the menu is closed inside Instagram.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  if (!event.data || event.data.type !== 'VIRALDOG_IG_FAVORITES_MENU_CLOSED') return
  ipcRenderer.send('ig-browser-favorites-menu-closed')
})

const INSTAGRAM_RESERVED_ROUTES = new Set([
  'accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories',
  'about', 'developer', 'legal', 'privacy', 'web'
])

function profileFromDownloadButton(button) {
  const scope = button.closest('[role="dialog"], article') || document
  for (const link of scope.querySelectorAll('a[href]')) {
    try {
      const url = new URL(link.getAttribute('href'), location.origin)
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) continue
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length !== 1) continue
      const username = parts[0].replace(/^@+/, '')
      if (INSTAGRAM_RESERVED_ROUTES.has(username.toLowerCase())) continue
      if (/^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(username)) {
        return username
      }
    } catch (error) {}
  }
  return null
}

// Capture the author before the extension starts resolving/downloading media.
// This is a synchronous click hint used when Chromium drops profile/file from
// the native DownloadItem and leaves only an opaque CDN basename.
document.addEventListener('click', (event) => {
  const button = event.target?.closest?.(
    '#ig-saver-single-btn, #ig-saver-reels-btn, [data-ig-saver-post-btn] button, button[aria-label="Baixar esta publicação"], button[aria-label="Baixar este Reel"]'
  )
  if (!button) return
  // On /reels this button is not inside a stable article. Searching the whole
  // document can capture the account menu or a previously visited profile.
  // The extension sends the exact Reel owner in the structured filename.
  if (button.id === 'ig-saver-reels-btn') return
  const username = profileFromDownloadButton(button)
  if (username) ipcRenderer.send('ig-browser-current-download-profile', username)
}, true)

// ── 1. Sobrescrever navigator.userAgent ────────────────────────────────────
try {
  Object.defineProperty(navigator, 'userAgent', {
    get: () => CHROME_UA,
    configurable: true
  })
} catch (e) {}

// ── 2. Sobrescrever navigator.userAgentData (Chrome Client Hints) ──────────
// O Electron expõe a brand "Electron" aqui — o Google usa isso para detectar
try {
  const uaData = {
    brands,
    mobile: false,
    platform: 'Windows',
    getHighEntropyValues: async (hints) => ({
      architecture: 'x86',
      bitness: '64',
      brands,
      fullVersionList: fullBrands,
      mobile: false,
      model: '',
      platform: 'Windows',
      platformVersion: '10.0.0',
      uaFullVersion: CHROME_FULL_VERSION
    }),
    toJSON: () => ({ brands, mobile: false, platform: 'Windows' })
  }

  if ('userAgentData' in navigator) {
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => uaData,
      configurable: true
    })
  }
} catch (e) {}

// ── 3. Remover propriedades que identificam o Electron ─────────────────────
try {
  // Electron expõe window.process em alguns contextos
  if (typeof window !== 'undefined') {
    delete window.process
    delete window.__electron_preload
  }
} catch (e) {}

// ── 4. File Chooser: interceptar input[type=file] e abrir dialog nativo ─────
// O WebContentsView não abre o file picker nativo do OS por padrão.
// Esta solução captura o evento de clique ANTES do browser, abre o dialog
// nativo via IPC no main process, lê o arquivo como base64, e injeta de
// volta no input como um objeto File real via DataTransfer.
;(function () {
  const { ipcRenderer } = require('electron')

  function injectFileIntoInput (input, fileData) {
    try {
      // Reconstruir o File a partir do base64 recebido do main process
      const byteChars = atob(fileData.base64)
      const byteNums = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
      const blob = new Blob([byteNums], { type: fileData.mimeType })
      const file = new File([blob], fileData.filename, { type: fileData.mimeType })

      // ── Injeção React-compatível ──
      // Object.defineProperty NÃO funciona com React porque ele rastreia
      // o estado do input internamente via seu próprio fiber/event system.
      // O jeito correto é chamar o setter NATIVO do prototype, que o React observa.
      const dt = new DataTransfer()
      dt.items.add(file)

      // Pegar o setter nativo de HTMLInputElement (antes de qualquer override do React)
      const nativeFilesSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set
      if (nativeFilesSetter) {
        nativeFilesSetter.call(input, dt.files)
      } else {
        // Fallback
        try { Object.defineProperty(input, 'files', { value: dt.files, configurable: true, writable: true }) } catch (e) {}
      }

      // Disparar eventos em ordem: o React escuta 'input' e 'change' com bubbles
      const inputEvent  = new Event('input',  { bubbles: true, cancelable: true })
      const changeEvent = new Event('change', { bubbles: true, cancelable: true })

      // Simular que o evento veio do próprio input (necessário para alguns handlers do Instagram)
      Object.defineProperty(inputEvent,  'target', { writable: false, value: input })
      Object.defineProperty(changeEvent, 'target', { writable: false, value: input })

      input.dispatchEvent(inputEvent)
      input.dispatchEvent(changeEvent)

      // Forçar React Fiber a processar se disponível
      const fiberKey = Object.keys(input).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))
      if (fiberKey) {
        try {
          const fiber = input[fiberKey]
          const onChange = fiber?.pendingProps?.onChange || fiber?.memoizedProps?.onChange
          if (typeof onChange === 'function') {
            onChange({ target: input, currentTarget: input, bubbles: true, nativeEvent: changeEvent })
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[ViralDog] Erro ao injetar arquivo no input:', err)
    }
  }


  // Interceptar cliques em inputs de arquivo em toda a página (incluindo Shadow DOM)
  document.addEventListener('click', async function (e) {
    const input = e.target.closest('input[type="file"]') || (e.target.tagName === 'INPUT' && e.target.type === 'file' ? e.target : null)
    if (!input) return

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    try {
      const acceptAttr = input.getAttribute('accept') || ''
      const fileData = await ipcRenderer.invoke('open-file-dialog', { accept: acceptAttr })
      if (fileData) {
        injectFileIntoInput(input, fileData)
      }
    } catch (err) {
      console.warn('[ViralDog] Erro ao abrir dialog de arquivo:', err)
    }
  }, true) // capture=true para interceptar antes do Instagram

  // Também interceptar quando a página cria inputs dinamicamente (Instagram faz isso)
  const _origCreate = document.createElement.bind(document)
  document.createElement = function (tag) {
    const el = _origCreate(tag)
    if (tag.toLowerCase() === 'input') {
      // Observar quando type=file for definido
      const _origSetAttr = el.setAttribute.bind(el)
      el.setAttribute = function (name, value) {
        _origSetAttr(name, value)
        // Quando o input for type=file, bloquear o click nativo
        if (name === 'type' && value === 'file') {
          el.addEventListener('click', async function (ev) {
            ev.preventDefault()
            ev.stopImmediatePropagation()
            try {
              const acceptAttr = el.getAttribute('accept') || ''
              const fileData = await ipcRenderer.invoke('open-file-dialog', { accept: acceptAttr })
              if (fileData) injectFileIntoInput(el, fileData)
            } catch (err) {}
          }, true)
        }
      }
    }
    return el
  }
})()
