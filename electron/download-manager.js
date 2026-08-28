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
const sessionProfiles = new WeakMap()
const reservedVideoNumbers = new Map()
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'])

function setPendingFilename(url, filename) {
  if (url && filename) pendingFilenames.set(url, filename)
}

/**
 * Consume (get + delete) the pending filename for a URL.
 * Returns the filename if found, or null.
 */
function consumePendingFilename(url) {
  const fn = pendingFilenames.get(url)
  if (fn) pendingFilenames.delete(url)
  return fn || null
}

function sanitizeProfileName(value) {
  if (typeof value !== 'string') return null
  const username = value.trim().replace(/^@+/, '')
  const validShape = /^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(username)
  return validShape && !username.includes('..') ? username : null
}

function resolveProfileName(fileName, extensionPath) {
  if (extensionPath) {
    const segments = extensionPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (segments.length > 1) return sanitizeProfileName(segments[0])

    const structuredName = segments[0] || ''
    const structuredMatch = structuredName.match(/^@?([A-Za-z0-9._]{1,30})_(?:instagram|stories|highlights)(?:_|\.zip)/i)
    if (structuredMatch) return sanitizeProfileName(structuredMatch[1])
  }

  const zipMatch = String(fileName || '').match(/^@?([A-Za-z0-9._]{1,30})_(?:instagram|stories|highlights)(?:_|\.zip)/i)
  return zipMatch ? sanitizeProfileName(zipMatch[1]) : null
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
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null
    const firstSegment = url.pathname.split('/').filter(Boolean)[0]
    const reservedRoutes = new Set([
      'accounts', 'direct', 'explore', 'p', 'reel', 'reels', 'stories',
      'about', 'developer', 'legal', 'privacy', 'web'
    ])
    if (!firstSegment || reservedRoutes.has(firstSegment.toLowerCase())) return null
    return sanitizeProfileName(firstSegment)
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
  return new Promise((resolve, reject) => {
    const doFetch = (fetchUrl, retriesLeft, redirectCount = 0) => {
      if (redirectCount > 5) { resolve(null); return }
      const mod = fetchUrl.startsWith('https') ? https : http
      const req = mod.get(fetchUrl, { timeout: 30000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          doFetch(res.headers.location, retriesLeft, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200) {
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

async function buildZipNative(username, items, options = {}) {
  const outDir = customDownloadFolder || path.join(__dirname, '../downloads')
  const profileDir = getOrCreateProfileDirectory(outDir, username)
  const zipFilename = path.basename(options.filename || `${username}_instagram.zip`)
  const zipPath = getUniqueSavePath(profileDir, zipFilename)

  const concurrency = options.concurrency || 3
  let downloaded = 0, failed = 0, current = 0
  const total = items.length

  const sendZipProgress = (phase, zipPercent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ig-download-log', {
        message: phase === 'zipping'
          ? `📦 Gerando ZIP... ${zipPercent || 0}%`
          : `⬇️ Baixando ${current}/${total} arquivos para ZIP...`,
        type: 'info',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      })
    }
  }

  const fileBuffers = []
  let idx = 0
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++
      const buf = await fetchBuffer(items[i].url)
      if (buf) { fileBuffers.push({ path: items[i].path, buffer: buf }); downloaded++ }
      else { failed++ }
      current++
      if (current % 5 === 0 || current === total) sendZipProgress('downloading')
    }
  }
  const workers = []
  for (let w = 0; w < Math.min(concurrency, items.length); w++) workers.push(worker())
  await Promise.all(workers)

  if (downloaded === 0) return { downloaded: 0, failed, zipPath: null, error: 'Nenhum arquivo baixado para o ZIP' }

  sendZipProgress('zipping', 0)
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath)
    const archive = archiver('zip', { store: true })

    output.on('close', () => {
      sendZipProgress('zipping', 100)
      console.log(`[ZIP] Arquivo ZIP criado: ${zipPath} (${archive.pointer()} bytes)`)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-status', { state: 'completed', filename: path.basename(zipPath), path: zipPath })
        mainWindow.webContents.send('ig-download-log', {
          message: `✅ ZIP salvo: ${path.basename(zipPath)} (${downloaded} arquivos)`,
          type: 'success', timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      }
      notifyBackendDownload(zipPath)
      resolve({ downloaded, failed, zipPath })
    })
    archive.on('error', (err) => { console.error('[ZIP] Erro:', err.message); reject(err) })
    archive.pipe(output)
    let addedCount = 0
    for (const file of fileBuffers) {
      archive.append(file.buffer, { name: file.path })
      addedCount++
      if (addedCount % 10 === 0) sendZipProgress('zipping', Math.round((addedCount / fileBuffers.length) * 90))
    }
    archive.finalize()
  })
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
  const match = base.match(/^\d{8}_\d{4}_([A-Za-z0-9_-]{6,})(?:_\d+)?$/)
  if (match) return match[1]
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

module.exports = {
  getMainWindow, setMainWindow, getDownloadFolder, setDownloadFolder,
  fetchBuffer, buildZipNative, notifyBackendDownload, extractAndRenameZip,
  setupExtensionDownloadInterceptor, loadDownloadedShortcodes,
  setPendingFilename, sanitizeProfileName, resolveProfileName,
  getOrCreateProfileDirectory, extractUsernameAndShortcode,
  extractShortcodeFromBasename, getUniqueSavePath,
  extractInstagramProfileFromUrl, rememberInstagramProfile,
  extractProfileFromSuggestedPath, getNumberedVideoFileName
}
