/**
 * Download Manager — ZIP building, file downloads, extraction,
 * and Electron session download interception for IG Saver.
 *
 * Duplicate detection strategy:
 *   - Maintains an in-memory Set of known shortcodes (downloadedShortcodes).
 *   - Populated from the backend on startup via loadDownloadedShortcodes().
 *   - will-download handler is FULLY SYNCHRONOUS — no await allowed there,
 *     because Electron does not await async event handlers. Any await before
 *     setSavePath or item.cancel() would be ignored and the download would
 *     proceed to the default save location.
 */
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const archiver = require('archiver')
const AdmZip = require('adm-zip')

let mainWindow = null
let customDownloadFolder = null

function getMainWindow() { return mainWindow }
function setMainWindow(win) { mainWindow = win }
function getDownloadFolder() { return customDownloadFolder }
function setDownloadFolder(folder) { customDownloadFolder = folder }

// ── In-memory shortcode cache for synchronous dedup ──────────────────────────
// Populated from backend on startup, updated after every successful download.
const downloadedShortcodes = new Set()

// ── Pending filenames: extension-provided filenames keyed by download URL ────
// The IG Saver extension provides structured filenames like "username/file.mp4"
// which contain the profile name as the first path segment. We store these
// before calling downloadURL() so the will-download handler can use them.
const pendingFilenames = new Map()
const pendingHistory = []
const sessionProfiles = new WeakMap()
const reservedVideoNumbers = new Map()
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'])

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return ''
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url.split('?')[0]
  }
}

function setPendingFilename(url, filename) {
  if (url && filename) {
    pendingFilenames.set(url, filename)
    const norm = normalizeUrl(url)
    if (norm && norm !== url) pendingFilenames.set(norm, filename)
    pendingHistory.push({ url, normalizedUrl: norm, filename, ts: Date.now() })
    if (pendingHistory.length > 50) pendingHistory.shift()
  }
}

/**
 * Consume (get + delete) the pending filename for a URL.
 * Returns the filename if found, or null.
 */
function consumePendingFilename(url) {
  if (!url) return null
  let fn = pendingFilenames.get(url)
  if (fn) {
    pendingFilenames.delete(url)
    return fn
  }
  const norm = normalizeUrl(url)
  if (norm) {
    fn = pendingFilenames.get(norm)
    if (fn) {
      pendingFilenames.delete(norm)
      return fn
    }
  }
  // Fallback: check recent pending history within 15 seconds for URL or normalized URL match
  const now = Date.now()
  for (let i = pendingHistory.length - 1; i >= 0; i--) {
    const item = pendingHistory[i]
    if (now - item.ts > 15000) {
      pendingHistory.splice(0, i + 1)
      break
    }
    if (item.url === url || (norm && item.normalizedUrl === norm)) {
      pendingHistory.splice(i, 1)
      return item.filename
    }
  }
  return null
}

function sanitizeProfileName(value) {
  if (typeof value !== 'string') return null
  const username = value.trim().replace(/^@+/, '')
  const validShape = /^[A-Za-z0-9_](?:[A-Za-z0-9._-]{0,28}[A-Za-z0-9_-])?$/.test(username) || /^[A-Za-z0-9_.-]{1,30}$/.test(username)
  return validShape && !username.includes('..') ? username : null
}

function resolveProfileName(fileName, extensionPath) {
  if (extensionPath) {
    const segments = extensionPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (segments.length > 1) return sanitizeProfileName(segments[0])

    const structuredName = path.basename(segments[0] || '', path.extname(segments[0] || ''))
    const ttPrefixMatch = structuredName.match(/^(?:Dog_Saver_TikTok_|TikTok_)(@?[A-Za-z0-9._-]{1,30})/i)
    if (ttPrefixMatch) return sanitizeProfileName(ttPrefixMatch[1])
    const structuredMatch = structuredName.match(/^@?([A-Za-z0-9._-]{1,30})_(?:instagram|tiktok|stories|highlights)(?:_|$)/i)
    if (structuredMatch) return sanitizeProfileName(structuredMatch[1])
  }

  const strFileName = String(fileName || '')
  const baseWithoutExt = path.basename(strFileName, path.extname(strFileName))
  const ttPrefixMatch = baseWithoutExt.match(/^(?:Dog_Saver_TikTok_|TikTok_)(@?[A-Za-z0-9._-]{1,30})/i)
  if (ttPrefixMatch) return sanitizeProfileName(ttPrefixMatch[1])
  const zipMatch = strFileName.match(/^@?([A-Za-z0-9._-]{1,30})_(?:instagram|tiktok|stories|highlights)(?:_|\.zip)/i)
  if (zipMatch) return sanitizeProfileName(zipMatch[1])
  return null
}

function getOrCreateProfileDirectory(outDir, username) {
  const safeUsername = sanitizeProfileName(username)
  if (!safeUsername) throw new Error('Nome de perfil ausente ou inválido')
  const targetDir = path.join(outDir, safeUsername)
  // Always ensure the profile directory exists before assigning the video
  // save path. recursive=true makes this safe when the folder already exists.
  fs.mkdirSync(targetDir, { recursive: true })
  return targetDir
}

function getNumberedVideoFileName(targetDir, fileName) {
  const ext = path.extname(fileName).toLowerCase()
  if (!VIDEO_EXTENSIONS.has(ext)) return fileName

  const directoryKey = path.resolve(targetDir).toLowerCase()
  let nextNumber = reservedVideoNumbers.get(directoryKey)
  if (nextNumber == null) {
    let highestNumber = 0
    if (fs.existsSync(targetDir)) {
      for (const existingName of fs.readdirSync(targetDir)) {
        const match = existingName.match(/^(\d{3,})\.\s/)
        if (match) highestNumber = Math.max(highestNumber, Number(match[1]))
      }
    }
    nextNumber = highestNumber + 1
  }

  reservedVideoNumbers.set(directoryKey, nextNumber + 1)
  const cleanName = fileName.replace(/^\d{3,}\.\s*/, '')
  return `${String(nextNumber).padStart(3, '0')}. ${cleanName}`
}

function extractInstagramProfileFromUrl(value) {
  try {
    const url = new URL(value)
    if (/(^|\.)tiktok\.com$/i.test(url.hostname)) {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length > 0 && parts[0].startsWith('@')) {
        return sanitizeProfileName(parts[0].slice(1))
      }
    }
    if (/(^|\.)instagram\.com$/i.test(url.hostname)) {
      const firstSegment = url.pathname.split('/').filter(Boolean)[0]
      const reservedRoutes = new Set([
        'accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories',
        'about', 'developer', 'legal', 'privacy', 'web'
      ])
      if (!firstSegment || reservedRoutes.has(firstSegment.toLowerCase())) return null
      return sanitizeProfileName(firstSegment)
    }
    return null
  } catch (error) {
    return null
  }
}

function rememberInstagramProfile(sess, url) {
  const username = extractInstagramProfileFromUrl(url)
  if (sess && username) sessionProfiles.set(sess, username)
  return username
}

function extractProfileFromSuggestedPath(savePath, outDir) {
  if (!savePath || !outDir) return null
  try {
    const relativePath = path.relative(path.resolve(outDir), path.resolve(savePath))
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
    const segments = relativePath.split(path.sep).filter(Boolean)
    return segments.length > 1 ? sanitizeProfileName(segments[0]) : null
  } catch (error) {
    return null
  }
}

/**
 * Fetch all downloaded shortcodes from the backend and populate the local cache.
 * Called once after the backend is ready. Safe to call multiple times.
 */
function loadDownloadedShortcodes() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 8000, path: '/api/download/shortcodes', method: 'GET' },
      (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (Array.isArray(json.shortcodes)) {
              json.shortcodes.forEach((sc) => downloadedShortcodes.add(sc))
              console.log(`[DownloadManager] Loaded ${downloadedShortcodes.size} shortcodes into dedup cache.`)
            }
          } catch (e) {
            console.warn('[DownloadManager] Could not parse shortcodes response:', e.message)
          }
          resolve()
        })
      }
    )
    req.on('error', (err) => {
      console.warn('[DownloadManager] Could not load shortcodes (backend not ready?):', err.message)
      resolve()
    })
    req.setTimeout(5000, () => { req.destroy(); resolve() })
    req.end()
  })
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fetchBuffer(url, maxRetries = 2) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return }
    if (url.startsWith('data:')) {
      try {
        const base64Index = url.indexOf(';base64,')
        const data = base64Index !== -1 ? url.slice(base64Index + 8) : url.split(',')[1] || ''
        const buf = Buffer.from(data, 'base64')
        resolve(buf)
      } catch (err) {
        resolve(null)
      }
      return
    }

    const isTikTok = url.includes('tiktok') || url.includes('byteoversea') || url.includes('ibyteimg')
    const referer = isTikTok ? 'https://www.tiktok.com/' : 'https://www.instagram.com/'
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Referer': referer,
      'Accept': '*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site'
    }

    const doFetch = (fetchUrl, retriesLeft, redirectCount = 0) => {
      if (redirectCount > 5) { resolve(null); return }
      const mod = fetchUrl.startsWith('https') ? https : http
      const req = mod.get(fetchUrl, { timeout: 35000, headers }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          doFetch(res.headers.location, retriesLeft, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          if (retriesLeft > 0 && (res.statusCode === 429 || res.statusCode >= 500)) {
            setTimeout(() => doFetch(fetchUrl, retriesLeft - 1, redirectCount), 1000 * (maxRetries - retriesLeft + 1))
          } else { resolve(null) }
          return
        }
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', () => {
          if (retriesLeft > 0) setTimeout(() => doFetch(fetchUrl, retriesLeft - 1, redirectCount), 1000)
          else resolve(null)
        })
      })
      req.on('error', () => {
        if (retriesLeft > 0) setTimeout(() => doFetch(fetchUrl, retriesLeft - 1, redirectCount), 1000)
        else resolve(null)
      })
      req.on('timeout', () => {
        req.destroy()
        if (retriesLeft > 0) setTimeout(() => doFetch(fetchUrl, retriesLeft - 1, redirectCount), 1000)
        else resolve(null)
      })
    }
    doFetch(url, maxRetries)
  })
}

function downloadFileStream(url, destPath, maxRetries = 2) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return }
    if (url.startsWith('data:')) {
      try {
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
        const base64Index = url.indexOf(';base64,')
        const data = base64Index !== -1 ? url.slice(base64Index + 8) : url.split(',')[1] || ''
        const buf = Buffer.from(data, 'base64')
        fs.writeFileSync(destPath, buf)
        resolve(true)
      } catch (err) {
        resolve(false)
      }
      return
    }

    const isTikTok = url.includes('tiktok') || url.includes('byteoversea') || url.includes('ibyteimg')
    const referer = isTikTok ? 'https://www.tiktok.com/' : 'https://www.instagram.com/'
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Referer': referer,
      'Accept': '*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site'
    }

    const doStream = (fetchUrl, retriesLeft, redirectCount = 0) => {
      if (redirectCount > 5) { resolve(false); return }
      const mod = fetchUrl.startsWith('https') ? https : http
      const req = mod.get(fetchUrl, { timeout: 35000, headers }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          doStream(res.headers.location, retriesLeft, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          if (retriesLeft > 0 && (res.statusCode === 429 || res.statusCode >= 500)) {
            setTimeout(() => doStream(fetchUrl, retriesLeft - 1, redirectCount), 1000 * (maxRetries - retriesLeft + 1))
          } else {
            resolve(false)
          }
          return
        }

        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

        const tmpPath = destPath + `.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const fileStream = fs.createWriteStream(tmpPath)

        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(destPath)) {
                try { fs.unlinkSync(destPath) } catch (_) {}
              }
              fs.renameSync(tmpPath, destPath)
              resolve(true)
            } catch (err) {
              try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch (_) {}
              resolve(false)
            }
          })
        })

        fileStream.on('error', () => {
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch (_) {}
          if (retriesLeft > 0) setTimeout(() => doStream(fetchUrl, retriesLeft - 1, redirectCount), 1000)
          else resolve(false)
        })

        res.on('error', () => {
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch (_) {}
          if (retriesLeft > 0) setTimeout(() => doStream(fetchUrl, retriesLeft - 1, redirectCount), 1000)
          else resolve(false)
        })
      })

      req.on('error', () => {
        if (retriesLeft > 0) setTimeout(() => doStream(fetchUrl, retriesLeft - 1, redirectCount), 1000)
        else resolve(false)
      })

      req.on('timeout', () => {
        req.destroy()
        if (retriesLeft > 0) setTimeout(() => doStream(fetchUrl, retriesLeft - 1, redirectCount), 1000)
        else resolve(false)
      })
    }

    doStream(url, maxRetries)
  })
}

async function downloadBatchDirectNative(username, items, options = {}) {
  const safeUsername = sanitizeProfileName(username) || resolveProfileName(options.filename, options.filename) || 'downloads'
  const outDir = customDownloadFolder || path.join(__dirname, '../downloads')
  const profileDir = getOrCreateProfileDirectory(outDir, safeUsername)

  const concurrency = Math.max(options.concurrency || 8, 8)
  let downloaded = 0, failed = 0, skipped = 0, current = 0
  const total = items.length

  const sendProgress = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ig-download-log', {
        message: `⬇️ Baixando em alta velocidade: ${current}/${total} (${downloaded} prontos, ${skipped} existentes)...`,
        type: 'info',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    }
  }

  sendProgress()

  let idx = 0
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++
      const item = items[i]
      if (!item || !item.url) { failed++; current++; continue }

      // Resolver caminho relativo de destino limpo
      let itemRelPath = (item.path || path.basename(item.url)).replace(/\\/g, '/').replace(/^\/+/, '')
      const segments = itemRelPath.split('/').filter(Boolean)
      if (segments.length > 1 && sanitizeProfileName(segments[0])?.toLowerCase() === safeUsername.toLowerCase()) {
        itemRelPath = segments.slice(1).join('/')
      }

      const destPath = path.join(profileDir, itemRelPath)
      const fileName = path.basename(destPath)
      const shortcode = extractShortcodeFromBasename(fileName)

      // Verificação rápida de duplicatas: arquivo já existe ou já cadastrado
      if (fs.existsSync(destPath)) {
        try {
          const stat = fs.statSync(destPath)
          if (stat.size > 1024) {
            if (shortcode) downloadedShortcodes.add(shortcode)
            notifyBackendDownload(destPath, safeUsername)
            downloaded++
            skipped++
            current++
            if (current % 4 === 0 || current === total) sendProgress()
            continue
          }
        } catch (_) {}
      }

      // Download direto via stream de alta velocidade
      const ok = await downloadFileStream(item.url, destPath)
      if (ok && fs.existsSync(destPath)) {
        if (shortcode) downloadedShortcodes.add(shortcode)
        notifyBackendDownload(destPath, safeUsername)
        downloaded++
      } else {
        failed++
      }

      current++
      if (current % 4 === 0 || current === total) sendProgress()
    }
  }

  const workers = []
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker())
  }
  await Promise.all(workers)

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (downloaded > 0) {
      mainWindow.webContents.send('download-status', { state: 'completed', filename: `${safeUsername}_batch`, path: profileDir })
      mainWindow.webContents.send('ig-download-log', {
        message: `✅ Lote concluído! ${downloaded} arquivos salvos em @${safeUsername} (${skipped} existentes)`,
        type: 'success',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    } else {
      mainWindow.webContents.send('download-status', { state: 'failed', filename: `${safeUsername}_batch`, error: 'Nenhum arquivo baixado' })
      mainWindow.webContents.send('ig-download-log', {
        message: `❌ Falha ao baixar lote para @${safeUsername}`,
        type: 'error',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    }
  }

  return { success: downloaded > 0, downloaded, failed, skipped, zipPath: profileDir }
}

async function buildZipNative(username, items, options = {}) {
  // Redireciona diretamente para o pipeline contínuo em disco ultra-rápido
  return downloadBatchDirectNative(username, items, options)
}

function notifyBackendDownload(filePath, profileSource) {
  const postData = JSON.stringify({
    file_path: filePath,
    profile_source: profileSource || 'ig_saver_electron'
  })
  const req = http.request({
    hostname: '127.0.0.1', port: 8000, path: '/api/download/register',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (res) => console.log(`Backend registration status: ${res.statusCode}`))
  req.on('error', (err) => console.error('Failed to notify backend:', err.message))
  req.write(postData)
  req.end()
}

function mergeDirectoryContents(sourceDir, targetDir, movedFiles = []) {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const requestedTarget = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      if (fs.existsSync(requestedTarget) && !fs.statSync(requestedTarget).isDirectory()) {
        const uniqueDir = getUniqueSavePath(targetDir, entry.name)
        fs.renameSync(sourcePath, uniqueDir)
      } else {
        mergeDirectoryContents(sourcePath, requestedTarget, movedFiles)
        fs.rmSync(sourcePath, { recursive: true, force: true })
      }
    } else {
      const numberedName = getNumberedVideoFileName(targetDir, entry.name)
      const numberedTarget = path.join(targetDir, numberedName)
      const targetPath = fs.existsSync(numberedTarget)
        ? getUniqueSavePath(targetDir, numberedName)
        : numberedTarget
      fs.renameSync(sourcePath, targetPath)
      movedFiles.push(targetPath)
    }
  }
  return movedFiles
}

function extractAndRenameZip(savePath, fileName, outDir, profileName) {
  if (!fileName.toLowerCase().endsWith('.zip')) return null
  const username = sanitizeProfileName(profileName) || resolveProfileName(fileName, fileName)
  if (!username) {
    console.error('[ZIP Extraction] Falha: perfil não identificado')
    return null
  }

  const stagingDir = `${savePath}.extract-${process.pid}-${Date.now()}`
  try {
    console.log(`[ZIP Extraction] Iniciando: ${savePath}`)
    const zip = new AdmZip(savePath)
    zip.extractAllTo(stagingDir, true)

    const targetDir = getOrCreateProfileDirectory(outDir, username)
    const rootEntries = fs.readdirSync(stagingDir, { withFileTypes: true })
    let sourceDir = stagingDir
    if (rootEntries.length === 1 && rootEntries[0].isDirectory()) {
      // Bulk profile ZIPs generated by Dog Saver use either "<username>/"
      // or "<username>_instagram/" as their only root directory. Unwrap both
      // forms so files land directly in outDir/<username>/, just like a
      // single-video download, instead of outDir/<username>/<username>/.
      const rootName = rootEntries[0].name.replace(/_instagram$/i, '')
      if (sanitizeProfileName(rootName)?.toLowerCase() === username.toLowerCase()) {
        sourceDir = path.join(stagingDir, rootEntries[0].name)
      }
    }

    const extractedFiles = mergeDirectoryContents(sourceDir, targetDir)
    fs.rmSync(stagingDir, { recursive: true, force: true })
    fs.unlinkSync(savePath)
    console.log(`[ZIP Extraction] Conteúdo mesclado em: ${targetDir}`)
    return { targetDir, extractedFiles }
  } catch (err) {
    try { fs.rmSync(stagingDir, { recursive: true, force: true }) } catch (cleanupErr) {}
    console.error('[ZIP Extraction] Falha:', err.message)
    return null
  }
}

// ── URL-level dedup (prevents same URL downloaded twice within 3s) ─────────────
const registeredSessions = new Set()
const activeDownloads = new Map() // url -> timestamp
const DEDUP_WINDOW_MS = 3000

function isDownloadDuplicate(url) {
  const now = Date.now()
  for (const [key, ts] of activeDownloads) {
    if (now - ts > DEDUP_WINDOW_MS) activeDownloads.delete(key)
  }
  if (activeDownloads.has(url)) return true
  activeDownloads.set(url, now)
  return false
}

function getUniqueSavePath(dir, fileName) {
  let savePath = path.join(dir, fileName)
  if (!fs.existsSync(savePath)) return savePath
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let counter = 1
  while (fs.existsSync(savePath)) {
    savePath = path.join(dir, `${base}_${counter}${ext}`)
    counter++
  }
  return savePath
}

/**
 * Extract username and shortcode from an IG Saver filename path.
 *
 * The extension generates paths like:
 *   - "username/20240727_1500_CxAbC123.mp4"       (flat / single download)
 *   - "username/2024-07-27_CxAbC123/20240727_1500_CxAbC123.mp4" (batch)
 *   - "username/stories/20240727_1500_CxAbC123.mp4"
 *   - "username/highlights/title/20240727_1500_CxAbC123.mp4"
 *
 * The username is ALWAYS the first path segment.
 * The shortcode is extracted from the file's basename: the segment after the
 * first timestamp (YYYYMMDD_HHMM) pattern.
 */
function extractUsernameAndShortcode(fileName, extensionPath) {
  // Strategy 1: if we have the full extension-provided path, the first
  // segment is always the username.
  if (extensionPath) {
    const normalized = extensionPath.replace(/\\/g, '/')
    const segments = normalized.split('/').filter(Boolean)
    const username = resolveProfileName(fileName, extensionPath)
    // The actual filename is the last segment
    const actualFile = segments[segments.length - 1] || fileName
    const shortcode = extractShortcodeFromBasename(actualFile)
    return { username, shortcode }
  }

  // Strategy 2: fallback — parse from the bare filename (CDN name)
  // CDN filenames are opaque and must never be interpreted as profile names.
  return { username: null, shortcode: null }
}

/**
 * Extract the shortcode from a basename like "20240727_1500_CxAbC123.mp4"
 * or "20240727_1500_CxAbC123_0.mp4" (carousel index).
 */
function extractShortcodeFromBasename(filename) {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  // Pattern: YYYYMMDD_HHMM_SHORTCODE or YYYYMMDD_HHMM_SHORTCODE_INDEX
  const match = base.match(/^\d{8}_\d{4}_([A-Za-z0-9_-]+?)(?:_\d+)?$/)
  if (match && match[1].length >= 6) return match[1]
  // TikTok ID pattern: e.g. 7412345678901234567 or timestamp_7412345678901234567
  const ttMatch = base.match(/(\d{15,22})/)
  if (ttMatch) return ttMatch[1]
  // Fallback: last underscore segment >= 6 chars
  const lastIdx = base.lastIndexOf('_')
  if (lastIdx > 0) {
    const candidate = base.substring(lastIdx + 1)
    if (/^[A-Za-z0-9_-]+$/.test(candidate) && candidate.length >= 6) return candidate
  }
  return null
}

/**
 * IMPORTANT: will-download MUST be synchronous.
 * Electron does not await async handlers — any await before setSavePath
 * or item.cancel() will be ignored, and the download proceeds without
 * a defined save path (causing a save dialog or default path to be used).
 *
 * That's why duplicate detection uses the in-memory downloadedShortcodes Set
 * (populated on startup from the backend) instead of an async HTTP call.
 */
function setupExtensionDownloadInterceptor(sess) {
  if (!sess) return
  if (registeredSessions.has(sess)) return
  registeredSessions.add(sess)

  sess.on('will-download', (event, item, webContents) => {
    const fileName = item.getFilename()
    const url = item.getURL()
    const outDir = customDownloadFolder || path.join(__dirname, '../downloads')

    // ── Guard 1: URL-level dedup (same URL fired multiple times in 3s) ──
    if (isDownloadDuplicate(url)) {
      console.log(`[Download] Dedup: cancelling duplicate for ${fileName}`)
      item.cancel()
      return
    }

    const extensionFilename = consumePendingFilename(url)
    const requestedFileName = extensionFilename ? path.basename(extensionFilename) : fileName
    const isZip = requestedFileName.toLowerCase().endsWith('.zip')
    const suggestedSavePath = item.getSavePath?.() || ''
    const username = resolveProfileName(fileName, extensionFilename)
      || extractProfileFromSuggestedPath(suggestedSavePath, outDir)
      || rememberInstagramProfile(sess, webContents?.getURL?.())
      || sessionProfiles.get(sess)

    if (!username) {
      console.error(`[Download] Perfil não identificado; download cancelado: ${requestedFileName}`)
      item.cancel()
      activeDownloads.delete(url)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-status', {
          state: 'failed', filename: requestedFileName, error: 'Não foi possível identificar o perfil do Instagram'
        })
        mainWindow.webContents.send('ig-download-log', {
          message: `❌ Perfil não identificado: ${requestedFileName}`, type: 'error',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      }
      return
    }

    // ── ZIP: go directly to outDir (original behaviour) ──
    if (isZip) {
      const savePath = getUniqueSavePath(outDir, requestedFileName)
      if (!fs.existsSync(outDir)) {
        try { fs.mkdirSync(outDir, { recursive: true }) } catch (err) {}
      }
      item.setSavePath(savePath)
      const displayName = path.basename(savePath)

      item.on('updated', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-status', {
            state: 'downloading', filename: displayName,
            received: item.getReceivedBytes(), total: item.getTotalBytes()
          })
        }
      })

      item.once('done', (event, state) => {
        activeDownloads.delete(url)
        if (state === 'completed') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-status', { state: 'extracting', filename: displayName, path: savePath })
            mainWindow.webContents.send('ig-download-log', {
              message: `✅ Capturado: ${displayName}`, type: 'success',
              timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            })
          }
          const extraction = extractAndRenameZip(savePath, requestedFileName, outDir, username)
          if (extraction) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-status', { state: 'completed', filename: displayName, path: extraction.targetDir })
            }
            extraction.extractedFiles.forEach((filePath) => notifyBackendDownload(filePath, username))
          } else if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-status', {
              state: 'failed', filename: displayName, error: 'Falha ao extrair o ZIP; o arquivo foi preservado'
            })
          }
        } else {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-status', { state: 'failed', filename: displayName, error: state })
          }
        }
      })
      return
    }

    // ── Individual (non-ZIP): extract profile name, check dedup cache ──
    // Use extension-provided filename (has username/path structure) when available
    const { shortcode } = extractUsernameAndShortcode(fileName, extensionFilename)

    // Guard 2: shortcode-level dedup via in-memory cache (synchronous)
    if (shortcode && downloadedShortcodes.has(shortcode)) {
      console.log(`[Download] Duplicate shortcode ${shortcode} (${fileName}), cancelling.`)
      item.cancel()
      activeDownloads.delete(url)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-status', { state: 'duplicate', filename: fileName, shortcode })
        mainWindow.webContents.send('ig-download-log', {
          message: `⚠️ Já baixado: ${fileName}`, type: 'warning',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      }
      return
    }

    // Build the save path: always flat under <outDir>/<username>/
    // The actual filename is the last segment from the extension path,
    // or the CDN filename as fallback.
    const actualFileName = extensionFilename
      ? path.basename(extensionFilename)
      : fileName

    const targetDir = getOrCreateProfileDirectory(outDir, username)
    const numberedFileName = getNumberedVideoFileName(targetDir, actualFileName)
    const savePath = getUniqueSavePath(targetDir, numberedFileName)
    const displayName = path.basename(savePath)

    console.log(`[Download] Saving to profile folder: ${savePath} (profile: ${username}, shortcode: ${shortcode}, extFile: ${extensionFilename || 'none'})`)

    try {
      const logDir = path.join(__dirname, '../downloads')
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
      fs.appendFileSync(path.join(logDir, 'download_debug.log'),
        `[WILL_DOWNLOAD] ${new Date().toISOString()} | file: ${displayName} | profile: ${username} | shortcode: ${shortcode} | extPath: ${extensionFilename || 'N/A'} | path: ${savePath}\n`)
    } catch (e) {}

    item.setSavePath(savePath)

    item.on('updated', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-status', {
          state: 'downloading', filename: displayName,
          received: item.getReceivedBytes(), total: item.getTotalBytes()
        })
      }
    })

    item.once('done', (event, state) => {
      activeDownloads.delete(url)

      try {
        const logDir = path.join(__dirname, '../downloads')
        fs.appendFileSync(path.join(logDir, 'download_debug.log'),
          `[DONE] ${new Date().toISOString()} | state: ${state} | path: ${savePath}\n`)
      } catch (e) {}

      if (state === 'completed') {
        // Add to local cache immediately so next download of same video is caught synchronously
        if (shortcode) downloadedShortcodes.add(shortcode)

        console.log('Download completed:', savePath)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-status', { state: 'completed', filename: displayName, path: savePath })
          mainWindow.webContents.send('ig-download-log', {
            message: `✅ Capturado: ${displayName}`, type: 'success',
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          })
        }
        // Register in DB — backend will extract shortcode from filename
        notifyBackendDownload(savePath, username)
      } else {
        console.log(`Download failed: ${state}`)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-status', { state: 'failed', filename: displayName, error: state })
        }
      }
    })
  })
}

async function downloadSingleFileNative(url, filename, profileName) {
  const username = sanitizeProfileName(profileName) || resolveProfileName(filename, filename) || 'downloads'
  const outDir = customDownloadFolder || path.join(__dirname, '../downloads')
  const targetDir = getOrCreateProfileDirectory(outDir, username)
  const actualFileName = path.basename(filename || 'media.mp4')
  const numberedFileName = getNumberedVideoFileName(targetDir, actualFileName)
  const savePath = getUniqueSavePath(targetDir, numberedFileName)
  const displayName = path.basename(savePath)

  const buf = await fetchBuffer(url)
  if (!buf || buf.length === 0) {
    throw new Error('Falha ao baixar buffer do arquivo')
  }

  fs.writeFileSync(savePath, buf)
  notifyBackendDownload(savePath, username)

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-status', {
      state: 'completed',
      filename: displayName,
      path: savePath
    })
    mainWindow.webContents.send('ig-download-log', {
      message: `✅ Salvo: ${displayName} (@${username})`,
      type: 'success',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    })
  }

  return { success: true, path: savePath, filename: displayName }
}

module.exports = {
  getMainWindow, setMainWindow, getDownloadFolder, setDownloadFolder,
  fetchBuffer, downloadFileStream, downloadBatchDirectNative, buildZipNative, downloadSingleFileNative, notifyBackendDownload, extractAndRenameZip,
  setupExtensionDownloadInterceptor, loadDownloadedShortcodes,
  setPendingFilename, sanitizeProfileName, resolveProfileName,
  getOrCreateProfileDirectory, extractUsernameAndShortcode,
  extractShortcodeFromBasename, getUniqueSavePath,
  extractInstagramProfileFromUrl, rememberInstagramProfile,
  extractProfileFromSuggestedPath, getNumberedVideoFileName
}
