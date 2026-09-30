(function () {
  "use strict";

  if (window.__dogSaverTikTokActive) return;
  window.__dogSaverTikTokActive = true;

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    if (!window.__has_dogsaver_tiktok_download_listener) {
      window.__has_dogsaver_tiktok_download_listener = true;
      chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message && message.type === "POLYFILL_TRIGGER_DOWNLOAD") {
          try {
            window.postMessage({
              type: 'IG_SAVER_DOWNLOAD_REQUEST',
              url: message.url,
              filename: message.filename || ''
            }, '*');
            sendResponse({ success: true, downloadId: 12345 });
          } catch (err) {
            sendResponse({ error: err.message });
          }
          return true;
        }

        if (message && message.type === "POLYFILL_TRIGGER_BUILD_ZIP") {
          const requestId = 'tt_zip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
          const onZipResponse = (event) => {
            if (event.source !== window || !event.data || event.data.type !== 'IG_SAVER_BUILD_ZIP_RESPONSE' || event.data.requestId !== requestId) return;
            window.removeEventListener('message', onZipResponse);
            if (event.data.error) {
              sendResponse({ error: event.data.error, downloaded: 0, failed: message.items?.length || 1 });
            } else {
              sendResponse(event.data.result || { downloaded: message.items?.length || 0, failed: 0 });
            }
          };
          window.addEventListener('message', onZipResponse);
          window.postMessage({
            type: 'IG_SAVER_BUILD_ZIP_REQUEST',
            requestId,
            username: message.username,
            items: message.items,
            filename: message.filename,
            taskId: message.taskId,
            concurrency: message.concurrency
          }, '*');
          return true;
        }
      });
    }
  }

  const parser = globalThis.DogSaverTikTokParser;
  const profileFilters = globalThis.DogSaverTikTokFilters;
  if (!parser || !profileFilters) {
    console.error("[ViralDog][TikTok] Módulos indisponíveis");
    return;
  }

  const DUPLICATE_KEY = "dog_saver_tiktok_downloaded_posts";
  const FAVORITES_KEY = "dog_saver_tiktok_favorite_profiles";
  const INTERCEPTOR_SOURCE = "dog-saver-tiktok-interceptor";
  const PAGE_DOWNLOAD_REQUEST_SOURCE = "dog-saver-tiktok-content-download";
  const PAGE_DOWNLOAD_RESPONSE_SOURCE = "dog-saver-tiktok-page-download";
  const MAX_CACHED_POSTS = 1200;
  const state = {
    route: location.href,
    controller: null,
    scanTimer: null,
    busyPosts: new Set(),
    postCache: new Map(),
  };

  function sendMessage(message) {
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

  function requestPageMediaDownload(payload) {
    let requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("O TikTok demorou demais para preparar a mídia"));
      }, 120000);

      function onMessage(event) {
        let message = event.data;
        if (
          event.source !== window ||
          message?.source !== PAGE_DOWNLOAD_RESPONSE_SOURCE ||
          message.version !== 1 ||
          message.requestId !== requestId
        )
          return;
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (message.error) reject(new Error(message.error));
        else resolve(message);
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: PAGE_DOWNLOAD_REQUEST_SOURCE,
          version: 1,
          requestId,
          ...payload,
        },
        "*",
      );
    });
  }

  function sanitize(value) {
    return String(value || "unknown")
      .replace(/^@/, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function currentContext(url = location.href) {
    let parsed;
    try {
      parsed = new URL(url, location.origin);
    } catch {
      return { type: "other", username: null, postId: null, url };
    }
    let postMatch = parsed.pathname.match(
        /^\/@([^/]+)\/(video|photo)\/(\d+)/i,
      ),
      profileMatch = parsed.pathname.match(/^\/@([^/]+)\/?$/i);
    if (postMatch) {
      return {
        type: postMatch[2].toLowerCase(),
        username: decodeURIComponent(postMatch[1]),
        postId: postMatch[3],
        url: parsed.href,
      };
    }
    if (profileMatch) {
      return {
        type: "profile",
        username: decodeURIComponent(profileMatch[1]),
        postId: null,
        url: parsed.href,
      };
    }
    return { type: "other", username: null, postId: null, url: parsed.href };
  }

  const ALLOWED_TIKTOK_MEDIA_HOSTS = [
    "tiktok.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    "byteoversea.com",
    "byteimg.com",
    "ibyteimg.com",
    "muscdn.com",
    "akamaized.net",
  ];

  function matchesHost(hostname, allowedHost) {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
  }

  function isAllowedTikTokMediaUrl(value) {
    try {
      let url = new URL(String(value || ""));
      return (
        url.protocol === "https:" &&
        ALLOWED_TIKTOK_MEDIA_HOSTS.some((host) => matchesHost(url.hostname, host))
      );
    } catch {
      return false;
    }
  }

  function hydrationText(documentNode) {
    return (
      documentNode.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")
        ?.textContent ||
      documentNode.getElementById("SIGI_STATE")?.textContent ||
      ""
    );
  }

  function parseDocument(documentNode, sourceUrl) {
    return parser.parseHydrationText(hydrationText(documentNode), sourceUrl);
  }

  function cacheAllDocumentPosts(documentNode = document) {
    let text = hydrationText(documentNode);
    if (!text) return;
    try {
      let data = JSON.parse(text);
      let posts = parser.extractPosts(data);
      for (let post of posts) cachePost(post);
    } catch {}
  }

  function extractPostFromDom(postId, postUrl) {
    let context = currentContext(postUrl || location.href);
    let id = postId || context.postId;
    let username = context.username || "tiktok_user";

    let videoElements = Array.from(document.querySelectorAll("video"));
    let targetVideo = null;
    if (id) {
      targetVideo = videoElements.find((v) => {
        let parent = v.closest(
          `[id*="${id}"], [data-e2e*="${id}"], article, [data-e2e="recommend-list-item-container"]`,
        );
        return Boolean(parent);
      });
    }
    if (!targetVideo) {
      targetVideo =
        videoElements.find((v) => isVisibleElement(v)) || videoElements[0];
    }

    let videoUrl =
      targetVideo?.currentSrc ||
      targetVideo?.src ||
      targetVideo?.querySelector("source")?.src;
    if (videoUrl && isAllowedTikTokMediaUrl(videoUrl)) {
      return {
        platform: "tiktok",
        id: id || String(Date.now()),
        username,
        nickname: username,
        description: "",
        createdAt: Math.floor(Date.now() / 1000),
        pinned: false,
        sourceUrl: postUrl || location.href,
        mediaType: "video",
        media: [
          {
            url: videoUrl,
            fallbackUrls: [],
            type: "video",
            ext: "mp4",
            index: 0,
            width: targetVideo.videoWidth || 0,
            height: targetVideo.videoHeight || 0,
          },
        ],
        stats: {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
          reposts: 0,
        },
        music: null,
      };
    }
    return null;
  }

  function isValidPost(post) {
    return Boolean(
      post &&
        /^\d+$/.test(String(post.id || "")) &&
        typeof post.username === "string" &&
        Array.isArray(post.media) &&
        post.media.length > 0 &&
        post.media.every(
          (media) =>
            typeof media?.url === "string" && /^https:\/\//i.test(media.url),
        ),
    );
  }

  function cachePost(post) {
    if (!isValidPost(post)) return;
    state.postCache.delete(String(post.id));
    state.postCache.set(String(post.id), post);
    while (state.postCache.size > MAX_CACHED_POSTS) {
      state.postCache.delete(state.postCache.keys().next().value);
    }
  }

  window.addEventListener("message", async (event) => {
    let message = event.data;
    if (!message) return;
    if (message.type === "VIRALDOG_SET_IG_FAVORITES_MENU") {
      if (message.open === true) {
        await showViralDogFavoritesMenu(message.anchorX);
      } else {
        removeViralDogFavoritesMenu();
      }
      return;
    }
    if (
      event.source !== window ||
      message?.source !== INTERCEPTOR_SOURCE ||
      message.version !== 1 ||
      !Array.isArray(message.posts)
    )
      return;
    for (let post of message.posts) cachePost(post);
    scheduleScan();
  });

  async function fetchPost(postUrl, signal, force = false) {
    let expectedId = parser.postIdFromUrl(postUrl),
      currentId = parser.postIdFromUrl(location.href);
    if (!force && expectedId && state.postCache.has(expectedId)) {
      return state.postCache.get(expectedId);
    }
    cacheAllDocumentPosts(document);
    if (!force && expectedId && state.postCache.has(expectedId)) {
      return state.postCache.get(expectedId);
    }
    if (expectedId && expectedId === currentId) {
      let currentPost = parseDocument(document, location.href);
      if (currentPost?.id === expectedId) {
        cachePost(currentPost);
        return currentPost;
      }
    }

    let domPost = extractPostFromDom(expectedId, postUrl);
    if (domPost && domPost.media?.length) {
      cachePost(domPost);
      return domPost;
    }

    try {
      let response = await fetch(postUrl, {
        credentials: "include",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal,
      });
      if (response.ok) {
        let html = await response.text(),
          parsedDocument = new DOMParser().parseFromString(html, "text/html"),
          post = parseDocument(parsedDocument, response.url || postUrl);
        if (post && (!expectedId || post.id === expectedId)) {
          cachePost(post);
          return post;
        }
      }
    } catch (e) {
      console.warn("[ViralDog][TikTok] fetchPost HTML request failed:", e);
    }

    let fallback = extractPostFromDom(expectedId, postUrl);
    if (fallback) {
      cachePost(fallback);
      return fallback;
    }

    throw new Error("A mídia não foi encontrada na página");
  }

  function canonicalPostUrl(username, postId, type = "video") {
    return `https://www.tiktok.com/@${encodeURIComponent(username)}/${type}/${postId}`;
  }

  function postReferenceFromElement(element) {
    let explicitUrl = element?.dataset?.postUrl,
      explicitId = element?.dataset?.postId;
    if (explicitUrl) {
      let context = currentContext(explicitUrl);
      return {
        url: explicitUrl,
        postId: explicitId || context.postId,
        username: context.username,
      };
    }

    let scope =
        element?.closest?.("article") ||
        element?.closest?.('[data-e2e="user-post-item"]') ||
        element?.parentElement ||
        document,
      anchor =
        element?.closest?.('a[href*="/video/"], a[href*="/photo/"]') ||
        scope.querySelector?.('a[href*="/video/"], a[href*="/photo/"]');
    if (anchor?.href && parser.postIdFromUrl(anchor.href)) {
      let context = currentContext(anchor.href);
      return {
        url: anchor.href,
        postId: context.postId,
        username: context.username,
      };
    }

    let wrapper = scope.querySelector?.('[id*="xgwrapper-"]'),
      wrapperMatch = wrapper?.id?.match(/-(\d{8,})$/),
      usernameAnchor = scope.querySelector?.('a[href^="/@"]'),
      usernameMatch = usernameAnchor?.getAttribute("href")?.match(/^\/@([^/?#]+)/);
    if (wrapperMatch && usernameMatch) {
      let postId = wrapperMatch[1],
        username = decodeURIComponent(usernameMatch[1]),
        cached = state.postCache.get(postId),
        type = cached?.mediaType === "photos" ? "photo" : "video";
      return {
        url: cached?.sourceUrl || canonicalPostUrl(username, postId, type),
        postId,
        username,
      };
    }

    let context = currentContext();
    return context.postId
      ? { url: context.url, postId: context.postId, username: context.username }
      : null;
  }

  function jsonDataUrl(data) {
    let bytes = new TextEncoder().encode(JSON.stringify(data, null, 2)),
      binary = "";
    for (let index = 0; index < bytes.length; index += 32768) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    }
    return `data:application/json;base64,${btoa(binary)}`;
  }

  function dateStamp(timestamp) {
    let date = timestamp ? new Date(timestamp * 1000) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    return date.toISOString().replace(/[-:]/g, "").slice(0, 13);
  }

  function isDarkPage() {
    let color = window.getComputedStyle(document.body).backgroundColor,
      channels = color?.match(/(\d+)/g);
    if (!channels || channels.length < 3) return false;
    return channels.slice(0, 3).map(Number).reduce((sum, value) => sum + value, 0) / 3 < 50;
  }

  function showToast(message, type = "success") {
    document.querySelector(".dog-saver-tiktok-toast")?.remove();
    let toast = document.createElement("div");
    toast.className = `dog-saver-tiktok-toast${type === "error" ? " is-error" : ""}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        ${
          type === "error"
            ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
            : '<polyline points="20 6 9 17 4 12"/>'
        }
      </svg>
      <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  }

  async function getDuplicateRegistry() {
    let stored = await chrome.storage.local.get(DUPLICATE_KEY),
      registry = stored[DUPLICATE_KEY];
    return registry && typeof registry === "object" ? registry : {};
  }

  async function markDownloaded(posts) {
    let registry = await getDuplicateRegistry(),
      downloadedAt = Date.now();
    for (let post of posts) {
      registry[post.id] = {
        platform: "tiktok",
        username: post.username,
        downloadedAt,
        verifiedMedia: true,
      };
    }
    let ids = Object.keys(registry);
    if (ids.length > 25000) {
      ids.sort(
        (left, right) =>
          (registry[right]?.downloadedAt || 0) -
          (registry[left]?.downloadedAt || 0),
      );
      registry = Object.fromEntries(
        ids.slice(0, 25000).map((id) => [id, registry[id]]),
      );
    }
    await chrome.storage.local.set({ [DUPLICATE_KEY]: registry });
  }

  function setPostBusy(postId, busy) {
    if (!postId) return;
    for (let button of document.querySelectorAll(
      `.dog-saver-tiktok-post-button[data-post-id="${CSS.escape(String(postId))}"]`,
    )) {
      button.disabled = busy;
      button.classList.toggle("is-busy", busy);
      button.title = busy ? "Preparando download" : "Baixar esta publicação";
    }
  }

  function singleMediaPayload(post) {
    let media = post.media[0];
    return {
      urls: [media.url, ...(media.fallbackUrls || [])],
      expectedType: media.type,
      filename: `${sanitize(post.username)}/${dateStamp(post.createdAt)}_${post.id}.${media.ext}`,
    };
  }

  async function downloadSingleMedia(post, reference) {
    let payload = singleMediaPayload(post);
    try {
      return await requestPageMediaDownload(payload);
    } catch (error) {
      console.warn("[ViralDog][TikTok] requestPageMediaDownload failed, trying background download:", error);
      let bgResponse = await sendMessage({
        type: "TIKTOK_DOWNLOAD_FILE",
        payload: {
          filename: payload.filename,
          urls: payload.urls,
          expectedType: payload.expectedType,
        },
      });
      if (bgResponse.error) throw new Error(bgResponse.error);
      return bgResponse;
    }
  }

  async function downloadPost(reference) {
    if (!reference?.url) {
      showToast("Não foi possível identificar esta publicação", "error");
      return;
    }
    let busyKey = reference.postId || reference.url;
    if (state.busyPosts.has(busyKey)) return;
    state.busyPosts.add(busyKey);
    setPostBusy(reference.postId, true);
    showToast("Preparando vídeo do TikTok...");
    try {
      let post = await fetchPost(reference.url, undefined),
        registry = await getDuplicateRegistry();
      if (registry[post.id]?.verifiedMedia) {
        showToast(`@${post.username}: esta publicação já foi baixada`);
        return;
      }

      let response;
      if (post.media.length === 1) {
        response = await downloadSingleMedia(post, reference);
      } else {
        let root = `${sanitize(post.username)}`,
          items = post.media.map((media, index) => ({
            url: media.url,
            urls: [media.url, ...(media.fallbackUrls || [])],
            expectedType: media.type,
            path: `${root}/${dateStamp(post.createdAt)}_${post.id}_${String(index + 1).padStart(2, "0")}.${media.ext}`,
          }));
        response = await sendMessage({
          type: "TIKTOK_DOWNLOAD_ZIP",
          payload: {
            filename: `${sanitize(post.username)}_tiktok_${post.id}.zip`,
            items,
          },
        });
      }
      if (response.error) throw new Error(response.error);
      if (!response.failed) await markDownloaded([post]);
      showToast(
        post.media.length === 1
          ? "Download iniciado"
          : `${response.downloaded || post.media.length} fotos salvas`,
        response.failed ? "error" : "success",
      );
    } catch (error) {
      showToast(`Falha no download: ${error.message}`, "error");
    } finally {
      state.busyPosts.delete(busyKey);
      setPostBusy(reference.postId, false);
    }
  }

  async function getFavoriteProfiles() {
    let stored = await chrome.storage.local.get(FAVORITES_KEY),
      profiles = stored[FAVORITES_KEY];
    if (!Array.isArray(profiles)) return [];
    return Array.from(
      new Set(
        profiles
          .map((username) => String(username || "").replace(/^@/, "").trim())
          .filter(Boolean),
      ),
    ).slice(0, 100);
  }

  async function toggleFavoriteProfile(username) {
    let profiles = await getFavoriteProfiles(),
      normalized = String(username || "").replace(/^@/, "").trim(),
      index = profiles.findIndex(
        (profile) => profile.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
      ),
      active = index < 0;
    if (active) profiles.unshift(normalized);
    else profiles.splice(index, 1);
    await chrome.storage.local.set({ [FAVORITES_KEY]: profiles });
    try {
      window.postMessage({
        type: "VIRALDOG_FAVORITE_TOGGLED",
        platform: "tiktok",
        username: normalized,
        active
      }, window.location.origin);
    } catch(e) {}
    return { active, profiles };
  }

  function updateFavoriteButtons(username, active) {
    for (let button of document.querySelectorAll(
      ".dog-saver-tiktok-profile-favorite",
    )) {
      if (button.dataset.username !== username) continue;
      button.dataset.active = String(active);
      button.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${active ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>`;
      button.title = active ? "Remover dos favoritos" : "Adicionar aos favoritos";
      button.setAttribute("aria-label", button.title);
    }
  }

  const VIRALDOG_FAVORITES_MENU_ID = "viraldog-favorite-profiles-menu";
  function notifyViralDogFavoritesMenuClosed() {
    window.postMessage(
      { type: "VIRALDOG_IG_FAVORITES_MENU_CLOSED" },
      window.location.origin,
    );
  }

  function removeViralDogFavoritesMenu(notify = true) {
    let host = document.getElementById(VIRALDOG_FAVORITES_MENU_ID);
    if (!host) return;
    host.remove();
    document.removeEventListener(
      "pointerdown",
      handleViralDogFavoritesOutsideClick,
      true,
    );
    document.removeEventListener(
      "keydown",
      handleViralDogFavoritesEscape,
      true,
    );
    if (notify) notifyViralDogFavoritesMenuClosed();
  }

  function handleViralDogFavoritesOutsideClick(event) {
    let host = document.getElementById(VIRALDOG_FAVORITES_MENU_ID);
    if (host && !host.contains(event.target)) removeViralDogFavoritesMenu();
  }

  function handleViralDogFavoritesEscape(event) {
    if (event.key === "Escape") removeViralDogFavoritesMenu();
  }

  async function showViralDogFavoritesMenu(anchorX) {
    removeViralDogFavoritesMenu(false);
    let favorites = await getFavoriteProfiles(),
      menuWidth = 240,
      parsedAnchor = Number(anchorX),
      left = Math.max(
        8,
        Math.min(
          Number.isFinite(parsedAnchor) ? parsedAnchor : 8,
          Math.max(8, window.innerWidth - menuWidth - 8),
        ),
      ),
      host = document.createElement("div");
    host.id = VIRALDOG_FAVORITES_MENU_ID;
    host.setAttribute("role", "presentation");
    host.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: ${left}px !important;
      width: ${menuWidth}px !important;
      z-index: 2147483647 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    `;
    let shadow = host.attachShadow({ mode: "open" }),
      style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      .menu {
        width: 240px;
        overflow: hidden;
        border: 1px solid #e8e8ed;
        border-radius: 12px;
        background: #ffffff;
        color: #1d1d1f;
        box-shadow: 0 14px 38px rgba(0, 0, 0, 0.18);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif;
      }
      .title {
        padding: 12px 12px 8px;
        color: #86868b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
      }
      .list {
        max-height: 238px;
        overflow-y: auto;
        padding: 0 6px 6px;
        scrollbar-width: thin;
      }
      .item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 36px;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #1d1d1f;
        font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .item:hover, .item:focus-visible { background: #f5f5f7; outline: none; }
      .star { flex: 0 0 auto; color: #f5b301; font-size: 15px; }
      .username { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .empty { padding: 24px 12px 26px; color: #86868b; font-size: 11px; text-align: center; }
    `;
    let menu = document.createElement("div"),
      title = document.createElement("div"),
      list = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Perfis favoritos");
    title.className = "title";
    title.textContent = "Perfis favoritos (TikTok)";
    list.className = "list";
    menu.append(title, list);

    if (favorites.length === 0) {
      let empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Nenhum perfil favorito";
      list.appendChild(empty);
    } else {
      for (let username of favorites) {
        let item = document.createElement("button"),
          star = document.createElement("span"),
          label = document.createElement("span");
        item.type = "button";
        item.className = "item";
        item.setAttribute("role", "menuitem");
        item.setAttribute("title", `Abrir @${username}`);
        star.className = "star";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "\u2605";
        label.className = "username";
        label.textContent = `@${username}`;
        item.append(star, label);
        item.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeViralDogFavoritesMenu();
          window.location.assign(
            `https://www.tiktok.com/@${encodeURIComponent(username)}`,
          );
        });
        list.appendChild(item);
      }
    }
    shadow.append(style, menu);
    (document.body || document.documentElement).appendChild(host);
    document.addEventListener(
      "pointerdown",
      handleViralDogFavoritesOutsideClick,
      true,
    );
    document.addEventListener(
      "keydown",
      handleViralDogFavoritesEscape,
      true,
    );
  }

  function profilePostUrls(username) {
    let urls = [],
      normalizedUsername = username.toLocaleLowerCase();
    for (let anchor of document.querySelectorAll(
      'a[href*="/video/"], a[href*="/photo/"]',
    )) {
      let url;
      try {
        url = new URL(anchor.href, location.origin);
      } catch {
        continue;
      }
      let match = url.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/(\d+)/i);
      if (
        match &&
        decodeURIComponent(match[1]).toLocaleLowerCase() ===
          normalizedUsername
      ) {
        url.search = "";
        url.hash = "";
        urls.push(url.href);
      }
    }
    return Array.from(new Set(urls));
  }

  function wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Cancelado", "AbortError"));
        return;
      }
      let onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelado", "AbortError"));
        },
        timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, milliseconds);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function collectProfilePosts(username, options) {
    let normalizedOptions = profileFilters.normalizeOptions(options),
      posts = new Map(),
      failures = [],
      target = String(username || "").replace(/^@+/, "");

    // 1. Resolve secUid and user info
    let userInfo = await resolveTikTokUserInfo(target);
    let secUid = userInfo.secUid;

    // 2. Include any already cached posts for THIS creator only
    for (let [id, cachedPost] of state.postCache.entries()) {
      if (
        cachedPost &&
        cachedPost.username &&
        cachedPost.username.toLowerCase() === target.toLowerCase()
      ) {
        posts.set(id, cachedPost);
      }
    }

    // 3. Headless pagination loop via TikTok Web API (No scrolling!)
    let cursor = 0;
    let hasMore = true;
    let page = 0;

    try {
      while (hasMore && page < 200) {
        if (options.signal?.aborted) {
          throw new DOMException("Download abortado pelo usuário", "AbortError");
        }

        // Check if paused
        if (typeof options.checkPause === "function") {
          await options.checkPause();
        }

        let decision = profileFilters.shouldStopProfileScan(
          posts.values(),
          normalizedOptions,
        );
        if (decision.stop) {
          return {
            posts: Array.from(posts.values()).filter(
              (p) => p.username.toLowerCase() === target.toLowerCase(),
            ),
            failures,
            stopReason: decision.reason,
          };
        }

        if (typeof options.onProgress === "function") {
          let selected = decision.result?.posts?.length || posts.size;
          let percent =
            normalizedOptions.strategy === "topk"
              ? Math.min(
                  75,
                  8 +
                    Math.round(
                      (selected / Math.max(1, normalizedOptions.topK)) * 65,
                    ),
                )
              : Math.min(75, 8 + page * 4);

          options.onProgress(
            `Escaneando publicações: ${posts.size} encontradas`,
            percent,
            posts.size,
            userInfo.postCount || posts.size,
          );
        }

        if (!secUid) {
          // Fallback if secUid could not be retrieved: parse existing DOM posts without scrolling
          let urls = profilePostUrls(target);
          if (urls.length > 0) {
            let batch = await fetchProfilePosts(urls, options);
            for (let p of batch.posts) {
              if (p.username.toLowerCase() === target.toLowerCase()) {
                posts.set(p.id, p);
              }
            }
            failures.push(...batch.failures);
          }
          break;
        }

        let apiUrl = `https://www.tiktok.com/api/post/item_list/?aid=1988&app_language=pt-BR&app_name=tiktok_web&secUid=${encodeURIComponent(secUid)}&cursor=${cursor}&count=35&coverFormat=2&post_item_list_request_type=0`;

        let response;
        try {
          response = await fetch(apiUrl, {
            credentials: "include",
            headers: {
              Accept: "application/json, text/plain, */*",
              Referer: `https://www.tiktok.com/@${target}`,
            },
            signal: options.signal,
          });
        } catch (err) {
          if (err.name === "AbortError") throw err;
          failures.push({ url: apiUrl, error: err.message });
          break;
        }

        if (!response.ok) {
          failures.push({ url: apiUrl, error: `HTTP ${response.status}` });
          break;
        }

        let data;
        try {
          data = await response.json();
        } catch (err) {
          failures.push({ url: apiUrl, error: err.message });
          break;
        }

        let itemList = data?.itemList || [];
        if (!Array.isArray(itemList) || itemList.length === 0) {
          hasMore = false;
          break;
        }

        let extracted = parser.extractPosts(data);
        let newPostsCount = 0;
        for (let post of extracted) {
          // Strict creator isolation: only posts by the target profile
          if (
            post &&
            post.username &&
            post.username.toLowerCase() === target.toLowerCase()
          ) {
            if (!posts.has(post.id)) {
              posts.set(post.id, post);
              cachePost(post);
              newPostsCount++;
            }
          }
        }

        cursor = data.cursor || 0;
        hasMore = Boolean(data.hasMore && cursor > 0);
        page++;

        if (newPostsCount === 0 && !hasMore) {
          break;
        }

        await wait(500, options.signal);
      }
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("[ViralDog][TikTok] Headless scan warning:", err);
    }

    let finalPosts = Array.from(posts.values()).filter(
      (p) => p.username.toLowerCase() === target.toLowerCase(),
    );
    return {
      posts: finalPosts,
      failures,
      stopReason: "end",
    };
  }

  async function fetchProfilePosts(urls, options) {
    let posts = new Map(),
      failures = [],
      cursor = 0,
      completed = 0,
      workers = Array.from(
        { length: Math.min(3, Math.max(1, urls.length)) },
        async () => {
          while (cursor < urls.length) {
            let index = cursor++,
              url = urls[index];
            try {
              let post = await fetchPost(url, options.signal);
              posts.set(post.id, post);
            } catch (error) {
              if (error.name === "AbortError") throw error;
              failures.push({ url, error: error.message });
            } finally {
              completed++;
              if (typeof options.onProgress === "function") {
                options.onProgress(
                  `Lendo publicações: ${completed}/${urls.length}`,
                  30 + Math.round((completed / Math.max(1, urls.length)) * 48),
                );
              }
            }
            await wait(180, options.signal);
          }
        },
      );
    await Promise.all(workers);
    return { posts: Array.from(posts.values()), failures };
  }

  function buildProfileZip(
    posts,
    username,
    failures,
    duplicateCount,
    filterResult,
  ) {
    let root = `${sanitize(username)}`,
      items = [];
    for (let post of posts) {
      let base = `${dateStamp(post.createdAt)}_${sanitize(post.id)}`;
      post.media.forEach((media, index) => {
        items.push({
          url: media.url,
          urls: [media.url, ...(media.fallbackUrls || [])],
          expectedType: media.type,
          path: `${root}/${base}${post.media.length > 1 ? `_${String(index + 1).padStart(2, "0")}` : ""}.${media.ext}`,
          postId: post.id,
        });
      });
    }
    items.push({
      url: jsonDataUrl({
        platform: "tiktok",
        username,
        exportedAt: new Date().toISOString(),
        filters: filterResult.options,
        selection: filterResult.counts,
        report: {
          posts: posts.length,
          media: items.length,
          duplicatesSkipped: duplicateCount,
          unavailable: failures.length,
        },
        failures,
        posts,
      }),
      path: `${root}/metadata.json`,
    });
    return items;
  }

  function showTikTokProgressPopup(taskId, username, profilePicUrl, onPauseToggle, onStop) {
    let existing = document.getElementById("dog-saver-tiktok-status");
    if (existing) return existing;

    let dark = isDarkPage();
    let a = document.createElement("div");
    a.id = "dog-saver-tiktok-status";
    a.style.cssText = `
      position: fixed; top: 70px; right: 20px; z-index: 10000;
      background: ${dark ? "rgba(24, 24, 27, 0.94)" : "rgba(255, 255, 255, 0.96)"};
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-radius: 20px; padding: 16px 18px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.04);
      min-width: 290px; max-width: 340px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px; color: ${dark ? "#ffffff" : "#1d1d1f"};
      border: 1px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(0, 0, 0, 0.08)"};
      transform: translateY(-16px); opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      box-sizing: border-box;
    `;

    a.innerHTML = `
      <div style="margin-bottom: 8px;">
        <span style="font-size: 14px; font-weight: 700; color: ${dark ? "#ffffff" : "#1d1d1f"}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;">@${username || 'usuario'}</span>
      </div>

      <div id="dog-saver-tiktok-status-text" style="font-size: 12.5px; font-weight: 600; color: ${dark ? "#ffffff" : "#1d1d1f"}; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Buscando vídeos no perfil...
      </div>

      <div id="dog-saver-tiktok-status-count" style="color: ${dark ? "#9ca3af" : "#86868b"}; font-weight: 500; font-size: 11.5px; margin-bottom: 6px;">0 publicações · 0 arquivos</div>

      <div id="dog-saver-tiktok-progress-container" style="display: block; width: 100%; height: 6px; background: ${dark ? "rgba(255,255,255,0.1)" : "#f2f2f7"}; border-radius: 999px; margin: 8px 0 6px 0; overflow: hidden;">
        <div id="dog-saver-tiktok-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #007AFF, #0056b3); transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); border-radius: 999px;"></div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 500; color: ${dark ? "#9ca3af" : "#86868b"}; margin-top: 4px;">
        <span id="dog-saver-tiktok-status-time"></span>
        <span id="dog-saver-tiktok-status-failed"></span>
      </div>

      <div id="dog-saver-tiktok-actions" style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <button id="dog-saver-tiktok-btn-pause" class="dog-saver-tiktok-btn-status" style="padding: 8px 18px; font-size: 12px; border-radius: 999px; border: 1px solid ${dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.06)"}; background: ${dark ? "rgba(255,255,255,0.08)" : "#f5f5f7"}; color: ${dark ? "#ffffff" : "#1d1d1f"}; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; font-family: inherit; transition: all 0.15s ease; outline: none;">
          <span id="dog-saver-tiktok-btn-pause-icon" style="display: flex; align-items: center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
              <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
            </svg>
          </span>
          <span id="dog-saver-tiktok-btn-pause-text">Pausar</span>
        </button>
        <button id="dog-saver-tiktok-btn-stop" class="dog-saver-tiktok-btn-stop-status" style="padding: 8px 18px; font-size: 12px; border-radius: 999px; border: 1px solid rgba(255, 59, 48, 0.16); background: #fff1f0; color: #ff3b30; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; font-family: inherit; transition: all 0.15s ease; outline: none;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"></rect>
          </svg>
          <span>Parar</span>
        </button>
      </div>
    `;

    if (!document.getElementById("dog-saver-tiktok-keyframes")) {
      let style = document.createElement("style");
      style.id = "dog-saver-tiktok-keyframes";
      style.textContent = `
        @keyframes dogSaverPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.85); } }
        .dog-saver-tiktok-btn-status:hover { background: ${dark ? "rgba(255,255,255,0.15)" : "#e8e8ed"} !important; transform: scale(1.02); }
        .dog-saver-tiktok-btn-status:active { transform: scale(0.97); }
        .dog-saver-tiktok-btn-stop-status:hover { background: #ffe3e1 !important; border-color: rgba(255, 59, 48, 0.3) !important; transform: scale(1.02); }
        .dog-saver-tiktok-btn-stop-status:active { transform: scale(0.97); }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(a);

    let btnPause = a.querySelector("#dog-saver-tiktok-btn-pause");
    let btnStop = a.querySelector("#dog-saver-tiktok-btn-stop");

    if (btnPause && onPauseToggle) {
      btnPause.addEventListener("click", onPauseToggle);
    }
    if (btnStop && onStop) {
      btnStop.addEventListener("click", onStop);
    }

    requestAnimationFrame(() => {
      a.style.transform = "translateY(0)";
      a.style.opacity = "1";
    });

    return a;
  }

  function removeTikTokProgressPopup() {
    let el = document.getElementById("dog-saver-tiktok-status");
    if (el) {
      el.style.transform = "translateY(-16px)";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }
  }

  async function startProfileDownload(username, options) {
    let pro = await sendMessage({ type: "TIKTOK_CHECK_PRO" });
    if (!pro.pro) throw new Error("O download de perfil requer Pro");

    let target = String(username || "").replace(/^@+/, "");
    let userInfo = await resolveTikTokUserInfo(target);
    let taskId = `tiktok_task_${Date.now()}`;

    let isPaused = false;
    let pauseResolve = null;

    let checkPause = () => {
      if (!isPaused) return Promise.resolve();
      return new Promise((res) => {
        pauseResolve = res;
      });
    };

    let onPauseToggle = () => {
      isPaused = !isPaused;
      let btnPauseText = document.getElementById("dog-saver-tiktok-btn-pause-text");
      let btnPauseIcon = document.getElementById("dog-saver-tiktok-btn-pause-icon");
      let statusText = document.getElementById("dog-saver-tiktok-status-text");

      if (isPaused) {
        if (btnPauseText) btnPauseText.textContent = "Retomar";
        if (btnPauseIcon) btnPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>`;
        if (statusText) statusText.textContent = "Pausado";
      } else {
        if (btnPauseText) btnPauseText.textContent = "Pausar";
        if (btnPauseIcon) btnPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>`;
        if (statusText) statusText.textContent = "Baixando arquivos...";
        if (pauseResolve) {
          pauseResolve();
          pauseResolve = null;
        }
      }
    };

    let onStop = () => {
      if (state.controller) state.controller.abort();
      removeTikTokProgressPopup();
      showToast("Download cancelado", "error");
    };

    showTikTokProgressPopup(taskId, target, userInfo.profilePic, onPauseToggle, onStop);

    let updatePopupProgress = (stage, percent, countText, timeText, failedText) => {
      let statusText = document.getElementById("dog-saver-tiktok-status-text");
      let statusCount = document.getElementById("dog-saver-tiktok-status-count");
      let progressBar = document.getElementById("dog-saver-tiktok-progress-bar");
      let statusTime = document.getElementById("dog-saver-tiktok-status-time");
      let statusFailed = document.getElementById("dog-saver-tiktok-status-failed");

      if (statusText && stage && !isPaused) statusText.textContent = stage;
      if (statusCount && countText) statusCount.textContent = countText;
      if (progressBar && typeof percent === "number") progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      if (statusTime && timeText) statusTime.textContent = timeText;
      if (statusFailed && failedText) statusFailed.textContent = failedText;
    };

    try {
      updatePopupProgress("Buscando vídeos no perfil...", 10, "0 publicações · 0 arquivos", "", "");

      let { posts, failures } = await collectProfilePosts(target, {
        ...options,
        checkPause,
        onProgress: (text, percent, found, total) => {
          let countStr = total > 0 ? `${found} publicações · ${found} arquivos` : `${found} publicações · ${found} arquivos`;
          updatePopupProgress("Buscando vídeos no perfil...", percent, countStr, "", "");
        },
      });

      if (!posts.length) {
        updatePopupProgress("Nenhuma publicação encontrada", 0, "0 publicações encontradas", "", "");
        setTimeout(removeTikTokProgressPopup, 3000);
        throw new Error("Nenhuma publicação acessível foi encontrada no perfil");
      }

      let filterResult = profileFilters.filterProfilePosts(posts, options),
        registry = await getDuplicateRegistry(),
        freshPosts = filterResult.posts.filter(
          (post) => !registry[post.id]?.verifiedMedia,
        ),
        duplicateCount = filterResult.posts.length - freshPosts.length;

      if (!freshPosts.length) {
        updatePopupProgress("Concluído", 100, "Nenhuma mídia nova para baixar (todas duplicadas)", "", "");
        setTimeout(removeTikTokProgressPopup, 3500);
        return {
          downloaded: 0,
          failed: failures.length,
          duplicates: duplicateCount,
          posts: 0,
          partial: failures.length > 0,
          message: filterResult.posts.length
            ? "Nenhuma mídia nova para baixar"
            : "Nenhuma publicação corresponde aos filtros",
        };
      }

      updatePopupProgress("Baixando mídias...", 70, `Preparando ${freshPosts.length} arquivos para download...`, "", "");

      let items = buildProfileZip(
        freshPosts,
        target,
        failures,
        duplicateCount,
        filterResult,
      );

      let response = await sendMessage({
        type: "TIKTOK_DOWNLOAD_ZIP",
        payload: {
          filename: `${sanitize(target)}_tiktok_${dateStamp()}.zip`,
          items,
        },
      });

      if (response.error) throw new Error(response.error);
      if (!response.failed) await markDownloaded(freshPosts);

      updatePopupProgress(
        "Concluído!",
        100,
        `${freshPosts.length} baixados com sucesso${failures.length ? `, ${failures.length} falhas` : ""}`,
        "Pronto!",
        failures.length ? `Falhas: ${failures.length}` : "",
      );

      setTimeout(removeTikTokProgressPopup, 4000);

      return {
        downloaded: response.downloaded || 0,
        failed: (response.failed || 0) + failures.length,
        duplicates: duplicateCount,
        posts: freshPosts.length,
        partial: Boolean(response.failed || failures.length),
      };
    } catch (err) {
      if (err.name === "AbortError") {
        updatePopupProgress("Cancelado", 0, "Download cancelado pelo usuário", "", "");
        setTimeout(removeTikTokProgressPopup, 2000);
      } else {
        updatePopupProgress("Erro", 0, err.message, "", "");
        setTimeout(removeTikTokProgressPopup, 4000);
      }
      throw err;
    }
  }

  function readNumberInput(root, selector) {
    let value = Number.parseInt(root.querySelector(selector)?.value, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function dateBoundary(value, endOfDay) {
    if (!value) return null;
    let timestamp = new Date(
      `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
    ).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function readDialogOptions(overlay) {
    let strategy = overlay.querySelector("#dog-saver-tiktok-strategy").value,
      mediaType = overlay.querySelector("#dog-saver-tiktok-media-type").value,
      fromValue = overlay.querySelector("#dog-saver-tiktok-from").value,
      toValue = overlay.querySelector("#dog-saver-tiktok-to").value,
      fromTs = dateBoundary(fromValue, false),
      toTs = dateBoundary(toValue, true);
    if (strategy === "range" && (!fromTs || !toTs)) {
      throw new Error("Informe as datas inicial e final");
    }
    if (fromTs && toTs && fromTs > toTs) {
      throw new Error("A data inicial deve ser anterior à data final");
    }
    return profileFilters.normalizeOptions({
      strategy,
      topK: readNumberInput(overlay, "#dog-saver-tiktok-topk"),
      nDays: readNumberInput(overlay, "#dog-saver-tiktok-ndays"),
      fromTs,
      toTs,
      keyword: overlay.querySelector("#dog-saver-tiktok-keyword").value,
      minLikes: readNumberInput(overlay, "#dog-saver-tiktok-min-likes"),
      minViews: readNumberInput(overlay, "#dog-saver-tiktok-min-views"),
      minComments: readNumberInput(
        overlay,
        "#dog-saver-tiktok-min-comments",
      ),
      includeVideos: mediaType === "all" || mediaType === "videos",
      includePhotos: mediaType === "all" || mediaType === "photos",
    });
  }

  async function renderFavoriteProfiles(overlay) {
    let row = overlay.querySelector("#dog-saver-tiktok-favorites-row"),
      container = overlay.querySelector("#dog-saver-tiktok-favorites-list"),
      toggle = overlay.querySelector("#dog-saver-tiktok-favorites-toggle"),
      favorites = await getFavoriteProfiles();
    if (!row || !container || !toggle) return;
    container.replaceChildren();
    row.classList.remove("is-expanded");
    toggle.setAttribute("aria-expanded", "false");
    if (!favorites.length) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    for (let username of favorites) {
      let chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dog-saver-tiktok-favorite-chip";
      chip.title = `Abrir @${username}`;
      chip.textContent = `@${username}`;
      chip.addEventListener("click", () => {
        window.location.assign(
          `https://www.tiktok.com/@${encodeURIComponent(username)}`,
        );
      });
      container.appendChild(chip);
    }
    requestAnimationFrame(() => {
      toggle.hidden = container.scrollWidth <= container.clientWidth + 1;
    });
  }

  function getTikTokProfileInfo(username) {
    let u = username || currentContext().username || "unknown";
    let avatarUrl = "";
    let nickname = u;
    let videoCount = null;
    let secUid = "";

    try {
      let raw = hydrationText(document);
      if (raw) {
        let data = JSON.parse(raw);
        let userInfo = data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
        if (userInfo) {
          avatarUrl = userInfo.user?.avatarLarger || userInfo.user?.avatarMedium || userInfo.user?.avatarThumb;
          nickname = userInfo.user?.nickname || userInfo.user?.uniqueId || u;
          secUid = userInfo.user?.secUid || "";
          let rawCount = userInfo.stats?.videoCount;
          if (typeof rawCount === "number" && !isNaN(rawCount) && rawCount >= 0) {
            videoCount = rawCount;
          }
        }
      }
    } catch {}

    if (!avatarUrl) {
      let img = document.querySelector('[data-e2e="user-avatar"] img, header img, [class*="Avatar"] img, img[alt*="avatar"]');
      if (img) avatarUrl = img.src;
    }
    if (!avatarUrl) {
      avatarUrl = "https://www.tiktok.com/favicon.ico";
    }

    if (nickname === u) {
      let titleEl = document.querySelector('[data-e2e="user-title"], [data-e2e="user-subtitle"], h1');
      if (titleEl && titleEl.textContent) nickname = titleEl.textContent.trim();
    }

    if (videoCount === null || videoCount === undefined) {
      let countEl = document.querySelector('[data-e2e="video-count"]');
      if (countEl && countEl.textContent) {
        let text = countEl.textContent.trim();
        let match = text.match(/([\d.,]+)\s*([KkMm])?/);
        if (match) {
          let num = parseFloat(match[1].replace(",", "."));
          if (match[2]?.toUpperCase() === "K") num *= 1000;
          else if (match[2]?.toUpperCase() === "M") num *= 1000000;
          if (Number.isFinite(num) && num > 0) videoCount = Math.round(num);
        }
      }
    }

    let postItemsCount = document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]').length;
    let finalCount = (typeof videoCount === "number" && videoCount > 0) ? videoCount : postItemsCount;

    return {
      username: u,
      fullName: nickname || u,
      profilePic: avatarUrl,
      postCount: finalCount,
      secUid: secUid
    };
  }

  async function resolveTikTokUserInfo(username) {
    let info = getTikTokProfileInfo(username);
    if (info.secUid && info.profilePic && !info.profilePic.includes("favicon")) return info;

    let target = String(username || "").replace(/^@+/, "");
    try {
      let controller = new AbortController();
      let timer = setTimeout(() => controller.abort(), 3500);
      let res = await fetch(`https://www.tiktok.com/@${target}`, {
        credentials: "include",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        let html = await res.text();
        let match =
          html.match(
            /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i,
          ) || html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i);
        if (match && match[1]) {
          let data = JSON.parse(match[1]);
          let userInfo =
            data?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo ||
            data?.UserModule?.users?.[target];
          if (userInfo) {
            let u = userInfo.user || userInfo;
            if (u.secUid) info.secUid = u.secUid;
            if (u.avatarLarger || u.avatarMedium || u.avatarThumb) {
              info.profilePic =
                u.avatarLarger || u.avatarMedium || u.avatarThumb;
            }
            if (u.nickname) info.fullName = u.nickname;
            if (userInfo.stats?.videoCount)
              info.postCount = userInfo.stats.videoCount;
          }
        }
      }
    } catch {}
    return info;
  }

  async function openProfileDialog() {
    document.getElementById("dog-saver-tiktok-overlay")?.remove();
    let context = currentContext();
    if (context.type !== "profile") {
      showToast("Abra um perfil do TikTok para continuar", "error");
      return;
    }

    let profileInfo = getTikTokProfileInfo(context.username);
    let initialCount = profileInfo.postCount > 0 ? profileInfo.postCount : 0;
    let postCountText = initialCount > 0 ? `${initialCount} vídeos` : "Perfil";

    let favorites = await getFavoriteProfiles();
    let isFav = favorites.includes(profileInfo.username.toLowerCase());

    let overlay = document.createElement("div");
    overlay.id = "dog-saver-tiktok-overlay";

    let labelStyle = "font-size: 12px; color: var(--dog-tt-muted, #86868b); display: block; margin-bottom: 6px; font-weight: 600; text-align: left; text-transform: uppercase; letter-spacing: 0.3px;";

    overlay.innerHTML = `
      <div id="dog-saver-tiktok-modal-row" class="dog-saver-tiktok-modal-row">
        <!-- Main Card -->
        <div id="dog-saver-tiktok-dialog" class="dog-saver-tiktok-glass-card" role="dialog" aria-modal="true">
          <div>
            <!-- Profile Header Card -->
            <div class="dog-saver-tiktok-profile-card" style="margin-bottom: 8px;">
              <img class="dog-saver-tiktok-profile-avatar" src="${escapeHtml(profileInfo.profilePic)}" alt="avatar">
              <div class="dog-saver-tiktok-profile-info">
                <div class="dog-saver-tiktok-profile-name" title="${escapeHtml(profileInfo.fullName)}">${escapeHtml(profileInfo.fullName)}</div>
                <div class="dog-saver-tiktok-profile-handle">@${escapeHtml(profileInfo.username)}</div>
              </div>
              <div class="dog-saver-tiktok-profile-meta-wrap">
                <span class="dog-saver-tiktok-profile-posts" id="dog-saver-tiktok-profile-posts-badge">${postCountText}</span>
              </div>
              <button type="button" id="dog-saver-tiktok-profile-favorite-btn" class="dog-saver-tiktok-profile-favorite-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remover dos favoritos' : 'Favoritar perfil'}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
            </div>

            <!-- Tipo de Mídia -->
            <div style="margin-bottom: 8px;">
              <label style="${labelStyle}">TIPO DE MÍDIA</label>
              <div class="dog-saver-tiktok-segmented-group" id="dog-saver-tiktok-filter-segmented">
                <button type="button" class="dog-saver-tiktok-segment-btn active" data-value="all">Tudo</button>
                <button type="button" class="dog-saver-tiktok-segment-btn" data-value="photos">Apenas fotos</button>
                <button type="button" class="dog-saver-tiktok-segment-btn" data-value="videos">Apenas vídeos</button>
              </div>
              <input type="hidden" id="dog-saver-tiktok-media-type" value="all">
            </div>

            <!-- Quantidade de Posts -->
            <div style="margin-bottom: 8px;">
              <label style="${labelStyle}">QUANTIDADE DE POSTS</label>
              <div class="dog-saver-tiktok-segmented-group" id="dog-saver-tiktok-strategy-segmented">
                <button type="button" class="dog-saver-tiktok-segment-btn active" data-value="all">Tudo</button>
                <button type="button" class="dog-saver-tiktok-segment-btn" data-value="topk">Definir quantidade</button>
              </div>
              <div id="dog-saver-tiktok-quantity-stepper-wrap" style="display: none; margin-top: 6px;">
                <div class="dog-saver-tiktok-stepper" style="width: 100%;">
                  <button type="button" id="dog-saver-tiktok-topk-dec" class="dog-saver-tiktok-stepper-btn">&minus;</button>
                  <input type="number" inputmode="numeric" id="dog-saver-tiktok-topk" min="1" placeholder="ex: 50" value="50" class="dog-saver-tiktok-stepper-input">
                  <button type="button" id="dog-saver-tiktok-topk-inc" class="dog-saver-tiktok-stepper-btn">+</button>
                </div>
              </div>
              <input type="hidden" id="dog-saver-tiktok-strategy" value="all">
              <input type="hidden" id="dog-saver-tiktok-from" value="">
              <input type="hidden" id="dog-saver-tiktok-to" value="">
            </div>

            <!-- Filtros Button -->
            <div style="margin-top: 10px;">
              <button type="button" id="dog-saver-tiktok-filters-trigger" class="dog-saver-tiktok-filters-trigger-btn">
                <span style="font-size: 12.5px; font-weight: 600; color: #1d1d1f;">Filtros</span>
                <span id="dog-saver-tiktok-active-filters-badge" class="dog-saver-tiktok-filter-count-badge">0 ativos</span>
                <span class="dog-saver-tiktok-filter-arrow" style="display: none;"></span>
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; gap: 10px; margin-top: 14px;">
            <button type="button" id="dog-saver-tiktok-start" class="dog-saver-tiktok-btn-primary">Iniciar download</button>
            <button type="button" id="dog-saver-tiktok-cancel" class="dog-saver-tiktok-btn-secondary">Cancelar</button>
          </div>
        </div>

        <!-- Filters Flyout Card -->
        <div id="dog-saver-tiktok-filters-flyout" class="dog-saver-tiktok-filters-flyout">
          <div class="dog-saver-tiktok-flyout-header">
            <span style="font-size: 14px; font-weight: 700; color: #1d1d1f;">Filtros</span>
            <button type="button" id="dog-saver-tiktok-flyout-close" class="dog-saver-tiktok-flyout-close-btn">&times;</button>
          </div>
          <div class="dog-saver-tiktok-flyout-fields">
            <div>
              <label style="${labelStyle}">HASHTAG OU PALAVRA-CHAVE</label>
              <input type="text" id="dog-saver-tiktok-keyword" placeholder="ex: #surf" class="dog-saver-tiktok-field">
            </div>
            <div>
              <label style="${labelStyle}">MÍNIMO DE CURTIDAS</label>
              <div class="dog-saver-tiktok-stepper">
                <button type="button" id="dog-saver-tiktok-likes-dec" class="dog-saver-tiktok-stepper-btn">&minus;</button>
                <input type="number" inputmode="numeric" id="dog-saver-tiktok-min-likes" min="0" placeholder="ex: 1000" class="dog-saver-tiktok-stepper-input">
                <button type="button" id="dog-saver-tiktok-likes-inc" class="dog-saver-tiktok-stepper-btn">+</button>
              </div>
            </div>
            <div>
              <label style="${labelStyle}">MÍNIMO DE VISUALIZAÇÕES</label>
              <div class="dog-saver-tiktok-stepper">
                <button type="button" id="dog-saver-tiktok-views-dec" class="dog-saver-tiktok-stepper-btn">&minus;</button>
                <input type="number" inputmode="numeric" id="dog-saver-tiktok-min-views" min="0" placeholder="ex: 5000" class="dog-saver-tiktok-stepper-input">
                <button type="button" id="dog-saver-tiktok-views-inc" class="dog-saver-tiktok-stepper-btn">+</button>
              </div>
            </div>
            <div>
              <label style="${labelStyle}">MÍNIMO DE COMENTÁRIOS</label>
              <div class="dog-saver-tiktok-stepper">
                <button type="button" id="dog-saver-tiktok-comments-dec" class="dog-saver-tiktok-stepper-btn">&minus;</button>
                <input type="number" inputmode="numeric" id="dog-saver-tiktok-min-comments" min="0" placeholder="ex: 100" class="dog-saver-tiktok-stepper-input">
                <button type="button" id="dog-saver-tiktok-comments-inc" class="dog-saver-tiktok-stepper-btn">+</button>
              </div>
            </div>
          </div>
          <div class="dog-saver-tiktok-flyout-footer">
            <button type="button" id="dog-saver-tiktok-apply-filters-btn" class="dog-saver-tiktok-flyout-apply-btn">Aplicar Filtros</button>
            <button type="button" id="dog-saver-tiktok-clean-filters-footer-btn" class="dog-saver-tiktok-flyout-clean-btn">Limpar</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Favorite Button
    let favBtn = overlay.querySelector("#dog-saver-tiktok-profile-favorite-btn");
    if (favBtn) {
      favBtn.addEventListener("click", async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        let res = await toggleFavoriteProfile(profileInfo.username);
        favBtn.classList.toggle("active", res.active);
        favBtn.title = res.active ? "Remover dos favoritos" : "Favoritar perfil";
        let svg = favBtn.querySelector("svg");
        if (svg) {
          svg.setAttribute("fill", res.active ? "currentColor" : "none");
        }
        updateFavoriteButtons(profileInfo.username, res.active);
      });
    }

    // Media Type Segmented Control
    let mediaTypeSegment = overlay.querySelector("#dog-saver-tiktok-filter-segmented");
    let mediaTypeHidden = overlay.querySelector("#dog-saver-tiktok-media-type");
    if (mediaTypeSegment && mediaTypeHidden) {
      let buttons = mediaTypeSegment.querySelectorAll(".dog-saver-tiktok-segment-btn");
      buttons.forEach(btn => {
        btn.addEventListener("click", () => {
          buttons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          mediaTypeHidden.value = btn.getAttribute("data-value");
        });
      });
    }

    // Strategy / Quantity Segmented Control
    let strategySegment = overlay.querySelector("#dog-saver-tiktok-strategy-segmented");
    let strategyHidden = overlay.querySelector("#dog-saver-tiktok-strategy");
    let quantityWrap = overlay.querySelector("#dog-saver-tiktok-quantity-stepper-wrap");
    let topKInput = overlay.querySelector("#dog-saver-tiktok-topk");
    if (strategySegment && strategyHidden) {
      let buttons = strategySegment.querySelectorAll(".dog-saver-tiktok-segment-btn");
      buttons.forEach(btn => {
        btn.addEventListener("click", () => {
          buttons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          let val = btn.getAttribute("data-value");
          strategyHidden.value = val;
          if (val === "topk") {
            if (quantityWrap) quantityWrap.style.display = "block";
            if (topKInput && (!topKInput.value || parseInt(topKInput.value, 10) < 1)) {
              topKInput.value = "50";
            }
          } else {
            if (quantityWrap) quantityWrap.style.display = "none";
          }
        });
      });
    }

    // Steppers helper
    function setupNumericStepper(inputId, decId, incId, step = 100, minVal = 0) {
      let input = overlay.querySelector(inputId);
      let dec = overlay.querySelector(decId);
      let inc = overlay.querySelector(incId);
      if (input && dec && inc) {
        dec.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          let curr = parseInt(input.value, 10) || 0;
          let nextVal = Math.max(minVal, curr - step);
          input.value = (inputId === "#dog-saver-tiktok-topk" || nextVal > 0) ? String(nextVal) : "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          updateActiveFiltersBadge();
        });
        inc.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          let curr = parseInt(input.value, 10) || 0;
          let nextVal = curr + step;
          input.value = String(nextVal);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          updateActiveFiltersBadge();
        });
      }
    }

    setupNumericStepper("#dog-saver-tiktok-topk", "#dog-saver-tiktok-topk-dec", "#dog-saver-tiktok-topk-inc", 10, 1);
    setupNumericStepper("#dog-saver-tiktok-min-likes", "#dog-saver-tiktok-likes-dec", "#dog-saver-tiktok-likes-inc", 500, 0);
    setupNumericStepper("#dog-saver-tiktok-min-views", "#dog-saver-tiktok-views-dec", "#dog-saver-tiktok-views-inc", 1000, 0);
    setupNumericStepper("#dog-saver-tiktok-min-comments", "#dog-saver-tiktok-comments-dec", "#dog-saver-tiktok-comments-inc", 50, 0);

    // Filters Flyout Logic
    let filtersTrigger = overlay.querySelector("#dog-saver-tiktok-filters-trigger");
    let filtersFlyout = overlay.querySelector("#dog-saver-tiktok-filters-flyout");
    let flyoutClose = overlay.querySelector("#dog-saver-tiktok-flyout-close");
    let applyFiltersBtn = overlay.querySelector("#dog-saver-tiktok-apply-filters-btn");
    let cleanFiltersBtn = overlay.querySelector("#dog-saver-tiktok-clean-filters-footer-btn");

    function updateActiveFiltersBadge() {
      let badge = overlay.querySelector("#dog-saver-tiktok-active-filters-badge");
      let trigger = overlay.querySelector("#dog-saver-tiktok-filters-trigger");
      let kw = (overlay.querySelector("#dog-saver-tiktok-keyword")?.value || "").trim();
      let likes = parseInt(overlay.querySelector("#dog-saver-tiktok-min-likes")?.value, 10) || 0;
      let views = parseInt(overlay.querySelector("#dog-saver-tiktok-min-views")?.value, 10) || 0;
      let comments = parseInt(overlay.querySelector("#dog-saver-tiktok-min-comments")?.value, 10) || 0;

      let count = 0;
      if (kw.length > 0) count++;
      if (likes > 0) count++;
      if (views > 0) count++;
      if (comments > 0) count++;

      if (badge) {
        badge.textContent = `${count} ativo${count === 1 ? "" : "s"}`;
      }
      if (trigger) {
        trigger.classList.toggle("has-filters", count > 0);
      }
      return count;
    }

    function clearAllFilters() {
      let ids = [
        "#dog-saver-tiktok-keyword",
        "#dog-saver-tiktok-min-likes",
        "#dog-saver-tiktok-min-views",
        "#dog-saver-tiktok-min-comments"
      ];
      ids.forEach(sel => {
        let el = overlay.querySelector(sel);
        if (el) {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      updateActiveFiltersBadge();
    }

    if (filtersTrigger && filtersFlyout) {
      filtersTrigger.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        let isOpen = filtersFlyout.classList.toggle("is-open");
        filtersTrigger.classList.toggle("is-active", isOpen);
      });

      if (flyoutClose) {
        flyoutClose.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          filtersFlyout.classList.remove("is-open");
          filtersTrigger.classList.remove("is-active");
        });
      }

      if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          updateActiveFiltersBadge();
          filtersFlyout.classList.remove("is-open");
          filtersTrigger.classList.remove("is-active");
        });
      }

      if (cleanFiltersBtn) {
        cleanFiltersBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          clearAllFilters();
        });
      }
    }

    // Hook up active filters change observers
    let filterSelectors = [
      "#dog-saver-tiktok-keyword", "#dog-saver-tiktok-min-likes",
      "#dog-saver-tiktok-min-views", "#dog-saver-tiktok-min-comments"
    ];
    for (let sel of filterSelectors) {
      let el = overlay.querySelector(sel);
      if (el) {
        el.addEventListener("input", updateActiveFiltersBadge);
        el.addEventListener("change", updateActiveFiltersBadge);
      }
    }
    updateActiveFiltersBadge();

    // Cancel & Start Actions
    let cancelButton = overlay.querySelector("#dog-saver-tiktok-cancel");
    let startButton = overlay.querySelector("#dog-saver-tiktok-start");

    cancelButton.addEventListener("click", () => {
      if (state.controller) {
        state.controller.abort();
        return;
      }
      overlay.remove();
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !state.controller) overlay.remove();
    });

    startButton.addEventListener("click", async () => {
      let options;
      try {
        options = readDialogOptions(overlay);
      } catch (error) {
        showToast(error.message, "error");
        return;
      }
      if (!options.includeVideos && !options.includePhotos) {
        showToast("Selecione vídeos, fotos ou ambos", "error");
        return;
      }

      state.controller = new AbortController();
      let targetUsername = context.username;

      // Close modal immediately and run completely in background with floating status widget
      overlay.remove();

      try {
        let report = await startProfileDownload(targetUsername, {
          ...options,
          signal: state.controller.signal,
          onProgress: (text, percent) => {},
        });
        showToast(
          report.partial
            ? "ZIP parcial salvo; itens com falha podem ser tentados novamente"
            : "Download do perfil concluído",
          report.partial ? "error" : "success",
        );
      } catch (error) {
        if (error.name !== "AbortError") {
          showToast(`Falha no download: ${error.message}`, "error");
        }
      } finally {
        state.controller = null;
      }
    });
  }

  function createPostButton(reference, variant) {
    let button = document.createElement("button");
    button.type = "button";
    button.className = `dog-saver-tiktok-post-button ${variant}`;
    button.dataset.postUrl = reference.url;
    button.dataset.postId = reference.postId || "";
    button.title = "Baixar esta publicação";
    button.setAttribute("aria-label", "Baixar esta publicação");
    button.innerHTML = `
      <span aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      downloadPost(postReferenceFromElement(button));
    });
    return button;
  }

  function isVisibleElement(element) {
    if (!element?.isConnected) return false;
    let rect = element.getBoundingClientRect(),
      style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function isExposedElement(element) {
    if (!isVisibleElement(element)) return false;
    let rect = element.getBoundingClientRect(),
      x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
      y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2)),
      hit = document.elementFromPoint(x, y);
    return Boolean(hit && (element.contains(hit) || hit.contains(element)));
  }

  function removeIntegratedControls(selector) {
    for (let element of document.querySelectorAll(selector)) element.remove();
  }

  function scanFeedCards() {
    for (let article of document.querySelectorAll(
      'article[data-e2e="recommend-list-item-container"], div[data-e2e="recommend-list-item-container"]',
    )) {
      if (article.querySelector(".dog-saver-tiktok-feed-button")) continue;
      let reference = postReferenceFromElement(article),
        shareIcon = article.querySelector('[data-e2e="share-icon"]') || article.querySelector('button[data-e2e="share-button"]');
      if (!reference || !shareIcon?.parentElement) continue;
      let button = createPostButton(reference, "dog-saver-tiktok-feed-button");
      shareIcon.insertAdjacentElement("afterend", button);
    }
  }

  function scanProfileGrid() {
    let context = currentContext();
    if (context.type !== "profile") return;
    for (let anchor of document.querySelectorAll(
      'a[href*="/video/"], a[href*="/photo/"]',
    )) {
      let postContext = currentContext(anchor.href);
      if (
        !postContext.postId ||
        postContext.username?.toLocaleLowerCase() !==
          context.username.toLocaleLowerCase()
      )
        continue;
      let tile = anchor.closest("button")?.parentElement || anchor.parentElement;
      if (!tile || tile.querySelector(".dog-saver-tiktok-grid-button")) continue;
      if (getComputedStyle(tile).position === "static") tile.style.position = "relative";
      tile.appendChild(
        createPostButton(
          {
            url: anchor.href,
            postId: postContext.postId,
            username: postContext.username,
          },
          "dog-saver-tiktok-grid-button",
        ),
      );
    }
  }

  function scanPostDetail() {
    let context = currentContext();
    if (!context.postId) return;
    let existing = Array.from(
      document.querySelectorAll(".dog-saver-tiktok-detail-button"),
    ),
      active = existing.find(
        (button) =>
          button.dataset.postId === context.postId && isExposedElement(button),
      );
    if (active) {
      existing.filter((button) => button !== active).forEach((button) => button.remove());
      return;
    }
    existing.forEach((button) => button.remove());

    let shareIcon = Array.from(
      document.querySelectorAll('[data-e2e="share-icon"], button[data-e2e="share-button"]'),
      ).find(isExposedElement),
      reference = {
        url: context.url,
        postId: context.postId,
        username: context.username,
      };
    if (shareIcon?.parentElement) {
      shareIcon.insertAdjacentElement(
        "afterend",
        createPostButton(reference, "dog-saver-tiktok-detail-button"),
      );
      return;
    }
    let media = Array.from(document.querySelectorAll("video, img"))
        .filter(
          (element) => isExposedElement(element),
        )
        .sort((left, right) => {
          let leftRect = left.getBoundingClientRect(),
            rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        })[0],
      container = media?.parentElement;
    if (!container) return;
    if (getComputedStyle(container).position === "static")
      container.style.position = "relative";
    container.appendChild(
      createPostButton(
        reference,
        "dog-saver-tiktok-detail-button dog-saver-tiktok-overlay-button",
      ),
    );
  }

  function findProfileHeader() {
    let context = currentContext();
    if (context.type !== "profile") return null;
    let userPage =
        document.querySelector('[data-e2e="user-page"]') ||
        document.querySelector("main"),
      heading = userPage?.querySelector("h1"),
      scope = heading;
    while (scope && scope !== userPage?.parentElement) {
      let follow = scope.querySelector?.('button[data-e2e="follow-button"]') || scope.querySelector?.('button[data-e2e="edit-profile-button"]');
      if (follow) return { scope, follow, username: context.username };
      scope = scope.parentElement;
    }
    return null;
  }

  async function ensureProfileActions() {
    let profile = findProfileHeader();
    if (!profile) return;
    let existing = profile.scope.querySelector(
      ".dog-saver-tiktok-profile-actions",
    );
    if (existing?.dataset.username === profile.username) return;
    existing?.remove();

    let group = document.createElement("div");
    group.className = "dog-saver-tiktok-profile-actions";
    group.dataset.username = profile.username;

    let downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "dog-saver-tiktok-profile-download";
    downloadButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Baixar tudo</span>`;
    downloadButton.addEventListener("click", openProfileDialog);

    let favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "dog-saver-tiktok-profile-favorite";
    favoriteButton.dataset.username = profile.username;
    favoriteButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`;
    favoriteButton.title = "Adicionar aos favoritos";
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.addEventListener("click", async () => {
      favoriteButton.disabled = true;
      try {
        let result = await toggleFavoriteProfile(profile.username);
        updateFavoriteButtons(profile.username, result.active);
        showToast(
          result.active
            ? `@${profile.username} adicionado aos favoritos`
            : `@${profile.username} removido dos favoritos`,
        );
        let overlay = document.getElementById("dog-saver-tiktok-overlay");
        if (overlay) renderFavoriteProfiles(overlay);
      } catch (error) {
        showToast(`Falha ao atualizar favoritos: ${error.message}`, "error");
      } finally {
        favoriteButton.disabled = false;
      }
    });

    group.append(downloadButton, favoriteButton);
    let interaction = profile.follow.parentElement;
    interaction.insertAdjacentElement("afterend", group);

    let favorites = await getFavoriteProfiles(),
      active = favorites.some(
        (username) =>
          username.toLocaleLowerCase() === profile.username.toLocaleLowerCase(),
      );
    updateFavoriteButtons(profile.username, active);
  }

  function scanIntegratedControls() {
    let context = currentContext();
    if (context.postId) {
      removeIntegratedControls(
        ".dog-saver-tiktok-feed-button, .dog-saver-tiktok-grid-button, .dog-saver-tiktok-profile-actions",
      );
      scanPostDetail();
      return;
    }
    if (context.type === "profile") {
      removeIntegratedControls(
        ".dog-saver-tiktok-feed-button, .dog-saver-tiktok-detail-button",
      );
      scanProfileGrid();
      ensureProfileActions().catch(() => {});
      return;
    }
    removeIntegratedControls(
      ".dog-saver-tiktok-grid-button, .dog-saver-tiktok-detail-button, .dog-saver-tiktok-profile-actions",
    );
    scanFeedCards();
  }

  function scheduleScan() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (state.controller) return;
      if (state.route !== location.href) {
        state.route = location.href;
        document.getElementById("dog-saver-tiktok-overlay")?.remove();
      }
      scanIntegratedControls();
    }, 180);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TIKTOK_OPEN_PANEL") return false;
    let context = currentContext();
    if (context.type === "profile") openProfileDialog();
    else if (context.postId)
      downloadPost({
        url: context.url,
        postId: context.postId,
        username: context.username,
      });
    else showToast("Abra um vídeo, foto ou perfil do TikTok", "error");
    sendResponse({ ok: true });
    return false;
  });

  let initialPost = parseDocument(document, location.href);
  if (initialPost) cachePost(initialPost);
  scanIntegratedControls();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setInterval(() => {
    if (document.visibilityState !== "hidden") scheduleScan();
  }, 2500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleScan();
  });
})();
