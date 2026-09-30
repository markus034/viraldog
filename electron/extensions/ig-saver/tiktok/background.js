import {
  isAllowedTikTokMediaUrl,
  isAllowedTikTokZipUrl,
} from "./security.js";

const BUILD_ZIP_MESSAGE = "IG_SAVER_BUILD_ZIP_AND_CREATE_URL";
const FETCH_MEDIA_MESSAGE = "TIKTOK_FETCH_MEDIA_AND_CREATE_URL";
const REVOKE_URL_MESSAGE = "IG_SAVER_REVOKE_BLOB_URL";
const OFFSCREEN_DOCUMENT = "offscreen.html";

let creatingOffscreenDocument;

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) return false;

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDocument) return creatingOffscreenDocument;

  creatingOffscreenDocument = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ["BLOBS"],
      justification: "Preparar mídias e arquivos ZIP de downloads do TikTok.",
    })
    .catch(async (error) => {
      if (!(await hasOffscreenDocument())) throw error;
    })
    .finally(() => {
      creatingOffscreenDocument = undefined;
    });

  return creatingOffscreenDocument;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function startDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (downloadId === undefined) {
        reject(new Error("DOWNLOAD_FAILED"));
        return;
      }
      resolve(downloadId);
    });
  });
}

function sanitizeFilename(filename) {
  return String(filename || "Dog_Saver_TikTok.zip").replace(
    /[<>:"/\\|?*\x00-\x1f]/g,
    "_",
  );
}

async function downloadPreparedFile(filename, sourceUrls, expectedType) {
  let urls = Array.from(
    new Set((Array.isArray(sourceUrls) ? sourceUrls : [sourceUrls]).filter(Boolean)),
  );
  if (!urls.length || urls.some((url) => !isAllowedTikTokMediaUrl(url))) {
    throw new Error("URL de mídia do TikTok não permitida");
  }

  await ensureOffscreenDocument();
  let mediaResult = await sendRuntimeMessage({
    type: FETCH_MEDIA_MESSAGE,
    urls,
    expectedType: expectedType === "image" ? "image" : "video",
  });
  if (mediaResult.error || !mediaResult.url) {
    throw new Error(mediaResult.error || "Não foi possível preparar a mídia");
  }

  try {
    let downloadId = await startDownload({
      url: mediaResult.url,
      filename: sanitizeFilename(filename || "Dog_Saver_TikTok"),
      saveAs: false,
      conflictAction: "uniquify",
    });
    return {
      downloadId,
      contentType: mediaResult.contentType,
      size: mediaResult.size,
    };
  } finally {
    chrome.runtime
      .sendMessage({ type: REVOKE_URL_MESSAGE, url: mediaResult.url })
      .catch(() => {});
  }
}

async function downloadPreparedZip(filename, sourceItems) {
  const items = [];
  for (let item of sourceItems || []) {
    if (typeof item?.path !== "string" || !item.path.length) continue;
    let urls = Array.from(
      new Set(
        [
          ...(Array.isArray(item.urls) ? item.urls : []),
          item.url,
        ].filter((url) => isAllowedTikTokMediaUrl(url)),
      ),
    );
    if (urls.length) {
      items.push({
        urls,
        path: item.path,
        expectedType:
          item.expectedType === "image" ||
          /\.(?:avif|jpe?g|png|webp)$/i.test(item.path)
            ? "image"
            : "video",
      });
    } else if (
      typeof item.url === "string" &&
      isAllowedTikTokZipUrl(item.url)
    ) {
      items.push({ url: item.url, path: item.path });
    }
  }

  if (!items.length) throw new Error("Nenhum arquivo válido para o ZIP");

  await ensureOffscreenDocument();
  const mediaItems = items.filter((item) => item.urls),
    localItems = items.filter((item) => !item.urls),
    preparedItems = [],
    preparedUrls = [],
    preparationErrors = [],
    concurrency = Math.min(3, Math.max(1, mediaItems.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < mediaItems.length) {
        let item = mediaItems[cursor++];
        try {
          let mediaResult = await sendRuntimeMessage({
            type: FETCH_MEDIA_MESSAGE,
            urls: item.urls,
            expectedType: item.expectedType,
          });
          if (mediaResult.error || !mediaResult.url) {
            throw new Error(mediaResult.error || "Mídia indisponível");
          }
          preparedItems.push({ url: mediaResult.url, path: item.path });
          preparedUrls.push(mediaResult.url);
        } catch (error) {
          preparationErrors.push({ path: item.path, error: error.message });
        }
      }
    }),
  );

  if (mediaItems.length && !preparedItems.length) {
    throw new Error(
      "Não foi possível baixar os vídeos do TikTok para montar o ZIP",
    );
  }

  let zipResult;
  try {
    zipResult = await sendRuntimeMessage({
      type: BUILD_ZIP_MESSAGE,
      username: "tiktok",
      items: [...preparedItems, ...localItems],
      taskId: `tiktok-${Date.now()}`,
      concurrency: 3,
    });
  } finally {
    for (let url of preparedUrls) {
      chrome.runtime
        .sendMessage({ type: REVOKE_URL_MESSAGE, url })
        .catch(() => {});
    }
  }

  if (zipResult.error || !zipResult.url) {
    throw new Error(zipResult.error || "Não foi possível montar o ZIP");
  }
  if (
    preparedItems.length &&
    (zipResult.failed ?? 0) >= preparedItems.length
  ) {
    chrome.runtime
      .sendMessage({ type: REVOKE_URL_MESSAGE, url: zipResult.url })
      .catch(() => {});
    throw new Error("O ZIP não recebeu nenhuma mídia do TikTok");
  }

  try {
    await startDownload({
      url: zipResult.url,
      filename: sanitizeFilename(filename),
      saveAs: false,
      conflictAction: "uniquify",
    });
  } finally {
    chrome.runtime
      .sendMessage({ type: REVOKE_URL_MESSAGE, url: zipResult.url })
      .catch(() => {});
  }

  return {
    downloaded: zipResult.downloaded ?? preparedItems.length + localItems.length,
    failed: (zipResult.failed ?? 0) + preparationErrors.length,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TIKTOK_CHECK_PRO") {
    sendResponse({ pro: true, kind: "pro" });
    return false;
  }

  if (message?.type === "TIKTOK_DOWNLOAD_FILE") {
    let { expectedType, filename, url, urls } = message.payload || {};
    downloadPreparedFile(filename, urls || url, expectedType)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.type === "TIKTOK_DOWNLOAD_ZIP") {
    const { filename, items } = message.payload || {};
    downloadPreparedZip(filename, items)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});
