"use strict";

(() => {
  const MESSAGE_TYPE = "IG_SAVER_INTERCEPTED_POSTS";
  const REQUEST_TYPE = "IG_SAVER_REQUEST_INTERCEPTED_POST";
  const RESPONSE_TYPE = "IG_SAVER_INTERCEPTED_POST_RESPONSE";
  const cachedItemsByShortcode = new Map();

  if (window.__igSaverInterceptorActive) return;
  window.__igSaverInterceptorActive = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE) return;
    const shortcode = String(event.data.shortcode || "");
    const cachedItem = cachedItemsByShortcode.get(shortcode);
    window.postMessage(
      {
        type: RESPONSE_TYPE,
        requestId: event.data.requestId,
        rawItems: cachedItem ? [cachedItem] : [],
      },
      "*",
    );
  });

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const request = originalFetch.apply(this, args);
    const input = args[0];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input?.url || "";
    if (shouldIntercept(url)) {
      request
        .then((response) =>
          response
            .clone()
            .text()
            .then(processResponseText)
            .catch(() => {}),
        )
        .catch(() => {});
    }
    return request;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this.__dogSaverInstagramUrl = String(url || "");
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (shouldIntercept(this.__dogSaverInstagramUrl || "")) {
      this.addEventListener(
        "load",
        () => {
          try {
            processResponseText(String(this.responseText || ""));
          } catch {}
        },
        { once: true },
      );
    }
    return originalSend.apply(this, args);
  };

  function shouldIntercept(url) {
    url = String(url || "");
    const isGraphQL = url.includes("/graphql/query") || url.includes("/api/graphql");
    const isFeed = url.includes("/api/v1/feed/") || url.includes("/api/v1/clips/");
    if (!isGraphQL && !isFeed) return false;
    if (url.includes("/story/") || url.includes("/reels_media")) return false;
    return true;
  }

  function processResponseText(text) {
    text = String(text || "").trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return;
    const json = JSON.parse(text);
    const rawItems = extractRawItems(json);
    const pagination = getPaginationInfo(json);

    cacheRawItems(rawItems || []);

    if (rawItems || pagination) {
      window.postMessage({
        type: MESSAGE_TYPE,
        rawItems: rawItems || [],
        pagination: pagination
      }, "*");
    }
  }

  function extractRawItems(u) {
    const connection = u?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
    if (connection?.edges) return connection.edges;
    const homeConnection = u?.data?.xdt_api__v1__feed__timeline__connection;
    if (homeConnection?.edges) return homeConnection.edges;
    const timeline = u?.data?.user?.edge_owner_to_timeline_media;
    if (timeline?.edges) return timeline.edges;
    if (Array.isArray(u?.feed_items)) return u.feed_items;
    if (Array.isArray(u?.items)) return u.items;
    const shortcodeMedia = u?.data?.xdt_shortcode_media;
    if (shortcodeMedia) return [shortcodeMedia];
    return null;
  }

  function unwrapRawItem(item) {
    let node = item?.node ?? item;
    return node?.media_or_ad ?? node?.media ?? node?.post ?? node;
  }

  function cacheRawItems(rawItems) {
    if (!Array.isArray(rawItems)) return;
    for (const item of rawItems) {
      const node = unwrapRawItem(item);
      const shortcode = String(node?.code ?? node?.shortcode ?? "");
      if (shortcode) cachedItemsByShortcode.set(shortcode, item);
    }
    if (cachedItemsByShortcode.size > 500) {
      const keys = cachedItemsByShortcode.keys();
      while (cachedItemsByShortcode.size > 400) {
        const next = keys.next();
        if (next.done) break;
        cachedItemsByShortcode.delete(next.value);
      }
    }
  }

  function getPaginationInfo(u) {
    const connection = u?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
    if (connection?.page_info) {
      return {
        hasNextPage: connection.page_info.has_next_page ?? false,
        endCursor: connection.page_info.end_cursor || null
      };
    }
    const homeConnection = u?.data?.xdt_api__v1__feed__timeline__connection;
    if (homeConnection?.page_info) {
      return {
        hasNextPage: homeConnection.page_info.has_next_page ?? false,
        endCursor: homeConnection.page_info.end_cursor || null
      };
    }
    const timeline = u?.data?.user?.edge_owner_to_timeline_media;
    if (timeline?.page_info) {
      return {
        hasNextPage: timeline.page_info.has_next_page ?? false,
        endCursor: timeline.page_info.end_cursor || null
      };
    }
    if (u?.paging_info) {
      return {
        hasNextPage: u.paging_info.more_available ?? false,
        endCursor: u.paging_info.max_id || null
      };
    }
    if (u?.next_max_id !== undefined || u?.more_available !== undefined) {
      return {
        hasNextPage: u.more_available ?? Boolean(u.next_max_id),
        endCursor: u.next_max_id || null
      };
    }
    return null;
  }
})();

// --- Electron Download Bridge ---
// Runs in MAIN world so window.electronAPI (from preload) is accessible.
// Content scripts (isolated world) send download requests via window.postMessage.
(function() {
  if (window.__igSaverDownloadBridgeActive) return;
  window.__igSaverDownloadBridgeActive = true;

  var recentDownloads = {};
  var DEDUP_MS = 2000;

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'IG_SAVER_DOWNLOAD_REQUEST') return;
    var url = event.data.url;
    var filename = event.data.filename || '';
    if (!url) return;

    var now = Date.now();
    if (recentDownloads[url] && (now - recentDownloads[url]) < DEDUP_MS) {
      console.log('[IG Download Bridge] Duplicate blocked:', filename || url.substring(0, 60));
      return;
    }
    recentDownloads[url] = now;

    var keys = Object.keys(recentDownloads);
    if (keys.length > 50) {
      for (var i = 0; i < keys.length; i++) {
        if (now - recentDownloads[keys[i]] > DEDUP_MS) delete recentDownloads[keys[i]];
      }
    }

    if (window.electronAPI && typeof window.electronAPI.triggerDownload === 'function') {
      try {
        window.electronAPI.triggerDownload(url, filename);
        console.log('[IG Download Bridge] Dispatched:', filename || url.substring(0, 60));
      } catch (err) {
        console.error('[IG Download Bridge] electronAPI.triggerDownload failed:', err);
      }
    } else {
      // preload-browser.js listens to the same postMessage in Electron's
      // isolated world. Do not start a native DOM download here: it loses the
      // profile path and saves under the previously visited account.
      console.log('[IG Download Bridge] Request delegated to preload bridge');
    }
  });
})();
