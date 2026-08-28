const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const AdmZip = require('adm-zip')

const {
  sanitizeProfileName,
  resolveProfileName,
  getOrCreateProfileDirectory,
  extractAndRenameZip,
  setupExtensionDownloadInterceptor,
  setDownloadFolder,
  setPendingFilename,
  extractInstagramProfileFromUrl,
  rememberInstagramProfile,
  extractProfileFromSuggestedPath,
  getNumberedVideoFileName
} = require('../download-manager')

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viraldog-download-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('validates profile names without accepting paths', () => {
  assert.equal(sanitizeProfileName('@perfil.teste'), 'perfil.teste')
  assert.equal(sanitizeProfileName('../perfil'), null)
  assert.equal(sanitizeProfileName('perfil/filho'), null)
  assert.equal(sanitizeProfileName('perfil..filho'), null)
  assert.equal(resolveProfileName('AQ_random_cdn_name.mp4', null), null)
  assert.equal(resolveProfileName('video.mp4', 'perfil.teste/video.mp4'), 'perfil.teste')
  assert.equal(extractInstagramProfileFromUrl('https://www.instagram.com/perfil.teste/'), 'perfil.teste')
  assert.equal(extractInstagramProfileFromUrl('https://www.instagram.com/reel/ABC123/'), null)
})

test('reuses the same profile directory', (t) => {
  const outDir = temporaryDirectory(t)
  const first = getOrCreateProfileDirectory(outDir, 'perfil')
  fs.writeFileSync(path.join(first, 'primeiro.mp4'), 'one')
  const second = getOrCreateProfileDirectory(outDir, '@perfil')

  assert.equal(second, first)
  assert.equal(fs.readFileSync(path.join(second, 'primeiro.mp4'), 'utf8'), 'one')
  assert.deepEqual(fs.readdirSync(outDir), ['perfil'])
})

test('merges a profile ZIP without creating a numbered folder or overwriting files', (t) => {
  const outDir = temporaryDirectory(t)
  const profileDir = getOrCreateProfileDirectory(outDir, 'perfil')
  fs.writeFileSync(path.join(profileDir, 'video.mp4'), 'existing')

  const zipPath = path.join(outDir, 'perfil_instagram.zip')
  const zip = new AdmZip()
  zip.addFile('perfil_instagram/video.mp4', Buffer.from('new collision'))
  zip.addFile('perfil_instagram/outro.mp4', Buffer.from('new video'))
  zip.writeZip(zipPath)

  const extraction = extractAndRenameZip(zipPath, 'perfil_instagram.zip', outDir, 'perfil')

  assert.equal(extraction.targetDir, profileDir)
  assert.equal(extraction.extractedFiles.length, 2)
  assert.equal(fs.existsSync(zipPath), false)
  assert.equal(fs.readFileSync(path.join(profileDir, 'video.mp4'), 'utf8'), 'existing')
  assert.equal(fs.readFileSync(path.join(profileDir, '001. outro.mp4'), 'utf8'), 'new video')
  assert.equal(fs.readFileSync(path.join(profileDir, '002. video.mp4'), 'utf8'), 'new collision')
  assert.deepEqual(fs.readdirSync(outDir), ['perfil'])
})

test('unwraps the actual username root used by bulk profile ZIPs', (t) => {
  const outDir = temporaryDirectory(t)
  const zipPath = path.join(outDir, 'perfil_instagram.zip')
  const zip = new AdmZip()
  zip.addFile('perfil/20260805_1200_VIDEO01.mp4', Buffer.from('video'))
  zip.addFile('perfil/20260805_1201_foto.jpg', Buffer.from('image'))
  zip.writeZip(zipPath)

  const extraction = extractAndRenameZip(zipPath, 'perfil_instagram.zip', outDir, 'perfil')

  assert.equal(extraction.targetDir, path.join(outDir, 'perfil'))
  assert.equal(fs.existsSync(path.join(outDir, 'perfil', '001. 20260805_1200_VIDEO01.mp4')), true)
  assert.equal(fs.existsSync(path.join(outDir, 'perfil', '20260805_1201_foto.jpg')), true)
  assert.equal(fs.existsSync(path.join(outDir, 'perfil', 'perfil')), false)
  assert.deepEqual(fs.readdirSync(outDir), ['perfil'])
})

test('routes a bulk profile ZIP through the configured folder and extracts it', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  setupExtensionDownloadInterceptor(session)

  const url = 'blob:chrome-extension://dog-saver/profile-zip'
  setPendingFilename(url, 'perfil/perfil_instagram.zip')
  const item = new EventEmitter()
  item.getFilename = () => 'download.zip'
  item.getURL = () => url
  item.getSavePath = () => ''
  item.setSavePath = (savePath) => { item.savePath = savePath }
  item.cancel = () => { item.cancelled = true }
  item.getReceivedBytes = () => 0
  item.getTotalBytes = () => 0

  session.emit('will-download', {}, item, null)
  assert.equal(item.cancelled, undefined)
  assert.equal(item.savePath, path.join(outDir, 'perfil_instagram.zip'))

  const zip = new AdmZip()
  zip.addFile('perfil/20260805_1200_VIDEO01.mp4', Buffer.from('video'))
  zip.writeZip(item.savePath)
  item.emit('done', {}, 'completed')

  assert.equal(fs.existsSync(item.savePath), false)
  assert.equal(fs.existsSync(path.join(outDir, 'perfil', '001. 20260805_1200_VIDEO01.mp4')), true)
  assert.deepEqual(fs.readdirSync(outDir), ['perfil'])
})

test('routes repeated individual downloads to the same profile folder', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  setupExtensionDownloadInterceptor(session)

  function download(url, structuredName) {
    setPendingFilename(url, structuredName)
    const item = new EventEmitter()
    item.getFilename = () => path.basename(structuredName)
    item.getURL = () => url
    item.setSavePath = (savePath) => { item.savePath = savePath }
    item.cancel = () => { item.cancelled = true }
    session.emit('will-download', {}, item, null)
    return item
  }

  const first = download('https://cdn.example/one', 'perfil/20260801_1200_ABCdef1.mp4')
  const second = download('https://cdn.example/two', 'perfil/20260801_1201_ABCdef2.mp4')

  assert.equal(first.cancelled, undefined)
  assert.equal(second.cancelled, undefined)
  assert.equal(path.dirname(first.savePath), path.join(outDir, 'perfil'))
  assert.equal(path.dirname(second.savePath), path.join(outDir, 'perfil'))
  assert.equal(path.basename(first.savePath), '001. 20260801_1200_ABCdef1.mp4')
  assert.equal(path.basename(second.savePath), '002. 20260801_1201_ABCdef2.mp4')
  assert.deepEqual(fs.readdirSync(outDir), ['perfil'])
})

test('creates a new profile folder instead of reusing the previous profile', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  rememberInstagramProfile(session, 'https://www.instagram.com/perfil_antigo/')
  setupExtensionDownloadInterceptor(session)

  const url = 'https://cdn.example/new-profile-video'
  setPendingFilename(url, 'perfil_novo/20260803_1900_NEWvid1.mp4')
  const item = new EventEmitter()
  item.getFilename = () => 'AQ_opaque_name.mp4'
  item.getURL = () => url
  item.setSavePath = (savePath) => { item.savePath = savePath }
  item.cancel = () => { item.cancelled = true }

  session.emit('will-download', {}, item, null)

  assert.equal(item.cancelled, undefined)
  assert.equal(path.dirname(item.savePath), path.join(outDir, 'perfil_novo'))
  assert.equal(fs.existsSync(path.join(outDir, 'perfil_novo')), true)
  assert.deepEqual(fs.readdirSync(outDir), ['perfil_novo'])
})

test('routes consecutive Reels to each author instead of the last profile', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  rememberInstagramProfile(session, 'https://www.instagram.com/perfil_antigo/')
  setupExtensionDownloadInterceptor(session)

  function download(author, suffix) {
    const url = `https://cdn.example/reel-${suffix}`
    setPendingFilename(url, `${author}/20260805_120${suffix}_REEL0${suffix}.mp4`)
    const item = new EventEmitter()
    item.getFilename = () => `opaque-${suffix}.mp4`
    item.getURL = () => url
    item.setSavePath = (savePath) => { item.savePath = savePath }
    item.cancel = () => { item.cancelled = true }
    session.emit('will-download', {}, item, null)
    return item
  }

  const first = download('autor_um', 1)
  const second = download('autor_dois', 2)
  const third = download('autor_tres', 3)

  assert.equal(path.dirname(first.savePath), path.join(outDir, 'autor_um'))
  assert.equal(path.dirname(second.savePath), path.join(outDir, 'autor_dois'))
  assert.equal(path.dirname(third.savePath), path.join(outDir, 'autor_tres'))
  assert.deepEqual(fs.readdirSync(outDir).sort(), ['autor_dois', 'autor_tres', 'autor_um'])
})

test('uses the desconhecido folder when a Reel has no identifiable author', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  rememberInstagramProfile(session, 'https://www.instagram.com/perfil_antigo/')
  setupExtensionDownloadInterceptor(session)

  const url = 'https://cdn.example/reel-without-author'
  setPendingFilename(url, 'desconhecido/20260805_1230_REEL404.mp4')
  const item = new EventEmitter()
  item.getFilename = () => 'opaque-reel.mp4'
  item.getURL = () => url
  item.setSavePath = (savePath) => { item.savePath = savePath }
  item.cancel = () => { item.cancelled = true }

  session.emit('will-download', {}, item, null)

  assert.equal(item.cancelled, undefined)
  assert.equal(path.dirname(item.savePath), path.join(outDir, 'desconhecido'))
  assert.deepEqual(fs.readdirSync(outDir), ['desconhecido'])
})

test('cancels an opaque CDN filename instead of creating an incorrect folder', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  setupExtensionDownloadInterceptor(session)
  const item = new EventEmitter()
  item.getFilename = () => 'AQ_random_cdn_name.mp4'
  item.getURL = () => 'https://cdn.example/opaque'
  item.cancel = () => { item.cancelled = true }

  session.emit('will-download', {}, item, null)

  assert.equal(item.cancelled, true)
  assert.deepEqual(fs.readdirSync(outDir), [])
})

test('uses the current Instagram profile for native downloads with opaque CDN names', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  rememberInstagramProfile(session, 'https://www.instagram.com/vaitendotudo/')
  setupExtensionDownloadInterceptor(session)

  const item = new EventEmitter()
  item.getFilename = () => 'AQ_random_cdn_name.mp4'
  item.getURL = () => 'https://cdn.example/native-download'
  item.setSavePath = (savePath) => { item.savePath = savePath }
  item.cancel = () => { item.cancelled = true }

  session.emit('will-download', {}, item, null)

  assert.equal(item.cancelled, undefined)
  assert.equal(path.dirname(item.savePath), path.join(outDir, 'vaitendotudo'))
  assert.deepEqual(fs.readdirSync(outDir), ['vaitendotudo'])
})

test('creates the profile folder on the first native individual download', (t) => {
  const outDir = temporaryDirectory(t)
  setDownloadFolder(outDir)
  t.after(() => setDownloadFolder(null))

  const session = new EventEmitter()
  setupExtensionDownloadInterceptor(session)

  const filename = 'AQ_first_native_video.mp4'
  const suggestedPath = path.join(outDir, 'primeiroperfil', filename)
  const item = new EventEmitter()
  item.getFilename = () => filename
  item.getURL = () => 'https://cdn.example/first-native-video'
  item.getSavePath = () => suggestedPath
  item.setSavePath = (savePath) => { item.savePath = savePath }
  item.cancel = () => { item.cancelled = true }

  session.emit('will-download', {}, item, { getURL: () => 'chrome-extension://ig-saver/background.js' })

  assert.equal(extractProfileFromSuggestedPath(suggestedPath, outDir), 'primeiroperfil')
  assert.equal(item.cancelled, undefined)
  assert.equal(item.savePath, path.join(outDir, 'primeiroperfil', `001. ${filename}`))
  assert.equal(fs.existsSync(path.join(outDir, 'primeiroperfil')), true)
})

test('continues numbering from existing numbered videos without changing images', (t) => {
  const profileDir = temporaryDirectory(t)
  fs.writeFileSync(path.join(profileDir, '003. antigo.mp4'), 'old')

  assert.equal(getNumberedVideoFileName(profileDir, 'novo.mp4'), '004. novo.mp4')
  assert.equal(getNumberedVideoFileName(profileDir, 'capa.jpg'), 'capa.jpg')
  assert.equal(getNumberedVideoFileName(profileDir, '005. outro.mp4'), '005. outro.mp4')
})
