(function (root) {
  "use strict";

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value) {
    let number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function httpUrls(value) {
    let candidates = [];
    if (typeof value === "string") candidates.push(value);
    if (Array.isArray(value)) candidates.push(...value);
    if (value && typeof value === "object") {
      candidates.push(
        ...asArray(value.UrlList),
        ...asArray(value.urlList),
        value.Url,
        value.url,
      );
    }
    return Array.from(
      new Set(
        candidates.filter(
          (candidate) =>
            typeof candidate === "string" && /^https?:\/\//i.test(candidate),
        ),
      ),
    );
  }

  function firstHttpUrl(value) {
    return httpUrls(value)[0] || null;
  }

  function codecPreference(codec) {
    let normalized = String(codec || "").toLowerCase();
    if (/h264|avc1?|avc3/.test(normalized)) return 2;
    if (/h265|hevc|hvc1|hev1|bytevc1|av01|av1|vp0?9/.test(normalized))
      return 0;
    return 1;
  }

  function selectBestVideo(video) {
    if (!video || typeof video !== "object") return null;
    let candidates = [];

    for (let variant of asArray(video.bitrateInfo)) {
      let address = variant.PlayAddr || variant.playAddr,
        urls = httpUrls(address),
        url = urls[0];
      if (!url) continue;
      candidates.push({
        url,
        fallbackUrls: urls.slice(1),
        width: asNumber(address?.Width ?? address?.width ?? video.width),
        height: asNumber(address?.Height ?? address?.height ?? video.height),
        bitrate: asNumber(variant.Bitrate ?? variant.bitrate),
        codec: String(variant.CodecType ?? variant.codecType ?? ""),
        quality: String(
          variant.GearName ?? variant.QualityType ?? variant.quality ?? "",
        ),
      });
    }

    let structuredAddress = video.PlayAddrStruct || video.playAddrStruct,
      structuredUrls = httpUrls(structuredAddress),
      structuredUrl = structuredUrls[0];
    if (structuredUrl) {
      candidates.push({
        url: structuredUrl,
        fallbackUrls: structuredUrls.slice(1),
        width: asNumber(structuredAddress?.Width ?? video.width),
        height: asNumber(structuredAddress?.Height ?? video.height),
        bitrate: asNumber(video.bitrate),
        codec: String(video.codecType || ""),
        quality: String(video.videoQuality || video.definition || ""),
      });
    }

    let playUrls = httpUrls(video.playAddr),
      playUrl = playUrls[0];
    if (playUrl) {
      candidates.push({
        url: playUrl,
        fallbackUrls: playUrls.slice(1),
        width: asNumber(video.width),
        height: asNumber(video.height),
        bitrate: asNumber(video.bitrate),
        codec: String(video.codecType || ""),
        quality: String(video.videoQuality || video.definition || ""),
      });
    }

    let downloadUrls = httpUrls(video.downloadAddr || video.DownloadAddr),
      downloadUrl = downloadUrls[0];
    if (downloadUrl) {
      candidates.push({
        url: downloadUrl,
        fallbackUrls: downloadUrls.slice(1),
        width: asNumber(video.width),
        height: asNumber(video.height),
        bitrate: 0,
        codec: "",
        quality: "download",
      });
    }

    candidates.sort((left, right) => {
      let leftCompatible = codecPreference(left.codec),
        rightCompatible = codecPreference(right.codec);
      if (rightCompatible !== leftCompatible)
        return rightCompatible - leftCompatible;
      let leftArea = left.width * left.height,
        rightArea = right.width * right.height;
      if (rightArea !== leftArea) return rightArea - leftArea;
      return right.bitrate - left.bitrate;
    });

    let selected = candidates[0];
    if (!selected) return null;
    let safeCandidates = candidates.filter(
      (candidate) => codecPreference(candidate.codec) > 0,
    );
    if (safeCandidates.length) selected = safeCandidates[0];
    selected.fallbackUrls = Array.from(
      new Set(
        (safeCandidates.length ? safeCandidates : candidates).flatMap(
          (candidate) => [candidate.url, ...candidate.fallbackUrls],
        ),
      ),
    ).filter((url) => url !== selected.url);
    return selected;
  }

  function selectImageUrl(image) {
    let preferred = [
      image?.imageURL,
      image?.imageUrl,
      image?.displayImage,
      image?.image,
      image?.originImage,
    ];
    for (let candidate of preferred) {
      let url = firstHttpUrl(candidate);
      if (url) return url;
    }
    return firstHttpUrl(image);
  }

  function looksLikePost(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        value.id &&
        value.author &&
        (value.video || value.imagePost),
    );
  }

  function findPost(value, depth = 0, seen = new Set()) {
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value))
      return null;
    if (looksLikePost(value)) return value;
    seen.add(value);
    for (let key in value) {
      if (!Object.hasOwn(value, key)) continue;
      let result = findPost(value[key], depth + 1, seen);
      if (result) return result;
    }
    return null;
  }

  function findPosts(value, depth = 0, seen = new Set(), posts = new Map()) {
    if (!value || typeof value !== "object" || depth > 10 || seen.has(value))
      return posts;
    seen.add(value);

    if (looksLikePost(value)) {
      posts.set(String(value.id), value);
    }

    for (let key in value) {
      if (!Object.hasOwn(value, key)) continue;
      findPosts(value[key], depth + 1, seen, posts);
    }
    return posts;
  }

  function normalizeStats(item) {
    let stats = item.statsV2 || item.stats || {};
    return {
      views: asNumber(stats.playCount),
      likes: asNumber(stats.diggCount),
      comments: asNumber(stats.commentCount),
      shares: asNumber(stats.shareCount),
      saves: asNumber(stats.collectCount),
      reposts: asNumber(stats.repostCount),
    };
  }

  function normalizePost(item, sourceUrl) {
    if (!looksLikePost(item)) return null;
    let author = item.author || {},
      username = String(author.uniqueId || author.nickname || "unknown"),
      media = [];

    if (item.imagePost) {
      let images = asArray(item.imagePost.images || item.imagePost.imageList);
      images.forEach((image, index) => {
        let preferred = [
            image?.imageURL,
            image?.imageUrl,
            image?.displayImage,
            image?.image,
            image?.originImage,
            image,
          ],
          urls = Array.from(new Set(preferred.flatMap(httpUrls))),
          url = urls[0];
        if (!url) return;
        media.push({
          url,
          fallbackUrls: urls.slice(1),
          type: "image",
          ext: "jpg",
          index,
          width: asNumber(image.width || image.imageWidth),
          height: asNumber(image.height || image.imageHeight),
        });
      });
    } else {
      let selected = selectBestVideo(item.video);
      if (selected) {
        media.push({
          ...selected,
          type: "video",
          ext: "mp4",
          index: 0,
        });
      }
    }

    if (!media.length) return null;
    let mediaType = item.imagePost ? "photos" : "video",
      routeType = mediaType === "photos" ? "photo" : "video";
    return {
      platform: "tiktok",
      id: String(item.id),
      username,
      nickname: String(author.nickname || username),
      description: String(item.desc || ""),
      createdAt: asNumber(item.createTime),
      pinned: Boolean(item.isPinnedItem || item.isPinned || item.pinned),
      sourceUrl:
        sourceUrl || `https://www.tiktok.com/@${username}/${routeType}/${item.id}`,
      mediaType,
      media,
      stats: normalizeStats(item),
      music: item.music
        ? {
            id: String(item.music.id || ""),
            title: String(item.music.title || ""),
            author: String(item.music.authorName || ""),
          }
        : null,
    };
  }

  function parseHydrationData(data, sourceUrl) {
    if (!data || typeof data !== "object") return null;
    let scope = data.__DEFAULT_SCOPE__ || data,
      direct = scope?.["webapp.video-detail"]?.itemInfo?.itemStruct,
      item = looksLikePost(direct) ? direct : findPost(scope);
    return normalizePost(item, sourceUrl);
  }

  function extractPosts(data) {
    if (!data || typeof data !== "object") return [];
    return Array.from(findPosts(data).values())
      .map((item) => normalizePost(item))
      .filter(Boolean);
  }

  function parseHydrationText(text, sourceUrl) {
    if (!text || typeof text !== "string") return null;
    try {
      return parseHydrationData(JSON.parse(text), sourceUrl);
    } catch {
      return null;
    }
  }

  function postIdFromUrl(url) {
    let match = String(url || "").match(/\/(?:video|photo)\/(\d+)/i);
    return match?.[1] || null;
  }

  root.DogSaverTikTokParser = {
    extractPosts,
    findPost,
    findPosts,
    httpUrls,
    normalizePost,
    parseHydrationData,
    parseHydrationText,
    postIdFromUrl,
    selectBestVideo,
    selectImageUrl,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
