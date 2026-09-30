(function () {
  "use strict";

  const FETCH_MEDIA_MESSAGE = "TIKTOK_FETCH_MEDIA_AND_CREATE_URL";
  const validation = globalThis.DogSaverTikTokMediaValidation;

  async function fetchMedia(url, expectedType) {
    let accept =
        expectedType === "video"
          ? "video/mp4,video/*;q=0.9,*/*;q=0.1"
          : "image/avif,image/webp,image/*,*/*;q=0.1",
      attempts = [
        { cache: "force-cache", credentials: "omit" },
        {
          cache: "no-store",
          credentials: "omit",
          headers: { Range: "bytes=0-" },
        },
        { cache: "no-store", credentials: "include" },
      ],
      response,
      lastError;
    for (let options of attempts) {
      try {
        response = await fetch(url, {
          ...options,
          headers: { Accept: accept, ...(options.headers || {}) },
          redirect: "follow",
        });
        if (!response.ok) {
          throw new Error(`TikTok respondeu ${response.status}`);
        }
        break;
      } catch (error) {
        lastError = error;
        response = null;
      }
    }
    if (!response) throw lastError || new Error("Não foi possível acessar a mídia");

    let blob = await response.blob(),
      contentType = response.headers.get("content-type") || blob.type || "",
      bytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    if (validation && !validation.isExpectedMedia(bytes, contentType, expectedType)) {
      if (validation.isHtmlResponse(bytes, contentType)) {
        throw new Error("O TikTok retornou uma página HTML no lugar da mídia");
      }
      throw new Error("A resposta do TikTok não contém uma mídia válida");
    }
    return { blob, contentType };
  }

  async function fetchFirstValidMedia(urls, expectedType) {
    let lastError;
    for (let url of urls) {
      try {
        let result = await fetchMedia(url, expectedType),
          objectUrl = URL.createObjectURL(result.blob);
        return {
          url: objectUrl,
          contentType: result.contentType,
          size: result.blob.size,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Nenhuma URL de mídia válida foi recebida");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== FETCH_MEDIA_MESSAGE) return false;
    let urls = Array.from(
      new Set(
        (Array.isArray(message.urls) ? message.urls : [message.url]).filter(
          (url) => typeof url === "string" && url.startsWith("https://"),
        ),
      ),
    );
    fetchFirstValidMedia(urls, message.expectedType)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  });
})();
