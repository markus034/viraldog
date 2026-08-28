"use strict";
if (typeof chrome !== 'undefined') {
  if (!chrome.offscreen) {
    chrome.offscreen = {
      createDocument: function() { return Promise.resolve(); },
      closeDocument: function() { return Promise.resolve(); },
      Reason: { BLOBS: 'BLOBS' }
    };
  }
  if (chrome.runtime && !chrome.runtime.getContexts) {
    chrome.runtime.getContexts = function(filter) {
      if (filter && filter.contextTypes && filter.contextTypes.includes('OFFSCREEN_DOCUMENT')) {
        return Promise.resolve([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
      }
      return Promise.resolve([]);
    };
  }
}

// Send media downloads through the page bridge so Electron receives the full
// "profile/file" path. Native extension downloads expose only the basename.
function relayDownloadToElectron(options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: 'https://www.instagram.com/*' }, function(tabs) {
      const queryError = chrome.runtime.lastError;
      if (queryError || !tabs || tabs.length === 0) {
        reject(new Error(queryError?.message || 'INSTAGRAM_TAB_NOT_FOUND'));
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'POLYFILL_TRIGGER_DOWNLOAD',
        url: options.url,
        filename: options.filename || ''
      }, function() {
        const messageError = chrome.runtime.lastError;
        if (messageError) reject(new Error(messageError.message));
        else resolve(12345);
      });
    });
  });
}
"use strict";
(() => {
  var X = { concurrency: 3, maxRetries: 2, zipChunkSize: 1e3 };
  function selectVideoUrl(versions, fallbackUrl) {
    if (Array.isArray(versions) && versions.length > 0) {
      let sorted = [...versions].sort((a, b) => {
        let areaA = (a.width || 0) * (a.height || 0);
        let areaB = (b.width || 0) * (b.height || 0);
        return areaB - areaA;
      });
      for (let v of sorted) {
        let w = v.width || 0;
        let h = v.height || 0;
        if (w > 0 && h > 0) {
          if ((w <= 720 && h <= 1280) || (w <= 1280 && h <= 720)) {
            return v.url || "";
          }
        }
      }
      return sorted[sorted.length - 1]?.url || fallbackUrl || "";
    }
    return fallbackUrl || "";
  }
  function shortcodeToMediaId(shortcode) {
    if (typeof shortcode != "string" || !shortcode) return "";
    let alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
      value = 0n;
    for (let character of shortcode) {
      let index = alphabet.indexOf(character);
      if (index < 0) return "";
      value = value * 64n + BigInt(index);
    }
    return value.toString();
  }
  function re(s, e) {
    let t = j(s.type, s.url),
      i = Z(s.creator);
    if (s.postId === "profile_avatar") return `${i}/${i}_profile_avatar.${t}`;
    let a = new Date(s.timestamp * 1e3),
      o = a.getUTCFullYear(),
      r = String(a.getUTCMonth() + 1).padStart(2, "0"),
      n = String(a.getUTCDate()).padStart(2, "0"),
      hour = String(a.getUTCHours()).padStart(2, "0"),
      min = String(a.getUTCMinutes()).padStart(2, "0"),
      _ = `${o}${r}${n}_${hour}${min}`,
      l = Z(s.postId);
    
    let filename = `${_}_${l}`;
    if (s.index !== undefined && s.index !== null) {
      filename += `_${s.index}`;
    }
    filename += `.${t}`;

    if (s.postId.startsWith("story_"))
      return `${i}/stories/${filename}`;
    if (s.postId.startsWith("highlight_")) {
      let d = s.highlightTitle ? `/${Z(s.highlightTitle)}` : "";
      return `${i}/highlights${d}/${filename}`;
    }
    if (e) return `${i}/${filename}`;
    let c = `${o}-${r}-${n}_${l}`;
    return `${i}/${c}/${filename}`;
  }
  function Ce(s, e, t, i) {
    let a = j(s.type, s.url),
      o = Z(s.creator),
      r = Z(s.postId),
      n = Z(e || "saved"),
      _ = i ? `${Z(i)}_saved/${n}` : n,
      l = new Date(s.timestamp * 1e3),
      c = l.getUTCFullYear(),
      d = String(l.getUTCMonth() + 1).padStart(2, "0"),
      u = String(l.getUTCDate()).padStart(2, "0"),
      hour = String(l.getUTCHours()).padStart(2, "0"),
      min = String(l.getUTCMinutes()).padStart(2, "0"),
      g = `${c}${d}${u}_${hour}${min}`;
    
    let filename = `${g}_${r}`;
    if (s.index !== undefined && s.index !== null) {
      filename += `_${s.index}`;
    }
    filename += `.${a}`;

    if (t) return `${_}/${filename}`;
    let y = `${c}-${d}-${u}_${r}`;
    return `${_}/${y}/${filename}`;
  }
  function j(s, e) {
    try {
      let a = new URL(e).pathname.match(/\.(\w+)$/);
      if (a) {
        let o = a[1].toLowerCase();
        if (
          (s === "image" && ["jpg", "jpeg", "png", "webp"].includes(o)) ||
          (s === "video" && ["mp4", "mov", "webm"].includes(o))
        )
          return o;
      }
    } catch {}
    return s === "video" ? "mp4" : "jpg";
  }
  function Z(s) {
    return (
      s
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\.+$/, "")
        .trim() || "unknown"
    );
  }
  function Re(s, e) {
    if (!s) return !1;
    let t = s.toLowerCase().split(";")[0].trim();
    return e === "image" ? t.startsWith("image/") : t.startsWith("video/");
  }
  var ne = "ig_saver_tasks",
    ve = "ig_saver_queue_",
    ke = "ig_saver_settings",
    we = "ig_saver_zip_acc_",
    be = "ig_saver_zip_part_",
    Y = "ig_saver_review",
    m = {
      async getTasks() {
        return (await chrome.storage.local.get(ne))[ne] || {};
      },
      async getTask(s) {
        return (await this.getTasks())[s] || null;
      },
      async saveTask(s) {
        let e = await this.getTasks();
        ((e[s.taskId] = { ...s, updatedAt: Date.now() }),
          await chrome.storage.local.set({ [ne]: e }));
      },
      async deleteTask(s) {
        let e = await this.getTasks();
        (delete e[s], await chrome.storage.local.set({ [ne]: e }));
      },
      async getQueue(s) {
        let e = ve + s;
        return (await chrome.storage.local.get(e))[e] || [];
      },
      async saveQueue(s, e) {
        let t = ve + s;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteQueue(s) {
        let e = ve + s;
        await chrome.storage.local.remove(e);
      },
      async getZipAccumulator(s) {
        let e = we + s;
        return (await chrome.storage.local.get(e))[e] || [];
      },
      async saveZipAccumulator(s, e) {
        let t = we + s;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteZipAccumulator(s) {
        let e = we + s;
        await chrome.storage.local.remove(e);
      },
      async getZipPartCounter(s) {
        let e = be + s;
        return (await chrome.storage.local.get(e))[e] || 0;
      },
      async saveZipPartCounter(s, e) {
        let t = be + s;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteZipPartCounter(s) {
        let e = be + s;
        await chrome.storage.local.remove(e);
      },
      async getSettings() {
        return (await chrome.storage.local.get(ke))[ke] || { ...X };
      },
      async saveSettings(s) {
        await chrome.storage.local.set({ [ke]: s });
      },
      async getReviewState() {
        return (
          (await chrome.storage.local.get(Y))[Y] || {
            count: 0,
            dismissed: !1,
            nextPromptAt: 5,
          }
        );
      },
      async incrementReviewCount() {
        let s = await this.getReviewState(),
          e = { ...s, count: s.count + 1 };
        return (await chrome.storage.local.set({ [Y]: e }), e);
      },
      async postponeReview() {
        let s = await this.getReviewState(),
          e = s.nextPromptAt <= 5 ? 10 : s.nextPromptAt <= 15 ? 30 : 50;
        await chrome.storage.local.set({
          [Y]: { ...s, nextPromptAt: s.count + e },
        });
      },
      async dismissReview() {
        let s = await this.getReviewState();
        await chrome.storage.local.set({ [Y]: { ...s, dismissed: !0 } });
      },
    };
  function gt() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
  var le = class {
    async createTask(e, t, i, a, o, r, n) {
      let _ = {
        taskId: gt(),
        username: e,
        filter: t,
        dateFilter: i,
        cursor: null,
        seenPostCount: 0,
        status: "running",
        stopConditionHit: !1,
        totalMediaFound: 0,
        totalMediaDownloaded: 0,
        totalMediaFailed: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        downloadAsZip: a === !0,
        ...(o && o > 0 ? { topK: o } : {}),
        ...(r ? { flatFolder: !0 } : {}),
        ...(n ? { source: n } : {}),
      };
      return (await m.saveTask(_), _);
    }
    async setTotalFound(e, t, i) {
      let a = await this.getTask(e);
      return (
        (a.totalMediaFound = t),
        i != null && (a.seenPostCount = i),
        await m.saveTask(a),
        a
      );
    }
    async getTask(e) {
      let t = await m.getTask(e);
      if (!t) throw new Error("TASK_NOT_FOUND");
      return t;
    }
    async getAllTasks() {
      let e = await m.getTasks();
      return Object.values(e).sort((t, i) => i.createdAt - t.createdAt);
    }
    async pauseTask(e) {
      let t = await this.getTask(e);
      if (t.status !== "running") throw new Error("INVALID_STATE");
      return ((t.status = "paused"), await m.saveTask(t), t);
    }
    async resumeTask(e) {
      let t = await this.getTask(e);
      if (t.status !== "paused") throw new Error("INVALID_STATE");
      return ((t.status = "running"), await m.saveTask(t), t);
    }
    async stopTask(e) {
      let t = await this.getTask(e);
      if (t.status === "done" || t.status === "stopped")
        throw new Error("INVALID_STATE");
      return ((t.status = "stopped"), await m.saveTask(t), t);
    }
    async completeTask(e) {
      let t = await this.getTask(e);
      return ((t.status = "done"), await m.saveTask(t), t);
    }
    async updateTaskProgress(e, t, i, a, o) {
      let r = await this.getTask(e);
      return (
        (r.cursor = t),
        (r.seenPostCount += i.length),
        (r.totalMediaFound += a),
        o && o > 0 && (r.oldestTs = r.oldestTs ? Math.min(r.oldestTs, o) : o),
        await m.saveTask(r),
        r
      );
    }
    async updateDownloadCount(e, t, i) {
      let a = await this.getTask(e);
      return (
        (a.totalMediaDownloaded += t),
        (a.totalMediaFailed += i),
        await m.saveTask(a),
        a
      );
    }
    async updateSavedCollectionIndex(e, t) {
      let i = await this.getTask(e);
      return (
        (i.currentCollectionIndex = t),
        (i.cursor = null),
        await m.saveTask(i),
        i
      );
    }
    async markEarlyStop(e) {
      let t = await this.getTask(e);
      return (
        (t.stopConditionHit = !0),
        (t.status = "done"),
        await m.saveTask(t),
        t
      );
    }
    async deleteTask(e) {
      (await m.deleteTask(e), await m.deleteQueue(e));
    }
  };
  var _e = class {
    activeDownloads = new Map();
    concurrency = X.concurrency;
    maxRetries = X.maxRetries;
    onStatusChange = null;
    onTaskComplete = null;
    pausedTasks = new Set();
    queueCache = new Map();
    constructor(e) {
      e &&
        ((this.concurrency = e.concurrency), (this.maxRetries = e.maxRetries));
    }
    setOnStatusChange(e) {
      this.onStatusChange = e;
    }
    setOnTaskComplete(e) {
      this.onTaskComplete = e;
    }
    updateSettings(e) {
      ((this.concurrency = e.concurrency), (this.maxRetries = e.maxRetries));
    }
    async getCachedQueue(e) {
      let t = this.queueCache.get(e);
      if (t) return t;
      let i = await m.getQueue(e);
      return (this.queueCache.set(e, i), i);
    }
    async saveCachedQueue(e, t) {
      (this.queueCache.set(e, t), await m.saveQueue(e, t));
    }
    async enqueue(e, t) {
      t = await filterFreshMedia(e, t);
      let i = await this.getCachedQueue(e),
        a = new Set(i.map((r) => r.id)),
        o = t
          .filter((r) => !a.has(`${r.postId}_${r.index}`))
          .map((r) => ({
            id: `${r.postId}_${r.index}`,
            taskId: e,
            media: r,
            status: "pending",
            retries: 0,
            error: null,
          }));
      if (o.length > 0) {
        let r = [...i, ...o];
        await this.saveCachedQueue(e, r);
      }
      this.processQueue(e);
    }
    pauseTask(e) {
      this.pausedTasks.add(e);
    }
    resumeTask(e) {
      (this.pausedTasks.delete(e), this.processQueue(e));
    }
    async clearPendingItems(e) {
      let i = (await this.getCachedQueue(e)).filter(
        (a) => a.status !== "pending",
      );
      await this.saveCachedQueue(e, i);
    }
    async recoverStuckDownloads(e) {
      let t = await this.getCachedQueue(e),
        i = !1;
      for (let a of t)
        a.status === "downloading" && ((a.status = "pending"), (i = !0));
      i && (await this.saveCachedQueue(e, t));
    }
    async processQueue(e) {
      if (this.pausedTasks.has(e)) return;
      let t = await this.getCachedQueue(e),
        i = t.filter((n) => n.status === "pending"),
        a = Array.from(this.activeDownloads.entries()).filter(
          ([n, _]) => _ && n.startsWith(e),
        ).length,
        o = this.concurrency - a;
      if (o <= 0 || i.length === 0) {
        this.checkTaskCompletion(e, t);
        return;
      }
      let r = i.slice(0, o);
      for (let n of r) this.downloadItem(e, n);
    }
    async downloadItem(e, t) {
      let i = `${e}_${t.id}`;
      this.activeDownloads.set(i, !0);
      try {
        if (
          (await this.updateItemStatus(e, t.id, "downloading"),
          !(await this.validateContentType(t.media.url, t.media.type)))
        )
          throw new Error("CONTENT_TYPE_MISMATCH");
        let o = re(t.media);
        (await this.triggerDownload(t.media.url, o),
          await markDownloadedMedia(e, [t.media]),
          await this.updateItemStatus(e, t.id, "done"));
      } catch (a) {
        let o = a?.message || "Unknown error",
          r = await this.getCachedQueue(e),
          n = r.find((_) => _.id === t.id);
        n && n.retries < this.maxRetries
          ? ((n.retries += 1),
            (n.status = "pending"),
            (n.error = o),
            await this.saveCachedQueue(e, r))
          : await this.updateItemStatus(e, t.id, "failed", o);
      } finally {
        (this.activeDownloads.delete(i), this.processQueue(e));
      }
    }
    async validateContentType(e, t) {
      try {
        let a =
          (await fetch(e, { method: "HEAD" })).headers.get("content-type") ||
          "";
        return Re(a, t);
      } catch {
        return !0;
      }
    }
    triggerDownload(e, t) {
      return relayDownloadToElectron({
        url: e,
        filename: t,
        conflictAction: "uniquify",
        saveAs: !1,
      });
    }
    async updateItemStatus(e, t, i, a) {
      let o = await this.getCachedQueue(e),
        r = o.find((n) => n.id === t);
      r &&
        ((r.status = i),
        a && (r.error = a),
        await this.saveCachedQueue(e, o),
        this.onStatusChange && this.onStatusChange(r));
    }
    checkTaskCompletion(e, t) {
      if (
        t.every((a) => a.status === "done" || a.status === "failed") &&
        t.length > 0 &&
        this.onTaskComplete
      ) {
        let a = t.filter((r) => r.status === "done").length,
          o = t.filter((r) => r.status === "failed").length;
        this.onTaskComplete(e, a, o);
      }
    }
    evictCache(e) {
      this.queueCache.delete(e);
    }
    async getQueueStats(e) {
      let t = await this.getCachedQueue(e);
      return {
        total: t.length,
        pending: t.filter((i) => i.status === "pending").length,
        downloading: t.filter((i) => i.status === "downloading").length,
        done: t.filter((i) => i.status === "done").length,
        failed: t.filter((i) => i.status === "failed").length,
      };
    }
  };
  function Ee(s, e) {
    return e.mode === "all"
      ? !0
      : !(
          (e.fromTs !== null && s < e.fromTs) ||
          (e.toTs !== null && s > e.toTs)
        );
  }
  function Ge(s, e) {
    return e.mode === "all"
      ? !1
      : e.mode === "range" && e.toTs !== null
        ? s > e.toTs
        : !1;
  }
  function de(s, e) {
    return e.mode === "all" ? !1 : e.fromTs !== null ? s < e.fromTs : !1;
  }
  function Me(s, e) {
    return de(s, e);
  }
  var ADV = {
    downloaded: "ig_saver_global_downloaded_media",
  };
  function mediaFingerprint(s) {
    let e = Z(String(s.creator || "unknown")).toLowerCase(),
      t = Z(String(s.postId || "unknown")),
      i = s.index ?? 0,
      a = s.type || "media";
    return `${e}:${t}:${i}:${a}`;
  }
  async function getDownloadedRegistry() {
    let s = (await chrome.storage.local.get(ADV.downloaded))[ADV.downloaded];
    return s && typeof s == "object" ? s : {};
  }
  async function saveDownloadedRegistry(s) {
    let e = Object.keys(s);
    if (e.length > 25e3) {
      e.sort((i, a) => (s[a]?.downloadedAt || 0) - (s[i]?.downloadedAt || 0));
      let t = {};
      for (let i of e.slice(0, 25e3)) t[i] = s[i];
      s = t;
    }
    await chrome.storage.local.set({ [ADV.downloaded]: s });
  }
  async function incrementTaskDuplicateSkips(s, e) {
    if (!e) return;
    try {
      let t = await m.getTask(s);
      t &&
        ((t.totalMediaSkippedDuplicates =
          (t.totalMediaSkippedDuplicates || 0) + e),
        await m.saveTask(t));
    } catch {}
  }
  async function filterFreshMedia(s, e) {
    if (!Array.isArray(e) || e.length === 0) return e || [];
    let t = await getDownloadedRegistry(),
      i = [],
      a = 0;
    for (let o of e) {
      let r = mediaFingerprint(o);
      t[r] ? a++ : i.push(o);
    }
    await incrementTaskDuplicateSkips(s, a);
    return i;
  }
  async function markDownloadedMedia(s, e) {
    if (!Array.isArray(e) || e.length === 0) return;
    let t = await getDownloadedRegistry(),
      i = Date.now();
    for (let a of e) {
      let o = mediaFingerprint(a);
      t[o] = {
        downloadedAt: i,
        taskId: s || null,
        creator: a.creator || null,
        postId: a.postId || null,
        index: a.index ?? 0,
        type: a.type || null,
        timestamp: a.timestamp || null,
      };
    }
    await saveDownloadedRegistry(t);
  }
  async function rememberProfileCheckpoint(s) {
    try {
      if (!s?.username || (s.source || "profile") !== "profile") return;
      let e = `ig_saver_profile_last_${String(s.username).toLowerCase()}`;
      await chrome.storage.local.set({
        [e]: {
          username: s.username,
          timestamp: Math.floor(Date.now() / 1e3),
          taskId: s.taskId,
          updatedAt: Date.now(),
        },
      });
    } catch {}
  }
  var I = "IG_HTML_RESPONSE";
  async function T(s) {
    let e = await s.text(),
      t = e.trim();
    if (t.length === 0) throw new Error("PARSE_ERROR");
    if (t.startsWith("<")) throw new Error(I);
    try {
      return JSON.parse(e);
    } catch {
      throw new Error("PARSE_ERROR");
    }
  }
  async function O() {
    if (typeof document > "u") return null;
    let s = document.cookie.match(/csrftoken=([^;]+)/);
    return s ? s[1].trim() : null;
  }
  var J = {
    btn_download_all: "Download All",
    aria_download_hd_avatar: "Download HD avatar",
    notify_avatar_failed: "Could not get HD avatar",
    notify_avatar_success: "HD avatar downloaded",
    aria_download_post: "Download this post",
    aria_download_post_zip: "Download this post (ZIP)",
    aria_download_reel: "Download this Reel",
    tooltip_sponsored_not_downloadable:
      "Sponsored content cannot be downloaded",
    notify_post_media_failed: "Could not get post media",
    notify_downloaded_n_files_zip: "Downloaded {count} files (ZIP)",
    notify_downloaded_1_file: "Downloaded 1 file",
    notify_download_failed: "Download failed: {error}",
    dialog_title: "Download @{username}",
    dialog_media_type: "Media type",
    dialog_media_all: "All (Photos + Videos)",
    dialog_media_photos: "Photos only",
    dialog_media_videos: "Videos only",
    dialog_save_method: "Save method",
    dialog_save_grouped: "One folder per post",
    dialog_save_flat: "All files in one folder",
    dialog_range: "Download range",
    dialog_range_all: "Download all",
    dialog_range_all_trial_remaining: "{base} (free trial: {remaining} left)",
    dialog_range_topk: "First N posts (newest first)",
    dialog_range_last_n_days: "Within last N days",
    dialog_range_custom: "Custom date range",
    dialog_post_count: "Number of posts",
    dialog_recent_days: "Recent days",
    dialog_days_7: "7 days",
    dialog_days_30: "30 days",
    dialog_days_90: "90 days",
    dialog_days_180: "180 days",
    dialog_start_date: "Start date",
    dialog_end_date: "End date",
    dialog_btn_start: "Start Download",
    dialog_btn_cancel: "Cancel",
    dialog_extras: "Also include",
    dialog_include_highlights: "All highlight reels",
    dialog_include_stories: "Active stories (24h)",
    status_scanning: "Scanning posts...",
    status_posts_found: "0 posts found",
    status_count: "{posts} posts \xB7 {media} files",
    status_count_zips: "\xB7 ~{parts} ZIPs",
    status_scanned_to: "Scanned to {date}",
    status_loading_next: "Loading next page...",
    status_loading_first: "Loading first page...",
    status_rate_limited_scroll: "API rate limited, switching to scroll mode...",
    status_rate_limited_retry:
      "Instagram rate limited, retrying in {seconds}s...",
    status_processing: "Processing...",
    status_waiting_next: "Waiting for next page...",
    status_scan_complete: "Scan complete, downloads queued",
    status_saving_scanned: "Saving scanned content...",
    status_stopped: "Stopped",
    notify_started: "Started downloading @{username}",
    notify_switched_scroll: "API rate limited, switched to scroll mode",
    notify_multi_zip:
      "Files exceed {chunkSize}, will split into multiple ZIPs (~{parts}+)",
    notify_found_posts: "Found {posts} posts ({media} files)",
    notify_error: "Error: {message}",
    notify_pagination_error: "Pagination error: {message}",
    scroll_loading_more: "Scrolling to load more posts...",
    scroll_parsing_post: "Parsing post {current}/{total}: {shortcode}",
    scroll_got_records: "Got {count} post records from page",
    rate_wait: "Requests too frequent, waiting {seconds}s...",
    parse_html_error:
      "Instagram returned unexpected content. Please verify you are logged in and refresh the page.",
    zip_no_files: "No downloadable files in ZIP",
    aria_download: "Download",
    story_download_highlight: "Save All",
    story_download_all: "Save All",
    notify_story_failed: "Could not get this story",
    notify_story_success: "Story downloaded",
    story_downloading: "Downloading...",
    notify_highlight_id_failed: "Could not get highlight ID",
    notify_username_failed: "Could not get username",
    notify_user_data_failed:
      "Could not get user data (possibly a private account)",
    notify_highlight_empty: "This highlight has no content",
    notify_no_stories: "This user has no stories currently",
    highlight_untitled: "Untitled Highlight",
    progress_extras_start: "Preparing extras...",
    progress_stories_fetching: "Fetching active stories...",
    progress_stories_packing: "Packing {count} story files into ZIP...",
    progress_highlights_fetching_tray: "Fetching highlight list...",
    progress_highlight_fetching: "Highlight {current}/{total}: {title}",
    progress_highlights_packing: "Packing {count} highlight files into ZIP...",
    progress_highlights_packing_named: "Packing: {title} ({current}/{total})",
    task_label_highlights: "Highlights",
    task_label_stories: "Stories",
    popup_subtitle: "Batch download Instagram media",
    popup_empty_title: "No download tasks",
    popup_empty_desc: `Go to a public Instagram profile page
and click the "Download All" button`,
    popup_settings: "Settings",
    popup_settings_advanced: "Advanced",
    popup_concurrency: "Concurrent downloads",
    popup_max_retries: "Max retries",
    popup_zip_chunk: "ZIP chunk size",
    popup_zip_chunk_tip:
      "Max number of files per ZIP. When a download exceeds this limit, it will be split into multiple ZIPs automatically.",
    popup_zip_no_split: "No split",
    popup_language: "Language",
    popup_footer: "Dog Saver v{version} \xB7 Local only, no tracking",
    task_scanning: "Scanning... {found}",
    task_scanning_found: "Found {count} files",
    task_batches_done: "Completed {count} batches",
    task_zipping: "Generating ZIP...{percent}",
    task_packing: "Packing {current}/{total} files...",
    task_batches_done_parens: "(Completed {count} batches)",
    task_creating_zip: "Creating ZIP... {total} files",
    task_downloaded: "Downloaded {done}/{total} files",
    task_failed: "{count} failed",
    task_in_progress: "{count} in progress",
    task_zips: "{count} ZIPs",
    task_status_running: "Running",
    task_status_paused: "Paused",
    task_status_done: "Done",
    task_status_stopped: "Stopped",
    task_status_saving: "Saving...",
    task_status_auto_paused: "Paused (tab closed)",
    status_auto_resume: "Resuming scan for @{username}...",
    task_btn_pause: "Pause",
    task_btn_resume: "Resume",
    task_btn_stop: "Stop",
    task_stop_confirm: "Download {count} scanned posts before stopping?",
    task_stop_download: "Download & Stop",
    task_stop_discard: "Discard & Stop",
    task_stop_preparing: "Preparing download...",
    error_no_avatar_url: "No avatar URL found",
    error_no_media_items: "No media items to download",
    error_no_story_items: "No story items to download",
    error_unknown_message: "Unknown message type",
    error_zip_build_failed: "Failed to build ZIP",
    btn_download_saved: "Download Saved",
    btn_download_collection: "Download Collection",
    dialog_saved_title: "Download Saved Posts",
    dialog_select_collections: "Select collections",
    dialog_select_all: "Select All",
    dialog_deselect_all: "Deselect All",
    dialog_collection_count: "{count} items",
    status_collection_progress: "Collection: {name}",
    dialog_saved_folder_mode: "Save method",
    dialog_saved_folder_per_post: "One folder per post",
    dialog_saved_folder_per_collection: "One folder per collection",
    notify_fetching_collections: "Fetching collections...",
    notify_no_collections: "No saved collections found",
    review_title: "Enjoying Dog Saver?",
    review_message:
      "You've completed {count} downloads! If this tool has been helpful, a quick review on the Chrome Web Store would mean a lot. Your support helps keep Dog Saver free and improving for everyone.",
    review_btn_rate: "Leave a Review",
    review_btn_later: "Maybe Later",
    review_btn_never: "Don't Ask Again",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Unlocked",
    upgrade_title: "Upgrade to Dog Saver Pro",
    upgrade_title_benefit: "Save what you love, completely",
    upgrade_subtitle: "Unlock unlimited bulk downloads and power features",
    upgrade_feature_unlimited: "Unlimited Profile bulk downloads",
    upgrade_feature_extras: "Bundle all Highlights & Stories in one click",
    upgrade_feature_saved: "Multi-collection bulk download",
    upgrade_feature_dates: "Custom date ranges (90 / 180 days / custom)",
    compare_header_feature: "Feature",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Single download (Post / Reel / Story)",
    compare_row_highlight: "Single Highlight",
    compare_row_single_collection: "Single collection download",
    compare_row_profile_bulk: "Profile bulk download",
    compare_row_profile_bulk_free: "Latest 30 posts",
    compare_row_profile_bulk_pro: "Unlimited",
    compare_row_extras: "Bundle Highlights & Stories",
    compare_row_saved: "Multi-collection bulk",
    compare_row_dates: "Custom date ranges",
    compare_row_dates_pro: "7 / 30 / 90 / Custom",
    trust_no_personal_data: "We don't collect personal data",
    trust_three_devices: "3-device license",
    upgrade_plan_monthly: "Monthly",
    upgrade_plan_yearly: "Yearly",
    upgrade_plan_lifetime: "Lifetime",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ month \xB7 Cancel anytime",
    upgrade_yearly_subtitle: "/ year \xB7 Save 58%",
    upgrade_lifetime_subtitle_regular: "One-time payment \xB7 Forever",
    upgrade_lifetime_card_label: "Lifetime \xB7 Early Bird",
    upgrade_lifetime_savings: "One-time payment \xB7 Forever",
    upgrade_lifetime_countdown_badge: "Limited -40% \xB7 {days} days left",
    upgrade_btn_choose: "Choose Plan",
    upgrade_btn_close: "Close",
    have_key_prompt: "Already purchased?",
    have_key_link: "Enter license key \u2192",
    gate_topk_limit:
      "Free tier is limited to {limit} posts per bulk download. Upgrade to Pro for unlimited.",
    gate_days_limit:
      "Free tier is limited to the last {limit} days. Upgrade to Pro for 90 / 180 days or custom range.",
    gate_custom_range: "Custom date range is a Pro feature.",
    gate_extras:
      "Bundling Highlights into the profile download is a Pro feature. Stories are free.",
    gate_all_trial_exhausted: `You've used all {limit} free "Download all" trials. Upgrade to Pro for unlimited bulk downloads.`,
    gate_saved_multi:
      "Downloading multiple collections at once is a Pro feature. Click into a single collection for free.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Free tier",
    license_status_pro: "Pro \xB7 Active",
    license_status_legacy:
      "Pro \xB7 Unlocked (Early supporter \u2014 thank you!)",
    license_status_expires: "Expires {date}",
    license_status_lifetime: "Lifetime license",
    license_input_placeholder:
      "Paste your license key (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Activate",
    license_btn_activating: "Activating...",
    license_btn_copy: "Copy",
    license_btn_remove_device: "Remove this device",
    license_btn_get_pro: "Get Pro",
    license_btn_get_pro_cta: "Get Pro",
    license_msg_activated: "Pro activated. Thank you for supporting Dog Saver!",
    license_msg_activate_failed: "Activation failed: {error}",
    license_msg_removed: "Device removed. License cleared from this browser.",
    license_msg_limit_reached_title: "Activation limit reached",
    license_msg_limit_reached_body:
      'This license is already activated on 3 devices. Open Dog Saver on another device and click "Remove this device" to free a slot.',
    license_help_switch_device:
      "Switching computers? Copy the key above and paste on the new device.",
    license_help_portal:
      "Manage subscription / reset devices in the Customer Portal",
    legacy_welcome_title: "Thank you, early supporter",
    legacy_welcome_body:
      "You've been using Dog Saver since v{version}. Pro is permanently unlocked on this installation \u2014 no payment required.",
    legacy_welcome_warning:
      "Because we don't collect personal information, your legacy status is tied to this Chrome installation. Uninstalling Dog Saver may forfeit it.",
    legacy_welcome_btn_done: "Got it",
    legacy_welcome_btn_review: "Leave a review on Chrome Web Store",
    legacy_thanks_title: "Thank you, early supporter",
    legacy_thanks_message:
      "You've been using Dog Saver since v{version}. Pro is permanently unlocked \u2014 no payment needed. If this tool has helped you, a quick review helps us keep it free.",
    legacy_thanks_btn_review: "Leave a review",
    legacy_thanks_btn_done: "Got it",
  };
  var Le = {
    btn_download_all: "\u5168\u90E8\u4E0B\u8F09",
    aria_download_hd_avatar: "\u4E0B\u8F09 HD \u982D\u50CF",
    notify_avatar_failed: "\u7121\u6CD5\u53D6\u5F97 HD \u982D\u50CF",
    notify_avatar_success: "HD \u982D\u50CF\u4E0B\u8F09\u6210\u529F",
    aria_download_post: "\u4E0B\u8F09\u6B64\u8CBC\u6587",
    aria_download_post_zip: "\u4E0B\u8F09\u6B64\u8CBC\u6587 (ZIP)",
    aria_download_reel: "\u4E0B\u8F09\u6B64 Reel",
    tooltip_sponsored_not_downloadable:
      "\u8D0A\u52A9\u5167\u5BB9\u7121\u6CD5\u4E0B\u8F09",
    notify_post_media_failed:
      "\u7121\u6CD5\u53D6\u5F97\u6B64\u8CBC\u6587\u5A92\u9AD4",
    notify_downloaded_n_files_zip:
      "\u5DF2\u4E0B\u8F09 {count} \u500B\u6A94\u6848 (ZIP)",
    notify_downloaded_1_file: "\u5DF2\u4E0B\u8F09 1 \u500B\u6A94\u6848",
    notify_download_failed: "\u4E0B\u8F09\u5931\u6557: {error}",
    dialog_title: "\u4E0B\u8F09 @{username}",
    dialog_media_type: "\u5A92\u9AD4\u985E\u578B",
    dialog_media_all:
      "\u5168\u90E8\uFF08\u5716\u7247 \uFF0B \u5F71\u7247\uFF09",
    dialog_media_photos: "\u50C5\u5716\u7247",
    dialog_media_videos: "\u50C5\u5F71\u7247",
    dialog_save_method: "\u5132\u5B58\u65B9\u5F0F",
    dialog_save_grouped:
      "\u6BCF\u7BC7\u8CBC\u6587\u4E00\u500B\u8CC7\u6599\u593E",
    dialog_save_flat:
      "\u6240\u6709\u6A94\u6848\u5B58\u5728\u540C\u4E00\u8CC7\u6599\u593E",
    dialog_range: "\u4E0B\u8F09\u7BC4\u570D",
    dialog_range_all: "\u5168\u90E8\u4E0B\u8F09",
    dialog_range_all_trial_remaining:
      "{base}\uFF08\u514D\u8CBB\u8A66\u7528 \u5269 {remaining} \u6B21\uFF09",
    dialog_range_topk:
      "\u4F9D\u5E8F\u524D N \u7BC7\uFF08\u7531\u65B0\u5230\u820A\uFF09",
    dialog_range_last_n_days: "\u6700\u8FD1 N \u5929\u5167",
    dialog_range_custom: "\u81EA\u8A02\u65E5\u671F\u5340\u9593",
    dialog_post_count: "\u4E0B\u8F09\u7BC7\u6578",
    dialog_recent_days: "\u6700\u8FD1\u5E7E\u5929",
    dialog_days_7: "7 \u5929",
    dialog_days_30: "30 \u5929",
    dialog_days_90: "90 \u5929",
    dialog_days_180: "180 \u5929",
    dialog_start_date: "\u958B\u59CB\u65E5\u671F",
    dialog_end_date: "\u7D50\u675F\u65E5\u671F",
    dialog_btn_start: "\u958B\u59CB\u4E0B\u8F09",
    dialog_btn_cancel: "\u53D6\u6D88",
    dialog_extras: "\u4E00\u4F75\u4E0B\u8F09",
    dialog_include_highlights: "\u6240\u6709\u7CBE\u9078",
    dialog_include_stories:
      "\u73FE\u6709\u9650\u6642\u52D5\u614B (24 \u5C0F\u6642)",
    status_scanning: "\u6B63\u5728\u6383\u63CF\u8CBC\u6587...",
    status_posts_found: "\u5DF2\u627E\u5230 0 \u7BC7\u8CBC\u6587",
    status_count: "{posts} \u7BC7\u8CBC\u6587 \xB7 {media} \u500B\u6A94\u6848",
    status_count_zips: "\xB7 \u7D04 {parts} \u500B ZIP",
    status_scanned_to: "\u5DF2\u6383\u63CF\u5230 {date}",
    status_loading_next: "\u8F09\u5165\u4E0B\u4E00\u9801...",
    status_loading_first: "\u8F09\u5165\u7B2C\u4E00\u9801...",
    status_rate_limited_scroll:
      "API \u9650\u6D41\uFF0C\u5207\u63DB\u70BA\u6EFE\u52D5\u6A21\u5F0F...",
    status_rate_limited_retry:
      "Instagram \u9650\u6D41\uFF0C{seconds} \u79D2\u5F8C\u91CD\u8A66...",
    status_processing: "\u8655\u7406\u4E2D...",
    status_waiting_next: "\u7B49\u5F85\u4E0B\u4E00\u9801...",
    status_scan_complete:
      "\u6383\u63CF\u5B8C\u6210\uFF0C\u4E0B\u8F09\u6392\u968A\u4E2D",
    status_saving_scanned:
      "\u6B63\u5728\u5132\u5B58\u5DF2\u6383\u63CF\u7684\u5167\u5BB9...",
    status_stopped: "\u5DF2\u505C\u6B62",
    notify_started: "\u958B\u59CB\u4E0B\u8F09 @{username}",
    notify_switched_scroll:
      "API \u9650\u6D41\uFF0C\u5DF2\u5207\u63DB\u70BA\u6EFE\u52D5\u6A21\u5F0F",
    notify_multi_zip:
      "\u6A94\u6848\u8D85\u904E {chunkSize} \u500B\uFF0C\u5C07\u5206\u6279\u4E0B\u8F09\u70BA\u591A\u500B ZIP\uFF08\u9810\u8A08 {parts}+ \u500B\uFF09",
    notify_found_posts:
      "\u627E\u5230 {posts} \u7BC7\u8CBC\u6587\uFF08{media} \u500B\u6A94\u6848\uFF09",
    notify_error: "\u932F\u8AA4: {message}",
    notify_pagination_error: "\u5206\u9801\u932F\u8AA4: {message}",
    scroll_loading_more: "\u6EFE\u52D5\u8F09\u5165\u66F4\u591A\u8CBC\u6587...",
    scroll_parsing_post:
      "\u89E3\u6790\u8CBC\u6587 {current}/{total}\uFF1A{shortcode}",
    scroll_got_records:
      "\u5DF2\u5F9E\u9801\u9762\u53D6\u5F97 {count} \u7B46\u8CBC\u6587\u8CC7\u6599",
    rate_wait:
      "\u8ACB\u6C42\u904E\u65BC\u983B\u7E41\uFF0C\u7B49\u5F85 {seconds} \u79D2...",
    parse_html_error:
      "Instagram \u56DE\u50B3\u4E86\u975E\u9810\u671F\u5167\u5BB9\uFF0C\u8ACB\u78BA\u8A8D\u5DF2\u767B\u5165\u4E26\u91CD\u65B0\u6574\u7406\u9801\u9762",
    zip_no_files: "ZIP \u5167\u7121\u53EF\u4E0B\u8F09\u7684\u6A94\u6848",
    aria_download: "\u4E0B\u8F09",
    story_download_highlight: "\u5168\u90E8\u4E0B\u8F09",
    story_download_all: "\u5168\u90E8\u4E0B\u8F09",
    notify_story_failed:
      "\u7121\u6CD5\u53D6\u5F97\u6B64\u9650\u6642\u52D5\u614B",
    notify_story_success: "\u9650\u6642\u52D5\u614B\u4E0B\u8F09\u6210\u529F",
    story_downloading: "\u4E0B\u8F09\u4E2D...",
    notify_highlight_id_failed: "\u7121\u6CD5\u53D6\u5F97\u7CBE\u9078 ID",
    notify_username_failed: "\u7121\u6CD5\u53D6\u5F97\u7528\u6236\u540D\u7A31",
    notify_user_data_failed:
      "\u7121\u6CD5\u53D6\u5F97\u7528\u6236\u8CC7\u6599\uFF08\u53EF\u80FD\u70BA\u79C1\u4EBA\u5E33\u865F\uFF09",
    notify_highlight_empty: "\u6B64\u7CBE\u9078\u6C92\u6709\u5167\u5BB9",
    notify_no_stories:
      "\u6B64\u7528\u6236\u76EE\u524D\u6C92\u6709\u9650\u6642\u52D5\u614B",
    highlight_untitled: "\u672A\u547D\u540D\u7CBE\u9078",
    progress_extras_start: "\u6E96\u5099\u9644\u52A0\u4E0B\u8F09...",
    progress_stories_fetching:
      "\u6B63\u5728\u53D6\u5F97\u73FE\u6709\u9650\u6642\u52D5\u614B...",
    progress_stories_packing:
      "\u6B63\u5728\u6253\u5305 {count} \u500B\u9650\u52D5\u6A94\u6848\u70BA ZIP...",
    progress_highlights_fetching_tray:
      "\u6B63\u5728\u53D6\u5F97\u7CBE\u9078\u5217\u8868...",
    progress_highlight_fetching: "\u7CBE\u9078 {current}/{total}\uFF1A{title}",
    progress_highlights_packing:
      "\u6B63\u5728\u6253\u5305 {count} \u500B\u7CBE\u9078\u6A94\u6848\u70BA ZIP...",
    progress_highlights_packing_named:
      "\u6B63\u5728\u6253\u5305\uFF1A{title} ({current}/{total})",
    task_label_highlights: "\u7CBE\u9078",
    task_label_stories: "\u9650\u6642",
    popup_subtitle: "\u6279\u6B21\u4E0B\u8F09 Instagram \u5A92\u9AD4",
    popup_empty_title: "\u76EE\u524D\u6C92\u6709\u4E0B\u8F09\u4EFB\u52D9",
    popup_empty_desc: `\u524D\u5F80\u516C\u958B\u7684 Instagram \u500B\u4EBA\u9801\u9762
\u9EDE\u64CA\u300C\u5168\u90E8\u4E0B\u8F09\u300D\u6309\u9215`,
    popup_settings: "\u8A2D\u5B9A",
    popup_settings_advanced: "\u9032\u968E\u8A2D\u5B9A",
    popup_concurrency: "\u540C\u6642\u4E0B\u8F09\u6578",
    popup_max_retries: "\u6700\u5927\u91CD\u8A66\u6B21\u6578",
    popup_zip_chunk: "ZIP \u5206\u6279\u5927\u5C0F",
    popup_zip_chunk_tip:
      "\u6BCF\u500B ZIP \u6A94\u6848\u7684\u6700\u5927\u6A94\u6848\u6578\u91CF\u3002\u7576\u4E0B\u8F09\u6578\u91CF\u8D85\u904E\u6B64\u9650\u5236\u6642\uFF0C\u6703\u81EA\u52D5\u5206\u6210\u591A\u500B ZIP\u3002",
    popup_zip_no_split: "\u4E0D\u5206\u5272",
    popup_language: "\u8A9E\u8A00",
    popup_footer:
      "Dog Saver v{version} \xB7 \u50C5\u672C\u6A5F\u904B\u4F5C\uFF0C\u7121\u8FFD\u8E64",
    task_scanning: "\u6383\u63CF\u4E2D... {found}",
    task_scanning_found: "\u5DF2\u627E\u5230 {count} \u500B\u6A94\u6848",
    task_batches_done: "\u5DF2\u5B8C\u6210 {count} \u6279",
    task_zipping: "\u6B63\u5728\u7522\u751F ZIP...{percent}",
    task_packing:
      "\u6B63\u5728\u6253\u5305 {current}/{total} \u500B\u6A94\u6848...",
    task_batches_done_parens: "\uFF08\u5DF2\u5B8C\u6210 {count} \u6279\uFF09",
    task_creating_zip:
      "\u6B63\u5728\u5EFA\u7ACB ZIP... {total} \u500B\u6A94\u6848",
    task_downloaded: "\u5DF2\u4E0B\u8F09 {done}/{total} \u500B\u6A94\u6848",
    task_failed: "{count} \u5931\u6557",
    task_in_progress: "{count} \u9032\u884C\u4E2D",
    task_zips: "{count} \u500B ZIP",
    task_status_running: "\u57F7\u884C\u4E2D",
    task_status_paused: "\u5DF2\u66AB\u505C",
    task_status_done: "\u5B8C\u6210",
    task_status_stopped: "\u5DF2\u505C\u6B62",
    task_status_saving: "\u5132\u5B58\u4E2D...",
    task_status_auto_paused:
      "\u5DF2\u66AB\u505C\uFF08\u5206\u9801\u95DC\u9589\uFF09",
    status_auto_resume: "\u6B63\u5728\u6062\u5FA9\u6383\u63CF @{username}...",
    task_btn_pause: "\u66AB\u505C",
    task_btn_resume: "\u7E7C\u7E8C",
    task_btn_stop: "\u505C\u6B62",
    task_stop_confirm:
      "\u505C\u6B62\u524D\u8981\u4E0B\u8F09\u5DF2\u6383\u63CF\u7684 {count} \u7BC7\u8CBC\u6587\u55CE\uFF1F",
    task_stop_download: "\u4E0B\u8F09\u4E26\u505C\u6B62",
    task_stop_discard: "\u6368\u68C4\u4E26\u505C\u6B62",
    task_stop_preparing: "\u6B63\u5728\u6E96\u5099\u4E0B\u8F09...",
    error_no_avatar_url: "\u627E\u4E0D\u5230\u982D\u50CF\u7DB2\u5740",
    error_no_media_items: "\u6C92\u6709\u53EF\u4E0B\u8F09\u7684\u5A92\u9AD4",
    error_no_story_items:
      "\u6C92\u6709\u53EF\u4E0B\u8F09\u7684\u9650\u6642\u52D5\u614B",
    error_unknown_message: "\u672A\u77E5\u7684\u8A0A\u606F\u985E\u578B",
    error_zip_build_failed: "ZIP \u5EFA\u7ACB\u5931\u6557",
    btn_download_saved: "\u4E0B\u8F09\u6536\u85CF",
    btn_download_collection: "\u4E0B\u8F09\u6B64\u5206\u985E",
    dialog_saved_title: "\u4E0B\u8F09\u6536\u85CF\u8CBC\u6587",
    dialog_select_collections: "\u9078\u64C7\u5206\u985E",
    dialog_select_all: "\u5168\u9078",
    dialog_deselect_all: "\u53D6\u6D88\u5168\u9078",
    dialog_collection_count: "{count} \u9805",
    status_collection_progress: "\u5206\u985E\uFF1A{name}",
    dialog_saved_folder_mode: "\u5132\u5B58\u65B9\u5F0F",
    dialog_saved_folder_per_post:
      "\u6BCF\u7BC7\u8CBC\u6587\u4E00\u500B\u8CC7\u6599\u593E",
    dialog_saved_folder_per_collection:
      "\u6BCF\u500B\u5206\u985E\u4E00\u500B\u8CC7\u6599\u593E",
    notify_fetching_collections: "\u6B63\u5728\u53D6\u5F97\u5206\u985E...",
    notify_no_collections: "\u627E\u4E0D\u5230\u6536\u85CF\u5206\u985E",
    review_title: "\u559C\u6B61 Dog Saver \u55CE\uFF1F",
    review_message:
      "\u4F60\u5DF2\u7D93\u6210\u529F\u4E0B\u8F09\u4E86 {count} \u6B21\uFF01\u5982\u679C\u9019\u500B\u5DE5\u5177\u5C0D\u4F60\u6709\u5E6B\u52A9\uFF0C\u80FD\u5426\u82B1\u4E00\u9EDE\u6642\u9593\u5230 Chrome \u7DDA\u4E0A\u61C9\u7528\u7A0B\u5F0F\u5546\u5E97\u7559\u4E0B\u8A55\u50F9\uFF1F\u4F60\u7684\u652F\u6301\u662F\u6211\u5011\u6301\u7E8C\u6539\u9032\u3001\u4FDD\u6301\u514D\u8CBB\u7684\u6700\u5927\u52D5\u529B\u3002",
    review_btn_rate: "\u524D\u5F80\u8A55\u50F9",
    review_btn_later: "\u4E0B\u6B21\u518D\u8AAA",
    review_btn_never: "\u4E0D\u518D\u8A62\u554F",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 \u5DF2\u89E3\u9396",
    upgrade_title: "\u5347\u7D1A\u5230 Dog Saver Pro",
    upgrade_title_benefit:
      "\u5B8C\u6574\u4FDD\u5B58\u4F60\u6700\u611B\u7684\u5E33\u865F",
    upgrade_subtitle:
      "\u89E3\u9396\u7121\u9650\u6279\u91CF\u4E0B\u8F09\u8207\u9032\u968E\u529F\u80FD",
    upgrade_feature_unlimited:
      "\u7121\u9650\u5236 Profile \u6279\u91CF\u4E0B\u8F09",
    upgrade_feature_extras:
      "\u4E00\u9375\u6253\u5305\u5168\u90E8\u7CBE\u9078\u8207\u9650\u6642\u52D5\u614B",
    upgrade_feature_saved:
      "\u6536\u85CF\u593E\u591A\u9078\u6279\u91CF\u4E0B\u8F09",
    upgrade_feature_dates:
      "\u81EA\u8A02\u65E5\u671F\u5340\u9593\uFF0890 / 180 \u5929 / \u81EA\u8A02\uFF09",
    compare_header_feature: "\u529F\u80FD",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\u55AE\u7B46\u4E0B\u8F09\uFF08\u8CBC\u6587 / Reel / \u9650\u6642\u52D5\u614B\uFF09",
    compare_row_highlight: "\u55AE\u4E00 Highlight",
    compare_row_single_collection: "\u55AE\u4E00\u6536\u85CF\u593E\u4E0B\u8F09",
    compare_row_profile_bulk: "Profile \u6279\u91CF\u4E0B\u8F09",
    compare_row_profile_bulk_free: "\u6700\u8FD1 30 \u7BC7",
    compare_row_profile_bulk_pro: "\u7121\u9650\u5236",
    compare_row_extras:
      "\u6253\u5305\u7CBE\u9078\u8207\u9650\u6642\u52D5\u614B",
    compare_row_saved: "\u6536\u85CF\u593E\u591A\u9078\u6279\u91CF",
    compare_row_dates: "\u81EA\u8A02\u65E5\u671F\u5340\u9593",
    compare_row_dates_pro: "7 / 30 / 90 / \u81EA\u8A02",
    trust_no_personal_data: "\u4E0D\u6536\u96C6\u500B\u4EBA\u8CC7\u6599",
    trust_three_devices: "3 \u53F0\u88DD\u7F6E\u6388\u6B0A",
    upgrade_plan_monthly: "\u6708\u8A02\u95B1",
    upgrade_plan_yearly: "\u5E74\u8A02\u95B1",
    upgrade_plan_lifetime: "\u7D42\u8EAB\u8CB7\u65B7",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ \u6708 \xB7 \u96A8\u6642\u53D6\u6D88",
    upgrade_yearly_subtitle: "/ \u5E74 \xB7 \u7701 58%",
    upgrade_lifetime_subtitle_regular:
      "\u4E00\u6B21\u4ED8\u6E05 \xB7 \u6C38\u4E45\u4F7F\u7528",
    upgrade_lifetime_card_label: "\u7D42\u8EAB\u8CB7\u65B7 \xB7 \u65E9\u9CE5",
    upgrade_lifetime_savings:
      "\u4E00\u6B21\u4ED8\u6E05 \xB7 \u6C38\u4E45\u4F7F\u7528",
    upgrade_lifetime_countdown_badge:
      "\u9650\u6642 -40% \xB7 \u5269 {days} \u5929",
    upgrade_btn_choose: "\u9078\u64C7\u65B9\u6848",
    upgrade_btn_close: "\u95DC\u9589",
    have_key_prompt: "\u5DF2\u5B8C\u6210\u8CFC\u8CB7\uFF1F",
    have_key_link: "\u8F38\u5165 license key \u2192",
    gate_topk_limit:
      "\u514D\u8CBB\u7248\u6BCF\u6B21\u6279\u91CF\u4E0B\u8F09\u6700\u591A {limit} \u7BC7\u3002\u5347\u7D1A Pro \u89E3\u9664\u9650\u5236\u3002",
    gate_days_limit:
      "\u514D\u8CBB\u7248\u9650\u300C\u6700\u8FD1 {limit} \u5929\u300D\u3002\u5347\u7D1A Pro \u53EF\u4E0B\u8F09 90 / 180 \u5929\u6216\u81EA\u8A02\u5340\u9593\u3002",
    gate_custom_range:
      "\u81EA\u8A02\u65E5\u671F\u5340\u9593\u662F Pro \u529F\u80FD\u3002",
    gate_extras:
      "\u5C07\u7CBE\u9078\u6253\u5305\u9032\u500B\u4EBA\u6A94\u6848\u4E0B\u8F09\u662F Pro \u529F\u80FD\u3002\u9650\u6642\u52D5\u614B (24h) \u70BA\u514D\u8CBB\u3002",
    gate_all_trial_exhausted:
      "\u60A8\u5DF2\u7528\u5B8C {limit} \u6B21\u300C\u5168\u90E8\u4E0B\u8F09\u300D\u514D\u8CBB\u8A66\u7528\u3002\u5347\u7D1A Pro \u5373\u53EF\u7121\u9650\u5236\u5927\u91CF\u4E0B\u8F09\u3002",
    gate_saved_multi:
      "\u4E00\u6B21\u4E0B\u8F09\u591A\u500B\u6536\u85CF\u593E\u662F Pro \u529F\u80FD\u3002\u9EDE\u9032\u55AE\u4E00\u6536\u85CF\u593E\u514D\u8CBB\u4E0B\u8F09\u3002",
    license_section_title: "Dog Saver Pro",
    license_status_free: "\u514D\u8CBB\u7248",
    license_status_pro: "Pro \xB7 \u5DF2\u555F\u7528",
    license_status_legacy:
      "Pro \xB7 \u5DF2\u89E3\u9396\uFF08\u65E9\u671F\u652F\u6301\u8005\uFF0C\u611F\u8B1D\u60A8\uFF01\uFF09",
    license_status_expires: "\u5230\u671F\u65E5 {date}",
    license_status_lifetime: "\u7D42\u8EAB\u6388\u6B0A",
    license_input_placeholder:
      "\u8CBC\u4E0A\u60A8\u7684 license key (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "\u555F\u7528",
    license_btn_activating: "\u555F\u7528\u4E2D...",
    license_btn_copy: "\u8907\u88FD",
    license_btn_remove_device: "\u79FB\u9664\u6B64\u88DD\u7F6E",
    license_btn_get_pro: "\u53D6\u5F97 Pro",
    license_btn_get_pro_cta: "\u53D6\u5F97 Pro",
    license_msg_activated:
      "Pro \u5DF2\u555F\u7528\u3002\u611F\u8B1D\u60A8\u652F\u6301 Dog Saver\uFF01",
    license_msg_activate_failed: "\u555F\u7528\u5931\u6557\uFF1A{error}",
    license_msg_removed:
      "\u88DD\u7F6E\u5DF2\u79FB\u9664\uFF0Clicense \u5DF2\u5F9E\u6B64\u700F\u89BD\u5668\u6E05\u9664\u3002",
    license_msg_limit_reached_title:
      "\u5DF2\u9054\u555F\u7528\u88DD\u7F6E\u4E0A\u9650",
    license_msg_limit_reached_body:
      "\u6B64 license \u5DF2\u5728 3 \u53F0\u88DD\u7F6E\u4E0A\u555F\u7528\u3002\u8ACB\u5728\u5176\u4ED6\u88DD\u7F6E\u4E0A\u958B\u555F Dog Saver \u4E26\u9EDE\u64CA\u300C\u79FB\u9664\u6B64\u88DD\u7F6E\u300D\u4EE5\u91CB\u51FA\u540D\u984D\u3002",
    license_help_switch_device:
      "\u63DB\u96FB\u8166\uFF1F\u628A\u4E0A\u9762\u7684 key \u8907\u88FD\u5230\u65B0\u96FB\u8166\u7684\u6B64\u8655\u8CBC\u4E0A\u3002",
    license_help_portal:
      "\u7BA1\u7406\u8A02\u95B1 / \u91CD\u8A2D\u88DD\u7F6E \u2192 Customer Portal",
    legacy_welcome_title: "\u611F\u8B1D\u60A8\u7684\u65E9\u671F\u652F\u6301",
    legacy_welcome_body:
      "\u60A8\u5F9E v{version} \u958B\u59CB\u4F7F\u7528 Dog Saver\u3002Pro \u5DF2\u5728\u6B64\u5B89\u88DD\u4E0A\u6C38\u4E45\u89E3\u9396\uFF0C\u7121\u9700\u4ED8\u8CBB\u3002",
    legacy_welcome_warning:
      "\u7531\u65BC\u6211\u5011\u4E0D\u6536\u96C6\u4EFB\u4F55\u500B\u4EBA\u8CC7\u8A0A\uFF0C\u60A8\u7684\u65E9\u671F\u652F\u6301\u8005\u8EAB\u4EFD\u7D81\u5B9A\u65BC\u6B64 Chrome \u5B89\u88DD\u3002\u89E3\u9664\u5B89\u88DD Dog Saver \u53EF\u80FD\u6703\u5931\u53BB\u6B64\u8EAB\u4EFD\u3002",
    legacy_welcome_btn_done: "\u6211\u77E5\u9053\u4E86",
    legacy_welcome_btn_review:
      "\u5728 Chrome Web Store \u7559\u4E0B\u8A55\u8AD6",
    legacy_thanks_title: "\u611F\u8B1D\u60A8\u7684\u65E9\u671F\u652F\u6301",
    legacy_thanks_message:
      "\u60A8\u5F9E v{version} \u958B\u59CB\u4F7F\u7528 Dog Saver\u3002Pro \u5DF2\u6C38\u4E45\u89E3\u9396\uFF0C\u7121\u9700\u4ED8\u8CBB\u3002\u5982\u679C\u9019\u500B\u5DE5\u5177\u5C0D\u60A8\u6709\u5E6B\u52A9\uFF0C\u7C21\u77ED\u7684\u8A55\u8AD6\u80FD\u5E6B\u52A9\u6211\u5011\u7E7C\u7E8C\u4FDD\u6301\u514D\u8CBB\u3002",
    legacy_thanks_btn_review: "\u7559\u4E0B\u8A55\u8AD6",
    legacy_thanks_btn_done: "\u6211\u77E5\u9053\u4E86",
  };
  var Ne = {
    btn_download_all: "\u5168\u90E8\u4E0B\u8F7D",
    aria_download_hd_avatar: "\u4E0B\u8F7D HD \u5934\u50CF",
    notify_avatar_failed: "\u65E0\u6CD5\u83B7\u53D6 HD \u5934\u50CF",
    notify_avatar_success: "HD \u5934\u50CF\u4E0B\u8F7D\u6210\u529F",
    aria_download_post: "\u4E0B\u8F7D\u6B64\u5E16\u5B50",
    aria_download_post_zip: "\u4E0B\u8F7D\u6B64\u5E16\u5B50 (ZIP)",
    aria_download_reel: "\u4E0B\u8F7D\u6B64 Reel",
    tooltip_sponsored_not_downloadable:
      "\u8D5E\u52A9\u5185\u5BB9\u65E0\u6CD5\u4E0B\u8F7D",
    notify_post_media_failed:
      "\u65E0\u6CD5\u83B7\u53D6\u6B64\u5E16\u5B50\u5A92\u4F53",
    notify_downloaded_n_files_zip:
      "\u5DF2\u4E0B\u8F7D {count} \u4E2A\u6587\u4EF6 (ZIP)",
    notify_downloaded_1_file: "\u5DF2\u4E0B\u8F7D 1 \u4E2A\u6587\u4EF6",
    notify_download_failed: "\u4E0B\u8F7D\u5931\u8D25: {error}",
    dialog_title: "\u4E0B\u8F7D @{username}",
    dialog_media_type: "\u5A92\u4F53\u7C7B\u578B",
    dialog_media_all: "\u5168\u90E8\uFF08\u7167\u7247 + \u89C6\u9891\uFF09",
    dialog_media_photos: "\u4EC5\u7167\u7247",
    dialog_media_videos: "\u4EC5\u89C6\u9891",
    dialog_save_method: "\u4FDD\u5B58\u65B9\u5F0F",
    dialog_save_grouped:
      "\u6BCF\u4E2A\u5E16\u5B50\u4E00\u4E2A\u6587\u4EF6\u5939",
    dialog_save_flat:
      "\u6240\u6709\u6587\u4EF6\u653E\u5728\u540C\u4E00\u6587\u4EF6\u5939",
    dialog_range: "\u4E0B\u8F7D\u8303\u56F4",
    dialog_range_all: "\u5168\u90E8\u4E0B\u8F7D",
    dialog_range_all_trial_remaining:
      "{base}\uFF08\u514D\u8D39\u8BD5\u7528 \u5269 {remaining} \u6B21\uFF09",
    dialog_range_topk: "\u524D N \u6761\uFF08\u4ECE\u65B0\u5230\u65E7\uFF09",
    dialog_range_last_n_days: "\u6700\u8FD1 N \u5929\u5185",
    dialog_range_custom: "\u81EA\u5B9A\u4E49\u65E5\u671F\u8303\u56F4",
    dialog_post_count: "\u5E16\u5B50\u6570\u91CF",
    dialog_recent_days: "\u6700\u8FD1\u51E0\u5929",
    dialog_days_7: "7 \u5929",
    dialog_days_30: "30 \u5929",
    dialog_days_90: "90 \u5929",
    dialog_days_180: "180 \u5929",
    dialog_start_date: "\u5F00\u59CB\u65E5\u671F",
    dialog_end_date: "\u7ED3\u675F\u65E5\u671F",
    dialog_btn_start: "\u5F00\u59CB\u4E0B\u8F7D",
    dialog_btn_cancel: "\u53D6\u6D88",
    dialog_extras: "\u4E00\u5E76\u4E0B\u8F7D",
    dialog_include_highlights: "\u6240\u6709\u7CBE\u9009",
    dialog_include_stories: "\u73B0\u6709\u5FEB\u62CD (24 \u5C0F\u65F6)",
    status_scanning: "\u6B63\u5728\u626B\u63CF\u5E16\u5B50...",
    status_posts_found: "\u5DF2\u627E\u5230 0 \u6761\u5E16\u5B50",
    status_count: "{posts} \u6761\u5E16\u5B50 \xB7 {media} \u4E2A\u6587\u4EF6",
    status_count_zips: "\xB7 \u7EA6 {parts} \u4E2A ZIP",
    status_scanned_to: "\u5DF2\u626B\u63CF\u5230 {date}",
    status_loading_next: "\u52A0\u8F7D\u4E0B\u4E00\u9875...",
    status_loading_first: "\u52A0\u8F7D\u7B2C\u4E00\u9875...",
    status_rate_limited_scroll:
      "API \u9650\u6D41\uFF0C\u5207\u6362\u4E3A\u6EDA\u52A8\u6A21\u5F0F...",
    status_rate_limited_retry:
      "Instagram \u9650\u6D41\uFF0C{seconds} \u79D2\u540E\u91CD\u8BD5...",
    status_processing: "\u5904\u7406\u4E2D...",
    status_waiting_next: "\u7B49\u5F85\u4E0B\u4E00\u9875...",
    status_scan_complete:
      "\u626B\u63CF\u5B8C\u6210\uFF0C\u4E0B\u8F7D\u6392\u961F\u4E2D",
    status_saving_scanned:
      "\u6B63\u5728\u4FDD\u5B58\u5DF2\u626B\u63CF\u7684\u5185\u5BB9...",
    status_stopped: "\u5DF2\u505C\u6B62",
    notify_started: "\u5F00\u59CB\u4E0B\u8F7D @{username}",
    notify_switched_scroll:
      "API \u9650\u6D41\uFF0C\u5DF2\u5207\u6362\u4E3A\u6EDA\u52A8\u6A21\u5F0F",
    notify_multi_zip:
      "\u6587\u4EF6\u8D85\u8FC7 {chunkSize} \u4E2A\uFF0C\u5C06\u5206\u6210\u591A\u4E2A ZIP \u4E0B\u8F7D\uFF08\u7EA6 {parts} \u4E2A\u4EE5\u4E0A\uFF09",
    notify_found_posts:
      "\u627E\u5230 {posts} \u6761\u5E16\u5B50\uFF08{media} \u4E2A\u6587\u4EF6\uFF09",
    notify_error: "\u9519\u8BEF: {message}",
    notify_pagination_error: "\u5206\u9875\u9519\u8BEF: {message}",
    scroll_loading_more: "\u6EDA\u52A8\u52A0\u8F7D\u66F4\u591A\u5E16\u5B50...",
    scroll_parsing_post:
      "\u89E3\u6790\u5E16\u5B50 {current}/{total}\uFF1A{shortcode}",
    scroll_got_records:
      "\u5DF2\u4ECE\u9875\u9762\u83B7\u53D6 {count} \u6761\u5E16\u5B50\u6570\u636E",
    rate_wait:
      "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u7B49\u5F85 {seconds} \u79D2...",
    parse_html_error:
      "Instagram \u8FD4\u56DE\u4E86\u975E\u9884\u671F\u5185\u5BB9\uFF0C\u8BF7\u786E\u8BA4\u5DF2\u767B\u5F55\u5E76\u5237\u65B0\u9875\u9762",
    zip_no_files: "ZIP \u4E2D\u65E0\u53EF\u4E0B\u8F7D\u7684\u6587\u4EF6",
    aria_download: "\u4E0B\u8F7D",
    story_download_highlight: "\u5168\u90E8\u4E0B\u8F7D",
    story_download_all: "\u5168\u90E8\u4E0B\u8F7D",
    notify_story_failed: "\u65E0\u6CD5\u83B7\u53D6\u6B64\u5FEB\u62CD",
    notify_story_success: "\u5FEB\u62CD\u4E0B\u8F7D\u6210\u529F",
    story_downloading: "\u4E0B\u8F7D\u4E2D...",
    notify_highlight_id_failed: "\u65E0\u6CD5\u83B7\u53D6\u7CBE\u9009 ID",
    notify_username_failed: "\u65E0\u6CD5\u83B7\u53D6\u7528\u6237\u540D",
    notify_user_data_failed:
      "\u65E0\u6CD5\u83B7\u53D6\u7528\u6237\u8D44\u6599\uFF08\u53EF\u80FD\u662F\u79C1\u5BC6\u8D26\u53F7\uFF09",
    notify_highlight_empty: "\u6B64\u7CBE\u9009\u6CA1\u6709\u5185\u5BB9",
    notify_no_stories: "\u6B64\u7528\u6237\u76EE\u524D\u6CA1\u6709\u5FEB\u62CD",
    highlight_untitled: "\u672A\u547D\u540D\u7CBE\u9009",
    progress_extras_start: "\u51C6\u5907\u9644\u52A0\u4E0B\u8F7D...",
    progress_stories_fetching:
      "\u6B63\u5728\u83B7\u53D6\u73B0\u6709\u5FEB\u62CD...",
    progress_stories_packing:
      "\u6B63\u5728\u6253\u5305 {count} \u4E2A\u5FEB\u62CD\u6587\u4EF6\u4E3A ZIP...",
    progress_highlights_fetching_tray:
      "\u6B63\u5728\u83B7\u53D6\u7CBE\u9009\u5217\u8868...",
    progress_highlight_fetching: "\u7CBE\u9009 {current}/{total}\uFF1A{title}",
    progress_highlights_packing:
      "\u6B63\u5728\u6253\u5305 {count} \u4E2A\u7CBE\u9009\u6587\u4EF6\u4E3A ZIP...",
    progress_highlights_packing_named:
      "\u6B63\u5728\u6253\u5305\uFF1A{title} ({current}/{total})",
    task_label_highlights: "\u7CBE\u9009",
    task_label_stories: "\u9650\u65F6",
    popup_subtitle: "\u6279\u91CF\u4E0B\u8F7D Instagram \u5A92\u4F53",
    popup_empty_title: "\u76EE\u524D\u6CA1\u6709\u4E0B\u8F7D\u4EFB\u52A1",
    popup_empty_desc: `\u524D\u5F80\u516C\u5F00\u7684 Instagram \u4E2A\u4EBA\u4E3B\u9875
\u70B9\u51FB"\u5168\u90E8\u4E0B\u8F7D"\u6309\u94AE`,
    popup_settings: "\u8BBE\u7F6E",
    popup_settings_advanced: "\u9AD8\u7EA7\u8BBE\u7F6E",
    popup_concurrency: "\u540C\u65F6\u4E0B\u8F7D\u6570",
    popup_max_retries: "\u6700\u5927\u91CD\u8BD5\u6B21\u6570",
    popup_zip_chunk: "ZIP \u5206\u6279\u5927\u5C0F",
    popup_zip_chunk_tip:
      "\u6BCF\u4E2A ZIP \u6587\u4EF6\u7684\u6700\u5927\u6587\u4EF6\u6570\u91CF\u3002\u5F53\u4E0B\u8F7D\u6570\u91CF\u8D85\u8FC7\u6B64\u9650\u5236\u65F6\uFF0C\u4F1A\u81EA\u52A8\u5206\u6210\u591A\u4E2A ZIP\u3002",
    popup_zip_no_split: "\u4E0D\u5206\u5272",
    popup_language: "\u8BED\u8A00",
    popup_footer:
      "Dog Saver v{version} \xB7 \u4EC5\u672C\u5730\u8FD0\u884C\uFF0C\u65E0\u8FFD\u8E2A",
    task_scanning: "\u626B\u63CF\u4E2D... {found}",
    task_scanning_found: "\u5DF2\u627E\u5230 {count} \u4E2A\u6587\u4EF6",
    task_batches_done: "\u5DF2\u5B8C\u6210 {count} \u6279",
    task_zipping: "\u6B63\u5728\u751F\u6210 ZIP...{percent}",
    task_packing:
      "\u6B63\u5728\u6253\u5305 {current}/{total} \u4E2A\u6587\u4EF6...",
    task_batches_done_parens: "\uFF08\u5DF2\u5B8C\u6210 {count} \u6279\uFF09",
    task_creating_zip:
      "\u6B63\u5728\u521B\u5EFA ZIP... {total} \u4E2A\u6587\u4EF6",
    task_downloaded: "\u5DF2\u4E0B\u8F7D {done}/{total} \u4E2A\u6587\u4EF6",
    task_failed: "{count} \u4E2A\u5931\u8D25",
    task_in_progress: "{count} \u4E2A\u8FDB\u884C\u4E2D",
    task_zips: "{count} \u4E2A ZIP",
    task_status_running: "\u8FD0\u884C\u4E2D",
    task_status_paused: "\u5DF2\u6682\u505C",
    task_status_done: "\u5B8C\u6210",
    task_status_stopped: "\u5DF2\u505C\u6B62",
    task_status_saving: "\u4FDD\u5B58\u4E2D...",
    task_status_auto_paused:
      "\u5DF2\u6682\u505C\uFF08\u6807\u7B7E\u9875\u5173\u95ED\uFF09",
    status_auto_resume: "\u6B63\u5728\u6062\u590D\u626B\u63CF @{username}...",
    task_btn_pause: "\u6682\u505C",
    task_btn_resume: "\u7EE7\u7EED",
    task_btn_stop: "\u505C\u6B62",
    task_stop_confirm:
      "\u505C\u6B62\u524D\u8981\u4E0B\u8F7D\u5DF2\u626B\u63CF\u7684 {count} \u7BC7\u5E16\u5B50\u5417\uFF1F",
    task_stop_download: "\u4E0B\u8F7D\u5E76\u505C\u6B62",
    task_stop_discard: "\u4E22\u5F03\u5E76\u505C\u6B62",
    task_stop_preparing: "\u6B63\u5728\u51C6\u5907\u4E0B\u8F7D...",
    error_no_avatar_url: "\u672A\u627E\u5230\u5934\u50CF\u94FE\u63A5",
    error_no_media_items: "\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u5A92\u4F53",
    error_no_story_items: "\u6CA1\u6709\u53EF\u4E0B\u8F7D\u7684\u5FEB\u62CD",
    error_unknown_message: "\u672A\u77E5\u7684\u6D88\u606F\u7C7B\u578B",
    error_zip_build_failed: "ZIP \u521B\u5EFA\u5931\u8D25",
    btn_download_saved: "\u4E0B\u8F7D\u6536\u85CF",
    btn_download_collection: "\u4E0B\u8F7D\u6B64\u5206\u7C7B",
    dialog_saved_title: "\u4E0B\u8F7D\u6536\u85CF\u5E16\u5B50",
    dialog_select_collections: "\u9009\u62E9\u5206\u7C7B",
    dialog_select_all: "\u5168\u9009",
    dialog_deselect_all: "\u53D6\u6D88\u5168\u9009",
    dialog_collection_count: "{count} \u9879",
    status_collection_progress: "\u5206\u7C7B\uFF1A{name}",
    dialog_saved_folder_mode: "\u4FDD\u5B58\u65B9\u5F0F",
    dialog_saved_folder_per_post:
      "\u6BCF\u7BC7\u5E16\u5B50\u4E00\u4E2A\u6587\u4EF6\u5939",
    dialog_saved_folder_per_collection:
      "\u6BCF\u4E2A\u5206\u7C7B\u4E00\u4E2A\u6587\u4EF6\u5939",
    notify_fetching_collections: "\u6B63\u5728\u83B7\u53D6\u5206\u7C7B...",
    notify_no_collections: "\u672A\u627E\u5230\u6536\u85CF\u5206\u7C7B",
    review_title: "\u559C\u6B22 Dog Saver \u5417\uFF1F",
    review_message:
      "\u4F60\u5DF2\u7ECF\u6210\u529F\u4E0B\u8F7D\u4E86 {count} \u6B21\uFF01\u5982\u679C\u8FD9\u4E2A\u5DE5\u5177\u5BF9\u4F60\u6709\u5E2E\u52A9\uFF0C\u80FD\u5426\u82B1\u4E00\u70B9\u65F6\u95F4\u5230 Chrome \u7F51\u4E0A\u5E94\u7528\u5E97\u7559\u4E0B\u8BC4\u4EF7\uFF1F\u4F60\u7684\u652F\u6301\u662F\u6211\u4EEC\u6301\u7EED\u6539\u8FDB\u3001\u4FDD\u6301\u514D\u8D39\u7684\u6700\u5927\u52A8\u529B\u3002",
    review_btn_rate: "\u524D\u5F80\u8BC4\u4EF7",
    review_btn_later: "\u4E0B\u6B21\u518D\u8BF4",
    review_btn_never: "\u4E0D\u518D\u8BE2\u95EE",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 \u5DF2\u89E3\u9501",
    upgrade_title: "\u5347\u7EA7\u5230 Dog Saver Pro",
    upgrade_title_benefit:
      "\u5B8C\u6574\u4FDD\u5B58\u4F60\u559C\u7231\u7684\u8D26\u53F7",
    upgrade_subtitle:
      "\u89E3\u9501\u65E0\u9650\u6279\u91CF\u4E0B\u8F7D\u4E0E\u9AD8\u7EA7\u529F\u80FD",
    upgrade_feature_unlimited:
      "\u65E0\u9650\u5236 Profile \u6279\u91CF\u4E0B\u8F7D",
    upgrade_feature_extras:
      "\u4E00\u952E\u6253\u5305\u5168\u90E8\u7CBE\u9009\u4E0E\u9650\u65F6\u52A8\u6001",
    upgrade_feature_saved:
      "\u6536\u85CF\u5939\u591A\u9009\u6279\u91CF\u4E0B\u8F7D",
    upgrade_feature_dates:
      "\u81EA\u5B9A\u4E49\u65E5\u671F\u533A\u95F4\uFF0890 / 180 \u5929 / \u81EA\u5B9A\u4E49\uFF09",
    compare_header_feature: "\u529F\u80FD",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\u5355\u7B14\u4E0B\u8F7D\uFF08\u5E16\u5B50 / Reel / \u9650\u65F6\u52A8\u6001\uFF09",
    compare_row_highlight: "\u5355\u4E2A Highlight",
    compare_row_single_collection: "\u5355\u4E2A\u6536\u85CF\u5939\u4E0B\u8F7D",
    compare_row_profile_bulk: "Profile \u6279\u91CF\u4E0B\u8F7D",
    compare_row_profile_bulk_free: "\u6700\u8FD1 30 \u7BC7",
    compare_row_profile_bulk_pro: "\u65E0\u9650\u5236",
    compare_row_extras:
      "\u6253\u5305\u7CBE\u9009\u4E0E\u9650\u65F6\u52A8\u6001",
    compare_row_saved: "\u6536\u85CF\u5939\u591A\u9009\u6279\u91CF",
    compare_row_dates: "\u81EA\u5B9A\u4E49\u65E5\u671F\u533A\u95F4",
    compare_row_dates_pro: "7 / 30 / 90 / \u81EA\u5B9A\u4E49",
    trust_no_personal_data: "\u4E0D\u6536\u96C6\u4E2A\u4EBA\u8D44\u6599",
    trust_three_devices: "3 \u53F0\u8BBE\u5907\u6388\u6743",
    upgrade_plan_monthly: "\u6708\u8BA2\u9605",
    upgrade_plan_yearly: "\u5E74\u8BA2\u9605",
    upgrade_plan_lifetime: "\u7EC8\u8EAB\u4E70\u65AD",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ \u6708 \xB7 \u968F\u65F6\u53D6\u6D88",
    upgrade_yearly_subtitle: "/ \u5E74 \xB7 \u7701 58%",
    upgrade_lifetime_subtitle_regular:
      "\u4E00\u6B21\u4ED8\u6E05 \xB7 \u6C38\u4E45\u4F7F\u7528",
    upgrade_lifetime_card_label: "\u7EC8\u8EAB\u4E70\u65AD \xB7 \u65E9\u9E1F",
    upgrade_lifetime_savings:
      "\u4E00\u6B21\u4ED8\u6E05 \xB7 \u6C38\u4E45\u4F7F\u7528",
    upgrade_lifetime_countdown_badge:
      "\u9650\u65F6 -40% \xB7 \u5269 {days} \u5929",
    upgrade_btn_choose: "\u9009\u62E9\u65B9\u6848",
    upgrade_btn_close: "\u5173\u95ED",
    have_key_prompt: "\u5DF2\u5B8C\u6210\u8D2D\u4E70\uFF1F",
    have_key_link: "\u8F93\u5165 license key \u2192",
    gate_topk_limit:
      "\u514D\u8D39\u7248\u6BCF\u6B21\u6279\u91CF\u4E0B\u8F7D\u6700\u591A {limit} \u7BC7\u3002\u5347\u7EA7 Pro \u89E3\u9664\u9650\u5236\u3002",
    gate_days_limit:
      "\u514D\u8D39\u7248\u9650\u300C\u6700\u8FD1 {limit} \u5929\u300D\u3002\u5347\u7EA7 Pro \u53EF\u4E0B\u8F7D 90 / 180 \u5929\u6216\u81EA\u5B9A\u4E49\u533A\u95F4\u3002",
    gate_custom_range:
      "\u81EA\u5B9A\u4E49\u65E5\u671F\u533A\u95F4\u662F Pro \u529F\u80FD\u3002",
    gate_extras:
      "\u5C06\u7CBE\u9009\u6253\u5305\u8FDB\u4E2A\u4EBA\u4E3B\u9875\u4E0B\u8F7D\u662F Pro \u529F\u80FD\u3002\u9650\u65F6\u52A8\u6001 (24h) \u4E3A\u514D\u8D39\u3002",
    gate_all_trial_exhausted:
      "\u60A8\u5DF2\u7528\u5B8C {limit} \u6B21\u300C\u5168\u90E8\u4E0B\u8F7D\u300D\u514D\u8D39\u8BD5\u7528\u3002\u5347\u7EA7 Pro \u5373\u53EF\u65E0\u9650\u5236\u6279\u91CF\u4E0B\u8F7D\u3002",
    gate_saved_multi:
      "\u4E00\u6B21\u4E0B\u8F7D\u591A\u4E2A\u6536\u85CF\u5939\u662F Pro \u529F\u80FD\u3002\u70B9\u8FDB\u5355\u4E00\u6536\u85CF\u5939\u514D\u8D39\u4E0B\u8F7D\u3002",
    license_section_title: "Dog Saver Pro",
    license_status_free: "\u514D\u8D39\u7248",
    license_status_pro: "Pro \xB7 \u5DF2\u542F\u7528",
    license_status_legacy:
      "Pro \xB7 \u5DF2\u89E3\u9501\uFF08\u65E9\u671F\u652F\u6301\u8005\uFF0C\u611F\u8C22\u60A8\uFF01\uFF09",
    license_status_expires: "\u5230\u671F\u65E5 {date}",
    license_status_lifetime: "\u7EC8\u8EAB\u6388\u6743",
    license_input_placeholder:
      "\u7C98\u8D34\u60A8\u7684 license key (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "\u542F\u7528",
    license_btn_activating: "\u542F\u7528\u4E2D...",
    license_btn_copy: "\u590D\u5236",
    license_btn_remove_device: "\u79FB\u9664\u6B64\u8BBE\u5907",
    license_btn_get_pro: "\u83B7\u53D6 Pro",
    license_btn_get_pro_cta: "\u83B7\u53D6 Pro",
    license_msg_activated:
      "Pro \u5DF2\u542F\u7528\u3002\u611F\u8C22\u60A8\u652F\u6301 Dog Saver\uFF01",
    license_msg_activate_failed: "\u542F\u7528\u5931\u8D25\uFF1A{error}",
    license_msg_removed:
      "\u8BBE\u5907\u5DF2\u79FB\u9664\uFF0Clicense \u5DF2\u4ECE\u6B64\u6D4F\u89C8\u5668\u6E05\u9664\u3002",
    license_msg_limit_reached_title:
      "\u5DF2\u8FBE\u542F\u7528\u8BBE\u5907\u4E0A\u9650",
    license_msg_limit_reached_body:
      "\u6B64 license \u5DF2\u5728 3 \u53F0\u8BBE\u5907\u4E0A\u542F\u7528\u3002\u8BF7\u5728\u5176\u4ED6\u8BBE\u5907\u4E0A\u6253\u5F00 Dog Saver \u5E76\u70B9\u51FB\u300C\u79FB\u9664\u6B64\u8BBE\u5907\u300D\u4EE5\u91CA\u653E\u540D\u989D\u3002",
    license_help_switch_device:
      "\u6362\u7535\u8111\uFF1F\u628A\u4E0A\u9762\u7684 key \u590D\u5236\u5230\u65B0\u7535\u8111\u7684\u6B64\u5904\u7C98\u8D34\u3002",
    license_help_portal:
      "\u7BA1\u7406\u8BA2\u9605 / \u91CD\u8BBE\u8BBE\u5907 \u2192 Customer Portal",
    legacy_welcome_title: "\u611F\u8C22\u60A8\u7684\u65E9\u671F\u652F\u6301",
    legacy_welcome_body:
      "\u60A8\u4ECE v{version} \u5F00\u59CB\u4F7F\u7528 Dog Saver\u3002Pro \u5DF2\u5728\u6B64\u5B89\u88C5\u4E0A\u6C38\u4E45\u89E3\u9501\uFF0C\u65E0\u9700\u4ED8\u8D39\u3002",
    legacy_welcome_warning:
      "\u7531\u4E8E\u6211\u4EEC\u4E0D\u6536\u96C6\u4EFB\u4F55\u4E2A\u4EBA\u4FE1\u606F\uFF0C\u60A8\u7684\u65E9\u671F\u652F\u6301\u8005\u8EAB\u4EFD\u7ED1\u5B9A\u4E8E\u6B64 Chrome \u5B89\u88C5\u3002\u5378\u8F7D Dog Saver \u53EF\u80FD\u4F1A\u5931\u53BB\u6B64\u8EAB\u4EFD\u3002",
    legacy_welcome_btn_done: "\u6211\u77E5\u9053\u4E86",
    legacy_welcome_btn_review:
      "\u5728 Chrome Web Store \u7559\u4E0B\u8BC4\u4EF7",
    legacy_thanks_title: "\u611F\u8C22\u60A8\u7684\u65E9\u671F\u652F\u6301",
    legacy_thanks_message:
      "\u60A8\u4ECE v{version} \u5F00\u59CB\u4F7F\u7528 Dog Saver\u3002Pro \u5DF2\u6C38\u4E45\u89E3\u9501\uFF0C\u65E0\u9700\u4ED8\u8D39\u3002\u5982\u679C\u8FD9\u4E2A\u5DE5\u5177\u5BF9\u60A8\u6709\u5E2E\u52A9\uFF0C\u7B80\u77ED\u7684\u8BC4\u4EF7\u80FD\u5E2E\u52A9\u6211\u4EEC\u7EE7\u7EED\u4FDD\u6301\u514D\u8D39\u3002",
    legacy_thanks_btn_review: "\u7559\u4E0B\u8BC4\u4EF7",
    legacy_thanks_btn_done: "\u6211\u77E5\u9053\u4E86",
  };
  var $e = {
    btn_download_all: "\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    aria_download_hd_avatar:
      "HD \u30A2\u30A4\u30B3\u30F3\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    notify_avatar_failed:
      "HD \u30A2\u30A4\u30B3\u30F3\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    notify_avatar_success:
      "HD \u30A2\u30A4\u30B3\u30F3\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F",
    aria_download_post:
      "\u3053\u306E\u6295\u7A3F\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    aria_download_post_zip:
      "\u3053\u306E\u6295\u7A3F\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9 (ZIP)",
    aria_download_reel:
      "\u3053\u306E\u30EA\u30FC\u30EB\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    tooltip_sponsored_not_downloadable:
      "\u5E83\u544A\u30B3\u30F3\u30C6\u30F3\u30C4\u306F\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u307E\u305B\u3093",
    notify_post_media_failed:
      "\u3053\u306E\u6295\u7A3F\u306E\u30E1\u30C7\u30A3\u30A2\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    notify_downloaded_n_files_zip:
      "{count} \u30D5\u30A1\u30A4\u30EB\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F (ZIP)",
    notify_downloaded_1_file:
      "1 \u30D5\u30A1\u30A4\u30EB\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F",
    notify_download_failed:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5931\u6557: {error}",
    dialog_title: "@{username} \u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    dialog_media_type: "\u30E1\u30C7\u30A3\u30A2\u30BF\u30A4\u30D7",
    dialog_media_all:
      "\u3059\u3079\u3066\uFF08\u5199\u771F + \u52D5\u753B\uFF09",
    dialog_media_photos: "\u5199\u771F\u306E\u307F",
    dialog_media_videos: "\u52D5\u753B\u306E\u307F",
    dialog_save_method: "\u4FDD\u5B58\u65B9\u6CD5",
    dialog_save_grouped:
      "\u6295\u7A3F\u3054\u3068\u306B\u30D5\u30A9\u30EB\u30C0\u5206\u3051",
    dialog_save_flat:
      "\u3059\u3079\u3066\u306E\u30D5\u30A1\u30A4\u30EB\u30921\u3064\u306E\u30D5\u30A9\u30EB\u30C0\u306B",
    dialog_range: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u7BC4\u56F2",
    dialog_range_all: "\u3059\u3079\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    dialog_range_all_trial_remaining:
      "{base}\uFF08\u7121\u6599\u30C8\u30E9\u30A4\u30A2\u30EB \u6B8B\u308A {remaining} \u56DE\uFF09",
    dialog_range_topk: "\u6700\u65B0\u304B\u3089 N \u4EF6",
    dialog_range_last_n_days: "\u76F4\u8FD1 N \u65E5\u9593",
    dialog_range_custom: "\u30AB\u30B9\u30BF\u30E0\u65E5\u4ED8\u7BC4\u56F2",
    dialog_post_count: "\u6295\u7A3F\u6570",
    dialog_recent_days: "\u65E5\u6570",
    dialog_days_7: "7 \u65E5",
    dialog_days_30: "30 \u65E5",
    dialog_days_90: "90 \u65E5",
    dialog_days_180: "180 \u65E5",
    dialog_start_date: "\u958B\u59CB\u65E5",
    dialog_end_date: "\u7D42\u4E86\u65E5",
    dialog_btn_start: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u958B\u59CB",
    dialog_btn_cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
    dialog_extras: "\u8FFD\u52A0\u3067\u542B\u3081\u308B",
    dialog_include_highlights:
      "\u3059\u3079\u3066\u306E\u30CF\u30A4\u30E9\u30A4\u30C8",
    dialog_include_stories:
      "\u73FE\u5728\u306E\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA (24\u6642\u9593)",
    status_scanning: "\u6295\u7A3F\u3092\u30B9\u30AD\u30E3\u30F3\u4E2D...",
    status_posts_found:
      "0 \u4EF6\u306E\u6295\u7A3F\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F",
    status_count:
      "{posts} \u4EF6\u306E\u6295\u7A3F \xB7 {media} \u30D5\u30A1\u30A4\u30EB",
    status_count_zips: "\xB7 \u7D04 {parts} ZIP",
    status_scanned_to:
      "{date} \u307E\u3067\u30B9\u30AD\u30E3\u30F3\u6E08\u307F",
    status_loading_next:
      "\u6B21\u306E\u30DA\u30FC\u30B8\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    status_loading_first:
      "\u6700\u521D\u306E\u30DA\u30FC\u30B8\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    status_rate_limited_scroll:
      "API \u30EC\u30FC\u30C8\u5236\u9650\u306E\u305F\u3081\u3001\u30B9\u30AF\u30ED\u30FC\u30EB\u30E2\u30FC\u30C9\u306B\u5207\u308A\u66FF\u3048\u4E2D...",
    status_rate_limited_retry:
      "Instagram\u30EC\u30FC\u30C8\u5236\u9650\u3001{seconds}\u79D2\u5F8C\u306B\u30EA\u30C8\u30E9\u30A4...",
    status_processing: "\u51E6\u7406\u4E2D...",
    status_waiting_next:
      "\u6B21\u306E\u30DA\u30FC\u30B8\u3092\u5F85\u6A5F\u4E2D...",
    status_scan_complete:
      "\u30B9\u30AD\u30E3\u30F3\u5B8C\u4E86\u3001\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u30AD\u30E5\u30FC\u306B\u8FFD\u52A0\u6E08\u307F",
    status_saving_scanned:
      "\u30B9\u30AD\u30E3\u30F3\u6E08\u307F\u30B3\u30F3\u30C6\u30F3\u30C4\u3092\u4FDD\u5B58\u4E2D...",
    status_stopped: "\u505C\u6B62\u3057\u307E\u3057\u305F",
    notify_started:
      "@{username} \u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F",
    notify_switched_scroll:
      "API\u30EC\u30FC\u30C8\u5236\u9650\u306E\u305F\u3081\u3001\u30B9\u30AF\u30ED\u30FC\u30EB\u30E2\u30FC\u30C9\u306B\u5207\u308A\u66FF\u3048\u307E\u3057\u305F",
    notify_multi_zip:
      "\u30D5\u30A1\u30A4\u30EB\u304C {chunkSize} \u500B\u3092\u8D85\u3048\u308B\u305F\u3081\u3001\u8907\u6570\u306E ZIP \u306B\u5206\u5272\u3057\u307E\u3059\uFF08\u7D04 {parts} \u500B\u4EE5\u4E0A\uFF09",
    notify_found_posts:
      "{posts} \u4EF6\u306E\u6295\u7A3F\uFF08{media} \u30D5\u30A1\u30A4\u30EB\uFF09\u304C\u898B\u3064\u304B\u308A\u307E\u3057\u305F",
    notify_error: "\u30A8\u30E9\u30FC: {message}",
    notify_pagination_error:
      "\u30DA\u30FC\u30B8\u30CD\u30FC\u30B7\u30E7\u30F3\u30A8\u30E9\u30FC: {message}",
    scroll_loading_more:
      "\u30B9\u30AF\u30ED\u30FC\u30EB\u3057\u3066\u6295\u7A3F\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    scroll_parsing_post:
      "\u6295\u7A3F\u3092\u89E3\u6790\u4E2D {current}/{total}: {shortcode}",
    scroll_got_records:
      "\u30DA\u30FC\u30B8\u304B\u3089 {count} \u4EF6\u306E\u6295\u7A3F\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3057\u307E\u3057\u305F",
    rate_wait:
      "\u30EA\u30AF\u30A8\u30B9\u30C8\u983B\u5EA6\u8D85\u904E\u3001{seconds}\u79D2\u5F85\u6A5F\u4E2D...",
    parse_html_error:
      "Instagram\u304C\u4E88\u671F\u3057\u306A\u3044\u30B3\u30F3\u30C6\u30F3\u30C4\u3092\u8FD4\u3057\u307E\u3057\u305F\u3002\u30ED\u30B0\u30A4\u30F3\u6E08\u307F\u3067\u3042\u308B\u3053\u3068\u3092\u78BA\u8A8D\u3057\u3001\u30DA\u30FC\u30B8\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    zip_no_files:
      "ZIP\u306B\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u53EF\u80FD\u306A\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093",
    aria_download: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    story_download_highlight: "\u5168\u4FDD\u5B58",
    story_download_all: "\u5168\u4FDD\u5B58",
    notify_story_failed:
      "\u3053\u306E\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    notify_story_success:
      "\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F",
    story_downloading: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u4E2D...",
    notify_highlight_id_failed:
      "\u30CF\u30A4\u30E9\u30A4\u30C8ID\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    notify_username_failed:
      "\u30E6\u30FC\u30B6\u30FC\u540D\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    notify_user_data_failed:
      "\u30E6\u30FC\u30B6\u30FC\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\uFF08\u975E\u516C\u958B\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u53EF\u80FD\u6027\uFF09",
    notify_highlight_empty:
      "\u3053\u306E\u30CF\u30A4\u30E9\u30A4\u30C8\u306B\u306F\u30B3\u30F3\u30C6\u30F3\u30C4\u304C\u3042\u308A\u307E\u305B\u3093",
    notify_no_stories:
      "\u3053\u306E\u30E6\u30FC\u30B6\u30FC\u306B\u306F\u73FE\u5728\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u304C\u3042\u308A\u307E\u305B\u3093",
    highlight_untitled: "\u7121\u984C\u306E\u30CF\u30A4\u30E9\u30A4\u30C8",
    progress_extras_start:
      "\u8FFD\u52A0\u30B3\u30F3\u30C6\u30F3\u30C4\u3092\u6E96\u5099\u4E2D...",
    progress_stories_fetching:
      "\u73FE\u5728\u306E\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u3092\u53D6\u5F97\u4E2D...",
    progress_stories_packing:
      "{count} \u4EF6\u306E\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u3092 ZIP \u306B\u30D1\u30C3\u30AF\u4E2D...",
    progress_highlights_fetching_tray:
      "\u30CF\u30A4\u30E9\u30A4\u30C8\u4E00\u89A7\u3092\u53D6\u5F97\u4E2D...",
    progress_highlight_fetching:
      "\u30CF\u30A4\u30E9\u30A4\u30C8 {current}/{total}\uFF1A{title}",
    progress_highlights_packing:
      "{count} \u4EF6\u306E\u30CF\u30A4\u30E9\u30A4\u30C8\u3092 ZIP \u306B\u30D1\u30C3\u30AF\u4E2D...",
    progress_highlights_packing_named:
      "\u30D1\u30C3\u30AF\u4E2D: {title} ({current}/{total})",
    task_label_highlights: "\u30CF\u30A4\u30E9\u30A4\u30C8",
    task_label_stories: "\u30B9\u30C8\u30FC\u30EA\u30FC",
    popup_subtitle:
      "Instagram \u30E1\u30C7\u30A3\u30A2\u306E\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    popup_empty_title:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u30BF\u30B9\u30AF\u304C\u3042\u308A\u307E\u305B\u3093",
    popup_empty_desc: `\u516C\u958B Instagram \u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u30DA\u30FC\u30B8\u306B\u79FB\u52D5\u3057\u3066
\u300C\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u300D\u30DC\u30BF\u30F3\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044`,
    popup_settings: "\u8A2D\u5B9A",
    popup_settings_advanced: "\u8A73\u7D30\u8A2D\u5B9A",
    popup_concurrency: "\u540C\u6642\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6570",
    popup_max_retries: "\u6700\u5927\u30EA\u30C8\u30E9\u30A4\u56DE\u6570",
    popup_zip_chunk: "ZIP \u5206\u5272\u30B5\u30A4\u30BA",
    popup_zip_chunk_tip:
      "ZIP \u3042\u305F\u308A\u306E\u6700\u5927\u30D5\u30A1\u30A4\u30EB\u6570\u3002\u3053\u306E\u4E0A\u9650\u3092\u8D85\u3048\u308B\u3068\u3001\u81EA\u52D5\u7684\u306B\u8907\u6570\u306E ZIP \u306B\u5206\u5272\u3055\u308C\u307E\u3059\u3002",
    popup_zip_no_split: "\u5206\u5272\u3057\u306A\u3044",
    popup_language: "\u8A00\u8A9E",
    popup_footer:
      "Dog Saver v{version} \xB7 \u30ED\u30FC\u30AB\u30EB\u306E\u307F\u3001\u30C8\u30E9\u30C3\u30AD\u30F3\u30B0\u306A\u3057",
    task_scanning: "\u30B9\u30AD\u30E3\u30F3\u4E2D... {found}",
    task_scanning_found: "{count} \u30D5\u30A1\u30A4\u30EB\u767A\u898B",
    task_batches_done: "{count} \u30D0\u30C3\u30C1\u5B8C\u4E86",
    task_zipping: "ZIP\u751F\u6210\u4E2D...{percent}",
    task_packing:
      "{current}/{total} \u30D5\u30A1\u30A4\u30EB\u3092\u30D1\u30C3\u30AF\u4E2D...",
    task_batches_done_parens: "({count} \u30D0\u30C3\u30C1\u5B8C\u4E86)",
    task_creating_zip:
      "ZIP\u4F5C\u6210\u4E2D... {total} \u30D5\u30A1\u30A4\u30EB",
    task_downloaded:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u6E08\u307F {done}/{total} \u30D5\u30A1\u30A4\u30EB",
    task_failed: "{count} \u5931\u6557",
    task_in_progress: "{count} \u9032\u884C\u4E2D",
    task_zips: "{count} ZIP",
    task_status_running: "\u5B9F\u884C\u4E2D",
    task_status_paused: "\u4E00\u6642\u505C\u6B62",
    task_status_done: "\u5B8C\u4E86",
    task_status_stopped: "\u505C\u6B62",
    task_status_saving: "\u4FDD\u5B58\u4E2D...",
    task_status_auto_paused:
      "\u4E00\u6642\u505C\u6B62\uFF08\u30BF\u30D6\u3092\u9589\u3058\u307E\u3057\u305F\uFF09",
    status_auto_resume:
      "@{username} \u306E\u30B9\u30AD\u30E3\u30F3\u3092\u518D\u958B\u4E2D...",
    task_btn_pause: "\u4E00\u6642\u505C\u6B62",
    task_btn_resume: "\u518D\u958B",
    task_btn_stop: "\u505C\u6B62",
    task_stop_confirm:
      "\u505C\u6B62\u524D\u306B\u30B9\u30AD\u30E3\u30F3\u6E08\u307F\u306E{count}\u4EF6\u306E\u6295\u7A3F\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3059\u304B\uFF1F",
    task_stop_download:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u3066\u505C\u6B62",
    task_stop_discard: "\u7834\u68C4\u3057\u3066\u505C\u6B62",
    task_stop_preparing:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u6E96\u5099\u4E2D...",
    error_no_avatar_url:
      "\u30A2\u30A4\u30B3\u30F3\u306EURL\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
    error_no_media_items:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u308B\u30E1\u30C7\u30A3\u30A2\u304C\u3042\u308A\u307E\u305B\u3093",
    error_no_story_items:
      "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u308B\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA\u304C\u3042\u308A\u307E\u305B\u3093",
    error_unknown_message:
      "\u4E0D\u660E\u306A\u30E1\u30C3\u30BB\u30FC\u30B8\u30BF\u30A4\u30D7",
    error_zip_build_failed:
      "ZIP\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
    btn_download_saved:
      "\u4FDD\u5B58\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    btn_download_collection:
      "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    dialog_saved_title:
      "\u4FDD\u5B58\u3057\u305F\u6295\u7A3F\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    dialog_select_collections:
      "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u9078\u629E",
    dialog_select_all: "\u3059\u3079\u3066\u9078\u629E",
    dialog_deselect_all: "\u3059\u3079\u3066\u89E3\u9664",
    dialog_collection_count: "{count} \u4EF6",
    status_collection_progress: "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3: {name}",
    dialog_saved_folder_mode: "\u4FDD\u5B58\u65B9\u6CD5",
    dialog_saved_folder_per_post:
      "\u6295\u7A3F\u3054\u3068\u306B\u30D5\u30A9\u30EB\u30C0",
    dialog_saved_folder_per_collection:
      "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3054\u3068\u306B\u30D5\u30A9\u30EB\u30C0",
    notify_fetching_collections:
      "\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u53D6\u5F97\u4E2D...",
    notify_no_collections:
      "\u4FDD\u5B58\u3057\u305F\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093",
    review_title:
      "Dog Saver \u3092\u6C17\u306B\u5165\u3063\u3066\u3044\u305F\u3060\u3051\u307E\u3057\u305F\u304B\uFF1F",
    review_message:
      "{count} \u56DE\u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\uFF01\u3053\u306E\u30C4\u30FC\u30EB\u304C\u304A\u5F79\u306B\u7ACB\u3066\u305F\u306A\u3089\u3001Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u3067\u30EC\u30D3\u30E5\u30FC\u3092\u3044\u305F\u3060\u3051\u308B\u3068\u5B09\u3057\u3044\u3067\u3059\u3002\u7686\u3055\u307E\u306E\u5FDC\u63F4\u304C\u3001\u7121\u6599\u3067\u6539\u5584\u3092\u7D9A\u3051\u308B\u529B\u306B\u306A\u308A\u307E\u3059\u3002",
    review_btn_rate: "\u30EC\u30D3\u30E5\u30FC\u3092\u66F8\u304F",
    review_btn_later: "\u307E\u305F\u4ECA\u5EA6",
    review_btn_never: "\u4ECA\u5F8C\u8868\u793A\u3057\u306A\u3044",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 \u89E3\u653E\u6E08\u307F",
    upgrade_title:
      "Dog Saver Pro \u306B\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9",
    upgrade_title_benefit:
      "\u5927\u5207\u306A\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4E38\u3054\u3068\u4FDD\u5B58",
    upgrade_subtitle:
      "\u7121\u5236\u9650\u306E\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3068\u9AD8\u5EA6\u306A\u6A5F\u80FD\u3092\u89E3\u653E",
    upgrade_feature_unlimited:
      "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u7121\u5236\u9650",
    upgrade_feature_extras:
      "\u30CF\u30A4\u30E9\u30A4\u30C8\u30FB\u30B9\u30C8\u30FC\u30EA\u30FC\u3092\u30EF\u30F3\u30AF\u30EA\u30C3\u30AF\u3067\u4E00\u62EC\u53D6\u5F97",
    upgrade_feature_saved:
      "\u4FDD\u5B58\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306E\u8907\u6570\u9078\u629E\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    upgrade_feature_dates:
      "\u30AB\u30B9\u30BF\u30E0\u671F\u9593\uFF0890 / 180 \u65E5 / \u30AB\u30B9\u30BF\u30E0\uFF09",
    compare_header_feature: "\u6A5F\u80FD",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\u5358\u4F53\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\uFF08\u6295\u7A3F / Reel / \u30B9\u30C8\u30FC\u30EA\u30FC\uFF09",
    compare_row_highlight: "\u5358\u4F53 Highlight",
    compare_row_single_collection:
      "\u5358\u4E00\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    compare_row_profile_bulk:
      "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
    compare_row_profile_bulk_free: "\u6700\u65B0 30 \u4EF6",
    compare_row_profile_bulk_pro: "\u7121\u5236\u9650",
    compare_row_extras:
      "\u30CF\u30A4\u30E9\u30A4\u30C8\u30FB\u30B9\u30C8\u30FC\u30EA\u30FC\u4E00\u62EC\u53D6\u5F97",
    compare_row_saved:
      "\u4FDD\u5B58\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u8907\u6570\u9078\u629E\u4E00\u62EC",
    compare_row_dates: "\u30AB\u30B9\u30BF\u30E0\u671F\u9593",
    compare_row_dates_pro: "7 / 30 / 90 / \u30AB\u30B9\u30BF\u30E0",
    trust_no_personal_data:
      "\u500B\u4EBA\u60C5\u5831\u3092\u53CE\u96C6\u3057\u307E\u305B\u3093",
    trust_three_devices:
      "3 \u53F0\u306E\u30C7\u30D0\u30A4\u30B9\u30E9\u30A4\u30BB\u30F3\u30B9",
    upgrade_plan_monthly: "\u6708\u984D",
    upgrade_plan_yearly: "\u5E74\u984D",
    upgrade_plan_lifetime: "\u8CB7\u3044\u5207\u308A",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ \u6708 \xB7 \u3044\u3064\u3067\u3082\u30AD\u30E3\u30F3\u30BB\u30EB\u53EF",
    upgrade_yearly_subtitle: "/ \u5E74 \xB7 58% \u304A\u5F97",
    upgrade_lifetime_subtitle_regular:
      "\u4E00\u5EA6\u304D\u308A\u306E\u652F\u6255\u3044 \xB7 \u6C38\u4E45\u5229\u7528",
    upgrade_lifetime_card_label:
      "\u8CB7\u3044\u5207\u308A \xB7 \u30A2\u30FC\u30EA\u30FC\u30D0\u30FC\u30C9",
    upgrade_lifetime_savings:
      "\u4E00\u5EA6\u304D\u308A\u306E\u652F\u6255\u3044 \xB7 \u6C38\u4E45\u5229\u7528",
    upgrade_lifetime_countdown_badge:
      "\u671F\u9593\u9650\u5B9A -40% \xB7 \u6B8B\u308A {days} \u65E5",
    upgrade_btn_choose: "\u30D7\u30E9\u30F3\u3092\u9078\u3076",
    upgrade_btn_close: "\u9589\u3058\u308B",
    have_key_prompt: "\u3054\u8CFC\u5165\u6E08\u307F\u3067\u3059\u304B\uFF1F",
    have_key_link: "license \u3092\u5165\u529B \u2192",
    gate_topk_limit:
      "\u7121\u6599\u7248\u306F1\u56DE\u306E\u4E00\u62EC\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3042\u305F\u308A\u6700\u5927 {limit} \u4EF6\u3067\u3059\u3002Pro \u3067\u7121\u5236\u9650\u306B\u3002",
    gate_days_limit:
      "\u7121\u6599\u7248\u306F\u6700\u8FD1 {limit} \u65E5\u306E\u307F\u3067\u3059\u3002Pro \u3067 90 / 180 \u65E5\u307E\u305F\u306F\u30AB\u30B9\u30BF\u30E0\u671F\u9593\u306B\u5BFE\u5FDC\u3002",
    gate_custom_range:
      "\u30AB\u30B9\u30BF\u30E0\u671F\u9593\u306F Pro \u6A5F\u80FD\u3067\u3059\u3002",
    gate_extras:
      "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u306B\u30CF\u30A4\u30E9\u30A4\u30C8\u3092\u542B\u3081\u308B\u306E\u306F Pro \u6A5F\u80FD\u3067\u3059\u3002\u30B9\u30C8\u30FC\u30EA\u30FC\u30BA (24\u6642\u9593) \u306F\u7121\u6599\u3067\u3059\u3002",
    gate_all_trial_exhausted:
      "\u300C\u3059\u3079\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u300D\u306E\u7121\u6599\u30C8\u30E9\u30A4\u30A2\u30EB\uFF08{limit}\u56DE\uFF09\u3092\u4F7F\u3044\u5207\u308A\u307E\u3057\u305F\u3002Pro \u306B\u30A2\u30C3\u30D7\u30B0\u30EC\u30FC\u30C9\u3059\u308C\u3070\u7121\u5236\u9650\u3067\u3059\u3002",
    gate_saved_multi:
      "\u8907\u6570\u306E\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u3092\u4E00\u5EA6\u306B\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3059\u308B\u306E\u306F Pro \u6A5F\u80FD\u3067\u3059\u3002\u5358\u4E00\u30B3\u30EC\u30AF\u30B7\u30E7\u30F3\u306F\u7121\u6599\u3067\u5229\u7528\u3067\u304D\u307E\u3059\u3002",
    license_section_title: "Dog Saver Pro",
    license_status_free: "\u7121\u6599\u7248",
    license_status_pro: "Pro \xB7 \u6709\u52B9",
    license_status_legacy:
      "Pro \xB7 \u89E3\u653E\u6E08\u307F\uFF08\u65E9\u671F\u30B5\u30DD\u30FC\u30BF\u30FC \u2014 \u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\uFF01\uFF09",
    license_status_expires: "\u6709\u52B9\u671F\u9650 {date}",
    license_status_lifetime:
      "\u8CB7\u3044\u5207\u308A\u30E9\u30A4\u30BB\u30F3\u30B9",
    license_input_placeholder:
      "\u30E9\u30A4\u30BB\u30F3\u30B9\u30AD\u30FC\u3092\u8CBC\u308A\u4ED8\u3051 (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "\u6709\u52B9\u5316",
    license_btn_activating: "\u6709\u52B9\u5316\u4E2D...",
    license_btn_copy: "\u30B3\u30D4\u30FC",
    license_btn_remove_device:
      "\u3053\u306E\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664",
    license_btn_get_pro: "Pro \u3092\u5165\u624B",
    license_btn_get_pro_cta: "Pro \u3092\u5165\u624B",
    license_msg_activated:
      "Pro \u304C\u6709\u52B9\u5316\u3055\u308C\u307E\u3057\u305F\u3002Dog Saver \u3092\u3054\u652F\u63F4\u3044\u305F\u3060\u304D\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\uFF01",
    license_msg_activate_failed:
      "\u6709\u52B9\u5316\u306B\u5931\u6557\uFF1A{error}",
    license_msg_removed:
      "\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u304B\u3089\u30E9\u30A4\u30BB\u30F3\u30B9\u3092\u6D88\u53BB\u3057\u307E\u3057\u305F\u3002",
    license_msg_limit_reached_title:
      "\u30A2\u30AF\u30C6\u30A3\u30D9\u30FC\u30B7\u30E7\u30F3\u4E0A\u9650\u306B\u9054\u3057\u307E\u3057\u305F",
    license_msg_limit_reached_body:
      "\u3053\u306E\u30E9\u30A4\u30BB\u30F3\u30B9\u306F\u3059\u3067\u306B 3 \u53F0\u306E\u30C7\u30D0\u30A4\u30B9\u3067\u6709\u52B9\u5316\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u5225\u306E\u30C7\u30D0\u30A4\u30B9\u3067 Dog Saver \u3092\u958B\u304D\u300C\u3053\u306E\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664\u300D\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u7A7A\u304D\u3092\u4F5C\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
    license_help_switch_device:
      "PC\u3092\u5909\u3048\u307E\u3059\u304B\uFF1F\u4E0A\u306E\u30AD\u30FC\u3092\u30B3\u30D4\u30FC\u3057\u3066\u65B0\u3057\u3044\u30C7\u30D0\u30A4\u30B9\u306B\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002",
    license_help_portal:
      "\u30B5\u30D6\u30B9\u30AF\u7BA1\u7406 / \u30C7\u30D0\u30A4\u30B9\u30EA\u30BB\u30C3\u30C8 \u2192 \u30AB\u30B9\u30BF\u30DE\u30FC\u30DD\u30FC\u30BF\u30EB",
    legacy_welcome_title:
      "\u65E9\u671F\u30B5\u30DD\u30FC\u30BF\u30FC\u306E\u7686\u3055\u307E\u3078",
    legacy_welcome_body:
      "v{version} \u304B\u3089 Dog Saver \u3092\u3054\u5229\u7528\u3044\u305F\u3060\u3044\u3066\u3044\u307E\u3059\u3002Pro \u306F\u3053\u306E\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3067\u6C38\u4E45\u306B\u89E3\u653E\u3055\u308C\u3066\u3044\u307E\u3059 \u2014 \u304A\u652F\u6255\u3044\u306F\u4E0D\u8981\u3067\u3059\u3002",
    legacy_welcome_warning:
      "\u500B\u4EBA\u60C5\u5831\u3092\u53CE\u96C6\u3057\u3066\u3044\u306A\u3044\u305F\u3081\u3001\u65E9\u671F\u30B5\u30DD\u30FC\u30BF\u30FC\u306E\u8CC7\u683C\u306F\u3053\u306E Chrome \u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u306B\u7D10\u4ED8\u3044\u3066\u3044\u307E\u3059\u3002Dog Saver \u3092\u30A2\u30F3\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3059\u308B\u3068\u8CC7\u683C\u304C\u5931\u308F\u308C\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002",
    legacy_welcome_btn_done: "\u308F\u304B\u308A\u307E\u3057\u305F",
    legacy_welcome_btn_review:
      "Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u306B\u30EC\u30D3\u30E5\u30FC\u3092\u66F8\u304F",
    legacy_thanks_title:
      "\u65E9\u671F\u30B5\u30DD\u30FC\u30BF\u30FC\u306E\u7686\u3055\u307E\u3078",
    legacy_thanks_message:
      "v{version} \u304B\u3089 Dog Saver \u3092\u3054\u5229\u7528\u3044\u305F\u3060\u3044\u3066\u3044\u307E\u3059\u3002Pro \u306F\u6C38\u4E45\u306B\u89E3\u653E\u3055\u308C\u3066\u3044\u307E\u3059 \u2014 \u304A\u652F\u6255\u3044\u4E0D\u8981\u3067\u3059\u3002\u3053\u306E\u30C4\u30FC\u30EB\u304C\u304A\u5F79\u306B\u7ACB\u3066\u305F\u306A\u3089\u3001\u77ED\u3044\u30EC\u30D3\u30E5\u30FC\u304C\u7121\u6599\u7D99\u7D9A\u306E\u52A9\u3051\u306B\u306A\u308A\u307E\u3059\u3002",
    legacy_thanks_btn_review: "\u30EC\u30D3\u30E5\u30FC\u3092\u66F8\u304F",
    legacy_thanks_btn_done: "\u308F\u304B\u308A\u307E\u3057\u305F",
  };
  var Ze = {
    btn_download_all: "\uC804\uCCB4 \uB2E4\uC6B4\uB85C\uB4DC",
    aria_download_hd_avatar:
      "HD \uD504\uB85C\uD544 \uC0AC\uC9C4 \uB2E4\uC6B4\uB85C\uB4DC",
    notify_avatar_failed:
      "HD \uD504\uB85C\uD544 \uC0AC\uC9C4\uC744 \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_avatar_success:
      "HD \uD504\uB85C\uD544 \uC0AC\uC9C4 \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC",
    aria_download_post: "\uC774 \uAC8C\uC2DC\uBB3C \uB2E4\uC6B4\uB85C\uB4DC",
    aria_download_post_zip:
      "\uC774 \uAC8C\uC2DC\uBB3C \uB2E4\uC6B4\uB85C\uB4DC (ZIP)",
    aria_download_reel: "\uC774 \uB9B4\uC2A4 \uB2E4\uC6B4\uB85C\uB4DC",
    tooltip_sponsored_not_downloadable:
      "\uC2A4\uD3F0\uC11C \uCF58\uD150\uCE20\uB294 \uB2E4\uC6B4\uB85C\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_post_media_failed:
      "\uC774 \uAC8C\uC2DC\uBB3C\uC758 \uBBF8\uB514\uC5B4\uB97C \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_downloaded_n_files_zip:
      "{count}\uAC1C \uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC (ZIP)",
    notify_downloaded_1_file:
      "1\uAC1C \uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC",
    notify_download_failed: "\uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328: {error}",
    dialog_title: "@{username} \uB2E4\uC6B4\uB85C\uB4DC",
    dialog_media_type: "\uBBF8\uB514\uC5B4 \uC720\uD615",
    dialog_media_all: "\uC804\uCCB4 (\uC0AC\uC9C4 + \uB3D9\uC601\uC0C1)",
    dialog_media_photos: "\uC0AC\uC9C4\uB9CC",
    dialog_media_videos: "\uB3D9\uC601\uC0C1\uB9CC",
    dialog_save_method: "\uC800\uC7A5 \uBC29\uC2DD",
    dialog_save_grouped: "\uAC8C\uC2DC\uBB3C\uBCC4 \uD3F4\uB354 \uBD84\uB9AC",
    dialog_save_flat:
      "\uBAA8\uB4E0 \uD30C\uC77C\uC744 \uD558\uB098\uC758 \uD3F4\uB354\uC5D0",
    dialog_range: "\uB2E4\uC6B4\uB85C\uB4DC \uBC94\uC704",
    dialog_range_all: "\uC804\uCCB4 \uB2E4\uC6B4\uB85C\uB4DC",
    dialog_range_all_trial_remaining:
      "{base} (\uBB34\uB8CC \uCCB4\uD5D8 {remaining}\uD68C \uB0A8\uC74C)",
    dialog_range_topk: "\uCD5C\uC2E0 N\uAC1C \uAC8C\uC2DC\uBB3C",
    dialog_range_last_n_days: "\uCD5C\uADFC N\uC77C \uC774\uB0B4",
    dialog_range_custom: "\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uAE30\uAC04",
    dialog_post_count: "\uAC8C\uC2DC\uBB3C \uC218",
    dialog_recent_days: "\uC77C\uC218",
    dialog_days_7: "7\uC77C",
    dialog_days_30: "30\uC77C",
    dialog_days_90: "90\uC77C",
    dialog_days_180: "180\uC77C",
    dialog_start_date: "\uC2DC\uC791\uC77C",
    dialog_end_date: "\uC885\uB8CC\uC77C",
    dialog_btn_start: "\uB2E4\uC6B4\uB85C\uB4DC \uC2DC\uC791",
    dialog_btn_cancel: "\uCDE8\uC18C",
    dialog_extras: "\uCD94\uAC00\uB85C \uD3EC\uD568",
    dialog_include_highlights: "\uBAA8\uB4E0 \uD558\uC774\uB77C\uC774\uD2B8",
    dialog_include_stories: "\uD604\uC7AC \uC2A4\uD1A0\uB9AC (24\uC2DC\uAC04)",
    status_scanning: "\uAC8C\uC2DC\uBB3C \uC2A4\uCE94 \uC911...",
    status_posts_found: "0\uAC1C \uAC8C\uC2DC\uBB3C \uBC1C\uACAC",
    status_count:
      "{posts}\uAC1C \uAC8C\uC2DC\uBB3C \xB7 {media}\uAC1C \uD30C\uC77C",
    status_count_zips: "\xB7 \uC57D {parts}\uAC1C ZIP",
    status_scanned_to: "{date}\uAE4C\uC9C0 \uC2A4\uCE94 \uC644\uB8CC",
    status_loading_next:
      "\uB2E4\uC74C \uD398\uC774\uC9C0 \uB85C\uB4DC \uC911...",
    status_loading_first: "\uCCAB \uD398\uC774\uC9C0 \uB85C\uB4DC \uC911...",
    status_rate_limited_scroll:
      "API \uC18D\uB3C4 \uC81C\uD55C, \uC2A4\uD06C\uB864 \uBAA8\uB4DC\uB85C \uC804\uD658 \uC911...",
    status_rate_limited_retry:
      "Instagram \uC18D\uB3C4 \uC81C\uD55C, {seconds}\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4...",
    status_processing: "\uCC98\uB9AC \uC911...",
    status_waiting_next:
      "\uB2E4\uC74C \uD398\uC774\uC9C0 \uB300\uAE30 \uC911...",
    status_scan_complete:
      "\uC2A4\uCE94 \uC644\uB8CC, \uB2E4\uC6B4\uB85C\uB4DC \uB300\uAE30\uC5F4\uC5D0 \uCD94\uAC00\uB428",
    status_saving_scanned:
      "\uC2A4\uCE94\uB41C \uCF58\uD150\uCE20 \uC800\uC7A5 \uC911...",
    status_stopped: "\uC911\uC9C0\uB428",
    notify_started: "@{username} \uB2E4\uC6B4\uB85C\uB4DC \uC2DC\uC791",
    notify_switched_scroll:
      "API \uC18D\uB3C4 \uC81C\uD55C\uC73C\uB85C \uC2A4\uD06C\uB864 \uBAA8\uB4DC\uB85C \uC804\uD658\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
    notify_multi_zip:
      "\uD30C\uC77C\uC774 {chunkSize}\uAC1C\uB97C \uCD08\uACFC\uD558\uC5EC \uC5EC\uB7EC ZIP\uC73C\uB85C \uBD84\uD560\uB429\uB2C8\uB2E4 (\uC57D {parts}\uAC1C \uC774\uC0C1)",
    notify_found_posts:
      "{posts}\uAC1C \uAC8C\uC2DC\uBB3C ({media}\uAC1C \uD30C\uC77C) \uBC1C\uACAC",
    notify_error: "\uC624\uB958: {message}",
    notify_pagination_error:
      "\uD398\uC774\uC9C0\uB124\uC774\uC158 \uC624\uB958: {message}",
    scroll_loading_more:
      "\uC2A4\uD06C\uB864\uD558\uC5EC \uB354 \uB9CE\uC740 \uAC8C\uC2DC\uBB3C \uB85C\uB4DC \uC911...",
    scroll_parsing_post:
      "\uAC8C\uC2DC\uBB3C \uBD84\uC11D \uC911 {current}/{total}: {shortcode}",
    scroll_got_records:
      "\uD398\uC774\uC9C0\uC5D0\uC11C {count}\uAC1C \uAC8C\uC2DC\uBB3C \uB370\uC774\uD130 \uAC00\uC838\uC634",
    rate_wait:
      "\uC694\uCCAD\uC774 \uB108\uBB34 \uBE48\uBC88\uD569\uB2C8\uB2E4. {seconds}\uCD08 \uB300\uAE30 \uC911...",
    parse_html_error:
      "Instagram\uC774 \uC608\uC0C1\uCE58 \uBABB\uD55C \uCF58\uD150\uCE20\uB97C \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uC778 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uD398\uC774\uC9C0\uB97C \uC0C8\uB85C\uACE0\uCE68\uD558\uC138\uC694.",
    zip_no_files:
      "ZIP\uC5D0 \uB2E4\uC6B4\uB85C\uB4DC \uAC00\uB2A5\uD55C \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4",
    aria_download: "\uB2E4\uC6B4\uB85C\uB4DC",
    story_download_highlight: "\uC804\uCCB4 \uC800\uC7A5",
    story_download_all: "\uC804\uCCB4 \uC800\uC7A5",
    notify_story_failed:
      "\uC774 \uC2A4\uD1A0\uB9AC\uB97C \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_story_success:
      "\uC2A4\uD1A0\uB9AC \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC",
    story_downloading: "\uB2E4\uC6B4\uB85C\uB4DC \uC911...",
    notify_highlight_id_failed:
      "\uD558\uC774\uB77C\uC774\uD2B8 ID\uB97C \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_username_failed:
      "\uC0AC\uC6A9\uC790 \uC774\uB984\uC744 \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_user_data_failed:
      "\uC0AC\uC6A9\uC790 \uC815\uBCF4\uB97C \uAC00\uC838\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4 (\uBE44\uACF5\uAC1C \uACC4\uC815\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4)",
    notify_highlight_empty:
      "\uC774 \uD558\uC774\uB77C\uC774\uD2B8\uC5D0 \uCF58\uD150\uCE20\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
    notify_no_stories:
      "\uC774 \uC0AC\uC6A9\uC790\uC5D0\uAC8C \uD604\uC7AC \uC2A4\uD1A0\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
    highlight_untitled:
      "\uC81C\uBAA9 \uC5C6\uB294 \uD558\uC774\uB77C\uC774\uD2B8",
    progress_extras_start:
      "\uCD94\uAC00 \uCF58\uD150\uCE20 \uC900\uBE44 \uC911...",
    progress_stories_fetching:
      "\uD604\uC7AC \uC2A4\uD1A0\uB9AC \uAC00\uC838\uC624\uB294 \uC911...",
    progress_stories_packing:
      "{count}\uAC1C \uC2A4\uD1A0\uB9AC \uD30C\uC77C\uC744 ZIP\uC73C\uB85C \uC555\uCD95 \uC911...",
    progress_highlights_fetching_tray:
      "\uD558\uC774\uB77C\uC774\uD2B8 \uBAA9\uB85D \uAC00\uC838\uC624\uB294 \uC911...",
    progress_highlight_fetching:
      "\uD558\uC774\uB77C\uC774\uD2B8 {current}/{total}: {title}",
    progress_highlights_packing:
      "{count}\uAC1C \uD558\uC774\uB77C\uC774\uD2B8 \uD30C\uC77C\uC744 ZIP\uC73C\uB85C \uC555\uCD95 \uC911...",
    progress_highlights_packing_named:
      "\uC555\uCD95 \uC911: {title} ({current}/{total})",
    task_label_highlights: "\uD558\uC774\uB77C\uC774\uD2B8",
    task_label_stories: "\uC2A4\uD1A0\uB9AC",
    popup_subtitle:
      "Instagram \uBBF8\uB514\uC5B4 \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC",
    popup_empty_title:
      "\uB2E4\uC6B4\uB85C\uB4DC \uC791\uC5C5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4",
    popup_empty_desc: `\uACF5\uAC1C Instagram \uD504\uB85C\uD544 \uD398\uC774\uC9C0\uB85C \uC774\uB3D9\uD558\uC5EC
"\uC804\uCCB4 \uB2E4\uC6B4\uB85C\uB4DC" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD558\uC138\uC694`,
    popup_settings: "\uC124\uC815",
    popup_settings_advanced: "\uACE0\uAE09 \uC124\uC815",
    popup_concurrency: "\uB3D9\uC2DC \uB2E4\uC6B4\uB85C\uB4DC \uC218",
    popup_max_retries: "\uCD5C\uB300 \uC7AC\uC2DC\uB3C4 \uD69F\uC218",
    popup_zip_chunk: "ZIP \uBD84\uD560 \uD06C\uAE30",
    popup_zip_chunk_tip:
      "ZIP\uB2F9 \uCD5C\uB300 \uD30C\uC77C \uC218. \uB2E4\uC6B4\uB85C\uB4DC \uC218\uAC00 \uC774 \uC81C\uD55C\uC744 \uCD08\uACFC\uD558\uBA74 \uC790\uB3D9\uC73C\uB85C \uC5EC\uB7EC ZIP\uC73C\uB85C \uBD84\uD560\uB429\uB2C8\uB2E4.",
    popup_zip_no_split: "\uBD84\uD560 \uC548 \uD568",
    popup_language: "\uC5B8\uC5B4",
    popup_footer:
      "Dog Saver v{version} \xB7 \uB85C\uCEEC \uC804\uC6A9, \uCD94\uC801 \uC5C6\uC74C",
    task_scanning: "\uC2A4\uCE94 \uC911... {found}",
    task_scanning_found: "{count}\uAC1C \uD30C\uC77C \uBC1C\uACAC",
    task_batches_done: "{count}\uAC1C \uBC30\uCE58 \uC644\uB8CC",
    task_zipping: "ZIP \uC0DD\uC131 \uC911...{percent}",
    task_packing: "{current}/{total}\uAC1C \uD30C\uC77C \uC555\uCD95 \uC911...",
    task_batches_done_parens: "({count}\uAC1C \uBC30\uCE58 \uC644\uB8CC)",
    task_creating_zip: "ZIP \uC0DD\uC131 \uC911... {total}\uAC1C \uD30C\uC77C",
    task_downloaded:
      "{done}/{total}\uAC1C \uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC",
    task_failed: "{count}\uAC1C \uC2E4\uD328",
    task_in_progress: "{count}\uAC1C \uC9C4\uD589 \uC911",
    task_zips: "{count}\uAC1C ZIP",
    task_status_running: "\uC2E4\uD589 \uC911",
    task_status_paused: "\uC77C\uC2DC \uC911\uC9C0",
    task_status_done: "\uC644\uB8CC",
    task_status_stopped: "\uC911\uC9C0\uB428",
    task_status_saving: "\uC800\uC7A5 \uC911...",
    task_status_auto_paused: "\uC77C\uC2DC \uC911\uC9C0 (\uD0ED \uB2EB\uD798)",
    status_auto_resume: "@{username} \uC2A4\uCE94 \uC7AC\uAC1C \uC911...",
    task_btn_pause: "\uC77C\uC2DC \uC911\uC9C0",
    task_btn_resume: "\uC7AC\uAC1C",
    task_btn_stop: "\uC911\uC9C0",
    task_stop_confirm:
      "\uC911\uC9C0\uD558\uAE30 \uC804\uC5D0 \uC2A4\uCE94\uB41C {count}\uAC1C\uC758 \uAC8C\uC2DC\uBB3C\uC744 \uB2E4\uC6B4\uB85C\uB4DC\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
    task_stop_download: "\uB2E4\uC6B4\uB85C\uB4DC \uD6C4 \uC911\uC9C0",
    task_stop_discard: "\uC0AD\uC81C \uD6C4 \uC911\uC9C0",
    task_stop_preparing: "\uB2E4\uC6B4\uB85C\uB4DC \uC900\uBE44 \uC911...",
    error_no_avatar_url:
      "\uD504\uB85C\uD544 \uC0AC\uC9C4 URL\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4",
    error_no_media_items:
      "\uB2E4\uC6B4\uB85C\uB4DC\uD560 \uBBF8\uB514\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
    error_no_story_items:
      "\uB2E4\uC6B4\uB85C\uB4DC\uD560 \uC2A4\uD1A0\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
    error_unknown_message:
      "\uC54C \uC218 \uC5C6\uB294 \uBA54\uC2DC\uC9C0 \uC720\uD615",
    error_zip_build_failed:
      "ZIP \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4",
    btn_download_saved: "\uC800\uC7A5 \uB2E4\uC6B4\uB85C\uB4DC",
    btn_download_collection: "\uCEEC\uB809\uC158 \uB2E4\uC6B4\uB85C\uB4DC",
    dialog_saved_title:
      "\uC800\uC7A5\uB41C \uAC8C\uC2DC\uBB3C \uB2E4\uC6B4\uB85C\uB4DC",
    dialog_select_collections: "\uCEEC\uB809\uC158 \uC120\uD0DD",
    dialog_select_all: "\uBAA8\uB450 \uC120\uD0DD",
    dialog_deselect_all: "\uBAA8\uB450 \uD574\uC81C",
    dialog_collection_count: "{count}\uAC1C \uD56D\uBAA9",
    status_collection_progress: "\uCEEC\uB809\uC158: {name}",
    dialog_saved_folder_mode: "\uC800\uC7A5 \uBC29\uC2DD",
    dialog_saved_folder_per_post: "\uAC8C\uC2DC\uBB3C\uBCC4 \uD3F4\uB354",
    dialog_saved_folder_per_collection: "\uCEEC\uB809\uC158\uBCC4 \uD3F4\uB354",
    notify_fetching_collections:
      "\uCEEC\uB809\uC158\uC744 \uAC00\uC838\uC624\uB294 \uC911...",
    notify_no_collections:
      "\uC800\uC7A5\uB41C \uCEEC\uB809\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4",
    review_title: "Dog Saver\uAC00 \uB9C8\uC74C\uC5D0 \uB4DC\uC2DC\uB098\uC694?",
    review_message:
      "{count}\uBC88\uC758 \uB2E4\uC6B4\uB85C\uB4DC\uB97C \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4! \uC774 \uB3C4\uAD6C\uAC00 \uB3C4\uC6C0\uC774 \uB418\uC168\uB2E4\uBA74 Chrome \uC6F9 \uC2A4\uD1A0\uC5B4\uC5D0 \uB9AC\uBDF0\uB97C \uB0A8\uACA8\uC8FC\uC2DC\uACA0\uC5B4\uC694? \uC5EC\uB7EC\uBD84\uC758 \uC751\uC6D0\uC774 \uBB34\uB8CC\uB85C \uACC4\uC18D \uAC1C\uC120\uD574 \uB098\uAC00\uB294 \uB370 \uD070 \uD798\uC774 \uB429\uB2C8\uB2E4.",
    review_btn_rate: "\uB9AC\uBDF0 \uB0A8\uAE30\uAE30",
    review_btn_later: "\uB098\uC911\uC5D0",
    review_btn_never: "\uB2E4\uC2DC \uBB3B\uC9C0 \uC54A\uAE30",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 \uD574\uC81C\uB428",
    upgrade_title: "Dog Saver Pro\uB85C \uC5C5\uADF8\uB808\uC774\uB4DC",
    upgrade_title_benefit:
      "\uC88B\uC544\uD558\uB294 \uACC4\uC815\uC744 \uC644\uBCBD\uD558\uAC8C \uC800\uC7A5\uD558\uC138\uC694",
    upgrade_subtitle:
      "\uBB34\uC81C\uD55C \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC\uC640 \uACE0\uAE09 \uAE30\uB2A5 \uC7A0\uAE08 \uD574\uC81C",
    upgrade_feature_unlimited:
      "\uD504\uB85C\uD544 \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC \uBB34\uC81C\uD55C",
    upgrade_feature_extras:
      "\uD558\uC774\uB77C\uC774\uD2B8 \xB7 \uC2A4\uD1A0\uB9AC \uC6D0\uD074\uB9AD \uC77C\uAD04 \uD328\uD0B9",
    upgrade_feature_saved:
      "\uC800\uC7A5 \uCEEC\uB809\uC158 \uB2E4\uC911 \uC120\uD0DD \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC",
    upgrade_feature_dates:
      "\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uB0A0\uC9DC \uBC94\uC704 (90 / 180\uC77C / \uC0AC\uC6A9\uC790 \uC9C0\uC815)",
    compare_header_feature: "\uAE30\uB2A5",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\uB2E8\uC77C \uB2E4\uC6B4\uB85C\uB4DC (\uAC8C\uC2DC\uBB3C / Reel / \uC2A4\uD1A0\uB9AC)",
    compare_row_highlight: "\uB2E8\uC77C Highlight",
    compare_row_single_collection:
      "\uB2E8\uC77C \uCEEC\uB809\uC158 \uB2E4\uC6B4\uB85C\uB4DC",
    compare_row_profile_bulk:
      "\uD504\uB85C\uD544 \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC",
    compare_row_profile_bulk_free: "\uCD5C\uADFC 30\uAC1C",
    compare_row_profile_bulk_pro: "\uBB34\uC81C\uD55C",
    compare_row_extras:
      "\uD558\uC774\uB77C\uC774\uD2B8 \xB7 \uC2A4\uD1A0\uB9AC \uC77C\uAD04 \uD328\uD0B9",
    compare_row_saved:
      "\uC800\uC7A5 \uCEEC\uB809\uC158 \uB2E4\uC911 \uC120\uD0DD \uC77C\uAD04",
    compare_row_dates:
      "\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uB0A0\uC9DC \uBC94\uC704",
    compare_row_dates_pro: "7 / 30 / 90 / \uC0AC\uC6A9\uC790 \uC9C0\uC815",
    trust_no_personal_data:
      "\uAC1C\uC778 \uC815\uBCF4\uB97C \uC218\uC9D1\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4",
    trust_three_devices: "3\uB300 \uAE30\uAE30 \uB77C\uC774\uC120\uC2A4",
    upgrade_plan_monthly: "\uC6D4\uAC04",
    upgrade_plan_yearly: "\uC5F0\uAC04",
    upgrade_plan_lifetime: "\uD3C9\uC0DD",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ \uC6D4 \xB7 \uC5B8\uC81C\uB4E0 \uCDE8\uC18C \uAC00\uB2A5",
    upgrade_yearly_subtitle: "/ \uB144 \xB7 58% \uC808\uC57D",
    upgrade_lifetime_subtitle_regular:
      "\uC77C\uD68C \uACB0\uC81C \xB7 \uC601\uAD6C \uC774\uC6A9",
    upgrade_lifetime_card_label: "\uD3C9\uC0DD \xB7 \uC5BC\uB9AC\uBC84\uB4DC",
    upgrade_lifetime_savings:
      "\uC77C\uD68C \uACB0\uC81C \xB7 \uC601\uAD6C \uC774\uC6A9",
    upgrade_lifetime_countdown_badge:
      "\uD55C\uC815 -40% \xB7 {days}\uC77C \uB0A8\uC74C",
    upgrade_btn_choose: "\uD50C\uB79C \uC120\uD0DD",
    upgrade_btn_close: "\uB2EB\uAE30",
    have_key_prompt: "\uC774\uBBF8 \uAD6C\uB9E4\uD558\uC168\uB098\uC694?",
    have_key_link: "license \uC785\uB825 \u2192",
    gate_topk_limit:
      "\uBB34\uB8CC \uBC84\uC804\uC740 \uC77C\uAD04 \uB2E4\uC6B4\uB85C\uB4DC\uB2F9 \uCD5C\uB300 {limit}\uAC1C\uB85C \uC81C\uD55C\uB429\uB2C8\uB2E4. Pro\uB85C \uBB34\uC81C\uD55C \uC774\uC6A9.",
    gate_days_limit:
      "\uBB34\uB8CC \uBC84\uC804\uC740 \uCD5C\uADFC {limit}\uC77C\uB85C \uC81C\uD55C\uB429\uB2C8\uB2E4. Pro\uB85C 90 / 180\uC77C \uB610\uB294 \uC0AC\uC6A9\uC790 \uC9C0\uC815 \uBC94\uC704 \uC0AC\uC6A9 \uAC00\uB2A5.",
    gate_custom_range:
      "\uC0AC\uC6A9\uC790 \uC9C0\uC815 \uB0A0\uC9DC \uBC94\uC704\uB294 Pro \uAE30\uB2A5\uC785\uB2C8\uB2E4.",
    gate_extras:
      "\uD504\uB85C\uD544 \uB2E4\uC6B4\uB85C\uB4DC\uC5D0 \uD558\uC774\uB77C\uC774\uD2B8 \uD3EC\uD568\uC740 Pro \uAE30\uB2A5\uC785\uB2C8\uB2E4. \uC2A4\uD1A0\uB9AC(24\uC2DC\uAC04)\uB294 \uBB34\uB8CC\uC785\uB2C8\uB2E4.",
    gate_all_trial_exhausted:
      '\uBB34\uB8CC "\uBAA8\uB450 \uB2E4\uC6B4\uB85C\uB4DC" \uCCB4\uD5D8({limit}\uD68C)\uC744 \uBAA8\uB450 \uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4. Pro\uB85C \uC5C5\uADF8\uB808\uC774\uB4DC\uD558\uBA74 \uBB34\uC81C\uD55C \uC0AC\uC6A9 \uAC00\uB2A5\uD569\uB2C8\uB2E4.',
    gate_saved_multi:
      "\uC5EC\uB7EC \uCEEC\uB809\uC158\uC744 \uD55C \uBC88\uC5D0 \uB2E4\uC6B4\uB85C\uB4DC\uD558\uB294 \uAC83\uC740 Pro \uAE30\uB2A5\uC785\uB2C8\uB2E4. \uB2E8\uC77C \uCEEC\uB809\uC158\uC740 \uBB34\uB8CC\uB85C \uC774\uC6A9 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "\uBB34\uB8CC \uBC84\uC804",
    license_status_pro: "Pro \xB7 \uD65C\uC131",
    license_status_legacy:
      "Pro \xB7 \uD574\uC81C\uB428 (\uC5BC\uB9AC \uC11C\uD3EC\uD130 \u2014 \uAC10\uC0AC\uD569\uB2C8\uB2E4!)",
    license_status_expires: "\uB9CC\uB8CC\uC77C {date}",
    license_status_lifetime: "\uD3C9\uC0DD \uB77C\uC774\uC120\uC2A4",
    license_input_placeholder:
      "\uB77C\uC774\uC120\uC2A4 \uD0A4\uB97C \uBD99\uC5EC\uB123\uC73C\uC138\uC694 (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "\uD65C\uC131\uD654",
    license_btn_activating: "\uD65C\uC131\uD654 \uC911...",
    license_btn_copy: "\uBCF5\uC0AC",
    license_btn_remove_device: "\uC774 \uAE30\uAE30 \uC81C\uAC70",
    license_btn_get_pro: "Pro \uBC1B\uAE30",
    license_btn_get_pro_cta: "Pro \uBC1B\uAE30",
    license_msg_activated:
      "Pro\uAC00 \uD65C\uC131\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Dog Saver\uB97C \uC9C0\uC6D0\uD574\uC8FC\uC154\uC11C \uAC10\uC0AC\uD569\uB2C8\uB2E4!",
    license_msg_activate_failed: "\uD65C\uC131\uD654 \uC2E4\uD328: {error}",
    license_msg_removed:
      "\uAE30\uAE30\uAC00 \uC81C\uAC70\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uB77C\uC774\uC120\uC2A4\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    license_msg_limit_reached_title:
      "\uD65C\uC131\uD654 \uD55C\uB3C4 \uCD08\uACFC",
    license_msg_limit_reached_body:
      '\uC774 \uB77C\uC774\uC120\uC2A4\uB294 \uC774\uBBF8 3\uB300\uC758 \uAE30\uAE30\uC5D0\uC11C \uD65C\uC131\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C Dog Saver\uB97C \uC5F4\uACE0 "\uC774 \uAE30\uAE30 \uC81C\uAC70"\uB97C \uD074\uB9AD\uD558\uC5EC \uC2AC\uB86F\uC744 \uD655\uBCF4\uD558\uC138\uC694.',
    license_help_switch_device:
      "PC\uB97C \uBC14\uAFB8\uC2DC\uB098\uC694? \uC704\uC758 \uD0A4\uB97C \uBCF5\uC0AC\uD558\uC5EC \uC0C8 \uAE30\uAE30\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694.",
    license_help_portal:
      "\uAD6C\uB3C5 \uAD00\uB9AC / \uAE30\uAE30 \uC7AC\uC124\uC815 \u2192 \uACE0\uAC1D \uD3EC\uD138",
    legacy_welcome_title:
      "\uC5BC\uB9AC \uC11C\uD3EC\uD130 \uC5EC\uB7EC\uBD84 \uAC10\uC0AC\uD569\uB2C8\uB2E4",
    legacy_welcome_body:
      "v{version}\uBD80\uD130 Dog Saver\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC168\uC2B5\uB2C8\uB2E4. Pro\uB294 \uC774 \uC124\uCE58\uC5D0\uC11C \uC601\uAD6C\uC801\uC73C\uB85C \uC7A0\uAE08 \uD574\uC81C\uB429\uB2C8\uB2E4 \u2014 \uACB0\uC81C\uAC00 \uD544\uC694 \uC5C6\uC2B5\uB2C8\uB2E4.",
    legacy_welcome_warning:
      "\uAC1C\uC778 \uC815\uBCF4\uB97C \uC218\uC9D1\uD558\uC9C0 \uC54A\uC73C\uBBC0\uB85C \uC5BC\uB9AC \uC11C\uD3EC\uD130 \uC790\uACA9\uC740 \uC774 Chrome \uC124\uCE58\uC5D0 \uC5F0\uACB0\uB429\uB2C8\uB2E4. Dog Saver\uB97C \uC81C\uAC70\uD558\uBA74 \uC790\uACA9\uC744 \uC783\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    legacy_welcome_btn_done: "\uD655\uC778",
    legacy_welcome_btn_review:
      "Chrome \uC6F9 \uC2A4\uD1A0\uC5B4\uC5D0 \uB9AC\uBDF0 \uB0A8\uAE30\uAE30",
    legacy_thanks_title:
      "\uC5BC\uB9AC \uC11C\uD3EC\uD130 \uC5EC\uB7EC\uBD84 \uAC10\uC0AC\uD569\uB2C8\uB2E4",
    legacy_thanks_message:
      "v{version}\uBD80\uD130 Dog Saver\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC168\uC2B5\uB2C8\uB2E4. Pro\uB294 \uC601\uAD6C\uC801\uC73C\uB85C \uC7A0\uAE08 \uD574\uC81C\uB429\uB2C8\uB2E4 \u2014 \uACB0\uC81C \uBD88\uD544\uC694. \uC774 \uB3C4\uAD6C\uAC00 \uB3C4\uC6C0\uC774 \uB418\uC5C8\uB2E4\uBA74 \uC9E7\uC740 \uB9AC\uBDF0\uAC00 \uBB34\uB8CC \uC720\uC9C0\uC5D0 \uD070 \uD798\uC774 \uB429\uB2C8\uB2E4.",
    legacy_thanks_btn_review: "\uB9AC\uBDF0 \uB0A8\uAE30\uAE30",
    legacy_thanks_btn_done: "\uD655\uC778",
  };
  var Oe = {
    btn_download_all: "Descargar todo",
    aria_download_hd_avatar: "Descargar avatar HD",
    notify_avatar_failed: "No se pudo obtener el avatar HD",
    notify_avatar_success: "Avatar HD descargado",
    aria_download_post: "Descargar esta publicaci\xF3n",
    aria_download_post_zip: "Descargar esta publicaci\xF3n (ZIP)",
    aria_download_reel: "Descargar este Reel",
    tooltip_sponsored_not_downloadable:
      "El contenido patrocinado no se puede descargar",
    notify_post_media_failed:
      "No se pudo obtener el contenido de esta publicaci\xF3n",
    notify_downloaded_n_files_zip: "{count} archivos descargados (ZIP)",
    notify_downloaded_1_file: "1 archivo descargado",
    notify_download_failed: "Error en la descarga: {error}",
    dialog_title: "Descargar @{username}",
    dialog_media_type: "Tipo de contenido",
    dialog_media_all: "Todo (Fotos + Videos)",
    dialog_media_photos: "Solo fotos",
    dialog_media_videos: "Solo videos",
    dialog_save_method: "M\xE9todo de guardado",
    dialog_save_grouped: "Una carpeta por publicaci\xF3n",
    dialog_save_flat: "Todos los archivos en una carpeta",
    dialog_range: "Rango de descarga",
    dialog_range_all: "Descargar todo",
    dialog_range_all_trial_remaining:
      "{base} (prueba gratis: quedan {remaining})",
    dialog_range_topk: "Primeras N publicaciones (m\xE1s recientes)",
    dialog_range_last_n_days: "\xDAltimos N d\xEDas",
    dialog_range_custom: "Rango de fechas personalizado",
    dialog_post_count: "N\xFAmero de publicaciones",
    dialog_recent_days: "D\xEDas recientes",
    dialog_days_7: "7 d\xEDas",
    dialog_days_30: "30 d\xEDas",
    dialog_days_90: "90 d\xEDas",
    dialog_days_180: "180 d\xEDas",
    dialog_start_date: "Fecha de inicio",
    dialog_end_date: "Fecha de fin",
    dialog_btn_start: "Iniciar descarga",
    dialog_btn_cancel: "Cancelar",
    dialog_extras: "Incluir tambi\xE9n",
    dialog_include_highlights: "Todos los destacados",
    dialog_include_stories: "Historias activas (24h)",
    status_scanning: "Escaneando publicaciones...",
    status_posts_found: "0 publicaciones encontradas",
    status_count: "{posts} publicaciones \xB7 {media} archivos",
    status_count_zips: "\xB7 ~{parts} ZIPs",
    status_scanned_to: "Escaneado hasta {date}",
    status_loading_next: "Cargando siguiente p\xE1gina...",
    status_loading_first: "Cargando primera p\xE1gina...",
    status_rate_limited_scroll:
      "L\xEDmite de la API alcanzado, cambiando a modo scroll...",
    status_rate_limited_retry:
      "L\xEDmite de Instagram alcanzado, reintentando en {seconds}s...",
    status_processing: "Procesando...",
    status_waiting_next: "Esperando siguiente p\xE1gina...",
    status_scan_complete: "Escaneo completo, descargas en cola",
    status_saving_scanned: "Guardando contenido escaneado...",
    status_stopped: "Detenido",
    notify_started: "Descarga de @{username} iniciada",
    notify_switched_scroll:
      "L\xEDmite de la API alcanzado, cambiado a modo scroll",
    notify_multi_zip:
      "Los archivos superan {chunkSize}, se dividir\xE1n en m\xFAltiples ZIPs (~{parts} o m\xE1s)",
    notify_found_posts: "{posts} publicaciones encontradas ({media} archivos)",
    notify_error: "Error: {message}",
    notify_pagination_error: "Error de paginaci\xF3n: {message}",
    scroll_loading_more: "Desplazando para cargar m\xE1s publicaciones...",
    scroll_parsing_post:
      "Analizando publicaci\xF3n {current}/{total}: {shortcode}",
    scroll_got_records:
      "{count} registros de publicaciones obtenidos de la p\xE1gina",
    rate_wait: "Demasiadas solicitudes, esperando {seconds}s...",
    parse_html_error:
      "Instagram devolvi\xF3 contenido inesperado. Verifica que hayas iniciado sesi\xF3n y recarga la p\xE1gina.",
    zip_no_files: "No hay archivos descargables en el ZIP",
    aria_download: "Descargar",
    story_download_highlight: "Guardar todo",
    story_download_all: "Guardar todo",
    notify_story_failed: "No se pudo obtener esta historia",
    notify_story_success: "Historia descargada",
    story_downloading: "Descargando...",
    notify_highlight_id_failed: "No se pudo obtener el ID del destacado",
    notify_username_failed: "No se pudo obtener el nombre de usuario",
    notify_user_data_failed:
      "No se pudieron obtener los datos del usuario (posible cuenta privada)",
    notify_highlight_empty: "Este destacado no tiene contenido",
    notify_no_stories: "Este usuario no tiene historias actualmente",
    highlight_untitled: "Destacado sin t\xEDtulo",
    progress_extras_start: "Preparando contenido adicional...",
    progress_stories_fetching: "Obteniendo historias activas...",
    progress_stories_packing:
      "Empaquetando {count} archivos de historias en ZIP...",
    progress_highlights_fetching_tray: "Obteniendo lista de destacados...",
    progress_highlight_fetching: "Destacado {current}/{total}: {title}",
    progress_highlights_packing:
      "Empaquetando {count} archivos de destacados en ZIP...",
    progress_highlights_packing_named:
      "Empaquetando: {title} ({current}/{total})",
    task_label_highlights: "Destacadas",
    task_label_stories: "Historias",
    popup_subtitle: "Descarga masiva de contenido de Instagram",
    popup_empty_title: "No hay tareas de descarga",
    popup_empty_desc: `Ve a un perfil p\xFAblico de Instagram
y haz clic en el bot\xF3n "Descargar todo"`,
    popup_settings: "Configuraci\xF3n",
    popup_settings_advanced: "Avanzado",
    popup_concurrency: "Descargas simult\xE1neas",
    popup_max_retries: "M\xE1x. reintentos",
    popup_zip_chunk: "Tama\xF1o de lote ZIP",
    popup_zip_chunk_tip:
      "N\xFAmero m\xE1ximo de archivos por ZIP. Si la descarga supera este l\xEDmite, se dividir\xE1 en varios ZIPs autom\xE1ticamente.",
    popup_zip_no_split: "No dividir",
    popup_language: "Idioma",
    popup_footer: "Dog Saver v{version} \xB7 Solo local, sin rastreo",
    task_scanning: "Escaneando... {found}",
    task_scanning_found: "{count} archivos encontrados",
    task_batches_done: "{count} lotes completados",
    task_zipping: "Generando ZIP...{percent}",
    task_packing: "Empaquetando {current}/{total} archivos...",
    task_batches_done_parens: "({count} lotes completados)",
    task_creating_zip: "Creando ZIP... {total} archivos",
    task_downloaded: "{done}/{total} archivos descargados",
    task_failed: "{count} fallidos",
    task_in_progress: "{count} en progreso",
    task_zips: "{count} ZIPs",
    task_status_running: "En curso",
    task_status_paused: "En pausa",
    task_status_done: "Completado",
    task_status_stopped: "Detenido",
    task_status_saving: "Guardando...",
    task_status_auto_paused: "En pausa (pesta\xF1a cerrada)",
    status_auto_resume: "Reanudando escaneo de @{username}...",
    task_btn_pause: "Pausar",
    task_btn_resume: "Reanudar",
    task_btn_stop: "Detener",
    task_stop_confirm:
      "\xBFDescargar las {count} publicaciones escaneadas antes de detener?",
    task_stop_download: "Descargar y detener",
    task_stop_discard: "Descartar y detener",
    task_stop_preparing: "Preparando descarga...",
    error_no_avatar_url: "No se encontr\xF3 la URL del avatar",
    error_no_media_items: "No hay contenido multimedia para descargar",
    error_no_story_items: "No hay historias para descargar",
    error_unknown_message: "Tipo de mensaje desconocido",
    error_zip_build_failed: "Error al crear el archivo ZIP",
    btn_download_saved: "Descargar guardados",
    btn_download_collection: "Descargar colecci\xF3n",
    dialog_saved_title: "Descargar publicaciones guardadas",
    dialog_select_collections: "Seleccionar colecciones",
    dialog_select_all: "Seleccionar todo",
    dialog_deselect_all: "Deseleccionar todo",
    dialog_collection_count: "{count} elementos",
    status_collection_progress: "Colecci\xF3n: {name}",
    dialog_saved_folder_mode: "M\xE9todo de guardado",
    dialog_saved_folder_per_post: "Una carpeta por publicaci\xF3n",
    dialog_saved_folder_per_collection: "Una carpeta por colecci\xF3n",
    notify_fetching_collections: "Obteniendo colecciones...",
    notify_no_collections: "No se encontraron colecciones guardadas",
    review_title: "?Te gusta Dog Saver?",
    review_message:
      "Has completado {count} descargas. Si esta herramienta te ha sido util, ?podrias dejarnos una resena en la Chrome Web Store? Tu apoyo nos ayuda a seguir mejorando y mantenerlo gratis para todos.",
    review_btn_rate: "Dejar una resena",
    review_btn_later: "Quiza mas tarde",
    review_btn_never: "No volver a preguntar",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Desbloqueado",
    upgrade_title: "Actualizar a Dog Saver Pro",
    upgrade_title_benefit: "Guarda lo que amas, completamente",
    upgrade_subtitle:
      "Desbloquea descargas masivas ilimitadas y funciones avanzadas",
    upgrade_feature_unlimited: "Descargas masivas de Perfil ilimitadas",
    upgrade_feature_extras:
      "Empaqueta todas las Historias destacadas y Stories en un clic",
    upgrade_feature_saved: "Descarga masiva de m\xFAltiples colecciones",
    upgrade_feature_dates:
      "Rangos de fecha personalizados (90 / 180 d\xEDas / personalizado)",
    compare_header_feature: "Funci\xF3n",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "Descarga individual (Publicaci\xF3n / Reel / Historia)",
    compare_row_highlight: "Highlight individual",
    compare_row_single_collection: "Descarga de una colecci\xF3n",
    compare_row_profile_bulk: "Descarga masiva de Perfil",
    compare_row_profile_bulk_free: "\xDAltimas 30 publicaciones",
    compare_row_profile_bulk_pro: "Ilimitado",
    compare_row_extras: "Empaquetar Historias destacadas y Stories",
    compare_row_saved: "Descarga masiva multi-colecci\xF3n",
    compare_row_dates: "Rangos de fecha personalizados",
    compare_row_dates_pro: "7 / 30 / 90 / Personalizado",
    trust_no_personal_data: "No recopilamos datos personales",
    trust_three_devices: "Licencia para 3 dispositivos",
    upgrade_plan_monthly: "Mensual",
    upgrade_plan_yearly: "Anual",
    upgrade_plan_lifetime: "De por vida",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ mes \xB7 Cancela cuando quieras",
    upgrade_yearly_subtitle: "/ a\xF1o \xB7 Ahorra 58%",
    upgrade_lifetime_subtitle_regular: "Pago \xFAnico \xB7 Para siempre",
    upgrade_lifetime_card_label: "De por vida \xB7 Acceso anticipado",
    upgrade_lifetime_savings: "Pago \xFAnico \xB7 Para siempre",
    upgrade_lifetime_countdown_badge:
      "Limitado -40% \xB7 {days} d\xEDas restantes",
    upgrade_btn_choose: "Elegir plan",
    upgrade_btn_close: "Cerrar",
    have_key_prompt: "\xBFYa compraste?",
    have_key_link: "Ingresar license \u2192",
    gate_topk_limit:
      "La versi\xF3n gratuita est\xE1 limitada a {limit} publicaciones por descarga masiva. Actualiza a Pro.",
    gate_days_limit:
      "La versi\xF3n gratuita est\xE1 limitada a los \xFAltimos {limit} d\xEDas. Pro permite 90 / 180 d\xEDas o rango personalizado.",
    gate_custom_range: "El rango de fecha personalizado es una funci\xF3n Pro.",
    gate_extras:
      "Incluir Destacadas en la descarga de perfil es una funci\xF3n Pro. Las Historias son gratis.",
    gate_all_trial_exhausted:
      'Has usado las {limit} pruebas gratis de "Descargar todo". Actualiza a Pro para descargas ilimitadas.',
    gate_saved_multi:
      "Descargar m\xFAltiples colecciones a la vez es una funci\xF3n Pro. Entra en una sola colecci\xF3n para descargarla gratis.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Versi\xF3n gratuita",
    license_status_pro: "Pro \xB7 Activo",
    license_status_legacy:
      "Pro \xB7 Desbloqueado (Soporte temprano \u2014 \xA1gracias!)",
    license_status_expires: "Expira {date}",
    license_status_lifetime: "Licencia de por vida",
    license_input_placeholder:
      "Pega tu clave de licencia (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Activar",
    license_btn_activating: "Activando...",
    license_btn_copy: "Copiar",
    license_btn_remove_device: "Quitar este dispositivo",
    license_btn_get_pro: "Obtener Pro",
    license_btn_get_pro_cta: "Obtener Pro",
    license_msg_activated: "Pro activado. \xA1Gracias por apoyar Dog Saver!",
    license_msg_activate_failed: "Activaci\xF3n fallida: {error}",
    license_msg_removed:
      "Dispositivo eliminado. Licencia borrada de este navegador.",
    license_msg_limit_reached_title: "L\xEDmite de activaci\xF3n alcanzado",
    license_msg_limit_reached_body:
      'Esta licencia ya est\xE1 activada en 3 dispositivos. Abre Dog Saver en otro dispositivo y haz clic en "Quitar este dispositivo" para liberar un espacio.',
    license_help_switch_device:
      "\xBFCambias de ordenador? Copia la clave de arriba y p\xE9gala en el nuevo dispositivo.",
    license_help_portal:
      "Gestionar suscripci\xF3n / restablecer dispositivos en el Portal del Cliente",
    legacy_welcome_title: "Gracias, colaborador temprano",
    legacy_welcome_body:
      "Has usado Dog Saver desde v{version}. Pro est\xE1 desbloqueado permanentemente en esta instalaci\xF3n \u2014 sin pago requerido.",
    legacy_welcome_warning:
      "Como no recopilamos informaci\xF3n personal, tu estado de colaborador temprano est\xE1 vinculado a esta instalaci\xF3n de Chrome. Desinstalar Dog Saver puede hacer que lo pierdas.",
    legacy_welcome_btn_done: "Entendido",
    legacy_welcome_btn_review: "Dejar una rese\xF1a en Chrome Web Store",
    legacy_thanks_title: "Gracias, colaborador temprano",
    legacy_thanks_message:
      "Has usado Dog Saver desde v{version}. Pro est\xE1 desbloqueado permanentemente \u2014 sin pago necesario. Si esta herramienta te ha ayudado, una rese\xF1a r\xE1pida nos ayuda a mantenerla gratuita.",
    legacy_thanks_btn_review: "Dejar una rese\xF1a",
    legacy_thanks_btn_done: "Entendido",
  };
  var Be = {
    btn_download_all: "Baixar tudo",
    aria_download_hd_avatar: "Baixar avatar HD",
    notify_avatar_failed: "N\xE3o foi poss\xEDvel obter o avatar HD",
    notify_avatar_success: "Avatar HD baixado",
    aria_download_post: "Baixar esta publica\xE7\xE3o",
    aria_download_post_zip: "Baixar esta publica\xE7\xE3o (ZIP)",
    aria_download_reel: "Baixar este Reel",
    tooltip_sponsored_not_downloadable:
      "Conte\xFAdo patrocinado n\xE3o pode ser baixado",
    notify_post_media_failed:
      "N\xE3o foi poss\xEDvel obter a m\xEDdia desta publica\xE7\xE3o",
    notify_downloaded_n_files_zip: "{count} arquivos baixados (ZIP)",
    notify_downloaded_1_file: "1 arquivo baixado",
    notify_download_failed: "Falha no download: {error}",
    dialog_title: "Baixar @{username}",
    dialog_media_type: "Tipo de m\xEDdia",
    dialog_media_all: "Tudo (Fotos + V\xEDdeos)",
    dialog_media_photos: "Apenas fotos",
    dialog_media_videos: "Apenas v\xEDdeos",
    dialog_save_method: "M\xE9todo de salvamento",
    dialog_save_grouped: "Uma pasta por publica\xE7\xE3o",
    dialog_save_flat: "Todos os arquivos em uma pasta",
    dialog_range: "Intervalo de download",
    dialog_range_all: "Baixar tudo",
    dialog_range_all_trial_remaining:
      "{base} (teste gr\xE1tis: {remaining} restantes)",
    dialog_range_topk: "Primeiras N publica\xE7\xF5es (mais recentes)",
    dialog_range_last_n_days: "\xDAltimos N dias",
    dialog_range_custom: "Intervalo de datas personalizado",
    dialog_post_count: "N\xFAmero de publica\xE7\xF5es",
    dialog_recent_days: "Dias recentes",
    dialog_days_7: "7 dias",
    dialog_days_30: "30 dias",
    dialog_days_90: "90 dias",
    dialog_days_180: "180 dias",
    dialog_start_date: "Data inicial",
    dialog_end_date: "Data final",
    dialog_btn_start: "Iniciar download",
    dialog_btn_cancel: "Cancelar",
    dialog_extras: "Incluir tamb\xE9m",
    dialog_include_highlights: "Todos os destaques",
    dialog_include_stories: "Stories ativos (24h)",
    status_scanning: "Escaneando publica\xE7\xF5es...",
    status_posts_found: "0 publica\xE7\xF5es encontradas",
    status_count: "{posts} publica\xE7\xF5es \xB7 {media} arquivos",
    status_count_zips: "\xB7 ~{parts} ZIPs",
    status_scanned_to: "Escaneado at\xE9 {date}",
    status_loading_next: "Carregando pr\xF3xima p\xE1gina...",
    status_loading_first: "Carregando primeira p\xE1gina...",
    status_rate_limited_scroll:
      "Limite da API atingido, mudando para modo scroll...",
    status_rate_limited_retry:
      "Limite do Instagram atingido, tentando novamente em {seconds}s...",
    status_processing: "Processando...",
    status_waiting_next: "Aguardando pr\xF3xima p\xE1gina...",
    status_scan_complete: "Escaneamento conclu\xEDdo, downloads na fila",
    status_saving_scanned: "Salvando conte\xFAdo escaneado...",
    status_stopped: "Parado",
    notify_started: "Download de @{username} iniciado",
    notify_switched_scroll: "Limite da API atingido, mudou para modo scroll",
    notify_multi_zip:
      "Arquivos excedem {chunkSize}, ser\xE3o divididos em m\xFAltiplos ZIPs (~{parts} ou mais)",
    notify_found_posts:
      "{posts} publica\xE7\xF5es encontradas ({media} arquivos)",
    notify_error: "Erro: {message}",
    notify_pagination_error: "Erro de pagina\xE7\xE3o: {message}",
    scroll_loading_more: "Rolando para carregar mais publica\xE7\xF5es...",
    scroll_parsing_post:
      "Analisando publica\xE7\xE3o {current}/{total}: {shortcode}",
    scroll_got_records:
      "{count} registros de publica\xE7\xF5es obtidos da p\xE1gina",
    rate_wait: "Muitas solicita\xE7\xF5es, aguardando {seconds}s...",
    parse_html_error:
      "O Instagram retornou conte\xFAdo inesperado. Verifique se voc\xEA est\xE1 logado e atualize a p\xE1gina.",
    zip_no_files: "Nenhum arquivo para baixar no ZIP",
    aria_download: "Baixar",
    story_download_highlight: "Salvar tudo",
    story_download_all: "Salvar tudo",
    notify_story_failed: "N\xE3o foi poss\xEDvel obter este story",
    notify_story_success: "Story baixado",
    story_downloading: "Baixando...",
    notify_highlight_id_failed: "N\xE3o foi poss\xEDvel obter o ID do destaque",
    notify_username_failed: "N\xE3o foi poss\xEDvel obter o nome de usu\xE1rio",
    notify_user_data_failed:
      "N\xE3o foi poss\xEDvel obter os dados do usu\xE1rio (poss\xEDvel conta privada)",
    notify_highlight_empty: "Este destaque n\xE3o tem conte\xFAdo",
    notify_no_stories: "Este usu\xE1rio n\xE3o tem stories no momento",
    highlight_untitled: "Destaque sem t\xEDtulo",
    progress_extras_start: "Preparando conte\xFAdo adicional...",
    progress_stories_fetching: "Obtendo stories ativos...",
    progress_stories_packing:
      "Empacotando {count} arquivos de stories em ZIP...",
    progress_highlights_fetching_tray: "Obtendo lista de destaques...",
    progress_highlight_fetching: "Destaque {current}/{total}: {title}",
    progress_highlights_packing:
      "Empacotando {count} arquivos de destaques em ZIP...",
    progress_highlights_packing_named:
      "Empacotando: {title} ({current}/{total})",
    task_label_highlights: "Destaques",
    task_label_stories: "Hist\xF3rias",
    popup_subtitle: "Download em massa de m\xEDdia do Instagram",
    popup_empty_title: "Nenhuma tarefa de download",
    popup_empty_desc: `V\xE1 para um perfil p\xFAblico do Instagram
e clique no bot\xE3o "Baixar tudo"`,
    popup_settings: "Configura\xE7\xF5es",
    popup_settings_advanced: "Avan\xE7ado",
    popup_concurrency: "Downloads simult\xE2neos",
    popup_max_retries: "M\xE1x. tentativas",
    popup_zip_chunk: "Tamanho do lote ZIP",
    popup_zip_chunk_tip:
      "N\xFAmero m\xE1ximo de arquivos por ZIP. Quando o download exceder esse limite, ser\xE1 dividido em v\xE1rios ZIPs automaticamente.",
    popup_zip_no_split: "N\xE3o dividir",
    popup_language: "Idioma",
    popup_footer: "Dog Saver v{version} \xB7 Apenas local, sem rastreamento",
    task_scanning: "Escaneando... {found}",
    task_scanning_found: "{count} arquivos encontrados",
    task_batches_done: "{count} lotes conclu\xEDdos",
    task_zipping: "Gerando ZIP...{percent}",
    task_packing: "Empacotando {current}/{total} arquivos...",
    task_batches_done_parens: "({count} lotes conclu\xEDdos)",
    task_creating_zip: "Criando ZIP... {total} arquivos",
    task_downloaded: "{done}/{total} arquivos baixados",
    task_failed: "{count} falharam",
    task_in_progress: "{count} em progresso",
    task_zips: "{count} ZIPs",
    task_status_running: "Em execu\xE7\xE3o",
    task_status_paused: "Pausado",
    task_status_done: "Conclu\xEDdo",
    task_status_stopped: "Parado",
    task_status_saving: "Salvando...",
    task_status_auto_paused: "Pausado (aba fechada)",
    status_auto_resume: "Retomando escaneamento de @{username}...",
    task_btn_pause: "Pausar",
    task_btn_resume: "Retomar",
    task_btn_stop: "Parar",
    task_stop_confirm:
      "Baixar as {count} publica\xE7\xF5es escaneadas antes de parar?",
    task_stop_download: "Baixar e parar",
    task_stop_discard: "Descartar e parar",
    task_stop_preparing: "Preparando download...",
    error_no_avatar_url: "URL do avatar n\xE3o encontrada",
    error_no_media_items: "Nenhuma m\xEDdia para baixar",
    error_no_story_items: "Nenhum story para baixar",
    error_unknown_message: "Tipo de mensagem desconhecido",
    error_zip_build_failed: "Falha ao criar o arquivo ZIP",
    btn_download_saved: "Baixar salvos",
    btn_download_collection: "Baixar cole\xE7\xE3o",
    dialog_saved_title: "Baixar publica\xE7\xF5es salvas",
    dialog_select_collections: "Selecionar cole\xE7\xF5es",
    dialog_select_all: "Selecionar tudo",
    dialog_deselect_all: "Desmarcar tudo",
    dialog_collection_count: "{count} itens",
    status_collection_progress: "Cole\xE7\xE3o: {name}",
    dialog_saved_folder_mode: "M\xE9todo de salvamento",
    dialog_saved_folder_per_post: "Uma pasta por publica\xE7\xE3o",
    dialog_saved_folder_per_collection: "Uma pasta por cole\xE7\xE3o",
    notify_fetching_collections: "Obtendo cole\xE7\xF5es...",
    notify_no_collections: "Nenhuma cole\xE7\xE3o salva encontrada",
    review_title: "Curtindo o Dog Saver?",
    review_message:
      "Voce ja concluiu {count} downloads! Se esta ferramenta tem sido util, poderia deixar uma avaliacao na Chrome Web Store? Seu apoio nos ajuda a continuar melhorando e manter tudo gratuito.",
    review_btn_rate: "Deixar uma avaliacao",
    review_btn_later: "Talvez depois",
    review_btn_never: "Nao perguntar novamente",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Desbloqueado",
    upgrade_title: "Atualizar para Dog Saver Pro",
    upgrade_title_benefit: "Salve o que voc\xEA ama, completamente",
    upgrade_subtitle:
      "Desbloqueie downloads em massa ilimitados e recursos avan\xE7ados",
    upgrade_feature_unlimited: "Downloads em massa de Perfil ilimitados",
    upgrade_feature_extras:
      "Empacote todos os Destaques e Stories em um clique",
    upgrade_feature_saved: "Download em massa de m\xFAltiplas cole\xE7\xF5es",
    upgrade_feature_dates:
      "Intervalos de data personalizados (90 / 180 dias / personalizado)",
    compare_header_feature: "Recurso",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Download individual (Post / Reel / Story)",
    compare_row_highlight: "Highlight individual",
    compare_row_single_collection: "Download de uma cole\xE7\xE3o",
    compare_row_profile_bulk: "Download em massa do Perfil",
    compare_row_profile_bulk_free: "\xDAltimos 30 posts",
    compare_row_profile_bulk_pro: "Ilimitado",
    compare_row_extras: "Empacotar Destaques e Stories",
    compare_row_saved: "M\xFAltiplas cole\xE7\xF5es em massa",
    compare_row_dates: "Intervalos de data personalizados",
    compare_row_dates_pro: "7 / 30 / 90 / Personalizado",
    trust_no_personal_data: "N\xE3o coletamos dados pessoais",
    trust_three_devices: "Licen\xE7a para 3 dispositivos",
    upgrade_plan_monthly: "Mensal",
    upgrade_plan_yearly: "Anual",
    upgrade_plan_lifetime: "Vital\xEDcio",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ m\xEAs \xB7 Cancele quando quiser",
    upgrade_yearly_subtitle: "/ ano \xB7 Economize 58%",
    upgrade_lifetime_subtitle_regular: "Pagamento \xFAnico \xB7 Para sempre",
    upgrade_lifetime_card_label: "Vital\xEDcio \xB7 Acesso antecipado",
    upgrade_lifetime_savings: "Pagamento \xFAnico \xB7 Para sempre",
    upgrade_lifetime_countdown_badge:
      "Limitado -40% \xB7 {days} dias restantes",
    upgrade_btn_choose: "Escolher plano",
    upgrade_btn_close: "Fechar",
    have_key_prompt: "J\xE1 comprou?",
    have_key_link: "Inserir license \u2192",
    gate_topk_limit:
      "A vers\xE3o gratuita \xE9 limitada a {limit} posts por download em massa. Atualize para Pro.",
    gate_days_limit:
      "A vers\xE3o gratuita \xE9 limitada aos \xFAltimos {limit} dias. Pro permite 90 / 180 dias ou intervalo personalizado.",
    gate_custom_range: "Intervalo de data personalizado \xE9 um recurso Pro.",
    gate_extras:
      "Incluir Destaques no download do perfil \xE9 um recurso Pro. Stories (24h) s\xE3o gr\xE1tis.",
    gate_all_trial_exhausted:
      'Voc\xEA usou os {limit} testes gr\xE1tis de "Baixar tudo". Atualize para Pro para downloads ilimitados.',
    gate_saved_multi:
      "Baixar v\xE1rias cole\xE7\xF5es de uma vez \xE9 um recurso Pro. Entre em uma \xFAnica cole\xE7\xE3o para baixar gr\xE1tis.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Vers\xE3o gratuita",
    license_status_pro: "Pro \xB7 Ativo",
    license_status_legacy:
      "Pro \xB7 Desbloqueado (Apoiador inicial \u2014 obrigado!)",
    license_status_expires: "Expira em {date}",
    license_status_lifetime: "Licen\xE7a vital\xEDcia",
    license_input_placeholder:
      "Cole sua chave de licen\xE7a (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Ativar",
    license_btn_activating: "Ativando...",
    license_btn_copy: "Copiar",
    license_btn_remove_device: "Remover este dispositivo",
    license_btn_get_pro: "Obter Pro",
    license_btn_get_pro_cta: "Obter Pro",
    license_msg_activated: "Pro ativado. Obrigado por apoiar o Dog Saver!",
    license_msg_activate_failed: "Falha na ativa\xE7\xE3o: {error}",
    license_msg_removed:
      "Dispositivo removido. Licen\xE7a removida deste navegador.",
    license_msg_limit_reached_title: "Limite de ativa\xE7\xE3o atingido",
    license_msg_limit_reached_body:
      'Esta licen\xE7a j\xE1 est\xE1 ativada em 3 dispositivos. Abra o Dog Saver em outro dispositivo e clique em "Remover este dispositivo" para liberar um slot.',
    license_help_switch_device:
      "Trocando de computador? Copie a chave acima e cole no novo dispositivo.",
    license_help_portal:
      "Gerenciar assinatura / resetar dispositivos no Portal do Cliente",
    legacy_welcome_title: "Obrigado, apoiador inicial",
    legacy_welcome_body:
      "Voc\xEA usa o Dog Saver desde v{version}. O Pro est\xE1 permanentemente desbloqueado nesta instala\xE7\xE3o \u2014 sem pagamento necess\xE1rio.",
    legacy_welcome_warning:
      "Como n\xE3o coletamos informa\xE7\xF5es pessoais, seu status de apoiador inicial est\xE1 vinculado a esta instala\xE7\xE3o do Chrome. Desinstalar o Dog Saver pode resultar na perda desse status.",
    legacy_welcome_btn_done: "Entendido",
    legacy_welcome_btn_review: "Deixar uma avalia\xE7\xE3o na Chrome Web Store",
    legacy_thanks_title: "Obrigado, apoiador inicial",
    legacy_thanks_message:
      "Voc\xEA usa o Dog Saver desde v{version}. O Pro est\xE1 permanentemente desbloqueado \u2014 sem pagamento. Se esta ferramenta te ajudou, uma avalia\xE7\xE3o r\xE1pida nos ajuda a mant\xEA-la gratuita.",
    legacy_thanks_btn_review: "Deixar uma avalia\xE7\xE3o",
    legacy_thanks_btn_done: "Entendido",
  };
  var Fe = {
    btn_download_all: "Tout t\xE9l\xE9charger",
    aria_download_hd_avatar: "T\xE9l\xE9charger l'avatar HD",
    notify_avatar_failed: "Impossible d'obtenir l'avatar HD",
    notify_avatar_success: "Avatar HD t\xE9l\xE9charg\xE9",
    aria_download_post: "T\xE9l\xE9charger cette publication",
    aria_download_post_zip: "T\xE9l\xE9charger cette publication (ZIP)",
    aria_download_reel: "T\xE9l\xE9charger ce Reel",
    tooltip_sponsored_not_downloadable:
      "Le contenu sponsoris\xE9 ne peut pas \xEAtre t\xE9l\xE9charg\xE9",
    notify_post_media_failed:
      "Impossible d'obtenir le m\xE9dia de cette publication",
    notify_downloaded_n_files_zip:
      "{count} fichiers t\xE9l\xE9charg\xE9s (ZIP)",
    notify_downloaded_1_file: "1 fichier t\xE9l\xE9charg\xE9",
    notify_download_failed: "\xC9chec du t\xE9l\xE9chargement : {error}",
    dialog_title: "T\xE9l\xE9charger @{username}",
    dialog_media_type: "Type de m\xE9dia",
    dialog_media_all: "Tout (Photos + Vid\xE9os)",
    dialog_media_photos: "Photos uniquement",
    dialog_media_videos: "Vid\xE9os uniquement",
    dialog_save_method: "M\xE9thode de sauvegarde",
    dialog_save_grouped: "Un dossier par publication",
    dialog_save_flat: "Tous les fichiers dans un dossier",
    dialog_range: "Plage de t\xE9l\xE9chargement",
    dialog_range_all: "Tout t\xE9l\xE9charger",
    dialog_range_all_trial_remaining:
      "{base} (essai gratuit : {remaining} restants)",
    dialog_range_topk: "N premi\xE8res publications (plus r\xE9centes)",
    dialog_range_last_n_days: "N derniers jours",
    dialog_range_custom: "Plage de dates personnalis\xE9e",
    dialog_post_count: "Nombre de publications",
    dialog_recent_days: "Jours r\xE9cents",
    dialog_days_7: "7 jours",
    dialog_days_30: "30 jours",
    dialog_days_90: "90 jours",
    dialog_days_180: "180 jours",
    dialog_start_date: "Date de d\xE9but",
    dialog_end_date: "Date de fin",
    dialog_btn_start: "D\xE9marrer le t\xE9l\xE9chargement",
    dialog_btn_cancel: "Annuler",
    dialog_extras: "Inclure aussi",
    dialog_include_highlights: "Toutes les stories \xE0 la une",
    dialog_include_stories: "Stories actives (24h)",
    status_scanning: "Analyse des publications...",
    status_posts_found: "0 publications trouv\xE9es",
    status_count: "{posts} publications \xB7 {media} fichiers",
    status_count_zips: "\xB7 ~{parts} ZIPs",
    status_scanned_to: "Analys\xE9 jusqu'au {date}",
    status_loading_next: "Chargement de la page suivante...",
    status_loading_first: "Chargement de la premi\xE8re page...",
    status_rate_limited_scroll: "Limite API, passage en mode d\xE9filement...",
    status_rate_limited_retry:
      "Limite Instagram, nouvel essai dans {seconds}s...",
    status_processing: "Traitement en cours...",
    status_waiting_next: "En attente de la page suivante...",
    status_scan_complete:
      "Analyse termin\xE9e, t\xE9l\xE9chargements en file d'attente",
    status_saving_scanned: "Sauvegarde du contenu analys\xE9...",
    status_stopped: "Arr\xEAt\xE9",
    notify_started: "T\xE9l\xE9chargement de @{username} d\xE9marr\xE9",
    notify_switched_scroll: "Limite API, bascul\xE9 en mode d\xE9filement",
    notify_multi_zip:
      "Les fichiers d\xE9passent {chunkSize}, division en plusieurs ZIPs (~{parts} ou plus)",
    notify_found_posts: "{posts} publications trouv\xE9es ({media} fichiers)",
    notify_error: "Erreur : {message}",
    notify_pagination_error: "Erreur de pagination : {message}",
    scroll_loading_more: "D\xE9filement pour charger plus de publications...",
    scroll_parsing_post:
      "Analyse de la publication {current}/{total} : {shortcode}",
    scroll_got_records:
      "{count} enregistrements de publications obtenus de la page",
    rate_wait: "Requ\xEAtes trop fr\xE9quentes, attente de {seconds}s...",
    parse_html_error:
      "Instagram a retourn\xE9 un contenu inattendu. V\xE9rifiez que vous \xEAtes connect\xE9 et actualisez la page.",
    zip_no_files: "Aucun fichier t\xE9l\xE9chargeable dans le ZIP",
    aria_download: "T\xE9l\xE9charger",
    story_download_highlight: "Tout sauver",
    story_download_all: "Tout sauver",
    notify_story_failed: "Impossible d'obtenir cette story",
    notify_story_success: "Story t\xE9l\xE9charg\xE9e",
    story_downloading: "T\xE9l\xE9chargement...",
    notify_highlight_id_failed:
      "Impossible d'obtenir l'ID de la story \xE0 la une",
    notify_username_failed: "Impossible d'obtenir le nom d'utilisateur",
    notify_user_data_failed:
      "Impossible d'obtenir les donn\xE9es utilisateur (compte priv\xE9 possible)",
    notify_highlight_empty: "Cette story \xE0 la une n'a pas de contenu",
    notify_no_stories: "Cet utilisateur n'a pas de stories actuellement",
    highlight_untitled: "Story \xE0 la une sans titre",
    progress_extras_start: "Pr\xE9paration du contenu suppl\xE9mentaire...",
    progress_stories_fetching: "R\xE9cup\xE9ration des stories actives...",
    progress_stories_packing:
      "Cr\xE9ation du ZIP avec {count} fichiers de stories...",
    progress_highlights_fetching_tray:
      "R\xE9cup\xE9ration de la liste des stories \xE0 la une...",
    progress_highlight_fetching:
      "Story \xE0 la une {current}/{total} : {title}",
    progress_highlights_packing:
      "Cr\xE9ation du ZIP avec {count} fichiers de stories \xE0 la une...",
    progress_highlights_packing_named:
      "Empaquetage : {title} ({current}/{total})",
    task_label_highlights: "\xC0 la une",
    task_label_stories: "Stories",
    popup_subtitle: "T\xE9l\xE9chargement en masse de m\xE9dias Instagram",
    popup_empty_title: "Aucune t\xE2che de t\xE9l\xE9chargement",
    popup_empty_desc: `Allez sur un profil Instagram public
et cliquez sur le bouton "Tout t\xE9l\xE9charger"`,
    popup_settings: "Param\xE8tres",
    popup_settings_advanced: "Avanc\xE9",
    popup_concurrency: "T\xE9l\xE9chargements simultan\xE9s",
    popup_max_retries: "Tentatives max.",
    popup_zip_chunk: "Taille de lot ZIP",
    popup_zip_chunk_tip:
      "Nombre maximum de fichiers par ZIP. Si le t\xE9l\xE9chargement d\xE9passe cette limite, il sera automatiquement divis\xE9 en plusieurs ZIPs.",
    popup_zip_no_split: "Ne pas diviser",
    popup_language: "Langue",
    popup_footer: "Dog Saver v{version} \xB7 Local uniquement, sans suivi",
    task_scanning: "Analyse... {found}",
    task_scanning_found: "{count} fichiers trouv\xE9s",
    task_batches_done: "{count} lots termin\xE9s",
    task_zipping: "G\xE9n\xE9ration ZIP...{percent}",
    task_packing: "Empaquetage de {current}/{total} fichiers...",
    task_batches_done_parens: "({count} lots termin\xE9s)",
    task_creating_zip: "Cr\xE9ation ZIP... {total} fichiers",
    task_downloaded: "{done}/{total} fichiers t\xE9l\xE9charg\xE9s",
    task_failed: "{count} \xE9chou\xE9s",
    task_in_progress: "{count} en cours",
    task_zips: "{count} ZIPs",
    task_status_running: "En cours",
    task_status_paused: "En pause",
    task_status_done: "Termin\xE9",
    task_status_stopped: "Arr\xEAt\xE9",
    task_status_saving: "Enregistrement...",
    task_status_auto_paused: "En pause (onglet ferm\xE9)",
    status_auto_resume: "Reprise du scan pour @{username}...",
    task_btn_pause: "Pause",
    task_btn_resume: "Reprendre",
    task_btn_stop: "Arr\xEAter",
    task_stop_confirm:
      "T\xE9l\xE9charger les {count} publications scann\xE9es avant d'arr\xEAter ?",
    task_stop_download: "T\xE9l\xE9charger et arr\xEAter",
    task_stop_discard: "Supprimer et arr\xEAter",
    task_stop_preparing: "Pr\xE9paration du t\xE9l\xE9chargement...",
    error_no_avatar_url: "URL de l'avatar introuvable",
    error_no_media_items: "Aucun m\xE9dia \xE0 t\xE9l\xE9charger",
    error_no_story_items: "Aucune story \xE0 t\xE9l\xE9charger",
    error_unknown_message: "Type de message inconnu",
    error_zip_build_failed: "\xC9chec de la cr\xE9ation du fichier ZIP",
    btn_download_saved: "T\xE9l\xE9charger les enregistrements",
    btn_download_collection: "T\xE9l\xE9charger la collection",
    dialog_saved_title: "T\xE9l\xE9charger les publications enregistr\xE9es",
    dialog_select_collections: "S\xE9lectionner les collections",
    dialog_select_all: "Tout s\xE9lectionner",
    dialog_deselect_all: "Tout d\xE9s\xE9lectionner",
    dialog_collection_count: "{count} \xE9l\xE9ments",
    status_collection_progress: "Collection : {name}",
    dialog_saved_folder_mode: "M\xE9thode de sauvegarde",
    dialog_saved_folder_per_post: "Un dossier par publication",
    dialog_saved_folder_per_collection: "Un dossier par collection",
    notify_fetching_collections: "R\xE9cup\xE9ration des collections...",
    notify_no_collections: "Aucune collection enregistr\xE9e trouv\xE9e",
    review_title: "Vous aimez Dog Saver ?",
    review_message:
      "Vous avez effectu\xE9 {count} t\xE9l\xE9chargements ! Si cet outil vous a \xE9t\xE9 utile, pourriez-vous laisser un avis sur le Chrome Web Store ? Votre soutien nous aide \xE0 continuer d'am\xE9liorer Dog Saver et \xE0 le garder gratuit pour tous.",
    review_btn_rate: "Laisser un avis",
    review_btn_later: "Peut-\xEAtre plus tard",
    review_btn_never: "Ne plus demander",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 D\xE9bloqu\xE9",
    upgrade_title: "Passer \xE0 Dog Saver Pro",
    upgrade_title_benefit: "Sauvegardez ce que vous aimez, enti\xE8rement",
    upgrade_subtitle:
      "D\xE9bloquez les t\xE9l\xE9chargements group\xE9s illimit\xE9s et les fonctions avanc\xE9es",
    upgrade_feature_unlimited:
      "T\xE9l\xE9chargements group\xE9s de profil illimit\xE9s",
    upgrade_feature_extras:
      "R\xE9cup\xE9rez tous les Highlights & Stories en un clic",
    upgrade_feature_saved: "T\xE9l\xE9chargement group\xE9 multi-collections",
    upgrade_feature_dates:
      "Plages de dates personnalis\xE9es (90 / 180 jours / personnalis\xE9)",
    compare_header_feature: "Fonctionnalit\xE9",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "T\xE9l\xE9chargement individuel (Post / Reel / Story)",
    compare_row_highlight: "Highlight individuel",
    compare_row_single_collection: "T\xE9l\xE9chargement d'une collection",
    compare_row_profile_bulk: "T\xE9l\xE9chargement group\xE9 du Profil",
    compare_row_profile_bulk_free: "Les 30 derni\xE8res publications",
    compare_row_profile_bulk_pro: "Illimit\xE9",
    compare_row_extras: "Grouper Highlights & Stories",
    compare_row_saved: "Multi-collections en masse",
    compare_row_dates: "Plages de dates personnalis\xE9es",
    compare_row_dates_pro: "7 / 30 / 90 / Personnalis\xE9",
    trust_no_personal_data: "Nous ne collectons pas de donn\xE9es personnelles",
    trust_three_devices: "Licence 3 appareils",
    upgrade_plan_monthly: "Mensuel",
    upgrade_plan_yearly: "Annuel",
    upgrade_plan_lifetime: "\xC0 vie",
    upgrade_price_monthly: "3,99 $",
    upgrade_price_yearly: "19,99 $",
    upgrade_price_lifetime: "24,99 $",
    upgrade_price_lifetime_early: "14,99 $",
    upgrade_monthly_subtitle: "/ mois \xB7 Annulez \xE0 tout moment",
    upgrade_yearly_subtitle: "/ an \xB7 \xC9conomisez 58 %",
    upgrade_lifetime_subtitle_regular: "Paiement unique \xB7 \xC0 vie",
    upgrade_lifetime_card_label: "\xC0 vie \xB7 Acc\xE8s anticip\xE9",
    upgrade_lifetime_savings: "Paiement unique \xB7 \xC0 vie",
    upgrade_lifetime_countdown_badge:
      "Limit\xE9 -40 % \xB7 {days} jours restants",
    upgrade_btn_choose: "Choisir un plan",
    upgrade_btn_close: "Fermer",
    have_key_prompt: "D\xE9j\xE0 achet\xE9 ?",
    have_key_link: "Entrer la license \u2192",
    gate_topk_limit:
      "La version gratuite est limit\xE9e \xE0 {limit} publications par t\xE9l\xE9chargement group\xE9. Passez \xE0 Pro.",
    gate_days_limit:
      "La version gratuite est limit\xE9e aux {limit} derniers jours. Pro permet 90 / 180 jours ou plage personnalis\xE9e.",
    gate_custom_range:
      "La plage de dates personnalis\xE9e est une fonction Pro.",
    gate_extras:
      "Inclure les Stories \xE0 la une dans le t\xE9l\xE9chargement du profil est une fonctionnalit\xE9 Pro. Les Stories (24h) sont gratuites.",
    gate_all_trial_exhausted:
      'Vous avez utilis\xE9 vos {limit} essais gratuits de "Tout t\xE9l\xE9charger". Passez \xE0 Pro pour des t\xE9l\xE9chargements illimit\xE9s.',
    gate_saved_multi:
      "T\xE9l\xE9charger plusieurs collections en une fois est une fonction Pro. Entrez dans une seule collection pour la t\xE9l\xE9charger gratuitement.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Version gratuite",
    license_status_pro: "Pro \xB7 Actif",
    license_status_legacy:
      "Pro \xB7 D\xE9bloqu\xE9 (Soutien pr\xE9coce \u2014 merci !)",
    license_status_expires: "Expire le {date}",
    license_status_lifetime: "Licence \xE0 vie",
    license_input_placeholder:
      "Collez votre cl\xE9 de licence (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Activer",
    license_btn_activating: "Activation...",
    license_btn_copy: "Copier",
    license_btn_remove_device: "Retirer cet appareil",
    license_btn_get_pro: "Obtenir Pro",
    license_btn_get_pro_cta: "Obtenir Pro",
    license_msg_activated: "Pro activ\xE9. Merci de soutenir Dog Saver !",
    license_msg_activate_failed: "\xC9chec de l'activation : {error}",
    license_msg_removed:
      "Appareil retir\xE9. Licence supprim\xE9e de ce navigateur.",
    license_msg_limit_reached_title: "Limite d'activation atteinte",
    license_msg_limit_reached_body:
      "Cette licence est d\xE9j\xE0 activ\xE9e sur 3 appareils. Ouvrez Dog Saver sur un autre appareil et cliquez sur \xAB Retirer cet appareil \xBB pour lib\xE9rer un emplacement.",
    license_help_switch_device:
      "Vous changez d'ordinateur ? Copiez la cl\xE9 ci-dessus et collez-la sur le nouvel appareil.",
    license_help_portal:
      "G\xE9rer l'abonnement / r\xE9initialiser les appareils dans le Portail Client",
    legacy_welcome_title: "Merci, premier soutien",
    legacy_welcome_body:
      "Vous utilisez Dog Saver depuis v{version}. Pro est d\xE9bloqu\xE9 d\xE9finitivement sur cette installation \u2014 aucun paiement requis.",
    legacy_welcome_warning:
      "Comme nous ne collectons aucune information personnelle, votre statut de premier soutien est li\xE9 \xE0 cette installation de Chrome. D\xE9sinstaller Dog Saver peut vous faire perdre ce statut.",
    legacy_welcome_btn_done: "Compris",
    legacy_welcome_btn_review: "Laisser un avis sur Chrome Web Store",
    legacy_thanks_title: "Merci, premier soutien",
    legacy_thanks_message:
      "Vous utilisez Dog Saver depuis v{version}. Pro est d\xE9bloqu\xE9 d\xE9finitivement \u2014 sans paiement. Si cet outil vous a \xE9t\xE9 utile, un avis rapide nous aide \xE0 le garder gratuit.",
    legacy_thanks_btn_review: "Laisser un avis",
    legacy_thanks_btn_done: "Compris",
  };
  var Ue = {
    btn_download_all: "Alle herunterladen",
    aria_download_hd_avatar: "HD-Avatar herunterladen",
    notify_avatar_failed: "HD-Avatar konnte nicht abgerufen werden",
    notify_avatar_success: "HD-Avatar heruntergeladen",
    aria_download_post: "Diesen Beitrag herunterladen",
    aria_download_post_zip: "Diesen Beitrag herunterladen (ZIP)",
    aria_download_reel: "Dieses Reel herunterladen",
    tooltip_sponsored_not_downloadable:
      "Gesponserte Inhalte k\xF6nnen nicht heruntergeladen werden",
    notify_post_media_failed:
      "Medien dieses Beitrags konnten nicht abgerufen werden",
    notify_downloaded_n_files_zip: "{count} Dateien heruntergeladen (ZIP)",
    notify_downloaded_1_file: "1 Datei heruntergeladen",
    notify_download_failed: "Download fehlgeschlagen: {error}",
    dialog_title: "@{username} herunterladen",
    dialog_media_type: "Medientyp",
    dialog_media_all: "Alle (Fotos + Videos)",
    dialog_media_photos: "Nur Fotos",
    dialog_media_videos: "Nur Videos",
    dialog_save_method: "Speichermethode",
    dialog_save_grouped: "Ein Ordner pro Beitrag",
    dialog_save_flat: "Alle Dateien in einem Ordner",
    dialog_range: "Download-Bereich",
    dialog_range_all: "Alles herunterladen",
    dialog_range_all_trial_remaining:
      "{base} (kostenlose Testversion: {remaining} \xFCbrig)",
    dialog_range_topk: "Erste N Beitr\xE4ge (neueste zuerst)",
    dialog_range_last_n_days: "Letzte N Tage",
    dialog_range_custom: "Benutzerdefinierter Zeitraum",
    dialog_post_count: "Anzahl der Beitr\xE4ge",
    dialog_recent_days: "Letzte Tage",
    dialog_days_7: "7 Tage",
    dialog_days_30: "30 Tage",
    dialog_days_90: "90 Tage",
    dialog_days_180: "180 Tage",
    dialog_start_date: "Startdatum",
    dialog_end_date: "Enddatum",
    dialog_btn_start: "Download starten",
    dialog_btn_cancel: "Abbrechen",
    dialog_extras: "Auch einschlie\xDFen",
    dialog_include_highlights: "Alle Highlights",
    dialog_include_stories: "Aktive Stories (24h)",
    status_scanning: "Beitr\xE4ge werden gescannt...",
    status_posts_found: "0 Beitr\xE4ge gefunden",
    status_count: "{posts} Beitr\xE4ge \xB7 {media} Dateien",
    status_count_zips: "\xB7 ~{parts} ZIPs",
    status_scanned_to: "Gescannt bis {date}",
    status_loading_next: "N\xE4chste Seite wird geladen...",
    status_loading_first: "Erste Seite wird geladen...",
    status_rate_limited_scroll: "API-Ratenlimit, wechsle zum Scroll-Modus...",
    status_rate_limited_retry:
      "Instagram-Ratenlimit, erneuter Versuch in {seconds}s...",
    status_processing: "Verarbeitung...",
    status_waiting_next: "Warte auf n\xE4chste Seite...",
    status_scan_complete: "Scan abgeschlossen, Downloads in Warteschlange",
    status_saving_scanned: "Gescannte Inhalte werden gespeichert...",
    status_stopped: "Gestoppt",
    notify_started: "Download von @{username} gestartet",
    notify_switched_scroll: "API-Ratenlimit, zum Scroll-Modus gewechselt",
    notify_multi_zip:
      "Dateien \xFCberschreiten {chunkSize}, werden in mehrere ZIPs aufgeteilt (~{parts} oder mehr)",
    notify_found_posts: "{posts} Beitr\xE4ge gefunden ({media} Dateien)",
    notify_error: "Fehler: {message}",
    notify_pagination_error: "Paginierungsfehler: {message}",
    scroll_loading_more: "Scrollen zum Laden weiterer Beitr\xE4ge...",
    scroll_parsing_post:
      "Beitrag wird analysiert {current}/{total}: {shortcode}",
    scroll_got_records: "{count} Beitragsdaten von der Seite abgerufen",
    rate_wait: "Zu viele Anfragen, warte {seconds}s...",
    parse_html_error:
      "Instagram hat unerwarteten Inhalt zur\xFCckgegeben. Bitte \xFCberpr\xFCfe, ob du angemeldet bist, und aktualisiere die Seite.",
    zip_no_files: "Keine herunterladbaren Dateien im ZIP",
    aria_download: "Herunterladen",
    story_download_highlight: "Alle speichern",
    story_download_all: "Alle speichern",
    notify_story_failed: "Diese Story konnte nicht abgerufen werden",
    notify_story_success: "Story heruntergeladen",
    story_downloading: "Wird heruntergeladen...",
    notify_highlight_id_failed: "Highlight-ID konnte nicht abgerufen werden",
    notify_username_failed: "Benutzername konnte nicht abgerufen werden",
    notify_user_data_failed:
      "Benutzerdaten konnten nicht abgerufen werden (m\xF6glicherweise privates Konto)",
    notify_highlight_empty: "Dieses Highlight hat keinen Inhalt",
    notify_no_stories: "Dieser Benutzer hat derzeit keine Stories",
    highlight_untitled: "Unbenanntes Highlight",
    progress_extras_start: "Zus\xE4tzliche Inhalte werden vorbereitet...",
    progress_stories_fetching: "Aktive Stories werden abgerufen...",
    progress_stories_packing: "{count} Story-Dateien werden in ZIP gepackt...",
    progress_highlights_fetching_tray: "Highlight-Liste wird abgerufen...",
    progress_highlight_fetching: "Highlight {current}/{total}: {title}",
    progress_highlights_packing:
      "{count} Highlight-Dateien werden in ZIP gepackt...",
    progress_highlights_packing_named:
      "Wird gepackt: {title} ({current}/{total})",
    task_label_highlights: "Highlights",
    task_label_stories: "Storys",
    popup_subtitle: "Massendownload von Instagram-Medien",
    popup_empty_title: "Keine Download-Aufgaben",
    popup_empty_desc: `Gehe zu einem \xF6ffentlichen Instagram-Profil
und klicke auf \u201EAlle herunterladen"`,
    popup_settings: "Einstellungen",
    popup_settings_advanced: "Erweitert",
    popup_concurrency: "Gleichzeitige Downloads",
    popup_max_retries: "Max. Wiederholungen",
    popup_zip_chunk: "ZIP-Stapelgr\xF6\xDFe",
    popup_zip_chunk_tip:
      "Maximale Anzahl an Dateien pro ZIP. Wird dieses Limit \xFCberschritten, wird der Download automatisch in mehrere ZIPs aufgeteilt.",
    popup_zip_no_split: "Nicht aufteilen",
    popup_language: "Sprache",
    popup_footer: "Dog Saver v{version} \xB7 Nur lokal, kein Tracking",
    task_scanning: "Scannen... {found}",
    task_scanning_found: "{count} Dateien gefunden",
    task_batches_done: "{count} Stapel abgeschlossen",
    task_zipping: "ZIP wird erstellt...{percent}",
    task_packing: "Packe {current}/{total} Dateien...",
    task_batches_done_parens: "({count} Stapel abgeschlossen)",
    task_creating_zip: "ZIP wird erstellt... {total} Dateien",
    task_downloaded: "{done}/{total} Dateien heruntergeladen",
    task_failed: "{count} fehlgeschlagen",
    task_in_progress: "{count} in Bearbeitung",
    task_zips: "{count} ZIPs",
    task_status_running: "L\xE4uft",
    task_status_paused: "Pausiert",
    task_status_done: "Fertig",
    task_status_stopped: "Gestoppt",
    task_status_saving: "Wird gespeichert...",
    task_status_auto_paused: "Pausiert (Tab geschlossen)",
    status_auto_resume: "Scan f\xFCr @{username} wird fortgesetzt...",
    task_btn_pause: "Pausieren",
    task_btn_resume: "Fortsetzen",
    task_btn_stop: "Stoppen",
    task_stop_confirm:
      "{count} gescannte Beitr\xE4ge vor dem Stoppen herunterladen?",
    task_stop_download: "Herunterladen & Stoppen",
    task_stop_discard: "Verwerfen & Stoppen",
    task_stop_preparing: "Download wird vorbereitet...",
    error_no_avatar_url: "Avatar-URL nicht gefunden",
    error_no_media_items: "Keine Medien zum Herunterladen",
    error_no_story_items: "Keine Stories zum Herunterladen",
    error_unknown_message: "Unbekannter Nachrichtentyp",
    error_zip_build_failed: "ZIP-Erstellung fehlgeschlagen",
    btn_download_saved: "Gespeicherte herunterladen",
    btn_download_collection: "Sammlung herunterladen",
    dialog_saved_title: "Gespeicherte Beitr\xE4ge herunterladen",
    dialog_select_collections: "Sammlungen ausw\xE4hlen",
    dialog_select_all: "Alle ausw\xE4hlen",
    dialog_deselect_all: "Alle abw\xE4hlen",
    dialog_collection_count: "{count} Elemente",
    status_collection_progress: "Sammlung: {name}",
    dialog_saved_folder_mode: "Speichermethode",
    dialog_saved_folder_per_post: "Ein Ordner pro Beitrag",
    dialog_saved_folder_per_collection: "Ein Ordner pro Sammlung",
    notify_fetching_collections: "Sammlungen werden abgerufen...",
    notify_no_collections: "Keine gespeicherten Sammlungen gefunden",
    review_title: "Gef\xE4llt dir Dog Saver?",
    review_message:
      "Du hast bereits {count} Downloads abgeschlossen! Wenn dir dieses Tool geholfen hat, w\xFCrdest du uns eine Bewertung im Chrome Web Store hinterlassen? Deine Unterst\xFCtzung hilft uns, Dog Saver weiter zu verbessern und kostenlos zu halten.",
    review_btn_rate: "Bewertung abgeben",
    review_btn_later: "Vielleicht sp\xE4ter",
    review_btn_never: "Nicht mehr fragen",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Freigeschaltet",
    upgrade_title: "Auf Dog Saver Pro upgraden",
    upgrade_title_benefit: "Speichere, was du liebst \u2013 vollst\xE4ndig",
    upgrade_subtitle:
      "Schalte unbegrenzte Massendownloads und erweiterte Funktionen frei",
    upgrade_feature_unlimited: "Unbegrenzte Profil-Massendownloads",
    upgrade_feature_extras:
      "Alle Highlights & Stories mit einem Klick b\xFCndeln",
    upgrade_feature_saved: "Mehrere Sammlungen gleichzeitig herunterladen",
    upgrade_feature_dates:
      "Benutzerdefinierte Zeitr\xE4ume (90 / 180 Tage / benutzerdefiniert)",
    compare_header_feature: "Funktion",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Einzeldownload (Beitrag / Reel / Story)",
    compare_row_highlight: "Einzelner Highlight",
    compare_row_single_collection: "Einzelne Sammlung herunterladen",
    compare_row_profile_bulk: "Profil-Massendownload",
    compare_row_profile_bulk_free: "Neueste 30 Beitr\xE4ge",
    compare_row_profile_bulk_pro: "Unbegrenzt",
    compare_row_extras: "Highlights & Stories b\xFCndeln",
    compare_row_saved: "Mehrere Sammlungen gleichzeitig",
    compare_row_dates: "Benutzerdefinierte Zeitr\xE4ume",
    compare_row_dates_pro: "7 / 30 / 90 / Benutzerdefiniert",
    trust_no_personal_data: "Wir erfassen keine pers\xF6nlichen Daten",
    trust_three_devices: "3-Ger\xE4te-Lizenz",
    upgrade_plan_monthly: "Monatlich",
    upgrade_plan_yearly: "J\xE4hrlich",
    upgrade_plan_lifetime: "Lifetime",
    upgrade_price_monthly: "$3,99",
    upgrade_price_yearly: "$19,99",
    upgrade_price_lifetime: "$24,99",
    upgrade_price_lifetime_early: "$14,99",
    upgrade_monthly_subtitle: "/ Monat \xB7 Jederzeit k\xFCndbar",
    upgrade_yearly_subtitle: "/ Jahr \xB7 Spare 58 %",
    upgrade_lifetime_subtitle_regular: "Einmalige Zahlung \xB7 F\xFCr immer",
    upgrade_lifetime_card_label: "Lifetime \xB7 Early Bird",
    upgrade_lifetime_savings: "Einmalige Zahlung \xB7 F\xFCr immer",
    upgrade_lifetime_countdown_badge: "Begrenzt -40 % \xB7 Noch {days} Tage",
    upgrade_btn_choose: "Plan w\xE4hlen",
    upgrade_btn_close: "Schlie\xDFen",
    have_key_prompt: "Bereits gekauft?",
    have_key_link: "License eingeben \u2192",
    gate_topk_limit:
      "Die kostenlose Version ist auf {limit} Beitr\xE4ge pro Massendownload beschr\xE4nkt. Upgrade auf Pro.",
    gate_days_limit:
      "Die kostenlose Version ist auf die letzten {limit} Tage beschr\xE4nkt. Pro erlaubt 90 / 180 Tage oder benutzerdefinierten Zeitraum.",
    gate_custom_range: "Benutzerdefinierter Zeitraum ist eine Pro-Funktion.",
    gate_extras:
      "Highlights in den Profil-Download einzubinden ist eine Pro-Funktion. Stories (24h) sind kostenlos.",
    gate_all_trial_exhausted:
      'Sie haben alle {limit} kostenlosen "Alles herunterladen"-Versuche aufgebraucht. Upgraden Sie auf Pro f\xFCr unbegrenzte Downloads.',
    gate_saved_multi:
      "Mehrere Sammlungen gleichzeitig herunterzuladen ist eine Pro-Funktion. Eine einzelne Sammlung ist kostenlos.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Kostenlose Version",
    license_status_pro: "Pro \xB7 Aktiv",
    license_status_legacy:
      "Pro \xB7 Freigeschaltet (Early Supporter \u2014 vielen Dank!)",
    license_status_expires: "L\xE4uft am {date} ab",
    license_status_lifetime: "Lifetime-Lizenz",
    license_input_placeholder:
      "Lizenzschl\xFCssel einf\xFCgen (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Aktivieren",
    license_btn_activating: "Aktiviere...",
    license_btn_copy: "Kopieren",
    license_btn_remove_device: "Dieses Ger\xE4t entfernen",
    license_btn_get_pro: "Pro holen",
    license_btn_get_pro_cta: "Pro holen",
    license_msg_activated:
      "Pro aktiviert. Danke, dass du Dog Saver unterst\xFCtzt!",
    license_msg_activate_failed: "Aktivierung fehlgeschlagen: {error}",
    license_msg_removed:
      "Ger\xE4t entfernt. Lizenz aus diesem Browser gel\xF6scht.",
    license_msg_limit_reached_title: "Aktivierungslimit erreicht",
    license_msg_limit_reached_body:
      'Diese Lizenz ist bereits auf 3 Ger\xE4ten aktiviert. \xD6ffne Dog Saver auf einem anderen Ger\xE4t und klicke auf \u201EDieses Ger\xE4t entfernen", um einen Platz freizugeben.',
    license_help_switch_device:
      "Computer wechseln? Kopiere den Schl\xFCssel oben und f\xFCge ihn auf dem neuen Ger\xE4t ein.",
    license_help_portal:
      "Abonnement verwalten / Ger\xE4te zur\xFCcksetzen im Customer Portal",
    legacy_welcome_title: "Danke, Early Supporter",
    legacy_welcome_body:
      "Du nutzt Dog Saver seit v{version}. Pro ist auf dieser Installation dauerhaft freigeschaltet \u2014 keine Zahlung erforderlich.",
    legacy_welcome_warning:
      "Da wir keine pers\xF6nlichen Daten erfassen, ist dein Early-Supporter-Status an diese Chrome-Installation gebunden. Das Deinstallieren von Dog Saver kann diesen Status aufheben.",
    legacy_welcome_btn_done: "Verstanden",
    legacy_welcome_btn_review: "Bewertung im Chrome Web Store hinterlassen",
    legacy_thanks_title: "Danke, Early Supporter",
    legacy_thanks_message:
      "Du nutzt Dog Saver seit v{version}. Pro ist dauerhaft freigeschaltet \u2014 keine Zahlung n\xF6tig. Wenn dir dieses Tool geholfen hat, hilft eine kurze Bewertung uns, es kostenlos zu halten.",
    legacy_thanks_btn_review: "Bewertung hinterlassen",
    legacy_thanks_btn_done: "Verstanden",
  };
  var qe = {
    btn_download_all: "Unduh Semua",
    aria_download_hd_avatar: "Unduh avatar HD",
    notify_avatar_failed: "Gagal mendapatkan avatar HD",
    notify_avatar_success: "Avatar HD berhasil diunduh",
    aria_download_post: "Unduh postingan ini",
    aria_download_post_zip: "Unduh postingan ini (ZIP)",
    aria_download_reel: "Unduh Reel ini",
    tooltip_sponsored_not_downloadable: "Konten bersponsor tidak dapat diunduh",
    notify_post_media_failed: "Gagal mendapatkan media postingan",
    notify_downloaded_n_files_zip: "{count} file berhasil diunduh (ZIP)",
    notify_downloaded_1_file: "1 file berhasil diunduh",
    notify_download_failed: "Unduhan gagal: {error}",
    dialog_title: "Unduh @{username}",
    dialog_media_type: "Jenis media",
    dialog_media_all: "Semua (Foto + Video)",
    dialog_media_photos: "Foto saja",
    dialog_media_videos: "Video saja",
    dialog_save_method: "Metode penyimpanan",
    dialog_save_grouped: "Satu folder per postingan",
    dialog_save_flat: "Semua file dalam satu folder",
    dialog_range: "Rentang unduhan",
    dialog_range_all: "Unduh semua",
    dialog_range_all_trial_remaining:
      "{base} (uji coba gratis: sisa {remaining})",
    dialog_range_topk: "N postingan pertama (terbaru dahulu)",
    dialog_range_last_n_days: "Dalam N hari terakhir",
    dialog_range_custom: "Rentang tanggal kustom",
    dialog_post_count: "Jumlah postingan",
    dialog_recent_days: "Hari terakhir",
    dialog_days_7: "7 hari",
    dialog_days_30: "30 hari",
    dialog_days_90: "90 hari",
    dialog_days_180: "180 hari",
    dialog_start_date: "Tanggal mulai",
    dialog_end_date: "Tanggal akhir",
    dialog_btn_start: "Mulai Unduh",
    dialog_btn_cancel: "Batal",
    dialog_extras: "Sertakan juga",
    dialog_include_highlights: "Semua highlight",
    dialog_include_stories: "Story aktif (24 jam)",
    status_scanning: "Memindai postingan...",
    status_posts_found: "0 postingan ditemukan",
    status_count: "{posts} postingan \xB7 {media} file",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to: "Dipindai hingga {date}",
    status_loading_next: "Memuat halaman berikutnya...",
    status_loading_first: "Memuat halaman pertama...",
    status_rate_limited_scroll: "API dibatasi, beralih ke mode gulir...",
    status_rate_limited_retry:
      "Instagram membatasi kecepatan, mencoba lagi dalam {seconds}d...",
    status_processing: "Memproses...",
    status_waiting_next: "Menunggu halaman berikutnya...",
    status_scan_complete: "Pemindaian selesai, unduhan masuk antrean",
    status_saving_scanned: "Menyimpan konten yang dipindai...",
    status_stopped: "Dihentikan",
    notify_started: "Mulai mengunduh @{username}",
    notify_switched_scroll: "API dibatasi, beralih ke mode gulir",
    notify_multi_zip:
      "File melebihi {chunkSize}, akan dibagi menjadi beberapa ZIP (~{parts}+)",
    notify_found_posts: "Ditemukan {posts} postingan ({media} file)",
    notify_error: "Kesalahan: {message}",
    notify_pagination_error: "Kesalahan paginasi: {message}",
    scroll_loading_more: "Menggulir untuk memuat lebih banyak postingan...",
    scroll_parsing_post: "Mengurai postingan {current}/{total}: {shortcode}",
    scroll_got_records: "{count} data postingan berhasil diambil dari halaman",
    rate_wait: "Permintaan terlalu sering, menunggu {seconds}d...",
    parse_html_error:
      "Instagram mengembalikan konten tak terduga. Pastikan Anda sudah masuk dan muat ulang halaman.",
    zip_no_files: "Tidak ada file yang dapat diunduh dalam ZIP",
    aria_download: "Unduh",
    story_download_highlight: "Simpan Semua",
    story_download_all: "Simpan Semua",
    notify_story_failed: "Gagal mendapatkan story ini",
    notify_story_success: "Story berhasil diunduh",
    story_downloading: "Mengunduh...",
    notify_highlight_id_failed: "Gagal mendapatkan ID highlight",
    notify_username_failed: "Gagal mendapatkan nama pengguna",
    notify_user_data_failed:
      "Gagal mendapatkan data pengguna (mungkin akun privat)",
    notify_highlight_empty: "Highlight ini tidak memiliki konten",
    notify_no_stories: "Pengguna ini tidak memiliki story saat ini",
    highlight_untitled: "Highlight tanpa judul",
    progress_extras_start: "Menyiapkan konten tambahan...",
    progress_stories_fetching: "Mengambil story aktif...",
    progress_stories_packing: "Mengemas {count} file story ke ZIP...",
    progress_highlights_fetching_tray: "Mengambil daftar highlight...",
    progress_highlight_fetching: "Highlight {current}/{total}: {title}",
    progress_highlights_packing: "Mengemas {count} file highlight ke ZIP...",
    progress_highlights_packing_named: "Mengemas: {title} ({current}/{total})",
    task_label_highlights: "Sorotan",
    task_label_stories: "Cerita",
    popup_subtitle: "Unduh media Instagram secara massal",
    popup_empty_title: "Tidak ada tugas unduhan",
    popup_empty_desc: `Buka halaman profil Instagram publik
lalu klik tombol "Unduh Semua"`,
    popup_settings: "Pengaturan",
    popup_settings_advanced: "Lanjutan",
    popup_concurrency: "Unduhan bersamaan",
    popup_max_retries: "Maks percobaan ulang",
    popup_zip_chunk: "Ukuran potongan ZIP",
    popup_zip_chunk_tip:
      "Jumlah file maksimum per ZIP. Jika unduhan melebihi batas ini, akan otomatis dibagi menjadi beberapa ZIP.",
    popup_zip_no_split: "Tidak dibagi",
    popup_language: "Bahasa",
    popup_footer: "Dog Saver v{version} \xB7 Lokal saja, tanpa pelacakan",
    task_scanning: "Memindai... {found}",
    task_scanning_found: "Ditemukan {count} file",
    task_batches_done: "{count} batch selesai",
    task_zipping: "Membuat ZIP...{percent}",
    task_packing: "Mengemas {current}/{total} file...",
    task_batches_done_parens: "({count} batch selesai)",
    task_creating_zip: "Membuat ZIP... {total} file",
    task_downloaded: "{done}/{total} file diunduh",
    task_failed: "{count} gagal",
    task_in_progress: "{count} sedang berjalan",
    task_zips: "{count} ZIP",
    task_status_running: "Berjalan",
    task_status_paused: "Dijeda",
    task_status_done: "Selesai",
    task_status_stopped: "Dihentikan",
    task_status_saving: "Menyimpan...",
    task_status_auto_paused: "Dijeda (tab ditutup)",
    status_auto_resume: "Melanjutkan pemindaian untuk @{username}...",
    task_btn_pause: "Jeda",
    task_btn_resume: "Lanjutkan",
    task_btn_stop: "Hentikan",
    task_stop_confirm:
      "Unduh {count} postingan yang dipindai sebelum berhenti?",
    task_stop_download: "Unduh & Hentikan",
    task_stop_discard: "Buang & Hentikan",
    task_stop_preparing: "Mempersiapkan unduhan...",
    error_no_avatar_url: "URL avatar tidak ditemukan",
    error_no_media_items: "Tidak ada item media untuk diunduh",
    error_no_story_items: "Tidak ada item story untuk diunduh",
    error_unknown_message: "Jenis pesan tidak dikenal",
    error_zip_build_failed: "Gagal membuat ZIP",
    btn_download_saved: "Unduh Tersimpan",
    btn_download_collection: "Unduh Koleksi",
    dialog_saved_title: "Unduh Postingan Tersimpan",
    dialog_select_collections: "Pilih koleksi",
    dialog_select_all: "Pilih Semua",
    dialog_deselect_all: "Batalkan Semua",
    dialog_collection_count: "{count} item",
    status_collection_progress: "Koleksi: {name}",
    dialog_saved_folder_mode: "Metode penyimpanan",
    dialog_saved_folder_per_post: "Satu folder per postingan",
    dialog_saved_folder_per_collection: "Satu folder per koleksi",
    notify_fetching_collections: "Mengambil koleksi...",
    notify_no_collections: "Tidak ada koleksi tersimpan ditemukan",
    review_title: "Menikmati Dog Saver?",
    review_message:
      "Anda telah menyelesaikan {count} unduhan! Jika alat ini bermanfaat, ulasan singkat di Chrome Web Store akan sangat berarti. Dukungan Anda membantu Dog Saver tetap gratis dan terus berkembang.",
    review_btn_rate: "Beri Ulasan",
    review_btn_later: "Mungkin Nanti",
    review_btn_never: "Jangan Tanya Lagi",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Tidak Terkunci",
    upgrade_title: "Tingkatkan ke Dog Saver Pro",
    upgrade_title_benefit: "Simpan yang Anda cintai, sepenuhnya",
    upgrade_subtitle: "Buka unduhan massal tak terbatas dan fitur canggih",
    upgrade_feature_unlimited: "Unduhan massal Profil tak terbatas",
    upgrade_feature_extras: "Bundel semua Sorotan & Stories dalam satu klik",
    upgrade_feature_saved: "Unduhan massal multi-koleksi",
    upgrade_feature_dates: "Rentang tanggal kustom (90 / 180 hari / kustom)",
    compare_header_feature: "Fitur",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Unduhan tunggal (Postingan / Reel / Story)",
    compare_row_highlight: "Highlight tunggal",
    compare_row_single_collection: "Unduhan satu koleksi",
    compare_row_profile_bulk: "Unduhan massal Profil",
    compare_row_profile_bulk_free: "30 postingan terbaru",
    compare_row_profile_bulk_pro: "Tidak terbatas",
    compare_row_extras: "Bundel Sorotan & Stories",
    compare_row_saved: "Multi-koleksi sekaligus",
    compare_row_dates: "Rentang tanggal kustom",
    compare_row_dates_pro: "7 / 30 / 90 / Kustom",
    trust_no_personal_data: "Kami tidak mengumpulkan data pribadi",
    trust_three_devices: "Lisensi 3 perangkat",
    upgrade_plan_monthly: "Bulanan",
    upgrade_plan_yearly: "Tahunan",
    upgrade_plan_lifetime: "Seumur Hidup",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle: "/ bulan \xB7 Batalkan kapan saja",
    upgrade_yearly_subtitle: "/ tahun \xB7 Hemat 58%",
    upgrade_lifetime_subtitle_regular: "Pembayaran sekali \xB7 Selamanya",
    upgrade_lifetime_card_label: "Seumur Hidup \xB7 Early Bird",
    upgrade_lifetime_savings: "Pembayaran sekali \xB7 Selamanya",
    upgrade_lifetime_countdown_badge: "Terbatas -40% \xB7 Sisa {days} hari",
    upgrade_btn_choose: "Pilih Paket",
    upgrade_btn_close: "Tutup",
    have_key_prompt: "Sudah beli?",
    have_key_link: "Masukkan license \u2192",
    gate_topk_limit:
      "Versi gratis dibatasi {limit} postingan per unduhan massal. Tingkatkan ke Pro.",
    gate_days_limit:
      "Versi gratis dibatasi {limit} hari terakhir. Pro mendukung 90 / 180 hari atau rentang kustom.",
    gate_custom_range: "Rentang tanggal kustom adalah fitur Pro.",
    gate_extras:
      "Menyertakan Sorotan dalam unduhan profil adalah fitur Pro. Story (24 jam) gratis.",
    gate_all_trial_exhausted:
      'Anda telah menggunakan {limit} kali uji coba gratis "Unduh semua". Upgrade ke Pro untuk unduhan tanpa batas.',
    gate_saved_multi:
      "Mengunduh beberapa koleksi sekaligus adalah fitur Pro. Masuk ke satu koleksi untuk diunduh gratis.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Versi gratis",
    license_status_pro: "Pro \xB7 Aktif",
    license_status_legacy:
      "Pro \xB7 Tidak Terkunci (Pendukung awal \u2014 terima kasih!)",
    license_status_expires: "Kedaluwarsa {date}",
    license_status_lifetime: "Lisensi seumur hidup",
    license_input_placeholder:
      "Tempel kunci lisensi Anda (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Aktifkan",
    license_btn_activating: "Mengaktifkan...",
    license_btn_copy: "Salin",
    license_btn_remove_device: "Hapus perangkat ini",
    license_btn_get_pro: "Dapatkan Pro",
    license_btn_get_pro_cta: "Dapatkan Pro",
    license_msg_activated:
      "Pro telah aktif. Terima kasih telah mendukung Dog Saver!",
    license_msg_activate_failed: "Aktivasi gagal: {error}",
    license_msg_removed:
      "Perangkat dihapus. Lisensi dibersihkan dari browser ini.",
    license_msg_limit_reached_title: "Batas aktivasi tercapai",
    license_msg_limit_reached_body:
      'Lisensi ini sudah diaktifkan di 3 perangkat. Buka Dog Saver di perangkat lain dan klik "Hapus perangkat ini" untuk membebaskan slot.',
    license_help_switch_device:
      "Ganti komputer? Salin kunci di atas dan tempel di perangkat baru.",
    license_help_portal:
      "Kelola langganan / reset perangkat di Portal Pelanggan",
    legacy_welcome_title: "Terima kasih, pendukung awal",
    legacy_welcome_body:
      "Anda telah menggunakan Dog Saver sejak v{version}. Pro terbuka permanen di instalasi ini \u2014 tanpa pembayaran.",
    legacy_welcome_warning:
      "Karena kami tidak mengumpulkan informasi pribadi, status pendukung awal Anda terikat pada instalasi Chrome ini. Menghapus instalasi Dog Saver dapat menghilangkan status ini.",
    legacy_welcome_btn_done: "Mengerti",
    legacy_welcome_btn_review: "Tinggalkan ulasan di Chrome Web Store",
    legacy_thanks_title: "Terima kasih, pendukung awal",
    legacy_thanks_message:
      "Anda telah menggunakan Dog Saver sejak v{version}. Pro terbuka permanen \u2014 tanpa pembayaran. Jika alat ini membantu Anda, ulasan singkat membantu kami tetap gratis.",
    legacy_thanks_btn_review: "Tinggalkan ulasan",
    legacy_thanks_btn_done: "Mengerti",
  };
  var He = {
    btn_download_all:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0432\u0441\u0451",
    aria_download_hd_avatar:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0430\u0432\u0430\u0442\u0430\u0440 HD",
    notify_avatar_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0430\u0432\u0430\u0442\u0430\u0440 HD",
    notify_avatar_success:
      "\u0410\u0432\u0430\u0442\u0430\u0440 HD \u0441\u043A\u0430\u0447\u0430\u043D",
    aria_download_post:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u043F\u043E\u0441\u0442",
    aria_download_post_zip:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u043F\u043E\u0441\u0442 (ZIP)",
    aria_download_reel:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u044D\u0442\u043E\u0442 Reel",
    tooltip_sponsored_not_downloadable:
      "\u0420\u0435\u043A\u043B\u0430\u043C\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u043D\u0435\u043B\u044C\u0437\u044F \u0441\u043A\u0430\u0447\u0430\u0442\u044C",
    notify_post_media_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043C\u0435\u0434\u0438\u0430 \u043F\u043E\u0441\u0442\u0430",
    notify_downloaded_n_files_zip:
      "\u0421\u043A\u0430\u0447\u0430\u043D\u043E {count} \u0444\u0430\u0439\u043B\u043E\u0432 (ZIP)",
    notify_downloaded_1_file:
      "\u0421\u043A\u0430\u0447\u0430\u043D 1 \u0444\u0430\u0439\u043B",
    notify_download_failed:
      "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438: {error}",
    dialog_title: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C @{username}",
    dialog_media_type: "\u0422\u0438\u043F \u043C\u0435\u0434\u0438\u0430",
    dialog_media_all:
      "\u0412\u0441\u0451 (\u0444\u043E\u0442\u043E + \u0432\u0438\u0434\u0435\u043E)",
    dialog_media_photos:
      "\u0422\u043E\u043B\u044C\u043A\u043E \u0444\u043E\u0442\u043E",
    dialog_media_videos:
      "\u0422\u043E\u043B\u044C\u043A\u043E \u0432\u0438\u0434\u0435\u043E",
    dialog_save_method:
      "\u041C\u0435\u0442\u043E\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
    dialog_save_grouped:
      "\u041F\u0430\u043F\u043A\u0430 \u0434\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0430",
    dialog_save_flat:
      "\u0412\u0441\u0435 \u0444\u0430\u0439\u043B\u044B \u0432 \u043E\u0434\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u0435",
    dialog_range:
      "\u0414\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
    dialog_range_all:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0432\u0441\u0451",
    dialog_range_all_trial_remaining:
      "{base} (\u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E: \u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C {remaining})",
    dialog_range_topk:
      "\u041F\u0435\u0440\u0432\u044B\u0435 N \u043F\u043E\u0441\u0442\u043E\u0432 (\u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u043E\u0432\u044B\u0435)",
    dialog_range_last_n_days:
      "\u0417\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 N \u0434\u043D\u0435\u0439",
    dialog_range_custom:
      "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0434\u0430\u0442",
    dialog_post_count:
      "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u043F\u043E\u0441\u0442\u043E\u0432",
    dialog_recent_days:
      "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0434\u043D\u0438",
    dialog_days_7: "7 \u0434\u043D\u0435\u0439",
    dialog_days_30: "30 \u0434\u043D\u0435\u0439",
    dialog_days_90: "90 \u0434\u043D\u0435\u0439",
    dialog_days_180: "180 \u0434\u043D\u0435\u0439",
    dialog_start_date:
      "\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430",
    dialog_end_date:
      "\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F",
    dialog_btn_start:
      "\u041D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443",
    dialog_btn_cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    dialog_extras:
      "\u0422\u0430\u043A\u0436\u0435 \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
    dialog_include_highlights:
      "\u0412\u0441\u0435 \u0445\u0430\u0439\u043B\u0430\u0439\u0442\u044B",
    dialog_include_stories:
      "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0438\u0441\u0442\u043E\u0440\u0438\u0438 (24\u0447)",
    status_scanning:
      "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043F\u043E\u0441\u0442\u043E\u0432...",
    status_posts_found:
      "\u041D\u0430\u0439\u0434\u0435\u043D\u043E 0 \u043F\u043E\u0441\u0442\u043E\u0432",
    status_count:
      "{posts} \u043F\u043E\u0441\u0442\u043E\u0432 \xB7 {media} \u0444\u0430\u0439\u043B\u043E\u0432",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to:
      "\u041E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0434\u043E {date}",
    status_loading_next:
      "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B...",
    status_loading_first:
      "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0435\u0440\u0432\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B...",
    status_rate_limited_scroll:
      "\u041B\u0438\u043C\u0438\u0442 API, \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432 \u0440\u0435\u0436\u0438\u043C \u043F\u0440\u043E\u043A\u0440\u0443\u0442\u043A\u0438...",
    status_rate_limited_retry:
      "Instagram \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u043B \u0437\u0430\u043F\u0440\u043E\u0441\u044B, \u043F\u043E\u0432\u0442\u043E\u0440 \u0447\u0435\u0440\u0435\u0437 {seconds}\u0441...",
    status_processing:
      "\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430...",
    status_waiting_next:
      "\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B...",
    status_scan_complete:
      "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E, \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u0438",
    status_saving_scanned:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0430...",
    status_stopped:
      "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    notify_started:
      "\u041D\u0430\u0447\u0430\u0442\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 @{username}",
    notify_switched_scroll:
      "\u041B\u0438\u043C\u0438\u0442 API, \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u043E \u0432 \u0440\u0435\u0436\u0438\u043C \u043F\u0440\u043E\u043A\u0440\u0443\u0442\u043A\u0438",
    notify_multi_zip:
      "\u0424\u0430\u0439\u043B\u043E\u0432 \u0431\u043E\u043B\u044C\u0448\u0435 {chunkSize}, \u0431\u0443\u0434\u0435\u0442 \u0440\u0430\u0437\u0434\u0435\u043B\u0435\u043D\u043E \u043D\u0430 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E ZIP (~{parts}+)",
    notify_found_posts:
      "\u041D\u0430\u0439\u0434\u0435\u043D\u043E {posts} \u043F\u043E\u0441\u0442\u043E\u0432 ({media} \u0444\u0430\u0439\u043B\u043E\u0432)",
    notify_error: "\u041E\u0448\u0438\u0431\u043A\u0430: {message}",
    notify_pagination_error:
      "\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0430\u0433\u0438\u043D\u0430\u0446\u0438\u0438: {message}",
    scroll_loading_more:
      "\u041F\u0440\u043E\u043A\u0440\u0443\u0442\u043A\u0430 \u0434\u043B\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043F\u043E\u0441\u0442\u043E\u0432...",
    scroll_parsing_post:
      "\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 \u043F\u043E\u0441\u0442\u0430 {current}/{total}: {shortcode}",
    scroll_got_records:
      "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E {count} \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u043E\u0441\u0442\u043E\u0432 \u0441\u043E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B",
    rate_wait:
      "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0447\u0430\u0441\u0442\u044B\u0435 \u0437\u0430\u043F\u0440\u043E\u0441\u044B, \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 {seconds}\u0441...",
    parse_html_error:
      "Instagram \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442. \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u0432\u044B \u0432\u043E\u0448\u043B\u0438 \u0432 \u0430\u043A\u043A\u0430\u0443\u043D\u0442, \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.",
    zip_no_files:
      "\u0412 ZIP \u043D\u0435\u0442 \u0444\u0430\u0439\u043B\u043E\u0432 \u0434\u043B\u044F \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F",
    aria_download: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C",
    story_download_highlight:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432\u0441\u0451",
    story_download_all:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432\u0441\u0451",
    notify_story_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u044D\u0442\u0443 \u0438\u0441\u0442\u043E\u0440\u0438\u044E",
    notify_story_success:
      "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u043A\u0430\u0447\u0430\u043D\u0430",
    story_downloading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430...",
    notify_highlight_id_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C ID \u0445\u0430\u0439\u043B\u0430\u0439\u0442\u0430",
    notify_username_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0438\u043C\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
    notify_user_data_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F (\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0439 \u0430\u043A\u043A\u0430\u0443\u043D\u0442)",
    notify_highlight_empty:
      "\u042D\u0442\u043E\u0442 \u0445\u0430\u0439\u043B\u0430\u0439\u0442 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0430",
    notify_no_stories:
      "\u0423 \u044D\u0442\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0439",
    highlight_untitled:
      "\u0425\u0430\u0439\u043B\u0430\u0439\u0442 \u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F",
    progress_extras_start:
      "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0430...",
    progress_stories_fetching:
      "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0438\u0441\u0442\u043E\u0440\u0438\u0439...",
    progress_stories_packing:
      "\u0423\u043F\u0430\u043A\u043E\u0432\u043A\u0430 {count} \u0444\u0430\u0439\u043B\u043E\u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0439 \u0432 ZIP...",
    progress_highlights_fetching_tray:
      "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435 \u0441\u043F\u0438\u0441\u043A\u0430 \u0445\u0430\u0439\u043B\u0430\u0439\u0442\u043E\u0432...",
    progress_highlight_fetching:
      "\u0425\u0430\u0439\u043B\u0430\u0439\u0442 {current}/{total}: {title}",
    progress_highlights_packing:
      "\u0423\u043F\u0430\u043A\u043E\u0432\u043A\u0430 {count} \u0444\u0430\u0439\u043B\u043E\u0432 \u0445\u0430\u0439\u043B\u0430\u0439\u0442\u043E\u0432 \u0432 ZIP...",
    progress_highlights_packing_named:
      "\u0423\u043F\u0430\u043A\u043E\u0432\u043A\u0430: {title} ({current}/{total})",
    task_label_highlights:
      "\u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0435",
    task_label_stories: "\u0418\u0441\u0442\u043E\u0440\u0438\u0438",
    popup_subtitle:
      "\u041C\u0430\u0441\u0441\u043E\u0432\u043E\u0435 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u043C\u0435\u0434\u0438\u0430 \u0438\u0437 Instagram",
    popup_empty_title:
      "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
    popup_empty_desc: `\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0443\u044E \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u043F\u0440\u043E\u0444\u0438\u043B\u044F Instagram
\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \xAB\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0432\u0441\u0451\xBB`,
    popup_settings: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    popup_settings_advanced:
      "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E",
    popup_concurrency:
      "\u041F\u0430\u0440\u0430\u043B\u043B\u0435\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438",
    popup_max_retries:
      "\u041C\u0430\u043A\u0441. \u043F\u043E\u0432\u0442\u043E\u0440\u043E\u0432",
    popup_zip_chunk:
      "\u0420\u0430\u0437\u043C\u0435\u0440 \u0447\u0430\u0441\u0442\u0438 ZIP",
    popup_zip_chunk_tip:
      "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0444\u0430\u0439\u043B\u043E\u0432 \u0432 \u043E\u0434\u043D\u043E\u043C ZIP. \u041F\u0440\u0438 \u043F\u0440\u0435\u0432\u044B\u0448\u0435\u043D\u0438\u0438 \u043B\u0438\u043C\u0438\u0442\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0440\u0430\u0437\u0431\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E ZIP.",
    popup_zip_no_split:
      "\u0411\u0435\u0437 \u0440\u0430\u0437\u0434\u0435\u043B\u0435\u043D\u0438\u044F",
    popup_language: "\u042F\u0437\u044B\u043A",
    popup_footer:
      "Dog Saver v{version} \xB7 \u0422\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E, \u0431\u0435\u0437 \u0441\u043B\u0435\u0436\u043A\u0438",
    task_scanning:
      "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435... {found}",
    task_scanning_found:
      "\u041D\u0430\u0439\u0434\u0435\u043D\u043E {count} \u0444\u0430\u0439\u043B\u043E\u0432",
    task_batches_done:
      "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E {count} \u043F\u0430\u0440\u0442\u0438\u0439",
    task_zipping:
      "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 ZIP...{percent}",
    task_packing:
      "\u0423\u043F\u0430\u043A\u043E\u0432\u043A\u0430 {current}/{total} \u0444\u0430\u0439\u043B\u043E\u0432...",
    task_batches_done_parens:
      "(\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E {count} \u043F\u0430\u0440\u0442\u0438\u0439)",
    task_creating_zip:
      "\u0421\u043E\u0437\u0434\u0430\u043D\u0438\u0435 ZIP... {total} \u0444\u0430\u0439\u043B\u043E\u0432",
    task_downloaded:
      "\u0421\u043A\u0430\u0447\u0430\u043D\u043E {done}/{total} \u0444\u0430\u0439\u043B\u043E\u0432",
    task_failed: "{count} \u043E\u0448\u0438\u0431\u043E\u043A",
    task_in_progress:
      "{count} \u0432 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435",
    task_zips: "{count} ZIP",
    task_status_running:
      "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F",
    task_status_paused: "\u041F\u0430\u0443\u0437\u0430",
    task_status_done: "\u0413\u043E\u0442\u043E\u0432\u043E",
    task_status_stopped:
      "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    task_status_saving:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435...",
    task_status_auto_paused:
      "\u041F\u0430\u0443\u0437\u0430 (\u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u0437\u0430\u043A\u0440\u044B\u0442\u0430)",
    status_auto_resume:
      "\u0412\u043E\u0437\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F @{username}...",
    task_btn_pause: "\u041F\u0430\u0443\u0437\u0430",
    task_btn_resume:
      "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C",
    task_btn_stop:
      "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
    task_stop_confirm:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C {count} \u043E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u0441\u0442\u043E\u0432 \u043F\u0435\u0440\u0435\u0434 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u043E\u0439?",
    task_stop_download:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
    task_stop_discard:
      "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
    task_stop_preparing:
      "\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438...",
    error_no_avatar_url:
      "URL \u0430\u0432\u0430\u0442\u0430\u0440\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D",
    error_no_media_items:
      "\u041D\u0435\u0442 \u043C\u0435\u0434\u0438\u0430\u0444\u0430\u0439\u043B\u043E\u0432 \u0434\u043B\u044F \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F",
    error_no_story_items:
      "\u041D\u0435\u0442 \u0438\u0441\u0442\u043E\u0440\u0438\u0439 \u0434\u043B\u044F \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F",
    error_unknown_message:
      "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
    error_zip_build_failed:
      "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C ZIP",
    btn_download_saved:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u043E\u0435",
    btn_download_collection:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044E",
    dialog_saved_title:
      "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043F\u043E\u0441\u0442\u044B",
    dialog_select_collections:
      "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438",
    dialog_select_all:
      "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0432\u0441\u0451",
    dialog_deselect_all: "\u0421\u043D\u044F\u0442\u044C \u0432\u0441\u0451",
    dialog_collection_count:
      "{count} \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432",
    status_collection_progress:
      "\u041A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044F: {name}",
    dialog_saved_folder_mode:
      "\u041C\u0435\u0442\u043E\u0434 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F",
    dialog_saved_folder_per_post:
      "\u041F\u0430\u043F\u043A\u0430 \u0434\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0430",
    dialog_saved_folder_per_collection:
      "\u041F\u0430\u043F\u043A\u0430 \u0434\u043B\u044F \u043A\u0430\u0436\u0434\u043E\u0439 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438",
    notify_fetching_collections:
      "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439...",
    notify_no_collections:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B",
    review_title: "\u041D\u0440\u0430\u0432\u0438\u0442\u0441\u044F Dog Saver?",
    review_message:
      "\u0412\u044B \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0438 {count} \u0437\u0430\u0433\u0440\u0443\u0437\u043E\u043A! \u0415\u0441\u043B\u0438 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 \u043E\u043A\u0430\u0437\u0430\u043B\u0441\u044F \u043F\u043E\u043B\u0435\u0437\u043D\u044B\u043C, \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0439 \u043E\u0442\u0437\u044B\u0432 \u0432 Chrome Web Store \u0431\u0443\u0434\u0435\u0442 \u043E\u0447\u0435\u043D\u044C \u0432\u0430\u0436\u0435\u043D. \u0412\u0430\u0448\u0430 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 Dog Saver \u043E\u0441\u0442\u0430\u0432\u0430\u0442\u044C\u0441\u044F \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u043C \u0438 \u0440\u0430\u0437\u0432\u0438\u0432\u0430\u0442\u044C\u0441\u044F.",
    review_btn_rate:
      "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432",
    review_btn_later:
      "\u041C\u043E\u0436\u0435\u0442, \u043F\u043E\u0437\u0436\u0435",
    review_btn_never:
      "\u041D\u0435 \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430",
    pro_badge: "Pro",
    pro_badge_legacy:
      "Pro \xB7 \u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E",
    upgrade_title:
      "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 Dog Saver Pro",
    upgrade_title_benefit:
      "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0439\u0442\u0435 \u0432\u0441\u0451, \u0447\u0442\u043E \u043B\u044E\u0431\u0438\u0442\u0435",
    upgrade_subtitle:
      "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0431\u0435\u0437\u043B\u0438\u043C\u0438\u0442\u043D\u044B\u0435 \u043C\u0430\u0441\u0441\u043E\u0432\u044B\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0438 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0435 \u0444\u0443\u043D\u043A\u0446\u0438\u0438",
    upgrade_feature_unlimited:
      "\u0411\u0435\u0437\u043B\u0438\u043C\u0438\u0442\u043D\u044B\u0435 \u043C\u0430\u0441\u0441\u043E\u0432\u044B\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044F",
    upgrade_feature_extras:
      "\u0421\u0431\u043E\u0440\u043A\u0430 \u0432\u0441\u0435\u0445 \u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0438 \u0418\u0441\u0442\u043E\u0440\u0438\u0439 \u043E\u0434\u043D\u0438\u043C \u043A\u043B\u0438\u043A\u043E\u043C",
    upgrade_feature_saved:
      "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439",
    upgrade_feature_dates:
      "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0435 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u044B \u0434\u0430\u0442 (90 / 180 \u0434\u043D\u0435\u0439 / \u0441\u0432\u043E\u0439)",
    compare_header_feature: "\u0424\u0443\u043D\u043A\u0446\u0438\u044F",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\u041E\u0434\u0438\u043D\u043E\u0447\u043D\u0430\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 (\u041F\u043E\u0441\u0442 / Reel / \u0418\u0441\u0442\u043E\u0440\u0438\u044F)",
    compare_row_highlight: "\u041E\u0434\u0438\u043D Highlight",
    compare_row_single_collection:
      "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0434\u043D\u043E\u0439 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0438",
    compare_row_profile_bulk:
      "\u041C\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u0440\u043E\u0444\u0438\u043B\u044F",
    compare_row_profile_bulk_free:
      "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 30 \u043F\u043E\u0441\u0442\u043E\u0432",
    compare_row_profile_bulk_pro:
      "\u0411\u0435\u0437\u043B\u0438\u043C\u0438\u0442\u043D\u043E",
    compare_row_extras:
      "\u0421\u0431\u043E\u0440\u043A\u0430 \u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0445 \u0438 \u0418\u0441\u0442\u043E\u0440\u0438\u0439",
    compare_row_saved:
      "\u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439 \u0441\u0440\u0430\u0437\u0443",
    compare_row_dates:
      "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0435 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u044B \u0434\u0430\u0442",
    compare_row_dates_pro: "7 / 30 / 90 / \u0421\u0432\u043E\u0439",
    trust_no_personal_data:
      "\u041C\u044B \u043D\u0435 \u0441\u043E\u0431\u0438\u0440\u0430\u0435\u043C \u043B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435",
    trust_three_devices:
      "\u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u043D\u0430 3 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430",
    upgrade_plan_monthly: "\u041C\u0435\u0441\u044F\u0447\u043D\u044B\u0439",
    upgrade_plan_yearly: "\u0413\u043E\u0434\u043E\u0432\u043E\u0439",
    upgrade_plan_lifetime: "\u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ \u043C\u0435\u0441 \xB7 \u041E\u0442\u043C\u0435\u043D\u0430 \u0432 \u043B\u044E\u0431\u043E\u0435 \u0432\u0440\u0435\u043C\u044F",
    upgrade_yearly_subtitle:
      "/ \u0433\u043E\u0434 \xB7 \u042D\u043A\u043E\u043D\u043E\u043C\u0438\u044F 58%",
    upgrade_lifetime_subtitle_regular:
      "\u0415\u0434\u0438\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u0442\u0451\u0436 \xB7 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430",
    upgrade_lifetime_card_label:
      "\u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \xB7 \u0420\u0430\u043D\u043D\u044F\u044F \u043F\u0442\u0438\u0446\u0430",
    upgrade_lifetime_savings:
      "\u0415\u0434\u0438\u043D\u043E\u0440\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u0442\u0451\u0436 \xB7 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430",
    upgrade_lifetime_countdown_badge:
      "\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u043E -40% \xB7 \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C {days} \u0434\u043D\u0435\u0439",
    upgrade_btn_choose:
      "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u043B\u0430\u043D",
    upgrade_btn_close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    have_key_prompt: "\u0423\u0436\u0435 \u043A\u0443\u043F\u0438\u043B\u0438?",
    have_key_link: "\u0412\u0432\u0435\u0441\u0442\u0438 license \u2192",
    gate_topk_limit:
      "\u0411\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0430 {limit} \u043F\u043E\u0441\u0442\u0430\u043C\u0438 \u0437\u0430 \u043C\u0430\u0441\u0441\u043E\u0432\u0443\u044E \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 Pro.",
    gate_days_limit:
      "\u0411\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u043C\u0438 {limit} \u0434\u043D\u044F\u043C\u0438. Pro: 90 / 180 \u0434\u043D\u0435\u0439 \u0438\u043B\u0438 \u0441\u0432\u043E\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D.",
    gate_custom_range:
      "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0434\u0430\u0442 \u2014 Pro-\u0444\u0443\u043D\u043A\u0446\u0438\u044F.",
    gate_extras:
      "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0443 \u043F\u0440\u043E\u0444\u0438\u043B\u044F \u2014 \u0444\u0443\u043D\u043A\u0446\u0438\u044F Pro. \u0418\u0441\u0442\u043E\u0440\u0438\u0438 (24\u0447) \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B.",
    gate_all_trial_exhausted:
      '\u0412\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u0438 \u0432\u0441\u0435 {limit} \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0445 \u043F\u043E\u043F\u044B\u0442\u043E\u043A "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0432\u0441\u0451". \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 Pro \u0434\u043B\u044F \u043D\u0435\u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0433\u0440\u0443\u0437\u043E\u043A.',
    gate_saved_multi:
      "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u0439 \u0441\u0440\u0430\u0437\u0443 \u2014 Pro-\u0444\u0443\u043D\u043A\u0446\u0438\u044F. \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u0434\u043D\u0443 \u043A\u043E\u043B\u043B\u0435\u043A\u0446\u0438\u044E \u043C\u043E\u0436\u043D\u043E \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u043E.",
    license_section_title: "Dog Saver Pro",
    license_status_free:
      "\u0411\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F",
    license_status_pro: "Pro \xB7 \u0410\u043A\u0442\u0438\u0432\u043D\u043E",
    license_status_legacy:
      "Pro \xB7 \u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E (\u0440\u0430\u043D\u043D\u0438\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0438\u043A \u2014 \u0441\u043F\u0430\u0441\u0438\u0431\u043E!)",
    license_status_expires:
      "\u0418\u0441\u0442\u0435\u043A\u0430\u0435\u0442 {date}",
    license_status_lifetime:
      "\u041F\u043E\u0436\u0438\u0437\u043D\u0435\u043D\u043D\u0430\u044F \u043B\u0438\u0446\u0435\u043D\u0437\u0438\u044F",
    license_input_placeholder:
      "\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043B\u0438\u0446\u0435\u043D\u0437\u0438\u043E\u043D\u043D\u044B\u0439 \u043A\u043B\u044E\u0447 (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate:
      "\u0410\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    license_btn_activating:
      "\u0410\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F...",
    license_btn_copy:
      "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    license_btn_remove_device:
      "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E",
    license_btn_get_pro: "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C Pro",
    license_btn_get_pro_cta:
      "\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C Pro",
    license_msg_activated:
      "Pro \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D. \u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0437\u0430 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0443 Dog Saver!",
    license_msg_activate_failed:
      "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u0438: {error}",
    license_msg_removed:
      "\u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0443\u0434\u0430\u043B\u0435\u043D\u043E. \u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u043E\u0447\u0438\u0449\u0435\u043D\u0430 \u0438\u0437 \u044D\u0442\u043E\u0433\u043E \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.",
    license_msg_limit_reached_title:
      "\u0414\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442 \u043B\u0438\u043C\u0438\u0442 \u0430\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u0439",
    license_msg_limit_reached_body:
      "\u042D\u0442\u0430 \u043B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u0443\u0436\u0435 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043D\u0430 3 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\u0445. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 Dog Saver \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435 \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\xBB, \u0447\u0442\u043E\u0431\u044B \u043E\u0441\u0432\u043E\u0431\u043E\u0434\u0438\u0442\u044C \u0441\u043B\u043E\u0442.",
    license_help_switch_device:
      "\u041C\u0435\u043D\u044F\u0435\u0442\u0435 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440? \u0421\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 \u043A\u043B\u044E\u0447 \u0432\u044B\u0448\u0435 \u0438 \u0432\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043D\u0430 \u043D\u043E\u0432\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435.",
    license_help_portal:
      "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u043E\u0439 / \u0441\u0431\u0440\u043E\u0441 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432 \u0432 Customer Portal",
    legacy_welcome_title:
      "\u0421\u043F\u0430\u0441\u0438\u0431\u043E, \u0440\u0430\u043D\u043D\u0438\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0438\u043A",
    legacy_welcome_body:
      "\u0412\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0435 Dog Saver \u0441 v{version}. Pro \u043D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D \u0432 \u044D\u0442\u043E\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 \u2014 \u0431\u0435\u0437 \u043E\u043F\u043B\u0430\u0442\u044B.",
    legacy_welcome_warning:
      "\u041F\u043E\u0441\u043A\u043E\u043B\u044C\u043A\u0443 \u043C\u044B \u043D\u0435 \u0441\u043E\u0431\u0438\u0440\u0430\u0435\u043C \u043B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435, \u0432\u0430\u0448 \u0441\u0442\u0430\u0442\u0443\u0441 \u0440\u0430\u043D\u043D\u0435\u0433\u043E \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0438\u043A\u0430 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D \u043A \u044D\u0442\u043E\u0439 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 Chrome. \u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 Dog Saver \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u0438\u0432\u0435\u0441\u0442\u0438 \u043A \u043F\u043E\u0442\u0435\u0440\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u0430.",
    legacy_welcome_btn_done: "\u041F\u043E\u043D\u044F\u0442\u043D\u043E",
    legacy_welcome_btn_review:
      "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432 \u0432 Chrome Web Store",
    legacy_thanks_title:
      "\u0421\u043F\u0430\u0441\u0438\u0431\u043E, \u0440\u0430\u043D\u043D\u0438\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0438\u043A",
    legacy_thanks_message:
      "\u0412\u044B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0435 Dog Saver \u0441 v{version}. Pro \u043D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D \u2014 \u0431\u0435\u0437 \u043E\u043F\u043B\u0430\u0442\u044B. \u0415\u0441\u043B\u0438 \u044D\u0442\u043E\u0442 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 \u0431\u044B\u043B \u043F\u043E\u043B\u0435\u0437\u0435\u043D, \u043A\u0440\u0430\u0442\u043A\u0438\u0439 \u043E\u0442\u0437\u044B\u0432 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u043D\u0430\u043C \u043E\u0441\u0442\u0430\u0432\u0430\u0442\u044C\u0441\u044F \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u043C\u0438.",
    legacy_thanks_btn_review:
      "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432",
    legacy_thanks_btn_done: "\u041F\u043E\u043D\u044F\u0442\u043D\u043E",
  };
  var Ke = {
    btn_download_all: "T\xFCm\xFCn\xFC \u0130ndir",
    aria_download_hd_avatar: "HD avatar\u0131 indir",
    notify_avatar_failed: "HD avatar al\u0131namad\u0131",
    notify_avatar_success: "HD avatar indirildi",
    aria_download_post: "Bu g\xF6nderiyi indir",
    aria_download_post_zip: "Bu g\xF6nderiyi indir (ZIP)",
    aria_download_reel: "Bu Reeli indir",
    tooltip_sponsored_not_downloadable: "Sponsorlu i\xE7erik indirilemez",
    notify_post_media_failed: "G\xF6nderinin medyas\u0131 al\u0131namad\u0131",
    notify_downloaded_n_files_zip: "{count} dosya indirildi (ZIP)",
    notify_downloaded_1_file: "1 dosya indirildi",
    notify_download_failed: "\u0130ndirme ba\u015Far\u0131s\u0131z: {error}",
    dialog_title: "@{username} kullan\u0131c\u0131s\u0131n\u0131 indir",
    dialog_media_type: "Medya t\xFCr\xFC",
    dialog_media_all: "T\xFCm\xFC (Foto\u011Fraf + Video)",
    dialog_media_photos: "Yaln\u0131zca foto\u011Fraflar",
    dialog_media_videos: "Yaln\u0131zca videolar",
    dialog_save_method: "Kaydetme y\xF6ntemi",
    dialog_save_grouped: "G\xF6nderi ba\u015F\u0131na bir klas\xF6r",
    dialog_save_flat: "T\xFCm dosyalar tek klas\xF6rde",
    dialog_range: "\u0130ndirme aral\u0131\u011F\u0131",
    dialog_range_all: "T\xFCm\xFCn\xFC indir",
    dialog_range_all_trial_remaining:
      "{base} (\xFCcretsiz deneme: {remaining} kald\u0131)",
    dialog_range_topk: "\u0130lk N g\xF6nderi (en yeniler \xF6nce)",
    dialog_range_last_n_days: "Son N g\xFCn i\xE7inde",
    dialog_range_custom: "\xD6zel tarih aral\u0131\u011F\u0131",
    dialog_post_count: "G\xF6nderi say\u0131s\u0131",
    dialog_recent_days: "Son g\xFCnler",
    dialog_days_7: "7 g\xFCn",
    dialog_days_30: "30 g\xFCn",
    dialog_days_90: "90 g\xFCn",
    dialog_days_180: "180 g\xFCn",
    dialog_start_date: "Ba\u015Flang\u0131\xE7 tarihi",
    dialog_end_date: "Biti\u015F tarihi",
    dialog_btn_start: "\u0130ndirmeyi Ba\u015Flat",
    dialog_btn_cancel: "\u0130ptal",
    dialog_extras: "Ayr\u0131ca dahil et",
    dialog_include_highlights: "T\xFCm \xF6ne \xE7\u0131kanlar",
    dialog_include_stories: "Aktif hikayeler (24s)",
    status_scanning: "G\xF6nderiler taran\u0131yor...",
    status_posts_found: "0 g\xF6nderi bulundu",
    status_count: "{posts} g\xF6nderi \xB7 {media} dosya",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to: "{date} tarihine kadar tarand\u0131",
    status_loading_next: "Sonraki sayfa y\xFCkleniyor...",
    status_loading_first: "\u0130lk sayfa y\xFCkleniyor...",
    status_rate_limited_scroll:
      "API s\u0131n\u0131rland\u0131, kayd\u0131rma moduna ge\xE7iliyor...",
    status_rate_limited_retry:
      "Instagram h\u0131z s\u0131n\u0131r\u0131 uygulad\u0131, {seconds}s i\xE7inde yeniden deneniyor...",
    status_processing: "\u0130\u015Fleniyor...",
    status_waiting_next: "Sonraki sayfa bekleniyor...",
    status_scan_complete:
      "Tarama tamamland\u0131, indirmeler s\u0131raya al\u0131nd\u0131",
    status_saving_scanned: "Taranan i\xE7erik kaydediliyor...",
    status_stopped: "Durduruldu",
    notify_started: "@{username} indirmesi ba\u015Flat\u0131ld\u0131",
    notify_switched_scroll:
      "API s\u0131n\u0131rland\u0131, kayd\u0131rma moduna ge\xE7ildi",
    notify_multi_zip:
      "Dosyalar {chunkSize} s\u0131n\u0131r\u0131n\u0131 a\u015Ft\u0131, birden fazla ZIP'e b\xF6l\xFCnecek (~{parts}+)",
    notify_found_posts: "{posts} g\xF6nderi ({media} dosya) bulundu",
    notify_error: "Hata: {message}",
    notify_pagination_error: "Sayfalama hatas\u0131: {message}",
    scroll_loading_more:
      "Daha fazla g\xF6nderi y\xFCklemek i\xE7in kayd\u0131r\u0131l\u0131yor...",
    scroll_parsing_post:
      "G\xF6nderi ayr\u0131\u015Ft\u0131r\u0131l\u0131yor {current}/{total}: {shortcode}",
    scroll_got_records:
      "Sayfadan {count} g\xF6nderi kayd\u0131 al\u0131nd\u0131",
    rate_wait: "\u0130stekler \xE7ok s\u0131k, {seconds}s bekleniyor...",
    parse_html_error:
      "Instagram beklenmedik i\xE7erik d\xF6nd\xFCrd\xFC. Giri\u015F yapt\u0131\u011F\u0131n\u0131z\u0131 do\u011Frulay\u0131n ve sayfay\u0131 yenileyin.",
    zip_no_files: "ZIP'te indirilebilecek dosya yok",
    aria_download: "\u0130ndir",
    story_download_highlight: "T\xFCm\xFCn\xFC Kaydet",
    story_download_all: "T\xFCm\xFCn\xFC Kaydet",
    notify_story_failed: "Bu hikaye al\u0131namad\u0131",
    notify_story_success: "Hikaye indirildi",
    story_downloading: "\u0130ndiriliyor...",
    notify_highlight_id_failed:
      "\xD6ne \xE7\u0131kar\u0131lan ID al\u0131namad\u0131",
    notify_username_failed: "Kullan\u0131c\u0131 ad\u0131 al\u0131namad\u0131",
    notify_user_data_failed:
      "Kullan\u0131c\u0131 verileri al\u0131namad\u0131 (gizli hesap olabilir)",
    notify_highlight_empty:
      "Bu \xF6ne \xE7\u0131kar\u0131lan\u0131n i\xE7eri\u011Fi yok",
    notify_no_stories:
      "Bu kullan\u0131c\u0131n\u0131n \u015Fu anda hikayesi yok",
    highlight_untitled: "Ba\u015Fl\u0131ks\u0131z \xF6ne \xE7\u0131kan",
    progress_extras_start: "Ek i\xE7erikler haz\u0131rlan\u0131yor...",
    progress_stories_fetching: "Aktif hikayeler al\u0131n\u0131yor...",
    progress_stories_packing:
      "{count} hikaye dosyas\u0131 ZIP'e paketleniyor...",
    progress_highlights_fetching_tray:
      "\xD6ne \xE7\u0131kanlar listesi al\u0131n\u0131yor...",
    progress_highlight_fetching:
      "\xD6ne \xE7\u0131kan {current}/{total}: {title}",
    progress_highlights_packing:
      "{count} \xF6ne \xE7\u0131kan dosyas\u0131 ZIP'e paketleniyor...",
    progress_highlights_packing_named:
      "Paketleniyor: {title} ({current}/{total})",
    task_label_highlights: "\xD6ne \xC7\u0131kanlar",
    task_label_stories: "Hik\xE2yeler",
    popup_subtitle: "Instagram medyas\u0131n\u0131 toplu indir",
    popup_empty_title: "\u0130ndirme g\xF6revi yok",
    popup_empty_desc: `Herkese a\xE7\u0131k bir Instagram profil sayfas\u0131na gidin
ve "T\xFCm\xFCn\xFC \u0130ndir" d\xFC\u011Fmesine t\u0131klay\u0131n`,
    popup_settings: "Ayarlar",
    popup_settings_advanced: "Geli\u015Fmi\u015F",
    popup_concurrency: "E\u015F zamanl\u0131 indirmeler",
    popup_max_retries: "Maks. yeniden deneme",
    popup_zip_chunk: "ZIP par\xE7a boyutu",
    popup_zip_chunk_tip:
      "ZIP ba\u015F\u0131na maksimum dosya say\u0131s\u0131. \u0130ndirme bu s\u0131n\u0131r\u0131 a\u015Ft\u0131\u011F\u0131nda otomatik olarak birden fazla ZIP'e b\xF6l\xFCn\xFCr.",
    popup_zip_no_split: "B\xF6lme",
    popup_language: "Dil",
    popup_footer: "Dog Saver v{version} \xB7 Yaln\u0131zca yerel, izleme yok",
    task_scanning: "Taran\u0131yor... {found}",
    task_scanning_found: "{count} dosya bulundu",
    task_batches_done: "{count} toplu i\u015Flem tamamland\u0131",
    task_zipping: "ZIP olu\u015Fturuluyor...{percent}",
    task_packing: "{current}/{total} dosya paketleniyor...",
    task_batches_done_parens: "({count} toplu i\u015Flem tamamland\u0131)",
    task_creating_zip: "ZIP olu\u015Fturuluyor... {total} dosya",
    task_downloaded: "{done}/{total} dosya indirildi",
    task_failed: "{count} ba\u015Far\u0131s\u0131z",
    task_in_progress: "{count} devam ediyor",
    task_zips: "{count} ZIP",
    task_status_running: "\xC7al\u0131\u015F\u0131yor",
    task_status_paused: "Duraklat\u0131ld\u0131",
    task_status_done: "Tamamland\u0131",
    task_status_stopped: "Durduruldu",
    task_status_saving: "Kaydediliyor...",
    task_status_auto_paused:
      "Duraklat\u0131ld\u0131 (sekme kapat\u0131ld\u0131)",
    status_auto_resume: "@{username} i\xE7in tarama devam ettiriliyor...",
    task_btn_pause: "Duraklat",
    task_btn_resume: "Devam Et",
    task_btn_stop: "Durdur",
    task_stop_confirm:
      "Durmadan \xF6nce taranan {count} g\xF6nderi indirilsin mi?",
    task_stop_download: "\u0130ndir ve Durdur",
    task_stop_discard: "Sil ve Durdur",
    task_stop_preparing: "\u0130ndirme haz\u0131rlan\u0131yor...",
    error_no_avatar_url: "Avatar URL'si bulunamad\u0131",
    error_no_media_items: "\u0130ndirilecek medya \xF6\u011Fesi yok",
    error_no_story_items: "\u0130ndirilecek hikaye \xF6\u011Fesi yok",
    error_unknown_message: "Bilinmeyen mesaj t\xFCr\xFC",
    error_zip_build_failed: "ZIP olu\u015Fturulamad\u0131",
    btn_download_saved: "Kaydedilenleri \u0130ndir",
    btn_download_collection: "Koleksiyonu \u0130ndir",
    dialog_saved_title: "Kaydedilen G\xF6nderileri \u0130ndir",
    dialog_select_collections: "Koleksiyonlar\u0131 se\xE7",
    dialog_select_all: "T\xFCm\xFCn\xFC Se\xE7",
    dialog_deselect_all: "T\xFCm\xFCn\xFCn Se\xE7imini Kald\u0131r",
    dialog_collection_count: "{count} \xF6\u011Fe",
    status_collection_progress: "Koleksiyon: {name}",
    dialog_saved_folder_mode: "Kaydetme y\xF6ntemi",
    dialog_saved_folder_per_post: "G\xF6nderi ba\u015F\u0131na bir klas\xF6r",
    dialog_saved_folder_per_collection:
      "Koleksiyon ba\u015F\u0131na bir klas\xF6r",
    notify_fetching_collections: "Koleksiyonlar getiriliyor...",
    notify_no_collections: "Kaydedilmi\u015F koleksiyon bulunamad\u0131",
    review_title: "Dog Saver'\u0131 be\u011Feniyor musunuz?",
    review_message:
      "{count} indirme tamamlad\u0131n\u0131z! Bu ara\xE7 i\u015Finize yarad\u0131ysa Chrome Web Store'da k\u0131sa bir yorum b\u0131rakman\u0131z \xE7ok de\u011Ferli olurdu. Deste\u011Finiz Dog Saver'\u0131 \xFCcretsiz ve geli\u015Fen tutmaya yard\u0131mc\u0131 oluyor.",
    review_btn_rate: "Yorum Yaz",
    review_btn_later: "Belki Sonra",
    review_btn_never: "Bir Daha Sorma",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Kilitli De\u011Fil",
    upgrade_title: "Dog Saver Pro'ya Y\xFCkselt",
    upgrade_title_benefit: "Sevdiklerinizi eksiksiz kaydedin",
    upgrade_subtitle:
      "S\u0131n\u0131rs\u0131z toplu indirme ve geli\u015Fmi\u015F \xF6zelliklerin kilidini a\xE7\u0131n",
    upgrade_feature_unlimited: "S\u0131n\u0131rs\u0131z Profil toplu indirme",
    upgrade_feature_extras:
      "T\xFCm \xD6ne \xC7\u0131kanlar ve Hikayeleri tek t\u0131kla paketle",
    upgrade_feature_saved: "\xC7oklu koleksiyon toplu indirme",
    upgrade_feature_dates:
      "\xD6zel tarih aral\u0131klar\u0131 (90 / 180 g\xFCn / \xF6zel)",
    compare_header_feature: "\xD6zellik",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Tekli indirme (G\xF6nderi / Reel / Hikaye)",
    compare_row_highlight: "Tekli Highlight",
    compare_row_single_collection: "Tek koleksiyon indirme",
    compare_row_profile_bulk: "Profil toplu indirme",
    compare_row_profile_bulk_free: "Son 30 g\xF6nderi",
    compare_row_profile_bulk_pro: "S\u0131n\u0131rs\u0131z",
    compare_row_extras: "\xD6ne \xC7\u0131kanlar ve Hikayeler paketi",
    compare_row_saved: "\xC7oklu koleksiyon toplu indirme",
    compare_row_dates: "\xD6zel tarih aral\u0131klar\u0131",
    compare_row_dates_pro: "7 / 30 / 90 / \xD6zel",
    trust_no_personal_data: "Ki\u015Fisel veri toplam\u0131yoruz",
    trust_three_devices: "3 cihaz lisans\u0131",
    upgrade_plan_monthly: "Ayl\u0131k",
    upgrade_plan_yearly: "Y\u0131ll\u0131k",
    upgrade_plan_lifetime: "\xD6m\xFCr Boyu",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ ay \xB7 \u0130stedi\u011Finiz zaman iptal edin",
    upgrade_yearly_subtitle: "/ y\u0131l \xB7 %58 Tasarruf",
    upgrade_lifetime_subtitle_regular: "Tek seferlik \xF6deme \xB7 Sonsuza dek",
    upgrade_lifetime_card_label: "\xD6m\xFCr Boyu \xB7 Erken Ku\u015F",
    upgrade_lifetime_savings: "Tek seferlik \xF6deme \xB7 Sonsuza dek",
    upgrade_lifetime_countdown_badge:
      "S\u0131n\u0131rl\u0131 -%40 \xB7 {days} g\xFCn kald\u0131",
    upgrade_btn_choose: "Plan Se\xE7",
    upgrade_btn_close: "Kapat",
    have_key_prompt: "Sat\u0131n ald\u0131n\u0131z m\u0131?",
    have_key_link: "License girin \u2192",
    gate_topk_limit:
      "\xDCcretsiz s\xFCr\xFCm toplu indirme ba\u015F\u0131na {limit} g\xF6nderi ile s\u0131n\u0131rl\u0131d\u0131r. Pro'ya y\xFCkseltin.",
    gate_days_limit:
      "\xDCcretsiz s\xFCr\xFCm son {limit} g\xFCnle s\u0131n\u0131rl\u0131d\u0131r. Pro 90 / 180 g\xFCn veya \xF6zel aral\u0131k sunar.",
    gate_custom_range:
      "\xD6zel tarih aral\u0131\u011F\u0131 bir Pro \xF6zelli\u011Fidir.",
    gate_extras:
      "\xD6ne \xC7\u0131kanlar\u0131 profil indirmesine dahil etmek bir Pro \xF6zelli\u011Fidir. Hikayeler (24 saat) \xFCcretsizdir.",
    gate_all_trial_exhausted: `{limit} \xFCcretsiz "T\xFCm\xFCn\xFC \u0130ndir" denemesini kulland\u0131n\u0131z. S\u0131n\u0131rs\u0131z toplu indirmeler i\xE7in Pro'ya y\xFCkseltin.`,
    gate_saved_multi:
      "Birden fazla koleksiyonu ayn\u0131 anda indirmek bir Pro \xF6zelli\u011Fidir. Tek bir koleksiyona t\u0131klayarak \xFCcretsiz indirebilirsiniz.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "\xDCcretsiz s\xFCr\xFCm",
    license_status_pro: "Pro \xB7 Aktif",
    license_status_legacy:
      "Pro \xB7 Kilitli De\u011Fil (Erken destek\xE7i \u2014 te\u015Fekk\xFCrler!)",
    license_status_expires: "Biti\u015F tarihi {date}",
    license_status_lifetime: "\xD6m\xFCr boyu lisans",
    license_input_placeholder:
      "Lisans anahtar\u0131n\u0131z\u0131 yap\u0131\u015Ft\u0131r\u0131n (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Etkinle\u015Ftir",
    license_btn_activating: "Etkinle\u015Ftiriliyor...",
    license_btn_copy: "Kopyala",
    license_btn_remove_device: "Bu cihaz\u0131 kald\u0131r",
    license_btn_get_pro: "Pro'yu Al",
    license_btn_get_pro_cta: "Pro'yu Al",
    license_msg_activated:
      "Pro etkinle\u015Ftirildi. Dog Saver'\u0131 destekledi\u011Finiz i\xE7in te\u015Fekk\xFCrler!",
    license_msg_activate_failed:
      "Etkinle\u015Ftirme ba\u015Far\u0131s\u0131z: {error}",
    license_msg_removed:
      "Cihaz kald\u0131r\u0131ld\u0131. Lisans bu taray\u0131c\u0131dan silindi.",
    license_msg_limit_reached_title:
      "Aktivasyon s\u0131n\u0131r\u0131na ula\u015F\u0131ld\u0131",
    license_msg_limit_reached_body: `Bu lisans zaten 3 cihazda etkinle\u015Ftirilmi\u015F. Dog Saver'\u0131 ba\u015Fka bir cihazda a\xE7\u0131n ve bir yer a\xE7mak i\xE7in "Bu cihaz\u0131 kald\u0131r"a t\u0131klay\u0131n.`,
    license_help_switch_device:
      "Bilgisayar m\u0131 de\u011Fi\u015Ftiriyorsunuz? Yukar\u0131daki anahtar\u0131 kopyalay\u0131p yeni cihaza yap\u0131\u015Ft\u0131r\u0131n.",
    license_help_portal:
      "Aboneli\u011Fi y\xF6net / cihazlar\u0131 s\u0131f\u0131rla \u2192 M\xFC\u015Fteri Portal\u0131",
    legacy_welcome_title: "Te\u015Fekk\xFCrler, erken destek\xE7i",
    legacy_welcome_body:
      "Dog Saver'\u0131 v{version}'dan beri kullan\u0131yorsunuz. Pro bu kurulumda kal\u0131c\u0131 olarak a\xE7\u0131k \u2014 \xF6deme gerekmiyor.",
    legacy_welcome_warning:
      "Ki\u015Fisel bilgi toplamad\u0131\u011F\u0131m\u0131z i\xE7in erken destek\xE7i durumunuz bu Chrome kurulumuna ba\u011Fl\u0131d\u0131r. Dog Saver'\u0131 kald\u0131rmak bu stat\xFCy\xFC kaybettirebilir.",
    legacy_welcome_btn_done: "Anlad\u0131m",
    legacy_welcome_btn_review: "Chrome Web Store'da yorum b\u0131rak",
    legacy_thanks_title: "Te\u015Fekk\xFCrler, erken destek\xE7i",
    legacy_thanks_message:
      "Dog Saver'\u0131 v{version}'dan beri kullan\u0131yorsunuz. Pro kal\u0131c\u0131 olarak a\xE7\u0131k \u2014 \xF6deme gerekmiyor. Bu ara\xE7 i\u015Finize yarad\u0131ysa k\u0131sa bir yorum \xFCcretsiz kalmam\u0131za yard\u0131mc\u0131 olur.",
    legacy_thanks_btn_review: "Yorum b\u0131rak",
    legacy_thanks_btn_done: "Anlad\u0131m",
  };
  var Ve = {
    btn_download_all: "Scarica tutto",
    aria_download_hd_avatar: "Scarica avatar HD",
    notify_avatar_failed: "Impossibile ottenere l'avatar HD",
    notify_avatar_success: "Avatar HD scaricato",
    aria_download_post: "Scarica questo post",
    aria_download_post_zip: "Scarica questo post (ZIP)",
    aria_download_reel: "Scarica questo Reel",
    tooltip_sponsored_not_downloadable:
      "Il contenuto sponsorizzato non pu\xF2 essere scaricato",
    notify_post_media_failed: "Impossibile ottenere il media del post",
    notify_downloaded_n_files_zip: "{count} file scaricati (ZIP)",
    notify_downloaded_1_file: "1 file scaricato",
    notify_download_failed: "Download fallito: {error}",
    dialog_title: "Scarica @{username}",
    dialog_media_type: "Tipo di media",
    dialog_media_all: "Tutto (Foto + Video)",
    dialog_media_photos: "Solo foto",
    dialog_media_videos: "Solo video",
    dialog_save_method: "Metodo di salvataggio",
    dialog_save_grouped: "Una cartella per post",
    dialog_save_flat: "Tutti i file in una cartella",
    dialog_range: "Intervallo di download",
    dialog_range_all: "Scarica tutto",
    dialog_range_all_trial_remaining:
      "{base} (prova gratuita: {remaining} rimanenti)",
    dialog_range_topk: "Primi N post (dal pi\xF9 recente)",
    dialog_range_last_n_days: "Negli ultimi N giorni",
    dialog_range_custom: "Intervallo di date personalizzato",
    dialog_post_count: "Numero di post",
    dialog_recent_days: "Giorni recenti",
    dialog_days_7: "7 giorni",
    dialog_days_30: "30 giorni",
    dialog_days_90: "90 giorni",
    dialog_days_180: "180 giorni",
    dialog_start_date: "Data inizio",
    dialog_end_date: "Data fine",
    dialog_btn_start: "Avvia download",
    dialog_btn_cancel: "Annulla",
    dialog_extras: "Includi anche",
    dialog_include_highlights: "Tutte le evidenziazioni",
    dialog_include_stories: "Storie attive (24h)",
    status_scanning: "Scansione post...",
    status_posts_found: "0 post trovati",
    status_count: "{posts} post \xB7 {media} file",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to: "Scansionato fino al {date}",
    status_loading_next: "Caricamento pagina successiva...",
    status_loading_first: "Caricamento prima pagina...",
    status_rate_limited_scroll:
      "API limitata, passaggio alla modalit\xE0 scroll...",
    status_rate_limited_retry:
      "Instagram ha limitato le richieste, nuovo tentativo in {seconds}s...",
    status_processing: "Elaborazione...",
    status_waiting_next: "Attesa pagina successiva...",
    status_scan_complete: "Scansione completata, download in coda",
    status_saving_scanned: "Salvataggio contenuto scansionato...",
    status_stopped: "Interrotto",
    notify_started: "Download di @{username} avviato",
    notify_switched_scroll: "API limitata, passato alla modalit\xE0 scroll",
    notify_multi_zip:
      "I file superano {chunkSize}, verr\xE0 suddiviso in pi\xF9 ZIP (~{parts}+)",
    notify_found_posts: "Trovati {posts} post ({media} file)",
    notify_error: "Errore: {message}",
    notify_pagination_error: "Errore di paginazione: {message}",
    scroll_loading_more: "Scorrimento per caricare altri post...",
    scroll_parsing_post: "Analisi post {current}/{total}: {shortcode}",
    scroll_got_records: "Ottenuti {count} record post dalla pagina",
    rate_wait: "Richieste troppo frequenti, attesa di {seconds}s...",
    parse_html_error:
      "Instagram ha restituito contenuto inatteso. Verifica di essere connesso e aggiorna la pagina.",
    zip_no_files: "Nessun file scaricabile nel ZIP",
    aria_download: "Scarica",
    story_download_highlight: "Salva tutto",
    story_download_all: "Salva tutto",
    notify_story_failed: "Impossibile ottenere questa storia",
    notify_story_success: "Storia scaricata",
    story_downloading: "Download in corso...",
    notify_highlight_id_failed: "Impossibile ottenere l'ID dell'evidenziazione",
    notify_username_failed: "Impossibile ottenere il nome utente",
    notify_user_data_failed:
      "Impossibile ottenere i dati utente (possibile account privato)",
    notify_highlight_empty: "Questa evidenziazione non ha contenuto",
    notify_no_stories: "Questo utente non ha storie al momento",
    highlight_untitled: "Evidenziazione senza titolo",
    progress_extras_start: "Preparazione contenuti aggiuntivi...",
    progress_stories_fetching: "Recupero storie attive...",
    progress_stories_packing:
      "Impacchettamento di {count} file di storie in ZIP...",
    progress_highlights_fetching_tray: "Recupero elenco evidenziazioni...",
    progress_highlight_fetching: "Evidenziazione {current}/{total}: {title}",
    progress_highlights_packing:
      "Impacchettamento di {count} file di evidenziazioni in ZIP...",
    progress_highlights_packing_named:
      "Impacchettamento: {title} ({current}/{total})",
    task_label_highlights: "In evidenza",
    task_label_stories: "Storie",
    popup_subtitle: "Download massivo di media da Instagram",
    popup_empty_title: "Nessun task di download",
    popup_empty_desc: `Vai a una pagina profilo pubblica di Instagram
e clicca il pulsante "Scarica tutto"`,
    popup_settings: "Impostazioni",
    popup_settings_advanced: "Avanzate",
    popup_concurrency: "Download simultanei",
    popup_max_retries: "Max tentativi",
    popup_zip_chunk: "Dimensione chunk ZIP",
    popup_zip_chunk_tip:
      "Numero massimo di file per ZIP. Quando un download supera questo limite, verr\xE0 automaticamente suddiviso in pi\xF9 ZIP.",
    popup_zip_no_split: "Nessuna suddivisione",
    popup_language: "Lingua",
    popup_footer: "Dog Saver v{version} \xB7 Solo locale, nessun tracciamento",
    task_scanning: "Scansione... {found}",
    task_scanning_found: "Trovati {count} file",
    task_batches_done: "{count} batch completati",
    task_zipping: "Creazione ZIP...{percent}",
    task_packing: "Impacchettamento {current}/{total} file...",
    task_batches_done_parens: "({count} batch completati)",
    task_creating_zip: "Creazione ZIP... {total} file",
    task_downloaded: "Scaricati {done}/{total} file",
    task_failed: "{count} falliti",
    task_in_progress: "{count} in corso",
    task_zips: "{count} ZIP",
    task_status_running: "In esecuzione",
    task_status_paused: "In pausa",
    task_status_done: "Completato",
    task_status_stopped: "Interrotto",
    task_status_saving: "Salvataggio...",
    task_status_auto_paused: "In pausa (scheda chiusa)",
    status_auto_resume: "Ripresa scansione per @{username}...",
    task_btn_pause: "Pausa",
    task_btn_resume: "Riprendi",
    task_btn_stop: "Interrompi",
    task_stop_confirm:
      "Scaricare {count} post scansionati prima di interrompere?",
    task_stop_download: "Scarica e interrompi",
    task_stop_discard: "Scarta e interrompi",
    task_stop_preparing: "Preparazione download...",
    error_no_avatar_url: "URL avatar non trovato",
    error_no_media_items: "Nessun media da scaricare",
    error_no_story_items: "Nessuna storia da scaricare",
    error_unknown_message: "Tipo di messaggio sconosciuto",
    error_zip_build_failed: "Creazione ZIP fallita",
    btn_download_saved: "Scarica salvati",
    btn_download_collection: "Scarica collezione",
    dialog_saved_title: "Scarica post salvati",
    dialog_select_collections: "Seleziona collezioni",
    dialog_select_all: "Seleziona tutto",
    dialog_deselect_all: "Deseleziona tutto",
    dialog_collection_count: "{count} elementi",
    status_collection_progress: "Collezione: {name}",
    dialog_saved_folder_mode: "Metodo di salvataggio",
    dialog_saved_folder_per_post: "Una cartella per post",
    dialog_saved_folder_per_collection: "Una cartella per collezione",
    notify_fetching_collections: "Recupero collezioni...",
    notify_no_collections: "Nessuna collezione salvata trovata",
    review_title: "Ti piace Dog Saver?",
    review_message:
      "Hai completato {count} download! Se questo strumento ti \xE8 stato utile, una breve recensione sul Chrome Web Store sarebbe molto apprezzata. Il tuo supporto aiuta a mantenere Dog Saver gratuito e in continuo miglioramento.",
    review_btn_rate: "Lascia una recensione",
    review_btn_later: "Forse dopo",
    review_btn_never: "Non chiedere pi\xF9",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 Sbloccato",
    upgrade_title: "Passa a Dog Saver Pro",
    upgrade_title_benefit: "Salva ci\xF2 che ami, completamente",
    upgrade_subtitle:
      "Sblocca download in blocco illimitati e funzioni avanzate",
    upgrade_feature_unlimited: "Download in blocco del Profilo illimitati",
    upgrade_feature_extras:
      "Raggruppa tutti gli In Evidenza e le Storie con un clic",
    upgrade_feature_saved: "Download in blocco multi-collezione",
    upgrade_feature_dates:
      "Intervalli di data personalizzati (90 / 180 giorni / personalizzato)",
    compare_header_feature: "Funzione",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single: "Download singolo (Post / Reel / Storia)",
    compare_row_highlight: "Highlight singolo",
    compare_row_single_collection: "Download di una collezione",
    compare_row_profile_bulk: "Download in blocco del Profilo",
    compare_row_profile_bulk_free: "Ultimi 30 post",
    compare_row_profile_bulk_pro: "Illimitato",
    compare_row_extras: "Raggruppa In Evidenza e Storie",
    compare_row_saved: "Multi-collezione in blocco",
    compare_row_dates: "Intervalli di data personalizzati",
    compare_row_dates_pro: "7 / 30 / 90 / Personalizzato",
    trust_no_personal_data: "Non raccogliamo dati personali",
    trust_three_devices: "Licenza per 3 dispositivi",
    upgrade_plan_monthly: "Mensile",
    upgrade_plan_yearly: "Annuale",
    upgrade_plan_lifetime: "A vita",
    upgrade_price_monthly: "$3,99",
    upgrade_price_yearly: "$19,99",
    upgrade_price_lifetime: "$24,99",
    upgrade_price_lifetime_early: "$14,99",
    upgrade_monthly_subtitle: "/ mese \xB7 Disdici in qualsiasi momento",
    upgrade_yearly_subtitle: "/ anno \xB7 Risparmia 58%",
    upgrade_lifetime_subtitle_regular: "Pagamento unico \xB7 Per sempre",
    upgrade_lifetime_card_label: "A vita \xB7 Early Bird",
    upgrade_lifetime_savings: "Pagamento unico \xB7 Per sempre",
    upgrade_lifetime_countdown_badge:
      "Limitato -40% \xB7 {days} giorni rimasti",
    upgrade_btn_choose: "Scegli piano",
    upgrade_btn_close: "Chiudi",
    have_key_prompt: "Gi\xE0 acquistato?",
    have_key_link: "Inserisci la license \u2192",
    gate_topk_limit:
      "La versione gratuita \xE8 limitata a {limit} post per download in blocco. Passa a Pro.",
    gate_days_limit:
      "La versione gratuita \xE8 limitata agli ultimi {limit} giorni. Pro consente 90 / 180 giorni o intervallo personalizzato.",
    gate_custom_range:
      "L'intervallo di date personalizzato \xE8 una funzione Pro.",
    gate_extras:
      "Includere le Storie in evidenza nel download del profilo \xE8 una funzione Pro. Le Storie (24h) sono gratis.",
    gate_all_trial_exhausted:
      'Hai usato tutte le {limit} prove gratuite di "Scarica tutto". Passa a Pro per download illimitati.',
    gate_saved_multi:
      "Scaricare pi\xF9 collezioni contemporaneamente \xE8 una funzione Pro. Apri una singola collezione per scaricarla gratuitamente.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Versione gratuita",
    license_status_pro: "Pro \xB7 Attivo",
    license_status_legacy:
      "Pro \xB7 Sbloccato (Sostenitore iniziale \u2014 grazie!)",
    license_status_expires: "Scade il {date}",
    license_status_lifetime: "Licenza a vita",
    license_input_placeholder:
      "Incolla la tua chiave di licenza (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "Attiva",
    license_btn_activating: "Attivazione...",
    license_btn_copy: "Copia",
    license_btn_remove_device: "Rimuovi questo dispositivo",
    license_btn_get_pro: "Ottieni Pro",
    license_btn_get_pro_cta: "Ottieni Pro",
    license_msg_activated: "Pro attivato. Grazie per supportare Dog Saver!",
    license_msg_activate_failed: "Attivazione non riuscita: {error}",
    license_msg_removed:
      "Dispositivo rimosso. Licenza eliminata da questo browser.",
    license_msg_limit_reached_title: "Limite di attivazione raggiunto",
    license_msg_limit_reached_body:
      'Questa licenza \xE8 gi\xE0 attivata su 3 dispositivi. Apri Dog Saver su un altro dispositivo e clicca "Rimuovi questo dispositivo" per liberare uno slot.',
    license_help_switch_device:
      "Cambi computer? Copia la chiave qui sopra e incollala sul nuovo dispositivo.",
    license_help_portal:
      "Gestisci abbonamento / reimposta dispositivi nel Portale Clienti",
    legacy_welcome_title: "Grazie, sostenitore iniziale",
    legacy_welcome_body:
      "Usi Dog Saver dalla v{version}. Pro \xE8 sbloccato definitivamente su questa installazione \u2014 nessun pagamento richiesto.",
    legacy_welcome_warning:
      "Non raccogliendo informazioni personali, il tuo status di sostenitore iniziale \xE8 legato a questa installazione di Chrome. Disinstallare Dog Saver potrebbe farlo decadere.",
    legacy_welcome_btn_done: "Capito",
    legacy_welcome_btn_review: "Lascia una recensione su Chrome Web Store",
    legacy_thanks_title: "Grazie, sostenitore iniziale",
    legacy_thanks_message:
      "Usi Dog Saver dalla v{version}. Pro \xE8 sbloccato definitivamente \u2014 nessun pagamento necessario. Se questo strumento ti \xE8 stato utile, una breve recensione ci aiuta a mantenerlo gratuito.",
    legacy_thanks_btn_review: "Lascia una recensione",
    legacy_thanks_btn_done: "Capito",
  };
  var We = {
    btn_download_all:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    aria_download_hd_avatar:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2D\u0E27\u0E32\u0E15\u0E32\u0E23\u0E4C HD",
    notify_avatar_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2D\u0E27\u0E32\u0E15\u0E32\u0E23\u0E4C HD \u0E44\u0E14\u0E49",
    notify_avatar_success:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2D\u0E27\u0E32\u0E15\u0E32\u0E23\u0E4C HD \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
    aria_download_post:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E19\u0E35\u0E49",
    aria_download_post_zip:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E19\u0E35\u0E49 (ZIP)",
    aria_download_reel:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 Reel \u0E19\u0E35\u0E49",
    tooltip_sponsored_not_downloadable:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19",
    notify_post_media_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E37\u0E48\u0E2D\u0E02\u0E2D\u0E07\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E44\u0E14\u0E49",
    notify_downloaded_n_files_zip:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 {count} \u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08 (ZIP)",
    notify_downloaded_1_file:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 1 \u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
    notify_download_failed:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27: {error}",
    dialog_title:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 @{username}",
    dialog_media_type:
      "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E2A\u0E37\u0E48\u0E2D",
    dialog_media_all:
      "\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14 (\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E + \u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D)",
    dialog_media_photos:
      "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E",
    dialog_media_videos:
      "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D",
    dialog_save_method:
      "\u0E27\u0E34\u0E18\u0E35\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01",
    dialog_save_grouped:
      "\u0E41\u0E22\u0E01\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E15\u0E32\u0E21\u0E42\u0E1E\u0E2A\u0E15\u0E4C",
    dialog_save_flat:
      "\u0E23\u0E27\u0E21\u0E17\u0E38\u0E01\u0E44\u0E1F\u0E25\u0E4C\u0E43\u0E19\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E40\u0E14\u0E35\u0E22\u0E27",
    dialog_range:
      "\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    dialog_range_all:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    dialog_range_all_trial_remaining:
      "{base} (\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E43\u0E0A\u0E49\u0E1F\u0E23\u0E35: \u0E40\u0E2B\u0E25\u0E37\u0E2D {remaining} \u0E04\u0E23\u0E31\u0E49\u0E07)",
    dialog_range_topk:
      "N \u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E41\u0E23\u0E01 (\u0E43\u0E2B\u0E21\u0E48\u0E2A\u0E38\u0E14\u0E01\u0E48\u0E2D\u0E19)",
    dialog_range_last_n_days:
      "\u0E20\u0E32\u0E22\u0E43\u0E19 N \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E21\u0E32",
    dialog_range_custom:
      "\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07",
    dialog_post_count:
      "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E42\u0E1E\u0E2A\u0E15\u0E4C",
    dialog_recent_days:
      "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E1C\u0E48\u0E32\u0E19\u0E21\u0E32",
    dialog_days_7: "7 \u0E27\u0E31\u0E19",
    dialog_days_30: "30 \u0E27\u0E31\u0E19",
    dialog_days_90: "90 \u0E27\u0E31\u0E19",
    dialog_days_180: "180 \u0E27\u0E31\u0E19",
    dialog_start_date:
      "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19",
    dialog_end_date:
      "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14",
    dialog_btn_start:
      "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    dialog_btn_cancel: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
    dialog_extras:
      "\u0E23\u0E27\u0E21\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E14\u0E49\u0E27\u0E22",
    dialog_include_highlights:
      "\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    dialog_include_stories:
      "\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19 (24 \u0E0A\u0E21.)",
    status_scanning:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E41\u0E01\u0E19\u0E42\u0E1E\u0E2A\u0E15\u0E4C...",
    status_posts_found: "\u0E1E\u0E1A 0 \u0E42\u0E1E\u0E2A\u0E15\u0E4C",
    status_count:
      "{posts} \u0E42\u0E1E\u0E2A\u0E15\u0E4C \xB7 {media} \u0E44\u0E1F\u0E25\u0E4C",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to:
      "\u0E2A\u0E41\u0E01\u0E19\u0E16\u0E36\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 {date}",
    status_loading_next:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E16\u0E31\u0E14\u0E44\u0E1B...",
    status_loading_first:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01...",
    status_rate_limited_scroll:
      "API \u0E16\u0E39\u0E01\u0E08\u0E33\u0E01\u0E31\u0E14 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E42\u0E2B\u0E21\u0E14\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19...",
    status_rate_limited_retry:
      "Instagram \u0E08\u0E33\u0E01\u0E31\u0E14\u0E04\u0E27\u0E32\u0E21\u0E40\u0E23\u0E47\u0E27 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E43\u0E19\u0E2D\u0E35\u0E01 {seconds}\u0E27\u0E34\u0E19\u0E32\u0E17\u0E35...",
    status_processing:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25...",
    status_waiting_next:
      "\u0E23\u0E2D\u0E2B\u0E19\u0E49\u0E32\u0E16\u0E31\u0E14\u0E44\u0E1B...",
    status_scan_complete:
      "\u0E2A\u0E41\u0E01\u0E19\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19 \u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E04\u0E34\u0E27",
    status_saving_scanned:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E17\u0E35\u0E48\u0E2A\u0E41\u0E01\u0E19...",
    status_stopped: "\u0E2B\u0E22\u0E38\u0E14\u0E41\u0E25\u0E49\u0E27",
    notify_started:
      "\u0E40\u0E23\u0E34\u0E48\u0E21\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 @{username}",
    notify_switched_scroll:
      "API \u0E16\u0E39\u0E01\u0E08\u0E33\u0E01\u0E31\u0E14 \u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E42\u0E2B\u0E21\u0E14\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E41\u0E25\u0E49\u0E27",
    notify_multi_zip:
      "\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E01\u0E34\u0E19 {chunkSize} \u0E08\u0E30\u0E41\u0E1A\u0E48\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E25\u0E32\u0E22 ZIP (~{parts}+)",
    notify_found_posts:
      "\u0E1E\u0E1A {posts} \u0E42\u0E1E\u0E2A\u0E15\u0E4C ({media} \u0E44\u0E1F\u0E25\u0E4C)",
    notify_error:
      "\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14: {message}",
    notify_pagination_error:
      "\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E01\u0E32\u0E23\u0E41\u0E1A\u0E48\u0E07\u0E2B\u0E19\u0E49\u0E32: {message}",
    scroll_loading_more:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21...",
    scroll_parsing_post:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E27\u0E34\u0E40\u0E04\u0E23\u0E32\u0E30\u0E2B\u0E4C\u0E42\u0E1E\u0E2A\u0E15\u0E4C {current}/{total}: {shortcode}",
    scroll_got_records:
      "\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A {count} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E08\u0E32\u0E01\u0E2B\u0E19\u0E49\u0E32",
    rate_wait:
      "\u0E04\u0E33\u0E02\u0E2D\u0E16\u0E35\u0E48\u0E40\u0E01\u0E34\u0E19\u0E44\u0E1B \u0E01\u0E33\u0E25\u0E31\u0E07\u0E23\u0E2D {seconds}\u0E27\u0E34\u0E19\u0E32\u0E17\u0E35...",
    parse_html_error:
      "Instagram \u0E2A\u0E48\u0E07\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E04\u0E32\u0E14\u0E04\u0E34\u0E14 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E27\u0E48\u0E32\u0E04\u0E38\u0E13\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E41\u0E25\u0E49\u0E27\u0E41\u0E25\u0E30\u0E23\u0E35\u0E40\u0E1F\u0E23\u0E0A\u0E2B\u0E19\u0E49\u0E32",
    zip_no_files:
      "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E44\u0E1F\u0E25\u0E4C\u0E17\u0E35\u0E48\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E14\u0E49\u0E43\u0E19 ZIP",
    aria_download: "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    story_download_highlight:
      "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    story_download_all:
      "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    notify_story_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E19\u0E35\u0E49\u0E44\u0E14\u0E49",
    notify_story_success:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
    story_downloading:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14...",
    notify_highlight_id_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E36\u0E07 ID \u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E44\u0E14\u0E49",
    notify_username_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E36\u0E07\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E44\u0E14\u0E49",
    notify_user_data_failed:
      "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E36\u0E07\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E44\u0E14\u0E49 (\u0E2D\u0E32\u0E08\u0E40\u0E1B\u0E47\u0E19\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27)",
    notify_highlight_empty:
      "\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E21\u0E35\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32",
    notify_no_stories:
      "\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E43\u0E19\u0E02\u0E13\u0E30\u0E19\u0E35\u0E49",
    highlight_untitled:
      "\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E44\u0E21\u0E48\u0E21\u0E35\u0E0A\u0E37\u0E48\u0E2D",
    progress_extras_start:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21...",
    progress_stories_fetching:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E36\u0E07\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19...",
    progress_stories_packing:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E41\u0E1E\u0E47\u0E01 {count} \u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E40\u0E1B\u0E47\u0E19 ZIP...",
    progress_highlights_fetching_tray:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E36\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C...",
    progress_highlight_fetching:
      "\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C {current}/{total}: {title}",
    progress_highlights_packing:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E41\u0E1E\u0E47\u0E01 {count} \u0E44\u0E1F\u0E25\u0E4C\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E40\u0E1B\u0E47\u0E19 ZIP...",
    progress_highlights_packing_named:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E41\u0E1E\u0E47\u0E01: {title} ({current}/{total})",
    task_label_highlights: "\u0E44\u0E2E\u0E44\u0E25\u0E15\u0E4C",
    task_label_stories: "\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E48",
    popup_subtitle:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E37\u0E48\u0E2D Instagram \u0E08\u0E33\u0E19\u0E27\u0E19\u0E21\u0E32\u0E01",
    popup_empty_title:
      "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E07\u0E32\u0E19\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    popup_empty_desc: `\u0E44\u0E1B\u0E17\u0E35\u0E48\u0E2B\u0E19\u0E49\u0E32\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C Instagram \u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30
\u0E41\u0E25\u0E49\u0E27\u0E04\u0E25\u0E34\u0E01\u0E1B\u0E38\u0E48\u0E21 "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14"`,
    popup_settings:
      "\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32",
    popup_settings_advanced: "\u0E02\u0E31\u0E49\u0E19\u0E2A\u0E39\u0E07",
    popup_concurrency:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E01\u0E31\u0E19",
    popup_max_retries:
      "\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14",
    popup_zip_chunk: "\u0E02\u0E19\u0E32\u0E14\u0E0A\u0E34\u0E49\u0E19 ZIP",
    popup_zip_chunk_tip:
      "\u0E08\u0E33\u0E19\u0E27\u0E19\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E39\u0E07\u0E2A\u0E38\u0E14\u0E15\u0E48\u0E2D ZIP \u0E40\u0E21\u0E37\u0E48\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E01\u0E34\u0E19\u0E02\u0E35\u0E14\u0E08\u0E33\u0E01\u0E31\u0E14\u0E19\u0E35\u0E49 \u0E08\u0E30\u0E41\u0E1A\u0E48\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E25\u0E32\u0E22 ZIP \u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34",
    popup_zip_no_split: "\u0E44\u0E21\u0E48\u0E41\u0E1A\u0E48\u0E07",
    popup_language: "\u0E20\u0E32\u0E29\u0E32",
    popup_footer:
      "Dog Saver v{version} \xB7 \u0E40\u0E09\u0E1E\u0E32\u0E30\u0E43\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07 \u0E44\u0E21\u0E48\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21",
    task_scanning:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E41\u0E01\u0E19... {found}",
    task_scanning_found: "\u0E1E\u0E1A {count} \u0E44\u0E1F\u0E25\u0E4C",
    task_batches_done:
      "\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 {count} \u0E0A\u0E38\u0E14",
    task_zipping:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07 ZIP...{percent}",
    task_packing:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1A\u0E23\u0E23\u0E08\u0E38 {current}/{total} \u0E44\u0E1F\u0E25\u0E4C...",
    task_batches_done_parens:
      "(\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 {count} \u0E0A\u0E38\u0E14)",
    task_creating_zip:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07 ZIP... {total} \u0E44\u0E1F\u0E25\u0E4C",
    task_downloaded:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E41\u0E25\u0E49\u0E27 {done}/{total} \u0E44\u0E1F\u0E25\u0E4C",
    task_failed: "{count} \u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
    task_in_progress:
      "{count} \u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23",
    task_zips: "{count} ZIP",
    task_status_running:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E17\u0E33\u0E07\u0E32\u0E19",
    task_status_paused:
      "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
    task_status_done: "\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E2A\u0E34\u0E49\u0E19",
    task_status_stopped: "\u0E2B\u0E22\u0E38\u0E14\u0E41\u0E25\u0E49\u0E27",
    task_status_saving:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01...",
    task_status_auto_paused:
      "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 (\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A)",
    status_auto_resume:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E2A\u0E41\u0E01\u0E19 @{username} \u0E15\u0E48\u0E2D...",
    task_btn_pause:
      "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
    task_btn_resume:
      "\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D",
    task_btn_stop: "\u0E2B\u0E22\u0E38\u0E14",
    task_stop_confirm:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 {count} \u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E2A\u0E41\u0E01\u0E19\u0E44\u0E27\u0E49\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E22\u0E38\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48",
    task_stop_download:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 & \u0E2B\u0E22\u0E38\u0E14",
    task_stop_discard: "\u0E17\u0E34\u0E49\u0E07 & \u0E2B\u0E22\u0E38\u0E14",
    task_stop_preparing:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14...",
    error_no_avatar_url:
      "\u0E44\u0E21\u0E48\u0E1E\u0E1A URL \u0E2D\u0E27\u0E32\u0E15\u0E32\u0E23\u0E4C",
    error_no_media_items:
      "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E37\u0E48\u0E2D\u0E17\u0E35\u0E48\u0E08\u0E30\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    error_no_story_items:
      "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E17\u0E35\u0E48\u0E08\u0E30\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
    error_unknown_message:
      "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E44\u0E21\u0E48\u0E23\u0E39\u0E49\u0E08\u0E31\u0E01",
    error_zip_build_failed:
      "\u0E2A\u0E23\u0E49\u0E32\u0E07 ZIP \u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
    btn_download_saved:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49",
    btn_download_collection:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19",
    dialog_saved_title:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49",
    dialog_select_collections:
      "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19",
    dialog_select_all:
      "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    dialog_deselect_all:
      "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E01\u0E32\u0E23\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
    dialog_collection_count: "{count} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23",
    status_collection_progress:
      "\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19: {name}",
    dialog_saved_folder_mode:
      "\u0E27\u0E34\u0E18\u0E35\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01",
    dialog_saved_folder_per_post:
      "\u0E41\u0E22\u0E01\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E15\u0E32\u0E21\u0E42\u0E1E\u0E2A\u0E15\u0E4C",
    dialog_saved_folder_per_collection:
      "\u0E41\u0E22\u0E01\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E15\u0E32\u0E21\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19",
    notify_fetching_collections:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E36\u0E07\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19...",
    notify_no_collections:
      "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49",
    review_title: "\u0E0A\u0E2D\u0E1A Dog Saver \u0E44\u0E2B\u0E21?",
    review_message:
      "\u0E04\u0E38\u0E13\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 {count} \u0E04\u0E23\u0E31\u0E49\u0E07! \u0E2B\u0E32\u0E01\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D\u0E19\u0E35\u0E49\u0E21\u0E35\u0E1B\u0E23\u0E30\u0E42\u0E22\u0E0A\u0E19\u0E4C \u0E23\u0E35\u0E27\u0E34\u0E27\u0E2A\u0E31\u0E49\u0E19\u0E46 \u0E1A\u0E19 Chrome Web Store \u0E08\u0E30\u0E21\u0E35\u0E04\u0E27\u0E32\u0E21\u0E2B\u0E21\u0E32\u0E22\u0E21\u0E32\u0E01 \u0E01\u0E32\u0E23\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E0A\u0E48\u0E27\u0E22\u0E43\u0E2B\u0E49 Dog Saver \u0E1F\u0E23\u0E35\u0E41\u0E25\u0E30\u0E1E\u0E31\u0E12\u0E19\u0E32\u0E02\u0E36\u0E49\u0E19\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E22\u0E46",
    review_btn_rate:
      "\u0E40\u0E02\u0E35\u0E22\u0E19\u0E23\u0E35\u0E27\u0E34\u0E27",
    review_btn_later:
      "\u0E1A\u0E32\u0E07\u0E17\u0E35\u0E17\u0E35\u0E2B\u0E25\u0E31\u0E07",
    review_btn_never: "\u0E44\u0E21\u0E48\u0E16\u0E32\u0E21\u0E2D\u0E35\u0E01",
    pro_badge: "Pro",
    pro_badge_legacy:
      "Pro \xB7 \u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01\u0E41\u0E25\u0E49\u0E27",
    upgrade_title:
      "\u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14\u0E40\u0E1B\u0E47\u0E19 Dog Saver Pro",
    upgrade_title_benefit:
      "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2A\u0E34\u0E48\u0E07\u0E17\u0E35\u0E48\u0E04\u0E38\u0E13\u0E23\u0E31\u0E01 \u0E2D\u0E22\u0E48\u0E32\u0E07\u0E04\u0E23\u0E1A\u0E16\u0E49\u0E27\u0E19",
    upgrade_subtitle:
      "\u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19\u0E21\u0E32\u0E01\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14\u0E41\u0E25\u0E30\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C\u0E02\u0E31\u0E49\u0E19\u0E2A\u0E39\u0E07",
    upgrade_feature_unlimited:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E33\u0E19\u0E27\u0E19\u0E21\u0E32\u0E01\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14",
    upgrade_feature_extras:
      "\u0E23\u0E27\u0E21 Highlights \u0E41\u0E25\u0E30 Stories \u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E19\u0E04\u0E25\u0E34\u0E01\u0E40\u0E14\u0E35\u0E22\u0E27",
    upgrade_feature_saved:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E25\u0E32\u0E22\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E01\u0E31\u0E19",
    upgrade_feature_dates:
      "\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07 (90 / 180 \u0E27\u0E31\u0E19 / \u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07)",
    compare_header_feature: "\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E14\u0E35\u0E48\u0E22\u0E27 (\u0E42\u0E1E\u0E2A\u0E15\u0E4C / Reel / Story)",
    compare_row_highlight: "Highlight \u0E40\u0E14\u0E35\u0E48\u0E22\u0E27",
    compare_row_single_collection:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E40\u0E14\u0E35\u0E22\u0E27",
    compare_row_profile_bulk:
      "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E08\u0E33\u0E19\u0E27\u0E19\u0E21\u0E32\u0E01",
    compare_row_profile_bulk_free:
      "30 \u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14",
    compare_row_profile_bulk_pro:
      "\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14",
    compare_row_extras:
      "\u0E23\u0E27\u0E21 Highlights \u0E41\u0E25\u0E30 Stories",
    compare_row_saved:
      "\u0E2B\u0E25\u0E32\u0E22\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E01\u0E31\u0E19",
    compare_row_dates:
      "\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07",
    compare_row_dates_pro:
      "7 / 30 / 90 / \u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07",
    trust_no_personal_data:
      "\u0E40\u0E23\u0E32\u0E44\u0E21\u0E48\u0E40\u0E01\u0E47\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27",
    trust_three_devices:
      "\u0E25\u0E34\u0E02\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C 3 \u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C",
    upgrade_plan_monthly: "\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19",
    upgrade_plan_yearly: "\u0E23\u0E32\u0E22\u0E1B\u0E35",
    upgrade_plan_lifetime: "\u0E15\u0E25\u0E2D\u0E14\u0E0A\u0E35\u0E1E",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ \u0E40\u0E14\u0E37\u0E2D\u0E19 \xB7 \u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E44\u0E2B\u0E23\u0E01\u0E47\u0E44\u0E14\u0E49",
    upgrade_yearly_subtitle:
      "/ \u0E1B\u0E35 \xB7 \u0E1B\u0E23\u0E30\u0E2B\u0E22\u0E31\u0E14 58%",
    upgrade_lifetime_subtitle_regular:
      "\u0E0A\u0E33\u0E23\u0E30\u0E04\u0E23\u0E31\u0E49\u0E07\u0E40\u0E14\u0E35\u0E22\u0E27 \xB7 \u0E43\u0E0A\u0E49\u0E44\u0E14\u0E49\u0E15\u0E25\u0E2D\u0E14\u0E44\u0E1B",
    upgrade_lifetime_card_label:
      "\u0E15\u0E25\u0E2D\u0E14\u0E0A\u0E35\u0E1E \xB7 Early Bird",
    upgrade_lifetime_savings:
      "\u0E0A\u0E33\u0E23\u0E30\u0E04\u0E23\u0E31\u0E49\u0E07\u0E40\u0E14\u0E35\u0E22\u0E27 \xB7 \u0E43\u0E0A\u0E49\u0E44\u0E14\u0E49\u0E15\u0E25\u0E2D\u0E14\u0E44\u0E1B",
    upgrade_lifetime_countdown_badge:
      "\u0E08\u0E33\u0E01\u0E31\u0E14 -40% \xB7 \u0E40\u0E2B\u0E25\u0E37\u0E2D {days} \u0E27\u0E31\u0E19",
    upgrade_btn_choose: "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E41\u0E1C\u0E19",
    upgrade_btn_close: "\u0E1B\u0E34\u0E14",
    have_key_prompt:
      "\u0E0B\u0E37\u0E49\u0E2D\u0E41\u0E25\u0E49\u0E27\u0E43\u0E0A\u0E48\u0E44\u0E2B\u0E21?",
    have_key_link: "\u0E43\u0E2A\u0E48 license \u2192",
    gate_topk_limit:
      "\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E1F\u0E23\u0E35\u0E08\u0E33\u0E01\u0E31\u0E14\u0E17\u0E35\u0E48 {limit} \u0E42\u0E1E\u0E2A\u0E15\u0E4C\u0E15\u0E48\u0E2D\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E08\u0E33\u0E19\u0E27\u0E19\u0E21\u0E32\u0E01 \u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14\u0E40\u0E1B\u0E47\u0E19 Pro",
    gate_days_limit:
      "\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E1F\u0E23\u0E35\u0E08\u0E33\u0E01\u0E31\u0E14\u0E17\u0E35\u0E48 {limit} \u0E27\u0E31\u0E19\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14 Pro \u0E23\u0E2D\u0E07\u0E23\u0E31\u0E1A 90 / 180 \u0E27\u0E31\u0E19\u0E2B\u0E23\u0E37\u0E2D\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07",
    gate_custom_range:
      "\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E40\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C Pro",
    gate_extras:
      "\u0E23\u0E27\u0E21\u0E44\u0E2E\u0E44\u0E25\u0E17\u0E4C\u0E43\u0E19\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E40\u0E1B\u0E47\u0E19\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C Pro \u0E2A\u0E15\u0E2D\u0E23\u0E35\u0E48 (24 \u0E0A\u0E21.) \u0E43\u0E0A\u0E49\u0E1F\u0E23\u0E35",
    gate_all_trial_exhausted:
      '\u0E04\u0E38\u0E13\u0E43\u0E0A\u0E49\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E17\u0E14\u0E25\u0E2D\u0E07\u0E43\u0E0A\u0E49\u0E1F\u0E23\u0E35 "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14" \u0E04\u0E23\u0E1A {limit} \u0E04\u0E23\u0E31\u0E49\u0E07\u0E41\u0E25\u0E49\u0E27 \u0E2D\u0E31\u0E1B\u0E40\u0E01\u0E23\u0E14\u0E40\u0E1B\u0E47\u0E19 Pro \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E44\u0E14\u0E49\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14',
    gate_saved_multi:
      "\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E25\u0E32\u0E22\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E01\u0E31\u0E19\u0E40\u0E1B\u0E47\u0E19\u0E1F\u0E35\u0E40\u0E08\u0E2D\u0E23\u0E4C Pro \u0E04\u0E25\u0E34\u0E01\u0E40\u0E02\u0E49\u0E32\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E40\u0E14\u0E35\u0E22\u0E27\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E1F\u0E23\u0E35",
    license_section_title: "Dog Saver Pro",
    license_status_free:
      "\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E1F\u0E23\u0E35",
    license_status_pro:
      "Pro \xB7 \u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E2D\u0E22\u0E39\u0E48",
    license_status_legacy:
      "Pro \xB7 \u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01\u0E41\u0E25\u0E49\u0E27 (\u0E1C\u0E39\u0E49\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E23\u0E38\u0E48\u0E19\u0E41\u0E23\u0E01 \u2014 \u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13!)",
    license_status_expires: "\u0E2B\u0E21\u0E14\u0E2D\u0E32\u0E22\u0E38 {date}",
    license_status_lifetime:
      "\u0E43\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E15\u0E25\u0E2D\u0E14\u0E0A\u0E35\u0E1E",
    license_input_placeholder:
      "\u0E27\u0E32\u0E07\u0E04\u0E35\u0E22\u0E4C\u0E43\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13 (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate:
      "\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19",
    license_btn_activating:
      "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19...",
    license_btn_copy: "\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01",
    license_btn_remove_device:
      "\u0E25\u0E1A\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E19\u0E35\u0E49",
    license_btn_get_pro: "\u0E23\u0E31\u0E1A Pro",
    license_btn_get_pro_cta: "\u0E23\u0E31\u0E1A Pro",
    license_msg_activated:
      "\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19 Pro \u0E41\u0E25\u0E49\u0E27 \u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13\u0E17\u0E35\u0E48\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19 Dog Saver!",
    license_msg_activate_failed:
      "\u0E01\u0E32\u0E23\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27: {error}",
    license_msg_removed:
      "\u0E25\u0E1A\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E25\u0E1A\u0E43\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E08\u0E32\u0E01\u0E40\u0E1A\u0E23\u0E32\u0E27\u0E4C\u0E40\u0E0B\u0E2D\u0E23\u0E4C\u0E19\u0E35\u0E49\u0E41\u0E25\u0E49\u0E27",
    license_msg_limit_reached_title:
      "\u0E16\u0E36\u0E07\u0E02\u0E35\u0E14\u0E08\u0E33\u0E01\u0E31\u0E14\u0E01\u0E32\u0E23\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19",
    license_msg_limit_reached_body:
      '\u0E43\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E19\u0E35\u0E49\u0E40\u0E1B\u0E34\u0E14\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E1A\u0E19 3 \u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E41\u0E25\u0E49\u0E27 \u0E40\u0E1B\u0E34\u0E14 Dog Saver \u0E1A\u0E19\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E2D\u0E37\u0E48\u0E19\u0E41\u0E25\u0E49\u0E27\u0E04\u0E25\u0E34\u0E01 "\u0E25\u0E1A\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E19\u0E35\u0E49" \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E17\u0E35\u0E48\u0E27\u0E48\u0E32\u0E07',
    license_help_switch_device:
      "\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E04\u0E2D\u0E21\u0E1E\u0E34\u0E27\u0E40\u0E15\u0E2D\u0E23\u0E4C? \u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E04\u0E35\u0E22\u0E4C\u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19\u0E41\u0E25\u0E49\u0E27\u0E27\u0E32\u0E07\u0E1A\u0E19\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E43\u0E2B\u0E21\u0E48",
    license_help_portal:
      "\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E01\u0E32\u0E23\u0E2A\u0E21\u0E31\u0E04\u0E23\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01 / \u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E2D\u0E38\u0E1B\u0E01\u0E23\u0E13\u0E4C\u0E43\u0E19 Customer Portal",
    legacy_welcome_title:
      "\u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13 \u0E1C\u0E39\u0E49\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E23\u0E38\u0E48\u0E19\u0E41\u0E23\u0E01",
    legacy_welcome_body:
      "\u0E04\u0E38\u0E13\u0E43\u0E0A\u0E49 Dog Saver \u0E15\u0E31\u0E49\u0E07\u0E41\u0E15\u0E48 v{version} Pro \u0E16\u0E39\u0E01\u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E16\u0E32\u0E27\u0E23\u0E43\u0E19\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E19\u0E35\u0E49 \u2014 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19",
    legacy_welcome_warning:
      "\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01\u0E40\u0E23\u0E32\u0E44\u0E21\u0E48\u0E40\u0E01\u0E47\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E31\u0E27 \u0E2A\u0E16\u0E32\u0E19\u0E30\u0E1C\u0E39\u0E49\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E23\u0E38\u0E48\u0E19\u0E41\u0E23\u0E01\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07 Chrome \u0E19\u0E35\u0E49 \u0E01\u0E32\u0E23\u0E16\u0E2D\u0E19\u0E01\u0E32\u0E23\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07 Dog Saver \u0E2D\u0E32\u0E08\u0E17\u0E33\u0E43\u0E2B\u0E49\u0E2A\u0E39\u0E0D\u0E40\u0E2A\u0E35\u0E22\u0E2A\u0E16\u0E32\u0E19\u0E30\u0E19\u0E35\u0E49",
    legacy_welcome_btn_done: "\u0E23\u0E31\u0E1A\u0E17\u0E23\u0E32\u0E1A",
    legacy_welcome_btn_review:
      "\u0E43\u0E2B\u0E49\u0E04\u0E30\u0E41\u0E19\u0E19\u0E43\u0E19 Chrome Web Store",
    legacy_thanks_title:
      "\u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13 \u0E1C\u0E39\u0E49\u0E2A\u0E19\u0E31\u0E1A\u0E2A\u0E19\u0E38\u0E19\u0E23\u0E38\u0E48\u0E19\u0E41\u0E23\u0E01",
    legacy_thanks_message:
      "\u0E04\u0E38\u0E13\u0E43\u0E0A\u0E49 Dog Saver \u0E15\u0E31\u0E49\u0E07\u0E41\u0E15\u0E48 v{version} Pro \u0E16\u0E39\u0E01\u0E1B\u0E25\u0E14\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E16\u0E32\u0E27\u0E23 \u2014 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19 \u0E2B\u0E32\u0E01\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E21\u0E37\u0E2D\u0E19\u0E35\u0E49\u0E21\u0E35\u0E1B\u0E23\u0E30\u0E42\u0E22\u0E0A\u0E19\u0E4C \u0E23\u0E35\u0E27\u0E34\u0E27\u0E2A\u0E31\u0E49\u0E19\u0E46 \u0E0A\u0E48\u0E27\u0E22\u0E43\u0E2B\u0E49\u0E40\u0E23\u0E32\u0E04\u0E07\u0E04\u0E27\u0E32\u0E21\u0E1F\u0E23\u0E35\u0E44\u0E27\u0E49\u0E44\u0E14\u0E49",
    legacy_thanks_btn_review:
      "\u0E43\u0E2B\u0E49\u0E04\u0E30\u0E41\u0E19\u0E19",
    legacy_thanks_btn_done: "\u0E23\u0E31\u0E1A\u0E17\u0E23\u0E32\u0E1A",
  };
  var Qe = {
    btn_download_all: "T\u1EA3i t\u1EA5t c\u1EA3",
    aria_download_hd_avatar: "T\u1EA3i \u1EA3nh \u0111\u1EA1i di\u1EC7n HD",
    notify_avatar_failed:
      "Kh\xF4ng th\u1EC3 l\u1EA5y \u1EA3nh \u0111\u1EA1i di\u1EC7n HD",
    notify_avatar_success:
      "\u0110\xE3 t\u1EA3i \u1EA3nh \u0111\u1EA1i di\u1EC7n HD",
    aria_download_post: "T\u1EA3i b\xE0i vi\u1EBFt n\xE0y",
    aria_download_post_zip: "T\u1EA3i b\xE0i vi\u1EBFt n\xE0y (ZIP)",
    aria_download_reel: "T\u1EA3i Reel n\xE0y",
    tooltip_sponsored_not_downloadable:
      "Kh\xF4ng th\u1EC3 t\u1EA3i xu\u1ED1ng n\u1ED9i dung \u0111\u01B0\u1EE3c t\xE0i tr\u1EE3",
    notify_post_media_failed:
      "Kh\xF4ng th\u1EC3 l\u1EA5y media c\u1EE7a b\xE0i vi\u1EBFt",
    notify_downloaded_n_files_zip: "\u0110\xE3 t\u1EA3i {count} t\u1EC7p (ZIP)",
    notify_downloaded_1_file: "\u0110\xE3 t\u1EA3i 1 t\u1EC7p",
    notify_download_failed: "T\u1EA3i xu\u1ED1ng th\u1EA5t b\u1EA1i: {error}",
    dialog_title: "T\u1EA3i @{username}",
    dialog_media_type: "Lo\u1EA1i media",
    dialog_media_all: "T\u1EA5t c\u1EA3 (\u1EA2nh + Video)",
    dialog_media_photos: "Ch\u1EC9 \u1EA3nh",
    dialog_media_videos: "Ch\u1EC9 video",
    dialog_save_method: "Ph\u01B0\u01A1ng th\u1EE9c l\u01B0u",
    dialog_save_grouped: "M\u1ED7i b\xE0i vi\u1EBFt m\u1ED9t th\u01B0 m\u1EE5c",
    dialog_save_flat:
      "T\u1EA5t c\u1EA3 t\u1EC7p trong m\u1ED9t th\u01B0 m\u1EE5c",
    dialog_range: "Ph\u1EA1m vi t\u1EA3i",
    dialog_range_all: "T\u1EA3i t\u1EA5t c\u1EA3",
    dialog_range_all_trial_remaining:
      "{base} (d\xF9ng th\u1EED mi\u1EC5n ph\xED: c\xF2n {remaining} l\u1EA7n)",
    dialog_range_topk:
      "N b\xE0i vi\u1EBFt \u0111\u1EA7u ti\xEAn (m\u1EDBi nh\u1EA5t tr\u01B0\u1EDBc)",
    dialog_range_last_n_days: "Trong N ng\xE0y g\u1EA7n \u0111\xE2y",
    dialog_range_custom: "Kho\u1EA3ng ng\xE0y t\xF9y ch\u1EC9nh",
    dialog_post_count: "S\u1ED1 b\xE0i vi\u1EBFt",
    dialog_recent_days: "Ng\xE0y g\u1EA7n \u0111\xE2y",
    dialog_days_7: "7 ng\xE0y",
    dialog_days_30: "30 ng\xE0y",
    dialog_days_90: "90 ng\xE0y",
    dialog_days_180: "180 ng\xE0y",
    dialog_start_date: "Ng\xE0y b\u1EAFt \u0111\u1EA7u",
    dialog_end_date: "Ng\xE0y k\u1EBFt th\xFAc",
    dialog_btn_start: "B\u1EAFt \u0111\u1EA7u t\u1EA3i",
    dialog_btn_cancel: "H\u1EE7y",
    dialog_extras: "Bao g\u1ED3m th\xEAm",
    dialog_include_highlights: "T\u1EA5t c\u1EA3 highlight",
    dialog_include_stories: "Story hi\u1EC7n c\xF3 (24h)",
    status_scanning: "\u0110ang qu\xE9t b\xE0i vi\u1EBFt...",
    status_posts_found: "T\xECm th\u1EA5y 0 b\xE0i vi\u1EBFt",
    status_count: "{posts} b\xE0i vi\u1EBFt \xB7 {media} t\u1EC7p",
    status_count_zips: "\xB7 ~{parts} ZIP",
    status_scanned_to: "\u0110\xE3 qu\xE9t \u0111\u1EBFn {date}",
    status_loading_next: "\u0110ang t\u1EA3i trang ti\u1EBFp theo...",
    status_loading_first: "\u0110ang t\u1EA3i trang \u0111\u1EA7u ti\xEAn...",
    status_rate_limited_scroll:
      "API b\u1ECB gi\u1EDBi h\u1EA1n, \u0111ang chuy\u1EC3n sang ch\u1EBF \u0111\u1ED9 cu\u1ED9n...",
    status_rate_limited_retry:
      "Instagram gi\u1EDBi h\u1EA1n t\u1ED1c \u0111\u1ED9, th\u1EED l\u1EA1i sau {seconds}gi\xE2y...",
    status_processing: "\u0110ang x\u1EED l\xFD...",
    status_waiting_next: "Ch\u1EDD trang ti\u1EBFp theo...",
    status_scan_complete:
      "Qu\xE9t xong, \u0111ang x\u1EBFp h\xE0ng t\u1EA3i xu\u1ED1ng",
    status_saving_scanned:
      "\u0110ang l\u01B0u n\u1ED9i dung \u0111\xE3 qu\xE9t...",
    status_stopped: "\u0110\xE3 d\u1EEBng",
    notify_started: "B\u1EAFt \u0111\u1EA7u t\u1EA3i @{username}",
    notify_switched_scroll:
      "API b\u1ECB gi\u1EDBi h\u1EA1n, \u0111\xE3 chuy\u1EC3n sang ch\u1EBF \u0111\u1ED9 cu\u1ED9n",
    notify_multi_zip:
      "T\u1EC7p v\u01B0\u1EE3t {chunkSize}, s\u1EBD chia th\xE0nh nhi\u1EC1u ZIP (~{parts}+)",
    notify_found_posts:
      "T\xECm th\u1EA5y {posts} b\xE0i vi\u1EBFt ({media} t\u1EC7p)",
    notify_error: "L\u1ED7i: {message}",
    notify_pagination_error: "L\u1ED7i ph\xE2n trang: {message}",
    scroll_loading_more:
      "Cu\u1ED9n \u0111\u1EC3 t\u1EA3i th\xEAm b\xE0i vi\u1EBFt...",
    scroll_parsing_post:
      "\u0110ang ph\xE2n t\xEDch b\xE0i vi\u1EBFt {current}/{total}: {shortcode}",
    scroll_got_records:
      "L\u1EA5y \u0111\u01B0\u1EE3c {count} b\u1EA3n ghi b\xE0i vi\u1EBFt t\u1EEB trang",
    rate_wait:
      "Y\xEAu c\u1EA7u qu\xE1 th\u01B0\u1EDDng xuy\xEAn, \u0111\u1EE3i {seconds}gi\xE2y...",
    parse_html_error:
      "Instagram tr\u1EA3 v\u1EC1 n\u1ED9i dung kh\xF4ng mong \u0111\u1EE3i. Vui l\xF2ng ki\u1EC3m tra \u0111\xE3 \u0111\u0103ng nh\u1EADp v\xE0 l\xE0m m\u1EDBi trang.",
    zip_no_files: "Kh\xF4ng c\xF3 t\u1EC7p c\xF3 th\u1EC3 t\u1EA3i trong ZIP",
    aria_download: "T\u1EA3i xu\u1ED1ng",
    story_download_highlight: "L\u01B0u t\u1EA5t c\u1EA3",
    story_download_all: "L\u01B0u t\u1EA5t c\u1EA3",
    notify_story_failed: "Kh\xF4ng th\u1EC3 l\u1EA5y story n\xE0y",
    notify_story_success: "\u0110\xE3 t\u1EA3i story",
    story_downloading: "\u0110ang t\u1EA3i...",
    notify_highlight_id_failed: "Kh\xF4ng th\u1EC3 l\u1EA5y ID highlight",
    notify_username_failed:
      "Kh\xF4ng th\u1EC3 l\u1EA5y t\xEAn ng\u01B0\u1EDDi d\xF9ng",
    notify_user_data_failed:
      "Kh\xF4ng th\u1EC3 l\u1EA5y d\u1EEF li\u1EC7u ng\u01B0\u1EDDi d\xF9ng (c\xF3 th\u1EC3 l\xE0 t\xE0i kho\u1EA3n ri\xEAng t\u01B0)",
    notify_highlight_empty: "Highlight n\xE0y kh\xF4ng c\xF3 n\u1ED9i dung",
    notify_no_stories:
      "Ng\u01B0\u1EDDi d\xF9ng n\xE0y hi\u1EC7n kh\xF4ng c\xF3 story",
    highlight_untitled: "Highlight kh\xF4ng t\xEAn",
    progress_extras_start:
      "\u0110ang chu\u1EA9n b\u1ECB n\u1ED9i dung b\u1ED5 sung...",
    progress_stories_fetching: "\u0110ang l\u1EA5y story hi\u1EC7n c\xF3...",
    progress_stories_packing:
      "\u0110ang \u0111\xF3ng g\xF3i {count} t\u1EC7p story v\xE0o ZIP...",
    progress_highlights_fetching_tray:
      "\u0110ang l\u1EA5y danh s\xE1ch highlight...",
    progress_highlight_fetching: "Highlight {current}/{total}: {title}",
    progress_highlights_packing:
      "\u0110ang \u0111\xF3ng g\xF3i {count} t\u1EC7p highlight v\xE0o ZIP...",
    progress_highlights_packing_named:
      "\u0110ang \u0111\xF3ng g\xF3i: {title} ({current}/{total})",
    task_label_highlights: "Tin n\u1ED5i b\u1EADt",
    task_label_stories: "Tin",
    popup_subtitle: "T\u1EA3i h\xE0ng lo\u1EA1t media Instagram",
    popup_empty_title: "Kh\xF4ng c\xF3 t\xE1c v\u1EE5 t\u1EA3i xu\u1ED1ng",
    popup_empty_desc: `Truy c\u1EADp trang h\u1ED3 s\u01A1 c\xF4ng khai tr\xEAn Instagram
v\xE0 nh\u1EA5n n\xFAt "T\u1EA3i t\u1EA5t c\u1EA3"`,
    popup_settings: "C\xE0i \u0111\u1EB7t",
    popup_settings_advanced: "N\xE2ng cao",
    popup_concurrency: "T\u1EA3i \u0111\u1ED3ng th\u1EDDi",
    popup_max_retries: "S\u1ED1 l\u1EA7n th\u1EED l\u1EA1i t\u1ED1i \u0111a",
    popup_zip_chunk: "K\xEDch th\u01B0\u1EDBc ph\u1EA7n ZIP",
    popup_zip_chunk_tip:
      "S\u1ED1 t\u1EC7p t\u1ED1i \u0111a m\u1ED7i ZIP. Khi v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n n\xE0y, t\u1EA3i xu\u1ED1ng s\u1EBD t\u1EF1 \u0111\u1ED9ng chia th\xE0nh nhi\u1EC1u ZIP.",
    popup_zip_no_split: "Kh\xF4ng chia",
    popup_language: "Ng\xF4n ng\u1EEF",
    popup_footer:
      "Dog Saver v{version} \xB7 Ch\u1EC9 c\u1EE5c b\u1ED9, kh\xF4ng theo d\xF5i",
    task_scanning: "\u0110ang qu\xE9t... {found}",
    task_scanning_found: "T\xECm th\u1EA5y {count} t\u1EC7p",
    task_batches_done: "Ho\xE0n th\xE0nh {count} l\xF4",
    task_zipping: "\u0110ang t\u1EA1o ZIP...{percent}",
    task_packing: "\u0110ang \u0111\xF3ng g\xF3i {current}/{total} t\u1EC7p...",
    task_batches_done_parens: "(Ho\xE0n th\xE0nh {count} l\xF4)",
    task_creating_zip: "\u0110ang t\u1EA1o ZIP... {total} t\u1EC7p",
    task_downloaded: "\u0110\xE3 t\u1EA3i {done}/{total} t\u1EC7p",
    task_failed: "{count} th\u1EA5t b\u1EA1i",
    task_in_progress: "{count} \u0111ang th\u1EF1c hi\u1EC7n",
    task_zips: "{count} ZIP",
    task_status_running: "\u0110ang ch\u1EA1y",
    task_status_paused: "\u0110\xE3 t\u1EA1m d\u1EEBng",
    task_status_done: "Xong",
    task_status_stopped: "\u0110\xE3 d\u1EEBng",
    task_status_saving: "\u0110ang l\u01B0u...",
    task_status_auto_paused: "T\u1EA1m d\u1EEBng (\u0111\xF3ng tab)",
    status_auto_resume: "\u0110ang ti\u1EBFp t\u1EE5c qu\xE9t @{username}...",
    task_btn_pause: "T\u1EA1m d\u1EEBng",
    task_btn_resume: "Ti\u1EBFp t\u1EE5c",
    task_btn_stop: "D\u1EEBng",
    task_stop_confirm:
      "T\u1EA3i {count} b\xE0i vi\u1EBFt \u0111\xE3 qu\xE9t tr\u01B0\u1EDBc khi d\u1EEBng?",
    task_stop_download: "T\u1EA3i & D\u1EEBng",
    task_stop_discard: "B\u1ECF & D\u1EEBng",
    task_stop_preparing: "\u0110ang chu\u1EA9n b\u1ECB t\u1EA3i...",
    error_no_avatar_url:
      "Kh\xF4ng t\xECm th\u1EA5y URL \u1EA3nh \u0111\u1EA1i di\u1EC7n",
    error_no_media_items: "Kh\xF4ng c\xF3 media \u0111\u1EC3 t\u1EA3i",
    error_no_story_items: "Kh\xF4ng c\xF3 story \u0111\u1EC3 t\u1EA3i",
    error_unknown_message:
      "Lo\u1EA1i tin nh\u1EAFn kh\xF4ng x\xE1c \u0111\u1ECBnh",
    error_zip_build_failed: "T\u1EA1o ZIP th\u1EA5t b\u1EA1i",
    btn_download_saved: "T\u1EA3i \u0111\xE3 l\u01B0u",
    btn_download_collection: "T\u1EA3i b\u1ED9 s\u01B0u t\u1EADp",
    dialog_saved_title: "T\u1EA3i b\xE0i vi\u1EBFt \u0111\xE3 l\u01B0u",
    dialog_select_collections: "Ch\u1ECDn b\u1ED9 s\u01B0u t\u1EADp",
    dialog_select_all: "Ch\u1ECDn t\u1EA5t c\u1EA3",
    dialog_deselect_all: "B\u1ECF ch\u1ECDn t\u1EA5t c\u1EA3",
    dialog_collection_count: "{count} m\u1EE5c",
    status_collection_progress: "B\u1ED9 s\u01B0u t\u1EADp: {name}",
    dialog_saved_folder_mode: "Ph\u01B0\u01A1ng th\u1EE9c l\u01B0u",
    dialog_saved_folder_per_post:
      "M\u1ED7i b\xE0i vi\u1EBFt m\u1ED9t th\u01B0 m\u1EE5c",
    dialog_saved_folder_per_collection:
      "M\u1ED7i b\u1ED9 s\u01B0u t\u1EADp m\u1ED9t th\u01B0 m\u1EE5c",
    notify_fetching_collections:
      "\u0110ang l\u1EA5y b\u1ED9 s\u01B0u t\u1EADp...",
    notify_no_collections:
      "Kh\xF4ng t\xECm th\u1EA5y b\u1ED9 s\u01B0u t\u1EADp \u0111\xE3 l\u01B0u",
    review_title: "B\u1EA1n c\xF3 th\xEDch Dog Saver kh\xF4ng?",
    review_message:
      "B\u1EA1n \u0111\xE3 ho\xE0n th\xE0nh {count} l\u1EA7n t\u1EA3i! N\u1EBFu c\xF4ng c\u1EE5 n\xE0y h\u1EEFu \xEDch, m\u1ED9t \u0111\xE1nh gi\xE1 nhanh tr\xEAn Chrome Web Store s\u1EBD r\u1EA5t c\xF3 \xFD ngh\u0129a. S\u1EF1 \u1EE7ng h\u1ED9 c\u1EE7a b\u1EA1n gi\xFAp Dog Saver lu\xF4n mi\u1EC5n ph\xED v\xE0 kh\xF4ng ng\u1EEBng c\u1EA3i thi\u1EC7n.",
    review_btn_rate: "\u0110\u1EC3 l\u1EA1i \u0111\xE1nh gi\xE1",
    review_btn_later: "C\xF3 th\u1EC3 sau",
    review_btn_never: "Kh\xF4ng h\u1ECFi n\u1EEFa",
    pro_badge: "Pro",
    pro_badge_legacy: "Pro \xB7 \u0110\xE3 m\u1EDF kh\xF3a",
    upgrade_title: "N\xE2ng c\u1EA5p l\xEAn Dog Saver Pro",
    upgrade_title_benefit:
      "L\u01B0u tr\u1ECDn nh\u1EEFng g\xEC b\u1EA1n y\xEAu th\xEDch",
    upgrade_subtitle:
      "M\u1EDF kh\xF3a t\u1EA3i h\xE0ng lo\u1EA1t kh\xF4ng gi\u1EDBi h\u1EA1n v\xE0 c\xE1c t\xEDnh n\u0103ng n\xE2ng cao",
    upgrade_feature_unlimited:
      "T\u1EA3i h\xE0ng lo\u1EA1t H\u1ED3 s\u01A1 kh\xF4ng gi\u1EDBi h\u1EA1n",
    upgrade_feature_extras:
      "\u0110\xF3ng g\xF3i t\u1EA5t c\u1EA3 Tin n\u1ED5i b\u1EADt & Stories ch\u1EC9 v\u1EDBi m\u1ED9t c\xFA nh\u1EA5p",
    upgrade_feature_saved:
      "T\u1EA3i h\xE0ng lo\u1EA1t nhi\u1EC1u b\u1ED9 s\u01B0u t\u1EADp",
    upgrade_feature_dates:
      "Kho\u1EA3ng ng\xE0y t\xF9y ch\u1EC9nh (90 / 180 ng\xE0y / t\xF9y ch\u1EC9nh)",
    compare_header_feature: "T\xEDnh n\u0103ng",
    compare_header_free: "Free",
    compare_header_pro: "Pro",
    compare_row_single:
      "T\u1EA3i \u0111\u01A1n l\u1EBB (B\xE0i vi\u1EBFt / Reel / Story)",
    compare_row_highlight: "Highlight \u0111\u01A1n l\u1EBB",
    compare_row_single_collection:
      "T\u1EA3i m\u1ED9t b\u1ED9 s\u01B0u t\u1EADp",
    compare_row_profile_bulk: "T\u1EA3i h\xE0ng lo\u1EA1t H\u1ED3 s\u01A1",
    compare_row_profile_bulk_free: "30 b\xE0i g\u1EA7n nh\u1EA5t",
    compare_row_profile_bulk_pro: "Kh\xF4ng gi\u1EDBi h\u1EA1n",
    compare_row_extras: "\u0110\xF3ng g\xF3i Tin n\u1ED5i b\u1EADt & Stories",
    compare_row_saved: "Nhi\u1EC1u b\u1ED9 s\u01B0u t\u1EADp c\xF9ng l\xFAc",
    compare_row_dates: "Kho\u1EA3ng ng\xE0y t\xF9y ch\u1EC9nh",
    compare_row_dates_pro: "7 / 30 / 90 / T\xF9y ch\u1EC9nh",
    trust_no_personal_data:
      "Ch\xFAng t\xF4i kh\xF4ng thu th\u1EADp d\u1EEF li\u1EC7u c\xE1 nh\xE2n",
    trust_three_devices: "Gi\u1EA5y ph\xE9p 3 thi\u1EBFt b\u1ECB",
    upgrade_plan_monthly: "H\xE0ng th\xE1ng",
    upgrade_plan_yearly: "H\xE0ng n\u0103m",
    upgrade_plan_lifetime: "Tr\u1ECDn \u0111\u1EDDi",
    upgrade_price_monthly: "$3.99",
    upgrade_price_yearly: "$19.99",
    upgrade_price_lifetime: "$24.99",
    upgrade_price_lifetime_early: "$14.99",
    upgrade_monthly_subtitle:
      "/ th\xE1ng \xB7 H\u1EE7y b\u1EA5t c\u1EE9 l\xFAc n\xE0o",
    upgrade_yearly_subtitle: "/ n\u0103m \xB7 Ti\u1EBFt ki\u1EC7m 58%",
    upgrade_lifetime_subtitle_regular:
      "Thanh to\xE1n m\u1ED9t l\u1EA7n \xB7 M\xE3i m\xE3i",
    upgrade_lifetime_card_label:
      "Tr\u1ECDn \u0111\u1EDDi \xB7 \u01AFu \u0111\xE3i s\u1EDBm",
    upgrade_lifetime_savings:
      "Thanh to\xE1n m\u1ED9t l\u1EA7n \xB7 M\xE3i m\xE3i",
    upgrade_lifetime_countdown_badge:
      "Gi\u1EDBi h\u1EA1n -40% \xB7 C\xF2n {days} ng\xE0y",
    upgrade_btn_choose: "Ch\u1ECDn g\xF3i",
    upgrade_btn_close: "\u0110\xF3ng",
    have_key_prompt: "\u0110\xE3 mua r\u1ED3i?",
    have_key_link: "Nh\u1EADp license \u2192",
    gate_topk_limit:
      "Phi\xEAn b\u1EA3n mi\u1EC5n ph\xED gi\u1EDBi h\u1EA1n {limit} b\xE0i vi\u1EBFt m\u1ED7i l\u1EA7n t\u1EA3i h\xE0ng lo\u1EA1t. N\xE2ng c\u1EA5p l\xEAn Pro.",
    gate_days_limit:
      "Phi\xEAn b\u1EA3n mi\u1EC5n ph\xED gi\u1EDBi h\u1EA1n {limit} ng\xE0y g\u1EA7n nh\u1EA5t. Pro h\u1ED7 tr\u1EE3 90 / 180 ng\xE0y ho\u1EB7c kho\u1EA3ng t\xF9y ch\u1EC9nh.",
    gate_custom_range:
      "Kho\u1EA3ng ng\xE0y t\xF9y ch\u1EC9nh l\xE0 t\xEDnh n\u0103ng Pro.",
    gate_extras:
      "\u0110\u01B0a Highlights v\xE0o t\u1EA3i xu\u1ED1ng h\u1ED3 s\u01A1 l\xE0 t\xEDnh n\u0103ng Pro. Tin (24 gi\u1EDD) mi\u1EC5n ph\xED.",
    gate_all_trial_exhausted:
      'B\u1EA1n \u0111\xE3 d\xF9ng h\u1EBFt {limit} l\u1EA7n d\xF9ng th\u1EED mi\u1EC5n ph\xED "T\u1EA3i t\u1EA5t c\u1EA3". N\xE2ng c\u1EA5p Pro \u0111\u1EC3 t\u1EA3i h\xE0ng lo\u1EA1t kh\xF4ng gi\u1EDBi h\u1EA1n.',
    gate_saved_multi:
      "T\u1EA3i nhi\u1EC1u b\u1ED9 s\u01B0u t\u1EADp c\xF9ng l\xFAc l\xE0 t\xEDnh n\u0103ng Pro. V\xE0o m\u1ED9t b\u1ED9 s\u01B0u t\u1EADp ri\xEAng \u0111\u1EC3 t\u1EA3i mi\u1EC5n ph\xED.",
    license_section_title: "Dog Saver Pro",
    license_status_free: "Phi\xEAn b\u1EA3n mi\u1EC5n ph\xED",
    license_status_pro: "Pro \xB7 \u0110ang ho\u1EA1t \u0111\u1ED9ng",
    license_status_legacy:
      "Pro \xB7 \u0110\xE3 m\u1EDF kh\xF3a (Ng\u01B0\u1EDDi \u1EE7ng h\u1ED9 s\u1EDBm \u2014 c\u1EA3m \u01A1n b\u1EA1n!)",
    license_status_expires: "H\u1EBFt h\u1EA1n {date}",
    license_status_lifetime: "Gi\u1EA5y ph\xE9p tr\u1ECDn \u0111\u1EDDi",
    license_input_placeholder:
      "D\xE1n kh\xF3a gi\u1EA5y ph\xE9p c\u1EE7a b\u1EA1n (IGSAVER_xxxx-xxxx-xxxx-xxxx)",
    license_btn_activate: "K\xEDch ho\u1EA1t",
    license_btn_activating: "\u0110ang k\xEDch ho\u1EA1t...",
    license_btn_copy: "Sao ch\xE9p",
    license_btn_remove_device: "X\xF3a thi\u1EBFt b\u1ECB n\xE0y",
    license_btn_get_pro: "Nh\u1EADn Pro",
    license_btn_get_pro_cta: "Nh\u1EADn Pro",
    license_msg_activated:
      "\u0110\xE3 k\xEDch ho\u1EA1t Pro. C\u1EA3m \u01A1n b\u1EA1n \u0111\xE3 h\u1ED7 tr\u1EE3 Dog Saver!",
    license_msg_activate_failed:
      "K\xEDch ho\u1EA1t th\u1EA5t b\u1EA1i: {error}",
    license_msg_removed:
      "\u0110\xE3 x\xF3a thi\u1EBFt b\u1ECB. Gi\u1EA5y ph\xE9p \u0111\xE3 \u0111\u01B0\u1EE3c x\xF3a kh\u1ECFi tr\xECnh duy\u1EC7t n\xE0y.",
    license_msg_limit_reached_title:
      "\u0110\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n k\xEDch ho\u1EA1t",
    license_msg_limit_reached_body:
      'Gi\u1EA5y ph\xE9p n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c k\xEDch ho\u1EA1t tr\xEAn 3 thi\u1EBFt b\u1ECB. M\u1EDF Dog Saver tr\xEAn thi\u1EBFt b\u1ECB kh\xE1c v\xE0 nh\u1EA5n "X\xF3a thi\u1EBFt b\u1ECB n\xE0y" \u0111\u1EC3 gi\u1EA3i ph\xF3ng m\u1ED9t v\u1ECB tr\xED.',
    license_help_switch_device:
      "\u0110\u1ED5i m\xE1y t\xEDnh? Sao ch\xE9p kh\xF3a \u1EDF tr\xEAn v\xE0 d\xE1n v\xE0o thi\u1EBFt b\u1ECB m\u1EDBi.",
    license_help_portal:
      "Qu\u1EA3n l\xFD \u0111\u0103ng k\xFD / \u0111\u1EB7t l\u1EA1i thi\u1EBFt b\u1ECB trong Customer Portal",
    legacy_welcome_title:
      "C\u1EA3m \u01A1n b\u1EA1n, ng\u01B0\u1EDDi \u1EE7ng h\u1ED9 s\u1EDBm",
    legacy_welcome_body:
      "B\u1EA1n \u0111\xE3 d\xF9ng Dog Saver t\u1EEB v{version}. Pro \u0111\u01B0\u1EE3c m\u1EDF kh\xF3a v\u0129nh vi\u1EC5n tr\xEAn c\xE0i \u0111\u1EB7t n\xE0y \u2014 kh\xF4ng c\u1EA7n thanh to\xE1n.",
    legacy_welcome_warning:
      "V\xEC ch\xFAng t\xF4i kh\xF4ng thu th\u1EADp th\xF4ng tin c\xE1 nh\xE2n, tr\u1EA1ng th\xE1i ng\u01B0\u1EDDi \u1EE7ng h\u1ED9 s\u1EDBm c\u1EE7a b\u1EA1n \u0111\u01B0\u1EE3c g\u1EAFn v\u1EDBi b\u1EA3n c\xE0i \u0111\u1EB7t Chrome n\xE0y. G\u1EE1 c\xE0i \u0111\u1EB7t Dog Saver c\xF3 th\u1EC3 l\xE0m m\u1EA5t tr\u1EA1ng th\xE1i n\xE0y.",
    legacy_welcome_btn_done: "\u0110\xE3 hi\u1EC3u",
    legacy_welcome_btn_review:
      "\u0110\u1EC3 l\u1EA1i \u0111\xE1nh gi\xE1 tr\xEAn Chrome Web Store",
    legacy_thanks_title:
      "C\u1EA3m \u01A1n b\u1EA1n, ng\u01B0\u1EDDi \u1EE7ng h\u1ED9 s\u1EDBm",
    legacy_thanks_message:
      "B\u1EA1n \u0111\xE3 d\xF9ng Dog Saver t\u1EEB v{version}. Pro \u0111\u01B0\u1EE3c m\u1EDF kh\xF3a v\u0129nh vi\u1EC5n \u2014 kh\xF4ng c\u1EA7n thanh to\xE1n. N\u1EBFu c\xF4ng c\u1EE5 n\xE0y h\u1EEFu \xEDch v\u1EDBi b\u1EA1n, m\u1ED9t \u0111\xE1nh gi\xE1 ng\u1EAFn gi\xFAp ch\xFAng t\xF4i duy tr\xEC mi\u1EC5n ph\xED.",
    legacy_thanks_btn_review: "\u0110\u1EC3 l\u1EA1i \u0111\xE1nh gi\xE1",
    legacy_thanks_btn_done: "\u0110\xE3 hi\u1EC3u",
  };
  var ce = "ig_saver_locale";
  var ee = {
      en: J,
      "zh-TW": Le,
      "zh-CN": Ne,
      ja: $e,
      ko: Ze,
      es: Oe,
      "pt-BR": Be,
      fr: Fe,
      de: Ue,
      id: qe,
      ru: He,
      tr: Ke,
      it: Ve,
      th: We,
      vi: Qe,
    },
    mt = "en",
    je = J;
  function Xe() {
    let s = "";
    try {
      s = chrome.i18n?.getUILanguage?.() || navigator.language || "en";
    } catch {
      s = navigator.language || "en";
    }
    if (ee[s]) return s;
    let e = s.toLowerCase();
    if (e === "zh-hant" || e === "zh_tw" || e === "zh-hant-tw") return "zh-TW";
    if (e === "zh-hans" || e === "zh_cn" || e === "zh-hans-cn" || e === "zh")
      return "zh-CN";
    if (e === "pt-br" || e === "pt_br") return "pt-BR";
    let t = s.split("-")[0].split("_")[0];
    return t === "zh" ? "zh-CN" : ee[t] ? t : "en";
  }
  function ue(s) {
    ((mt = s), (je = ee[s] || J));
  }
  async function Ye() {
    try {
      let e = (await chrome.storage.local.get(ce))[ce];
      e && ee[e] ? ue(e) : ue(Xe());
    } catch {
      ue(Xe());
    }
    try {
      chrome.storage.onChanged.addListener((s, e) => {
        if (e === "local" && s[ce]) {
          let t = s[ce].newValue;
          t && ee[t] && ue(t);
        }
      });
    } catch {}
  }
  function w(s, e) {
    let t = je[s] ?? J[s] ?? s;
    if (e)
      for (let [i, a] of Object.entries(e))
        t = t.replaceAll(`{${i}}`, String(a));
    return t;
  }
  var x = class {
    timestamps = new Map();
    earliestNextRequest = 0;
    maxPerWindow;
    windowMs;
    onWait = null;
    constructor(e) {
      ((this.maxPerWindow = e?.maxPerWindow ?? 200),
        (this.windowMs = e?.windowMs ?? 11 * 60 * 1e3));
    }
    static randomDelay() {
      let t = -Math.log(Math.random()) / 0.6;
      return Math.min(t, 15);
    }
    queryWaitTime(e) {
      let t = performance.now();
      this.pruneOld(e, t);
      let i = this.timestamps.get(e) ?? [],
        a = 0;
      return (
        i.length >= this.maxPerWindow &&
          (a = Math.min(...i) + this.windowMs + 6e3),
        (a = Math.max(a, this.earliestNextRequest)),
        Math.max(0, (a - t) / 1e3)
      );
    }
    async waitBeforeQuery(e) {
      let t = this.queryWaitTime(e);
      if (t > 0)
        if (this.onWait) {
          let i = Math.ceil(t);
          for (let a = i; a > 0; a--) {
            if (this.onWait(w("rate_wait", { seconds: a }), a) === !1) return;
            await Je(1e3);
          }
        } else await Je(t * 1e3);
      this.recordRequest(e);
    }
    handle429(e) {
      let t = performance.now();
      this.pruneOld(e, t);
      let i = this.timestamps.get(e) ?? [],
        a = 0;
      return (
        i.length > 0 && (a = Math.min(...i) + this.windowMs + 6e3 - t),
        (a = Math.max(a, 3e4)),
        (this.earliestNextRequest = t + a),
        a / 1e3
      );
    }
    recordRequest(e) {
      (this.timestamps.has(e) || this.timestamps.set(e, []),
        this.timestamps.get(e).push(performance.now()));
    }
    pruneOld(e, t) {
      let i = this.timestamps.get(e);
      if (!i) return;
      let a = t - 60 * 60 * 1e3,
        o = i.filter((r) => r > a);
      this.timestamps.set(e, o);
    }
  };
  function Je(s) {
    return new Promise((e) => setTimeout(e, s));
  }
  var pe = class s {
    username;
    filter;
    dateFilter;
    userId = null;
    source;
    rateController;
    externalCsrfToken = null;
    profilePicUrl = null;
    static extractHdProfilePicUrl(e) {
      if (!e || typeof e != "object") return null;
      let t = e.hd_profile_pic_url_info;
      if (t?.url && typeof t.url == "string") return t.url;
      let i = e.hd_profile_pic_versions;
      if (Array.isArray(i) && i.length > 0) {
        let a = i.reduce(
          (o, r) => ((r.width ?? 0) > (o.width ?? 0) ? r : o),
          i[0],
        );
        if (a?.url && typeof a.url == "string") return a.url;
      }
      return e.profile_pic_url_hd && typeof e.profile_pic_url_hd == "string"
        ? e.profile_pic_url_hd
        : e.profile_pic_url && typeof e.profile_pic_url == "string"
          ? e.profile_pic_url
          : null;
    }
    constructor(e, t, i, a = "timeline", o, r) {
      ((this.username = e),
        (this.filter = t),
        (this.dateFilter = i),
        (this.source = a),
        (this.rateController = o ?? new x()),
        (this.externalCsrfToken = r ?? null));
    }
    async fetchHdProfilePic() {
      if (
        this.userId &&
        !(
          this.profilePicUrl &&
          !this.profilePicUrl.includes("s320x320") &&
          !this.profilePicUrl.includes("s150x150")
        )
      )
        try {
          let e = await fetch(
            `https://www.instagram.com/api/v1/users/${this.userId}/info/`,
            {
              credentials: "include",
              headers: {
                "X-IG-App-ID": "936619743392459",
                "X-Requested-With": "XMLHttpRequest",
                Referer: `https://www.instagram.com/${this.username}/`,
              },
            },
          );
          if (e.ok) {
            let t = await T(e),
              i = t?.user ?? t,
              a = i?.hd_profile_pic_url_info;
            if (a?.url && typeof a.url == "string") {
              this.profilePicUrl = a.url;
              return;
            }
            let o = i?.hd_profile_pic_versions;
            if (Array.isArray(o) && o.length > 0) {
              let r = o.reduce(
                (n, _) => ((_.width ?? 0) > (n.width ?? 0) ? _ : n),
                o[0],
              );
              r?.url &&
                typeof r.url == "string" &&
                (this.profilePicUrl = r.url);
            }
          }
        } catch {}
    }
    async fetchPage(e) {
      this.userId ||
        ((this.userId = await this.getUserId()),
        await this.fetchHdProfilePic());
      let t,
        i = e === null;
      if (this.source === "reels") t = await this.fetchReelsApi(e);
      else {
        if (i) {
          let l = this.tryGetFirstPageFromPage();
          l && (t = l);
        }
        if (!t)
          try {
            t = await this.fetchUserFeedApi(e);
          } catch {}
        if (!t)
          try {
            t = await this.fetchGraphQL(e);
          } catch (l) {
            if (i) {
              let c = this.tryGetFirstPageFromPage();
              c && (t = c);
            }
            if (!t) throw l;
          }
      }
      let a = this.extractEdges(t),
        o = [],
        r = !1,
        n = this.source === "reels";
      for (let l of a) {
        let c = l.node,
          d = this.parsePostNode(c);
        if (!n && de(d.timestamp, this.dateFilter)) {
          r = !0;
          break;
        }
        Ge(d.timestamp, this.dateFilter) ||
          (Ee(d.timestamp, this.dateFilter) &&
            (this.shouldSkipByType(d) || o.push(d)));
      }
      let _ = this.extractPageInfo(t);
      if (!r && a.length > 0)
        if (n)
          a.every((c) => {
            let d = c.node?.taken_at_timestamp ?? c.node?.taken_at ?? 0;
            return d > 0 && de(d, this.dateFilter);
          }) && (r = !0);
        else {
          let l = a[0]?.node,
            c = l?.taken_at_timestamp ?? l?.taken_at ?? 0;
          c > 0 && Me(c, this.dateFilter) && (r = !0);
        }
      return {
        posts: o,
        cursor: r ? null : _.endCursor,
        hasNextPage: r ? !1 : _.hasNextPage,
      };
    }
    tryGetFirstPageFromPage() {
      if (typeof document > "u") return null;
      try {
        let e = document.querySelectorAll('script[type="application/json"]');
        for (let t of e) {
          let i = t.textContent || "";
          if (i.includes("edge_owner_to_timeline_media"))
            try {
              let a = JSON.parse(i),
                o = this.findTimelineData(a, 0, 15);
              if (o) return o;
            } catch {
              continue;
            }
        }
      } catch {}
      return null;
    }
    findTimelineData(e, t, i) {
      if (!e || typeof e != "object" || t > i) return null;
      let a =
        e?.data?.user?.edge_owner_to_timeline_media ||
        e?.user?.edge_owner_to_timeline_media;
      if (a && Array.isArray(a.edges) && a.edges.length > 0 && a.page_info) {
        let o = a.page_info;
        if (typeof o.end_cursor == "string" || o.end_cursor === null)
          return { data: { user: { edge_owner_to_timeline_media: a } } };
      }
      for (let o of Object.keys(e)) {
        let r = this.findTimelineData(e[o], t + 1, i);
        if (r) return r;
      }
      return null;
    }
    async getUserId() {
      try {
        let e = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${this.username}`,
          {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
          },
        );
        if (e.ok) {
          let i = (await T(e))?.data?.user,
            a = i?.id;
          if (a) return ((this.profilePicUrl = s.extractHdProfilePicUrl(i)), a);
        }
      } catch {}
      if (!(typeof document > "u"))
        try {
          let e = document.querySelectorAll('script[type="application/json"]');
          for (let t of e) {
            let i = t.textContent || "",
              a = i.match(/profilePage_(\d+)/);
            if (a) return a[1];
            if (i.includes('"user"') && i.includes('"id"')) {
              let o = JSON.parse(i),
                r = this.findUserId(o);
              if (r) return r;
            }
          }
        } catch {}
      try {
        let t = await (
            await fetch(`https://www.instagram.com/${this.username}/`, {
              credentials: "include",
              headers: {
                "X-Requested-With": "XMLHttpRequest",
                Referer: `https://www.instagram.com/${this.username}/`,
              },
            })
          ).text(),
          i = t.match(/"profilePage_(\d+)"/);
        if (i) return i[1];
        let a = t.match(/"user":\s*\{[^}]*"id":\s*"(\d+)"/);
        if (a) return a[1];
      } catch {}
      throw new Error(I);
    }
    findUserId(e, t = 0) {
      if (!e || typeof e != "object" || t > 10) return null;
      if (
        e.user &&
        e.user.id &&
        typeof e.user.id == "string" &&
        (!e.user.username || e.user.username === this.username)
      )
        return (
          this.profilePicUrl ||
            (this.profilePicUrl = s.extractHdProfilePicUrl(e.user)),
          e.user.id
        );
      if (e.id && typeof e.id == "string" && e.username === this.username)
        return (
          this.profilePicUrl ||
            (this.profilePicUrl = s.extractHdProfilePicUrl(e)),
          e.id
        );
      for (let i of Object.keys(e)) {
        let a = this.findUserId(e[i], t + 1);
        if (a) return a;
      }
      return null;
    }
    async doSleep() {
      let e = x.randomDelay();
      await new Promise((t) => setTimeout(t, e * 1e3));
    }
    async fetchUserFeedApi(e) {
      (await this.doSleep(),
        await this.rateController.waitBeforeQuery("user_feed"));
      let t = new URLSearchParams({ count: "50" });
      e && t.set("max_id", e);
      let i = await fetch(
        `https://www.instagram.com/api/v1/feed/user/${this.userId}/?${t}`,
        {
          credentials: "include",
          headers: {
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${this.username}/`,
          },
        },
      );
      if (i.status === 429)
        throw (this.rateController.handle429("user_feed"), new Error(I));
      if (!i.ok) throw new Error("NETWORK_ERROR");
      return T(i);
    }
    async fetchGraphQL(e) {
      let t = async (r, n) => {
          (await this.doSleep(), await this.rateController.waitBeforeQuery(r));
          let _ = JSON.stringify(n),
            l = new URLSearchParams({
              variables: _,
              doc_id: r,
              server_timestamps: "true",
            }).toString(),
            c = {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
            d = (await O()) ?? this.externalCsrfToken;
          return (
            d && (c["X-CSRFToken"] = d),
            fetch("https://www.instagram.com/graphql/query/", {
              method: "POST",
              credentials: "include",
              headers: c,
              body: l,
            })
          );
        },
        i = {
          data: {
            count: 50,
            include_relationship_info: !0,
            latest_besties_reel_media: !0,
            latest_reel_media: !0,
          },
          username: this.username,
          __relay_internal__pv__PolarisFeedShareMenurelayprovider: !1,
        };
      e != null &&
        ((i.after = e), (i.before = null), (i.first = 50), (i.last = null));
      let a = await t("7898261790222653", i);
      if (a.ok) {
        let r = await a.text(),
          n = r.trim();
        if (n.length > 0 && !n.startsWith("<"))
          try {
            let _ = JSON.parse(r),
              l = _?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
            if (l && Array.isArray(l.edges) && l.edges.length > 0) return _;
          } catch {}
        else
          n.startsWith("<") &&
            this.rateController.handle429("7898261790222653");
      } else
        a.status === 429 && this.rateController.handle429("7898261790222653");
      let o = {
        id: this.userId,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: !1,
      };
      if (
        (e != null &&
          ((o.after = e), (o.before = null), (o.first = 50), (o.last = null)),
        (a = await t("7950326061742207", o)),
        a.status === 429)
      )
        throw (this.rateController.handle429("7950326061742207"), new Error(I));
      if (!a.ok) throw new Error("NETWORK_ERROR");
      return T(a);
    }
    async fetchReelsApi(e) {
      (await this.doSleep(),
        await this.rateController.waitBeforeQuery("reels"));
      let t = {
        target_user_id: this.userId,
        page_size: "50",
        include_feed_video: "1",
      };
      e && (t.max_id = e);
      let i = {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://www.instagram.com/${this.username}/reels/`,
        },
        a = (await O()) ?? this.externalCsrfToken;
      a && (i["X-CSRFToken"] = a);
      let o = await fetch("https://www.instagram.com/api/v1/clips/user/", {
        method: "POST",
        credentials: "include",
        headers: i,
        body: new URLSearchParams(t).toString(),
      });
      if (o.status === 429)
        throw (this.rateController.handle429("reels"), new Error(I));
      if (!o.ok) throw new Error("NETWORK_ERROR");
      return T(o);
    }
    extractEdges(e) {
      if (Array.isArray(e?.items) && e.items.length > 0 && e.items[0]?.media)
        return e.items.map((i) => ({ node: i.media }));
      if (Array.isArray(e?.items) && e.items.length > 0)
        return e.items.map((i) => ({ node: i }));
      let t = e?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
      return t && Array.isArray(t.edges)
        ? t.edges
        : e?.data?.user?.edge_owner_to_timeline_media?.edges || [];
    }
    extractPageInfo(e) {
      if (e?.paging_info)
        return {
          hasNextPage: e.paging_info.more_available ?? !1,
          endCursor: e.paging_info.max_id || null,
        };
      if (e?.more_available !== void 0)
        return {
          hasNextPage: e.more_available ?? !1,
          endCursor: e.next_max_id || null,
        };
      let t = e?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
      if (t?.page_info)
        return {
          hasNextPage: t.page_info.has_next_page ?? !1,
          endCursor: t.page_info.end_cursor || null,
        };
      let i = e?.data?.user?.edge_owner_to_timeline_media?.page_info;
      return {
        hasNextPage: i?.has_next_page ?? !1,
        endCursor: i?.end_cursor || null,
      };
    }
    normalizeNode(e) {
      let likeCount = e.like_count ?? e.edge_media_preview_like?.count ?? e.edge_liked_by?.count ?? 0;
      let playCount = e.play_count ?? e.view_count ?? e.video_play_count ?? 0;
      let commentCount = e.comment_count ?? e.edge_media_to_comment?.count ?? 0;
      let saveCount = e.save_count ?? e.edge_media_preview_save?.count ?? 0;
      let captionText = "";
      if (e.caption && typeof e.caption === "object") {
        captionText = e.caption.text ?? "";
      } else if (typeof e.caption === "string") {
        captionText = e.caption;
      } else {
        captionText = e.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
      }
      if (e.shortcode != null || e.taken_at_timestamp != null) {
        if (e.likeCount === undefined) e.likeCount = likeCount;
        if (e.playCount === undefined) e.playCount = playCount;
        if (e.commentCount === undefined) e.commentCount = commentCount;
        if (e.saveCount === undefined) e.saveCount = saveCount;
        if (e.captionText === undefined) e.captionText = captionText;
        return e;
      }
      let i =
          { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[
            e.media_type
          ] || "GraphImage",
        a = {
          shortcode: e.code ?? e.pk?.toString(),
          id: e.pk?.toString(),
          __typename: i,
          is_video: e.media_type === 2,
          taken_at_timestamp: e.taken_at ?? e.taken_at_timestamp ?? 0,
          likeCount: likeCount,
          playCount: playCount,
          commentCount: commentCount,
          saveCount: saveCount,
          captionText: captionText,
        },
        o = e.image_versions2?.candidates;
      o?.length && (a.display_url = o[0].url);
      let r = e.video_versions;
      return (
        Array.isArray(r) && r.length && (a.video_url = selectVideoUrl(r, e.video_url)),
        e.carousel_media?.length &&
          (a.edge_sidecar_to_children = {
            edges: e.carousel_media.map((n) => ({
              node: {
                display_url: n.image_versions2?.candidates?.[0]?.url,
                is_video: n.media_type === 2,
                video_url: selectVideoUrl(n.video_versions, n.video_url),
              },
            })),
          }),
        a
      );
    }
    parsePostNode(e) {
      let t = this.normalizeNode(e),
        i = t.shortcode || t.id,
        a = t.taken_at_timestamp || 0,
        o = t.__typename || "",
        r =
          o === "GraphSidecar" || t.edge_sidecar_to_children?.edges?.length > 0,
        n = [],
        _ = 1;
      if (r && t.edge_sidecar_to_children?.edges) {
        let l = t.edge_sidecar_to_children.edges;
        _ = l.length;
        let c = 0;
        for (let d of l) {
          let u = d.node,
            g = this.parseMediaNodes(u, i, c, a);
          (n.push(...g), (c += g.length));
        }
      } else n = this.parseMediaNodes(t, i, 0, a);
      return {
        postId: i,
        shortcode: String(t.shortcode || ""),
        timestamp: a,
        isCarousel: r,
        carouselCount: _,
        mediaItems: n,
        typename: o,
        likeCount: t.likeCount,
        playCount: t.playCount,
        commentCount: t.commentCount,
        captionText: t.captionText,
      };
    }
    parseMediaNodes(e, t, i, a) {
      let o = e.is_video === !0 || e.__typename === "GraphVideo",
        r = e.display_url || "",
        n = e.video_url || "";
      return [
        {
          postId: t,
          index: i,
          type: o ? "video" : "image",
          url: (o && n ? n : r || n) || "",
          timestamp: a,
          creator: this.username,
        },
      ];
    }
    shouldSkipByType(e) {
      return this.filter === "all"
        ? !1
        : this.filter === "photos"
          ? e.mediaItems.every((t) => t.type === "video")
          : this.filter === "videos"
            ? e.mediaItems.every((t) => t.type === "image")
            : !1;
    }
  };
  var ge = class {
    username;
    filter;
    rateController;
    constructor(e, t, i) {
      ((this.username = e),
        (this.filter = t),
        (this.rateController = i ?? new x()));
    }
    async doSleep() {
      let e = x.randomDelay();
      await new Promise((t) => setTimeout(t, e * 1e3));
    }
    async buildHeaders() {
      let e = {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://www.instagram.com/${this.username}/saved/`,
        },
        t = await O();
      return (t && (e["X-CSRFToken"] = t), e);
    }
    async doFetch(e) {
      let t = await this.buildHeaders();
      console.log(`[Dog Saver][SavedParser] doFetch: ${e}`);
      let i = await fetch(e, { credentials: "include", headers: t }),
        a = await i.text();
      return (
        console.log(
          `[Dog Saver][SavedParser] doFetch result: ok=${i.ok}, status=${i.status}, bodyLen=${a?.length ?? 0}`,
        ),
        { ok: i.ok, status: i.status, body: a }
      );
    }
    parseBody(e) {
      let t = e.body.trim();
      if (!t || t.startsWith("<") || t.startsWith("<!"))
        throw (
          console.error(
            `[Dog Saver][SavedParser] parseBody got HTML/empty response: "${t.slice(0, 200)}"`,
          ),
          new Error(I)
        );
      try {
        let i = t.replace(/([:,\[])\s*(\d{16,})\s*(?=[,\]\}])/g, '$1"$2"');
        return JSON.parse(i);
      } catch (i) {
        throw (
          console.error(
            "[Dog Saver][SavedParser] parseBody JSON.parse failed:",
            i.message,
            "body preview:",
            t.slice(0, 300),
          ),
          i
        );
      }
    }
    async fetchCollections() {
      console.log("[Dog Saver][SavedParser] fetchCollections() called");
      let e = [],
        t = null,
        i = 0;
      for (;;) {
        (i++,
          await this.doSleep(),
          await this.rateController.waitBeforeQuery("saved_collections"));
        let a = new URLSearchParams({
          collection_types:
            '["ALL_MEDIA_AUTO_COLLECTION","PRODUCT_AUTO_COLLECTION","MEDIA"]',
        });
        t && a.set("max_id", t);
        let o = `https://www.instagram.com/api/v1/collections/list/?${a}`,
          r = await this.doFetch(o);
        if (r.status === 429)
          throw (
            this.rateController.handle429("saved_collections"),
            new Error(I)
          );
        if (!r.ok)
          throw (
            console.error(
              `[Dog Saver][SavedParser] collections/list failed: status=${r.status}`,
            ),
            new Error("NETWORK_ERROR")
          );
        let n = this.parseBody(r);
        console.log(
          `[Dog Saver][SavedParser] fetchCollections page ${i}: items=${n?.items?.length ?? 0}, more=${n?.more_available}`,
        );
        let _ = n?.items ?? [];
        for (let l of _) {
          if (l.collection_type === "PRODUCT_AUTO_COLLECTION") continue;
          let d =
            l.cover_media_list?.[0]?.image_versions2?.candidates?.[0]?.url ??
            null;
          e.push({
            collectionId: String(l.collection_id),
            collectionName:
              l.collection_name ?? `Collection ${l.collection_id}`,
            coverUrl: d,
            mediaCount: l.collection_media_count ?? 0,
            collectionType: l.collection_type,
          });
        }
        if (!n.more_available || !n.next_max_id) break;
        t = String(n.next_max_id);
      }
      return (
        console.log(
          `[Dog Saver][SavedParser] fetchCollections: ${e.length} collections`,
        ),
        e
      );
    }
    async fetchSavedPage(e, t) {
      (console.log(
        `[Dog Saver][SavedParser] fetchSavedPage(cursor=${e}, collectionId=${t ?? "all"})`,
      ),
        await this.doSleep(),
        await this.rateController.waitBeforeQuery("saved_feed"));
      let i = new URLSearchParams();
      e && i.set("max_id", e);
      let a = `https://www.instagram.com/api/v1/feed/saved/posts/?${i}`,
        o = await this.doFetch(a);
      if (o.status === 429)
        throw (this.rateController.handle429("saved_feed"), new Error(I));
      if (!o.ok)
        throw (
          console.error(
            `[Dog Saver][SavedParser] feed/saved/posts failed: status=${o.status}`,
          ),
          new Error("NETWORK_ERROR")
        );
      let r = this.parseBody(o);
      console.log(
        `[Dog Saver][SavedParser] fetchSavedPage: items=${r?.items?.length ?? 0}, more=${r?.more_available}, cursor=${r?.next_max_id}`,
      );
      let n = this.parseItemsResponse(r, t);
      return (
        console.log(
          `[Dog Saver][SavedParser] fetchSavedPage result: posts=${n.posts.length}, hasNext=${n.hasNextPage}`,
        ),
        n
      );
    }
    async fetchCollectionPage(e, t) {
      return this.fetchSavedPage(t, e);
    }
    async fetchAllSavedPage(e) {
      return this.fetchSavedPage(e);
    }
    parseItemsResponse(e, t) {
      let i = e?.items ?? [],
        a = [];
      for (let o of i) {
        let r = o.media ?? o;
        if (
          !r ||
          (t && !(r.saved_collection_ids ?? []).map(String).includes(t))
        )
          continue;
        let n = this.parseMediaNode(r);
        n &&
          ((n.savedCollectionIds = (r.saved_collection_ids ?? []).map(String)),
          !this.shouldSkipByType(n) && a.push(n));
      }
      return (
        console.log(
          `[Dog Saver][SavedParser] parseItemsResponse: ${a.length}/${i.length} items${t ? ` (filtered for ${t})` : ""}`,
        ),
        {
          posts: a,
          cursor: e.next_max_id ? String(e.next_max_id) : null,
          hasNextPage: e.more_available ?? !1,
        }
      );
    }
    parseMediaNode(e) {
      let t = this.normalizeNode(e);
      if (!t) return null;
      let i = t.shortcode || t.id;
      if (!i) return null;
      let a = t.taken_at_timestamp || 0,
        o = t.__typename || "",
        r =
          o === "GraphSidecar" || t.edge_sidecar_to_children?.edges?.length > 0,
        n = e.user?.username ?? this.username,
        _ = [],
        l = 1;
      if (r && t.edge_sidecar_to_children?.edges) {
        let c = t.edge_sidecar_to_children.edges;
        l = c.length;
        let d = 0;
        for (let u of c) {
          let g = u.node,
            y = this.parseMediaItems(g, i, d, a, n);
          (_.push(...y), (d += y.length));
        }
      } else _ = this.parseMediaItems(t, i, 0, a, n);
      return {
        postId: i,
        shortcode: String(t.shortcode || ""),
        timestamp: a,
        isCarousel: r,
        carouselCount: l,
        mediaItems: _,
        typename: o,
        likeCount: t.likeCount,
        playCount: t.playCount,
        commentCount: t.commentCount,
        captionText: t.captionText,
      };
    }
    normalizeNode(e) {
      let likeCount = e.like_count ?? e.edge_media_preview_like?.count ?? e.edge_liked_by?.count ?? 0;
      let playCount = e.play_count ?? e.view_count ?? e.video_play_count ?? 0;
      let commentCount = e.comment_count ?? e.edge_media_to_comment?.count ?? 0;
      let saveCount = e.save_count ?? e.edge_media_preview_save?.count ?? 0;
      let captionText = "";
      if (e.caption && typeof e.caption === "object") {
        captionText = e.caption.text ?? "";
      } else if (typeof e.caption === "string") {
        captionText = e.caption;
      } else {
        captionText = e.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
      }
      if (e.shortcode != null || e.taken_at_timestamp != null) {
        if (e.likeCount === undefined) e.likeCount = likeCount;
        if (e.playCount === undefined) e.playCount = playCount;
        if (e.commentCount === undefined) e.commentCount = commentCount;
        if (e.saveCount === undefined) e.saveCount = saveCount;
        if (e.captionText === undefined) e.captionText = captionText;
        return e;
      }
      let i =
          { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[
            e.media_type
          ] || "GraphImage",
        a = {
          shortcode: e.code ?? e.pk?.toString(),
          id: e.pk?.toString(),
          __typename: i,
          is_video: e.media_type === 2,
          taken_at_timestamp: e.taken_at ?? e.taken_at_timestamp ?? 0,
          likeCount: likeCount,
          playCount: playCount,
          commentCount: commentCount,
          saveCount: saveCount,
          captionText: captionText,
        },
        o = e.image_versions2?.candidates;
      o?.length && (a.display_url = o[0].url);
      let r = e.video_versions;
      return (
        Array.isArray(r) && r.length && (a.video_url = selectVideoUrl(r, e.video_url)),
        e.carousel_media?.length &&
          (a.edge_sidecar_to_children = {
            edges: e.carousel_media.map((n) => ({
              node: {
                display_url: n.image_versions2?.candidates?.[0]?.url,
                is_video: n.media_type === 2,
                video_url: selectVideoUrl(n.video_versions, n.video_url),
              },
            })),
          }),
        a
      );
    }
    parseMediaItems(e, t, i, a, o) {
      let r = e.is_video === !0 || e.__typename === "GraphVideo",
        n = e.display_url || "",
        _ = e.video_url || "";
      return [
        {
          postId: t,
          index: i,
          type: r ? "video" : "image",
          url: (r && _ ? _ : n || _) || "",
          timestamp: a,
          creator: o,
        },
      ];
    }
    shouldSkipByType(e) {
      return this.filter === "all"
        ? !1
        : this.filter === "photos"
          ? e.mediaItems.every((t) => t.type === "video")
          : this.filter === "videos"
            ? e.mediaItems.every((t) => t.type === "image")
            : !1;
    }
  };
  var te = class {
    username;
    constructor(e) {
      this.username = e;
    }
    async resolveCarousel(e, t, i, a) {
      if (i.length === t && this.validateItems(i)) return i;
      let o = await this.fetchPostApi(e, a);
      if (o.length === t && this.validateItems(o)) return o;
      let r = await this.fetchPostHtml(e, a);
      if (r.length === t && this.validateItems(r)) return r;
      let n = await this.fetchPostGraphQL(e, a);
      if (n.length === t && this.validateItems(n)) return n;
      let _ = Math.max(i.length, o.length, r.length, n.length);
      throw new Error(`CAROUSEL_INCOMPLETE: resolved ${_}/${t} for post ${e}`);
    }
    async resolvePost(e) {
      console.log(`[IG-Saver] resolvePost: postId=${e}`);
      let t = Math.floor(Date.now() / 1e3),
        mediaInfo = await this.fetchMediaInfo(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchMediaInfo: ${mediaInfo.length} items`,
          mediaInfo,
        ),
        mediaInfo.length > 0 && this.validateItems(mediaInfo))
      )
        return mediaInfo;
      let i = await this.fetchPostGraphQLDocId(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostGraphQLDocId: ${i.length} items`,
          i,
        ),
        i.length > 0 && this.validateItems(i))
      )
        return i;
      let a = await this.fetchPostApi(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostApi: ${a.length} items`,
          a,
        ),
        a.length > 0 && this.validateItems(a))
      )
        return a;
      let o = await this.fetchPostHtml(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostHtml: ${o.length} items`,
          o,
        ),
        o.length > 0 && this.validateItems(o))
      )
        return o;
      let r = await this.fetchPostGraphQL(e, t);
      return (
        console.log(
          `[IG-Saver] resolvePost fetchPostGraphQL: ${r.length} items`,
          r,
        ),
        r.length > 0 && this.validateItems(r)
          ? r
          : (console.log(
              `[IG-Saver] resolvePost: all strategies failed for ${e}`,
            ),
            [])
      );
    }
    async resolveReel(e) {
      let t = Math.floor(Date.now() / 1e3);
      console.log(`[IG-Saver] resolveReel: reelId=${e}`);
      let mediaInfo = await this.fetchMediaInfo(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchMediaInfo: ${mediaInfo.length} items`,
          mediaInfo,
        ),
        mediaInfo.length > 0 && this.validateItems(mediaInfo))
      )
        return mediaInfo;
      let i = await this.fetchPostGraphQLDocId(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchPostGraphQLDocId: ${i.length} items`,
          i,
        ),
        i.length > 0 && this.validateItems(i))
      )
        return i;
      let a = await this.fetchReelHtml(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchReelHtml: ${a.length} items`,
          a,
        ),
        a.length > 0 && this.validateItems(a))
      )
        return a;
      let o = await this.fetchPostGraphQL(e, t);
      return (
        console.log(
          `[IG-Saver] resolveReel fetchPostGraphQL: ${o.length} items`,
          o,
        ),
        o.length > 0 && this.validateItems(o) ? o : []
      );
    }
    async fetchReelApi(e, t) {
      try {
        let i = await fetch(
          `https://www.instagram.com/reel/${e}/?__a=1&__d=dis`,
          {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
          },
        );
        if (!i.ok) return [];
        let a = await T(i);
        return this.parseApiResponse(a, e, t);
      } catch {
        return [];
      }
    }
    async fetchMediaInfo(e, t) {
      try {
        let i = shortcodeToMediaId(e);
        if (!i) return [];
        let a = await fetch(
          `https://www.instagram.com/api/v1/media/${i}/info/`,
          {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-ASBD-ID": "129477",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
          },
        );
        if (!a.ok) return [];
        let o = (await T(a))?.items?.[0];
        return o ? this.parseV1Media(o, e, t) : [];
      } catch {
        return [];
      }
    }
    async fetchPostGraphQLDocId(e, t) {
      try {
        let i = JSON.stringify({
            shortcode: e,
            fetch_tagged_user_count: null,
            hoisted_comment_id: null,
            hoisted_reply_id: null,
          }),
          a = new URLSearchParams({
            variables: i,
            doc_id: "8845758582119845",
            server_timestamps: "true",
          }).toString(),
          o = {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/p/${e}/`,
          },
          r = await O();
        r && (o["X-CSRFToken"] = r);
        let n = await fetch("https://www.instagram.com/graphql/query/", {
          method: "POST",
          credentials: "include",
          headers: o,
          body: a,
        });
        if (
          (console.log(
            `[IG-Saver] fetchPostGraphQLDocId: status=${n.status} for ${e}`,
          ),
          !n.ok)
        )
          return [];
        let _ = await T(n);
        console.log(
          "[IG-Saver] fetchPostGraphQLDocId: response keys=",
          _ ? Object.keys(_) : null,
        );
        let l = _?.data?.xdt_shortcode_media;
        if (
          (console.log(
            `[IG-Saver] fetchPostGraphQLDocId: media=${!!l}, media_type=${l?.media_type}, typename=${l?.__typename}, has_carousel=${!!l?.carousel_media}, has_sidecar=${!!l?.edge_sidecar_to_children}, has_video_url=${!!l?.video_url}, has_display_url=${!!l?.display_url}, has_image_versions2=${!!l?.image_versions2}`,
          ),
          !l)
        )
          return [];
        let c = l.taken_at ?? l.taken_at_timestamp ?? t,
          d = l.user?.username || l.owner?.username || this.username;
        if (l.carousel_media?.length > 0) return this.parseV1Media(l, e, c);
        if (l.edge_sidecar_to_children?.edges?.length > 0)
          return this.parseGraphQLMedia(l, e, c);
        let u = selectVideoUrl(l.video_versions, l.video_url);
        if (u)
          return [
            {
              postId: e,
              index: 0,
              type: "video",
              url: u,
              timestamp: c,
              creator: d,
            },
          ];
        let g = l.display_url ?? l.image_versions2?.candidates?.[0]?.url;
        return g
          ? [
              {
                postId: e,
                index: 0,
                type: "image",
                url: g,
                timestamp: c,
                creator: d,
              },
            ]
          : [];
      } catch {
        return [];
      }
    }
    async fetchReelHtml(e, t) {
      try {
        let i = await fetch(`https://www.instagram.com/reel/${e}/`, {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${this.username}/`,
          },
        });
        if (!i.ok) return [];
        let a = await i.text();
        return this.parseHtmlForMedia(a, e, t);
      } catch {
        return [];
      }
    }
    static detectExpectedCount(e) {
      let t = e?.edge_sidecar_to_children?.edges;
      if (t && Array.isArray(t)) return t.length;
      let i = e?.carousel_media;
      return i && Array.isArray(i)
        ? i.length
        : typeof e?.carousel_media_count == "number"
          ? e.carousel_media_count
          : 1;
    }
    async fetchPostApi(e, t) {
      try {
        let i = await fetch(`https://www.instagram.com/p/${e}/?__a=1&__d=dis`, {
          credentials: "include",
          headers: {
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${this.username}/`,
          },
        });
        if (
          (console.log(`[IG-Saver] fetchPostApi: status=${i.status} for ${e}`),
          !i.ok)
        )
          return [];
        let a = await T(i);
        return this.parseApiResponse(a, e, t);
      } catch (i) {
        return (
          console.error(`[IG-Saver] fetchPostApi error for ${e}:`, i.message),
          []
        );
      }
    }
    parseApiResponse(e, t, i) {
      try {
        let a = e?.items?.[0];
        if (a) return this.parseV1Media(a, t, i);
        let o = e?.graphql?.shortcode_media;
        return o ? this.parseGraphQLMedia(o, t, i) : [];
      } catch {
        return [];
      }
    }
    parseV1Media(e, t, i) {
      let a = e.user?.username || this.username,
        o = e.carousel_media;
      if (o && Array.isArray(o))
        return o.map((_, l) => {
          let c = _.media_type === 2,
            d = "";
          return (
            c
              ? (d = selectVideoUrl(_.video_versions, _.video_url) || "")
              : (d =
                  _.image_versions2?.candidates?.[0]?.url ||
                  _.display_url ||
                  ""),
            {
              postId: t,
              index: l,
              type: c ? "video" : "image",
              url: d,
              timestamp: i,
              creator: a,
            }
          );
        });
      let r = e.media_type === 2,
        n = r
          ? selectVideoUrl(e.video_versions, e.video_url) || ""
          : e.image_versions2?.candidates?.[0]?.url || e.display_url || "";
      return n
        ? [
            {
              postId: t,
              index: 0,
              type: r ? "video" : "image",
              url: n,
              timestamp: i,
              creator: a,
            },
          ]
        : [];
    }
    parseGraphQLMedia(e, t, i) {
      let a = e.owner?.username || this.username,
        o = e?.edge_sidecar_to_children?.edges;
      if (o && Array.isArray(o))
        return o.map((_, l) => {
          let c = _.node,
            d = c.is_video || c.__typename === "GraphVideo",
            u = (d && c.video_url) || c.display_url;
          return {
            postId: t,
            index: l,
            type: d ? "video" : "image",
            url: u || "",
            timestamp: i,
            creator: a,
          };
        });
      let r = e.is_video || e.__typename === "GraphVideo",
        n = r ? e.video_url || e.display_url || "" : e.display_url || "";
      return n
        ? [
            {
              postId: t,
              index: 0,
              type: r ? "video" : "image",
              url: n,
              timestamp: i,
              creator: a,
            },
          ]
        : [];
    }
    async fetchPostHtml(e, t) {
      try {
        let i = await fetch(`https://www.instagram.com/p/${e}/`, {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/p/${e}/`,
          },
        });
        if (
          (console.log(`[IG-Saver] fetchPostHtml: status=${i.status} for ${e}`),
          !i.ok)
        )
          return [];
        let a = await i.text();
        return (
          console.log(
            `[IG-Saver] fetchPostHtml: html length=${a.length} for ${e}`,
          ),
          this.parseHtmlForMedia(a, e, t)
        );
      } catch (i) {
        return (
          console.error(`[IG-Saver] fetchPostHtml error for ${e}:`, i.message),
          []
        );
      }
    }
    parseHtmlForMedia(e, t, i) {
      let a = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
        o;
      for (; (o = a.exec(e)) !== null; )
        try {
          let u = JSON.parse(o[1]),
            g = this.deepSearchForMedia(u, t, i);
          if (g.length > 0) return g;
        } catch {
          continue;
        }
      let r = e.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (r)
        try {
          let u = JSON.parse(r[1]),
            g = this.deepSearchForMedia(u, t, i);
          if (g.length > 0) return g;
        } catch {}
      let n = e.match(
        /(?:require\([^)]+\)\.(?:handle|handleWithCustomMessage)\([^,]*,\s*)(\{[\s\S]{500,}?"(?:shortcode_media|display_url|edge_sidecar_to_children|video_url)"[\s\S]*?\})\s*\)/,
      );
      if (n)
        try {
          let u = JSON.parse(n[1]),
            g = this.deepSearchForMedia(u, t, i);
          if (g.length > 0) return g;
        } catch {}
      let _ = /<script[^>]*>([\s\S]*?)<\/script>/g,
        l;
      for (; (l = _.exec(e)) !== null; ) {
        let u = l[1];
        if (u.includes("video_url") && u.length > 500)
          try {
            let g = JSON.parse(u),
              y = this.deepSearchForMedia(g, t, i);
            if (y.length > 0) return y;
          } catch {}
      }
      for (let u of ["playback_video_url", "video_url"]) {
        let g = new RegExp(
            `"${u.replace(/_/g, "_")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
          ),
          y = e.match(g);
        if (y) {
          let k = this.unescapeJsonString(y[1]);
          if (k && (k.startsWith("https://") || k.startsWith("http://")))
            return [
              {
                postId: t,
                index: 0,
                type: "video",
                url: k,
                timestamp: i,
                creator: this.username,
              },
            ];
        }
      }
      let c = e.match(
        /"display_url"\s*:\s*"([^"]+)"[^}]*"(?:video_url)"\s*:\s*"([^"]*)"/,
      );
      if (c) {
        let u = c[2] || c[1];
        if (u && (u.startsWith("https://") || u.startsWith("http://")))
          return [
            {
              postId: t,
              index: 0,
              type: c[2] ? "video" : "image",
              url: u.replace(/\\u0026/g, "&"),
              timestamp: i,
              creator: this.username,
            },
          ];
      }
      let d = e.match(/"display_url"\s*:\s*"(https?:\/\/[^"]+)"/);
      if (d) {
        let u = d[1].replace(/\\u0026/g, "&");
        if (u)
          return [
            {
              postId: t,
              index: 0,
              type: "image",
              url: u,
              timestamp: i,
              creator: this.username,
            },
          ];
      }
      return [];
    }
    unescapeJsonString(e) {
      return e
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003D/g, "=")
        .replace(/\\"/g, '"');
    }
    deepSearchForMedia(e, t, i, a = 0) {
      if (!e || typeof e != "object" || a > 15) return [];
      let o = selectVideoUrl(e.video_versions, e.video_url ?? e.videoUrl ?? e.playback_video_url);
      if (typeof o == "string" && o.startsWith("http"))
        return [
          {
            postId: t,
            index: 0,
            type: "video",
            url: o,
            timestamp: i,
            creator: this.username,
          },
        ];
      if (e.edge_sidecar_to_children?.edges?.length > 0)
        return this.parseGraphQLMedia(e, t, i);
      if (e.carousel_media?.length > 0) return this.parseV1Media(e, t, i);
      if (Array.isArray(e)) {
        for (let r of e) {
          let n = this.deepSearchForMedia(r, t, i, a + 1);
          if (n.length > 0) return n;
        }
        return [];
      }
      for (let r of Object.keys(e)) {
        let n = this.deepSearchForMedia(e[r], t, i, a + 1);
        if (n.length > 0) return n;
      }
      return [];
    }
    async fetchPostGraphQL(e, t) {
      try {
        let o = `https://www.instagram.com/graphql/query/?query_hash=2b0673e0dc4580571f0b062a2a0d4e08&variables=${encodeURIComponent(JSON.stringify({ shortcode: e }))}`,
          r = await fetch(o, {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
          });
        if (
          (console.log(
            `[IG-Saver] fetchPostGraphQL: status=${r.status} for ${e}`,
          ),
          !r.ok)
        )
          return [];
        let _ = (await T(r))?.data?.shortcode_media;
        return _
          ? this.parseGraphQLMedia(_, e, t)
          : (console.log(
              `[IG-Saver] fetchPostGraphQL: no shortcode_media in response for ${e}`,
            ),
            []);
      } catch (i) {
        return (
          console.error(
            `[IG-Saver] fetchPostGraphQL error for ${e}:`,
            i.message,
          ),
          []
        );
      }
    }
    validateItems(e) {
      return e.every(
        (t) =>
          t.url &&
          t.url.length > 0 &&
          (t.url.startsWith("https://") || t.url.startsWith("http://")),
      );
    }
  };
  function Pe(s, e) {
    if (e <= 0 || s.length < e) return null;
    let t = e;
    for (; t > 0 && s[t]?.postId === s[t - 1]?.postId; ) t--;
    if (t === 0) {
      let i = s[0].postId;
      for (t = 0; t < s.length && s[t].postId === i; ) t++;
    }
    return s.splice(0, t);
  }
  var me = class {
    constructor(e, t, i, a, o, r, n, _, l) {
      this.taskManager = e;
      this.downloadQueue = t;
      this.getZipChunkSize = i;
      this.zipAccumulator = a;
      this.enqueueChunkBuild = o;
      this.cleanupZipState = r;
      this.zipBuildQueue = n;
      this.syncKeepAlive = _;
      this.onTaskCompleted = l;
    }
    activeScans = new Map();
    scanQueue = [];
    maxConcurrentScans = 5;
    activeScanCount = 0;
    async startScan(e) {
      this.scanQueue.push(e);
      this.processScanQueue();
    }
    async processScanQueue() {
      if (this.activeScanCount >= this.maxConcurrentScans || this.scanQueue.length === 0) return;
      let e = this.scanQueue.shift();
      try {
        let task = await this.taskManager.getTask(e.taskId);
        if (task.status === "stopped" || task.status === "paused") {
          this.processScanQueue();
          return;
        }
      } catch (err) {
        // Skip
      }
      this.activeScanCount++;
      try {
        await this.runScan(e);
      } finally {
        this.activeScanCount--;
        this.processScanQueue();
      }
    }
    async runScan(e) {
      if (this.activeScans.has(e.taskId)) return;
      let t = { abort: !1 };
      this.activeScans.set(e.taskId, t);
      let i = e.source === "reels" ? "reels" : "timeline",
        a = new x();
      a.onWait = (g) => (
        this.sendProgress(e.username, {
          taskId: e.taskId,
          username: e.username,
          status: "rate_limited",
          posts: _,
          media: l,
          message: g,
        }),
        !t.abort
      );
      let o = new pe(e.username, e.filter, e.dateFilter, i, a, e.csrfToken),
        r = new te(e.username),
        n = e.cursor,
        _ = e.seenPostCount,
        l = e.totalMediaFound,
        c = 0,
        d = e.topK ?? 0,
        u = this.getZipChunkSize();

      this.consecutiveFailed = 0;

      let cacheKey = "ig_saver_cache_" + e.username.toLowerCase();
      let cachedRes = await chrome.storage.local.get(cacheKey);
      let cached = cachedRes[cacheKey];
      let cachedPosts = [];
      let cachedCursors = [];
      let cacheHasNextPage = true;
      if (cached && Array.isArray(cached.posts) && cached.posts.length > 0) {
        cachedPosts = cached.posts;
        cachedCursors = cached.cursors || [null];
        cacheHasNextPage = cached.hasNextPage ?? true;
      }

      let isFirstPage = n === null;
      let initialPosts = [];
      
      if (isFirstPage && cachedPosts.length > 0) {
        initialPosts = cachedPosts;
        n = cached.cursor;
        console.log(`[Dog Saver] Found ${cachedPosts.length} cached posts. Resuming from cursor: ${n}`);
      } else if (isFirstPage && cachedCursors.length > 1) {
        let cursorsToQuery = cachedCursors.slice(0, 5);
        this.sendProgress(e.username, {
          taskId: e.taskId,
          username: e.username,
          status: "scanning",
          posts: _,
          media: l,
          oldestTs: c,
          zipChunkSize: u,
          message: `Carregando ${cursorsToQuery.length} páginas em paralelo...`,
        });
        try {
          let promises = cursorsToQuery.map(cursor => o.fetchPage(cursor));
          let pages = await Promise.all(promises);
          let allPosts = [];
          let lastPage = pages[pages.length - 1];
          n = lastPage.cursor;
          cacheHasNextPage = lastPage.hasNextPage;
          for (let page of pages) {
            if (page && Array.isArray(page.posts)) {
              allPosts.push(...page.posts);
            }
          }
          let seenShortcodes = new Set();
          let uniquePosts = [];
          for (let p of allPosts) {
            let key = p.shortcode || p.postId;
            if (key && !seenShortcodes.has(key)) {
              seenShortcodes.add(key);
              uniquePosts.push(p);
            }
          }
          uniquePosts.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
          initialPosts = uniquePosts;
        } catch (err) {
          console.error("[Dog Saver] Parallel scan failed, falling back to sequential:", err);
          n = null;
        }
      }
      try {
        for (; !t.abort; ) {
          this.sendProgress(e.username, {
            taskId: e.taskId,
            username: e.username,
            status: "scanning",
            posts: _,
            media: l,
            oldestTs: c,
            zipChunkSize: u,
            message: n ? w("status_loading_next") : w("status_loading_first"),
          });
          let g,
            y = 0,
            k = 2;
          if (isFirstPage && initialPosts.length > 0) {
            g = {
              posts: initialPosts,
              cursor: n,
              hasNextPage: cacheHasNextPage && n !== null
            };
            initialPosts = [];
            isFirstPage = false;
          } else {
            for (let p = 0; !t.abort; p++)
              try {
                g = await o.fetchPage(n);
                break;
              } catch (b) {
                let E = b.message === I;
                if (b.message === "NETWORK_ERROR") {
                  if ((y++, y > k)) throw b;
                  let q = 5 * y;
                  (console.warn(
                    `[Dog Saver] Network error, retry ${y}/${k} in ${q}s`,
                  ),
                    await this.sleep(q * 1e3, t));
                  continue;
                }
                if (!E) throw b;
                let ye = Math.min(5 + p * 10, 60);
                for (let q = ye; q > 0 && !t.abort; q--)
                  (this.sendProgress(e.username, {
                    taskId: e.taskId,
                    username: e.username,
                    status: "rate_limited",
                    posts: _,
                    media: l,
                    message: w("status_rate_limited_retry", { seconds: q }),
                  }),
                    await this.sleep(1e3, t));
              }
          }
          if (t.abort || !g) break;
          if (n === null && o.profilePicUrl) {
            let p = {
              postId: "profile_avatar",
              index: 0,
              type: "image",
              url: o.profilePicUrl,
              timestamp: Math.floor(Date.now() / 1e3),
              creator: e.username,
            };
            g.posts.unshift({
              postId: "profile_avatar",
              shortcode: "profile_avatar",
              timestamp: p.timestamp,
              isCarousel: !1,
              carouselCount: 1,
              mediaItems: [p],
              typename: "GraphImage",
            });
          }
          for (let p of g.posts) {
            if (t.abort) break;
            if (p.isCarousel && p.mediaItems.length < p.carouselCount)
              try {
                let b = await r.resolveCarousel(
                  p.postId,
                  p.carouselCount,
                  p.mediaItems,
                  p.timestamp,
                );
                p.mediaItems = b;
              } catch (b) {
                (console.warn(
                  `[Dog Saver] Skipping carousel ${p.postId}: ${b.message}`,
                ),
                  (p.mediaItems = []));
              }
          }
          if (t.abort) break;
          let N = g.posts.filter((p) => p.mediaItems.length > 0),
            oe = N.filter((p) => p.postId === "profile_avatar"),
            C = N.filter((p) => p.postId !== "profile_avatar");
          let maxConsecutive = 20;
          if (
            e.minLikes > 0 ||
            e.minViews > 0 ||
            e.minComments > 0 ||
            e.minSaves > 0 ||
            e.hashtag
          ) {
            let consecutiveFailed = this.consecutiveFailed ?? 0;
            let stopConditionHit = false;
            for (let p of C) {
              let passed = true;
              if (e.minLikes > 0 && (p.likeCount ?? 0) < e.minLikes) passed = false;
              if (e.minViews > 0 && (p.playCount ?? 0) < e.minViews) passed = false;
              if (e.minComments > 0 && (p.commentCount ?? 0) < e.minComments) passed = false;
              if (e.minSaves > 0 && (p.saveCount ?? 0) < e.minSaves) passed = false;
              if (e.hashtag) {
                let tag = e.hashtag.trim().toLowerCase();
                let text = (p.captionText ?? "").toLowerCase();
                if (tag.startsWith("#")) {
                  if (!text.includes(tag)) passed = false;
                } else {
                  if (!text.includes(tag) && !text.includes("#" + tag)) passed = false;
                }
              }
              if (!passed) {
                consecutiveFailed++;
                if (consecutiveFailed >= maxConsecutive) {
                  stopConditionHit = true;
                  break;
                }
              } else {
                consecutiveFailed = 0;
              }
            }
            this.consecutiveFailed = consecutiveFailed;
            if (stopConditionHit) {
              await this.taskManager.markEarlyStop(e.taskId);
            }

            C = C.filter((p) => {
              if (e.minLikes > 0 && (p.likeCount ?? 0) < e.minLikes) return !1;
              if (e.minViews > 0 && (p.playCount ?? 0) < e.minViews) return !1;
              if (e.minComments > 0 && (p.commentCount ?? 0) < e.minComments)
                return !1;
              if (e.minSaves > 0 && (p.saveCount ?? 0) < e.minSaves) return !1;
              if (e.hashtag) {
                let tag = e.hashtag.trim().toLowerCase();
                let text = (p.captionText ?? "").toLowerCase();
                if (tag.startsWith("#")) {
                  if (!text.includes(tag)) return !1;
                } else {
                  if (!text.includes(tag) && !text.includes("#" + tag))
                    return !1;
                }
              }
              return !0;
            });
          }
          let z = !1;
          if (d > 0) {
            let p = d - _;
            p <= 0
              ? ((C = []), (z = !0))
              : C.length > p && ((C = C.slice(0, p)), (z = !0));
          }
          let Q = [...oe, ...C],
            R = await filterFreshMedia(e.taskId, Q.flatMap((p) => p.mediaItems)),
            fe = Q.map((p) => p.postId);
          ((_ += C.length), (l += R.length));
          for (let p of Q)
            p.timestamp > 0 &&
              (c === 0 || p.timestamp < c) &&
              (c = p.timestamp);
          await this.taskManager.updateTaskProgress(
            e.taskId,
            z ? null : g.cursor,
            fe,
            R.length,
            c,
          );
          let $ = await this.taskManager.getTask(e.taskId);
          if ($.status === "stopped" || $.status === "paused") break;
          let h = z || !g.hasNextPage || $.stopConditionHit;
          if (
            (this.sendProgress(e.username, {
              taskId: e.taskId,
              username: e.username,
              status: "processing",
              posts: _,
              media: l,
              oldestTs: c,
              zipChunkSize: u,
            }),
            $.downloadAsZip)
          ) {
            if (R.length > 0) {
              let E = this.zipAccumulator.get(e.taskId) ?? [];
              (E.push(...R),
                this.zipAccumulator.set(e.taskId, E),
                await m.saveZipAccumulator(e.taskId, E));
            }
            let p = this.zipAccumulator.get(e.taskId) ?? [],
              b;
            for (; !t.abort && (b = Pe(p, u)) !== null; )
              (this.zipAccumulator.set(e.taskId, p),
                await m.saveZipAccumulator(e.taskId, p),
                this.enqueueChunkBuild(
                  e.taskId,
                  e.username,
                  b,
                  !1,
                  e.flatFolder,
                ));
            if (h) {
              let E = p.splice(0);
              (this.zipAccumulator.delete(e.taskId),
                await m.deleteZipAccumulator(e.taskId),
                E.length > 0 &&
                  this.enqueueChunkBuild(
                    e.taskId,
                    e.username,
                    E,
                    !0,
                    e.flatFolder,
                  ));
              let G = this.zipBuildQueue.get(e.taskId);
              if (
                (G && (await G),
                this.cleanupZipState(e.taskId),
                $.status === "running")
              ) {
                let ye = await this.taskManager.completeTask(e.taskId);
                this.onTaskCompleted && (await this.onTaskCompleted(ye));
              }
              await this.syncKeepAlive();
            }
          } else
            R.length > 0 && (await this.downloadQueue.enqueue(e.taskId, R));
          if (h) {
            (this.sendProgress(e.username, {
              taskId: e.taskId,
              username: e.username,
              status: "done",
              posts: _,
              media: l,
              oldestTs: c,
            }),
              this.activeScans.delete(e.taskId));
            return;
          }
          this.sendProgress(e.username, {
            taskId: e.taskId,
            username: e.username,
            status: "waiting",
            posts: _,
            media: l,
            oldestTs: c,
            zipChunkSize: u,
            message: w("status_waiting_next"),
          });
          let P = x.randomDelay();
          (await this.sleep(P * 1e3, t), (n = g.cursor));
        }
      } catch (g) {
        (console.error(`[Dog Saver] Scanner error for task ${e.taskId}:`, g),
          this.sendProgress(e.username, {
            taskId: e.taskId,
            username: e.username,
            status: "error",
            posts: _,
            media: l,
            message: g.message,
          }));
        try {
          await this.taskManager.stopTask(e.taskId);
        } catch {}
      } finally {
        this.activeScans.delete(e.taskId);
      }
    }
    async startSavedScan(e) {
      if (
        (console.log(
          `[Dog Saver][Scanner] startSavedScan called: taskId=${e.taskId}, source=${e.source}, username=${e.username}, collectionId=${e.collectionId}, collectionName=${e.collectionName}, selectedCollections=${e.selectedCollections?.length ?? 0}`,
        ),
        this.activeScans.has(e.taskId))
      ) {
        console.warn(
          `[Dog Saver][Scanner] startSavedScan: scan already active for task ${e.taskId}, skipping`,
        );
        return;
      }
      let t = { abort: !1 };
      this.activeScans.set(e.taskId, t);
      let i = new x(),
        a = e.seenPostCount,
        o = e.totalMediaFound;
      i.onWait = (l) => (
        console.log(`[Dog Saver][Scanner] rate limit wait: ${l}`),
        this.sendProgressToSavedTabs({
          taskId: e.taskId,
          username: e.username,
          status: "rate_limited",
          posts: a,
          media: o,
          message: l,
        }),
        !t.abort
      );
      let r = new ge(e.username, e.filter, i),
        n = new te(e.username),
        _ = this.getZipChunkSize();
      try {
        if (e.source === "saved_collection") {
          let l = e.collectionType === "ALL_MEDIA_AUTO_COLLECTION",
            c = l ? void 0 : e.collectionId;
          console.log(
            `[Dog Saver][Scanner] starting single collection scan: collectionId=${e.collectionId}, name=${e.collectionName}, isAllPosts=${l}`,
          );
          let d = await this.scanSavedPosts(
            e,
            r,
            n,
            t,
            _,
            a,
            o,
            c,
            e.collectionName,
          );
          ((a = d.totalPosts),
            (o = d.totalMedia),
            console.log(
              `[Dog Saver][Scanner] single collection scan done: posts=${a}, media=${o}`,
            ));
        } else if (e.source === "saved_all") {
          let l = e.selectedCollections ?? [];
          console.log(
            `[Dog Saver][Scanner] starting saved_all scan: ${l.length} collections`,
          );
          let c = await this.scanSavedPosts(
            e,
            r,
            n,
            t,
            _,
            a,
            o,
            void 0,
            void 0,
            l,
          );
          ((a = c.totalPosts),
            (o = c.totalMedia),
            console.log(
              `[Dog Saver][Scanner] saved_all scan done: posts=${a}, media=${o}`,
            ));
        } else
          console.error(
            `[Dog Saver][Scanner] startSavedScan: unexpected source="${e.source}"`,
          );
        if (t.abort)
          console.log(
            "[Dog Saver][Scanner] startSavedScan: aborted, not finalizing",
          );
        else {
          if (
            (console.log(
              `[Dog Saver][Scanner] startSavedScan: all collections done, finalizing. downloadAsZip=${e.downloadAsZip}`,
            ),
            e.downloadAsZip)
          ) {
            let d = (this.zipAccumulator.get(e.taskId) ?? []).splice(0);
            (console.log(
              `[Dog Saver][Scanner] startSavedScan: remaining items for final ZIP: ${d.length}`,
            ),
              this.zipAccumulator.delete(e.taskId),
              await m.deleteZipAccumulator(e.taskId),
              d.length > 0 &&
                this.enqueueChunkBuild(
                  e.taskId,
                  e.username,
                  d,
                  !0,
                  e.flatFolder,
                ));
            let u = this.zipBuildQueue.get(e.taskId);
            (u &&
              (console.log(
                "[Dog Saver][Scanner] startSavedScan: waiting for final ZIP build...",
              ),
              await u),
              this.cleanupZipState(e.taskId));
          }
          let l = await this.taskManager.getTask(e.taskId);
          if (
            (console.log(
              `[Dog Saver][Scanner] startSavedScan: fresh task status=${l.status}`,
            ),
            l.status === "running")
          ) {
            let c = await this.taskManager.completeTask(e.taskId);
            (this.onTaskCompleted && (await this.onTaskCompleted(c)),
              console.log(
                "[Dog Saver][Scanner] startSavedScan: task marked as completed",
              ));
          }
          (await this.syncKeepAlive(),
            this.sendProgressToSavedTabs({
              taskId: e.taskId,
              username: e.username,
              status: "done",
              posts: a,
              media: o,
            }));
        }
      } catch (l) {
        (console.error(
          `[Dog Saver][Scanner] Saved scanner error for task ${e.taskId}:`,
          l.message,
          l.stack,
        ),
          this.sendProgressToSavedTabs({
            taskId: e.taskId,
            username: e.username,
            status: "error",
            posts: a,
            media: o,
            message: l.message,
          }));
        try {
          await this.taskManager.stopTask(e.taskId);
        } catch {}
      } finally {
        (this.activeScans.delete(e.taskId),
          console.log(
            `[Dog Saver][Scanner] startSavedScan: scan ended for task ${e.taskId}`,
          ));
      }
    }
    async scanSavedPosts(e, t, i, a, o, r, n, _, l, c) {
      let d = e.cursor,
        u = 0,
        g = new Map(),
        y;
      if (c)
        for (let k of c)
          (g.set(k.collectionId, k.collectionName),
            k.collectionType === "ALL_MEDIA_AUTO_COLLECTION" &&
              (y = k.collectionName));
      for (
        console.log(
          `[Dog Saver][Scanner] scanSavedPosts START: collectionId=${_ ?? "all"}, cursor=${d}`,
        );
        !a.abort;
      ) {
        (u++,
          this.sendProgressToSavedTabs({
            taskId: e.taskId,
            username: e.username,
            status: "scanning",
            posts: r,
            media: n,
            zipChunkSize: o,
            message: l
              ? w("status_collection_progress", { name: l })
              : d
                ? w("status_loading_next")
                : w("status_loading_first"),
          }));
        let k,
          N = 0,
          oe = 2;
        for (let h = 0; !a.abort; h++)
          try {
            ((k = await t.fetchSavedPage(d, _)),
              console.log(
                `[Dog Saver][Scanner] scanSavedPosts page ${u}: posts=${k.posts.length}, hasNext=${k.hasNextPage}`,
              ));
            break;
          } catch (P) {
            let p = P.message === I;
            if (P.message === "NETWORK_ERROR") {
              if ((N++, N > oe)) throw P;
              let G = 5 * N;
              (console.warn(
                `[Dog Saver] Saved scan network error, retry ${N}/${oe} in ${G}s`,
              ),
                await this.sleep(G * 1e3, a));
              continue;
            }
            if (!p) throw P;
            let E = Math.min(5 + h * 10, 60);
            for (let G = E; G > 0 && !a.abort; G--)
              (this.sendProgressToSavedTabs({
                taskId: e.taskId,
                username: e.username,
                status: "rate_limited",
                posts: r,
                media: n,
                message: w("status_rate_limited_retry", { seconds: G }),
              }),
                await this.sleep(1e3, a));
          }
        if (a.abort || !k) break;
        for (let h of k.posts) {
          if (a.abort) break;
          if (h.isCarousel && h.mediaItems.length < h.carouselCount)
            try {
              h.mediaItems = await i.resolveCarousel(
                h.postId,
                h.carouselCount,
                h.mediaItems,
                h.timestamp,
              );
            } catch (P) {
              (console.warn(
                `[Dog Saver][Scanner] Skipping carousel ${h.postId}: ${P.message}`,
              ),
                (h.mediaItems = []));
            }
        }
        if (a.abort) break;
        let C = k.posts.filter((h) => h.mediaItems.length > 0);
        if (
          e.minLikes > 0 ||
          e.minViews > 0 ||
          e.minComments > 0 ||
          e.minSaves > 0 ||
          e.hashtag
        ) {
          C = C.filter((p) => {
            if (e.minLikes > 0 && (p.likeCount ?? 0) < e.minLikes) return !1;
            if (e.minViews > 0 && (p.playCount ?? 0) < e.minViews) return !1;
            if (e.minComments > 0 && (p.commentCount ?? 0) < e.minComments)
              return !1;
            if (e.minSaves > 0 && (p.saveCount ?? 0) < e.minSaves) return !1;
            if (e.hashtag) {
              let tag = e.hashtag.trim().toLowerCase();
              let text = (p.captionText ?? "").toLowerCase();
              if (tag.startsWith("#")) {
                if (!text.includes(tag)) return !1;
              } else {
                if (!text.includes(tag) && !text.includes("#" + tag)) return !1;
              }
            }
            return !0;
          });
        }
        let z = C.flatMap((h) => {
          if (l) return h.mediaItems.map((p) => ({ ...p, collectionName: l }));
          if (!c) return [];
          let P = new Set();
            if ((y && P.add(y), h.savedCollectionIds))
              for (let p of h.savedCollectionIds) {
                let b = g.get(p);
                b && P.add(b);
              }
            return P.size === 0
              ? []
              : [...P].flatMap((p) =>
                  h.mediaItems.map((b) => ({ ...b, collectionName: p })),
                );
          }),
          Q = C.map((h) => h.postId);
        z = await filterFreshMedia(e.taskId, z);
        ((r += C.length),
          (n += z.length),
          await this.taskManager.updateTaskProgress(
            e.taskId,
            k.cursor,
            Q,
            z.length,
          ));
        let R = await this.taskManager.getTask(e.taskId);
        if (R.status === "stopped" || R.status === "paused") break;
        let fe = !k.hasNextPage;
        if (
          (this.sendProgressToSavedTabs({
            taskId: e.taskId,
            username: e.username,
            status: "processing",
            posts: r,
            media: n,
            zipChunkSize: o,
          }),
          R.downloadAsZip)
        ) {
          if (z.length > 0) {
            let p = this.zipAccumulator.get(e.taskId) ?? [];
            (p.push(...z),
              this.zipAccumulator.set(e.taskId, p),
              await m.saveZipAccumulator(e.taskId, p));
          }
          let h = this.zipAccumulator.get(e.taskId) ?? [],
            P;
          for (; !a.abort && (P = Pe(h, o)) !== null; )
            (this.zipAccumulator.set(e.taskId, h),
              await m.saveZipAccumulator(e.taskId, h),
              this.enqueueChunkBuild(
                e.taskId,
                e.username,
                P,
                !1,
                e.flatFolder,
              ));
        } else z.length > 0 && (await this.downloadQueue.enqueue(e.taskId, z));
        if (fe) {
          await this.taskManager.updateTaskProgress(e.taskId, null, [], 0);
          break;
        }
        this.sendProgressToSavedTabs({
          taskId: e.taskId,
          username: e.username,
          status: "waiting",
          posts: r,
          media: n,
          zipChunkSize: o,
          message: w("status_waiting_next"),
        });
        let $ = x.randomDelay();
        (await this.sleep($ * 1e3, a), (d = k.cursor));
      }
      return { totalPosts: r, totalMedia: n };
    }
    sendProgressToSavedTabs(e) {
      chrome.tabs
        .query({ url: "https://www.instagram.com/*/saved/*" })
        .then((t) => {
          chrome.tabs
            .query({ url: "https://www.instagram.com/*/saved" })
            .then((i) => {
              let a = [...t, ...i],
                o = new Set();
              for (let r of a)
                r.id &&
                  !o.has(r.id) &&
                  (o.add(r.id),
                  chrome.tabs
                    .sendMessage(r.id, { type: "SCAN_PROGRESS", payload: e })
                    .catch(() => {}));
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
    pauseScan(e) {
      let t = this.activeScans.get(e);
      t && (t.abort = !0);
    }
    stopScan(e) {
      let t = this.activeScans.get(e);
      t && (t.abort = !0);
    }
    isScanning(e) {
      return this.activeScans.has(e);
    }
    sendProgress(e, t) {
      chrome.tabs
        .query({ url: `https://www.instagram.com/${e}/*` })
        .then((i) => {
          for (let a of i)
            a.id &&
              chrome.tabs
                .sendMessage(a.id, { type: "SCAN_PROGRESS", payload: t })
                .catch(() => {});
        })
        .catch(() => {});
    }
    sendProgressToAllTabs(e) {
      chrome.tabs
        .query({ url: "https://www.instagram.com/*" })
        .then((t) => {
          for (let i of t)
            i.id &&
              chrome.tabs
                .sendMessage(i.id, { type: "SCAN_PROGRESS", payload: e })
                .catch(() => {});
        })
        .catch(() => {});
    }
    sleep(e, t) {
      return new Promise((i) => {
        let a = setTimeout(() => {
            (clearInterval(o), i());
          }, e),
          o = setInterval(() => {
            t.abort && (clearTimeout(a), clearInterval(o), i());
          }, 200);
      });
    }
  };
  var ft = "IG_SAVER_BUILD_ZIP_AND_CREATE_URL",
    yt = "IG_SAVER_REVOKE_BLOB_URL",
    Ie = "offscreen.html",
    ae = null,
    B = 0;
  async function vt() {
    (ae && (await ae),
      !(
        typeof chrome.runtime.getContexts == "function" &&
        (
          await chrome.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [chrome.runtime.getURL(Ie)],
          })
        ).length > 0
      ) &&
        ((ae = chrome.offscreen.createDocument({
          url: Ie,
          reasons: ["BLOBS"],
          justification:
            "Build ZIP and create blob URL (Blob cannot be transferred via messaging)",
        })),
        await ae,
        (ae = null),
        await new Promise((s) => setTimeout(s, 100))));
  }
  async function Se() {
    try {
      if (
        typeof chrome.runtime.getContexts == "function" &&
        (
          await chrome.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [chrome.runtime.getURL(Ie)],
          })
        ).length === 0
      )
        return;
      await chrome.offscreen.closeDocument();
    } catch {}
  }
  async function ie(s, e, t) {
    let i = t?.flatFolder,
      a = t?.collectionName,
      o = e.map((c) => {
        let d = c.collectionName ?? a;
        return { url: c.url, path: d != null ? Ce(c, d, i, s) : re(c, i) };
      });
    (await vt(), B++);
    let r = t?.signal;
    if (r?.aborted)
      throw (B--, B === 0 && Se(), new DOMException("Aborted", "AbortError"));
    let n = await new Promise((c, d) => {
      (r &&
        r.addEventListener(
          "abort",
          () => {
            (chrome.runtime
              .sendMessage({
                type: "IG_SAVER_CANCEL_ZIP_BUILD",
                taskId: t?.taskId,
              })
              .catch(() => {}),
              d(new DOMException("Aborted", "AbortError")));
          },
          { once: !0 },
        ),
        chrome.runtime.sendMessage(
          {
            type: ft,
            username: s,
            items: o,
            taskId: t?.taskId,
            concurrency: t?.concurrency,
          },
          (u) => {
            chrome.runtime.lastError
              ? d(new Error(chrome.runtime.lastError?.message))
              : c(u ?? {});
          },
        ));
    });
    if (n.error || !n.url)
      throw (
        B--,
        B === 0 && Se(),
        new Error(n.error ?? w("error_zip_build_failed"))
      );
    let _ = n.url,
      l = t?.filename ?? `${s}_instagram.zip`;
    try {
      return (
        await relayDownloadToElectron({ url: _, filename: l }),
        // The Electron bridge acknowledges before downloadURL has necessarily
        // opened the blob. Keep it alive briefly so profile ZIPs are not
        // revoked before the native download starts.
        setTimeout(
          () => chrome.runtime.sendMessage({ type: yt, url: _ }).catch(() => {}),
          5000,
        ),
        { downloaded: n.downloaded ?? e.length, failed: n.failed ?? 0 }
      );
    } finally {
      (B--, B === 0 && Se());
    }
  }
  var xe = "ig-saver-keepalive";
  function kt() {
    chrome.alarms.create(xe, { periodInMinutes: 25 / 60 });
  }
  function wt() {
    chrome.alarms.clear(xe);
  }
  async function et(s) {
    (await s.getAllTasks()).some(
      (i) => i.status === "running" || i.status === "paused",
    )
      ? kt()
      : wt();
  }
  function tt() {
    chrome.alarms.clear("ig-saver-profile-monitor");
  }
  var bt = {
      organizationId: "30810015-cdd4-4f01-ab8e-854614049e08",
      checkoutUrls: {
        monthly:
          "https://buy.polar.sh/polar_cl_ffzBuPQcM71zsq3NGjKpZmclCwQNWKL82vS5j095eE3",
        yearly:
          "https://buy.polar.sh/polar_cl_zPleas9RPGwbfQkSPqH8jbDtySP1QM1yGSpiu4SDB1G",
        lifetime:
          "https://buy.polar.sh/polar_cl_VzggaeIcr4zFQRfQ40pRcqpU1ugy2LxP5Q2fp3Yv3DD",
        lifetimeEarly:
          "https://buy.polar.sh/polar_cl_HckVpCKtouhSKRVi8TGnuZIUB6XVTclZVRO6m1fRqAk",
      },
      customerPortalUrl: "https://polar.sh/takomi-dev/portal",
    },
    Te = bt,
    at = Te.organizationId,
    Ri = Te.checkoutUrls,
    Ei = Te.customerPortalUrl,
    Gi = Date.parse("2026-06-01T00:00:00Z");
  var St = !1
    ? "https://sandbox-api.polar.sh/v1/customer-portal/license-keys"
    : "https://api.polar.sh/v1/customer-portal/license-keys";
  function It(s) {
    if (typeof s != "string") return null;
    let e = Date.parse(s);
    return Number.isNaN(e) ? null : e;
  }
  async function xt(s, e) {
    let t = await fetch(`${St}/${s}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(e),
      }),
      i = {};
    try {
      i = await t.json();
    } catch {}
    return { status: t.status, data: i };
  }
  async function it(s, e, t) {
    let i;
    try {
      i = await xt("validate", {
        key: s,
        organization_id: e,
        activation_id: t,
      });
    } catch (r) {
      throw new Error(`Network error during license validation: ${r.message}`);
    }
    if (i.status !== 200)
      return {
        valid: !1,
        expiresAt: null,
        status: null,
        error: `http_${i.status}`,
      };
    let a = i.data ?? {},
      o = typeof a.status == "string" ? a.status : null;
    return {
      valid: o === "granted",
      expiresAt: It(a.license_key?.expires_at),
      status: o,
      error: o === "granted" ? null : o,
    };
  }
  var f = {
    legacyUser: "pro_legacy_user",
    legacyMarkedAt: "pro_legacy_marked_at",
    legacyFromVersion: "pro_legacy_from_version",
    legacyToken: "pro_legacy_token",
    legacyThanksShown: "pro_legacy_thanks_shown",
    license: "pro_license",
    activationId: "pro_activation_id",
    deviceFp: "pro_device_fp",
    statusCache: "pro_status_cache",
    lastValidatedAt: "pro_last_validated_at",
    bulkAllTrialUsed: "pro_bulk_all_trial_used",
  };
  var Tt = 24 * 60 * 60 * 1e3,
    At = 30 * 24 * 60 * 60 * 1e3,
    st = 30,
    ot = 30,
    rt = 3;
  function nt(s) {
    if (!s) return !1;
    let e = Number.parseInt(s.split(".")[0] ?? "", 10);
    return Number.isNaN(e) ? !1 : e < 3;
  }
  async function lt(s) {
    let e = await chrome.storage.local.get(f.legacyToken),
      t =
        typeof e[f.legacyToken] == "string"
          ? e[f.legacyToken]
          : crypto.randomUUID();
    await chrome.storage.local.set({
      [f.legacyUser]: !0,
      [f.legacyMarkedAt]: Date.now(),
      [f.legacyFromVersion]: s,
      [f.legacyToken]: t,
    });
  }
  async function zt() {
    let s = await chrome.storage.local.get([
      f.legacyUser,
      f.license,
      f.activationId,
      f.statusCache,
      f.lastValidatedAt,
    ]);
    return {
      legacy: s[f.legacyUser] === !0,
      license: typeof s[f.license] == "string" ? s[f.license] : null,
      activationId:
        typeof s[f.activationId] == "string" ? s[f.activationId] : null,
      cache: s[f.statusCache] ?? null,
      lastValidatedAt:
        typeof s[f.lastValidatedAt] == "number" ? s[f.lastValidatedAt] : null,
    };
  }
  async function Ae(s = {}, e) {
    return { kind: "legacy" };
  }
  function ze(s) {
    return !0;
  }
  async function _t() {
    let e = (await chrome.storage.local.get(f.bulkAllTrialUsed))[
      f.bulkAllTrialUsed
    ];
    return typeof e == "number" && e >= 0 ? e : 0;
  }
  async function dt() {
    let e = (await _t()) + 1;
    return (await chrome.storage.local.set({ [f.bulkAllTrialUsed]: e }), e);
  }
  async function ct(s, e) {
    return ze(s)
      ? { allowed: !0 }
      : e.hasCustomRange
        ? { allowed: !1, reason: "customRange" }
        : e.topK !== void 0 && e.topK > st
          ? { allowed: !1, reason: "topK", detail: String(st) }
          : e.nDays !== void 0 && e.nDays !== null && e.nDays > ot
            ? { allowed: !1, reason: "days", detail: String(ot) }
            : e.isAllScope && (await _t()) >= rt
              ? { allowed: !1, reason: "allTrialExhausted", detail: String(rt) }
              : { allowed: !0 };
  }
  var v = new le(),
    S,
    D;
  function L() {
    return et(v);
  }
  tt();
  var De = 1e3,
    V = 3,
    A = new Map(),
    F = new Map(),
    W = new Map(),
    U = new Map(),
    se = new Set(),
    M = new Map(),
    he = new Set(),
    Dt = 24 * 60 * 60 * 1e3;
  async function Ct() {
    let s = await v.getAllTasks(),
      e = Date.now();
    for (let t of s)
      (t.status === "done" || t.status === "stopped") &&
        (await m.deleteQueue(t.taskId),
        await m.deleteZipAccumulator(t.taskId),
        await m.deleteZipPartCounter(t.taskId),
        e - t.updatedAt > Dt &&
          (await m.deleteTask(t.taskId),
          console.log(
            `[Dog Saver] Cleaned up old task ${t.taskId} (${t.username})`,
          )));
  }
  async function ut(s, e) {
    if (
      !(
        (s.source ?? "profile") === "profile" &&
        s.dateFilter?.mode === "all" &&
        (s.topK ?? 0) === 0
      ) ||
      (e ?? s.totalMediaDownloaded ?? 0) <= 0
    )
      return;
    let a = await Ae();
    ze(a) || (await dt());
  }
  async function Rt() {
    let s = await m.getSettings();
    ((De = s.zipChunkSize),
      (V = s.concurrency),
      (S = new _e(s)),
      S.setOnStatusChange((t) => {
        chrome.runtime
          .sendMessage({
            type: "TASK_UPDATE",
            payload: { itemId: t.id, status: t.status },
          })
          .catch(() => {});
      }),
      S.setOnTaskComplete(async (t, i, a) => {
        await v.updateDownloadCount(t, i, a);
        let o = await v.getTask(t);
        (o.status === "running" && ((o.status = "done"), await v.completeTask(t)),
          await rememberProfileCheckpoint(o),
          await ut(o, i),
          await m.deleteQueue(t),
          S.evictCache(t),
          await L());
      }),
      (D = new me(
        v,
        S,
        () => De,
        A,
        pt,
        K,
        U,
        L,
        async (t) => {
          await rememberProfileCheckpoint(t);
          await ut(t);
        },
      )));
    let e = await v.getAllTasks();
    for (let t of e) {
      if (
        t.downloadAsZip &&
        (t.status === "running" || t.status === "paused")
      ) {
        let i = await m.getZipAccumulator(t.taskId);
        i.length > 0 && A.set(t.taskId, i);
        let a = await m.getZipPartCounter(t.taskId);
        a > 0 && F.set(t.taskId, a);
      }
      t.status === "running" &&
        (await S.recoverStuckDownloads(t.taskId),
        S.resumeTask(t.taskId),
        t.source === "saved_collection" || t.source === "saved_all"
          ? D.startSavedScan(t)
          : t.cursor !== null && D.startScan(t));
    }
    (await L(), await Ct(), console.log("[Dog Saver] Background initialized"));
  }
  Rt();

  async function Et(s, e, t, i, a) {
    if (se.has(s) && !i) return;
    let o = await v.getTask(s).catch(() => null);
    if (o?.status === "paused") {
      let _ = A.get(s) ?? [];
      (_.unshift(...t), A.set(s, _), await m.saveZipAccumulator(s, _));
      return;
    }
    let r = (F.get(s) ?? 0) + 1;
    (F.set(s, r),
      await m.saveZipPartCounter(s, r),
      W.set(s, { current: 0, total: t.length }));
    let n = new AbortController();
    M.set(s, n);
    try {
      let l =
          o?.source === "saved_collection" || o?.source === "saved_all"
            ? `${e}_saved`
            : `${e}_instagram`,
        c = i && r === 1 ? `${l}.zip` : `${l}_part${r}.zip`,
        d = o?.source === "saved_collection" ? o.collectionName : void 0,
        { downloaded: u, failed: g } = await ie(e, t, {
          filename: `${e}/${c}`,
          taskId: s,
          signal: n.signal,
          concurrency: V,
          flatFolder: a,
          collectionName: d,
        });
      u > 0 && (await markDownloadedMedia(s, t.slice(0, u)));
      await v.updateDownloadCount(s, u, g);
    } catch (_) {
      if (_.name === "AbortError") {
        console.log(`[Dog Saver] ZIP build aborted for task ${s}`);
        let l = A.get(s) ?? [];
        (l.unshift(...t), A.set(s, l), await m.saveZipAccumulator(s, l));
        let c = F.get(s) ?? 1;
        c > 0 && (F.set(s, c - 1), await m.saveZipPartCounter(s, c - 1));
        return;
      }
      (await v.updateDownloadCount(s, 0, t.length),
        console.error("[Dog Saver] ZIP chunk build failed:", _));
      try {
        await v.stopTask(s);
      } catch {}
    } finally {
      (W.delete(s), M.delete(s));
    }
  }
  function pt(s, e, t, i, a) {
    let r = (U.get(s) ?? Promise.resolve()).then(() => Et(s, e, t, i, a));
    return (U.set(s, r), r);
  }
  function K(s) {
    (A.delete(s),
      F.delete(s),
      W.delete(s),
      U.delete(s),
      se.delete(s),
      M.delete(s),
      m.deleteZipAccumulator(s).catch(() => {}),
      m.deleteZipPartCounter(s).catch(() => {}));
  }
  Ye().catch(() => {});
  chrome.runtime.onMessage.addListener((s, e, t) => {
    let i = s.type;
    if (typeof i == "string" && i.startsWith("TIKTOK_")) return !1;
    if (
      i === "IG_SAVER_BUILD_ZIP_AND_CREATE_URL" ||
      i === "IG_SAVER_REVOKE_BLOB_URL" ||
      i === "IG_SAVER_CANCEL_ZIP_BUILD"
    )
      return !0;
    if (i === "IG_SAVER_ZIP_PROGRESS") {
      let {
        taskId: a,
        current: o,
        total: r,
        phase: n,
        zipPercent: _,
        path: l,
      } = s.payload ?? {};
      return (
        a &&
          (W.set(a, { current: o, total: r, phase: n, zipPercent: _ }),
          he.has(a) &&
            chrome.tabs.query({ url: ["*://www.instagram.com/*"] }, (c) => {
              for (let d of c)
                d.id != null &&
                  chrome.tabs
                    .sendMessage(d.id, {
                      type: "EXTRAS_PROGRESS",
                      payload: {
                        taskId: a,
                        current: o,
                        total: r,
                        phase: n,
                        zipPercent: _,
                        path: l,
                      },
                    })
                    .catch(() => {});
            })),
        !1
      );
    }
    return (
      Gt(s, e)
        .then(t)
        .catch((a) => t({ error: a.message })),
      !0
    );
  });
  async function Gt(s, e) {
    switch (
      (console.log(
        "[Dog Saver] handleMessage type:",
        s.type,
        "from:",
        e.url?.slice(0, 60),
      ),
      s.type)
    ) {
      case "START_BULK_DOWNLOAD": {
        let {
          username: t,
          filter: i,
          dateFilter: a,
          downloadAsZip: o,
          topK: r,
          flatFolder: n,
          source: _,
          csrfToken: l,
          minLikes: minLikes,
          minViews: minViews,
          minComments: minComments,
          hashtag: hashtag,
          minSaves: minSaves,
        } = s.payload;
        if ((_ ?? "profile") === "profile") {
          let u = await Ae(),
            g = {
              topK: r,
              nDays: a?.mode === "lastNDays" ? a.nDays : null,
              hasCustomRange: a?.mode === "range",
              isAllScope: a?.mode === "all" && (r ?? 0) === 0,
            },
            y = await ct(u, g);
          if (!y.allowed)
            return {
              error: "pro_required",
              reason: y.reason,
              detail: y.detail,
            };
        }
        let d = await v.createTask(t, i, a, o, r, n);
        return (
          (d.source = _ ?? "profile"),
          l && (d.csrfToken = l),
          (d.minLikes = minLikes),
          (d.minViews = minViews),
          (d.minComments = minComments),
          (d.minSaves = minSaves),
          (d.hashtag = hashtag),
          await m.saveTask(d),
          d.downloadAsZip && A.set(d.taskId, []),
          await L(),
          D.startScan(d),
          { task: d }
        );
      }
      case "START_SAVED_DOWNLOAD": {
        console.log(
          "[Dog Saver][BG] START_SAVED_DOWNLOAD received, payload:",
          JSON.stringify(s.payload)?.slice(0, 500),
        );
        let {
          username: t,
          filter: i,
          flatFolder: a,
          source: o,
          collectionId: r,
          collectionName: n,
          collectionType: _,
          selectedCollections: l,
          minLikes: minLikes,
          minViews: minViews,
          minComments: minComments,
          hashtag: hashtag,
        } = s.payload;
        console.log(
          `[Dog Saver][BG] START_SAVED_DOWNLOAD: username=${t}, filter=${i}, source=${o}, collectionId=${r}, collectionName=${n}, selectedCollections=${l?.length ?? 0}`,
        );
        let c = { mode: "all", fromTs: null, toTs: null, nDays: null },
          d = await v.createTask(t, i, c, !0, void 0, a);
        return (
          console.log(
            `[Dog Saver][BG] START_SAVED_DOWNLOAD: task created, taskId=${d.taskId}`,
          ),
          (d.source = o),
          r && (d.collectionId = r),
          n && (d.collectionName = n),
          _ && (d.collectionType = _),
          l && (d.selectedCollections = l),
          (d.currentCollectionIndex = 0),
          (d.minLikes = minLikes),
          (d.minViews = minViews),
          (d.minComments = minComments),
          (d.hashtag = hashtag),
          await m.saveTask(d),
          console.log(
            "[Dog Saver][BG] START_SAVED_DOWNLOAD: task saved to storage, starting scan...",
          ),
          A.set(d.taskId, []),
          await L(),
          D.startSavedScan(d),
          console.log(
            "[Dog Saver][BG] START_SAVED_DOWNLOAD: scan started (fire-and-forget)",
          ),
          { task: d }
        );
      }
      case "DOWNLOAD_AVATAR": {
        let { username: t, url: i } = s.payload;
        if (!i) return { error: w("error_no_avatar_url") };
        try {
          return {
            success: !0,
            downloadId: await relayDownloadToElectron({
              url: i,
              filename: `${t}/${t}_avatar.jpg`,
            }),
          };
        } catch (a) {
          return { error: a.message };
        }
      }
      case "DOWNLOAD_POST_AS_ZIP": {
        let { username: t, postId: i, items: a } = s.payload;
        if (!a?.length) return { error: w("error_no_media_items") };
        let o = a[0]?.timestamp,
          r = o != null ? new Date(o * 1e3) : new Date(),
          year = r.getUTCFullYear(),
          month = String(r.getUTCMonth() + 1).padStart(2, "0"),
          day = String(r.getUTCDate()).padStart(2, "0"),
          hour = String(r.getUTCHours()).padStart(2, "0"),
          min = String(r.getUTCMinutes()).padStart(2, "0"),
          dateStr = `${year}${month}${day}_${hour}${min}`;
        try {
          let zipFilename = t && t !== "unknown" ? `${t}/${dateStr}_${i}.zip` : `${dateStr}_${i}.zip`;
          return await ie(t, a, {
            filename: zipFilename,
            concurrency: V,
          });
        } catch (u) {
          return { error: u.message };
        }
      }
      case "DOWNLOAD_EXPLORE_ITEMS": {
        let { postId: t, items: i, username: a } = s.payload;
        if (!i?.length) return { error: w("error_no_media_items") };
        let r = [];
        for (let n of i) {
          let _ = j(n.type, n.url);
          let ts = n.timestamp ?? Math.floor(Date.now() / 1e3);
          let dateObj = new Date(ts * 1e3);
          let year = dateObj.getUTCFullYear();
          let month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
          let day = String(dateObj.getUTCDate()).padStart(2, "0");
          let hour = String(dateObj.getUTCHours()).padStart(2, "0");
          let min = String(dateObj.getUTCMinutes()).padStart(2, "0");
          let dateStr = `${year}${month}${day}_${hour}${min}`;
          
          let baseFilename = i.length === 1 ? `${dateStr}_${t}.${_}` : `${dateStr}_${t}_${n.index}.${_}`;
          let filename = a && a !== "unknown" ? `${a}/${baseFilename}` : baseFilename;
          try {
            await relayDownloadToElectron({ url: n.url, filename: filename });
          } catch (c) {
            r.push(c.message);
          }
        }
        return r.length ? { error: r.join("; ") } : { success: !0 };
      }
      case "DOWNLOAD_STORY_AS_ZIP": {
        let { username: t, storyId: i, items: a } = s.payload;
        if (!a?.length) return { error: w("error_no_media_items") };
        let o = a[0]?.timestamp,
          r = o != null ? new Date(o * 1e3) : new Date(),
          year = r.getUTCFullYear(),
          month = String(r.getUTCMonth() + 1).padStart(2, "0"),
          day = String(r.getUTCDate()).padStart(2, "0"),
          hour = String(r.getUTCHours()).padStart(2, "0"),
          min = String(r.getUTCMinutes()).padStart(2, "0"),
          dateStr = `${year}${month}${day}_${hour}${min}`;
        if (a.length === 1) {
          let d = a[0],
            u = j(d.type, d.url),
            g = t && t !== "unknown" ? `${t}/stories/${dateStr}_story_${i}.${u}` : `stories/${dateStr}_story_${i}.${u}`;
          try {
            return (
              await relayDownloadToElectron({ url: d.url, filename: g }),
              { downloaded: 1, failed: 0 }
            );
          } catch (y) {
            return { error: y.message };
          }
        }
        try {
          let zipFilename = t && t !== "unknown" ? `${t}/stories/${dateStr}_story_${i}.zip` : `stories/${dateStr}_story_${i}.zip`;
          return await ie(t, a, {
            filename: zipFilename,
            concurrency: V,
          });
        } catch (d) {
          return { error: d.message };
        }
      }
      case "DOWNLOAD_ALL_STORIES_AS_ZIP": {
        let { username: t, items: i, filename: a, taskId: o } = s.payload;
        if (!i?.length) return { error: w("error_no_story_items") };
        let r = o ? new AbortController() : void 0;
        o && r && M.set(o, r);
        try {
          let zipFilename = a || `${t}_stories.zip`;
          if (t && t !== "unknown") {
            zipFilename = `${t}/${zipFilename}`;
          }
          return await ie(t, i, {
            filename: zipFilename,
            concurrency: V,
            taskId: o,
            signal: r?.signal,
          });
        } catch (n) {
          return { error: n.message };
        } finally {
          o && (M.delete(o), W.delete(o));
        }
      }
      case "START_EXTRAS_TASK": {
        let { username: t, kind: i } = s.payload,
          a = { mode: "all", fromTs: null, toTs: null, nDays: null },
          o = await v.createTask(t, "all", a, !0, void 0, void 0, i);
        return (he.add(o.taskId), await L(), { taskId: o.taskId });
      }
      case "UPDATE_EXTRAS_TOTAL": {
        let { taskId: t, totalMediaFound: i, seenPostCount: a } = s.payload;
        try {
          return (await v.setTotalFound(t, i, a), { ok: !0 });
        } catch {
          return { ok: !1 };
        }
      }
      case "COMPLETE_EXTRAS_TASK": {
        let { taskId: t, downloaded: i, failed: a } = s.payload;
        try {
          await v.updateDownloadCount(t, i, a);
          let o = await v.getTask(t);
          (o.status === "running" || o.status === "paused") &&
            ((o.status = "done"), await v.completeTask(t));
        } catch {}
        return (he.delete(t), K(t), await L(), { ok: !0 });
      }
      case "CHECK_EXTRAS_CANCELLED": {
        let { taskId: t } = s.payload;
        if (se.has(t)) return { cancelled: !0 };
        try {
          return { cancelled: (await v.getTask(t)).status === "stopped" };
        } catch {
          return { cancelled: !0 };
        }
      }
      case "GET_TASKS": {
        let t = await v.getAllTasks();
        return {
          tasks: await Promise.all(
            t.map(async (a) => {
              if (a.downloadAsZip) {
                let o = A.get(a.taskId),
                  r = o ? o.length : 0,
                  n = W.get(a.taskId),
                  _ = F.get(a.taskId) ?? 0,
                  l = a.status === "stopped" && (n != null || U.has(a.taskId));
                return {
                  ...a,
                  queueStats: {
                    total: a.totalMediaFound,
                    pending: a.status === "running" ? r : 0,
                    downloading: 0,
                    done: a.totalMediaDownloaded,
                    failed: a.totalMediaFailed,
                  },
                  zipBuilding: n ?? null,
                  zipPartsCompleted: n ? _ - 1 : _,
                  saving: l,
                };
              }
              return { ...a, queueStats: await S.getQueueStats(a.taskId) };
            }),
          ),
        };
      }
      case "PAUSE_TASK": {
        let t = await v.pauseTask(s.payload.taskId);
        if ((S.pauseTask(t.taskId), D.pauseScan(t.taskId), t.downloadAsZip)) {
          let i = M.get(t.taskId);
          i && i.abort();
        }
        return (
          D.sendProgressToAllTabs({
            taskId: t.taskId,
            username: t.username,
            status: "paused",
            posts: t.seenPostCount,
            media: t.totalMediaFound,
          }),
          { task: t }
        );
      }
      case "RESUME_TASK": {
        let t = await v.resumeTask(s.payload.taskId);
        return (
          await S.recoverStuckDownloads(t.taskId),
          S.resumeTask(t.taskId),
          t.source === "saved_collection" || t.source === "saved_all"
            ? D.startSavedScan(t)
            : D.startScan(t),
          { task: t }
        );
      }
      case "STOP_TASK": {
        let { taskId: t, discardScanned: i } = s.payload,
          a = await v.stopTask(t);
        if (a.source === "highlights" || a.source === "stories") {
          se.add(a.taskId);
          let r = M.get(a.taskId);
          return (
            r && (r.abort(), M.delete(a.taskId)),
            he.delete(a.taskId),
            K(a.taskId),
            await L(),
            { task: a }
          );
        }
        (S.pauseTask(a.taskId), D.stopScan(a.taskId));
        let o = !1;
        if (a.downloadAsZip) {
          se.add(a.taskId);
          let r = M.get(a.taskId);
          r && (r.abort(), M.delete(a.taskId));
          let n = A.get(a.taskId) ?? [];
          if ((A.delete(a.taskId), n.length > 0 && !i)) {
            ((o = !0),
              U.delete(a.taskId),
              pt(a.taskId, a.username, n, !0, a.flatFolder));
            let _ = U.get(a.taskId);
            _ && _.then(() => K(a.taskId)).catch(() => K(a.taskId));
          } else K(a.taskId);
        } else
          (i && (await S.clearPendingItems(a.taskId)),
            await m.deleteQueue(a.taskId),
            S.evictCache(a.taskId));
        return (
          D.sendProgressToAllTabs({
            taskId: a.taskId,
            username: a.username,
            status: o ? "saving" : "stopped",
            posts: a.seenPostCount,
            media: a.totalMediaFound,
          }),
          await L(),
          { task: a }
        );
      }
      case "GET_SETTINGS":
        return { settings: await m.getSettings() };
      case "GET_DUPLICATE_STATS": {
        let t = await getDownloadedRegistry();
        return { total: Object.keys(t).length, registry: t };
      }
      case "CLEAR_DUPLICATE_REGISTRY":
        return (
          await chrome.storage.local.set({ [ADV.downloaded]: {} }),
          { ok: !0 }
        );
      case "GET_CLOUD_EXPORT_STATUS":
        return {
          available: !1,
          proFeature: !0,
          providers: ["google_drive", "dropbox"],
          message:
            "Cloud export is reserved for a future Pro connector and is not enabled in this build.",
        };
      case "UPDATE_SETTINGS": {
        let t = s.payload.settings;
        return (
          await m.saveSettings(t),
          S.updateSettings(t),
          (De = t.zipChunkSize),
          (V = t.concurrency),
          { settings: t }
        );
      }
      default:
        return (
          console.warn(
            "[Dog Saver] Unknown message type:",
            s.type,
            JSON.stringify(s).slice(0, 200),
          ),
          { error: w("error_unknown_message") }
        );
    }
  }

})();
