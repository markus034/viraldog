(function () {
  "use strict";

  if (window.__dogSaverTikTokInterceptorActive) return;
  window.__dogSaverTikTokInterceptorActive = true;

  const parser = globalThis.DogSaverTikTokParser;
  const validation = globalThis.DogSaverTikTokMediaValidation;
  const MESSAGE_SOURCE = "dog-saver-tiktok-interceptor";
  const DOWNLOAD_REQUEST_SOURCE = "dog-saver-tiktok-content-download";
  const DOWNLOAD_RESPONSE_SOURCE = "dog-saver-tiktok-page-download";
  const API_PATTERN =
    /\/api\/(?:recommend\/item_list|post\/item_list|item\/detail|item_list|following\/item_list|search\/item|related\/item_list|explore\/item_list|feed|favorite\/item_list)/i;
  const recentlyLoadedMedia = new Map();
  const activeDownloads = new Set();

  if (!parser?.extractPosts || !validation?.isExpectedMedia) return;

  function rememberLoadedMedia(url, request) {
    if (!validation.isAllowedTikTokMediaUrl(url)) return;
    recentlyLoadedMedia.delete(url);
    recentlyLoadedMedia.set(url, {
      loadedAt: Date.now(),
      request: request || null,
    });
    while (recentlyLoadedMedia.size > 64) {
      recentlyLoadedMedia.delete(recentlyLoadedMedia.keys().next().value);
    }
  }

  function safeFilename(value, expectedType) {
    let fallback =
      expectedType === "image"
        ? "Dog_Saver_TikTok.jpg"
        : "Dog_Saver_TikTok.mp4";
    return (
      String(value || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/^\.+/, "")
        .slice(0, 180) || fallback
    );
  }

  async function responseIsExpectedMedia(response, expectedType) {
    let blob = await response.blob(),
      contentType = response.headers.get("content-type") || blob.type || "",
      bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    if (!validation.isExpectedMedia(bytes, contentType, expectedType)) {
      if (validation.isHtmlResponse(bytes, contentType)) {
        throw new Error("O TikTok retornou uma página de bloqueio");
      }
      throw new Error("A resposta não contém uma mídia válida");
    }
    return { blob, contentType };
  }

  async function fetchMediaInPage(url, expectedType) {
    let loaded = recentlyLoadedMedia.get(url),
      attempts = [
        ...(loaded?.request ? [{ request: loaded.request }] : []),
        {
          cache: "force-cache",
          credentials: "same-origin",
          referrer: location.href,
          referrerPolicy: "strict-origin-when-cross-origin",
        },
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Range: "bytes=0-" },
          referrer: location.href,
          referrerPolicy: "strict-origin-when-cross-origin",
        },
        {
          cache: "no-store",
          credentials: "include",
          referrer: location.href,
          referrerPolicy: "strict-origin-when-cross-origin",
        },
      ],
      lastError;
    for (let options of attempts) {
      try {
        let response = options.request
          ? await originalFetch(options.request.clone())
          : await originalFetch(url, options);
        if (!response.ok) {
          throw new Error(`TikTok respondeu ${response.status}`);
        }
        return await responseIsExpectedMedia(response, expectedType);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Não foi possível acessar a mídia");
  }

  function triggerBlobDownload(blob, filename, originalUrl) {
    let objectUrl = URL.createObjectURL(blob);
    let handledByBridge = false;

    // Relay to ViralDog Electron downloader if available
    try {
      if (window.electronAPI && typeof window.electronAPI.triggerDownload === "function") {
        window.electronAPI.triggerDownload(objectUrl, filename);
        handledByBridge = true;
      }
    } catch (e) {}

    if (!handledByBridge) {
      let anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.documentElement.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  async function downloadMediaInPage(message) {
    let expectedType = message.expectedType === "image" ? "image" : "video",
      urls = Array.from(
        new Set(
          (Array.isArray(message.urls) ? message.urls : []).filter((url) =>
            validation.isAllowedTikTokMediaUrl(url),
          ),
        ),
      ).slice(0, 24);
    if (!urls.length) throw new Error("Nenhuma URL de mídia permitida");
    urls.sort(
      (left, right) =>
        (recentlyLoadedMedia.get(right)?.loadedAt || 0) -
        (recentlyLoadedMedia.get(left)?.loadedAt || 0),
    );

    let lastError;
    for (let url of urls) {
      try {
        let media = await fetchMediaInPage(url, expectedType);
        triggerBlobDownload(
          media.blob,
          safeFilename(message.filename, expectedType),
          url
        );
        return { contentType: media.contentType, size: media.blob.size };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Não foi possível baixar a mídia");
  }

  function publish(url, payload) {
    if (!API_PATTERN.test(String(url || ""))) return;
    let posts = parser.extractPosts(payload);
    if (!posts.length) return;
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        version: 1,
        posts,
      },
      "*",
    );
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url || "";
  }

  function cloneReplayableRequest(input, init) {
    let method = String(
      init?.method || (input instanceof Request ? input.method : "GET"),
    );
    if (!/^(?:GET|HEAD)$/i.test(method)) return null;
    try {
      let clone =
        input instanceof Request
          ? new Request(input.clone(), init)
          : new Request(input, init);
      return clone;
    } catch {
      return null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    let url = requestUrl(args[0]),
      replayRequest = null;
    if (validation.isAllowedTikTokMediaUrl(url))
      replayRequest = cloneReplayableRequest(args[0], args[1]);
    let request = originalFetch.apply(this, args);
    request
      .then((response) => {
        if (response.ok) {
          rememberLoadedMedia(url, replayRequest);
          if (response.url !== url)
            rememberLoadedMedia(response.url, replayRequest);
        }
        if (!API_PATTERN.test(String(url || response.url || ""))) return;
        response
          .clone()
          .json()
          .then((payload) => publish(url || response.url, payload))
          .catch(() => {});
      })
      .catch(() => {});
    return request;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__dogSaverTikTokUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (API_PATTERN.test(this.__dogSaverTikTokUrl || "")) {
      this.addEventListener(
        "load",
        () => {
          try {
            let payload =
              this.responseType === "json"
                ? this.response
                : JSON.parse(this.responseText || "null");
            publish(this.__dogSaverTikTokUrl, payload);
          } catch {}
        },
        { once: true },
      );
    }
    return originalSend.apply(this, args);
  };

  window.addEventListener("message", (event) => {
    let message = event.data,
      requestId = String(message?.requestId || "");
    if (
      event.source !== window ||
      message?.source !== DOWNLOAD_REQUEST_SOURCE ||
      message.version !== 1 ||
      !/^[a-z0-9-]{8,80}$/i.test(requestId) ||
      activeDownloads.has(requestId) ||
      activeDownloads.size >= 2
    )
      return;

    activeDownloads.add(requestId);
    downloadMediaInPage(message)
      .then((result) => {
        window.postMessage(
          {
            source: DOWNLOAD_RESPONSE_SOURCE,
            version: 1,
            requestId,
            ok: true,
            ...result,
          },
          "*",
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            source: DOWNLOAD_RESPONSE_SOURCE,
            version: 1,
            requestId,
            error: error.message,
          },
          "*",
        );
      })
      .finally(() => activeDownloads.delete(requestId));
  });
})();
