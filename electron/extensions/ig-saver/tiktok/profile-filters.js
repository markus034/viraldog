(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const ALLOWED_STRATEGIES = new Set(["all", "topk", "lastNDays", "range"]);

  function nonNegativeNumber(value) {
    let number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeOptions(options = {}) {
    let strategy = ALLOWED_STRATEGIES.has(options.strategy)
        ? options.strategy
        : "all";
    return {
      strategy,
      topK: Math.floor(nonNegativeNumber(options.topK)) || 20,
      nDays: Math.floor(nonNegativeNumber(options.nDays)) || 7,
      fromTs: nonNegativeNumber(options.fromTs) || null,
      toTs: nonNegativeNumber(options.toTs) || null,
      keyword: String(options.keyword || "").trim(),
      minLikes: nonNegativeNumber(options.minLikes),
      minViews: nonNegativeNumber(options.minViews),
      minComments: nonNegativeNumber(options.minComments),
      includeVideos: options.includeVideos !== false,
      includePhotos: options.includePhotos !== false,
    };
  }

  function matchesKeyword(post, keyword) {
    if (!keyword) return true;
    let needle = keyword.toLocaleLowerCase(),
      text = String(post.description || "").toLocaleLowerCase();
    if (text.includes(needle)) return true;
    return !needle.startsWith("#") && text.includes(`#${needle}`);
  }

  function matchesContent(post, options) {
    let stats = post.stats || {};
    return (
      matchesKeyword(post, options.keyword) &&
      Number(stats.likes || 0) >= options.minLikes &&
      Number(stats.views || 0) >= options.minViews &&
      Number(stats.comments || 0) >= options.minComments
    );
  }

  function filterProfilePosts(posts, rawOptions = {}, nowMs = Date.now()) {
    let options = normalizeOptions(rawOptions),
      sorted = Array.from(posts || [])
        .filter(Boolean)
        .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0)),
      mediaCandidates = sorted.filter(
        (post) =>
          (post.mediaType === "video" && options.includeVideos) ||
          (post.mediaType === "photos" && options.includePhotos),
      ),
      intervalCandidates = mediaCandidates;

    if (options.strategy === "lastNDays") {
      let cutoff = nowMs - options.nDays * DAY_MS;
      intervalCandidates = mediaCandidates.filter(
        (post) => Number(post.createdAt || 0) * 1000 >= cutoff,
      );
    } else if (options.strategy === "range") {
      intervalCandidates = mediaCandidates.filter((post) => {
        let timestamp = Number(post.createdAt || 0) * 1000;
        return (
          (!options.fromTs || timestamp >= options.fromTs) &&
          (!options.toTs || timestamp <= options.toTs)
        );
      });
    }

    let contentCandidates = intervalCandidates.filter((post) =>
        matchesContent(post, options),
      ),
      selected =
        options.strategy === "topk"
          ? contentCandidates.slice(0, options.topK)
          : contentCandidates;

    return {
      posts: selected,
      options,
      counts: {
        found: sorted.length,
        mediaExcluded: sorted.length - mediaCandidates.length,
        intervalExcluded: mediaCandidates.length - intervalCandidates.length,
        contentExcluded: intervalCandidates.length - contentCandidates.length,
        limitExcluded: contentCandidates.length - selected.length,
        selected: selected.length,
      },
    };
  }

  function shouldStopProfileScan(posts, rawOptions = {}, nowMs = Date.now()) {
    let options = normalizeOptions(rawOptions),
      result = filterProfilePosts(posts, options, nowMs);

    if (
      options.strategy === "topk" &&
      result.posts.length >= options.topK
    ) {
      return { stop: true, reason: "topk", result };
    }

    let timestamps = Array.from(posts || [])
      .filter((post) => post && !post.pinned)
      .map((post) => Number(post.createdAt || 0) * 1000)
      .filter((timestamp) => timestamp > 0);
    if (!timestamps.length) return { stop: false, reason: null, result };

    let oldestTimestamp = Math.min(...timestamps),
      lowerBound =
        options.strategy === "lastNDays"
          ? nowMs - options.nDays * DAY_MS
          : options.strategy === "range"
            ? options.fromTs
            : null;
    if (lowerBound && oldestTimestamp < lowerBound) {
      return { stop: true, reason: "date", result };
    }
    return { stop: false, reason: null, result };
  }

  function activeFilterCount(rawOptions = {}) {
    let options = normalizeOptions(rawOptions),
      count = options.strategy === "all" ? 0 : 1;
    if (options.keyword) count++;
    if (options.minLikes > 0) count++;
    if (options.minViews > 0) count++;
    if (options.minComments > 0) count++;
    return count;
  }

  root.DogSaverTikTokFilters = {
    activeFilterCount,
    filterProfilePosts,
    matchesKeyword,
    normalizeOptions,
    shouldStopProfileScan,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
