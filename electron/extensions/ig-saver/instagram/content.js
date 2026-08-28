"use strict";
if (typeof chrome !== 'undefined') {
  if (!chrome.offscreen) {
    chrome.offscreen = {
      createDocument: function () { return Promise.resolve(); },
      closeDocument: function () { return Promise.resolve(); },
      Reason: { BLOBS: 'BLOBS' }
    };
  }
  if (chrome.runtime && !chrome.runtime.getContexts) {
    chrome.runtime.getContexts = function (filter) {
      if (filter && filter.contextTypes && filter.contextTypes.includes('OFFSCREEN_DOCUMENT')) {
        return Promise.resolve([{ contextType: 'OFFSCREEN_DOCUMENT' }]);
      }
      return Promise.resolve([]);
    };
  }
  if (!chrome.downloads) {
    chrome.downloads = {
      download: function(options, callback) {
        console.log("[Polyfill] chrome.downloads.download called:", options);
        if (typeof window !== 'undefined') {
          try {
            window.postMessage({
              type: 'IG_SAVER_DOWNLOAD_REQUEST',
              url: options.url,
              filename: options.filename || ''
            }, '*');
            console.log("[Polyfill] Download request sent via postMessage bridge");
            if (callback) setTimeout(() => callback(12345), 0);
          } catch (err) {
            console.error("[Polyfill] postMessage download failed:", err);
            if (callback) setTimeout(() => callback(undefined), 0);
          }
        } else {
          chrome.runtime.sendMessage({
            type: "POLYFILL_TRIGGER_DOWNLOAD",
            url: options.url,
            filename: options.filename
          }, function(response) {
            if (callback) {
              if (chrome.runtime.lastError) {
                console.error("[Polyfill] Failed to send message:", chrome.runtime.lastError.message);
                callback(undefined);
              } else {
                callback(12345);
              }
            }
          });
        }
      }
    };
  }
  if (typeof document !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    if (!window.__has_download_polyfill_listener) {
      window.__has_download_polyfill_listener = true;
      chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message && message.type === "POLYFILL_TRIGGER_DOWNLOAD") {
          console.log("[Polyfill] Received POLYFILL_TRIGGER_DOWNLOAD:", message.url);
          try {
            window.postMessage({
              type: 'IG_SAVER_DOWNLOAD_REQUEST',
              url: message.url,
              filename: message.filename || ''
            }, '*');
            console.log("[Polyfill] Download request forwarded via postMessage bridge");
            sendResponse({ success: true });
          } catch (err) {
            console.error("[Polyfill] Download forward failed:", err);
            sendResponse({ error: err.message });
          }
          return true;
        }
      });
    }
  }
}
"use strict";
(() => {
  function relaySingleMediaToElectron(username, postId, media) {
    let extension = media?.type === "video" ? "mp4" : "jpg";
    try {
      let match = new URL(media.url).pathname.match(/\.(\w+)$/);
      if (match) extension = match[1].toLowerCase();
    } catch {}

    let date = new Date((media?.timestamp ?? Math.floor(Date.now() / 1e3)) * 1e3),
      stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}_${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`,
      safeUsername = String(username || "unknown").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/, "").trim() || "unknown",
      safePostId = String(postId || "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/, "").trim() || "video",
      filename = `${safeUsername}/${stamp}_${safePostId}.${extension}`;

    window.postMessage({
      type: "IG_SAVER_DOWNLOAD_REQUEST",
      url: media.url,
      filename,
    }, "*");
    return Promise.resolve({ success: !0 });
  }

  var ft = { concurrency: 3, maxRetries: 2, zipChunkSize: 1e3 };
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
  function yt(i, e) {
    return e.mode === "all"
      ? !0
      : !(
          (e.fromTs !== null && i < e.fromTs) ||
          (e.toTs !== null && i > e.toTs)
        );
  }
  function vt(i, e) {
    return e.mode === "all"
      ? !1
      : e.mode === "range" && e.toTs !== null
        ? i > e.toTs
        : !1;
  }
  function fe(i, e) {
    return e.mode === "all" ? !1 : e.fromTs !== null ? i < e.fromTs : !1;
  }
  function bt(i, e) {
    return fe(i, e);
  }
  var z = "IG_HTML_RESPONSE";
  async function P(i) {
    let e = await i.text(),
      t = e.trim();
    if (t.length === 0) throw new Error("PARSE_ERROR");
    if (t.startsWith("<")) throw new Error(z);
    try {
      return JSON.parse(e);
    } catch {
      throw new Error("PARSE_ERROR");
    }
  }
  async function q() {
    if (typeof document > "u") return null;
    let i = document.cookie.match(/csrftoken=([^;]+)/);
    return i ? i[1].trim() : null;
  }
  var ae = {
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
    dialog_filter_title: "Content Filters (Optional)",
    dialog_filter_hashtag: "Hashtag or Keyword",
    dialog_filter_likes: "Min Likes",
    dialog_filter_views: "Min Views (Videos)",
    dialog_filter_comments: "Min Comments",
    dialog_filter_saves: "Min Saves",
    dialog_estimate_prefix: "Estimated download time:",
    dialog_estimate_seconds: "~{count} seconds",
    dialog_estimate_minutes: "~{count} minutes",
    dialog_estimate_hours: "~{count} hours",
    dialog_estimate_unknown: "Depends on post count",
    dialog_sec_what: "What to download",
    dialog_sec_how: "How to save",
    dialog_sec_filters: "Content Filters",
    dialog_clean_filters: "Clear Filters",
    dialog_only_new: "Only download new posts since last time",
    dialog_only_new_date: "Only new posts since {date}",
    dialog_validation_not_found: "Profile not found",
    dialog_validation_searching: "Searching...",
    dialog_btn_confirm: "Confirm & Download",
    dialog_btn_back: "Back",
    dialog_status_preparing: "Preparing...",
    dialog_confirm_title: "Confirm Download",
    dialog_confirm_summary: "Configuration Summary",
    dialog_confirm_target: "Target:",
    dialog_confirm_media: "Media Type:",
    dialog_confirm_save: "Save Method:",
    dialog_confirm_filters: "Active Filters:",
    dialog_confirm_est: "Estimated Output:",
  };
  var wt = {
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
  var kt = {
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
  var xt = {
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
  var St = {
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
  var Pt = {
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
  var It = {
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
    dialog_filter_title: "Filtros de Conte\xFAdo (Opcional)",
    dialog_filter_hashtag: "Hashtag ou Palavra-chave",
    dialog_filter_likes: "M\xEDnimo de Curtidas",
    dialog_filter_views: "M\xEDnimo de Visualiza\xE7\xF5es",
    dialog_filter_comments: "M\xEDnimo de Coment\xE1rios",
    dialog_filter_saves: "M\xEDnimo de Salvamentos",
    dialog_estimate_prefix: "Tempo estimado de download:",
    dialog_estimate_seconds: "~{count} segundos",
    dialog_estimate_minutes: "~{count} minutos",
    dialog_estimate_hours: "~{count} horas",
    dialog_estimate_unknown: "Depende do total de posts",
    dialog_sec_what: "O que baixar",
    dialog_sec_how: "Como salvar",
    dialog_sec_filters: "Filtros de Conteúdo",
    dialog_clean_filters: "Limpar Filtros",
    dialog_only_new: "Baixar apenas novos posts desde o último download",
    dialog_only_new_date: "Só novos desde {date}",
    dialog_validation_not_found: "Perfil não encontrado",
    dialog_validation_searching: "Buscando...",
    dialog_btn_confirm: "Confirmar e Baixar",
    dialog_btn_back: "Voltar",
    dialog_status_preparing: "Preparando...",
    dialog_confirm_title: "Confirmar Download",
    dialog_confirm_summary: "Resumo da Configuração",
    dialog_confirm_target: "Perfil:",
    dialog_confirm_media: "Tipo de Mídia:",
    dialog_confirm_save: "Mét. Salvar:",
    dialog_confirm_filters: "Filtros Ativos:",
    dialog_confirm_est: "Saída Estimada:",
  };
  var Et = {
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
  var Tt = {
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
  var At = {
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
  var zt = {
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
  var Mt = {
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
  var Lt = {
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
  var Dt = {
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
  var Ct = {
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
  var ye = "ig_saver_locale";
  var ne = { "pt-BR": It },
    _a = "pt-BR",
    $t = It;
  function Rt() {
    return "pt-BR";
  }
  function ve(i) {
    ((_a = i), ($t = ne[i] || ae));
  }
  async function Bt() {
    try {
      let e = (await chrome.storage.local.get(ye))[ye];
      e && ne[e] ? ve(e) : ve(Rt());
    } catch {
      ve(Rt());
    }
    try {
      chrome.storage.onChanged.addListener((i, e) => {
        if (e === "local" && i[ye]) {
          let t = i[ye].newValue;
          t && ne[t] && ve(t);
        }
      });
    } catch {}
  }
  function _(i, e) {
    let t = $t[i] ?? ae[i] ?? i;
    if (e)
      for (let [n, a] of Object.entries(e))
        t = t.replaceAll(`{${n}}`, String(a));
    return t;
  }
  var G = class {
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
      let n = this.timestamps.get(e) ?? [],
        a = 0;
      return (
        n.length >= this.maxPerWindow &&
          (a = Math.min(...n) + this.windowMs + 6e3),
        (a = Math.max(a, this.earliestNextRequest)),
        Math.max(0, (a - t) / 1e3)
      );
    }
    async waitBeforeQuery(e) {
      let t = this.queryWaitTime(e);
      if (t > 0)
        if (this.onWait) {
          let n = Math.ceil(t);
          for (let a = n; a > 0; a--) {
            if (this.onWait(_("rate_wait", { seconds: a }), a) === !1) return;
            await Ht(1e3);
          }
        } else await Ht(t * 1e3);
      this.recordRequest(e);
    }
    handle429(e) {
      let t = performance.now();
      this.pruneOld(e, t);
      let n = this.timestamps.get(e) ?? [],
        a = 0;
      return (
        n.length > 0 && (a = Math.min(...n) + this.windowMs + 6e3 - t),
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
      let n = this.timestamps.get(e);
      if (!n) return;
      let a = t - 60 * 60 * 1e3,
        o = n.filter((r) => r > a);
      this.timestamps.set(e, o);
    }
  };
  function Ht(i) {
    return new Promise((e) => setTimeout(e, i));
  }
  var K = class i {
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
      let n = e.hd_profile_pic_versions;
      if (Array.isArray(n) && n.length > 0) {
        let a = n.reduce(
          (o, r) => ((r.width ?? 0) > (o.width ?? 0) ? r : o),
          n[0],
        );
        if (a?.url && typeof a.url == "string") return a.url;
      }
      return e.profile_pic_url_hd && typeof e.profile_pic_url_hd == "string"
        ? e.profile_pic_url_hd
        : e.profile_pic_url && typeof e.profile_pic_url == "string"
          ? e.profile_pic_url
          : null;
    }
    constructor(e, t, n, a = "timeline", o, r) {
      ((this.username = e),
        (this.filter = t),
        (this.dateFilter = n),
        (this.source = a),
        (this.rateController = o ?? new G()),
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
            let t = await P(e),
              n = t?.user ?? t,
              a = n?.hd_profile_pic_url_info;
            if (a?.url && typeof a.url == "string") {
              this.profilePicUrl = a.url;
              return;
            }
            let o = n?.hd_profile_pic_versions;
            if (Array.isArray(o) && o.length > 0) {
              let r = o.reduce(
                (s, l) => ((l.width ?? 0) > (s.width ?? 0) ? l : s),
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
        n = e === null;
      if (this.source === "reels") t = await this.fetchReelsApi(e);
      else {
        if (n) {
          let d = this.tryGetFirstPageFromPage();
          d && (t = d);
        }
        if (!t)
          try {
            t = await this.fetchUserFeedApi(e);
          } catch {}
        if (!t)
          try {
            t = await this.fetchGraphQL(e);
          } catch (d) {
            if (n) {
              let c = this.tryGetFirstPageFromPage();
              c && (t = c);
            }
            if (!t) throw d;
          }
      }
      let a = this.extractEdges(t),
        o = [],
        r = !1,
        s = this.source === "reels";
      for (let d of a) {
        let c = d.node,
          u = this.parsePostNode(c);
        if (!s && fe(u.timestamp, this.dateFilter)) {
          r = !0;
          break;
        }
        vt(u.timestamp, this.dateFilter) ||
          (yt(u.timestamp, this.dateFilter) &&
            (this.shouldSkipByType(u) || o.push(u)));
      }
      let l = this.extractPageInfo(t);
      if (!r && a.length > 0)
        if (s)
          a.every((c) => {
            let u = c.node?.taken_at_timestamp ?? c.node?.taken_at ?? 0;
            return u > 0 && fe(u, this.dateFilter);
          }) && (r = !0);
        else {
          let d = a[0]?.node,
            c = d?.taken_at_timestamp ?? d?.taken_at ?? 0;
          c > 0 && bt(c, this.dateFilter) && (r = !0);
        }
      return {
        posts: o,
        cursor: r ? null : l.endCursor,
        hasNextPage: r ? !1 : l.hasNextPage,
      };
    }
    tryGetFirstPageFromPage() {
      if (typeof document > "u") return null;
      try {
        let e = document.querySelectorAll('script[type="application/json"]');
        for (let t of e) {
          let n = t.textContent || "";
          if (n.includes("edge_owner_to_timeline_media"))
            try {
              let a = JSON.parse(n),
                o = this.findTimelineData(a, 0, 15);
              if (o) return o;
            } catch {
              continue;
            }
        }
      } catch {}
      return null;
    }
    findTimelineData(e, t, n) {
      if (!e || typeof e != "object" || t > n) return null;
      let a =
        e?.data?.user?.edge_owner_to_timeline_media ||
        e?.user?.edge_owner_to_timeline_media;
      if (a && Array.isArray(a.edges) && a.edges.length > 0 && a.page_info) {
        let o = a.page_info;
        if (typeof o.end_cursor == "string" || o.end_cursor === null)
          return { data: { user: { edge_owner_to_timeline_media: a } } };
      }
      for (let o of Object.keys(e)) {
        let r = this.findTimelineData(e[o], t + 1, n);
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
          let n = (await P(e))?.data?.user,
            a = n?.id;
          if (a) return ((this.profilePicUrl = i.extractHdProfilePicUrl(n)), a);
        }
      } catch {}
      if (!(typeof document > "u"))
        try {
          let e = document.querySelectorAll('script[type="application/json"]');
          for (let t of e) {
            let n = t.textContent || "",
              a = n.match(/profilePage_(\d+)/);
            if (a) return a[1];
            if (n.includes('"user"') && n.includes('"id"')) {
              let o = JSON.parse(n),
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
          n = t.match(/"profilePage_(\d+)"/);
        if (n) return n[1];
        let a = t.match(/"user":\s*\{[^}]*"id":\s*"(\d+)"/);
        if (a) return a[1];
      } catch {}
      throw new Error(z);
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
            (this.profilePicUrl = i.extractHdProfilePicUrl(e.user)),
          e.user.id
        );
      if (e.id && typeof e.id == "string" && e.username === this.username)
        return (
          this.profilePicUrl ||
            (this.profilePicUrl = i.extractHdProfilePicUrl(e)),
          e.id
        );
      for (let n of Object.keys(e)) {
        let a = this.findUserId(e[n], t + 1);
        if (a) return a;
      }
      return null;
    }
    async doSleep() {
      let e = G.randomDelay();
      await new Promise((t) => setTimeout(t, e * 1e3));
    }
    async fetchUserFeedApi(e) {
      (await this.doSleep(),
        await this.rateController.waitBeforeQuery("user_feed"));
      let t = new URLSearchParams({ count: "12" });
      e && t.set("max_id", e);
      let n = await fetch(
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
      if (n.status === 429)
        throw (this.rateController.handle429("user_feed"), new Error(z));
      if (!n.ok) throw new Error("NETWORK_ERROR");
      return P(n);
    }
    async fetchGraphQL(e) {
      let t = async (r, s) => {
          (await this.doSleep(), await this.rateController.waitBeforeQuery(r));
          let l = JSON.stringify(s),
            d = new URLSearchParams({
              variables: l,
              doc_id: r,
              server_timestamps: "true",
            }).toString(),
            c = {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              Referer: `https://www.instagram.com/${this.username}/`,
            },
            u = (await q()) ?? this.externalCsrfToken;
          return (
            u && (c["X-CSRFToken"] = u),
            fetch("https://www.instagram.com/graphql/query/", {
              method: "POST",
              credentials: "include",
              headers: c,
              body: d,
            })
          );
        },
        n = {
          data: {
            count: 12,
            include_relationship_info: !0,
            latest_besties_reel_media: !0,
            latest_reel_media: !0,
          },
          username: this.username,
          __relay_internal__pv__PolarisFeedShareMenurelayprovider: !1,
        };
      e != null &&
        ((n.after = e), (n.before = null), (n.first = 12), (n.last = null));
      let a = await t("7898261790222653", n);
      if (a.ok) {
        let r = await a.text(),
          s = r.trim();
        if (s.length > 0 && !s.startsWith("<"))
          try {
            let l = JSON.parse(r),
              d = l?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
            if (d && Array.isArray(d.edges) && d.edges.length > 0) return l;
          } catch {}
        else
          s.startsWith("<") &&
            this.rateController.handle429("7898261790222653");
      } else
        a.status === 429 && this.rateController.handle429("7898261790222653");
      let o = {
        id: this.userId,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: !1,
      };
      if (
        (e != null &&
          ((o.after = e), (o.before = null), (o.first = 12), (o.last = null)),
        (a = await t("7950326061742207", o)),
        a.status === 429)
      )
        throw (this.rateController.handle429("7950326061742207"), new Error(z));
      if (!a.ok) throw new Error("NETWORK_ERROR");
      return P(a);
    }
    async fetchReelsApi(e) {
      (await this.doSleep(),
        await this.rateController.waitBeforeQuery("reels"));
      let t = {
        target_user_id: this.userId,
        page_size: "12",
        include_feed_video: "1",
      };
      e && (t.max_id = e);
      let n = {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://www.instagram.com/${this.username}/reels/`,
        },
        a = (await q()) ?? this.externalCsrfToken;
      a && (n["X-CSRFToken"] = a);
      let o = await fetch("https://www.instagram.com/api/v1/clips/user/", {
        method: "POST",
        credentials: "include",
        headers: n,
        body: new URLSearchParams(t).toString(),
      });
      if (o.status === 429)
        throw (this.rateController.handle429("reels"), new Error(z));
      if (!o.ok) throw new Error("NETWORK_ERROR");
      return P(o);
    }
    extractEdges(e) {
      if (Array.isArray(e?.items) && e.items.length > 0 && e.items[0]?.media)
        return e.items.map((n) => ({ node: n.media }));
      if (Array.isArray(e?.items) && e.items.length > 0)
        return e.items.map((n) => ({ node: n }));
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
      let n = e?.data?.user?.edge_owner_to_timeline_media?.page_info;
      return {
        hasNextPage: n?.has_next_page ?? !1,
        endCursor: n?.end_cursor || null,
      };
    }
    normalizeNode(e) {
      if (e.shortcode != null || e.taken_at_timestamp != null) return e;
      let n =
          { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[
            e.media_type
          ] || "GraphImage",
        a = {
          shortcode: e.code ?? e.pk?.toString(),
          id: e.pk?.toString(),
          __typename: n,
          is_video: e.media_type === 2,
          taken_at_timestamp: e.taken_at ?? e.taken_at_timestamp ?? 0,
        },
        o = e.image_versions2?.candidates;
      o?.length && (a.display_url = o[0].url);
      let r = e.video_versions;
      return (
        Array.isArray(r) && r.length && (a.video_url = selectVideoUrl(r, e.video_url)),
        e.carousel_media?.length &&
          (a.edge_sidecar_to_children = {
            edges: e.carousel_media.map((s) => ({
              node: {
                display_url: s.image_versions2?.candidates?.[0]?.url,
                is_video: s.media_type === 2,
                video_url: selectVideoUrl(s.video_versions, s.video_url),
              },
            })),
          }),
        a
      );
    }
    parsePostNode(e) {
      let t = this.normalizeNode(e),
        n = t.shortcode || t.id,
        a = t.taken_at_timestamp || 0,
        o = t.__typename || "",
        r =
          o === "GraphSidecar" || t.edge_sidecar_to_children?.edges?.length > 0,
        s = [],
        l = 1;
      if (r && t.edge_sidecar_to_children?.edges) {
        let d = t.edge_sidecar_to_children.edges;
        l = d.length;
        let c = 0;
        for (let u of d) {
          let p = u.node,
            g = this.parseMediaNodes(p, n, c, a);
          (s.push(...g), (c += g.length));
        }
      } else s = this.parseMediaNodes(t, n, 0, a);
      return {
        postId: n,
        shortcode: String(t.shortcode || ""),
        timestamp: a,
        isCarousel: r,
        carouselCount: l,
        mediaItems: s,
        typename: o,
      };
    }
    parseMediaNodes(e, t, n, a) {
      let o = e.is_video === !0 || e.__typename === "GraphVideo",
        r = e.display_url || "",
        s = e.video_url || "";
      return [
        {
          postId: t,
          index: n,
          type: o ? "video" : "image",
          url: (o && s ? s : r || s) || "",
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
  var C = class {
    username;
    constructor(e) {
      this.username = e;
    }
    async resolveCarousel(e, t, n, a) {
      if (n.length === t && this.validateItems(n)) return n;
      let o = await this.fetchPostApi(e, a);
      if (o.length === t && this.validateItems(o)) return o;
      let r = await this.fetchPostHtml(e, a);
      if (r.length === t && this.validateItems(r)) return r;
      let s = await this.fetchPostGraphQL(e, a);
      if (s.length === t && this.validateItems(s)) return s;
      let l = Math.max(n.length, o.length, r.length, s.length);
      throw new Error(`CAROUSEL_INCOMPLETE: resolved ${l}/${t} for post ${e}`);
    }
    async resolvePost(e) {
      console.log(`[IG-Saver] resolvePost: postId=${e}`);
      let t = Math.floor(Date.now() / 1e3),
        n = await this.fetchMediaInfo(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchMediaInfo: ${n.length} items`,
          n,
        ),
        n.length > 0 && this.validateItems(n))
      )
        return n;
      let a = await this.fetchPostGraphQLDocId(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostGraphQLDocId: ${a.length} items`,
          a,
        ),
        a.length > 0 && this.validateItems(a))
      )
        return a;
      let o = await this.fetchPostApi(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostApi: ${o.length} items`,
          o,
        ),
        o.length > 0 && this.validateItems(o))
      )
        return o;
      let r = await this.fetchPostHtml(e, t);
      if (
        (console.log(
          `[IG-Saver] resolvePost fetchPostHtml: ${r.length} items`,
          r,
        ),
        r.length > 0 && this.validateItems(r))
      )
        return r;
      let s = await this.fetchPostGraphQL(e, t);
      return (
        console.log(
          `[IG-Saver] resolvePost fetchPostGraphQL: ${s.length} items`,
          s,
        ),
        s.length > 0 && this.validateItems(s)
          ? s
          : (console.log(
              `[IG-Saver] resolvePost: all strategies failed for ${e}`,
            ),
            [])
      );
    }
    async resolveReel(e) {
      let t = Math.floor(Date.now() / 1e3);
      console.log(`[IG-Saver] resolveReel: reelId=${e}`);
      let n = await this.fetchMediaInfo(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchMediaInfo: ${n.length} items`,
          n,
        ),
        n.length > 0 && this.validateItems(n))
      )
        return n;
      let a = await this.fetchPostGraphQLDocId(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchPostGraphQLDocId: ${a.length} items`,
          a,
        ),
        a.length > 0 && this.validateItems(a))
      )
        return a;
      let o = await this.fetchReelHtml(e, t);
      if (
        (console.log(
          `[IG-Saver] resolveReel fetchReelHtml: ${o.length} items`,
          o,
        ),
        o.length > 0 && this.validateItems(o))
      )
        return o;
      let r = await this.fetchPostGraphQL(e, t);
      return (
        console.log(
          `[IG-Saver] resolveReel fetchPostGraphQL: ${r.length} items`,
          r,
        ),
        r.length > 0 && this.validateItems(r) ? r : []
      );
    }
    async fetchReelApi(e, t) {
      try {
        let n = await fetch(
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
        if (!n.ok) return [];
        let a = await P(n);
        return this.parseApiResponse(a, e, t);
      } catch {
        return [];
      }
    }
    async fetchMediaInfo(e, t) {
      try {
        let n = shortcodeToMediaId(e);
        if (!n) return [];
        let a = await fetch(
          `https://www.instagram.com/api/v1/media/${n}/info/`,
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
        if (
          (console.log(
            `[IG-Saver] fetchMediaInfo: status=${a.status} for ${e} (${n})`,
          ),
          !a.ok)
        )
          return [];
        let o = (await P(a))?.items?.[0];
        return o ? this.parseV1Media(o, e, t) : [];
      } catch (n) {
        console.warn(`[IG-Saver] fetchMediaInfo failed for ${e}:`, n?.message);
        return [];
      }
    }
    async fetchPostGraphQLDocId(e, t) {
      try {
        let n = JSON.stringify({
            shortcode: e,
            fetch_tagged_user_count: null,
            hoisted_comment_id: null,
            hoisted_reply_id: null,
          }),
          a = new URLSearchParams({
            variables: n,
            doc_id: "8845758582119845",
            server_timestamps: "true",
          }).toString(),
          o = {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/p/${e}/`,
          },
          r = await q();
        r && (o["X-CSRFToken"] = r);
        let s = await fetch("https://www.instagram.com/graphql/query/", {
          method: "POST",
          credentials: "include",
          headers: o,
          body: a,
        });
        if (
          (console.log(
            `[IG-Saver] fetchPostGraphQLDocId: status=${s.status} for ${e}`,
          ),
          !s.ok)
        )
          return [];
        let l = await P(s);
        console.log(
          "[IG-Saver] fetchPostGraphQLDocId: response keys=",
          l ? Object.keys(l) : null,
        );
        let d = l?.data?.xdt_shortcode_media;
        if (
          (console.log(
            `[IG-Saver] fetchPostGraphQLDocId: media=${!!d}, media_type=${d?.media_type}, typename=${d?.__typename}, has_carousel=${!!d?.carousel_media}, has_sidecar=${!!d?.edge_sidecar_to_children}, has_video_url=${!!d?.video_url}, has_display_url=${!!d?.display_url}, has_image_versions2=${!!d?.image_versions2}`,
          ),
          !d)
        )
          return [];
        let c = d.taken_at ?? d.taken_at_timestamp ?? t,
          u = d.user?.username || d.owner?.username || this.username;
        if (d.carousel_media?.length > 0) return this.parseV1Media(d, e, c);
        if (d.edge_sidecar_to_children?.edges?.length > 0)
           return this.parseGraphQLMedia(d, e, c);
        let p = selectVideoUrl(d.video_versions, d.video_url);
        if (p)
          return [
            {
              postId: e,
              index: 0,
              type: "video",
              url: p,
              timestamp: c,
              creator: u,
            },
          ];
        let g = d.display_url ?? d.image_versions2?.candidates?.[0]?.url;
        return g
          ? [
              {
                postId: e,
                index: 0,
                type: "image",
                url: g,
                timestamp: c,
                creator: u,
              },
            ]
          : [];
      } catch {
        return [];
      }
    }
    async fetchReelHtml(e, t) {
      try {
        let n = await fetch(`https://www.instagram.com/reel/${e}/`, {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${this.username}/`,
          },
        });
        if (!n.ok) return [];
        let a = await n.text();
        return this.parseHtmlForMedia(a, e, t);
      } catch {
        return [];
      }
    }
    static detectExpectedCount(e) {
      let t = e?.edge_sidecar_to_children?.edges;
      if (t && Array.isArray(t)) return t.length;
      let n = e?.carousel_media;
      return n && Array.isArray(n)
        ? n.length
        : typeof e?.carousel_media_count == "number"
          ? e.carousel_media_count
          : 1;
    }
    async fetchPostApi(e, t) {
      try {
        let n = await fetch(`https://www.instagram.com/p/${e}/?__a=1&__d=dis`, {
          credentials: "include",
          headers: {
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${this.username}/`,
          },
        });
        if (
          (console.log(`[IG-Saver] fetchPostApi: status=${n.status} for ${e}`),
          !n.ok)
        )
          return [];
        let a = await P(n);
        return this.parseApiResponse(a, e, t);
      } catch (n) {
        return (
          console.error(`[IG-Saver] fetchPostApi error for ${e}:`, n.message),
          []
        );
      }
    }
    parseApiResponse(e, t, n) {
      try {
        let a = e?.items?.[0];
        if (a) return this.parseV1Media(a, t, n);
        let o = e?.graphql?.shortcode_media;
        return o ? this.parseGraphQLMedia(o, t, n) : [];
      } catch {
        return [];
      }
    }
    parseV1Media(e, t, n) {
      let a = e.user?.username || this.username,
        o = e.carousel_media;
      if (o && Array.isArray(o))
        return o.map((l, d) => {
          let c = l.media_type === 2,
            u = "";
          return (
            c
               ? (u = selectVideoUrl(l.video_versions, l.video_url) || "")
              : (u =
                  l.image_versions2?.candidates?.[0]?.url ||
                  l.display_url ||
                  ""),
            {
              postId: t,
              index: d,
              type: c ? "video" : "image",
              url: u,
              timestamp: n,
              creator: a,
            }
          );
        });
      let r = e.media_type === 2,
        s = r
          ? selectVideoUrl(e.video_versions, e.video_url) || ""
          : e.image_versions2?.candidates?.[0]?.url || e.display_url || "";
      return s
        ? [
            {
              postId: t,
              index: 0,
              type: r ? "video" : "image",
              url: s,
              timestamp: n,
              creator: a,
            },
          ]
        : [];
    }
    parseGraphQLMedia(e, t, n) {
      let a = e.owner?.username || this.username,
        o = e?.edge_sidecar_to_children?.edges;
      if (o && Array.isArray(o))
        return o.map((l, d) => {
          let c = l.node,
            u = c.is_video || c.__typename === "GraphVideo",
            p = (u && c.video_url) || c.display_url;
          return {
            postId: t,
            index: d,
            type: u ? "video" : "image",
            url: p || "",
            timestamp: n,
            creator: a,
          };
        });
      let r = e.is_video || e.__typename === "GraphVideo",
        s = r ? e.video_url || e.display_url || "" : e.display_url || "";
      return s
        ? [
            {
              postId: t,
              index: 0,
              type: r ? "video" : "image",
              url: s,
              timestamp: n,
              creator: a,
            },
          ]
        : [];
    }
    async fetchPostHtml(e, t) {
      try {
        let n = await fetch(`https://www.instagram.com/p/${e}/`, {
          credentials: "include",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/p/${e}/`,
          },
        });
        if (
          (console.log(`[IG-Saver] fetchPostHtml: status=${n.status} for ${e}`),
          !n.ok)
        )
          return [];
        let a = await n.text();
        return (
          console.log(
            `[IG-Saver] fetchPostHtml: html length=${a.length} for ${e}`,
          ),
          this.parseHtmlForMedia(a, e, t)
        );
      } catch (n) {
        return (
          console.error(`[IG-Saver] fetchPostHtml error for ${e}:`, n.message),
          []
        );
      }
    }
    parseHtmlForMedia(e, t, n) {
      let a = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
        o;
      for (; (o = a.exec(e)) !== null; )
        try {
          let p = JSON.parse(o[1]),
            g = this.deepSearchForMedia(p, t, n);
          if (g.length > 0) return g;
        } catch {
          continue;
        }
      let r = e.match(/window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (r)
        try {
          let p = JSON.parse(r[1]),
            g = this.deepSearchForMedia(p, t, n);
          if (g.length > 0) return g;
        } catch {}
      let s = e.match(
        /(?:require\([^)]+\)\.(?:handle|handleWithCustomMessage)\([^,]*,\s*)(\{[\s\S]{500,}?"(?:shortcode_media|display_url|edge_sidecar_to_children|video_url)"[\s\S]*?\})\s*\)/,
      );
      if (s)
        try {
          let p = JSON.parse(s[1]),
            g = this.deepSearchForMedia(p, t, n);
          if (g.length > 0) return g;
        } catch {}
      let l = /<script[^>]*>([\s\S]*?)<\/script>/g,
        d;
      for (; (d = l.exec(e)) !== null; ) {
        let p = d[1];
        if (p.includes("video_url") && p.length > 500)
          try {
            let g = JSON.parse(p),
              f = this.deepSearchForMedia(g, t, n);
            if (f.length > 0) return f;
          } catch {}
      }
      for (let p of ["playback_video_url", "video_url"]) {
        let g = new RegExp(
            `"${p.replace(/_/g, "_")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
          ),
          f = e.match(g);
        if (f) {
          let h = this.unescapeJsonString(f[1]);
          if (h && (h.startsWith("https://") || h.startsWith("http://")))
            return [
              {
                postId: t,
                index: 0,
                type: "video",
                url: h,
                timestamp: n,
                creator: this.username,
              },
            ];
        }
      }
      let c = e.match(
        /"display_url"\s*:\s*"([^"]+)"[^}]*"(?:video_url)"\s*:\s*"([^"]*)"/,
      );
      if (c) {
        let p = c[2] || c[1];
        if (p && (p.startsWith("https://") || p.startsWith("http://")))
          return [
            {
              postId: t,
              index: 0,
              type: c[2] ? "video" : "image",
              url: p.replace(/\\u0026/g, "&"),
              timestamp: n,
              creator: this.username,
            },
          ];
      }
      let u = e.match(/"display_url"\s*:\s*"(https?:\/\/[^"]+)"/);
      if (u) {
        let p = u[1].replace(/\\u0026/g, "&");
        if (p)
          return [
            {
              postId: t,
              index: 0,
              type: "image",
              url: p,
              timestamp: n,
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
    deepSearchForMedia(e, t, n, a = 0) {
      if (!e || typeof e != "object" || a > 15) return [];
      let o = selectVideoUrl(e.video_versions, e.video_url ?? e.videoUrl ?? e.playback_video_url);
      if (typeof o == "string" && o.startsWith("http"))
        return [
          {
            postId: t,
            index: 0,
            type: "video",
            url: o,
            timestamp: n,
            creator: this.username,
          },
        ];
      if (e.edge_sidecar_to_children?.edges?.length > 0)
        return this.parseGraphQLMedia(e, t, n);
      if (e.carousel_media?.length > 0) return this.parseV1Media(e, t, n);
      if (Array.isArray(e)) {
        for (let r of e) {
          let s = this.deepSearchForMedia(r, t, n, a + 1);
          if (s.length > 0) return s;
        }
        return [];
      }
      for (let r of Object.keys(e)) {
        let s = this.deepSearchForMedia(e[r], t, n, a + 1);
        if (s.length > 0) return s;
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
        let l = (await P(r))?.data?.shortcode_media;
        return l
          ? this.parseGraphQLMedia(l, e, t)
          : (console.log(
              `[IG-Saver] fetchPostGraphQL: no shortcode_media in response for ${e}`,
            ),
            []);
      } catch (n) {
        return (
          console.error(
            `[IG-Saver] fetchPostGraphQL error for ${e}:`,
            n.message,
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
  var j = class {
    username;
    filter;
    rateController;
    constructor(e, t, n) {
      ((this.username = e),
        (this.filter = t),
        (this.rateController = n ?? new G()));
    }
    async doSleep() {
      let e = G.randomDelay();
      await new Promise((t) => setTimeout(t, e * 1e3));
    }
    async buildHeaders() {
      let e = {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `https://www.instagram.com/${this.username}/saved/`,
        },
        t = await q();
      return (t && (e["X-CSRFToken"] = t), e);
    }
    async doFetch(e) {
      let t = await this.buildHeaders();
      console.log(`[Dog Saver][SavedParser] doFetch: ${e}`);
      let n = await fetch(e, { credentials: "include", headers: t }),
        a = await n.text();
      return (
        console.log(
          `[Dog Saver][SavedParser] doFetch result: ok=${n.ok}, status=${n.status}, bodyLen=${a?.length ?? 0}`,
        ),
        { ok: n.ok, status: n.status, body: a }
      );
    }
    parseBody(e) {
      let t = e.body.trim();
      if (!t || t.startsWith("<") || t.startsWith("<!"))
        throw (
          console.error(
            `[Dog Saver][SavedParser] parseBody got HTML/empty response: "${t.slice(0, 200)}"`,
          ),
          new Error(z)
        );
      try {
        let n = t.replace(/([:,\[])\s*(\d{16,})\s*(?=[,\]\}])/g, '$1"$2"');
        return JSON.parse(n);
      } catch (n) {
        throw (
          console.error(
            "[Dog Saver][SavedParser] parseBody JSON.parse failed:",
            n.message,
            "body preview:",
            t.slice(0, 300),
          ),
          n
        );
      }
    }
    async fetchCollections() {
      console.log("[Dog Saver][SavedParser] fetchCollections() called");
      let e = [],
        t = null,
        n = 0;
      for (;;) {
        (n++,
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
            new Error(z)
          );
        if (!r.ok)
          throw (
            console.error(
              `[Dog Saver][SavedParser] collections/list failed: status=${r.status}`,
            ),
            new Error("NETWORK_ERROR")
          );
        let s = this.parseBody(r);
        console.log(
          `[Dog Saver][SavedParser] fetchCollections page ${n}: items=${s?.items?.length ?? 0}, more=${s?.more_available}`,
        );
        let l = s?.items ?? [];
        for (let d of l) {
          if (d.collection_type === "PRODUCT_AUTO_COLLECTION") continue;
          let u =
            d.cover_media_list?.[0]?.image_versions2?.candidates?.[0]?.url ??
            null;
          e.push({
            collectionId: String(d.collection_id),
            collectionName:
              d.collection_name ?? `Collection ${d.collection_id}`,
            coverUrl: u,
            mediaCount: d.collection_media_count ?? 0,
            collectionType: d.collection_type,
          });
        }
        if (!s.more_available || !s.next_max_id) break;
        t = String(s.next_max_id);
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
      let n = new URLSearchParams();
      e && n.set("max_id", e);
      let a = `https://www.instagram.com/api/v1/feed/saved/posts/?${n}`,
        o = await this.doFetch(a);
      if (o.status === 429)
        throw (this.rateController.handle429("saved_feed"), new Error(z));
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
      let s = this.parseItemsResponse(r, t);
      return (
        console.log(
          `[Dog Saver][SavedParser] fetchSavedPage result: posts=${s.posts.length}, hasNext=${s.hasNextPage}`,
        ),
        s
      );
    }
    async fetchCollectionPage(e, t) {
      return this.fetchSavedPage(t, e);
    }
    async fetchAllSavedPage(e) {
      return this.fetchSavedPage(e);
    }
    parseItemsResponse(e, t) {
      let n = e?.items ?? [],
        a = [];
      for (let o of n) {
        let r = o.media ?? o;
        if (
          !r ||
          (t && !(r.saved_collection_ids ?? []).map(String).includes(t))
        )
          continue;
        let s = this.parseMediaNode(r);
        s &&
          ((s.savedCollectionIds = (r.saved_collection_ids ?? []).map(String)),
          !this.shouldSkipByType(s) && a.push(s));
      }
      return (
        console.log(
          `[Dog Saver][SavedParser] parseItemsResponse: ${a.length}/${n.length} items${t ? ` (filtered for ${t})` : ""}`,
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
      let n = t.shortcode || t.id;
      if (!n) return null;
      let a = t.taken_at_timestamp || 0,
        o = t.__typename || "",
        r =
          o === "GraphSidecar" || t.edge_sidecar_to_children?.edges?.length > 0,
        s = e.user?.username ?? this.username,
        l = [],
        d = 1;
      if (r && t.edge_sidecar_to_children?.edges) {
        let c = t.edge_sidecar_to_children.edges;
        d = c.length;
        let u = 0;
        for (let p of c) {
          let g = p.node,
            f = this.parseMediaItems(g, n, u, a, s);
          (l.push(...f), (u += f.length));
        }
      } else l = this.parseMediaItems(t, n, 0, a, s);
      return {
        postId: n,
        shortcode: String(t.shortcode || ""),
        timestamp: a,
        isCarousel: r,
        carouselCount: d,
        mediaItems: l,
        typename: o,
      };
    }
    normalizeNode(e) {
      if (e.shortcode != null || e.taken_at_timestamp != null) return e;
      let n =
          { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[
            e.media_type
          ] || "GraphImage",
        a = {
          shortcode: e.code ?? e.pk?.toString(),
          id: e.pk?.toString(),
          __typename: n,
          is_video: e.media_type === 2,
          taken_at_timestamp: e.taken_at ?? e.taken_at_timestamp ?? 0,
        },
        o = e.image_versions2?.candidates;
      o?.length && (a.display_url = o[0].url);
      let r = e.video_versions;
      return (
        Array.isArray(r) && r.length && (a.video_url = selectVideoUrl(r, e.video_url)),
        e.carousel_media?.length &&
          (a.edge_sidecar_to_children = {
            edges: e.carousel_media.map((s) => ({
              node: {
                display_url: s.image_versions2?.candidates?.[0]?.url,
                is_video: s.media_type === 2,
                video_url: selectVideoUrl(s.video_versions, s.video_url),
              },
            })),
          }),
        a
      );
    }
    parseMediaItems(e, t, n, a, o) {
      let r = e.is_video === !0 || e.__typename === "GraphVideo",
        s = e.display_url || "",
        l = e.video_url || "";
      return [
        {
          postId: t,
          index: n,
          type: r ? "video" : "image",
          url: (r && l ? l : s || l) || "",
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
  var ca = "936619743392459";
  function oe(i) {
    let e = {
        "X-IG-App-ID": ca,
        "X-Requested-With": "XMLHttpRequest",
        Referer: i,
      },
      t = document.cookie.match(/csrftoken=([^;]+)/);
    return (t && (e["X-CSRFToken"] = t[1].trim()), e);
  }
  var N = class {
    username;
    constructor(e) {
      this.username = e;
    }
    async getUserId(e) {
      try {
        let t = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${e}`,
          {
            credentials: "include",
            headers: oe(`https://www.instagram.com/${e}/`),
          },
        );
        if (!t.ok) return null;
        let n = await P(t);
        return n?.data?.user?.id ?? n?.data?.user?.pk ?? null;
      } catch {
        return null;
      }
    }
    async fetchUserStories(e) {
      try {
        let t = await fetch(
          `https://www.instagram.com/api/v1/feed/user/${e}/story/`,
          {
            credentials: "include",
            headers: oe(`https://www.instagram.com/${this.username}/`),
          },
        );
        if (!t.ok) return [];
        let a = (await P(t))?.reel?.items;
        return Array.isArray(a)
          ? a
              .map((o, r) => this.parseStoryItem(o, this.username, r))
              .filter((o) => o.url)
          : [];
      } catch {
        return [];
      }
    }
    async fetchHighlightsTray(e) {
      try {
        let t = await fetch(
          `https://www.instagram.com/api/v1/highlights/${e}/highlights_tray/`,
          {
            credentials: "include",
            headers: oe(`https://www.instagram.com/${this.username}/`),
          },
        );
        if (!t.ok) return [];
        let a = (await P(t))?.tray;
        return Array.isArray(a)
          ? a
              .map((o) => ({
                id: typeof o?.id == "string" ? o.id : "",
                title: typeof o?.title == "string" ? o.title.trim() : "",
              }))
              .filter((o) => o.id.length > 0)
          : [];
      } catch {
        return [];
      }
    }
    async fetchHighlightItemsBatch(e) {
      let t = new Map();
      if (e.length === 0) return t;
      let n = e.map((o) => (o.startsWith("highlight:") ? o : `highlight:${o}`)),
        a = n.map((o) => `reel_ids=${encodeURIComponent(o)}`).join("&");
      try {
        let o = await fetch(
          `https://www.instagram.com/api/v1/feed/reels_media/?${a}`,
          {
            credentials: "include",
            headers: oe(`https://www.instagram.com/${this.username}/`),
          },
        );
        if (!o.ok) return t;
        let r = await P(o),
          s = (l, d) => {
            if (!l) return;
            let c = l.user?.username ?? this.username,
              u = typeof l.title == "string" ? l.title.trim() : "",
              g = (Array.isArray(l.items) ? l.items : [])
                .map((f, h) => this.parseStoryItem(f, c, h, "highlight"))
                .filter((f) => f.url);
            t.set(d, { title: u, username: c, items: g });
          };
        if (r?.reels && typeof r.reels == "object")
          for (let l of n) r.reels[l] && s(r.reels[l], l);
        else if (Array.isArray(r?.reels_media))
          for (let l of r.reels_media) {
            let d =
              typeof l?.id == "string"
                ? l.id.startsWith("highlight:")
                  ? l.id
                  : `highlight:${l.id}`
                : "";
            d && s(l, d);
          }
        return t;
      } catch {
        return t;
      }
    }
    async fetchHighlightItems(e) {
      try {
        let t = e.startsWith("highlight:") ? e : `highlight:${e}`,
          n = await fetch(
            `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${t}`,
            {
              credentials: "include",
              headers: oe(`https://www.instagram.com/${this.username}/`),
            },
          );
        if (!n.ok) return { title: "", username: this.username, items: [] };
        let a = await P(n),
          o = null;
        if (
          (a?.reels
            ? (o = a.reels[t] ?? Object.values(a.reels)[0])
            : a?.reels_media?.[0] && (o = a.reels_media[0]),
          !o)
        )
          return { title: "", username: this.username, items: [] };
        let r = o.user?.username ?? this.username,
          s = typeof o.title == "string" ? o.title.trim() : "",
          d = (Array.isArray(o.items) ? o.items : [])
            .map((c, u) => this.parseStoryItem(c, r, u, "highlight"))
            .filter((c) => c.url);
        return { title: s, username: r, items: d };
      } catch {
        return { title: "", username: this.username, items: [] };
      }
    }
    parseStoryItem(e, t, n, a = "story") {
      let o = e.media_type === 2 ? "video" : "image",
        r = "";
      if (o === "video") {
        let l = e.video_versions;
        r = selectVideoUrl(l, e.video_url);
      }
      r || (r = e.image_versions2?.candidates?.[0]?.url ?? "");
      let s = e.pk ?? e.id ?? `${Date.now()}_${n}`;
      return {
        postId: `${a}_${s}`,
        index: n,
        type: o,
        url: r,
        timestamp: e.taken_at ?? Math.floor(Date.now() / 1e3),
        creator: t,
      };
    }
  };
  function be(i) {
    return (
      i
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\.+$/, "")
        .trim() || "unknown"
    );
  }
  function Gt(i) {
    if (!(i instanceof Error)) return !1;
    let e = i.message;
    return (
      e.includes("Extension context invalidated") ||
      e.includes("context invalidated")
    );
  }
  var we = "ig_saver_tasks",
    He = "ig_saver_queue_",
    Ge = "ig_saver_settings",
    Ne = "ig_saver_zip_acc_",
    Fe = "ig_saver_zip_part_",
    ie = "ig_saver_review",
    X = {
      async getTasks() {
        return (await chrome.storage.local.get(we))[we] || {};
      },
      async getTask(i) {
        return (await this.getTasks())[i] || null;
      },
      async saveTask(i) {
        let e = await this.getTasks();
        ((e[i.taskId] = { ...i, updatedAt: Date.now() }),
          await chrome.storage.local.set({ [we]: e }));
      },
      async deleteTask(i) {
        let e = await this.getTasks();
        (delete e[i], await chrome.storage.local.set({ [we]: e }));
      },
      async getQueue(i) {
        let e = He + i;
        return (await chrome.storage.local.get(e))[e] || [];
      },
      async saveQueue(i, e) {
        let t = He + i;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteQueue(i) {
        let e = He + i;
        await chrome.storage.local.remove(e);
      },
      async getZipAccumulator(i) {
        let e = Ne + i;
        return (await chrome.storage.local.get(e))[e] || [];
      },
      async saveZipAccumulator(i, e) {
        let t = Ne + i;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteZipAccumulator(i) {
        let e = Ne + i;
        await chrome.storage.local.remove(e);
      },
      async getZipPartCounter(i) {
        let e = Fe + i;
        return (await chrome.storage.local.get(e))[e] || 0;
      },
      async saveZipPartCounter(i, e) {
        let t = Fe + i;
        await chrome.storage.local.set({ [t]: e });
      },
      async deleteZipPartCounter(i) {
        let e = Fe + i;
        await chrome.storage.local.remove(e);
      },
      async getSettings() {
        return (await chrome.storage.local.get(Ge))[Ge] || { ...ft };
      },
      async saveSettings(i) {
        await chrome.storage.local.set({ [Ge]: i });
      },
      async getReviewState() {
        return (
          (await chrome.storage.local.get(ie))[ie] || {
            count: 0,
            dismissed: !1,
            nextPromptAt: 5,
          }
        );
      },
      async incrementReviewCount() {
        let i = await this.getReviewState(),
          e = { ...i, count: i.count + 1 };
        return (await chrome.storage.local.set({ [ie]: e }), e);
      },
      async postponeReview() {
        let i = await this.getReviewState(),
          e = i.nextPromptAt <= 5 ? 10 : i.nextPromptAt <= 15 ? 30 : 50;
        await chrome.storage.local.set({
          [ie]: { ...i, nextPromptAt: i.count + e },
        });
      },
      async dismissReview() {
        let i = await this.getReviewState();
        await chrome.storage.local.set({ [ie]: { ...i, dismissed: !0 } });
      },
    };
  var ua = {
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
    Oe = ua,
    ke = Oe.organizationId,
    qe = Oe.checkoutUrls,
    Bo = Oe.customerPortalUrl,
    Nt = Date.parse("2026-06-01T00:00:00Z");
  function Ze(i = Date.now()) {
    return i < Nt;
  }
  function Ft(i = Date.now()) {
    let e = Nt - i;
    return e <= 0 ? 0 : Math.ceil(e / (24 * 60 * 60 * 1e3));
  }
  var ga = !1
    ? "https://sandbox-api.polar.sh/v1/customer-portal/license-keys"
    : "https://api.polar.sh/v1/customer-portal/license-keys";
  function Ot(i) {
    if (typeof i != "string") return null;
    let e = Date.parse(i);
    return Number.isNaN(e) ? null : e;
  }
  async function qt(i, e) {
    let t = await fetch(`${ga}/${i}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(e),
      }),
      n = {};
    try {
      n = await t.json();
    } catch {}
    return { status: t.status, data: n };
  }
  async function Zt(i, e, t) {
    let n;
    try {
      n = await qt("activate", { key: i, organization_id: e, label: t });
    } catch (r) {
      throw new Error(`Network error during license activation: ${r.message}`);
    }
    if (n.status === 200 || n.status === 201) {
      let r = n.data ?? {};
      return {
        activated: !0,
        activationId: typeof r.id == "string" ? r.id : null,
        expiresAt: Ot(r.license_key?.expires_at),
        tier: typeof r.meta?.tier == "string" ? r.meta.tier : null,
        error: null,
      };
    }
    let a = "unknown",
      o = typeof n.data?.error == "string" ? n.data.error : "";
    return (
      n.status === 403 && o === "ActivationsLimitReached"
        ? (a = "limit_reached")
        : (n.status === 404 || n.status === 422) && (a = "invalid_key"),
      {
        activated: !1,
        activationId: null,
        expiresAt: null,
        tier: null,
        error: a,
      }
    );
  }
  async function Ue(i, e, t) {
    let n;
    try {
      n = await qt("validate", {
        key: i,
        organization_id: e,
        activation_id: t,
      });
    } catch (r) {
      throw new Error(`Network error during license validation: ${r.message}`);
    }
    if (n.status !== 200)
      return {
        valid: !1,
        expiresAt: null,
        status: null,
        error: `http_${n.status}`,
      };
    let a = n.data ?? {},
      o = typeof a.status == "string" ? a.status : null;
    return {
      valid: o === "granted",
      expiresAt: Ot(a.license_key?.expires_at),
      status: o,
      error: o === "granted" ? null : o,
    };
  }
  function ma(i) {
    return i.replace(/Chrome\/(\d+)\.\d+\.\d+\.\d+/g, "Chrome/$1");
  }
  function ha() {
    let i = ma((navigator.userAgent ?? "").slice(0, 200)),
      e = navigator.platform ?? "",
      t = navigator.language ?? "",
      n = (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
        } catch {
          return "";
        }
      })(),
      a =
        typeof window < "u" && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : "";
    return [i, e, t, n, a].join("|");
  }
  async function Ut() {
    let i = ha(),
      e = new TextEncoder().encode(i),
      t = await crypto.subtle.digest("SHA-256", e);
    return Array.from(new Uint8Array(t))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  var b = {
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
    },
    fa = "igsaver_license_";
  function Wt(i) {
    return `${fa}${i.replace(/-/g, "_")}`;
  }
  var ya = 24 * 60 * 60 * 1e3,
    va = 30 * 24 * 60 * 60 * 1e3,
    Y = 30;
  var Vt = 3;
  async function ba() {
    let i = await chrome.storage.local.get([
      b.legacyUser,
      b.license,
      b.activationId,
      b.statusCache,
      b.lastValidatedAt,
    ]);
    return {
      legacy: i[b.legacyUser] === !0,
      license: typeof i[b.license] == "string" ? i[b.license] : null,
      activationId:
        typeof i[b.activationId] == "string" ? i[b.activationId] : null,
      cache: i[b.statusCache] ?? null,
      lastValidatedAt:
        typeof i[b.lastValidatedAt] == "number" ? i[b.lastValidatedAt] : null,
    };
  }
  async function xe(i = {}, e) {
    return { kind: "legacy" };
  }
  function Se(i) {
    return !0;
  }
  async function wa(i, e) {
    let t = Wt(e),
      a = (await chrome.storage.sync.get(t))[t];
    if (!a || a.licenseKey !== i || !a.activationId) return null;
    try {
      let o = await Ue(i, ke, a.activationId);
      return o.valid
        ? (await chrome.storage.local.set({
            [b.license]: i,
            [b.activationId]: a.activationId,
            [b.deviceFp]: e,
            [b.statusCache]: { kind: "pro", expiresAt: o.expiresAt },
            [b.lastValidatedAt]: Date.now(),
          }),
          { ok: !0 })
        : null;
    } catch {
      return null;
    }
  }
  async function Kt(i) {
    let e = i.trim();
    if (!e)
      return {
        ok: !1,
        reason: "invalid_key",
        error: "License key is required",
      };
    let t = await Ut(),
      n = await wa(e, t);
    if (n) return n;
    let a;
    try {
      a = await Zt(e, ke, t);
    } catch (o) {
      return { ok: !1, reason: "network", error: o.message };
    }
    return !a.activated || !a.activationId
      ? {
          ok: !1,
          reason:
            a.error === "limit_reached"
              ? "limit_reached"
              : a.error === "invalid_key"
                ? "invalid_key"
                : "unknown",
          error: a.error ?? "License activation failed",
        }
      : (await chrome.storage.local.set({
          [b.license]: e,
          [b.activationId]: a.activationId,
          [b.deviceFp]: t,
          [b.statusCache]: { kind: "pro", expiresAt: a.expiresAt },
          [b.lastValidatedAt]: Date.now(),
        }),
        await chrome.storage.sync.set({
          [Wt(t)]: { licenseKey: e, activationId: a.activationId },
        }),
        { ok: !0 });
  }
  async function jt() {
    let e = (await chrome.storage.local.get(b.bulkAllTrialUsed))[
      b.bulkAllTrialUsed
    ];
    return typeof e == "number" && e >= 0 ? e : 0;
  }
  function ka(i) {
    switch (i) {
      case "topK":
        return _("gate_topk_limit", { limit: "30" });
      case "days":
        return _("gate_days_limit", { limit: "30" });
      case "customRange":
        return _("gate_custom_range");
      case "extras":
        return _("gate_extras");
      case "savedMulti":
        return _("gate_saved_multi");
      case "allTrialExhausted":
        return _("gate_all_trial_exhausted", { limit: "3" });
      case "generic":
        return _("upgrade_subtitle");
    }
  }
  function Pe(i) {
    let {
        id: e,
        title: t,
        price: n,
        subtitle: a,
        badge: o,
        oldPrice: r,
        savings: s,
        highlight: l,
        theme: d,
      } = i,
      c = l ? "#833AB4" : d.border,
      u = l
        ? "linear-gradient(135deg, rgba(131,58,180,0.12), rgba(253,29,29,0.05))"
        : d.bgSecondary,
      p = o ? "22px" : "16px",
      g = o
        ? `<span style="
        position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #FD1D1D, #F77737);
        color: #fff; font-size: 11px; font-weight: 700;
        padding: 4px 10px; border-radius: 12px; letter-spacing: 0.3px;
        box-shadow: 0 2px 8px rgba(253,29,29,0.45);
        white-space: nowrap;
      ">${o}</span>`
        : "",
      f = r
        ? `<div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
         <span style="font-size: 12px; color: ${d.textSecondary};
           text-decoration: line-through; text-decoration-color: ${d.textSecondary};
         ">${r}</span>
         <span style="font-size: 20px; font-weight: 800; color: ${d.text}; line-height: 1.1;">${n}</span>
       </div>`
        : `<span style="font-size: 17px; font-weight: 700; line-height: 1.2;">${n}</span>`,
      h = s
        ? `<span style="font-size: 11px; color: #C13515; font-weight: 700; margin-top: 4px;">${s}</span>`
        : "",
      y = a
        ? `<span style="font-size: 10px; color: ${d.textSecondary}; margin-top: 4px;">${a}</span>`
        : "";
    return `
    <button type="button" data-plan="${e}" class="ig-saver-upgrade-plan" style="
      flex: 1; padding: ${p} 10px 14px;
      border-radius: 12px; cursor: pointer;
      border: 2px solid ${c}; background: ${u}; color: ${d.text};
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      font-family: inherit; text-align: center; position: relative;
      transition: transform 0.1s, border-color 0.15s;
    ">
      ${g}
      <span style="font-size: 12px; color: ${d.textSecondary}; font-weight: 500; margin-bottom: 2px;">${t}</span>
      ${f}
      ${h}
      ${y}
    </button>
  `;
  }
  function xa(i) {
    let e = "9px 10px",
      t = `padding: ${e}; font-size: 11px; font-weight: 700; color: ${i.textSecondary}; text-align: left; letter-spacing: 0.4px; text-transform: uppercase; border-bottom: 1px solid ${i.border};`,
      n = t + " text-align: center;",
      a = `padding: ${e}; font-size: 11px; font-weight: 700; color: #B084DD; text-align: center; letter-spacing: 0.4px; text-transform: uppercase; border-bottom: 1px solid ${i.border}; background: linear-gradient(180deg, rgba(131,58,180,0.15), rgba(131,58,180,0.06));`,
      o = `padding: ${e}; font-size: 13px; color: ${i.text}; border-bottom: 1px solid ${i.border}; line-height: 1.4;`,
      r = `padding: 9px 6px; font-size: 11.5px; color: ${i.textSecondary}; text-align: center; border-bottom: 1px solid ${i.border}; line-height: 1.4;`,
      s = `padding: 9px 6px; font-size: 11.5px; color: ${i.text}; font-weight: 600; text-align: center; border-bottom: 1px solid ${i.border}; background: rgba(131,58,180,0.06); line-height: 1.4;`,
      l =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#833AB4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>',
      d = `<span style="color: ${i.textSecondary}; opacity: 0.5;">\u2014</span>`,
      c = [
        [_("compare_row_single"), l, l],
        [_("compare_row_highlight"), l, l],
        [_("compare_row_single_collection"), l, l],
        [
          _("compare_row_profile_bulk"),
          _("compare_row_profile_bulk_free"),
          _("compare_row_profile_bulk_pro"),
        ],
        [_("compare_row_extras"), d, l],
        [_("compare_row_saved"), d, l],
        [_("compare_row_dates"), d, _("compare_row_dates_pro")],
      ],
      u = o.replace(/border-bottom: [^;]+;/, "border-bottom: none;"),
      p = r.replace(/border-bottom: [^;]+;/, "border-bottom: none;"),
      g = s.replace(/border-bottom: [^;]+;/, "border-bottom: none;"),
      f = c
        .map(([h, y, S], E) => {
          let I = E === c.length - 1;
          return `<tr><td style="${I ? u : o}">${h}</td><td style="${I ? p : r}">${y}</td><td style="${I ? g : s}">${S}</td></tr>`;
        })
        .join("");
    return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid ${i.border}; border-radius: 10px; overflow: hidden; table-layout: fixed;">
      <colgroup>
        <col style="width: 56%;">
        <col style="width: 22%;">
        <col style="width: 22%;">
      </colgroup>
      <thead>
        <tr>
          <th style="${t}">${_("compare_header_feature")}</th>
          <th style="${n}">${_("compare_header_free")}</th>
          <th style="${a}">${_("compare_header_pro")}</th>
        </tr>
      </thead>
      <tbody>${f}</tbody>
    </table>
  `;
  }
  function Sa(i) {
    let e = (t) =>
      `<span style="font-size: 11px; color: ${i.textSecondary};"><span style="color: #833AB4; font-weight: 700;">\u2713</span> ${t}</span>`;
    return `
    <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; margin-bottom: 18px;">
      ${e(_("trust_no_personal_data"))}
      ${e(_("trust_three_devices"))}
    </div>
  `;
  }
  function Z(i) {
    injectDialogStyles();
    let e = document.getElementById("ig-saver-upgrade-dialog");
    e && e.remove();
    let t = i.getTheme(),
      n = document.createElement("div");
    ((n.id = "ig-saver-upgrade-dialog"),
      (n.style.cssText = `
    position: fixed; inset: 0; background: ${t.overlay}; z-index: 10002;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease;
  `),
      requestAnimationFrame(() => {
        n.style.opacity = "1";
      }));
    let a = document.createElement("div");
    ((a.style.cssText = `
    background: ${t.bg}; border-radius: 16px; padding: 28px;
    min-width: 380px; max-width: 460px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transform: scale(0.95) translateY(8px); opacity: 0;
    transition: transform 0.25s ease, opacity 0.25s ease;
  `),
      requestAnimationFrame(() => {
        ((a.style.transform = "scale(1) translateY(0)"),
          (a.style.opacity = "1"));
      }));
    function o() {
      ((a.style.transform = "scale(0.95) translateY(8px)"),
        (a.style.opacity = "0"),
        (n.style.opacity = "0"),
        setTimeout(() => n.remove(), 200));
    }
    function r() {
      if (Ze()) {
        let d = Ft();
        return Pe({
          id: "lifetime",
          title: _("upgrade_lifetime_card_label"),
          price: _("upgrade_price_lifetime_early"),
          oldPrice: _("upgrade_price_lifetime"),
          badge: _("upgrade_lifetime_countdown_badge", { days: d }),
          savings: _("upgrade_lifetime_savings"),
          highlight: !0,
          theme: t,
        });
      }
      return Pe({
        id: "lifetime",
        title: _("upgrade_plan_lifetime"),
        price: _("upgrade_price_lifetime"),
        subtitle: _("upgrade_lifetime_subtitle_regular"),
        highlight: !0,
        theme: t,
      });
    }
    function s() {
      a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="
          background: linear-gradient(135deg, #833AB4, #FD1D1D); color: #fff;
          font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 5px;
          letter-spacing: 0.5px;
        ">PRO</span>
        <span style="color: ${t.textSecondary}; font-size: 12px; font-weight: 500;">Dog Saver Pro</span>
      </div>
      <h2 style="margin: 0 0 6px; font-size: 22px; color: ${t.text}; font-weight: 700; line-height: 1.3;">
        ${_("upgrade_title_benefit")}
      </h2>
      <p style="margin: 0 0 20px; color: ${t.textSecondary}; font-size: 13px; line-height: 1.5;">
        ${ka(i.reason)}
      </p>

      ${xa(t)}

      ${Sa(t)}

      <div style="display: flex; gap: 10px; margin-bottom: 16px;">
        ${Pe({ id: "monthly", title: _("upgrade_plan_monthly"), price: _("upgrade_price_monthly"), subtitle: _("upgrade_monthly_subtitle"), theme: t })}
        ${Pe({ id: "yearly", title: _("upgrade_plan_yearly"), price: _("upgrade_price_yearly"), subtitle: _("upgrade_yearly_subtitle"), theme: t })}
        ${r()}
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="ig-saver-have-key-link" style="
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          width: 100%; padding: 10px 12px;
          background: linear-gradient(135deg, rgba(131,58,180,0.10), rgba(253,29,29,0.05));
          border: 1px solid rgba(131,58,180,0.22);
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, border-color 0.15s;
        ">
          <span style="display: inline-flex; align-items: center; gap: 8px; color: ${t.text}; font-size: 12.5px;">
            <span style="
              width: 22px; height: 22px; border-radius: 50%;
              background: linear-gradient(135deg, #833AB4, #FD1D1D);
              color: #fff; display: inline-flex; align-items: center; justify-content: center;
              font-size: 12px; font-weight: 700;
            ">\u2713</span>
            <span>${_("have_key_prompt")}</span>
          </span>
          <span style="color: #833AB4; font-size: 12.5px; font-weight: 600; white-space: nowrap;">
            ${_("have_key_link")}
          </span>
        </button>
        <button id="ig-saver-upgrade-close" style="
          width: 100%; padding: 10px; background: ${t.hoverBg};
          color: ${t.text}; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 500; cursor: pointer;
          transition: background 0.15s;
        ">${_("upgrade_btn_close")}</button>
      </div>
    `;
      for (let d of a.querySelectorAll(".ig-saver-upgrade-plan"))
        (d.addEventListener("mouseenter", () => {
          d.style.transform = "translateY(-2px)";
        }),
          d.addEventListener("mouseleave", () => {
            d.style.transform = "translateY(0)";
          }),
          d.addEventListener("click", () => {
            let c = d.getAttribute("data-plan"),
              u = c === "lifetime" && Ze() ? qe.lifetimeEarly : qe[c];
            window.open(u, "_blank", "noopener,noreferrer");
          }));
      (document
        .getElementById("ig-saver-have-key-link")
        .addEventListener("click", l),
        document
          .getElementById("ig-saver-upgrade-close")
          .addEventListener("click", o));
    }
    function l() {
      a.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
        <button id="ig-saver-license-back" type="button" aria-label="back" style="
          width: 28px; height: 28px; padding: 0;
          background: transparent; color: ${t.textSecondary};
          border: 1px solid ${t.border}; border-radius: 50%;
          font-size: 14px; line-height: 1; cursor: pointer;
        ">\u2190</button>
        <h2 style="margin: 0; font-size: 18px; color: ${t.text}; font-weight: 700;">
          ${_("license_btn_activate")}
        </h2>
      </div>
      <p style="margin: 0 0 14px; color: ${t.textSecondary}; font-size: 13px; line-height: 1.5;">
        ${_("license_input_placeholder")}
      </p>
      <input
        id="ig-saver-license-input"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="IGSAVER-xxxx-xxxx-xxxx"
        style="
          width: 100%; padding: 12px 14px; box-sizing: border-box;
          background: ${t.inputBg}; color: ${t.text};
          border: 1px solid ${t.border}; border-radius: 10px;
          font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          margin-bottom: 10px;
        "
      />
      <div id="ig-saver-license-msg" style="
        font-size: 12px; min-height: 18px; margin-bottom: 14px;
        color: ${t.textSecondary};
      "></div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="ig-saver-license-activate" type="button" style="
          width: 100%; padding: 12px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #833AB4, #FD1D1D, #F77737);
          color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
        ">${_("license_btn_activate")}</button>
        <button id="ig-saver-license-cancel" type="button" style="
          width: 100%; padding: 10px; background: ${t.hoverBg};
          color: ${t.text}; border: none; border-radius: 10px;
          font-size: 13px; cursor: pointer;
        ">${_("upgrade_btn_close")}</button>
      </div>
    `;
      let d = a.querySelector("#ig-saver-license-input"),
        c = a.querySelector("#ig-saver-license-msg"),
        u = a.querySelector("#ig-saver-license-activate"),
        p = a.querySelector("#ig-saver-license-cancel"),
        g = a.querySelector("#ig-saver-license-back");
      setTimeout(() => d.focus(), 30);
      function f(y, S) {
        ((c.textContent = y),
          (c.style.color =
            S === "error"
              ? "#ed4956"
              : S === "success"
                ? "#00a884"
                : t.textSecondary));
      }
      async function h() {
        let y = d.value.trim();
        if (!y) {
          f(_("license_input_placeholder"), "error");
          return;
        }
        u.disabled = !0;
        let S = u.textContent;
        u.textContent = _("license_btn_activating");
        let E = await Kt(y);
        ((u.disabled = !1),
          (u.textContent = S),
          E.ok
            ? (f(_("license_msg_activated"), "success"), setTimeout(o, 1200))
            : E.reason === "limit_reached"
              ? f(_("license_msg_limit_reached_body"), "error")
              : f(
                  _("license_msg_activate_failed", { error: E.error }),
                  "error",
                ));
      }
      (u.addEventListener("click", h),
        d.addEventListener("keydown", (y) => {
          y.key === "Enter" && h();
        }),
        p.addEventListener("click", o),
        g.addEventListener("click", s));
    }
    (n.appendChild(a),
      document.body.appendChild(n),
      s(),
      n.addEventListener("click", (d) => {
        d.target === n && o();
      }));
  }
  function D(i) {
    return i === z ? _("parse_html_error") : i;
  }
  var Xt = !1;
  async function w(i) {
    try {
      return await chrome.runtime.sendMessage(i);
    } catch (e) {
      throw (Gt(e) && Pa(), e);
    }
  }
  function Pa() {
    if (Xt) return;
    Xt = !0;
    let i = document.createElement("div");
    ((i.id = "ig-saver-reload-banner"),
      (i.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: #ed4956; color: #fff; text-align: center;
    padding: 10px 16px; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    display: flex; align-items: center; justify-content: center; gap: 12px;
  `),
      (i.innerHTML = `
    <span>Dog Saver: Extension updated \u2014 please reload this page.</span>
    <button style="background:#fff;color:#ed4956;border:none;border-radius:6px;padding:4px 14px;
      font-size:13px;font-weight:600;cursor:pointer;">Reload</button>
  `),
      i
        .querySelector("button")
        .addEventListener("click", () => location.reload()),
      document.body.appendChild(i));
  }
  var H = null,
    pe = 0,
    ge = 0;
  document.addEventListener(
    "mousemove",
    (i) => {
      ((pe = i.clientX), (ge = i.clientY));
    },
    { passive: !0 },
  );
  function Ia() {
    let i = window.getComputedStyle(document.body).backgroundColor;
    if (!i) return !1;
    let e = i.match(/(\d+)/g);
    if (!e || e.length < 3) return !1;
    let [t, n, a] = e.map(Number);
    return (t + n + a) / 3 < 50;
  }
  function L() {
    let i = Ia();
    return {
      bg: i ? "#161617" : "#ffffff",
      bgSecondary: i ? "#000000" : "#f5f5f7",
      text: i ? "#f5f5f7" : "#1d1d1f",
      textSecondary: i ? "#86868b" : "#86868b",
      border: i ? "#333336" : "#d2d2d7",
      overlay: i ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.4)",
      inputBg: i ? "#1c1c1e" : "#f5f5f7",
      hoverBg: i ? "#2c2c2e" : "#e8e8ed",
    };
  }
  async function Ea() {
    try {
      let res = await chrome.storage.local.get(["pending_upgrade_dialog", "pending_download_dialog"]);
      if (res.pending_upgrade_dialog === !0) {
        await chrome.storage.local.remove("pending_upgrade_dialog");
        requestAnimationFrame(() => {
          Z({ reason: "generic", getTheme: L });
        });
      }
      if (res.pending_download_dialog === !0) {
        await chrome.storage.local.remove("pending_download_dialog");
        requestAnimationFrame(() => {
          Xa();
        });
      }

      // Page load recovery for active tasks
      let tasksRes = await w({ type: "GET_TASKS" });
      let activeTask = tasksRes?.tasks?.find(t => t.status === "running" || t.status === "paused");
      if (activeTask) {
        he(activeTask.taskId, activeTask.username);
      }
    } catch {}
  }
  function W() {
    let i = window.location.pathname;
    return [
      "/p/",
      "/reel/",
      "/explore/",
      "/accounts/",
      "/direct/",
      "/stories/",
      "/reels/",
    ].some((t) => i.startsWith(t))
      ? !1
      : /^\/[^/]+\/?$/.test(i) ||
          /^\/[^/]+\/reels\/?$/.test(i) ||
          /^\/[^/]+\/tagged\/?$/.test(i);
  }
  function O() {
    let e = window.location.pathname.match(/^\/([^/]+)/);
    return e ? e[1] : "";
  }
  function re() {
    return /^\/[^/]+\/reels\/?$/.test(window.location.pathname);
  }
  function Ta() {
    return /^\/[^/]+\/tagged\/?$/.test(window.location.pathname);
  }
  function tt() {
    return /\/p\/[^/]+\/?$/.test(window.location.pathname);
  }
  function De() {
    return /\/reel\/[^/]+\/?$/.test(window.location.pathname);
  }
  function se() {
    return /^\/stories\/[^/]+\/?(\d+\/?)?$/.test(window.location.pathname);
  }
  function F() {
    return /^\/stories\/highlights\/\d+\/?$/.test(window.location.pathname);
  }
  function de() {
    return window.location.pathname.startsWith("/explore/");
  }
  function le() {
    return /^\/reels(\/[^/]+)?\/?$/.test(window.location.pathname);
  }
  function _e() {
    return window.location.pathname === "/";
  }
  function J() {
    return /^\/[^/]+\/saved\/?$/.test(window.location.pathname);
  }
  function ee() {
    return /^\/[^/]+\/saved\/[^/]+(?:\/[^/]+)?\/?$/.test(
      window.location.pathname,
    );
  }
  function Aa() {
    let i = window.location.pathname.match(/^\/[^/]+\/saved\/([^/]+)/);
    return i ? i[1] : null;
  }
  function za() {
    let i = window.location.pathname.match(/^\/[^/]+\/saved\/[^/]+\/(\d+)/);
    return i ? i[1] : null;
  }
  function Ce() {
    let i = window.location.pathname.match(/^\/stories\/([^/]+)/);
    return i && i[1] !== "highlights" ? i[1] : null;
  }
  function ce() {
    let i = window.location.pathname.match(/^\/stories\/[^/]+\/(\d+)/);
    return i ? i[1] : null;
  }
  function aa() {
    let i = window.location.pathname.match(/^\/stories\/highlights\/(\d+)/);
    return i ? i[1] : null;
  }
  function na() {
    let i = window.location.pathname.match(/\/(?:p|reel|reels)\/([^/]+)/);
    return i ? i[1] : null;
  }
  function Ma() {
    let i = ["p", "reel", "explore", "accounts", "stories", "direct", "reels"],
      e = window.location.pathname.match(/^\/([^/]+)\/(?:p|reel)\//);
    if (e && !i.includes(e[1])) return e[1];
    let t = [
      'article a[href^="/"]',
      'header a[href^="/"]',
      'a[role="link"][href^="/"]',
    ];
    for (let n of t) {
      let a = document.querySelectorAll(n);
      for (let o of a) {
        let s = (o.getAttribute("href") ?? "").match(/^\/([^/]+)\/?$/);
        if (s && !i.includes(s[1])) return s[1];
      }
    }
    try {
      let n = document.querySelectorAll('script[type="application/json"]');
      for (let a of n) {
        let o = a.textContent || "",
          r = o.match(/"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"/);
        if (r) return r[1];
        let s = o.match(/"user"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"/);
        if (s) return s[1];
      }
    } catch {}
    return "unknown";
  }
  function dt() {
    let i = document.querySelector("header");
    if (!i) return null;
    let e = i.querySelector('section button:not([id^="ig-saver"])');
    if (!e) return null;
    let t = e.parentElement;
    for (
      let n = 0;
      t &&
      t !== i &&
      n < 6 &&
      !(
        t.tagName === "SECTION" ||
        window.getComputedStyle(t).display === "block"
      );
      n++
    ) {
      let o = t.querySelector('div[role="button"] svg');
      if (o) {
        let r = o.closest('div[role="button"]');
        if (r) return { container: t, similarBtn: r };
      }
      t = t.parentElement;
    }
    return null;
  }
  function te(i) {
    let e = i.querySelectorAll("button, a[href]");
    for (let t of e) {
      if (t.id?.startsWith("ig-saver")) continue;
      if (t.tagName === "A") {
        let a = window.getComputedStyle(t).backgroundColor;
        if (!a || a === "rgba(0, 0, 0, 0)" || a === "transparent") continue;
      }
      let n = window.getComputedStyle(t).borderRadius;
      if (n && n !== "0px" && n !== "0") return n;
    }
    return "62px";
  }
  function Re(i) {
    let e = window.getComputedStyle(i),
      t = e.columnGap;
    if (t && t !== "0px" && t !== "normal") return t;
    let n = e.gap;
    return n && n !== "0px" && n !== "normal" ? n.split(" ")[0] : null;
  }
  var FAVORITE_PROFILES_KEY = "ig_saver_favorite_profiles";
  async function getFavoriteProfiles() {
    try {
      let i = (await chrome.storage.local.get(FAVORITE_PROFILES_KEY))[
        FAVORITE_PROFILES_KEY
      ];
      return Array.isArray(i)
        ? Array.from(
            new Set(
              i
                .map((e) => String(e || "").replace(/^@/, "").trim())
                .filter((e) => /^[A-Za-z0-9._]{1,30}$/.test(e)),
            ),
          )
        : [];
    } catch {
      return [];
    }
  }
  var VIRALDOG_FAVORITES_MENU_ID = "viraldog-favorite-profiles-menu";
  function notifyViralDogFavoritesMenuClosed() {
    window.postMessage(
      { type: "VIRALDOG_IG_FAVORITES_MENU_CLOSED" },
      window.location.origin,
    );
  }
  function removeViralDogFavoritesMenu(notify = !0) {
    let host = document.getElementById(VIRALDOG_FAVORITES_MENU_ID);
    if (!host) return;
    (host.remove(),
      document.removeEventListener(
        "pointerdown",
        handleViralDogFavoritesOutsideClick,
        !0,
      ),
      document.removeEventListener(
        "keydown",
        handleViralDogFavoritesEscape,
        !0,
      ),
      notify && notifyViralDogFavoritesMenuClosed());
  }
  function handleViralDogFavoritesOutsideClick(event) {
    let host = document.getElementById(VIRALDOG_FAVORITES_MENU_ID);
    host && !host.contains(event.target) && removeViralDogFavoritesMenu();
  }
  function handleViralDogFavoritesEscape(event) {
    event.key === "Escape" && removeViralDogFavoritesMenu();
  }
  async function showViralDogFavoritesMenu(anchorX) {
    removeViralDogFavoritesMenu(!1);
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
    ((host.id = VIRALDOG_FAVORITES_MENU_ID),
      host.setAttribute("role", "presentation"),
      (host.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: ${left}px !important;
        width: ${menuWidth}px !important;
        z-index: 2147483647 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
      `));
    let shadow = host.attachShadow({ mode: "open" }),
      style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; }
      .menu {
        width: 240px;
        overflow: hidden;
        border: 1px solid #e8e8ed;
        border-radius: 12px;
        background: #fff;
        color: #1d1d1f;
        box-shadow: 0 14px 38px rgba(0, 0, 0, 0.18);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
        font: 500 12px/1.2 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: left;
        cursor: pointer;
      }
      .item:hover, .item:focus-visible { background: #f5f5f7; outline: none; }
      .star { flex: 0 0 auto; color: #f5b301; font-size: 15px; }
      .username { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .empty { padding: 24px 12px 26px; color: #86868b; font-size: 11px; text-align: center; }
    `;
    let menu = document.createElement("div"),
      title = document.createElement("div"),
      list = document.createElement("div");
    ((menu.className = "menu"),
      menu.setAttribute("role", "menu"),
      menu.setAttribute("aria-label", "Perfis favoritos"),
      (title.className = "title"),
      (title.textContent = "Perfis favoritos"),
      (list.className = "list"),
      menu.append(title, list));
    if (favorites.length === 0) {
      let empty = document.createElement("div");
      ((empty.className = "empty"),
        (empty.textContent = "Nenhum perfil favorito"),
        list.appendChild(empty));
    } else
      for (let username of favorites) {
        let item = document.createElement("button"),
          star = document.createElement("span"),
          label = document.createElement("span");
        ((item.type = "button"),
          (item.className = "item"),
          item.setAttribute("role", "menuitem"),
          item.setAttribute("title", `Abrir @${username}`),
          (star.className = "star"),
          star.setAttribute("aria-hidden", "true"),
          (star.textContent = "\u2605"),
          (label.className = "username"),
          (label.textContent = `@${username}`),
          item.append(star, label),
          item.addEventListener("click", (event) => {
            (event.preventDefault(),
              event.stopPropagation(),
              removeViralDogFavoritesMenu(),
              window.location.assign(
                `https://www.instagram.com/${encodeURIComponent(username)}/`,
              ));
          }),
          list.appendChild(item));
      }
    (shadow.append(style, menu),
      (document.body || document.documentElement).appendChild(host),
      document.addEventListener(
        "pointerdown",
        handleViralDogFavoritesOutsideClick,
        !0,
      ),
      document.addEventListener(
        "keydown",
        handleViralDogFavoritesEscape,
        !0,
      ));
  }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin)
      return;
    if (event.data?.type !== "VIRALDOG_SET_IG_FAVORITES_MENU") return;
    event.data.open === !0
      ? await showViralDogFavoritesMenu(event.data.anchorX)
      : removeViralDogFavoritesMenu();
  });
  async function toggleFavoriteProfile(i) {
    let e = String(i || "").replace(/^@/, "").trim(),
      t = await getFavoriteProfiles(),
      n = t.findIndex((a) => a.toLowerCase() === e.toLowerCase()),
      o = n < 0;
    return (
      o ? t.unshift(e) : t.splice(n, 1),
      await chrome.storage.local.set({ [FAVORITE_PROFILES_KEY]: t }),
      { active: o, profiles: t }
    );
  }
  function updateFavoriteButton(i, e) {
    ((i.dataset.active = e ? "true" : "false"),
      i.setAttribute(
        "aria-label",
        e ? "Remover dos favoritos" : "Adicionar aos favoritos",
      ),
      (i.title = e ? "Remover dos favoritos" : "Adicionar aos favoritos"),
      (i.style.color = e ? "#f5b301" : "#8e8e8e"),
      (i.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${e ? "currentColor" : "none"}"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    `));
  }
  function createFavoriteButton(i, e = "62px") {
    let t = document.createElement("button");
    return (
      (t.id = "ig-saver-favorite-btn"),
      (t.type = "button"),
      (t.dataset.username = i),
      (t.style.cssText = `
    width: 38px;
    min-width: 38px;
    height: 100%;
    min-height: 32px;
    padding: 0;
    background: rgba(142, 142, 142, 0.14);
    border: 1px solid rgba(142, 142, 142, 0.35);
    border-radius: ${e};
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, transform 0.15s, color 0.15s;
  `),
      updateFavoriteButton(t, !1),
      getFavoriteProfiles().then((n) => {
        updateFavoriteButton(
          t,
          n.some((a) => a.toLowerCase() === i.toLowerCase()),
        );
      }),
      t.addEventListener("mouseenter", () => {
        t.style.background = "rgba(142, 142, 142, 0.24)";
      }),
      t.addEventListener("mouseleave", () => {
        t.style.background = "rgba(142, 142, 142, 0.14)";
      }),
      t.addEventListener("click", async (n) => {
        (n.preventDefault(), n.stopPropagation(), (t.disabled = !0));
        try {
          let a = await toggleFavoriteProfile(i);
          (updateFavoriteButton(t, a.active),
            m(
              a.active
                ? `@${i} adicionado aos favoritos`
                : `@${i} removido dos favoritos`,
              "success",
            ),
            renderFavoriteProfiles());
        } catch (a) {
          m(`Erro ao atualizar favoritos: ${a.message}`, "error");
        } finally {
          t.disabled = !1;
        }
      }),
      t
    );
  }
  function We(i = "62px") {
    let e = document.createElement("button");
    return (
      (e.id = "ig-saver-btn"),
      (e.type = "button"),
      (e.style.cssText = `
    padding: 0 16px;
    height: 100%;
    background: #0095F6;
    color: #fff;
    border: none;
    border-radius: ${i};
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 18px;
  `),
      (e.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>${_("btn_download_all")}</span>
  `),
      e.addEventListener("mouseenter", () => {
        e.style.background = "#1877F2";
      }),
      e.addEventListener("mouseleave", () => {
        e.style.background = "#0095F6";
      }),
      e.addEventListener("click", () => Xa()),
      e
    );
  }
  function _t(i, e) {
    let t = Re(i.container),
      n = document.createElement("div");
    ((n.dataset.igSaverProfileActions = "true"),
      (n.dataset.username = O()),
      (n.style.cssText = `
    display: flex;
    align-items: stretch;
    align-self: stretch;
    flex-shrink: 0;
    gap: ${t || "8px"};
    ${t ? "" : "margin-left: 8px;"}
  `),
      n.appendChild(e),
      n.appendChild(createFavoriteButton(O(), te(i.container))));
    let a = i.similarBtn;
    for (; a && a.parentElement !== i.container; ) a = a.parentElement;
    a?.parentElement === i.container
      ? i.container.insertBefore(n, a)
      : i.container.appendChild(n);
  }
  function removeProfileActions() {
    for (let i of document.querySelectorAll(
      '[data-ig-saver-profile-actions="true"]',
    ))
      i.remove();
    document.getElementById("ig-saver-favorite-btn")?.remove();
  }
  function ct() {
    let i = document.querySelector("header");
    if (!i) return null;
    let e = i.querySelectorAll("section button, section a[href]");
    for (let t of e) {
      if (t.id?.startsWith("ig-saver")) continue;
      let n = t.getBoundingClientRect();
      if (n.width < 80 || n.height < 30 || !t.textContent?.trim()) continue;
      if (t.tagName === "A") {
        let o = window.getComputedStyle(t).backgroundColor;
        if (!o || o === "rgba(0, 0, 0, 0)" || o === "transparent") continue;
      }
      let a = t.parentElement;
      for (; a && a !== i && a.tagName !== "SECTION"; ) {
        let o = window.getComputedStyle(a);
        if (o.display.includes("flex") && o.flexDirection === "row") return a;
        a = a.parentElement;
      }
    }
    return null;
  }
  function at(i = 0) {
    let existingActions = document.querySelector(
      '[data-ig-saver-profile-actions="true"]',
    );
    existingActions?.dataset.username !== O() && existingActions?.remove();
    if (document.getElementById("ig-saver-btn") || !W() || Ta()) return;
    let e = dt();
    if (e) {
      let o = te(e.container),
        r = We(o);
      _t(e, r);
      return;
    }
    let t = ct();
    if (t) {
      let o = te(t),
        s = We(o);
      _t({ container: t, similarBtn: null }, s);
      return;
    }
    if (i < 5) {
      setTimeout(() => at(i + 1), 500 + i * 200);
      return;
    }
    let a = We();
    let actions = document.createElement("div");
    ((actions.dataset.igSaverProfileActions = "true"),
      (actions.dataset.username = O()),
      (actions.style.cssText =
        "position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; gap: 8px; height: 34px;"),
      actions.appendChild(a),
      actions.appendChild(createFavoriteButton(O())),
      document.body.appendChild(actions));
  }
  async function La(i) {
    try {
      let e = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${i}`,
        {
          credentials: "include",
          headers: {
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            Referer: `https://www.instagram.com/${i}/`,
          },
        },
      );
      if (!e.ok) return null;
      let n = (await P(e))?.data?.user;
      if (!n) return null;
      let a = K.extractHdProfilePicUrl(n);
      if (!a) return null;
      if (a.includes("s320x320") || a.includes("s150x150")) {
        let o = n.id;
        if (o)
          try {
            let r = await fetch(
              `https://www.instagram.com/api/v1/users/${o}/info/`,
              {
                credentials: "include",
                headers: {
                  "X-IG-App-ID": "936619743392459",
                  "X-Requested-With": "XMLHttpRequest",
                  Referer: `https://www.instagram.com/${i}/`,
                },
              },
            );
            if (r.ok) {
              let s = await P(r),
                l = s?.user ?? s,
                d = K.extractHdProfilePicUrl(l);
              d && (a = d);
            }
          } catch {}
      }
      return a;
    } catch {}
    return null;
  }
  function Ve() {
    if (document.getElementById("ig-saver-avatar-btn") || !W()) return;
    let i = document.querySelector("header");
    if (!i) return;
    let e = i.querySelectorAll("img"),
      t = null;
    for (let s of e) {
      let l = s.getBoundingClientRect();
      if (l.width >= 50 && l.height >= 50) {
        t = s;
        break;
      }
    }
    if (!t) return;
    let n = t.parentElement,
      a = !1;
    for (let s = 0; s < 8 && n && n !== i; s++) {
      let l = window.getComputedStyle(n);
      if (
        l.overflow === "hidden" ||
        (l.borderRadius && parseFloat(l.borderRadius) > 20)
      )
        a = !0;
      else if (a) break;
      n = n.parentElement;
    }
    if (!n || n === i) return;
    let o = document.createElement("button");
    ((o.id = "ig-saver-avatar-btn"),
      (o.type = "button"),
      o.setAttribute("aria-label", _("aria_download_hd_avatar")),
      (o.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    z-index: 10;
    width: 28px;
    height: 28px;
    padding: 0;
    background: rgba(0, 0, 0, 0.65);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  `),
      (o.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  `),
      n.addEventListener("mouseenter", () => {
        o.style.opacity = "1";
      }),
      n.addEventListener("mouseleave", () => {
        o.style.opacity = "0";
      }),
      o.addEventListener("click", async (s) => {
        (s.preventDefault(), s.stopPropagation());
        let l = o.innerHTML;
        ((o.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>'),
          (o.disabled = !0),
          (o.style.opacity = "1"));
        try {
          let d = O(),
            c = await La(d);
          if (!c) {
            m(_("notify_avatar_failed"), "error");
            return;
          }
          let u = await w({
            type: "DOWNLOAD_AVATAR",
            payload: { username: d, url: c },
          });
          if (u?.error) {
            m(_("notify_download_failed", { error: u.error }), "error");
            return;
          }
          m(_("notify_avatar_success"), "success", !0);
        } catch (d) {
          m(_("notify_download_failed", { error: D(d.message) }), "error");
        } finally {
          ((o.innerHTML = l), (o.disabled = !1));
        }
      }));
    let r = window.getComputedStyle(n).position;
    ((r === "static" || !r) && (n.style.position = "relative"),
      n.appendChild(o));
  }
  function ut(i) {
    let e = i.getAttribute("href")?.match(/\/p\/([^/]+)/);
    return e ? e[1] : null;
  }
  function pt(i) {
    let e = i.getAttribute("href")?.match(/\/reel\/([^/]+)/);
    return e ? e[1] : null;
  }
  function Da() {
    if (!W()) return;
    let i = O(),
      e = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    for (let t of e) {
      let a = (t.getAttribute("href") ?? "").includes("/reel/"),
        o = a ? pt(t) : ut(t);
      if (!o || t.hasAttribute("data-ig-saver-processed")) continue;
      t.setAttribute("data-ig-saver-processed", o);
      let r = t.parentElement;
      for (let l = 0; l < 3 && r; l++) {
        let d = window.getComputedStyle(r).position;
        if (d === "relative" || d === "absolute") break;
        r.parentElement && (r = r.parentElement);
      }
      if (!r) continue;
      r.setAttribute("data-ig-saver-post-btn", o);
      let s = document.createElement("button");
      ((s.type = "button"),
        s.setAttribute("aria-label", _("aria_download_post_zip")),
        (s.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 10;
      width: 32px;
      height: 32px;
      padding: 0;
      background: rgba(0, 0, 0, 0.65);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `),
        (s.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `),
        r.addEventListener("mouseenter", () => {
          s.style.opacity = "1";
        }),
        r.addEventListener("mouseleave", () => {
          s.style.opacity = "0";
        }),
        s.addEventListener("click", (l) => {
          (l.preventDefault(), l.stopPropagation(), ht(i, o, s, a));
        }),
        (r.style.position = r.style.position || "relative"),
        r.insertBefore(s, r.firstChild));
    }
  }
  function nt() {
    if (!de()) return;
    let i = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    for (let e of i) {
      let n = (e.getAttribute("href") ?? "").includes("/reel/"),
        a = n ? pt(e) : ut(e);
      if (!a || e.hasAttribute("data-ig-saver-processed")) continue;
      e.setAttribute("data-ig-saver-processed", a);
      let o = e.parentElement;
      for (let s = 0; s < 3 && o; s++) {
        let l = window.getComputedStyle(o).position;
        if (l === "relative" || l === "absolute") break;
        o.parentElement && (o = o.parentElement);
      }
      if (!o) continue;
      o.setAttribute("data-ig-saver-post-btn", a);
      let r = document.createElement("button");
      ((r.type = "button"),
        r.setAttribute("aria-label", _("aria_download_post_zip")),
        (r.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 10;
      width: 32px;
      height: 32px;
      padding: 0;
      background: rgba(0, 0, 0, 0.65);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `),
        (r.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `),
        o.addEventListener("mouseenter", () => {
          r.style.opacity = "1";
        }),
        o.addEventListener("mouseleave", () => {
          r.style.opacity = "0";
        }),
        r.addEventListener("click", (s) => {
          (s.preventDefault(), s.stopPropagation(), oa(a, r, n));
        }),
        (o.style.position = o.style.position || "relative"),
        o.insertBefore(r, o.firstChild));
    }
  }
  function Ca(i) {
    return !!i.querySelector('a[href*="facebook.com/ads/ig_redirect"]');
  }
  function Yt(i) {
    let e = null,
      t = 0;
    for (let r of i.querySelectorAll("img, video")) {
      let s = r.getBoundingClientRect(),
        l = s.width * s.height;
      l > t && ((t = l), (e = r));
    }
    if (!e || t < 100 * 100) return null;
    let n = e.getBoundingClientRect(),
      a = e.parentElement,
      o = null;
    for (; a && a !== i; ) {
      let r = window.getComputedStyle(a),
        s = a.getBoundingClientRect(),
        l = Math.abs(s.top - n.top) <= 4,
        d = r.overflow.includes("auto") || r.overflow.includes("scroll"),
        c = s.left >= 0 && s.left < window.innerWidth && s.width >= 200;
      if (!l) break;
      ((r.position === "relative" || r.position === "absolute") &&
        !d &&
        c &&
        (o = a),
        (a = a.parentElement));
    }
    return o;
  }
  function ot() {
    if (!_e()) return;
    let i = document.querySelectorAll("article");
    for (let e of i) {
      if (e.hasAttribute("data-ig-saver-feed-processed")) continue;
      if (Ca(e)) {
        let c = Yt(e);
        if (!c) continue;
        let u = Ra(_("tooltip_sponsored_not_downloadable"));
        (e.addEventListener("mouseenter", () => {
          u.style.opacity = "0.85";
        }),
          e.addEventListener("mouseleave", () => {
            u.style.opacity = "0";
          }),
          c.insertBefore(u, c.firstChild),
          e.setAttribute("data-ig-saver-feed-processed", "sponsored"));
        continue;
      }
      let t = e.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (!t) continue;
      let n = t.getAttribute("href") ?? "",
        a = n.includes("/reel/"),
        o = n.match(/\/(p|reel)\/([^/]+)/);
      if (!o) continue;
      let r = o[2],
        s = Yt(e);
      if (!s) continue;
      let l = document.createElement("button");
      ((l.type = "button"),
        l.setAttribute("aria-label", _("aria_download_post")),
        (l.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 10;
      width: 32px;
      height: 32px;
      padding: 0;
      background: rgba(0, 0, 0, 0.65);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `),
        (l.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `));
      let d = "unknown";
      for (let c of e.querySelectorAll('a[href^="/"]')) {
        let p = (c.getAttribute("href") ?? "").match(/^\/([^/]+)\/$/);
        if (
          p &&
          ![
            "p",
            "reel",
            "explore",
            "reels",
            "stories",
            "accounts",
            "direct",
          ].includes(p[1])
        ) {
          d = p[1];
          break;
        }
      }
      (e.addEventListener("mouseenter", () => {
        l.style.opacity = "1";
      }),
        e.addEventListener("mouseleave", () => {
          l.style.opacity = "0";
        }),
        l.addEventListener("click", (c) => {
          (c.preventDefault(), c.stopPropagation(), Ha(r, d, l, a));
        }),
        s.insertBefore(l, s.firstChild),
        e.setAttribute("data-ig-saver-feed-processed", r));
    }
  }
  function Ra(i) {
    let e = document.createElement("button");
    return (
      (e.type = "button"),
      (e.disabled = !0),
      e.setAttribute("aria-label", i),
      (e.title = i),
      (e.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
    width: 32px;
    height: 32px;
    padding: 0;
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.7);
    border: none;
    border-radius: 50%;
    cursor: not-allowed;
    opacity: 0;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `),
      (e.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
      <line x1="3" y1="3" x2="21" y2="21" stroke-width="2.5"/>
    </svg>
  `),
      e
    );
  }
  var interceptedPostsByShortcode = new Map(),
    interceptedRequestSequence = 0;
  function rememberInterceptedPosts(i) {
    if (!Array.isArray(i)) return;
    for (let e of i) {
      let t = String(e?.shortcode || e?.postId || "");
      if (t && Array.isArray(e.mediaItems) && e.mediaItems.length > 0)
        interceptedPostsByShortcode.set(t, e);
    }
    if (interceptedPostsByShortcode.size > 500) {
      let e = interceptedPostsByShortcode.keys();
      for (; interceptedPostsByShortcode.size > 400; ) {
        let t = e.next();
        if (t.done) break;
        interceptedPostsByShortcode.delete(t.value);
      }
    }
  }
  function getInterceptedMedia(i, e) {
    let t = interceptedPostsByShortcode.get(String(i));
    if (!t?.mediaItems?.length) return [];
    return t.mediaItems
      .filter(
        (n) =>
          n?.url &&
          (n.url.startsWith("https://") || n.url.startsWith("http://")),
      )
      .map((n) => ({ ...n, creator: n.creator || e || "unknown" }));
  }
  async function requestInterceptedMedia(i, e) {
    let t = getInterceptedMedia(i, e);
    if (t.length > 0) return t;
    let n = `ig-saver-${Date.now()}-${++interceptedRequestSequence}`;
    return await new Promise((a) => {
      let o = !1,
        r = (l) => {
          if (
            l.source !== window ||
            l.data?.type !== "IG_SAVER_INTERCEPTED_POST_RESPONSE" ||
            l.data?.requestId !== n
          )
            return;
          o = !0;
          window.removeEventListener("message", r);
          let d = parseInterceptedPostsInline(l.data.rawItems || [], e);
          rememberInterceptedPosts(d);
          a(getInterceptedMedia(i, e));
        },
        s = () => {
          if (o) return;
          window.removeEventListener("message", r);
          a([]);
        };
      window.addEventListener("message", r);
      window.postMessage(
        {
          type: "IG_SAVER_REQUEST_INTERCEPTED_POST",
          requestId: n,
          shortcode: i,
        },
        "*",
      );
      setTimeout(s, 450);
    });
  }
  function gt(i, e) {
    let t = findPostFallbackContainer(e, "p");
    if (!t) return [];
    let n = t.querySelector(`a[href*="/p/${e}"]`) || t,
      video = t.querySelector("video"),
      videoUrl =
        video?.currentSrc?.trim() ||
        video?.src?.trim() ||
        video?.querySelector("source[src]")?.getAttribute("src")?.trim() ||
        "";
    if (videoUrl && videoUrl.startsWith("http")) {
      return [
        {
          postId: e,
          index: 0,
          type: "video",
          url: videoUrl,
          timestamp: Math.floor(Date.now() / 1e3),
          creator: i,
        },
      ];
    }
    if (video) return [];
    let o = t.querySelector("img[src]")?.getAttribute("src")?.trim();
    if (!o || !o.startsWith("http")) return [];
    let r = Math.floor(Date.now() / 1e3);
    return [
      { postId: e, index: 0, type: "image", url: o, timestamp: r, creator: i },
    ];
  }
  function mt(i, e) {
    let t = findPostFallbackContainer(e, "reel");
    !t && le() && na() === e && (t = on());
    if (!t) return [];
    let n =
      t.querySelector(`a[href*="/reel/${e}"]`) ||
      t.querySelector(`a[href*="/reels/${e}"]`) ||
      t;
    if (!n) return [];
    let video = t.querySelector("video"),
      o =
        video?.currentSrc?.trim() ||
        video?.src?.trim() ||
        video?.querySelector("source[src]")?.getAttribute("src")?.trim() ||
        n.querySelector("video source[src]")?.getAttribute("src")?.trim();
    if (o && o.startsWith("http"))
      return [
        {
          postId: e,
          index: 0,
          type: "video",
          url: o,
          timestamp: Math.floor(Date.now() / 1e3),
          creator: i,
        },
      ];
    if (video) return [];
    let s = t.querySelector("img[src]")?.getAttribute("src")?.trim();
    return !s || !s.startsWith("http")
      ? []
      : [
          {
            postId: e,
            index: 0,
            type: "image",
            url: s,
            timestamp: Math.floor(Date.now() / 1e3),
            creator: i,
          },
        ];
  }
  function getReelCreatorFromContainer(i) {
    let e = findPostFallbackContainer(i, "reel");
    !e && le() && na() === i && (e = on());
    if (!e) return null;
    let t = new Set([
      "accounts",
      "direct",
      "explore",
      "p",
      "reel",
      "reels",
      "stories",
      "about",
      "developer",
      "legal",
      "privacy",
      "web",
    ]);
    for (let n of e.querySelectorAll('a[href]'))
      try {
        let a = new URL(n.getAttribute("href"), window.location.origin),
          o = a.pathname.split("/").filter(Boolean);
        if (o.length !== 1 || t.has(o[0].toLowerCase())) continue;
        if (/^[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/.test(o[0]))
          return o[0];
      } catch {}
    return null;
  }
  function findPostFallbackContainer(e, t) {
    let n =
      document.querySelector(`[data-ig-saver-post-btn="${e}"]`) ||
      document.querySelector(`article[data-ig-saver-feed-processed="${e}"]`);
    if (n) return n;
    if (t === "reel")
      return (
        document
          .querySelector(
            `article a[href*="/reel/${e}"], article a[href*="/reels/${e}"]`,
          )
          ?.closest("article") ||
        (le() && na() === e ? on() : null)
      );
    return (
      document.querySelector(`article a[href*="/p/${e}"]`)?.closest("article") ||
      null
    );
  }
  function $a(i, e) {
    let t = Math.floor(Date.now() / 1e3);
    function n(o, r, s) {
      if (!o || typeof o != "object" || s > 20) return null;
      if ((o.shortcode ?? o.code) === r) return o;
      if (Array.isArray(o)) {
        for (let d of o) {
          let c = n(d, r, s + 1);
          if (c) return c;
        }
        return null;
      }
      for (let d of Object.keys(o)) {
        let c = n(o[d], r, s + 1);
        if (c) return c;
      }
      return null;
    }
    function a(o) {
      let r = selectVideoUrl(o.video_versions, o.video_url ?? o.videoUrl ?? o.playback_video_url),
        s = o.display_url || "",
        l = [];
      return (
        r &&
          (r.startsWith("http://") || r.startsWith("https://")) &&
          (s &&
            s.startsWith("http") &&
            l.push({
              postId: e,
              index: 0,
              type: "image",
              url: s,
              timestamp: t,
              creator: i,
            }),
          l.push({
            postId: e,
            index: l.length,
            type: "video",
            url: r,
            timestamp: t,
            creator: i,
          })),
        l
      );
    }
    try {
      let o = document.querySelectorAll('script[type="application/json"]');
      for (let r of o) {
        let s = r.textContent || "";
        if (!(!s.includes(e) && !s.includes("video_url")))
          try {
            let l = JSON.parse(s),
              d = n(l, e, 0);
            if (d) {
              let c = a(d);
              if (c.length > 0) return c;
            }
          } catch {
            continue;
          }
      }
    } catch {}
    return [];
  }
  async function Ba(i, e) {
    console.log(`[IG-Saver] getMediaFromProfileFeed: start, shortcode=${e}`);
    let t = { mode: "all", fromTs: null, toTs: null, nDays: null },
      n = new K(i, "all", t),
      a = null,
      o = 3;
    for (let r = 0; r < o; r++) {
      console.log(
        `[IG-Saver] getMediaFromProfileFeed: fetching page ${r + 1}/${o}, cursor=${a}`,
      );
      try {
        let s = await n.fetchPage(a);
        console.log(
          `[IG-Saver] getMediaFromProfileFeed: page ${r + 1} returned ${s.posts.length} posts, hasNextPage=${s.hasNextPage}`,
        );
        let l = s.posts.find((d) => d.postId === e);
        if (l && l.mediaItems.length > 0)
          return (
            console.log(
              `[IG-Saver] getMediaFromProfileFeed: found post with ${l.mediaItems.length} items`,
            ),
            l.mediaItems
          );
        if (!s.hasNextPage || !s.cursor) break;
        a = s.cursor;
      } catch (s) {
        s.message === z
          ? console.log(
              `[IG-Saver] getMediaFromProfileFeed: page ${r + 1} got HTML response, falling back`,
            )
          : console.error(
              `[IG-Saver] getMediaFromProfileFeed: page ${r + 1} error:`,
              s.message,
            );
        break;
      }
    }
    return (
      console.log(
        `[IG-Saver] getMediaFromProfileFeed: not found after ${o} pages`,
      ),
      []
    );
  }
  async function ht(i, e, t, n) {
    let a = t.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let o = document.createElement("style");
      ((o.id = "ig-saver-spinner-style"),
        (o.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(o));
    }
    ((t.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="white" stroke-width="2.5" stroke-linecap="round"
    style="animation: ig-saver-spin 0.8s linear infinite;">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`),
      (t.style.pointerEvents = "none"),
      (t.style.opacity = "1"));
    try {
      console.log(`[IG-Saver] downloadSinglePostAsZip: id=${e}, isReel=${n}`);
      let o = await requestInterceptedMedia(e, i || "unknown");
      if (n) {
        if (
          (o.length === 0 &&
            re() &&
            ((o = $a(i, e)),
            console.log(
              `[IG-Saver] Reel step 1 getMediaFromReelsPageEmbed: ${o.length} items`,
            )),
          o.length === 0)
        ) {
          let s = new C(i || "unknown");
          try {
            ((o = await s.resolveReel(e)),
              console.log(
                `[IG-Saver] Reel step 2 resolveReel: ${o.length} items`,
              ));
          } catch (l) {
            console.error(
              "[IG-Saver] Reel step 2 resolveReel error:",
              l.message,
            );
          }
        }
        o.length === 0 &&
          ((o = mt(i || "unknown", e)),
          console.log(
            `[IG-Saver] Reel step 3 getMediaFromReelTile: ${o.length} items`,
          ));
      } else {
        if (i && o.length === 0)
          try {
            ((o = await Ba(i, e)),
              console.log(
                `[IG-Saver] Post step 1 getMediaFromProfileFeed: ${o.length} items`,
              ));
          } catch (s) {
            s.message === z
              ? console.log(
                  "[IG-Saver] Post step 1 getMediaFromProfileFeed: HTML response, trying fallback",
                )
              : console.error(
                  "[IG-Saver] Post step 1 getMediaFromProfileFeed error:",
                  s.message,
                );
          }
        if (o.length === 0) {
          let s = new C(i || "unknown");
          try {
            ((o = await s.resolvePost(e)),
              console.log(
                `[IG-Saver] Post step 2 resolvePost: ${o.length} items`,
              ));
          } catch (l) {
            console.error(
              "[IG-Saver] Post step 2 resolvePost error:",
              l.message,
            );
          }
        }
        o.length === 0 &&
          ((o = gt(i || "unknown", e)),
          console.log(
            `[IG-Saver] Post step 3 getMediaFromPostTile: ${o.length} items`,
          ));
      }
      if (o.length === 0) {
        m(_("notify_post_media_failed"), "error");
        return;
      }
      let r = o[0].creator && o[0].creator !== "unknown" ? o[0].creator : i;
      if (o.length === 1) {
        let s = await relaySingleMediaToElectron(r, e, o[0]);
        if (s?.error) {
          m(_("notify_download_failed", { error: s.error }), "error");
          return;
        }
        m(_("notify_downloaded_1_file"), "success", !0);
      } else {
        let s = await w({
          type: "DOWNLOAD_POST_AS_ZIP",
          payload: { username: r, postId: e, items: o },
        });
        if (s?.error) {
          m(_("notify_download_failed", { error: s.error }), "error");
          return;
        }
        m(
          _("notify_downloaded_n_files_zip", { count: o.length }),
          "success",
          !0,
        );
      }
    } catch (o) {
      m(_("notify_download_failed", { error: D(o.message) }), "error");
    } finally {
      ((t.innerHTML = a), (t.style.pointerEvents = ""));
    }
  }
  async function oa(i, e, t) {
    let n = e.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let a = document.createElement("style");
      ((a.id = "ig-saver-spinner-style"),
        (a.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(a));
    }
    ((e.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="white" stroke-width="2.5" stroke-linecap="round"
    style="animation: ig-saver-spin 0.8s linear infinite;">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`),
      (e.style.pointerEvents = "none"),
      (e.style.opacity = "1"));
    try {
      // Intercepted metadata belongs to this exact shortcode and carries its
      // owner. Reading the visible video first loses that association.
      let a = await requestInterceptedMedia(i, null),
        scopedCreator = t ? getReelCreatorFromContainer(i) : null;
      if (t) {
        if (a.length === 0) {
          let r = new C(scopedCreator || "desconhecido");
          try {
            a = await r.resolveReel(i);
          } catch {}
        }
        // DOM media is intentionally last. Its author is read only from the
        // active Reel container, never from global navigation links.
        a.length === 0 && (a = mt(scopedCreator || "desconhecido", i));
      } else {
        if (a.length === 0) {
          let r = new C("unknown");
          try {
            a = await r.resolvePost(i);
          } catch {}
        }
        a.length === 0 && (a = gt("unknown", i));
      }
      if (a.length === 0) {
        m(_("notify_post_media_failed"), "error");
        return;
      }
      let o =
        a[0].creator && a[0].creator !== "unknown"
          ? a[0].creator
          : scopedCreator || "desconhecido";
      if (a.length === 1) {
        let r = await relaySingleMediaToElectron(o, i, a[0]);
        if (r?.error) {
          m(_("notify_download_failed", { error: r.error }), "error");
          return;
        }
        m(_("notify_downloaded_1_file"), "success", !0);
      } else {
        let r = await w({
          type: "DOWNLOAD_POST_AS_ZIP",
          payload: { username: o, postId: i, items: a },
        });
        if (r?.error) {
          m(_("notify_download_failed", { error: r.error }), "error");
          return;
        }
        m(
          _("notify_downloaded_n_files_zip", { count: a.length }),
          "success",
          !0,
        );
      }
    } catch (a) {
      m(_("notify_download_failed", { error: D(a.message) }), "error");
    } finally {
      ((e.innerHTML = n), (e.style.pointerEvents = ""));
    }
  }
  async function Ha(i, e, t, n) {
    let a = t.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let o = document.createElement("style");
      ((o.id = "ig-saver-spinner-style"),
        (o.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(o));
    }
    ((t.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="white" stroke-width="2.5" stroke-linecap="round"
    style="animation: ig-saver-spin 0.8s linear infinite;">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`),
      (t.style.pointerEvents = "none"),
      (t.style.opacity = "1"));
    try {
      let o = await requestInterceptedMedia(i, e || "unknown");
      if (n) {
        if (o.length === 0) {
          let r = new C(e || "unknown");
          try {
            o = await r.resolveReel(i);
          } catch {}
        }
        o.length === 0 && (o = mt(e || "unknown", i));
      } else {
        if (o.length === 0) {
          let r = new C(e || "unknown");
          try {
            o = await r.resolvePost(i);
          } catch {}
        }
        o.length === 0 && (o = gt(e || "unknown", i));
      }
      if (o.length === 0) {
        m(_("notify_post_media_failed"), "error");
        return;
      }
      if (o.length === 1) {
        let r = await relaySingleMediaToElectron(e, i, o[0]);
        if (r?.error) {
          m(_("notify_download_failed", { error: r.error }), "error");
          return;
        }
        m(_("notify_downloaded_1_file"), "success", !0);
      } else {
        let r = await w({
          type: "DOWNLOAD_POST_AS_ZIP",
          payload: { username: e || "unknown", postId: i, items: o },
        });
        if (r?.error) {
          m(_("notify_download_failed", { error: r.error }), "error");
          return;
        }
        m(
          _("notify_downloaded_n_files_zip", { count: o.length }),
          "success",
          !0,
        );
      }
    } catch (o) {
      m(_("notify_download_failed", { error: D(o.message) }), "error");
    } finally {
      ((t.innerHTML = a), (t.style.pointerEvents = ""));
    }
  }
  function it(i = 0) {
    if (document.getElementById("ig-saver-saved-btn") || !J()) return;
    let t = document.querySelector("header")?.querySelector("section"),
      n = dt();
    if (n) {
      let r = te(n.container),
        s = Ke(r);
      _t(n, s);
      return;
    }
    let a = ct();
    if (a) {
      let r = te(a),
        s = Re(a),
        l = Ke(r),
        d = document.createElement("div");
      ((d.style.cssText = `
      display: flex; align-items: stretch; align-self: stretch; flex-shrink: 0;
      ${s ? "" : "margin-left: 8px;"}
    `),
        d.appendChild(l),
        a.appendChild(d));
      return;
    }
    if (i < 5) {
      setTimeout(() => it(i + 1), 500 + i * 200);
      return;
    }
    let o = Ke();
    ((o.style.position = "fixed"),
      (o.style.bottom = "20px"),
      (o.style.right = "20px"),
      (o.style.zIndex = "10000"),
      document.body.appendChild(o));
  }
  function Ke(i = "62px") {
    let e = document.createElement("button");
    return (
      (e.id = "ig-saver-saved-btn"),
      (e.type = "button"),
      (e.style.cssText = `
    padding: 0 16px; height: 100%;
    background: #0095F6; color: #fff; border: none;
    border-radius: ${i};
    font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
    display: flex; align-items: center; gap: 6px; white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 18px;
  `),
      (e.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>${_("btn_download_saved")}</span>
  `),
      e.addEventListener("mouseenter", () => {
        e.style.background = "#1877F2";
      }),
      e.addEventListener("mouseleave", () => {
        e.style.background = "#0095F6";
      }),
      e.addEventListener("click", async () => {
        try {
          let t = await xe();
          if (!Se(t)) {
            Z({ reason: "savedMulti", getTheme: L });
            return;
          }
        } catch {}
        Fa();
      }),
      e
    );
  }
  function Ga() {
    if (!J()) return;
    let i = O(),
      e = document.querySelectorAll(`a[href*="/${i}/saved/"]`);
    for (let t of e) {
      let n = t.getAttribute("href") ?? "",
        a = n.match(/\/saved\/([^/]+)\/(\d+)\/?$/),
        o = n.match(/\/saved\/([^/]+)\/?$/);
      if (!a && !o) continue;
      let r = a ? a[1] : o[1],
        s = a ? a[2] : null;
      if (t.hasAttribute("data-ig-saver-saved-processed")) continue;
      t.setAttribute("data-ig-saver-saved-processed", s ?? r);
      let l = t.parentElement;
      if (!l) continue;
      let d = document.createElement("button");
      ((d.type = "button"),
        d.setAttribute("aria-label", _("btn_download_collection")),
        (d.style.cssText = `
      position: absolute; top: 8px; left: 8px; z-index: 10;
      width: 32px; height: 32px; padding: 0;
      background: rgba(0, 0, 0, 0.65); color: white; border: none;
      border-radius: 50%; cursor: pointer; opacity: 0;
      transition: opacity 0.2s;
      display: flex; align-items: center; justify-content: center;
    `),
        (d.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `),
        l.addEventListener("mouseenter", () => {
          d.style.opacity = "1";
        }),
        l.addEventListener("mouseleave", () => {
          d.style.opacity = "0";
        }),
        d.addEventListener("click", (c) => {
          (c.preventDefault(), c.stopPropagation());
          let u = t.textContent?.trim() || r;
          Na(i, r, u, d, s);
        }),
        (l.style.position = "relative"),
        l.insertBefore(d, l.firstChild));
    }
  }
  async function Na(i, e, t, n, a) {
    let o = n.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let r = document.createElement("style");
      ((r.id = "ig-saver-spinner-style"),
        (r.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(r));
    }
    ((n.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="white" stroke-width="2.5" stroke-linecap="round"
    style="animation: ig-saver-spin 0.8s linear infinite;">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`),
      (n.style.pointerEvents = "none"),
      (n.style.opacity = "1"));
    try {
      m(_("notify_fetching_collections"), "success");
      let s = await new j(i, "all").fetchCollections(),
        l =
          (a ? s.find((u) => u.collectionId === a) : null) ??
          (e === "all-posts"
            ? s.find((u) => u.collectionType === "ALL_MEDIA_AUTO_COLLECTION")
            : null) ??
          s.find(
            (u) =>
              be(u.collectionName) === e ||
              u.collectionName.toLowerCase().replace(/\s+/g, "-") ===
                e.toLowerCase(),
          ) ??
          s.find((u) => u.collectionName.toLowerCase() === t.toLowerCase());
      if (!l) {
        m(_("notify_no_collections"), "error");
        return;
      }
      let d = await w({
        type: "START_SAVED_DOWNLOAD",
        payload: {
          username: i,
          filter: "all",
          flatFolder: !0,
          source: "saved_collection",
          collectionId: l.collectionId,
          collectionName: l.collectionName,
          collectionType: l.collectionType,
        },
      });
      if (d?.error) {
        m(_("notify_error", { message: d.error }), "error");
        return;
      }
      let c = d.task;
      ((H = c.taskId),
        m(_("notify_started", { username: i }), "success"),
        he(c.taskId, i));
    } catch (r) {
      m(_("notify_error", { message: D(r.message) }), "error");
    } finally {
      ((n.innerHTML = o), (n.style.pointerEvents = ""));
    }
  }
  async function Fa() {
    let i = O();
    (console.log(
      `[Dog Saver][Content] fetchAndShowCollectionPicker: username=${i}`,
    ),
      m(_("notify_fetching_collections"), "success"));
    try {
      let e = new j(i, "all");
      console.log(
        "[Dog Saver][Content] fetchAndShowCollectionPicker: calling fetchCollections...",
      );
      let t = await e.fetchCollections();
      if (
        (console.log(
          `[Dog Saver][Content] fetchAndShowCollectionPicker: got ${t.length} collections`,
        ),
        t.length === 0)
      ) {
        (console.warn(
          "[Dog Saver][Content] fetchAndShowCollectionPicker: no collections found",
        ),
          m(_("notify_no_collections"), "error"));
        return;
      }
      Oa(i, t);
    } catch (e) {
      (console.error(
        "[Dog Saver][Content] fetchAndShowCollectionPicker EXCEPTION:",
        e.message,
        e.stack,
      ),
        m(_("notify_error", { message: D(e.message) }), "error"));
    }
  }
  function Oa(i, e) {
    let t = document.getElementById("ig-saver-dialog");
    t && t.remove();
    let n = L(),
      a = document.createElement("div");
    injectDialogStyles();
    a.id = "ig-saver-dialog";
    a.className = "ig-saver-dialog-root";
    a.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: ${n.overlay}; z-index: 10001;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.2s ease;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    `;
    requestAnimationFrame(() => {
      a.style.opacity = "1";
    });

    let mesh = document.createElement("div");
    mesh.className = "ig-saver-bg-mesh";
    a.appendChild(mesh);

    let o = document.createElement("div");
    o.className = "ig-saver-glass-card";
    o.style.transform = "scale(0.95) translateY(8px)";
    o.style.opacity = "0";
    requestAnimationFrame(() => {
      o.style.transform = "scale(1) translateY(0)";
      o.style.opacity = "1";
    });
    
    let r = `width: 100%; padding: 10px 12px; border: 1px solid ${n.border}; border-radius: 8px; font-size: 14px; background: ${n.inputBg}; color: ${n.text}; cursor: pointer; transition: border-color 0.2s; outline: none;`,
      s = `font-size: 12px; color: ${n.textSecondary}; display: block; margin-bottom: 6px; font-weight: 600; text-align: left; text-transform: uppercase; letter-spacing: 0.3px;`,
      l = document.createElement("h2");
    l.className = "ig-saver-title";
    l.style.cssText = `margin: 0 0 16px; flex-shrink: 0; display: flex; align-items: center; gap: 8px;`;
    l.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FD1D1D"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>${_("dialog_saved_title")}</span>
  `;
    o.appendChild(l);
    let d = document.createElement("div");
    d.style.cssText =
      "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0;";
    let c = document.createElement("label");
    ((c.style.cssText = s), (c.textContent = _("dialog_select_collections")));
    let u = document.createElement("button");
    ((u.type = "button"),
      (u.style.cssText =
        "background: none; border: none; color: #FD1D1D; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; outline: none; font-family: inherit;"),
      (u.textContent = _("dialog_deselect_all")),
      d.appendChild(c),
      d.appendChild(u),
      o.appendChild(d));
    let p = document.createElement("div");
    p.style.cssText = `
    overflow-y: auto; flex: 1; min-height: 0;
    max-height: 300px; margin-bottom: 16px;
    border: 1px solid var(--ig-border); border-radius: 12px;
  `;
    let g = [],
      f = !0;
    for (let v of e) {
      let k = document.createElement("label");
      ((k.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; cursor: pointer;
      transition: background 0.2s ease;
      border-bottom: 1px solid var(--ig-border);
    `),
        k.addEventListener("mouseenter", () => {
          k.style.background = "var(--ig-hover-bg)";
        }),
        k.addEventListener("mouseleave", () => {
          k.style.background = "transparent";
        }));
      let A = document.createElement("input");
      ((A.type = "checkbox"),
        (A.checked = !0),
        (A.value = v.collectionId),
        (A.style.cssText =
          "width: 18px; height: 18px; accent-color: #FD1D1D; cursor: pointer; flex-shrink: 0;"),
        g.push(A));
      let x = document.createElement("div");
      x.style.cssText = "flex: 1; min-width: 0;";
      let T = document.createElement("div");
      ((T.style.cssText = `font-size: 14px; color: var(--ig-text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`),
        (T.textContent = v.collectionName));
      let V = document.createElement("div");
      ((V.style.cssText = `font-size: 12px; color: var(--ig-text-sec); margin-top: 2px;`),
        (V.textContent = _("dialog_collection_count", { count: v.mediaCount })),
        x.appendChild(T),
        x.appendChild(V),
        k.appendChild(A),
        k.appendChild(x),
        p.appendChild(k));
    }
    o.appendChild(p);
    function h() {
      ((f = g.every((v) => v.checked)),
        (u.textContent = f
          ? _("dialog_deselect_all")
          : _("dialog_select_all")));
    }
    u.addEventListener("click", () => {
      let v = !f;
      for (let k of g) k.checked = v;
      h();
    });
    for (let v of g) v.addEventListener("change", h);
    let y = document.createElement("div");
    ((y.style.cssText = "margin-bottom: 14px; flex-shrink: 0;"),
      (y.innerHTML = `
    <label style="${s}">${_("dialog_media_type")}</label>
    <select id="ig-saver-saved-filter" class="ig-saver-field">
      <option value="all">${_("dialog_media_all")}</option>
      <option value="photos">${_("dialog_media_photos")}</option>
      <option value="videos">${_("dialog_media_videos")}</option>
    </select>
  `),
      o.appendChild(y));
    let S = document.createElement("div");
    ((S.style.cssText = "margin-bottom: 14px; flex-shrink: 0; display: none;"),
      (S.innerHTML = `
    <label style="${s}">${_("dialog_saved_folder_mode")}</label>
    <select id="ig-saver-saved-folder-mode" class="ig-saver-field">
      <option value="grouped">${_("dialog_saved_folder_per_post")}</option>
      <option value="flat" selected>${_("dialog_saved_folder_per_collection")}</option>
    </select>
  `),
      o.appendChild(S));
    let filtrosDiv = document.createElement("div");
    ((filtrosDiv.style.cssText = "margin-bottom: 14px; flex-shrink: 0;"),
      (filtrosDiv.innerHTML = `
    <details id="ig-saver-filters-accordion">
      <summary>
        <span>🔍 ${_("dialog_filter_title")} (<span id="ig-saver-active-filters-count">0</span> ativos)</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="ig-saver-clean-filters-btn" style="display: none; color: #fa5252; font-size: 11px; font-weight: 600; cursor: pointer;">
            [${_("dialog_clean_filters") || "Limpar Filtros"}]
          </span>
          <span class="ig-saver-arrow" style="font-size: 10px; transition: transform 0.25s; display: inline-block;">▶</span>
        </div>
      </summary>
      <div style="padding: 14px; display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="${s}">${_("dialog_filter_hashtag")}</label>
          <input type="text" id="ig-saver-filter-hashtag" placeholder="ex: #surf" class="ig-saver-field">
        </div>
        <div>
          <label style="${s}">${_("dialog_filter_likes")}</label>
          <input type="number" id="ig-saver-filter-likes" min="0" placeholder="ex: 1000" class="ig-saver-field">
        </div>
        <div>
          <label style="${s}">${_("dialog_filter_views")}</label>
          <input type="number" id="ig-saver-filter-views" min="0" placeholder="ex: 5000" class="ig-saver-field">
        </div>
        <div>
          <label style="${s}">${_("dialog_filter_comments")}</label>
          <input type="number" id="ig-saver-filter-comments" min="0" placeholder="ex: 100" class="ig-saver-field">
        </div>
        <div>
          <label style="${s}">${_("dialog_filter_saves")}</label>
          <input type="number" id="ig-saver-filter-saves" min="0" placeholder="ex: 50" class="ig-saver-field">
        </div>
      </div>
    </details>
  `),
      o.appendChild(filtrosDiv));
    let estDiv = document.createElement("div");
    estDiv.id = "ig-saver-saved-estimate";
    estDiv.style.cssText = `font-size: 13px; color: ${n.textSecondary}; margin-bottom: 12px; font-weight: 500; text-align: center; margin-top: 10px;`;
    o.appendChild(estDiv);
    let E = document.createElement("div");
    ((E.style.cssText = "display: flex; gap: 10px; flex-shrink: 0;"),
      (E.innerHTML = `
    <button id="ig-saver-saved-start" class="ig-saver-btn-primary">${_("dialog_btn_start")}</button>
    <button id="ig-saver-saved-cancel" class="ig-saver-btn-secondary">${_("dialog_btn_cancel")}</button>
  `),
      o.appendChild(E),
      a.appendChild(o),
      document.body.appendChild(a));
    for (let v of a.querySelectorAll(
      "#ig-saver-saved-start, #ig-saver-saved-cancel",
    ))
      (v.addEventListener("mousedown", () => {
        v.style.transform = "scale(0.97)";
      }),
        v.addEventListener("mouseup", () => {
          v.style.transform = "scale(1)";
        }));
    function I() {
      ((o.style.transform = "scale(0.95) translateY(8px)"),
        (o.style.opacity = "0"),
        (a.style.opacity = "0"),
        setTimeout(() => a.remove(), 200));
    }
    (a.querySelector("#ig-saver-saved-cancel").addEventListener("click", I),
      a.addEventListener("click", (v) => {
        v.target === a && I();
      }));
    function updateSavedEstimate() {
      let valDiv = document.getElementById("ig-saver-saved-estimate");
      if (!valDiv) return;
      let checked = g.filter((T) => T.checked);
      let totalMedia = checked.reduce((sum, checkbox) => {
        let colId = checkbox.value;
        let col = e.find(c => c.collectionId === colId);
        return sum + (col ? col.mediaCount || 0 : 0);
      }, 0);
      let sec = totalMedia * 0.5;
      valDiv.textContent = `${_("dialog_estimate_prefix")} ${formatEstimate(sec)}`;
    }
    updateSavedEstimate();
    for (let checkbox of g) checkbox.addEventListener("change", updateSavedEstimate);
    u.addEventListener("click", () => setTimeout(updateSavedEstimate, 50));
    a.querySelector("#ig-saver-saved-start").addEventListener("click", () => {
        let v = g.filter((T) => T.checked);
        if (v.length === 0) return;
        let k = a.querySelector("#ig-saver-saved-filter").value,
          A = true, // Force flat folder mode
          x = v.map((T) => e.find(($e) => $e.collectionId === T.value));
        let minLikes = parseInt(a.querySelector("#ig-saver-filter-likes")?.value, 10) || 0;
        let minViews = parseInt(a.querySelector("#ig-saver-filter-views")?.value, 10) || 0;
        let minComments = parseInt(a.querySelector("#ig-saver-filter-comments")?.value, 10) || 0;
        let minSaves = parseInt(a.querySelector("#ig-saver-filter-saves")?.value, 10) || 0;
        let hashtag = a.querySelector("#ig-saver-filter-hashtag")?.value || "";
        (I(),
          x.length === 1
            ? ia(
                i,
                k,
                A,
                "saved_collection",
                x[0].collectionId,
                x[0].collectionName,
                x[0].collectionType,
                minLikes,
                minViews,
                minComments,
                hashtag,
                minSaves,
              )
            : qa(i, k, A, x, minLikes, minViews, minComments, hashtag, minSaves));
      });
      
    let cleanBtn = a.querySelector("#ig-saver-clean-filters-btn");
    if (cleanBtn) {
      cleanBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        clearAllFilters();
      });
    }
    let filterInputs = [
      "ig-saver-filter-hashtag", "ig-saver-filter-likes", 
      "ig-saver-filter-views", "ig-saver-filter-comments", 
      "ig-saver-filter-saves"
    ];
    for (let fid of filterInputs) {
      let el = a.querySelector("#" + fid);
      if (el) {
        el.addEventListener("input", () => {
          updateActiveFiltersBadge();
        });
      }
    }
    updateActiveFiltersBadge();
  }
  async function ia(
    i,
    e,
    t,
    n,
    a,
    o,
    r,
    minLikes = 0,
    minViews = 0,
    minComments = 0,
    hashtag = "",
    minSaves = 0,
  ) {
    console.log(
      `[Dog Saver][Content] startSavedDownload: username=${i}, filter=${e}, source=${n}, collectionId=${a}, collectionName="${o}"`,
    );
    try {
      let s = await w({
        type: "START_SAVED_DOWNLOAD",
        payload: {
          username: i,
          filter: e,
          flatFolder: t,
          source: n,
          collectionId: a,
          collectionName: o,
          collectionType: r,
          minLikes: minLikes,
          minViews: minViews,
          minComments: minComments,
          hashtag: hashtag,
          minSaves: minSaves,
        },
      });
      if (
        (console.log(
          "[Dog Saver][Content] startSavedDownload response:",
          JSON.stringify(s)?.slice(0, 300),
        ),
        s?.error)
      ) {
        (console.error(
          "[Dog Saver][Content] startSavedDownload error response:",
          s.error,
        ),
          m(_("notify_error", { message: s.error }), "error"));
        return;
      }
      let l = s.task;
      (console.log(
        `[Dog Saver][Content] startSavedDownload: task created, taskId=${l.taskId}`,
      ),
        (H = l.taskId),
        m(_("notify_started", { username: i }), "success"),
        he(l.taskId, i));
    } catch (s) {
      (console.error(
        "[Dog Saver][Content] startSavedDownload EXCEPTION:",
        s.message,
        s.stack,
      ),
        m(_("notify_error", { message: D(s.message) }), "error"));
    }
  }
  async function qa(
    i,
    e,
    t,
    n,
    minLikes = 0,
    minViews = 0,
    minComments = 0,
    hashtag = "",
    minSaves = 0,
  ) {
    console.log(
      `[Dog Saver][Content] startSavedDownloadAll: username=${i}, filter=${e}, collections=${n.length}:`,
      n.map((a) => `${a.collectionName}(${a.collectionId})`),
    );
    try {
      let a = await w({
        type: "START_SAVED_DOWNLOAD",
        payload: {
          username: i,
          filter: e,
          flatFolder: t,
          source: "saved_all",
          selectedCollections: n,
          minLikes: minLikes,
          minViews: minViews,
          minComments: minComments,
          hashtag: hashtag,
          minSaves: minSaves,
        },
      });
      if (
        (console.log(
          "[Dog Saver][Content] startSavedDownloadAll response:",
          JSON.stringify(a)?.slice(0, 300),
        ),
        a?.error)
      ) {
        (console.error(
          "[Dog Saver][Content] startSavedDownloadAll error response:",
          a.error,
        ),
          m(_("notify_error", { message: a.error }), "error"));
        return;
      }
      let o = a.task;
      (console.log(
        `[Dog Saver][Content] startSavedDownloadAll: task created, taskId=${o.taskId}`,
      ),
        (H = o.taskId),
        m(_("notify_started", { username: i }), "success"),
        he(o.taskId, i));
    } catch (a) {
      (console.error(
        "[Dog Saver][Content] startSavedDownloadAll EXCEPTION:",
        a.message,
        a.stack,
      ),
        m(_("notify_error", { message: D(a.message) }), "error"));
    }
  }
  function Za() {
    let i = document.querySelectorAll('div[role="button"], button');
    for (let e of i) {
      if (e.id?.startsWith("ig-saver")) continue;
      let t = e.querySelector("svg");
      if (!t) continue;
      if (t.querySelectorAll("circle").length >= 3) return e;
    }
    return null;
  }
  function Ua() {
    let i = document.querySelector("main");
    if (!i) return null;
    let e = i.querySelector("h3");
    if (!e) return null;
    let t = e.parentElement;
    for (let n = 0; t && t !== i && n < 6; n++) {
      let a = window.getComputedStyle(t);
      if (a.display.includes("flex") && a.flexDirection === "row") return t;
      t = t.parentElement;
    }
    return null;
  }
  function rt(i = 0) {
    if (document.getElementById("ig-saver-saved-col-btn") || !ee()) return;
    let e = dt();
    if (e) {
      let o = te(e.container),
        r = Ie(o);
      _t(e, r);
      return;
    }
    let t = ct();
    if (t) {
      let o = te(t),
        r = Re(t),
        s = Ie(o),
        l = document.createElement("div");
      ((l.style.cssText = `
      display: flex; align-items: stretch; align-self: stretch; flex-shrink: 0;
      ${r ? "" : "margin-left: 8px;"}
    `),
        l.appendChild(s),
        t.appendChild(l));
      return;
    }
    let n = Ua();
    if (n) {
      let o = Ie("8px");
      ((o.style.height = "32px"),
        (o.style.padding = "0 12px"),
        (o.style.fontSize = "13px"));
      let r = Za();
      if (r) {
        let l = r.parentElement;
        if (l && n.contains(l)) {
          ((l.style.display = l.style.display || "flex"),
            (l.style.alignItems = l.style.alignItems || "center"),
            (l.style.gap = l.style.gap || "8px"),
            l.insertBefore(o, r));
          return;
        }
      }
      let s = n.lastElementChild;
      s && s !== n.firstElementChild
        ? ((s.style.display = "flex"),
          (s.style.alignItems = "center"),
          (s.style.flexShrink = "0"),
          s.appendChild(o))
        : n.appendChild(o);
      return;
    }
    if (i < 5) {
      setTimeout(() => rt(i + 1), 500 + i * 200);
      return;
    }
    let a = Ie("8px");
    ((a.style.height = "32px"),
      (a.style.padding = "0 12px"),
      (a.style.fontSize = "13px"),
      (a.style.position = "fixed"),
      (a.style.bottom = "20px"),
      (a.style.right = "20px"),
      (a.style.zIndex = "10000"),
      document.body.appendChild(a));
  }
  function Ie(i = "62px") {
    let e = document.createElement("button");
    return (
      (e.id = "ig-saver-saved-col-btn"),
      (e.type = "button"),
      (e.style.cssText = `
    padding: 0 16px; height: 100%;
    background: #0095F6; color: #fff; border: none;
    border-radius: ${i};
    font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background 0.15s;
    display: flex; align-items: center; gap: 6px; white-space: nowrap;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 18px;
  `),
      (e.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>${_("btn_download_collection")}</span>
  `),
      e.addEventListener("mouseenter", () => {
        e.style.background = "#1877F2";
      }),
      e.addEventListener("mouseleave", () => {
        e.style.background = "#0095F6";
      }),
      e.addEventListener("click", () => Wa()),
      e
    );
  }
  function Wa() {
    let i = document.getElementById("ig-saver-dialog");
    i && i.remove();
    let e = L(),
      t = O(),
      n = Aa() ?? "",
      a = za(),
      o = document.createElement("div");
    ((o.id = "ig-saver-dialog"),
      (o.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${e.overlay}; z-index: 10001;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease;
  `),
      requestAnimationFrame(() => {
        o.style.opacity = "1";
      }));
    let r = document.createElement("div");
    ((r.style.cssText = `
    background: ${e.bg}; border-radius: 16px; padding: 28px;
    min-width: 340px; max-width: 400px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transform: scale(0.95) translateY(8px); opacity: 0;
    transition: transform 0.25s ease, opacity 0.25s ease;
  `),
      requestAnimationFrame(() => {
        ((r.style.transform = "scale(1) translateY(0)"),
          (r.style.opacity = "1"));
      }));
    let s = `width: 100%; padding: 10px 12px; border: 1px solid ${e.border}; border-radius: 8px; font-size: 14px; background: ${e.inputBg}; color: ${e.text}; cursor: pointer; transition: border-color 0.2s; outline: none;`,
      l = `font-size: 13px; color: ${e.textSecondary}; display: block; margin-bottom: 6px; font-weight: 500;`;
    ((r.innerHTML = `
    <h2 style="margin: 0 0 20px; font-size: 18px; color: ${e.text}; font-weight: 700; display: flex; align-items: center; gap: 8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#833AB4"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      ${_("btn_download_collection")}
    </h2>
    <div style="margin-bottom: 16px;">
      <label style="${l}">${_("dialog_media_type")}</label>
      <select id="ig-saver-saved-col-filter" class="ig-saver-field" style="${s}">
        <option value="all">${_("dialog_media_all")}</option>
        <option value="photos">${_("dialog_media_photos")}</option>
        <option value="videos">${_("dialog_media_videos")}</option>
      </select>
    </div>
    <details id="ig-saver-filters-accordion" style="margin-bottom: 16px; border: 1px solid ${e.border}; border-radius: 8px; overflow: hidden; background: ${e.bgSecondary}; text-align: left;">
      <summary style="font-size: 13px; font-weight: 600; color: ${e.text}; padding: 10px 12px; cursor: pointer; user-select: none; list-style: none; display: flex; align-items: center; justify-content: space-between; outline: none;">
        <span>🔍 ${_("dialog_filter_title")} (<span id="ig-saver-active-filters-count">0</span> ativos)</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="ig-saver-clean-filters-btn" style="display: none; color: #fa5252; font-size: 11px; font-weight: 600; cursor: pointer;">
            [${_("dialog_clean_filters") || "Limpar Filtros"}]
          </span>
          <span class="ig-saver-arrow" style="font-size: 10px; transition: transform 0.2s;">▶</span>
        </div>
      </summary>
      <div style="padding: 0 12px 12px; border-top: 1px solid ${e.border}; display: flex; flex-direction: column; gap: 10px;">
        <div style="margin-top: 10px;">
          <label style="${l}">${_("dialog_filter_hashtag")}</label>
          <input type="text" id="ig-saver-filter-hashtag" placeholder="ex: #surf" style="${s} box-sizing: border-box;">
        </div>
        <div>
          <label style="${l}">${_("dialog_filter_likes")}</label>
          <input type="number" id="ig-saver-filter-likes" min="0" placeholder="ex: 1000" style="${s} box-sizing: border-box;">
        </div>
        <div>
          <label style="${l}">${_("dialog_filter_views")}</label>
          <input type="number" id="ig-saver-filter-views" min="0" placeholder="ex: 5000" style="${s} box-sizing: border-box;">
        </div>
        <div>
          <label style="${l}">${_("dialog_filter_comments")}</label>
          <input type="number" id="ig-saver-filter-comments" min="0" placeholder="ex: 100" style="${s} box-sizing: border-box;">
        </div>
        <div>
          <label style="${l}">${_("dialog_filter_saves")}</label>
          <input type="number" id="ig-saver-filter-saves" min="0" placeholder="ex: 50" style="${s} box-sizing: border-box;">
        </div>
      </div>
    </details>
    <div id="ig-saver-saved-col-estimate" style="font-size: 13px; color: ${e.textSecondary}; margin-bottom: 12px; font-weight: 500; text-align: center; margin-top: 10px;"></div>
    <div style="display: flex; gap: 10px; margin-top: 10px;">
      <button id="ig-saver-saved-col-start" style="
        flex: 1; padding: 12px; background: linear-gradient(135deg, #833AB4, #FD1D1D);
        color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600;
        cursor: pointer; transition: opacity 0.2s, transform 0.1s;
      ">${_("dialog_btn_start")}</button>
      <button id="ig-saver-saved-col-cancel" style="
        flex: 1; padding: 12px; background: ${e.hoverBg};
        color: ${e.text}; border: none; border-radius: 10px; font-size: 14px; font-weight: 500;
        cursor: pointer; transition: background 0.2s, transform 0.1s;
      ">${_("dialog_btn_cancel")}</button>
    </div>
  `),
      o.appendChild(r),
      document.body.appendChild(o));
    let colEstDiv = document.getElementById("ig-saver-saved-col-estimate");
    if (colEstDiv) {
      colEstDiv.textContent = `${_("dialog_estimate_prefix")} ...`;
      (async () => {
        try {
          let p = await new j(t, "all").fetchCollections();
          let matched = (a ? p.find((f) => f.collectionId === a) : null) ??
                    (n === "all-posts" ? p.find(f => f.collectionType === "ALL_MEDIA_AUTO_COLLECTION") : null) ??
                    p.find(f => be(f.collectionName) === n || f.collectionName.toLowerCase().replace(/\s+/g, "-") === n.toLowerCase());
          if (matched && matched.mediaCount !== undefined) {
            let sec = matched.mediaCount * 0.5;
            colEstDiv.textContent = `${_("dialog_estimate_prefix")} ${formatEstimate(sec)}`;
          } else {
            colEstDiv.textContent = `${_("dialog_estimate_prefix")} ${_("dialog_estimate_unknown")}`;
          }
        } catch (err) {
          colEstDiv.textContent = `${_("dialog_estimate_prefix")} ${_("dialog_estimate_unknown")}`;
        }
      })();
    }
    for (let c of o.querySelectorAll(
      "#ig-saver-saved-col-start, #ig-saver-saved-col-cancel",
    ))
      (c.addEventListener("mouseenter", () => {
        c.style.opacity = "0.85";
      }),
        c.addEventListener("mouseleave", () => {
          c.style.opacity = "1";
        }),
        c.addEventListener("mousedown", () => {
          c.style.transform = "scale(0.97)";
        }),
        c.addEventListener("mouseup", () => {
          c.style.transform = "scale(1)";
        }));
    function d() {
      ((r.style.transform = "scale(0.95) translateY(8px)"),
        (r.style.opacity = "0"),
        (o.style.opacity = "0"),
        setTimeout(() => o.remove(), 200));
    }
    (o.querySelector("#ig-saver-saved-col-cancel").addEventListener("click", d),
      o.addEventListener("click", (c) => {
        c.target === o && d();
      }),
      o
        .querySelector("#ig-saver-saved-col-start")
        .addEventListener("click", async () => {
          let c = o.querySelector("#ig-saver-saved-col-filter").value;
          let minLikes = parseInt(o.querySelector("#ig-saver-filter-likes")?.value, 10) || 0;
          let minViews = parseInt(o.querySelector("#ig-saver-filter-views")?.value, 10) || 0;
          let minComments = parseInt(o.querySelector("#ig-saver-filter-comments")?.value, 10) || 0;
          let minSaves = parseInt(o.querySelector("#ig-saver-filter-saves")?.value, 10) || 0;
          let hashtag = o.querySelector("#ig-saver-filter-hashtag")?.value || "";
          (d(), m(_("notify_fetching_collections"), "success"));
          try {
            let p = await new j(t, c).fetchCollections(),
              g =
                (a ? p.find((f) => f.collectionId === a) : null) ??
                (n === "all-posts"
                  ? p.find(
                      (f) => f.collectionType === "ALL_MEDIA_AUTO_COLLECTION",
                    )
                  : null) ??
                p.find(
                  (f) =>
                    be(f.collectionName) === n ||
                    f.collectionName.toLowerCase().replace(/\s+/g, "-") ===
                      n.toLowerCase(),
                );
            if (!g) {
              m(_("notify_no_collections"), "error");
              return;
            }
            await ia(
              t,
              c,
              !0,
              "saved_collection",
              g.collectionId,
              g.collectionName,
              g.collectionType,
              minLikes,
              minViews,
              minComments,
              hashtag,
              minSaves,
            );
          } catch (u) {
            m(_("notify_error", { message: D(u.message) }), "error");
          }
        }));
  }

  function clearAllFilters() {
    let fH = document.getElementById("ig-saver-filter-hashtag");
    let fL = document.getElementById("ig-saver-filter-likes");
    let fV = document.getElementById("ig-saver-filter-views");
    let fC = document.getElementById("ig-saver-filter-comments");
    let fS = document.getElementById("ig-saver-filter-saves");
    if (fH) fH.value = "";
    if (fL) fL.value = "";
    if (fV) fV.value = "";
    if (fC) fC.value = "";
    if (fS) fS.value = "";
    updateActiveFiltersBadge();
    updateEstimatePreview();
  }

  function updateActiveFiltersBadge() {
    let count = 0;
    let hashtag = (document.getElementById("ig-saver-filter-hashtag")?.value || "").trim();
    let likes = (document.getElementById("ig-saver-filter-likes")?.value || "").trim();
    let views = (document.getElementById("ig-saver-filter-views")?.value || "").trim();
    let comments = (document.getElementById("ig-saver-filter-comments")?.value || "").trim();
    let saves = (document.getElementById("ig-saver-filter-saves")?.value || "").trim();

    if (hashtag) count++;
    if (likes && parseInt(likes, 10) > 0) count++;
    if (views && parseInt(views, 10) > 0) count++;
    if (comments && parseInt(comments, 10) > 0) count++;
    if (saves && parseInt(saves, 10) > 0) count++;

    let countSpan = document.getElementById("ig-saver-active-filters-count");
    let badge = document.getElementById("ig-saver-active-filters-badge");
    let trigger = document.getElementById("ig-saver-filters-trigger");
    let cleanBtn = document.getElementById("ig-saver-clean-filters-btn");
    
    if (countSpan) countSpan.textContent = String(count);
    if (badge) badge.textContent = `${count} ativo${count === 1 ? '' : 's'}`;
    if (trigger) trigger.classList.toggle("has-filters", count > 0);
    if (cleanBtn) cleanBtn.style.display = count > 0 ? "inline-flex" : "none";
  }

  function Va() {
    if (!ee()) return;
    let i = O(),
      e = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
    for (let t of e) {
      let a = (t.getAttribute("href") ?? "").includes("/reel/"),
        o = a ? pt(t) : ut(t);
      if (!o || t.hasAttribute("data-ig-saver-processed")) continue;
      t.setAttribute("data-ig-saver-processed", o);
      let r = t.parentElement;
      for (let l = 0; l < 3 && r; l++) {
        let d = window.getComputedStyle(r).position;
        if (d === "relative" || d === "absolute") break;
        r.parentElement && (r = r.parentElement);
      }
      if (!r) continue;
      r.setAttribute("data-ig-saver-post-btn", o);
      let s = document.createElement("button");
      ((s.type = "button"),
        s.setAttribute("aria-label", _("aria_download_post_zip")),
        (s.style.cssText = `
      position: absolute; top: 8px; left: 8px; z-index: 10;
      width: 32px; height: 32px; padding: 0;
      background: rgba(0, 0, 0, 0.65); color: white; border: none;
      border-radius: 50%; cursor: pointer; opacity: 0;
      transition: opacity 0.2s;
      display: flex; align-items: center; justify-content: center;
    `),
        (s.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `),
        r.addEventListener("mouseenter", () => {
          s.style.opacity = "1";
        }),
        r.addEventListener("mouseleave", () => {
          s.style.opacity = "0";
        }),
        s.addEventListener("click", (l) => {
          (l.preventDefault(), l.stopPropagation(), ht(i, o, s, a));
        }),
        (r.style.position = r.style.position || "relative"),
        r.insertBefore(s, r.firstChild));
    }
  }
  function Ee() {
    (document.getElementById("ig-saver-saved-btn")?.remove(),
      document.getElementById("ig-saver-saved-col-btn")?.remove());
  }
  var Te = null;
  function je() {
    J() &&
      (Te && clearTimeout(Te),
      (Te = setTimeout(() => {
        ((Te = null), Ga());
      }, 300)));
  }
  var Ae = null;
  function Xe() {
    ee() &&
      (Ae && clearTimeout(Ae),
      (Ae = setTimeout(() => {
        ((Ae = null), Va());
      }, 300)));
  }
  function Ka() {
    return `<span class="ig-saver-pro-badge" style="
    margin-left: 6px; padding: 1px 6px; font-size: 10px; font-weight: 700;
    background: linear-gradient(135deg, #833AB4, #FD1D1D); color: #fff;
    border-radius: 4px; vertical-align: middle; letter-spacing: 0.3px;
  ">PRO</span>`;
  }
  async function ja() {
    let i = !0;
    try {
      let r = await xe();
      i = Se(r);
    } catch {
      return;
    }
    if (i) return;
    let e = (r) => () => Z({ reason: r, getTheme: L });
    {
      let r = document.getElementById("ig-saver-include-highlights");
      if (r) {
        ((r.checked = !1), (r.disabled = !0));
        let s = r.parentElement?.querySelector("span");
        s &&
          !s.querySelector(".ig-saver-pro-badge") &&
          s.insertAdjacentHTML("beforeend", Ka());
        let l = r.parentElement;
        l &&
          ((l.style.cursor = "pointer"),
          l.addEventListener("click", (d) => {
            (d.preventDefault(), e("extras")());
          }));
      }
    }
    let t = document.getElementById("ig-saver-strategy");
    if (t) {
      let r = t.querySelector('option[value="range"]');
      (r &&
        ((r.textContent = `${r.textContent} \u2A2F PRO`), (r.disabled = !0)),
        t.value === "range" && (t.value = "all"));
    }
    let n = document.getElementById("ig-saver-ndays");
    if (n) {
      for (let r of ["90", "180"]) {
        let s = n.querySelector(`option[value="${r}"]`);
        s &&
          ((s.textContent = `${s.textContent} \u2A2F PRO`), (s.disabled = !0));
      }
      (n.value === "90" || n.value === "180") && (n.value = "30");
    }
    if (t) {
      let r = t.querySelector('option[value="all"]');
      if (r) {
        let s = await jt(),
          l = Math.max(0, Vt - s),
          d = _("dialog_range_all");
        l > 0
          ? (r.textContent = _("dialog_range_all_trial_remaining", {
              base: d,
              remaining: String(l),
            }))
          : ((r.textContent = `${d} \u2A2F PRO`),
            (r.disabled = !0),
            t.value === "all" && (t.value = "lastNDays"));
      }
    }
    let a = document.getElementById("ig-saver-topk-value");
    a &&
      ((a.max = String(Y)),
      Number(a.value) > Y && (a.value = String(Y)),
      a.addEventListener("input", () => {
        Number(a.value) > Y && ((a.value = String(Y)), e("topK")());
      }));
    let o = document.getElementById("ig-saver-dialog")?.firstElementChild;
    if (o && !o.querySelector(".ig-saver-pro-hint")) {
      let r = L(),
        s = document.createElement("div");
      ((s.className = "ig-saver-pro-hint"),
        (s.style.cssText = `margin-top: 12px; padding-top: 12px; border-top: 1px solid ${r.border}; font-size: 12px; color: ${r.textSecondary}; text-align: center;`),
        (s.innerHTML = `
      <span>${_("upgrade_subtitle")}</span>
      <a href="#" id="ig-saver-pro-upgrade-link" style="color: #833AB4; font-weight: 600; margin-left: 6px;">${_("license_btn_get_pro")} \u2192</a>
    `));
      let l = o.querySelector('div[style*="margin-top: 20px"]');
      (l && l.parentElement?.insertBefore(s, l),
        document
          .getElementById("ig-saver-pro-upgrade-link")
          ?.addEventListener("click", (d) => {
            (d.preventDefault(), e("generic")());
          }));
    }
  }
  function getProfilePostCount() {
    let elements = document.querySelectorAll('header span, header li, header button, main header li span');
    for (let el of elements) {
      let text = el.textContent || "";
      if (/\d+([.,]\d+)?\s*(k|m)?\s*(posts|publicações|publicaciones|publications|gönderi|投稿|게시물)/i.test(text)) {
        let match = text.match(/([\d.,]+)\s*(k|m)?/i);
        if (match) {
          let numStr = match[1].replace(/[.,]/g, '');
          let val = parseInt(numStr, 10) || 0;
          let suffix = (match[2] || "").toLowerCase();
          if (suffix === 'k') val *= 1000;
          if (suffix === 'm') val *= 1000000;
          return val;
        }
      }
    }
    return null;
  }
  function estimatePosts() {
    let strategySelect = document.getElementById("ig-saver-strategy");
    if (!strategySelect) return null;
    let strategy = strategySelect.value || "all";
    let singleInput = document.getElementById("ig-saver-singleprofile-input");
    let targetUsername = singleInput ? (singleInput.value || "").trim() : O();

    let totalPosts = (window.ig_saver_fetched_post_counts && window.ig_saver_fetched_post_counts[targetUsername.toLowerCase()] !== undefined)
                     ? window.ig_saver_fetched_post_counts[targetUsername.toLowerCase()]
                     : getProfilePostCount();

    let perProfilePosts = null;
    if (strategy === "topk") {
      perProfilePosts = parseInt(document.getElementById("ig-saver-topk-value")?.value, 10) || 0;
    } else if (strategy === "lastNDays") {
      let daysSelect = document.getElementById("ig-saver-ndays");
      let days = daysSelect ? parseInt(daysSelect.value, 10) : 0;
      let est = Math.round(days * 0.8);
      perProfilePosts = (totalPosts !== null) ? Math.min(totalPosts, est) : est;
    } else if (strategy === "range") {
      let fromVal = document.getElementById("ig-saver-from")?.value;
      let toVal = document.getElementById("ig-saver-to")?.value;
      if (fromVal && toVal) {
        let diffMs = new Date(toVal + "T23:59:59").getTime() - new Date(fromVal + "T00:00:00").getTime();
        let diffDays = Math.max(0, diffMs / 864e5);
        let est = Math.round(diffDays * 0.8);
        perProfilePosts = (totalPosts !== null) ? Math.min(totalPosts, est) : est;
      }
    } else {
      perProfilePosts = totalPosts;
    }

    if (perProfilePosts === null) {
      perProfilePosts = 100;
    }

    return perProfilePosts;
  }
  function formatEstimate(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) {
      return _("dialog_estimate_unknown");
    }
    if (seconds < 60) {
      return _("dialog_estimate_seconds", { count: Math.max(1, Math.round(seconds)) });
    }
    let minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return _("dialog_estimate_minutes", { count: minutes });
    }
    let hours = Math.round(minutes / 60);
    return _("dialog_estimate_hours", { count: hours });
  }
  function updateEstimatePreview() {
    let posts = estimatePosts();
    let postsEl = document.getElementById("ig-saver-card-posts");
    let estEl = document.getElementById("ig-saver-card-estimate");
    let confirmEstEl = document.getElementById("ig-saver-confirm-val-est");
    
    if (posts === null || posts === undefined || isNaN(posts)) {
      if (estEl) estEl.textContent = "";
      return;
    }
    let sec = posts * 0.8;
    let sizeMb = posts * 2;
    let sizeStr = sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;
    let timeStr = formatEstimate(sec);

    let cleanTime = timeStr.replace(/^[~≈\s]+/, "");
    if (postsEl) postsEl.textContent = `${posts} posts`;
    if (estEl) estEl.textContent = `~${sizeStr} • ~${cleanTime}`;
    if (confirmEstEl) confirmEstEl.textContent = `~${posts} posts (~${sizeStr}) • ~${cleanTime}`;

    let estDiv = document.getElementById("ig-saver-estimate-preview");
    if (estDiv) estDiv.textContent = "";
  }

  async function fetchProfileCardData(username) {
    try {
      let t = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        {
          credentials: "include",
          headers: oe(`https://www.instagram.com/${username}/`),
        }
      );
      if (!t.ok) return null;
      let n = await P(t);
      let user = n?.data?.user;
      if (!user) return null;
      return {
        username: user.username,
        fullName: user.full_name,
        profilePic: user.profile_pic_url,
        postCount: user.edge_owner_to_timeline_media?.count ?? 0,
      };
    } catch {
      return null;
    }
  }

  function scrapeCurrentProfileData() {
    let u = O();
    let img = document.querySelector('header img[alt*="profile"], header img[alt*="perfil"]');
    let avatarUrl = img ? img.src : null;
    
    let nameEl = document.querySelector('header section h2, header section h1, header h2');
    let fullName = "";
    if (nameEl) {
      let sibs = nameEl.parentElement?.children;
      if (sibs) {
        for (let child of sibs) {
          if (child !== nameEl && child.textContent && child.textContent.length > 0 && !child.querySelector('button') && !child.querySelector('a')) {
            fullName = child.textContent;
            break;
          }
        }
      }
    }
    
    let postCount = getProfilePostCount();
    
    if (avatarUrl || fullName || postCount) {
      return {
        username: u,
        fullName: fullName || u,
        profilePic: avatarUrl || "https://www.instagram.com/static/images/web/logged_out_wordmark.png/112dba0e8d85.png",
        postCount: postCount || 0
      };
    }
    return null;
  }

  async function getProfileInfo(username) {
    let current = O();
    if (username.toLowerCase() === current.toLowerCase()) {
      let scraped = scrapeCurrentProfileData();
      if (scraped) return scraped;
    }
    return await fetchProfileCardData(username);
  }

  async function saveToHistory(usernames) {
    try {
      let { ig_saver_recent_profiles } = await chrome.storage.local.get("ig_saver_recent_profiles");
      let history = ig_saver_recent_profiles || [];
      
      for (let u of usernames) {
        let clean = u.trim().replace(/^@/, "");
        if (!clean) continue;
        history = history.filter(h => h.toLowerCase() !== clean.toLowerCase());
        history.unshift(clean);
      }
      
      history = history.slice(0, 5);
      await chrome.storage.local.set({ ig_saver_recent_profiles: history });
    } catch {}
  }

  async function renderHistoryChips() {
    let container = document.getElementById("ig-saver-chips-container");
    if (!container) return;
    try {
      let { ig_saver_recent_profiles } = await chrome.storage.local.get("ig_saver_recent_profiles");
      let history = ig_saver_recent_profiles || [];
      if (history.length === 0) {
        container.style.display = "none";
        return;
      }
      container.style.display = "flex";
      container.innerHTML = history.map(u => `<span class="ig-saver-chip" data-user="${u}">@${u}</span>`).join("");
      
      for (let chip of container.querySelectorAll(".ig-saver-chip")) {
        chip.addEventListener("click", () => {
          let u = chip.getAttribute("data-user");
          let singleInput = document.getElementById("ig-saver-singleprofile-input");
          if (singleInput) {
            singleInput.value = u;
            runValidation(u);
            checkOnlyNewMode(u);
          }
          updateEstimatePreview();
        });
      }
    } catch {}
  }

  async function renderFavoriteProfiles() {
    let row = document.getElementById("ig-saver-favorites-row"),
      container = document.getElementById("ig-saver-favorites-container"),
      toggle = document.getElementById("ig-saver-favorites-toggle");
    if (!row || !container || !toggle) return;
    try {
      let favorites = await getFavoriteProfiles();
      if (favorites.length === 0) {
        ((row.style.display = "none"),
          (container.innerHTML = ""),
          (toggle.hidden = !0));
        return;
      }
      ((row.style.display = "block"),
        row.classList.remove("is-expanded"),
        (container.innerHTML = ""),
        (toggle.hidden = !0),
        (toggle.title = "Mostrar todos os favoritos"),
        toggle.setAttribute("aria-expanded", "false"));
      for (let username of favorites) {
        let chip = document.createElement("button");
        ((chip.type = "button"),
          (chip.className = "ig-saver-chip ig-saver-favorite-chip"),
          (chip.dataset.user = username),
          (chip.title = `Abrir @${username}`),
          (chip.innerHTML = `<span aria-hidden="true" style="color:#f5b301;">&#9733;</span> @${username}`),
          chip.addEventListener("click", () => {
            window.location.assign(
              `https://www.instagram.com/${encodeURIComponent(username)}/`,
            );
          }),
          container.appendChild(chip));
      }
      requestAnimationFrame(() => {
        toggle.hidden = container.scrollWidth <= container.clientWidth + 1;
      });
    } catch {}
  }

  function updateActiveFiltersBadge() {
    let hashtag = document.getElementById("ig-saver-filter-hashtag")?.value || "";
    let likes = document.getElementById("ig-saver-filter-likes")?.value || "";
    let views = document.getElementById("ig-saver-filter-views")?.value || "";
    let comments = document.getElementById("ig-saver-filter-comments")?.value || "";
    let saves = document.getElementById("ig-saver-filter-saves")?.value || "";
    
    let count = 0;
    if (hashtag) count++;
    if (likes) count++;
    if (views) count++;
    if (comments) count++;
    if (saves) count++;
    
    let badge = document.getElementById("ig-saver-active-filters-count");
    if (badge) badge.textContent = String(count);
    
    let cleanBtn = document.getElementById("ig-saver-clean-filters-btn");
    if (cleanBtn) {
      cleanBtn.style.display = count > 0 ? "inline" : "none";
    }
  }
  
  function clearAllFilters() {
    if (document.getElementById("ig-saver-filter-hashtag")) document.getElementById("ig-saver-filter-hashtag").value = "";
    if (document.getElementById("ig-saver-filter-likes")) document.getElementById("ig-saver-filter-likes").value = "";
    if (document.getElementById("ig-saver-filter-views")) document.getElementById("ig-saver-filter-views").value = "";
    if (document.getElementById("ig-saver-filter-comments")) document.getElementById("ig-saver-filter-comments").value = "";
    if (document.getElementById("ig-saver-filter-saves")) document.getElementById("ig-saver-filter-saves").value = "";
    updateActiveFiltersBadge();
    updateEstimatePreview();
  }

  async function markProfileDownloaded(username) {
    try {
      let { ig_saver_last_downloads } = await chrome.storage.local.get("ig_saver_last_downloads");
      let lastDownloads = ig_saver_last_downloads || {};
      lastDownloads[username.toLowerCase()] = Math.floor(Date.now() / 1000);
      await chrome.storage.local.set({ ig_saver_last_downloads: lastDownloads });
    } catch {}
  }

  async function checkOnlyNewMode(username) {
    let row = document.getElementById("ig-saver-only-new-row");
    if (!row) return;
    if (!username) {
      row.style.display = "none";
      return;
    }
    try {
      let { ig_saver_last_downloads } = await chrome.storage.local.get("ig_saver_last_downloads");
      let lastDownloads = ig_saver_last_downloads || {};
      let lastTime = lastDownloads[username.toLowerCase()];
      if (lastTime) {
        let dateStr = new Date(lastTime * 1000).toLocaleDateString();
        row.style.display = "flex";
        let label = row.querySelector(".ig-saver-only-new-label");
        if (label) {
          label.textContent = _("dialog_only_new_date", { date: dateStr }) || `Só novos desde ${dateStr}`;
        }
        row.setAttribute("data-timestamp", String(lastTime));
      } else {
        row.style.display = "none";
        let toggle = document.getElementById("ig-saver-only-new-toggle");
        if (toggle) toggle.checked = false;
      }
    } catch {
      row.style.display = "none";
    }
  }

  function clearProfileCard() {
    let indicator = document.getElementById("ig-saver-validation-indicator");
    let cardContainer = document.getElementById("ig-saver-profile-card-container");
    let input = document.getElementById("ig-saver-singleprofile-input");
    if (input) input.style.borderColor = "var(--ig-border)";
    if (indicator) indicator.textContent = "";
    if (cardContainer) cardContainer.innerHTML = "";
  }

  let validationTimeout = null;
  function runValidation(username) {
    if (!username) {
      clearProfileCard();
      return;
    }
    
    let indicator = document.getElementById("ig-saver-validation-indicator");
    let cardContainer = document.getElementById("ig-saver-profile-card-container");
    let input = document.getElementById("ig-saver-singleprofile-input");
    if (!input) return;
    
    if (indicator) {
      indicator.style.color = "var(--ig-text-sec)";
      indicator.textContent = _("dialog_validation_searching") || "Buscando...";
    }
    
    if (validationTimeout) clearTimeout(validationTimeout);
    validationTimeout = setTimeout(async () => {
      let info = await getProfileInfo(username);
      if (info) {
        if (input.style) input.style.borderColor = "#2db742";
        if (indicator) {
          indicator.style.color = "#2db742";
          indicator.textContent = "✓";
        }
        
        if (cardContainer) {
          cardContainer.innerHTML = `
            <div class="ig-saver-profile-card">
              <img class="ig-saver-profile-avatar" src="${info.profilePic}" alt="avatar">
              <div class="ig-saver-profile-info">
                <div class="ig-saver-profile-name">${info.fullName || info.username}</div>
                <div class="ig-saver-profile-handle">@${info.username}</div>
              </div>
              <div class="ig-saver-profile-meta-wrap">
                <span class="ig-saver-profile-posts" id="ig-saver-card-posts">${info.postCount} posts</span>
                <span class="ig-saver-profile-sub" id="ig-saver-card-estimate">Calculando...</span>
              </div>
            </div>
          `;
        }
        
        window.ig_saver_fetched_post_counts = window.ig_saver_fetched_post_counts || {};
        window.ig_saver_fetched_post_counts[username.toLowerCase()] = info.postCount;
        updateEstimatePreview();
        
      } else {
        if (input.style) input.style.borderColor = "#fa5252";
        if (indicator) {
          indicator.style.color = "#fa5252";
          indicator.textContent = _("dialog_validation_not_found") || "Não encontrado";
        }
        if (cardContainer) {
          cardContainer.innerHTML = `
            <div class="ig-saver-profile-card">
              <div class="ig-saver-profile-info">
                <div class="ig-saver-profile-name">@${username}</div>
                <div class="ig-saver-profile-handle">Perfil Atual</div>
              </div>
              <div class="ig-saver-profile-meta-wrap">
                <span class="ig-saver-profile-posts" id="ig-saver-card-posts">Posts</span>
                <span class="ig-saver-profile-sub" id="ig-saver-card-estimate"></span>
              </div>
            </div>
          `;
        }
      }
    }, 150);
  }
  function injectDialogStyles() {
    if (document.getElementById("ig-saver-dialog-styles")) return;
    let style = document.createElement("style");
    style.id = "ig-saver-dialog-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap');

      :root, .ig-saver-dialog-root {
        --ig-bg: #ffffff !important;
        --ig-bg-glass: rgba(255, 255, 255, 0.98) !important;
        --ig-text: #1d1d1f !important;
        --ig-text-sec: #86868b !important;
        --ig-border: #e8e8ed !important;
        --ig-input-bg: #f5f5f7 !important;
        --ig-hover-bg: #f5f5f7 !important;
        --ig-slider-bg: #d2d2d7 !important;
        --ig-overlay: rgba(0, 0, 0, 0.45) !important;
      }

      /* Global resets and typography stack */
      .ig-saver-dialog-root, 
      #ig-saver-upgrade-dialog,
      #ig-saver-reload-banner,
      #ig-saver-btn {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro", "SF Pro Display", 'Inter', system-ui, sans-serif !important;
        -webkit-font-smoothing: antialiased !important;
      }

      /* Injected profile download button (Apple Pill style) */
      #ig-saver-btn {
        background-color: #0071e3 !important;
        color: #ffffff !important;
        border-radius: 9999px !important;
        border: none !important;
        font-weight: 600 !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.2) !important;
        transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s !important;
      }
      #ig-saver-btn:hover {
        background-color: #0077ed !important;
        transform: scale(1.02) !important;
        box-shadow: 0 6px 16px rgba(0, 113, 227, 0.3) !important;
      }
      #ig-saver-btn:active {
        transform: scale(0.98) !important;
      }

      /* Modal Background Overlay */
      #ig-saver-dialog {
        background: var(--ig-overlay) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
      }

      /* Clean Apple-style Card (Fixed without scroll) */
      .ig-saver-glass-card {
        background: #ffffff !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 18px !important;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.16) !important;
        transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s !important;
        padding: 14px 16px !important;
        width: 370px !important;
        max-width: 92vw !important;
        overflow: visible !important;
        box-sizing: border-box !important;
        color: #1d1d1f !important;
      }

      /* Hide background neon meshes */
      .ig-saver-bg-mesh {
        display: none !important;
      }

      /* Premium Title and Header */
      .ig-saver-title {
        margin: 0 !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        color: #1d1d1f !important;
        background: none !important;
        -webkit-background-clip: initial !important;
        -webkit-text-fill-color: initial !important;
        letter-spacing: -0.02em !important;
      }

      /* Profile Card (ViralDog / Apple Clean Card) */
      .ig-saver-profile-card {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 10px 12px !important;
        background: #f5f5f7 !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 14px !important;
      }
      .ig-saver-profile-avatar {
        width: 40px !important;
        height: 40px !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        border: 1.5px solid #ffffff !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
        flex-shrink: 0 !important;
      }
      .ig-saver-profile-info {
        flex: 1 !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
      }
      .ig-saver-profile-name {
        font-weight: 700 !important;
        font-size: 13.5px !important;
        color: #1d1d1f !important;
        line-height: 1.25 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .ig-saver-profile-handle {
        font-size: 12px !important;
        color: #86868b !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .ig-saver-profile-meta-wrap {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-end !important;
        gap: 3px !important;
        margin-left: auto !important;
        flex-shrink: 0 !important;
      }
      .ig-saver-profile-posts {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #0071e3 !important;
        background: rgba(0, 113, 227, 0.08) !important;
        padding: 3px 9px !important;
        border-radius: 9999px !important;
        white-space: nowrap !important;
        line-height: 1.2 !important;
      }
      .ig-saver-profile-sub {
        font-size: 11px !important;
        color: #86868b !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
        line-height: 1.2 !important;
      }

      /* Side Flyout Card and Filters Button */
      .ig-saver-filters-trigger-btn {
        width: 100% !important;
        height: 38px !important;
        padding: 0 12px !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        background: #f5f5f7 !important;
        color: #1d1d1f !important;
        font-size: 12.5px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        box-sizing: border-box !important;
        transition: all 0.2s ease !important;
      }
      .ig-saver-filters-trigger-btn:hover {
        background: #ebebeb !important;
        border-color: #dcdce0 !important;
      }
      .ig-saver-filters-trigger-btn.is-active {
        border-color: #0071e3 !important;
        background: #ffffff !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12) !important;
      }
      .ig-saver-filters-trigger-btn .ig-saver-arrow {
        font-size: 10px !important;
        color: #86868b !important;
        transition: transform 0.2s ease !important;
      }
      .ig-saver-filters-trigger-btn.is-active .ig-saver-arrow {
        transform: rotate(90deg) !important;
        color: #0071e3 !important;
      }
      .ig-saver-filter-count-badge {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #86868b !important;
        background: rgba(0, 0, 0, 0.05) !important;
        padding: 2px 8px !important;
        border-radius: 9999px !important;
      }
      .ig-saver-filters-trigger-btn.has-filters .ig-saver-filter-count-badge {
        color: #0071e3 !important;
        background: rgba(0, 113, 227, 0.12) !important;
        font-weight: 700 !important;
      }

      .ig-saver-filters-flyout {
        display: none;
        width: 290px !important;
        background: #ffffff !important;
        border-radius: 20px !important;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.16) !important;
        border: 1px solid #e8e8ed !important;
        padding: 16px 18px !important;
        box-sizing: border-box !important;
        animation: igSaverFlyoutSlide 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
        z-index: 10003 !important;
        overflow: visible !important;
      }
      .ig-saver-filters-flyout.is-open {
        display: flex !important;
        flex-direction: column !important;
      }
      @keyframes igSaverFlyoutSlide {
        from { opacity: 0; transform: translateX(-12px) scale(0.96); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      .ig-saver-flyout-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-bottom: 10px !important;
        border-bottom: 1px solid #e8e8ed !important;
        margin-bottom: 12px !important;
      }
      .ig-saver-clean-filters-pill {
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        padding: 3px 8px !important;
        border-radius: 9999px !important;
        border: 1px solid rgba(255, 59, 48, 0.2) !important;
        background: rgba(255, 59, 48, 0.08) !important;
        color: #ff3b30 !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        user-select: none !important;
      }
      .ig-saver-clean-filters-pill:hover {
        background: rgba(255, 59, 48, 0.16) !important;
        border-color: #ff3b30 !important;
        transform: translateY(-1px) !important;
      }
      .ig-saver-clean-filters-pill:active {
        transform: scale(0.96) !important;
      }
      .ig-saver-flyout-close-btn {
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
        border: none !important;
        background: #f5f5f7 !important;
        color: #86868b !important;
        font-size: 17px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
        transition: all 0.15s ease !important;
      }
      .ig-saver-flyout-close-btn:hover {
        background: #e8e8ed !important;
        color: #1d1d1f !important;
      }

      /* Modern inputs, textarea, select */
      .ig-saver-field {
        width: 100%;
        padding: 10px 14px !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        font-size: 13.5px !important;
        font-family: inherit !important;
        background: #f5f5f7 !important;
        color: #1d1d1f !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
        outline: none !important;
        box-sizing: border-box !important;
      }

      .ig-saver-field:focus {
        border-color: #0071e3 !important;
        background: #ffffff !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15) !important;
      }

      /* Hide native browser spinners */
      input[type="number"].ig-saver-field::-webkit-inner-spin-button,
      input[type="number"].ig-saver-field::-webkit-outer-spin-button,
      .ig-saver-stepper-input::-webkit-inner-spin-button,
      .ig-saver-stepper-input::-webkit-outer-spin-button {
        -webkit-appearance: none !important;
        margin: 0 !important;
      }
      input[type="number"].ig-saver-field,
      .ig-saver-stepper-input {
        -moz-appearance: textfield !important;
        appearance: textfield !important;
      }

      /* Custom dropdown style */
      select.ig-saver-field {
        appearance: none !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2386868b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
        background-repeat: no-repeat !important;
        background-position: right 14px center !important;
        background-size: 14px !important;
        padding-right: 36px !important;
        cursor: pointer !important;
      }

      select.ig-saver-field option {
        background-color: #ffffff !important;
        color: #1d1d1f !important;
      }

      /* Segmented Control Pill Group (Apple /DESIGN) */
      .ig-saver-segmented-group {
        display: flex !important;
        background: #f5f5f7 !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        padding: 3px !important;
        gap: 4px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .ig-saver-segment-btn {
        flex: 1 !important;
        height: 34px !important;
        border: none !important;
        border-radius: 9px !important;
        background: transparent !important;
        color: #86868b !important;
        font-size: 12.5px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        outline: none !important;
        user-select: none !important;
      }
      .ig-saver-segment-btn:hover:not(.active) {
        color: #1d1d1f !important;
        background: rgba(0, 0, 0, 0.04) !important;
      }
      .ig-saver-segment-btn.active {
        background: #ffffff !important;
        color: #0071e3 !important;
        font-weight: 700 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      }

      /* Stepper Numeric Control (ViralDog / Apple pattern) */
      .ig-saver-stepper {
        display: flex !important;
        align-items: center !important;
        background: #f5f5f7 !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
      }
      .ig-saver-stepper:focus-within {
        border-color: #0071e3 !important;
        background: #ffffff !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15) !important;
      }
      .ig-saver-stepper-btn {
        width: 40px !important;
        height: 38px !important;
        border: none !important;
        background: transparent !important;
        color: #1d1d1f !important;
        font-size: 18px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: background 0.15s, color 0.15s !important;
        user-select: none !important;
        flex-shrink: 0 !important;
      }
      .ig-saver-stepper-btn:hover {
        background: rgba(0, 0, 0, 0.06) !important;
        color: #0071e3 !important;
      }
      .ig-saver-stepper-btn:active {
        background: rgba(0, 0, 0, 0.1) !important;
      }
      .ig-saver-stepper-input {
        flex: 1 !important;
        min-width: 0 !important;
        height: 38px !important;
        padding: 0 10px !important;
        border: none !important;
        border-left: 1px solid #e8e8ed !important;
        border-right: 1px solid #e8e8ed !important;
        background: transparent !important;
        color: #1d1d1f !important;
        font-size: 13.5px !important;
        font-weight: 600 !important;
        text-align: center !important;
        outline: none !important;
      }

      /* Custom Select Dropdown (Apple /DESIGN) */
      .ig-saver-custom-select {
        position: relative !important;
        width: 100% !important;
      }
      .ig-saver-custom-select-trigger {
        width: 100% !important;
        height: 42px !important;
        padding: 0 14px !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        font-size: 13.5px !important;
        font-family: inherit !important;
        font-weight: 500 !important;
        background: #f5f5f7 !important;
        color: #1d1d1f !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        cursor: pointer !important;
        outline: none !important;
        box-sizing: border-box !important;
        transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s !important;
      }
      .ig-saver-custom-select-trigger:hover {
        background: #ebebeb !important;
      }
      .ig-saver-custom-select.is-open .ig-saver-custom-select-trigger,
      .ig-saver-custom-select-trigger:focus {
        border-color: #0071e3 !important;
        background: #ffffff !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15) !important;
      }
      .ig-saver-custom-select-trigger .ig-saver-chevron {
        color: #86868b !important;
        transition: transform 0.2s ease !important;
        flex-shrink: 0 !important;
      }
      .ig-saver-custom-select.is-open .ig-saver-custom-select-trigger .ig-saver-chevron {
        transform: rotate(180deg) !important;
        color: #0071e3 !important;
      }
      .ig-saver-custom-select-menu {
        display: none !important;
        position: absolute !important;
        top: calc(100% + 6px) !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 10002 !important;
        background: #ffffff !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 14px !important;
        padding: 6px !important;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.05) !important;
        flex-direction: column !important;
        gap: 2px !important;
        animation: igSaverScaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .ig-saver-custom-select.is-open .ig-saver-custom-select-menu {
        display: flex !important;
      }
      @keyframes igSaverScaleIn {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .ig-saver-select-option {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 9px 12px !important;
        border-radius: 9px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #1d1d1f !important;
        cursor: pointer !important;
        transition: background 0.15s ease, color 0.15s ease !important;
        user-select: none !important;
      }
      .ig-saver-select-option:hover {
        background: #f5f5f7 !important;
        color: #0071e3 !important;
      }
      .ig-saver-select-option.active {
        background: rgba(0, 113, 227, 0.08) !important;
        color: #0071e3 !important;
        font-weight: 600 !important;
      }
      .ig-saver-select-option .ig-saver-check {
        color: #0071e3 !important;
        flex-shrink: 0 !important;
      }

      /* Apple-Style Unified Date Range Picker & Calendar Popover */
      .ig-saver-daterange-picker {
        position: relative !important;
        width: 100% !important;
      }
      .ig-saver-daterange-trigger {
        width: 100% !important;
        height: 42px !important;
        padding: 0 14px !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 12px !important;
        font-family: inherit !important;
        background: #f5f5f7 !important;
        color: #1d1d1f !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        cursor: pointer !important;
        outline: none !important;
        box-sizing: border-box !important;
        transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s !important;
      }
      .ig-saver-daterange-trigger:hover {
        background: #ebebeb !important;
      }
      .ig-saver-daterange-picker.is-open .ig-saver-daterange-trigger,
      .ig-saver-daterange-trigger:focus {
        border-color: #0071e3 !important;
        background: #ffffff !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.15) !important;
      }
      .ig-saver-daterange-trigger-content {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
        min-width: 0 !important;
      }
      .ig-saver-calendar-icon {
        color: #0071e3 !important;
        flex-shrink: 0 !important;
      }
      .ig-saver-daterange-text {
        font-size: 13px !important;
        font-weight: 600 !important;
        color: #1d1d1f !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .ig-saver-daterange-text.placeholder {
        color: #86868b !important;
        font-weight: 500 !important;
      }
      .ig-saver-daterange-badge {
        font-size: 11px !important;
        font-weight: 700 !important;
        background: rgba(0, 113, 227, 0.1) !important;
        color: #0071e3 !important;
        padding: 3px 8px !important;
        border-radius: 9999px !important;
        letter-spacing: 0.3px !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
      }

      /* Apple Calendar Popover (Always opens upwards, 100% visible) */
      .ig-saver-calendar-popover {
        display: none !important;
        position: absolute !important;
        bottom: calc(100% + 8px) !important;
        top: auto !important;
        left: 0 !important;
        right: 0 !important;
        background: #ffffff !important;
        border: 1px solid #e8e8ed !important;
        border-radius: 14px !important;
        box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.16), 0 2px 10px rgba(0, 0, 0, 0.05) !important;
        padding: 10px 12px !important;
        z-index: 10005 !important;
        box-sizing: border-box !important;
        flex-direction: column !important;
        gap: 6px !important;
        animation: igSaverScaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .ig-saver-daterange-picker.is-open .ig-saver-calendar-popover {
        display: flex !important;
      }

      /* Quick Presets Bar */
      .ig-saver-cal-presets {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 4px !important;
        padding-bottom: 6px !important;
        border-bottom: 1px solid #f0f0f2 !important;
      }
      .ig-saver-cal-preset-btn {
        background: #f5f5f7 !important;
        border: 1px solid transparent !important;
        border-radius: 6px !important;
        padding: 3px 7px !important;
        font-size: 10.5px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        color: #555558 !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        outline: none !important;
        user-select: none !important;
      }
      .ig-saver-cal-preset-btn:hover {
        background: rgba(0, 113, 227, 0.08) !important;
        color: #0071e3 !important;
        border-color: rgba(0, 113, 227, 0.15) !important;
      }
      .ig-saver-cal-preset-btn.active {
        background: #0071e3 !important;
        color: #ffffff !important;
        border-color: #0071e3 !important;
      }

      /* Calendar Nav Header */
      .ig-saver-cal-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 0 2px !important;
      }
      .ig-saver-cal-month-title {
        font-size: 12.5px !important;
        font-weight: 700 !important;
        color: #1d1d1f !important;
        text-transform: capitalize !important;
        letter-spacing: -0.01em !important;
      }
      .ig-saver-cal-nav-btn {
        width: 24px !important;
        height: 24px !important;
        border-radius: 6px !important;
        border: none !important;
        background: transparent !important;
        color: #555558 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        outline: none !important;
      }
      .ig-saver-cal-nav-btn:hover {
        background: #f5f5f7 !important;
        color: #0071e3 !important;
      }

      /* Weekdays Row */
      .ig-saver-cal-weekdays {
        display: grid !important;
        grid-template-columns: repeat(7, 1fr) !important;
        text-align: center !important;
        font-size: 9.5px !important;
        font-weight: 700 !important;
        color: #86868b !important;
        letter-spacing: 0.5px !important;
        margin-top: 1px !important;
      }

      /* Calendar Grid */
      .ig-saver-cal-grid {
        display: grid !important;
        grid-template-columns: repeat(7, 1fr) !important;
        row-gap: 1px !important;
      }
      .ig-saver-cal-day {
        position: relative !important;
        height: 25px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        color: #1d1d1f !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: background 0.1s, color 0.1s, border-radius 0.1s !important;
      }
      .ig-saver-cal-day.other-month {
        color: #c7c7cc !important;
        font-weight: 400 !important;
      }
      .ig-saver-cal-day.is-future {
        opacity: 0.28 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
        color: #86868b !important;
      }
      .ig-saver-cal-day.is-today::after {
        content: '' !important;
        position: absolute !important;
        bottom: 1px !important;
        width: 3.5px !important;
        height: 3.5px !important;
        border-radius: 50% !important;
        background: #0071e3 !important;
      }
      .ig-saver-cal-day.is-selected-start,
      .ig-saver-cal-day.is-selected-end,
      .ig-saver-cal-day.is-single-selected {
        background: #0071e3 !important;
        color: #ffffff !important;
        font-weight: 700 !important;
      }
      .ig-saver-cal-day.is-selected-start {
        border-radius: 8px 0 0 8px !important;
      }
      .ig-saver-cal-day.is-selected-end {
        border-radius: 0 8px 8px 0 !important;
      }
      .ig-saver-cal-day.is-selected-start.is-selected-end,
      .ig-saver-cal-day.is-single-selected {
        border-radius: 8px !important;
      }
      .ig-saver-cal-day.is-in-range {
        background: rgba(0, 113, 227, 0.12) !important;
        color: #0071e3 !important;
        font-weight: 600 !important;
        border-radius: 0 !important;
      }
      .ig-saver-cal-day.is-range-hover {
        background: rgba(0, 113, 227, 0.08) !important;
        color: #0071e3 !important;
      }
      .ig-saver-cal-day:hover:not(.is-selected-start):not(.is-selected-end):not(.is-in-range):not(.is-single-selected) {
        background: #f5f5f7 !important;
        border-radius: 6px !important;
        color: #0071e3 !important;
      }

      /* Calendar Footer */
      .ig-saver-cal-footer {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding-top: 6px !important;
        border-top: 1px solid #f0f0f2 !important;
        margin-top: 1px !important;
      }
      .ig-saver-cal-info {
        font-size: 10.5px !important;
        color: #86868b !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 145px !important;
      }
      .ig-saver-cal-actions {
        display: flex !important;
        align-items: center !important;
        gap: 3px !important;
      }
      .ig-saver-cal-btn-clear, 
      .ig-saver-cal-btn-cancel {
        border: none !important;
        background: transparent !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        color: #86868b !important;
        cursor: pointer !important;
        padding: 4px 6px !important;
        border-radius: 5px !important;
        transition: all 0.15s ease !important;
      }
      .ig-saver-cal-btn-clear:hover,
      .ig-saver-cal-btn-cancel:hover {
        background: #f5f5f7 !important;
        color: #1d1d1f !important;
      }
      .ig-saver-cal-btn-apply {
        border: none !important;
        background: #0071e3 !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        color: #ffffff !important;
        cursor: pointer !important;
        padding: 4px 10px !important;
        border-radius: 6px !important;
        transition: all 0.15s ease !important;
        box-shadow: 0 2px 6px rgba(0, 113, 227, 0.25) !important;
      }
      .ig-saver-cal-btn-apply:hover {
        background: #0077ed !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 10px rgba(0, 113, 227, 0.35) !important;
      }
      .ig-saver-cal-btn-apply:active {
        transform: translateY(0) !important;
      }

      /* Clean line-separated section layout (Lista Minimalista Corrida) */
      .ig-saver-section {
        background: transparent !important;
        border: none !important;
        border-bottom: 1px solid var(--ig-border) !important;
        border-radius: 0 !important;
        padding: 8px 0 !important;
        margin-bottom: 0 !important;
        transition: none !important;
      }
      .ig-saver-section:first-of-type {
        padding-top: 0 !important;
      }
      .ig-saver-section:last-of-type {
        border-bottom: none !important;
        padding-bottom: 2px !important;
      }
      .ig-saver-section:hover {
        border-color: var(--ig-border) !important;
      }

      .ig-saver-section-title {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        font-size: 12px !important;
        color: var(--ig-text-sec) !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        margin-bottom: 12px !important;
      }

      /* Toggle switch styling */
      .ig-saver-switch-container {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        cursor: pointer !important;
        padding: 3px 0 !important;
      }

      .ig-saver-switch {
        position: relative !important;
        display: inline-block !important;
        width: 46px !important;
        height: 26px !important;
        flex-shrink: 0 !important;
      }

      .ig-saver-switch input {
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
      }

      .ig-saver-slider {
        position: absolute !important;
        cursor: pointer !important;
        top: 0; left: 0; right: 0; bottom: 0 !important;
        background-color: var(--ig-slider-bg) !important;
        border-radius: 26px !important;
        transition: background-color 0.2s, box-shadow 0.2s !important;
      }

      .ig-saver-slider:before {
        content: "" !important;
        position: absolute !important;
        height: 20px !important;
        width: 20px !important;
        left: 3px !important;
        bottom: 3px !important;
        background-color: white !important;
        border-radius: 50% !important;
        transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
      }

      .ig-saver-switch input:checked + .ig-saver-slider {
        background: #0071e3 !important;
        box-shadow: none !important;
      }

      .ig-saver-switch input:checked + .ig-saver-slider:before {
        transform: translateX(20px) !important;
      }

      /* History Chips */
      .ig-saver-chips-container {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
      }

      .ig-saver-chip {
        padding: 6px 14px !important;
        background: var(--ig-hover-bg) !important;
        border: 1px solid var(--ig-border) !important;
        border-radius: 9999px !important;
        font-size: 13px !important;
        color: var(--ig-text) !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      }

      .ig-saver-chip:hover {
        transform: translateY(-1px) !important;
        border-color: #0071e3 !important;
        color: #0071e3 !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.1) !important;
      }

      .ig-saver-favorites-content {
        display: flex !important;
        align-items: flex-start !important;
        gap: 6px !important;
        width: 100% !important;
      }

      #ig-saver-favorites-container {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        flex-wrap: nowrap !important;
        overflow: hidden !important;
        max-height: 32px !important;
      }

      #ig-saver-favorites-row.is-expanded #ig-saver-favorites-container {
        flex-wrap: wrap !important;
        overflow: visible !important;
        max-height: none !important;
      }

      .ig-saver-favorite-chip {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
      }

      #ig-saver-favorites-toggle {
        flex: 0 0 32px !important;
        width: 32px !important;
        height: 32px !important;
        padding: 0 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid var(--ig-border) !important;
        border-radius: 6px !important;
        background: var(--ig-hover-bg) !important;
        color: var(--ig-text) !important;
        cursor: pointer !important;
      }

      #ig-saver-favorites-toggle[hidden] {
        display: none !important;
      }

      #ig-saver-favorites-toggle span {
        display: block !important;
        font-size: 16px !important;
        line-height: 1 !important;
        transition: transform 0.2s ease !important;
      }

      #ig-saver-favorites-row.is-expanded #ig-saver-favorites-toggle span {
        transform: rotate(180deg) !important;
      }

      /* Accordion advanced filters */
      #ig-saver-filters-accordion {
        border: 1px solid var(--ig-border) !important;
        border-radius: 12px !important;
        background: transparent !important;
        transition: border-color 0.2s !important;
        width: 100% !important;
      }
      #ig-saver-filters-accordion summary {
        padding: 12px 16px !important;
        font-size: 13.5px !important;
        font-weight: 600 !important;
        outline: none !important;
        cursor: pointer !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        user-select: none !important;
      }
      #ig-saver-filters-accordion[open] summary {
        border-bottom: 1px solid var(--ig-border) !important;
      }
      #ig-saver-filters-accordion[open] .ig-saver-arrow {
        transform: rotate(90deg) !important;
      }

      /* Primary Button (Apple Capsule style) */
      .ig-saver-btn-primary {
        flex: 1 !important;
        padding: 14px 24px !important;
        background: #0071e3 !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 9999px !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        cursor: pointer !important;
        transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s !important;
        box-shadow: 0 4px 12px rgba(0, 113, 227, 0.15) !important;
        text-align: center !important;
      }

      .ig-saver-btn-primary:hover {
        background-color: #147ce5 !important;
        transform: scale(1.01) !important;
        box-shadow: 0 6px 16px rgba(0, 113, 227, 0.25) !important;
      }

      .ig-saver-btn-primary:active {
        transform: scale(0.99) !important;
      }

      .ig-saver-btn-primary:disabled {
        opacity: 0.5 !important;
        pointer-events: none !important;
      }

      /* Secondary Button (Apple Capsule style) */
      .ig-saver-btn-secondary {
        flex: 1 !important;
        padding: 14px 24px !important;
        background: var(--ig-hover-bg) !important;
        color: var(--ig-text) !important;
        border: 1px solid var(--ig-border) !important;
        border-radius: 9999px !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        font-family: inherit !important;
        cursor: pointer !important;
        transition: background-color 0.2s, transform 0.2s !important;
        text-align: center !important;
      }

      .ig-saver-btn-secondary:hover {
        background-color: var(--ig-border) !important;
        transform: scale(1.01) !important;
      }

      .ig-saver-btn-secondary:active {
        transform: scale(0.99) !important;
      }

      /* Validated Profile Card */
      .ig-saver-profile-card {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 14px !important;
        background: var(--ig-hover-bg) !important;
        border: 1px solid var(--ig-border) !important;
        border-radius: 16px !important;
        margin-top: 8px !important;
        animation: igSaverSlideUp 0.25s cubic-bezier(0.25, 1, 0.5, 1) !important;
      }

      .ig-saver-profile-avatar {
        width: 46px !important;
        height: 46px !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        border: 1px solid var(--ig-border) !important;
      }

      .ig-saver-profile-info {
        flex: 1 !important;
        text-align: left !important;
      }

      .ig-saver-profile-name {
        font-size: 14.5px !important;
        font-weight: 700 !important;
        color: var(--ig-text) !important;
      }

      .ig-saver-profile-handle {
        font-size: 12.5px !important;
        color: var(--ig-text-sec) !important;
      }

      .ig-saver-profile-posts {
        font-size: 12px !important;
        font-weight: 700 !important;
        color: #0071e3 !important;
        background: rgba(0, 113, 227, 0.08) !important;
        padding: 4px 10px !important;
        border-radius: 9999px !important;
      }

      @keyframes igSaverSlideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Confirmation screen summary */
      .ig-saver-confirm-summary {
        background: transparent !important;
        border-top: 1px solid var(--ig-border) !important;
        border-bottom: 1px solid var(--ig-border) !important;
        border-radius: 0 !important;
        padding: 18px 0 !important;
        margin-bottom: 18px !important;
      }

      .ig-saver-confirm-item {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 12px !important;
        font-size: 13.5px !important;
      }
      .ig-saver-confirm-item:last-child {
        margin-bottom: 0 !important;
      }

      .ig-saver-confirm-label {
        color: var(--ig-text-sec) !important;
      }

      .ig-saver-confirm-value {
        font-weight: 600 !important;
        color: var(--ig-text) !important;
      }

      /* Spinner inside button */
      .ig-saver-spinner {
        width: 16px !important;
        height: 16px !important;
        border: 2px solid rgba(255,255,255,0.3) !important;
        border-top-color: white !important;
        border-radius: 50% !important;
        animation: ig-saver-spin 0.8s linear infinite !important;
        display: inline-block !important;
        margin-right: 6px !important;
        vertical-align: middle !important;
      }

      /* ========================================= */
      /* UPGRADE / PRO DIALOG OVERRIDES (APPLE)    */
      /* ========================================= */
      #ig-saver-upgrade-dialog {
        background: var(--ig-overlay) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
      }

      #ig-saver-upgrade-dialog > div {
        background: var(--ig-bg) !important;
        border-radius: 24px !important;
        border: 1px solid var(--ig-border) !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4) !important;
        padding: 32px !important;
      }

      /* Upgrade dialogue features comparison table */
      #ig-saver-upgrade-dialog table {
        border-radius: 12px !important;
        border: 1px solid var(--ig-border) !important;
        overflow: hidden !important;
        background: var(--ig-bg-glass) !important;
      }
      #ig-saver-upgrade-dialog th, 
      #ig-saver-upgrade-dialog td {
        border-bottom: 1px solid var(--ig-border) !important;
        padding: 12px 14px !important;
      }
      #ig-saver-upgrade-dialog tr:last-child td {
        border-bottom: none !important;
      }

      /* Plan Buttons in upgrade dialog */
      .ig-saver-upgrade-plan {
        border: 1.5px solid var(--ig-border) !important;
        border-radius: 16px !important;
        background: var(--ig-input-bg) !important;
        color: var(--ig-text) !important;
        transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s !important;
        padding: 16px 12px !important;
      }
      .ig-saver-upgrade-plan:hover {
        border-color: #0071e3 !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 20px rgba(0, 113, 227, 0.1) !important;
      }

      /* License Activate/Cancel Buttons */
      #ig-saver-license-activate {
        background: #0071e3 !important;
        color: #ffffff !important;
        border-radius: 9999px !important;
        font-weight: 600 !important;
        box-shadow: none !important;
        transition: background-color 0.2s !important;
      }
      #ig-saver-license-activate:hover {
        background-color: #147ce5 !important;
      }

      #ig-saver-license-cancel,
      #ig-saver-upgrade-close {
        background: var(--ig-hover-bg) !important;
        color: var(--ig-text) !important;
        border-radius: 9999px !important;
        font-weight: 600 !important;
        border: 1px solid var(--ig-border) !important;
        transition: background-color 0.2s !important;
      }
      #ig-saver-license-cancel:hover,
      #ig-saver-upgrade-close:hover {
        background-color: var(--ig-border) !important;
      }

      #ig-saver-have-key-link {
        border-radius: 9999px !important;
        background: var(--ig-hover-bg) !important;
        border: 1px solid var(--ig-border) !important;
        padding: 12px 20px !important;
        transition: background-color 0.2s !important;
      }
      #ig-saver-have-key-link:hover {
        background-color: var(--ig-border) !important;
      }

      /* Mono styles for license input key */
      #ig-saver-license-input {
        border-radius: 12px !important;
        padding: 14px 16px !important;
        border: 1px solid var(--ig-border) !important;
        background: var(--ig-input-bg) !important;
        color: var(--ig-text) !important;
      }
      #ig-saver-license-input:focus {
        border-color: #0071e3 !important;
        box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.2) !important;
        outline: none !important;
      }

      /* Pro Badge (Apple minimal label) */
      .ig-saver-pro-badge {
        background: var(--ig-text) !important;
        color: var(--ig-bg) !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        letter-spacing: 0.5px !important;
      }
    `;
    document.head.appendChild(style);
  }
  function Xa() {
    injectDialogStyles();
    let i = document.getElementById("ig-saver-dialog");
    i && i.remove();
    let e = L(),
      t = document.createElement("div");
    
    let isDark = Ia();
    t.style.setProperty('--ig-bg', e.bg);
    t.style.setProperty('--ig-bg-sec', e.bgSecondary);
    t.style.setProperty('--ig-text', e.text);
    t.style.setProperty('--ig-text-sec', e.textSecondary);
    t.style.setProperty('--ig-border', e.border);
    t.style.setProperty('--ig-input-bg', e.inputBg);
    t.style.setProperty('--ig-hover-bg', e.hoverBg);
    t.style.setProperty('--ig-slider-bg', isDark ? "#363636" : "#ccc");
    t.style.setProperty('--ig-bg-glass', isDark ? "rgba(24, 24, 27, 0.75)" : "rgba(255, 255, 255, 0.72)");
    t.style.setProperty('--ig-border-glass', isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.45)");

    t.id = "ig-saver-dialog";
    t.className = "ig-saver-dialog-root";
    t.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: ${e.overlay}; z-index: 10001;
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.2s ease;
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    `;
    requestAnimationFrame(() => {
      t.style.opacity = "1";
    });

    let mesh = document.createElement("div");
    mesh.className = "ig-saver-bg-mesh";
    t.appendChild(mesh);

    let n = document.createElement("div");
    n.className = "ig-saver-glass-card";
    n.style.transform = "scale(0.95) translateY(8px)";
    n.style.opacity = "0";
    requestAnimationFrame(() => {
      n.style.transform = "scale(1) translateY(0)";
      n.style.opacity = "1";
    });

    let a = O(),
      r = `font-size: 12px; color: ${e.textSecondary}; display: block; margin-bottom: 6px; font-weight: 600; text-align: left; text-transform: uppercase; letter-spacing: 0.3px;`;
    
    n.innerHTML = `
    <div id="ig-saver-step1-view">

      <div class="ig-saver-section">
        
        <div id="ig-saver-singleprofile-group" style="margin-bottom: 8px;">
          <input type="hidden" id="ig-saver-singleprofile-input" value="${a}">
          <div id="ig-saver-profile-card-container"></div>
        </div>

        <div style="margin-bottom: 8px;">
          <label style="${r}">${_("dialog_media_type")}</label>
          <div class="ig-saver-segmented-group" id="ig-saver-filter-segmented">
            <button type="button" class="ig-saver-segment-btn active" data-value="all">Tudo</button>
            <button type="button" class="ig-saver-segment-btn" data-value="photos">${_("dialog_media_photos") || "Apenas fotos"}</button>
            <button type="button" class="ig-saver-segment-btn" data-value="videos">${_("dialog_media_videos") || "Apenas vídeos"}</button>
          </div>
          <input type="hidden" id="ig-saver-filter" value="all">
        </div>

        <div id="ig-saver-extras-group" style="margin-bottom: 0px;">
          <label style="${r}">${_("dialog_extras")}</label>
          
          <div class="ig-saver-switch-container" id="ig-saver-toggle-stories-row" style="margin-bottom: 4px;">
            <span style="font-size: 13px; color: var(--ig-text); font-weight: 600;">${_("dialog_include_stories")}</span>
            <label class="ig-saver-switch">
              <input type="checkbox" id="ig-saver-include-stories">
              <span class="ig-saver-slider"></span>
            </label>
          </div>

          <div class="ig-saver-switch-container" id="ig-saver-toggle-highlights-row">
            <span style="font-size: 13px; color: var(--ig-text); font-weight: 600;">${_("dialog_include_highlights")}</span>
            <label class="ig-saver-switch">
              <input type="checkbox" id="ig-saver-include-highlights">
              <span class="ig-saver-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="ig-saver-section">
        
        <div style="margin-bottom: 14px; display: none;">
          <label style="${r}">${_("dialog_save_method")}</label>
          <select id="ig-saver-folder-mode" class="ig-saver-field">
            <option value="grouped">${_("dialog_save_grouped")}</option>
            <option value="flat" selected>${_("dialog_save_flat")}</option>
          </select>
        </div>

        <div style="margin-bottom: 0;">
          <label style="${r}">${_("dialog_range")}</label>
          <div class="ig-saver-custom-select" id="ig-saver-strategy-custom">
            <button type="button" class="ig-saver-custom-select-trigger" id="ig-saver-strategy-trigger">
              <span id="ig-saver-strategy-label">${_("dialog_range_all") || "Baixar tudo"}</span>
              <svg class="ig-saver-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="ig-saver-custom-select-menu" id="ig-saver-strategy-menu">
              <div class="ig-saver-select-option active" data-value="all">
                <span>${_("dialog_range_all") || "Baixar tudo"}</span>
                <svg class="ig-saver-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ig-saver-select-option" data-value="topk">
                <span>${_("dialog_range_topk") || "Primeiras N publicações (mais recentes)"}</span>
                <svg class="ig-saver-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ig-saver-select-option" data-value="range">
                <span>${_("dialog_range_custom") || "Intervalo de datas personalizado"}</span>
                <svg class="ig-saver-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071E3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
          <input type="hidden" id="ig-saver-strategy" value="all">
        </div>

        <div id="ig-saver-topk-group" style="display: none; margin-bottom: 10px; margin-top: 8px;">
          <label style="${r}">${_("dialog_post_count")}</label>
          <div class="ig-saver-stepper">
            <button type="button" id="ig-saver-topk-dec" class="ig-saver-stepper-btn">&minus;</button>
            <input type="number" inputmode="numeric" id="ig-saver-topk-value" min="0" value="20" placeholder="20" class="ig-saver-stepper-input">
            <button type="button" id="ig-saver-topk-inc" class="ig-saver-stepper-btn">+</button>
          </div>
        </div>

        <div id="ig-saver-range-group" style="display: none; margin-bottom: 10px; margin-top: 8px;">
          <label style="${r}">${_("dialog_range_custom") || "Intervalo de datas"}</label>
          <div class="ig-saver-daterange-picker" id="ig-saver-daterange-picker">
            <button type="button" class="ig-saver-daterange-trigger" id="ig-saver-daterange-trigger">
              <div class="ig-saver-daterange-trigger-content">
                <svg class="ig-saver-calendar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span id="ig-saver-daterange-display" class="ig-saver-daterange-text placeholder">Selecione o período</span>
              </div>
              <span id="ig-saver-daterange-badge" class="ig-saver-daterange-badge" style="display: none;">0 dias</span>
            </button>
            
            <!-- Hidden inputs maintaining complete backward compatibility with core crawler logic -->
            <input type="hidden" id="ig-saver-from" value="">
            <input type="hidden" id="ig-saver-to" value="">

            <!-- Floating Apple Calendar Popover -->
            <div class="ig-saver-calendar-popover" id="ig-saver-calendar-popover">
              <!-- Quick Presets -->
              <div class="ig-saver-cal-presets" id="ig-saver-cal-presets">
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="today">Hoje</button>
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="yesterday">Ontem</button>
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="last7">7 dias</button>
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="last30">30 dias</button>
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="thisMonth">Este Mês</button>
                <button type="button" class="ig-saver-cal-preset-btn" data-preset="lastMonth">Mês Passado</button>
              </div>

              <!-- Calendar Navigation Header -->
              <div class="ig-saver-cal-header">
                <button type="button" class="ig-saver-cal-nav-btn" id="ig-saver-cal-prev" title="Mês anterior">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span class="ig-saver-cal-month-title" id="ig-saver-cal-month-title">Agosto de 2026</span>
                <button type="button" class="ig-saver-cal-nav-btn" id="ig-saver-cal-next" title="Próximo mês">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>

              <!-- Weekdays Header -->
              <div class="ig-saver-cal-weekdays">
                <span>DOM</span>
                <span>SEG</span>
                <span>TER</span>
                <span>QUA</span>
                <span>QUI</span>
                <span>SEX</span>
                <span>SÁB</span>
              </div>

              <!-- Month Grid (42 cells: 6 rows x 7 cols) -->
              <div class="ig-saver-cal-grid" id="ig-saver-cal-grid"></div>

              <!-- Footer info & action buttons -->
              <div class="ig-saver-cal-footer">
                <div class="ig-saver-cal-info">
                  <span id="ig-saver-cal-info-text">Selecione a data inicial</span>
                </div>
                <div class="ig-saver-cal-actions">
                  <button type="button" class="ig-saver-cal-btn-clear" id="ig-saver-cal-clear">Limpar</button>
                  <button type="button" class="ig-saver-cal-btn-cancel" id="ig-saver-cal-cancel">Cancelar</button>
                  <button type="button" class="ig-saver-cal-btn-apply" id="ig-saver-cal-apply">Aplicar</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 10px;">
          <button type="button" id="ig-saver-filters-trigger" class="ig-saver-filters-trigger-btn">
            <span style="font-size: 12.5px; font-weight: 600; color: #1d1d1f;">🔍 ${_("dialog_filter_title") || "Filtros de Conteúdo (Opcional)"}</span>
            <span id="ig-saver-active-filters-badge" class="ig-saver-filter-count-badge">0 ativos</span>
          </button>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 14px;">
        <button id="ig-saver-start" class="ig-saver-btn-primary">${_("dialog_btn_start")}</button>
        <button id="ig-saver-cancel" class="ig-saver-btn-secondary">${_("dialog_btn_cancel")}</button>
      </div>
    </div>

    <!-- Step 2: Confirmation Screen -->
    <div id="ig-saver-step2-view" style="display: none;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: var(--ig-text); font-weight: 700; display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FD1D1D"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span>${_("dialog_confirm_title") || "Confirmar Download"}</span>
      </h2>
      
      <div class="ig-saver-confirm-summary">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--ig-text-sec); letter-spacing: 0.8px; margin-bottom: 14px;">
          ${_("dialog_confirm_summary") || "Resumo da Configuração"}
        </div>
        <div class="ig-saver-confirm-item">
          <span class="ig-saver-confirm-label">${_("dialog_confirm_target") || "Perfil:"}</span>
          <span class="ig-saver-confirm-value" id="ig-saver-confirm-val-target">-</span>
        </div>
        <div class="ig-saver-confirm-item">
          <span class="ig-saver-confirm-label">${_("dialog_confirm_media") || "Tipo de Mídia:"}</span>
          <span class="ig-saver-confirm-value" id="ig-saver-confirm-val-media">Tudo</span>
        </div>
        <div class="ig-saver-confirm-item" style="display: none;">
          <span class="ig-saver-confirm-label">${_("dialog_confirm_save") || "Método:"}</span>
          <span class="ig-saver-confirm-value" id="ig-saver-confirm-val-save">Flat</span>
        </div>
        <div class="ig-saver-confirm-item">
          <span class="ig-saver-confirm-label">${_("dialog_confirm_filters") || "Filtros:"}</span>
          <span class="ig-saver-confirm-value" id="ig-saver-confirm-val-filters">Nenhum</span>
        </div>
        <div class="ig-saver-confirm-item" style="border-top: 1px solid var(--ig-border); padding-top: 10px; margin-top: 10px;">
          <span class="ig-saver-confirm-label">${_("dialog_confirm_est") || "Saída Estimada:"}</span>
          <span class="ig-saver-confirm-value" id="ig-saver-confirm-val-est" style="color: #FD1D1D; font-weight: 700;">-</span>
        </div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 10px;">
        <button id="ig-saver-confirm-btn" class="ig-saver-btn-primary">${_("dialog_btn_confirm") || "Confirmar e Baixar"}</button>
        <button id="ig-saver-back-btn" class="ig-saver-btn-secondary">${_("dialog_btn_back") || "Voltar"}</button>
      </div>
    </div>
    `;
    t.appendChild(n);

    let flyout = document.createElement("div");
    flyout.id = "ig-saver-filters-flyout";
    flyout.className = "ig-saver-filters-flyout";
    flyout.innerHTML = `
      <div class="ig-saver-flyout-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 13.5px; font-weight: 700; color: #1d1d1f;">🔍 Filtros de Conteúdo</span>
          <button type="button" id="ig-saver-clean-filters-btn" class="ig-saver-clean-filters-pill" style="display: none;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Limpar</span>
          </button>
        </div>
        <button type="button" id="ig-saver-flyout-close" class="ig-saver-flyout-close-btn">&times;</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <label style="${r}">${_("dialog_filter_hashtag")}</label>
          <input type="text" id="ig-saver-filter-hashtag" placeholder="ex: #surf" class="ig-saver-field">
        </div>
        <div>
          <label style="${r}">${_("dialog_filter_likes")}</label>
          <div class="ig-saver-stepper">
            <button type="button" id="ig-saver-likes-dec" class="ig-saver-stepper-btn">&minus;</button>
            <input type="number" inputmode="numeric" id="ig-saver-filter-likes" min="0" placeholder="ex: 1000" class="ig-saver-stepper-input">
            <button type="button" id="ig-saver-likes-inc" class="ig-saver-stepper-btn">+</button>
          </div>
        </div>
        <div>
          <label style="${r}">${_("dialog_filter_views")}</label>
          <div class="ig-saver-stepper">
            <button type="button" id="ig-saver-views-dec" class="ig-saver-stepper-btn">&minus;</button>
            <input type="number" inputmode="numeric" id="ig-saver-filter-views" min="0" placeholder="ex: 5000" class="ig-saver-stepper-input">
            <button type="button" id="ig-saver-views-inc" class="ig-saver-stepper-btn">+</button>
          </div>
        </div>
        <div>
          <label style="${r}">${_("dialog_filter_comments")}</label>
          <div class="ig-saver-stepper">
            <button type="button" id="ig-saver-comments-dec" class="ig-saver-stepper-btn">&minus;</button>
            <input type="number" inputmode="numeric" id="ig-saver-filter-comments" min="0" placeholder="ex: 100" class="ig-saver-stepper-input">
            <button type="button" id="ig-saver-comments-inc" class="ig-saver-stepper-btn">+</button>
          </div>
        </div>
        <div>
          <label style="${r}">${_("dialog_filter_saves")}</label>
          <div class="ig-saver-stepper">
            <button type="button" id="ig-saver-saves-dec" class="ig-saver-stepper-btn">&minus;</button>
            <input type="number" inputmode="numeric" id="ig-saver-filter-saves" min="0" placeholder="ex: 50" class="ig-saver-stepper-input">
            <button type="button" id="ig-saver-saves-inc" class="ig-saver-stepper-btn">+</button>
          </div>
        </div>
      </div>
    `;
    t.appendChild(flyout);
    document.body.appendChild(t);

    // Filters Flyout Trigger & Close
    let filtersTrigger = document.getElementById("ig-saver-filters-trigger");
    let filtersFlyout = document.getElementById("ig-saver-filters-flyout");
    let flyoutClose = document.getElementById("ig-saver-flyout-close");

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
    }

    // Connect toggle rows to checkboxes for better touch areas
    function setupToggleRowClick(rowId, checkboxId) {
      let row = document.getElementById(rowId);
      let checkbox = document.getElementById(checkboxId);
      if (row && checkbox) {
        row.addEventListener("click", (evt) => {
          if (evt.target !== checkbox && !evt.target.closest('.ig-saver-switch')) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
        });
      }
    }
    setupToggleRowClick("ig-saver-toggle-stories-row", "ig-saver-include-stories");
    setupToggleRowClick("ig-saver-toggle-highlights-row", "ig-saver-include-highlights");
    setupToggleRowClick("ig-saver-only-new-row", "ig-saver-only-new-toggle");

    // Filter Badges & Estimate Helpers
    function updateActiveFiltersBadge() {
      let badge = document.getElementById("ig-saver-active-filters-badge");
      let trigger = document.getElementById("ig-saver-filters-trigger");
      let cleanBtn = document.getElementById("ig-saver-clean-filters-btn");
      
      let hashtag = (document.getElementById("ig-saver-filter-hashtag")?.value || "").trim();
      let likes = parseInt(document.getElementById("ig-saver-filter-likes")?.value, 10) || 0;
      let views = parseInt(document.getElementById("ig-saver-filter-views")?.value, 10) || 0;
      let comments = parseInt(document.getElementById("ig-saver-filter-comments")?.value, 10) || 0;
      let saves = parseInt(document.getElementById("ig-saver-filter-saves")?.value, 10) || 0;

      let count = 0;
      if (hashtag.length > 0) count++;
      if (likes > 0) count++;
      if (views > 0) count++;
      if (comments > 0) count++;
      if (saves > 0) count++;

      if (badge) {
        badge.textContent = `${count} ativo${count === 1 ? "" : "s"}`;
      }

      if (trigger) {
        trigger.classList.toggle("has-filters", count > 0);
      }

      if (cleanBtn) {
        cleanBtn.style.display = count > 0 ? "inline-flex" : "none";
      }

      return count;
    }

    function clearAllFilters() {
      let ids = [
        "ig-saver-filter-hashtag",
        "ig-saver-filter-likes",
        "ig-saver-filter-views",
        "ig-saver-filter-comments",
        "ig-saver-filter-saves"
      ];
      ids.forEach(id => {
        let el = document.getElementById(id);
        if (el) {
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      updateActiveFiltersBadge();
    }

    function extractProfileData(fallbackUsername) {
      let username = fallbackUsername || "";
      let fullName = "";
      let avatarUrl = "";
      let postCount = 0;
      let postCountText = "Publicações";
      
      // 1. Username
      if (!username) {
        let pathParts = window.location.pathname.split("/").filter(Boolean);
        if (pathParts.length > 0 && !["p", "reel", "stories", "direct", "explore"].includes(pathParts[0])) {
          username = pathParts[0];
        }
      }
      
      // 2. Avatar
      let imgEl = document.querySelector('header img[alt*="foto"], header img[alt*="profile"], header img, img[alt*="profile picture"], img[alt*="foto do perfil"]');
      if (imgEl && imgEl.src) {
        avatarUrl = imgEl.src;
      } else {
        let metaOgImg = document.querySelector('meta[property="og:image"]');
        if (metaOgImg && metaOgImg.content) avatarUrl = metaOgImg.content;
      }
      if (!avatarUrl) {
        avatarUrl = "https://static.cdninstagram.com/rsrc.php/v3/yI/r/VsNE-OHk_8a.png";
      }

      // 3. Full Name
      let nameEl = document.querySelector('header section h2, header section h1, header h1, header h2');
      if (nameEl && nameEl.textContent) {
        fullName = nameEl.textContent.trim();
      }
      if (!fullName) {
        let metaOgTitle = document.querySelector('meta[property="og:title"]');
        if (metaOgTitle && metaOgTitle.content) {
          fullName = metaOgTitle.content.split("(@")[0].split("•")[0].trim();
        }
      }
      if (!fullName) fullName = username;

      // 4. Post Count from Header or Meta Description
      let headerListItems = document.querySelectorAll('header ul li, header section ul li');
      if (headerListItems.length > 0) {
        let firstItem = headerListItems[0].textContent.trim();
        let match = firstItem.match(/([\d.,]+)\s*(?:publicações|publicacoes|posts|publicação|publicacao|post)?/i);
        if (match) {
          let numStr = match[1].replace(/\./g, "").replace(/,/g, "");
          let parsed = parseInt(numStr, 10);
          if (!isNaN(parsed) && parsed > 0) {
            postCount = parsed;
            postCountText = `${match[1]} posts`;
          }
        }
      }
      
      if (postCount === 0) {
        let metaDesc = document.querySelector('meta[name="description"]')?.content || "";
        let descMatch = metaDesc.match(/([\d.,KkMm]+)\s*(?:Posts|publicações|publicacoes)/i);
        if (descMatch) {
          postCountText = `${descMatch[1]} posts`;
          let cleanNum = parseInt(descMatch[1].replace(/\./g, "").replace(/,/g, ""), 10);
          if (!isNaN(cleanNum)) postCount = cleanNum;
        }
      }

      if (postCount === 0) {
        postCountText = "Perfil";
      }

      // 5. Estimated Time
      let estSeconds = postCount > 0 ? Math.max(5, Math.ceil(postCount * 0.35)) : 30;
      let estTimeText = estSeconds < 60 ? `~${estSeconds}s` : `~${Math.ceil(estSeconds / 60)} min`;

      return {
        username: username || "perfil",
        fullName: fullName || username || "Instagram",
        avatarUrl,
        postCount,
        postCountText,
        estTimeText
      };
    }

    let currentProfileData = extractProfileData(a);

    function renderProfileCard() {
      let container = document.getElementById("ig-saver-profile-card-container");
      if (!container) return;

      container.innerHTML = `
        <div class="ig-saver-profile-card">
          <img src="${currentProfileData.avatarUrl}" class="ig-saver-profile-avatar" alt="${currentProfileData.fullName}" onerror="this.src='https://static.cdninstagram.com/rsrc.php/v3/yI/r/VsNE-OHk_8a.png'">
          <div class="ig-saver-profile-info">
            <div class="ig-saver-profile-name" title="${currentProfileData.fullName}">${currentProfileData.fullName}</div>
            <div class="ig-saver-profile-handle">@${currentProfileData.username}</div>
          </div>
          <div class="ig-saver-profile-meta-wrap">
            <div class="ig-saver-profile-posts" id="ig-saver-profile-posts-badge">${currentProfileData.postCountText}</div>
            <div class="ig-saver-profile-sub" id="ig-saver-profile-est-badge">${currentProfileData.estTimeText}</div>
          </div>
        </div>
      `;
    }

    renderProfileCard();

    function updateEstimatePreview() {
      let estEl = document.getElementById("ig-saver-confirm-val-est");
      let postsBadge = document.getElementById("ig-saver-profile-posts-badge");
      let estBadge = document.getElementById("ig-saver-profile-est-badge");
      
      let strategy = document.getElementById("ig-saver-strategy")?.value || "all";
      let filterVal = document.getElementById("ig-saver-filter")?.value || "all";
      
      let targetCount = currentProfileData.postCount;
      let countText = currentProfileData.postCountText;
      
      if (strategy === "topk") {
        let k = parseInt(document.getElementById("ig-saver-topk-value")?.value, 10) || 20;
        targetCount = k;
        countText = `${k} posts`;
      } else if (strategy === "range") {
        let from = document.getElementById("ig-saver-from")?.value;
        let to = document.getElementById("ig-saver-to")?.value;
        if (from && to) {
          countText = `${formatDisplayBR(from)} a ${formatDisplayBR(to)}`;
        } else if (from) {
          countText = `A partir de ${formatDisplayBR(from)}`;
        } else {
          countText = "Período selecionado";
        }
      }

      if (filterVal === "photos") {
        countText += " (Fotos)";
      } else if (filterVal === "videos") {
        countText += " (Vídeos)";
      }

      let estSecs = targetCount > 0 ? Math.max(5, Math.ceil(targetCount * 0.35)) : 30;
      let estTimeText = estSecs < 60 ? `~${estSecs}s` : `~${Math.ceil(estSecs / 60)} min`;

      if (postsBadge) postsBadge.textContent = countText;
      if (estBadge) estBadge.textContent = estTimeText;
      if (estEl) estEl.textContent = `${estTimeText} (${countText})`;
    }

    function runValidation(val) {}
    function checkOnlyNewMode(val) {}

    // Clean Filters
    let cleanBtn = document.getElementById("ig-saver-clean-filters-btn");
    if (cleanBtn) {
      cleanBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        clearAllFilters();
      });
    }

    // Hook up active filters change observers
    let filterInputs = [
      "ig-saver-filter-hashtag", "ig-saver-filter-likes", 
      "ig-saver-filter-views", "ig-saver-filter-comments", 
      "ig-saver-filter-saves"
    ];
    for (let fid of filterInputs) {
      let el = document.getElementById(fid);
      if (el) {
        el.addEventListener("input", () => {
          updateActiveFiltersBadge();
          updateEstimatePreview();
        });
        el.addEventListener("change", () => {
          updateActiveFiltersBadge();
          updateEstimatePreview();
        });
      }
    }
    updateActiveFiltersBadge();

    // Segmented Control for Media Type (Tudo / Fotos / Vídeos)
    let segmentGroup = document.getElementById("ig-saver-filter-segmented");
    let filterHiddenInput = document.getElementById("ig-saver-filter");
    if (segmentGroup && filterHiddenInput) {
      let buttons = segmentGroup.querySelectorAll(".ig-saver-segment-btn");
      buttons.forEach(btn => {
        btn.addEventListener("click", () => {
          buttons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          filterHiddenInput.value = btn.getAttribute("data-value");
          updateEstimatePreview();
        });
      });
    }

    // Helper for Stepper Numeric Controls
    function setupNumericStepper(inputId, decBtnId, incBtnId, step = 100) {
      let input = document.getElementById(inputId);
      let dec = document.getElementById(decBtnId);
      let inc = document.getElementById(incBtnId);
      if (input && dec && inc) {
        dec.addEventListener("click", () => {
          let curr = parseInt(input.value, 10) || 0;
          input.value = curr > 0 ? String(Math.max(0, curr - step)) : "";
          if (input.value === "0") input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          updateActiveFiltersBadge();
          updateEstimatePreview();
        });
        inc.addEventListener("click", () => {
          let curr = parseInt(input.value, 10) || 0;
          input.value = String(curr + step);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          updateActiveFiltersBadge();
          updateEstimatePreview();
        });
      }
    }
    setupNumericStepper("ig-saver-filter-likes", "ig-saver-likes-dec", "ig-saver-likes-inc", 500);
    setupNumericStepper("ig-saver-filter-views", "ig-saver-views-dec", "ig-saver-views-inc", 1000);
    setupNumericStepper("ig-saver-filter-comments", "ig-saver-comments-dec", "ig-saver-comments-inc", 50);
    setupNumericStepper("ig-saver-filter-saves", "ig-saver-saves-dec", "ig-saver-saves-inc", 25);

    // Debounced Validation for Single Profile Input
    let singleInput = document.getElementById("ig-saver-singleprofile-input");
    if (singleInput) {
      singleInput.addEventListener("input", () => {
        let val = (singleInput.value || "").trim();
        runValidation(val);
        checkOnlyNewMode(val);
        updateEstimatePreview();
      });
      runValidation((singleInput.value || "").trim());
      checkOnlyNewMode((singleInput.value || "").trim());
    }

    // Custom Select for Strategy (Intervalo de Download)
    let customSelect = document.getElementById("ig-saver-strategy-custom");
    let strategyTrigger = document.getElementById("ig-saver-strategy-trigger");
    let strategyHidden = document.getElementById("ig-saver-strategy");
    let strategyLabel = document.getElementById("ig-saver-strategy-label");

    function c() {
      let h = document.getElementById("ig-saver-topk-group"),
        S = document.getElementById("ig-saver-range-group"),
        val = strategyHidden ? strategyHidden.value : "all";
      if (h && S) {
        h.style.display = val === "topk" ? "block" : "none";
        S.style.display = val === "range" ? "block" : "none";
      }
    }

    if (customSelect && strategyTrigger && strategyHidden) {
      strategyTrigger.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        customSelect.classList.toggle("is-open");
      });

      let options = customSelect.querySelectorAll(".ig-saver-select-option");
      options.forEach(opt => {
        opt.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          let val = opt.getAttribute("data-value");
          let labelText = opt.querySelector("span")?.textContent || "";
          
          strategyHidden.value = val;
          if (strategyLabel) strategyLabel.textContent = labelText;

          options.forEach(o => {
            let isActive = (o === opt);
            o.classList.toggle("active", isActive);
            let checkIcon = o.querySelector(".ig-saver-check");
            if (checkIcon) checkIcon.style.display = isActive ? "block" : "none";
          });

          customSelect.classList.remove("is-open");
          c();
          updateEstimatePreview();
        });
      });

      window.addEventListener("click", (evt) => {
        if (!customSelect.contains(evt.target)) {
          customSelect.classList.remove("is-open");
        }
      });
    }

    // TopK value button increments
    let u = document.getElementById("ig-saver-topk-value"),
      p = document.getElementById("ig-saver-topk-dec"),
      g = document.getElementById("ig-saver-topk-inc");
    if (u && p && g) {
      let h = (y) => {
        let S = parseInt(u.value, 10) || 0;
        u.value = String(Math.max(0, S + y));
      };
      (p.addEventListener("click", () => { h(-10); u.dispatchEvent(new Event('input')); }),
        g.addEventListener("click", () => { h(10); u.dispatchEvent(new Event('input')); }));
    }

    // Apple-Style Date Range Picker Controller
    const dateRangePicker = document.getElementById("ig-saver-daterange-picker");
    const dateRangeTrigger = document.getElementById("ig-saver-daterange-trigger");
    const dateRangeDisplay = document.getElementById("ig-saver-daterange-display");
    const dateRangeBadge = document.getElementById("ig-saver-daterange-badge");
    const calPopover = document.getElementById("ig-saver-calendar-popover");
    const fromInput = document.getElementById("ig-saver-from");
    const toInput = document.getElementById("ig-saver-to");
    const calMonthTitle = document.getElementById("ig-saver-cal-month-title");
    const calGrid = document.getElementById("ig-saver-cal-grid");
    const calPrevBtn = document.getElementById("ig-saver-cal-prev");
    const calNextBtn = document.getElementById("ig-saver-cal-next");
    const calInfoText = document.getElementById("ig-saver-cal-info-text");
    const calClearBtn = document.getElementById("ig-saver-cal-clear");
    const calCancelBtn = document.getElementById("ig-saver-cal-cancel");
    const calApplyBtn = document.getElementById("ig-saver-cal-apply");
    const calPresets = document.getElementById("ig-saver-cal-presets");

    if (dateRangePicker && dateRangeTrigger && fromInput && toInput && calGrid) {
      const MONTH_NAMES = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
      ];

      function parseISO(str) {
        if (!str) return null;
        let parts = str.split("-").map(Number);
        if (parts.length !== 3) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }

      function toISO(d) {
        if (!d) return "";
        let y = d.getFullYear();
        let m = String(d.getMonth() + 1).padStart(2, "0");
        let day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }

      function formatDisplayBR(isoStr) {
        if (!isoStr) return "";
        let parts = isoStr.split("-");
        if (parts.length !== 3) return isoStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }

      let now = new Date();
      let todayISO = toISO(now);
      let viewYear = now.getFullYear();
      let viewMonth = now.getMonth();
      let tempStartDate = fromInput.value || null;
      let tempEndDate = toInput.value || null;
      let hoverDate = null;

      function updateTriggerDisplay() {
        let fVal = fromInput.value;
        let tVal = toInput.value;
        if (fVal && tVal) {
          dateRangeDisplay.textContent = `${formatDisplayBR(fVal)} ➔ ${formatDisplayBR(tVal)}`;
          dateRangeDisplay.classList.remove("placeholder");
          let d1 = parseISO(fVal);
          let d2 = parseISO(tVal);
          if (d1 && d2) {
            let diffDays = Math.max(1, Math.round((d2 - d1) / 864e5) + 1);
            dateRangeBadge.textContent = `${diffDays} dia${diffDays > 1 ? "s" : ""}`;
            dateRangeBadge.style.display = "inline-block";
          }
        } else if (fVal) {
          dateRangeDisplay.textContent = `A partir de ${formatDisplayBR(fVal)}`;
          dateRangeDisplay.classList.remove("placeholder");
          dateRangeBadge.style.display = "none";
        } else {
          dateRangeDisplay.textContent = "Selecione o período";
          dateRangeDisplay.classList.add("placeholder");
          dateRangeBadge.style.display = "none";
        }
      }

      function updateFooterInfo() {
        if (tempStartDate && tempEndDate) {
          let minD = tempStartDate < tempEndDate ? tempStartDate : tempEndDate;
          let maxD = tempStartDate < tempEndDate ? tempEndDate : tempStartDate;
          let d1 = parseISO(minD);
          let d2 = parseISO(maxD);
          let diffDays = Math.max(1, Math.round((d2 - d1) / 864e5) + 1);
          calInfoText.textContent = `${formatDisplayBR(minD)} a ${formatDisplayBR(maxD)} (${diffDays}d)`;
          if (calApplyBtn) calApplyBtn.disabled = false;
        } else if (tempStartDate) {
          calInfoText.textContent = `${formatDisplayBR(tempStartDate)} (escolha o outro dia)`;
          if (calApplyBtn) calApplyBtn.disabled = false;
        } else {
          calInfoText.textContent = "Selecione a data inicial";
          if (calApplyBtn) calApplyBtn.disabled = true;
        }
      }

      function updateCalendarSelection() {
        if (!calGrid) return;
        let minD = null;
        let maxD = null;
        if (tempStartDate && tempEndDate) {
          minD = tempStartDate < tempEndDate ? tempStartDate : tempEndDate;
          maxD = tempStartDate < tempEndDate ? tempEndDate : tempStartDate;
        } else if (tempStartDate && !tempEndDate && hoverDate) {
          minD = hoverDate < tempStartDate ? hoverDate : tempStartDate;
          maxD = hoverDate < tempStartDate ? tempStartDate : hoverDate;
        }

        const dayEls = calGrid.querySelectorAll(".ig-saver-cal-day");
        dayEls.forEach(cellEl => {
          let dateISO = cellEl.getAttribute("data-date");
          cellEl.classList.remove("is-single-selected", "is-selected-start", "is-selected-end", "is-in-range", "is-range-hover");

          if (minD && maxD) {
            if (dateISO === minD && dateISO === maxD) {
              cellEl.classList.add("is-single-selected");
            } else if (dateISO === minD) {
              cellEl.classList.add("is-selected-start");
            } else if (dateISO === maxD) {
              cellEl.classList.add("is-selected-end");
            } else if (dateISO > minD && dateISO < maxD) {
              if (tempEndDate) {
                cellEl.classList.add("is-in-range");
              } else {
                cellEl.classList.add("is-range-hover");
              }
            }
          } else if (tempStartDate && !tempEndDate) {
            if (dateISO === tempStartDate) {
              cellEl.classList.add("is-single-selected");
            }
          }
        });

        updateFooterInfo();
      }

      function renderCalendarGrid() {
        if (!calGrid) return;
        calGrid.innerHTML = "";
        calMonthTitle.textContent = `${MONTH_NAMES[viewMonth]} de ${viewYear}`;

        let firstDayOfMonth = new Date(viewYear, viewMonth, 1);
        let startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
        let daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        let daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        // 42 cells (6 weeks x 7 days)
        let cells = [];

        // Previous month trailing days
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
          let dayNum = daysInPrevMonth - i;
          let d = new Date(viewYear, viewMonth - 1, dayNum);
          cells.push({ date: d, otherMonth: true });
        }

        // Current month days
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
          let d = new Date(viewYear, viewMonth, dayNum);
          cells.push({ date: d, otherMonth: false });
        }

        // Next month leading days
        let remaining = 42 - cells.length;
        for (let dayNum = 1; dayNum <= remaining; dayNum++) {
          let d = new Date(viewYear, viewMonth + 1, dayNum);
          cells.push({ date: d, otherMonth: true });
        }

        cells.forEach(cell => {
          let dateISO = toISO(cell.date);
          let isFuture = dateISO > todayISO;
          let cellEl = document.createElement("div");
          cellEl.className = "ig-saver-cal-day";
          cellEl.textContent = cell.date.getDate();
          cellEl.setAttribute("data-date", dateISO);

          if (cell.otherMonth) cellEl.classList.add("other-month");
          if (dateISO === todayISO) cellEl.classList.add("is-today");
          if (isFuture) cellEl.classList.add("is-future");

          if (!isFuture) {
            cellEl.addEventListener("mouseenter", () => {
              if (tempStartDate && !tempEndDate) {
                hoverDate = dateISO;
                updateCalendarSelection();
              }
            });

            cellEl.addEventListener("click", (evt) => {
              evt.preventDefault();
              evt.stopPropagation();

              if (cell.otherMonth) {
                viewYear = cell.date.getFullYear();
                viewMonth = cell.date.getMonth();
                renderCalendarGrid();
              }

              if (!tempStartDate || (tempStartDate && tempEndDate)) {
                tempStartDate = dateISO;
                tempEndDate = null;
                hoverDate = null;
              } else if (tempStartDate && !tempEndDate) {
                if (dateISO < tempStartDate) {
                  tempEndDate = tempStartDate;
                  tempStartDate = dateISO;
                } else {
                  tempEndDate = dateISO;
                }
                hoverDate = null;
              }

              // Remove active preset highlight if manual click
              if (calPresets) {
                calPresets.querySelectorAll(".ig-saver-cal-preset-btn").forEach(b => b.classList.remove("active"));
              }

              updateCalendarSelection();
            });
          }

          calGrid.appendChild(cellEl);
        });

        updateCalendarSelection();
      }

      // Presets logic
      if (calPresets) {
        calPresets.querySelectorAll(".ig-saver-cal-preset-btn").forEach(btn => {
          btn.addEventListener("click", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            let preset = btn.getAttribute("data-preset");
            let t = new Date();
            let start = new Date();
            let end = new Date();

            if (preset === "today") {
              // today
            } else if (preset === "yesterday") {
              start.setDate(t.getDate() - 1);
              end.setDate(t.getDate() - 1);
            } else if (preset === "last7") {
              start.setDate(t.getDate() - 6);
            } else if (preset === "last30") {
              start.setDate(t.getDate() - 29);
            } else if (preset === "thisMonth") {
              start = new Date(t.getFullYear(), t.getMonth(), 1);
              end = t;
            } else if (preset === "lastMonth") {
              start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
              end = new Date(t.getFullYear(), t.getMonth(), 0);
            }

            tempStartDate = toISO(start);
            tempEndDate = toISO(end);
            hoverDate = null;
            viewYear = end.getFullYear();
            viewMonth = end.getMonth();

            calPresets.querySelectorAll(".ig-saver-cal-preset-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            renderCalendarGrid();
          });
        });
      }

      // Prev & Next navigation
      if (calPrevBtn) {
        calPrevBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          viewMonth--;
          if (viewMonth < 0) {
            viewMonth = 11;
            viewYear--;
          }
          renderCalendarGrid();
        });
      }

      if (calNextBtn) {
        calNextBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          viewMonth++;
          if (viewMonth > 11) {
            viewMonth = 0;
            viewYear++;
          }
          renderCalendarGrid();
        });
      }

      if (calGrid) {
        calGrid.addEventListener("mouseleave", () => {
          if (tempStartDate && !tempEndDate && hoverDate) {
            hoverDate = null;
            updateCalendarSelection();
          }
        });
      }

      // Trigger Toggle (Always Opens Upwards, 100% visible)
      dateRangeTrigger.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        let isOpen = dateRangePicker.classList.toggle("is-open");
        if (isOpen) {
          tempStartDate = fromInput.value || null;
          tempEndDate = toInput.value || null;
          hoverDate = null;
          if (tempEndDate) {
            let d = parseISO(tempEndDate);
            if (d) {
              viewYear = d.getFullYear();
              viewMonth = d.getMonth();
            }
          } else if (tempStartDate) {
            let d = parseISO(tempStartDate);
            if (d) {
              viewYear = d.getFullYear();
              viewMonth = d.getMonth();
            }
          }
          calPopover.style.bottom = "calc(100% + 8px)";
          calPopover.style.top = "auto";
          renderCalendarGrid();
        }
      });

      // Clear button
      if (calClearBtn) {
        calClearBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          tempStartDate = null;
          tempEndDate = null;
          hoverDate = null;
          fromInput.value = "";
          toInput.value = "";
          updateTriggerDisplay();
          fromInput.dispatchEvent(new Event("change"));
          toInput.dispatchEvent(new Event("change"));
          if (calPresets) {
            calPresets.querySelectorAll(".ig-saver-cal-preset-btn").forEach(b => b.classList.remove("active"));
          }
          updateCalendarSelection();
        });
      }

      // Cancel button
      if (calCancelBtn) {
        calCancelBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          tempStartDate = fromInput.value || null;
          tempEndDate = toInput.value || null;
          hoverDate = null;
          dateRangePicker.classList.remove("is-open");
        });
      }

      // Apply button
      if (calApplyBtn) {
        calApplyBtn.addEventListener("click", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          if (tempStartDate && !tempEndDate) {
            tempEndDate = tempStartDate;
          }
          fromInput.value = tempStartDate || "";
          toInput.value = tempEndDate || "";
          updateTriggerDisplay();
          fromInput.dispatchEvent(new Event("change"));
          toInput.dispatchEvent(new Event("change"));
          dateRangePicker.classList.remove("is-open");
        });
      }

      // Close on click outside
      window.addEventListener("click", (evt) => {
        if (!dateRangePicker.contains(evt.target)) {
          dateRangePicker.classList.remove("is-open");
        }
      });

      // Initial display update
      updateTriggerDisplay();
    }

    // Estimate Preview Hookups
    updateEstimatePreview();
    document.getElementById("ig-saver-topk-value")?.addEventListener("input", updateEstimatePreview);
    document.getElementById("ig-saver-from")?.addEventListener("change", updateEstimatePreview);
    document.getElementById("ig-saver-to")?.addEventListener("change", updateEstimatePreview);

    function f() {
      ((n.style.transform = "scale(0.95) translateY(8px)"),
        (n.style.opacity = "0"),
        (t.style.opacity = "0"),
        setTimeout(() => t.remove(), 200));
    }

    document.getElementById("ig-saver-cancel").addEventListener("click", f);
    t.addEventListener("click", (h) => {
      h.target === t && f();
    });

    // Step 1 -> Step 2 transition
    let startBtn = document.getElementById("ig-saver-start");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        let targetUser = "@" + (document.getElementById("ig-saver-singleprofile-input")?.value || "").trim().replace(/^@/, "");
        if (targetUser === "@") {
          alert("Por favor, digite o nome do perfil.");
          return;
        }

        document.getElementById("ig-saver-confirm-val-target").textContent = targetUser;
        
        let filterVal = document.getElementById("ig-saver-filter").value;
        let filterText = filterVal === "all" ? _("dialog_media_all") : (filterVal === "photos" ? _("dialog_media_photos") : _("dialog_media_videos"));
        document.getElementById("ig-saver-confirm-val-media").textContent = filterText;
        
        let saveVal = document.getElementById("ig-saver-folder-mode").value;
        let saveText = saveVal === "flat" ? _("dialog_save_flat") : _("dialog_save_grouped");
        document.getElementById("ig-saver-confirm-val-save").textContent = saveText;
        
        let activeFiltersCount = updateActiveFiltersBadge();
        let activeText = activeFiltersCount > 0 ? `${activeFiltersCount} ativo${activeFiltersCount === 1 ? "" : "s"}` : "Nenhum";
        document.getElementById("ig-saver-confirm-val-filters").textContent = activeText;
        
        updateEstimatePreview();
        
        document.getElementById("ig-saver-step1-view").style.display = "none";
        document.getElementById("ig-saver-step2-view").style.display = "block";
      });
    }

    // Step 2 buttons
    let backBtn = document.getElementById("ig-saver-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        document.getElementById("ig-saver-step2-view").style.display = "none";
        document.getElementById("ig-saver-step1-view").style.display = "block";
      });
    }

    let confirmBtn = document.getElementById("ig-saver-confirm-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        confirmBtn.disabled = true;
        if (backBtn) backBtn.disabled = true;
        confirmBtn.innerHTML = `<div class="ig-saver-spinner"></div> ${_("dialog_status_preparing") || "Preparando..."}`;

        let h = document.getElementById("ig-saver-filter").value,
          y = d.value,
          S = { mode: "all", fromTs: null, toTs: null, nDays: null },
          E = 0;
        let minLikes = parseInt(document.getElementById("ig-saver-filter-likes")?.value, 10) || 0;
        let minViews = parseInt(document.getElementById("ig-saver-filter-views")?.value, 10) || 0;
        let minComments = parseInt(document.getElementById("ig-saver-filter-comments")?.value, 10) || 0;
        let minSaves = parseInt(document.getElementById("ig-saver-filter-saves")?.value, 10) || 0;
        let hashtag = document.getElementById("ig-saver-filter-hashtag")?.value || "";
        
        if (y === "topk")
          E = Math.max(
            1,
            parseInt(document.getElementById("ig-saver-topk-value").value) ||
              1,
          );
        else if (y === "lastNDays") {
          let x = parseInt(document.getElementById("ig-saver-ndays").value);
          S = {
            mode: "lastNDays",
            fromTs: Math.floor((Date.now() - x * 864e5) / 1e3),
            toTs: null,
            nDays: x,
          };
        } else if (y === "range") {
          let x = document.getElementById("ig-saver-from").value,
            T = document.getElementById("ig-saver-to").value,
            V = x
              ? Math.floor(new Date(x + "T00:00:00").getTime() / 1e3)
              : null,
            $e = T
              ? Math.floor(new Date(T + "T23:59:59").getTime() / 1e3)
              : null;
          S = { mode: "range", fromTs: V, toTs: $e, nDays: null };
        }

        let onlyNewActive = document.getElementById("ig-saver-only-new-toggle")?.checked;
        if (onlyNewActive) {
          let lastTs = parseInt(document.getElementById("ig-saver-only-new-row")?.getAttribute("data-timestamp"), 10);
          if (lastTs) {
            S = { mode: "range", fromTs: lastTs, toTs: null, nDays: null };
          }
        }

        let I = true, // Force flat folder mode (always download all files in one folder)
          v =
            !re() &&
            document.getElementById("ig-saver-include-highlights")
              ?.checked === !0,
          k =
            !re() &&
            document.getElementById("ig-saver-include-stories")?.checked ===
              !0,
          A = re() ? "reels" : "profile";

        (async () => {
          if (v) {
            let T = await xe();
            if (!Se(T)) {
              Z({ reason: "extras", getTheme: L });
              f();
              return;
            }
          }
          
          setTimeout(async () => {
            f();
            let username = (document.getElementById("ig-saver-singleprofile-input")?.value || "").trim().replace(/^@/, "");

            saveToHistory([username]);

            let x = await an(username, h, S, E, I, A, minLikes, minViews, minComments, hashtag, minSaves);
            x &&
              (v || k) &&
              B.set(x, {
                username: username,
                includeHighlights: v,
                includeStories: k,
              });
          }, 600);
        })();
      });
    }

    if (re()) {
      let h = document.getElementById("ig-saver-filter");
      h && (h.value = "videos");
    }
    ja();
  }
  var ra =
    "https://chromewebstore.google.com/detail/ig-saver-2026-%E2%80%94-instagram/mmnhfflobddadjfnimkdhnpafpoggboo/reviews";
  async function Ya() {}
  function Qa(i) {
    if (
      document.getElementById("ig-saver-review") ||
      document.getElementById("ig-saver-legacy-thanks")
    )
      return;
    let e = L(),
      t = document.createElement("div");
    ((t.id = "ig-saver-review"),
      (t.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${e.overlay}; z-index: 10001;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease;
  `));
    let n = document.createElement("div");
    n.style.cssText = `
    background: ${e.bg}; border-radius: 16px; padding: 28px;
    min-width: 320px; max-width: 400px; width: 85vw;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transform: scale(0.95) translateY(8px); opacity: 0;
    transition: transform 0.25s ease, opacity 0.25s ease;
    text-align: center;
  `;
    let a = document.createElement("div");
    ((a.style.cssText = "font-size: 32px; margin-bottom: 12px;"),
      (a.textContent = "\u2B50\u2B50\u2B50\u2B50\u2B50"));
    let o = document.createElement("div");
    ((o.style.cssText = `
    font-size: 18px; font-weight: 700; color: ${e.text};
    margin-bottom: 10px;
  `),
      (o.textContent = _("review_title")));
    let r = document.createElement("div");
    ((r.style.cssText = `
    font-size: 14px; color: ${e.textSecondary};
    line-height: 1.6; margin-bottom: 24px;
  `),
      (r.textContent = _("review_message", { count: i })));
    let s = document.createElement("a");
    ((s.href = ra),
      (s.target = "_blank"),
      (s.rel = "noopener noreferrer"),
      (s.style.cssText = `
    display: block; width: 100%; padding: 12px 0;
    background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
    color: #fff; border: none; border-radius: 10px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    text-decoration: none; text-align: center;
    margin-bottom: 10px; box-sizing: border-box;
    transition: opacity 0.15s ease;
  `),
      (s.textContent = _("review_btn_rate")),
      s.addEventListener("mouseenter", () => {
        s.style.opacity = "0.9";
      }),
      s.addEventListener("mouseleave", () => {
        s.style.opacity = "1";
      }));
    let l = document.createElement("button");
    ((l.style.cssText = `
    display: block; width: 100%; padding: 10px 0;
    background: transparent; color: ${e.text};
    border: 1px solid ${e.border}; border-radius: 10px;
    font-size: 14px; cursor: pointer;
    margin-bottom: 8px; box-sizing: border-box;
    transition: background 0.15s ease;
  `),
      (l.textContent = _("review_btn_later")),
      l.addEventListener("mouseenter", () => {
        l.style.background = e.hoverBg;
      }),
      l.addEventListener("mouseleave", () => {
        l.style.background = "transparent";
      }));
    let d = document.createElement("button");
    ((d.style.cssText = `
    display: block; width: 100%; padding: 8px 0;
    background: transparent; color: ${e.textSecondary};
    border: none; font-size: 13px; cursor: pointer;
    box-sizing: border-box;
  `),
      (d.textContent = _("review_btn_never")),
      n.append(a, o, r, s, l, d),
      t.appendChild(n),
      document.body.appendChild(t),
      requestAnimationFrame(() => {
        ((t.style.opacity = "1"),
          (n.style.transform = "scale(1) translateY(0)"),
          (n.style.opacity = "1"));
      }));
    let c = () => {
      ((t.style.opacity = "0"),
        (n.style.transform = "scale(0.95) translateY(8px)"),
        (n.style.opacity = "0"),
        setTimeout(() => t.remove(), 250));
    };
    (s.addEventListener("click", () => {
      (X.dismissReview().catch(() => {}), c());
    }),
      l.addEventListener("click", () => {
        (X.postponeReview().catch(() => {}), c());
      }),
      d.addEventListener("click", () => {
        (X.dismissReview().catch(() => {}), c());
      }),
      t.addEventListener("click", (u) => {
        u.target === t && c();
      }));
  }
  async function Ja() {
    try {
      let i = await chrome.storage.local.get([
        "pro_legacy_user",
        "pro_legacy_thanks_shown",
        "pro_legacy_from_version",
      ]);
      if (i.pro_legacy_user !== !0 || i.pro_legacy_thanks_shown === !0) return;
      let e =
        typeof i.pro_legacy_from_version == "string"
          ? i.pro_legacy_from_version
          : "";
      setTimeout(() => en(e), 3e3);
    } catch {}
  }
  function en(i) {
    if (document.getElementById("ig-saver-legacy-thanks")) return;
    let e = L(),
      t = document.createElement("div");
    ((t.id = "ig-saver-legacy-thanks"),
      (t.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: ${e.overlay}; z-index: 10001;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease;
  `));
    let n = document.createElement("div");
    n.style.cssText = `
    background: ${e.bg}; border-radius: 16px; padding: 28px;
    min-width: 320px; max-width: 420px; width: 85vw;
    box-shadow: 0 12px 40px rgba(0,0,0,0.35);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transform: scale(0.95) translateY(8px); opacity: 0;
    transition: transform 0.25s ease, opacity 0.25s ease;
    text-align: center;
  `;
    let a = document.createElement("div");
    ((a.style.cssText = "font-size: 36px; margin-bottom: 12px;"),
      (a.textContent = "\u{1F31F}"));
    let o = document.createElement("div");
    ((o.style.cssText = `
    font-size: 18px; font-weight: 700; color: ${e.text};
    margin-bottom: 10px;
  `),
      (o.textContent = _("legacy_thanks_title")));
    let r = document.createElement("div");
    ((r.style.cssText = `
    font-size: 14px; color: ${e.textSecondary};
    line-height: 1.6; margin-bottom: 24px;
  `),
      (r.textContent = _("legacy_thanks_message", { version: i })));
    let s = document.createElement("a");
    ((s.href = ra),
      (s.target = "_blank"),
      (s.rel = "noopener noreferrer"),
      (s.style.cssText = `
    display: block; width: 100%; padding: 12px 0;
    background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
    color: #fff; border: none; border-radius: 10px;
    font-size: 15px; font-weight: 600; cursor: pointer;
    text-decoration: none; text-align: center;
    margin-bottom: 10px; box-sizing: border-box;
    transition: opacity 0.15s ease;
  `),
      (s.textContent = _("legacy_thanks_btn_review")));
    let l = document.createElement("button");
    ((l.style.cssText = `
    display: block; width: 100%; padding: 10px 0;
    background: transparent; color: ${e.text};
    border: 1px solid ${e.border}; border-radius: 10px;
    font-size: 14px; cursor: pointer;
    box-sizing: border-box;
    transition: background 0.15s ease;
  `),
      (l.textContent = _("legacy_thanks_btn_done")),
      n.append(a, o, r, s, l),
      t.appendChild(n),
      document.body.appendChild(t),
      requestAnimationFrame(() => {
        ((t.style.opacity = "1"),
          (n.style.transform = "scale(1) translateY(0)"),
          (n.style.opacity = "1"));
      }));
    let d = async () => {
      ((t.style.opacity = "0"),
        (n.style.transform = "scale(0.95) translateY(8px)"),
        (n.style.opacity = "0"),
        setTimeout(() => t.remove(), 250),
        await chrome.storage.local.set({ pro_legacy_thanks_shown: !0 }));
      try {
        await X.postponeReview();
      } catch {}
    };
    (s.addEventListener("click", () => void d()),
      l.addEventListener("click", () => void d()));
  }
  var downloadState = { startTime: null, taskId: null, startDownloaded: 0 };
  var progressInterval = null;
  var progressPollPending = false;

  function formatTimeRemaining(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return "";
    if (seconds < 60) return `${seconds}s`;
    let minutes = Math.floor(seconds / 60);
    let remSeconds = seconds % 60;
    return `${minutes}m ${remSeconds}s`;
  }

  function startProgressPolling(taskId, username) {
    if (progressInterval) clearInterval(progressInterval);
    progressPollPending = false;
    progressInterval = setInterval(async () => {
      if (progressPollPending) return;
      progressPollPending = true;
      try {
        let res = await w({ type: "GET_TASKS" });
        let task = res?.tasks?.find(t => t.taskId === taskId);

        let statusTextEl = document.getElementById("ig-saver-status-text");
        let statusCountEl = document.getElementById("ig-saver-status-count");
        let progressContainer = document.getElementById("ig-saver-progress-container");
        let progressBar = document.getElementById("ig-saver-progress-bar");
        let timeEl = document.getElementById("ig-saver-status-time");
        let failedEl = document.getElementById("ig-saver-status-failed");
        let btnPauseText = document.getElementById("ig-saver-btn-pause-text");
        let btnPauseIcon = document.getElementById("ig-saver-btn-pause-icon");

        if (!task) {
          clearInterval(progressInterval);
          progressInterval = null;
          if (statusTextEl) statusTextEl.textContent = _("status_stopped");
          setTimeout(Q, 2000);
          return;
        }

        if (btnPauseText && btnPauseIcon) {
          if (task.status === "paused") {
            btnPauseText.textContent = "Retomar";
            btnPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>`;
          } else {
            btnPauseText.textContent = "Pausar";
            btnPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>`;
          }
        }

        if (task.status === "done") {
          clearInterval(progressInterval);
          progressInterval = null;
          if (statusTextEl) statusTextEl.textContent = _("status_scan_complete");
          if (progressBar) progressBar.style.width = "100%";
          if (statusCountEl) {
            let skipped = task.totalMediaSkippedDuplicates || 0;
            statusCountEl.textContent = `${task.totalMediaDownloaded || 0} baixados, ${task.totalMediaFailed || 0} falharam${skipped ? `, ${skipped} duplicados pulados` : ""}`;
          }
          if (timeEl) timeEl.textContent = "Concluído!";
          setTimeout(Q, 4000);
          return;
        }

        if (task.status === "stopped") {
          clearInterval(progressInterval);
          progressInterval = null;
          if (statusTextEl) statusTextEl.textContent = _("status_stopped");
          setTimeout(Q, 2000);
          return;
        }

        if (task.status === "error") {
          clearInterval(progressInterval);
          progressInterval = null;
          if (statusTextEl) statusTextEl.textContent = "Erro!";
          setTimeout(Q, 3000);
          return;
        }

        if (task.zipBuilding) {
          if (progressContainer) progressContainer.style.display = "block";

          if (task.zipBuilding.phase === "zipping") {
            let zipPercent = task.zipBuilding.zipPercent ?? 0;
            if (statusTextEl) statusTextEl.textContent = "Criando arquivo ZIP...";
            if (statusCountEl) statusCountEl.textContent = `Compactando mídias: ${zipPercent}%`;
            if (progressBar) progressBar.style.width = `${zipPercent}%`;
            if (timeEl) timeEl.textContent = "Quase pronto...";
          } else {
            let total = task.totalMediaFound || 0;
            let downloaded = task.totalMediaDownloaded + (task.zipBuilding.current || 0);
            if (downloaded > total) downloaded = total;

            let percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            if (statusTextEl) statusTextEl.textContent = "Baixando mídias...";
            if (statusCountEl) statusCountEl.textContent = `${downloaded} / ${total} arquivos (${percent}%)`;
            if (progressBar) progressBar.style.width = `${percent}%`;

            if (downloadState.taskId !== taskId) {
              downloadState = { startTime: Date.now(), taskId: taskId, startDownloaded: downloaded };
            } else if (!downloadState.startTime) {
              downloadState.startTime = Date.now();
              downloadState.startDownloaded = downloaded;
            }

            let elapsedSec = (Date.now() - downloadState.startTime) / 1000;
            let filesDownloaded = downloaded - downloadState.startDownloaded;
            if (filesDownloaded > 0 && elapsedSec > 0.5) {
              let speed = filesDownloaded / elapsedSec;
              let remainingFiles = total - downloaded;
              let remSec = Math.ceil(remainingFiles / speed);
              if (timeEl) timeEl.textContent = "Restante: " + formatTimeRemaining(remSec);
            } else {
              if (timeEl) timeEl.textContent = "Restante: calculando...";
            }
          }
        } else {
          if (progressContainer) progressContainer.style.display = "none";
          if (timeEl) timeEl.textContent = "";

          if (task.status === "paused") {
            if (statusTextEl) statusTextEl.textContent = "Pausado";
          } else {
            if (statusTextEl) statusTextEl.textContent = "Escaneando perfil...";
          }

          if (statusCountEl) {
            let detail = _("status_count", { posts: task.seenPostCount, media: task.totalMediaFound });
            if (task.oldestTs && task.oldestTs > 0) {
              detail += `\n${_("status_scanned_to", { date: tn(task.oldestTs) })}`;
            }
            statusCountEl.textContent = detail;
            statusCountEl.style.whiteSpace = "pre-line";
          }
        }

        if (failedEl) {
          if (task.totalMediaFailed > 0) {
            failedEl.textContent = `Falhas: ${task.totalMediaFailed}`;
            failedEl.style.color = "#ed4956";
          } else {
            failedEl.textContent = "";
          }
        }
      } catch (err) {
        console.error("[ig-saver] Polling error:", err);
      } finally {
        progressPollPending = false;
      }
    }, 1000);
  }

  function he(i, e) {
    H = i;
    if (downloadState.taskId !== i) {
      downloadState = { startTime: null, taskId: i, startDownloaded: 0 };
    }

    let t = document.getElementById("ig-saver-status");
    if (t) {
      startProgressPolling(i, e);
      return;
    }

    let n = L(),
      a = document.createElement("div");
    ((a.id = "ig-saver-status"),
      (a.style.cssText = `
    position: fixed; top: 70px; right: 20px; z-index: 10000;
    background: ${Ia() ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.85)"};
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-radius: 16px; padding: 16px 20px;
    box-shadow: 0 10px 30px rgba(131, 58, 180, 0.15), 0 5px 15px rgba(0,0,0,0.1); min-width: 240px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; color: ${n.text};
    border: 1px solid ${Ia() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"};
    transform: translateY(-16px); opacity: 0;
    transition: transform 0.3s ease, opacity 0.3s ease;
  `),
      (a.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#833AB4"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
           style="animation: igSaverSpin 1s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      @${e}
    </div>
    <div id="ig-saver-status-text" style="margin-bottom: 4px; font-weight: 600;">${_("status_scanning")}</div>
    <div id="ig-saver-status-count" style="color: ${n.textSecondary}; font-weight: 500; font-size: 12px;">${_("status_posts_found")}</div>

    <div id="ig-saver-progress-container" style="display: none; width: 100%; height: 6px; background: ${Ia() ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}; border-radius: 3px; margin: 10px 0 6px 0; overflow: hidden;">
      <div id="ig-saver-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #FF304F, #8A2387); transition: width 0.3s ease; border-radius: 3px;"></div>
    </div>

    <div style="display: flex; justify-content: space-between; font-size: 11px; color: ${n.textSecondary}; margin-top: 4px;">
      <span id="ig-saver-status-time"></span>
      <span id="ig-saver-status-failed"></span>
    </div>

    <div id="ig-saver-actions" style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
      <button id="ig-saver-btn-pause" class="ig-saver-btn-status" style="padding: 6px 12px; font-size: 12px; border-radius: 8px; border: 1px solid ${Ia() ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}; background: transparent; color: ${n.text}; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; font-family: inherit; transition: all 0.2s ease; outline: none;">
        <svg id="ig-saver-btn-pause-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
          <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
        </svg>
        <span id="ig-saver-btn-pause-text">Pausar</span>
      </button>
      <button id="ig-saver-btn-stop" class="ig-saver-btn-stop-status" style="padding: 6px 12px; font-size: 12px; border-radius: 8px; border: 1px solid rgba(237, 73, 86, 0.2); background: rgba(237, 73, 86, 0.05); color: #ed4956; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600; font-family: inherit; transition: all 0.2s ease; outline: none;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"></rect>
        </svg>
        <span>Parar</span>
      </button>
    </div>
  `));

    if (!document.getElementById("ig-saver-keyframes")) {
      let o = document.createElement("style");
      ((o.id = "ig-saver-keyframes"),
        (o.textContent = `
          @keyframes igSaverSpin { to { transform: rotate(360deg); } }
          .ig-saver-btn-status:hover { background: ${Ia() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"} !important; border-color: ${Ia() ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"} !important; transform: scale(1.03); }
          .ig-saver-btn-status:active { transform: scale(0.97); }
          .ig-saver-btn-stop-status:hover { background: rgba(237, 73, 86, 0.12) !important; border-color: rgba(237, 73, 86, 0.4) !important; transform: scale(1.03); }
          .ig-saver-btn-stop-status:active { transform: scale(0.97); }
        `),
        document.head.appendChild(o));
    }

    document.body.appendChild(a);

    let btnPause = a.querySelector("#ig-saver-btn-pause");
    let btnStop = a.querySelector("#ig-saver-btn-stop");

    btnPause.addEventListener("click", async () => {
      try {
        btnPause.disabled = true;
        let res = await w({ type: "GET_TASKS" });
        let task = res?.tasks?.find(t => t.taskId === i);
        if (task) {
          if (task.status === "paused") {
            await w({ type: "RESUME_TASK", payload: { taskId: i } });
          } else {
            await w({ type: "PAUSE_TASK", payload: { taskId: i } });
          }
        }
      } catch (err) {
        console.error("[ig-saver] Pause/Resume error:", err);
      } finally {
        btnPause.disabled = false;
      }
    });

    btnStop.addEventListener("click", async () => {
      try {
        btnStop.disabled = true;
        btnPause.disabled = true;
        await w({ type: "STOP_TASK", payload: { taskId: i, discardScanned: false } });
      } catch (err) {
        console.error("[ig-saver] Stop error:", err);
      }
    });

    startProgressPolling(i, e);

    requestAnimationFrame(() => {
      ((a.style.transform = "translateY(0)"), (a.style.opacity = "1"));
    });
  }

  function Q() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    let i = document.getElementById("ig-saver-status");
    i &&
      ((i.style.transform = "translateY(-16px)"),
      (i.style.opacity = "0"),
      setTimeout(() => i.remove(), 300));
  }
  function tn(i) {
    let e = new Date(i * 1e3),
      t = e.getFullYear(),
      n = String(e.getMonth() + 1).padStart(2, "0"),
      a = String(e.getDate()).padStart(2, "0");
    return `${t}/${n}/${a}`;
  }
  function M(i, e) {
    let t = document.getElementById("ig-saver-status-text"),
      n = document.getElementById("ig-saver-status-count");
    if ((t && (t.textContent = i), n && e)) {
      let a = _("status_count", { posts: e.posts, media: e.media });
      if (e.zipChunkSize && e.zipChunkSize > 0 && e.media > e.zipChunkSize) {
        let o = Math.ceil(e.media / e.zipChunkSize);
        a += ` ${_("status_count_zips", { parts: o })}`;
      }
      (e.oldestTs &&
        e.oldestTs > 0 &&
        (a += `
${_("status_scanned_to", { date: tn(e.oldestTs) })}`),
        (n.textContent = a),
        (n.style.whiteSpace = "pre-line"));
    }
  }
  async function an(
    i,
    e,
    t,
    n = 0,
    a = !1,
    o = "profile",
    minLikes = 0,
    minViews = 0,
    minComments = 0,
    hashtag = "",
    minSaves = 0,
  ) {
    try {
      let r = document.cookie.match(/csrftoken=([^;]+)/),
        s = r ? r[1].trim() : void 0,
        l = await w({
          type: "START_BULK_DOWNLOAD",
          payload: {
            username: i,
            filter: e,
            dateFilter: t,
            downloadAsZip: !0,
            topK: n,
            flatFolder: a,
            source: o,
            csrfToken: s,
            minLikes: minLikes,
            minViews: minViews,
            minComments: minComments,
            hashtag: hashtag,
            minSaves: minSaves,
          },
        });
      if (!l) throw new Error('O processo de download não respondeu. Reinicie o ViralDog e tente novamente.');
      if (l.error === "pro_required") {
        let c = l.reason ?? "generic";
        return (Z({ reason: c, getTheme: L }), null);
      }
      if (l.error)
        return (m(_("notify_error", { message: l.error }), "error"), null);
      let d = l.task;
      return (
        (H = d.taskId),
        m(_("notify_started", { username: i }), "success"),
        he(d.taskId, i),
        d.taskId
      );
    } catch (r) {
      return (m(_("notify_error", { message: D(r.message) }), "error"), null);
    }
  }
  var B = new Map();
  function m(i, e, t = !1) {
    e === "success" && t && (Ja(), Ya());
    let n = document.getElementById("ig-saver-toast");
    n && n.remove();
    let a =
        e === "success"
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      o = document.createElement("div");
    ((o.id = "ig-saver-toast"),
      (o.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10002;
    padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 600;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    background: ${e === "success" ? "linear-gradient(135deg, #10B981, #059669)" : "linear-gradient(135deg, #EF4444, #DC2626)"};
    display: flex; align-items: center; gap: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    transform: translateX(120%); transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
  `),
      (o.innerHTML = `${a}<span>${i}</span>`),
      document.body.appendChild(o),
      requestAnimationFrame(() => {
        o.style.transform = "translateX(0)";
      }),
      setTimeout(() => {
        ((o.style.transform = "translateX(120%)"),
          (o.style.opacity = "0"),
          setTimeout(() => o.remove(), 350));
      }, 4e3));
  }
  chrome.runtime.onMessage.addListener((i, e, t) => {
    if (i?.type === "OPEN_DOWNLOAD_DIALOG") {
      try {
        Xa();
      } catch (n) {
        console.error("[ig-saver] openDownloadDialog failed:", n);
      }
      return (t({ ok: !0 }), !1);
    }
    if (i?.type === "SHOW_UPGRADE_DIALOG") {
      try {
        Z({ reason: "generic", getTheme: L });
      } catch (n) {
        console.error("[ig-saver] showUpgradeDialog failed:", n);
      }
      return (t({ ok: !0 }), !1);
    }
    if (i.type === "SCAN_PROGRESS") {
      let {
          taskId: n,
          username: a,
          status: o,
          posts: r,
          media: s,
          oldestTs: l,
          message: d,
          zipChunkSize: c,
        } = i.payload,
        u = O();
      if (a !== u) return (t({ ok: !0 }), !0);
      document.getElementById("ig-saver-status") || ((H = n), he(n, a));
      let p = { posts: r, media: s, oldestTs: l, zipChunkSize: c };
      switch (o) {
        case "scanning":
        case "waiting":
        case "processing":
          M(d || _(`status_${o === "waiting" ? "waiting_next" : o}`), p);
          break;
        case "rate_limited":
          M(d || _("rate_wait", { seconds: "..." }), p);
          break;
        case "done":
          if (a) markProfileDownloaded(a);
          M(_("status_scan_complete"), p);
          m(_("notify_found_posts", { posts: r, media: s }), "success", !0);
          if (B.has(n)) {
            let g = B.get(n);
            (B.delete(n),
              Jt(g.username, {
                includeHighlights: g.includeHighlights,
                includeStories: g.includeStories,
              }));
          } else if (!progressInterval) {
            (H = null), setTimeout(Q, 5e3);
          }
          break;
        case "error":
          M(_("notify_error", { message: d || "Unknown error" }));
          if (B.has(n)) {
            let g = B.get(n);
            (B.delete(n),
              Jt(g.username, {
                includeHighlights: g.includeHighlights,
                includeStories: g.includeStories,
              }));
          } else if (!progressInterval) {
            (H = null), setTimeout(Q, 5e3);
          }
          break;
        case "paused":
          M(_("task_status_paused"));
          break;
        case "stopped":
          M(_("status_stopped"));
          B.delete(n);
          if (!progressInterval) {
            (H = null), setTimeout(Q, 3e3);
          }
          break;
        case "saving":
          M(_("status_saving_scanned"));
          B.delete(n);
          if (!progressInterval) {
            (H = null), setTimeout(Q, 1e4);
          }
          break;
      }
      return (t({ ok: !0 }), !0);
    }
    return !0;
  });
  function nn() {
    let i = document.querySelector('div[role="dialog"]'),
      t = (i || document.body).querySelectorAll("img[srcset], img[src], video"),
      n = null,
      a = 0;
    for (let l of t) {
      let d = l.getBoundingClientRect(),
        c = d.width * d.height;
      c > a && d.width >= 150 && d.height >= 150 && ((a = c), (n = l));
    }
    if (!n) return null;
    let o = n.getBoundingClientRect(),
      r = null,
      s = n.parentElement;
    for (; s && s !== document.body && s !== i; ) {
      let l = s.getBoundingClientRect();
      if (
        s.tagName.toLowerCase() === "div" &&
        l.width >= 200 &&
        l.height >= 200
      )
        if (l.width <= o.width * 1.2) r = s;
        else break;
      s = s.parentElement;
    }
    return r;
  }
  function st(i = 0) {
    if (document.getElementById("ig-saver-single-btn") || (!tt() && !De()))
      return;
    let e = na();
    if (!e) return;
    let t = De(),
      n = Ma(),
      a = nn();
    if (!a) {
      i < 15 && setTimeout(() => st(i + 1), 500 + i * 200);
      return;
    }
    window.getComputedStyle(a).position === "static" &&
      (a.style.position = "relative");
    let r = document.createElement("button");
    ((r.id = "ig-saver-single-btn"),
      (r.type = "button"),
      r.setAttribute("aria-label", _("aria_download_post")),
      (r.style.cssText = `
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 9999;
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(0, 0, 0, 0.55);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  `),
      (r.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  `),
      r.addEventListener("mouseenter", () => {
        r.style.background = "rgba(0, 0, 0, 0.75)";
      }),
      r.addEventListener("mouseleave", () => {
        r.style.background = "rgba(0, 0, 0, 0.55)";
      }),
      r.addEventListener("click", (s) => {
        (s.preventDefault(), s.stopPropagation(), ht(n, e, r, t));
      }),
      a.appendChild(r),
      a.addEventListener("mouseenter", () => {
        r.style.opacity = "1";
      }),
      a.addEventListener("mouseleave", () => {
        r.disabled || (r.style.opacity = "0");
      }),
      a.matches(":hover") && (r.style.opacity = "1"));
  }
  function R() {
    let i = document.getElementById("ig-saver-single-btn");
    i && i.remove();
  }
  function on() {
    let i = null,
      e = 0;
    for (let a of document.querySelectorAll("video")) {
      let o = a.getBoundingClientRect();
      if (o.width < 200 || o.height < 300) continue;
      let r = Math.max(o.top, 0),
        s = Math.min(o.bottom, window.innerHeight),
        l = Math.max(o.left, 0),
        d = Math.min(o.right, window.innerWidth);
      if (s <= r || d <= l) continue;
      let c = (s - r) * (d - l);
      c > e && ((e = c), (i = a));
    }
    if (!i) return null;
    let t = i.getBoundingClientRect(),
      n = i.parentElement;
    for (; n && n !== document.body; ) {
      let a = window.getComputedStyle(n);
      if (a.position === "relative" || a.position === "absolute") {
        let o = n.getBoundingClientRect();
        if (
          o.width >= t.width * 0.9 &&
          o.width <= t.width * 1.1 &&
          o.height >= t.height * 0.85 &&
          o.height <= t.height * 1.15
        )
          return n;
      }
      n = n.parentElement;
    }
    for (n = i.parentElement; n && n !== document.body; ) {
      let a = window.getComputedStyle(n);
      if (
        (a.position === "relative" || a.position === "absolute") &&
        n.getBoundingClientRect().width >= 200
      )
        return n;
      n = n.parentElement;
    }
    return null;
  }
  var me = null,
    reelsClickCapture = null;
  function clearReelsClickCapture() {
    reelsClickCapture &&
      (document.removeEventListener("click", reelsClickCapture, !0),
      (reelsClickCapture = null));
  }
  function U(i = 0, e) {
    if (!le()) return;
    let t = e ?? na();
    if (
      !t ||
      (e || (me = t), t !== me) ||
      document.getElementById("ig-saver-reels-btn")
    )
      return;
    let n = on();
    if (!n) {
      i < 12 && setTimeout(() => U(i + 1, t), 300 + i * 150);
      return;
    }
    clearReelsClickCapture();
    let a = document.createElement("button");
    ((a.id = "ig-saver-reels-btn"),
      (a.type = "button"),
      a.setAttribute("aria-label", _("aria_download_reel")),
      (a.style.cssText = `
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 9999;
    width: 36px;
    height: 36px;
    padding: 0;
    background: rgba(0, 0, 0, 0.55);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  `),
      (a.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  `),
      a.addEventListener("mouseenter", () => {
        a.style.background = "rgba(0, 0, 0, 0.75)";
      }),
      a.addEventListener("mouseleave", () => {
        a.style.background = "rgba(0, 0, 0, 0.55)";
      }),
      a.addEventListener("click", (r) => {
        (r.preventDefault(), r.stopPropagation(), oa(t, a, !0));
      }),
      (reelsClickCapture = (r) => {
        if (!a.isConnected || Number(window.getComputedStyle(a).opacity) < 0.1)
          return;
        let s = a.getBoundingClientRect();
        if (
          r.clientX < s.left ||
          r.clientX > s.right ||
          r.clientY < s.top ||
          r.clientY > s.bottom
        )
          return;
        (r.preventDefault(),
          r.stopPropagation(),
          r.stopImmediatePropagation(),
          oa(t, a, !0));
      }),
      document.addEventListener("click", reelsClickCapture, !0),
      n.appendChild(a),
      n.addEventListener("mouseenter", () => {
        a.style.opacity = "1";
      }),
      n.addEventListener("mousemove", () => {
        a.style.opacity = "1";
      }),
      n.addEventListener("mouseleave", () => {
        a.disabled || (a.style.opacity = "0");
      }));
    let o = n.getBoundingClientRect();
    pe >= o.left &&
      pe <= o.right &&
      ge >= o.top &&
      ge <= o.bottom &&
      (a.style.opacity = "1");
  }
  function Ye() {
    (clearReelsClickCapture(),
      document.getElementById("ig-saver-reels-btn")?.remove(),
      (me = null));
  }
  var ze = null;
  function Qe() {
    W() &&
      (ze && clearTimeout(ze),
      (ze = setTimeout(() => {
        ((ze = null), Da());
      }, 300)));
  }
  var Me = null;
  function rn() {
    de() &&
      (Me && clearTimeout(Me),
      (Me = setTimeout(() => {
        ((Me = null), nt());
      }, 300)));
  }
  var Le = null;
  function sn() {
    _e() &&
      (Le && clearTimeout(Le),
      (Le = setTimeout(() => {
        ((Le = null), ot());
      }, 300)));
  }
  function ln() {
    let i = document.querySelectorAll("video, img[src]"),
      e = null,
      t = 0;
    for (let r of i) {
      let s = r.getBoundingClientRect(),
        l = s.width * s.height;
      l > t && s.width >= 200 && s.height >= 300 && ((t = l), (e = r));
    }
    if (!e) return null;
    let n = e.getBoundingClientRect(),
      a = null,
      o = e.parentElement;
    for (; o && o !== document.body; ) {
      let r = o.getBoundingClientRect();
      if (
        o.tagName.toLowerCase() === "div" &&
        r.width >= 200 &&
        r.height >= 300
      )
        if (r.width <= n.width * 1.3) a = o;
        else break;
      o = o.parentElement;
    }
    return a;
  }
  function $() {
    (document.getElementById("ig-saver-story-btn")?.remove(),
      document.getElementById("ig-saver-story-all-btn")?.remove());
  }
  function Qt() {
    let i = ln();
    if (!i) return null;
    let e = i.querySelector("video[src], video source[src]"),
      t = e?.tagName === "VIDEO" ? e.src : e?.getAttribute("src");
    if (t && t.startsWith("http"))
      return {
        postId: `story_${ce() || Date.now()}`,
        index: 0,
        type: "video",
        url: t,
        timestamp: Math.floor(Date.now() / 1e3),
        creator: Ce() || "unknown",
      };
    if (i.querySelector("video")) return null;
    let n = i.querySelectorAll("img[src]"),
      a = null,
      o = 0;
    for (let s of n) {
      let l = s.getBoundingClientRect(),
        d = l.width * l.height;
      d > o && ((o = d), (a = s));
    }
    let r = a?.src;
    return r && r.startsWith("http")
      ? {
          postId: `story_${ce() || Date.now()}`,
          index: 0,
          type: "image",
          url: r,
          timestamp: Math.floor(Date.now() / 1e3),
          creator: Ce() || "unknown",
        }
      : null;
  }
  async function dn(i) {
    let e = i.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let t = document.createElement("style");
      ((t.id = "ig-saver-spinner-style"),
        (t.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(t));
    }
    ((i.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="white" stroke-width="2.5" stroke-linecap="round"
    style="animation: ig-saver-spin 0.8s linear infinite;">
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>`),
      (i.style.pointerEvents = "none"),
      (i.style.opacity = "1"));
    try {
      let t = null;
      if (F()) {
        if (((t = Qt()), t)) {
          let s = ce() || Date.now().toString();
          t.postId = `highlight_${s}`;
        }
        if (!t) {
          let s = aa();
          if (s) {
            let d = await new N("unknown").fetchHighlightItems(s),
              c = ce();
            (c && d.items.length > 0
              ? (t = d.items.find((u) => u.postId.includes(c)) || d.items[0])
              : d.items.length > 0 && (t = d.items[0]),
              t && (t.postId = t.postId.replace(/^story_/, "highlight_")));
          }
        }
      } else if (((t = Qt()), !t)) {
        let s = Ce();
        if (s) {
          let l = new N(s),
            d = await l.getUserId(s);
          if (d) {
            let c = await l.fetchUserStories(d),
              u = ce();
            u && c.length > 0
              ? (t = c.find((p) => p.postId.includes(u)) || c[0])
              : c.length > 0 && (t = c[0]);
          }
        }
      }
      if (!t) {
        m(_("notify_story_failed"), "error");
        return;
      }
      let a = t.creator,
        o = t.postId.replace(/^(story_|highlight_)/, ""),
        r = await w({
          type: "DOWNLOAD_STORY_AS_ZIP",
          payload: { username: a, storyId: o, items: [t] },
        });
      if (r?.error) {
        m(_("notify_download_failed", { error: r.error }), "error");
        return;
      }
      m(_("notify_story_success"), "success", !0);
    } catch (t) {
      m(_("notify_download_failed", { error: D(t.message) }), "error");
    } finally {
      ((i.innerHTML = e), (i.style.pointerEvents = ""));
    }
  }
  async function _n(i) {
    let e = i.innerHTML;
    if (!document.getElementById("ig-saver-spinner-style")) {
      let t = document.createElement("style");
      ((t.id = "ig-saver-spinner-style"),
        (t.textContent =
          "@keyframes ig-saver-spin { to { transform: rotate(360deg); } }"),
        document.head.appendChild(t));
    }
    ((i.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="white" stroke-width="2.5" stroke-linecap="round"
      style="animation: ig-saver-spin 0.8s linear infinite;">
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
    <span style="color:white;font-size:12px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:nowrap;">${_("story_downloading")}</span>
  `),
      (i.style.pointerEvents = "none"),
      (i.style.opacity = "1"));
    try {
      let t = [],
        n = "",
        a = "",
        o = F();
      if (o) {
        let s = aa();
        if (!s) {
          m(_("notify_highlight_id_failed"), "error");
          return;
        }
        let d = await new N("unknown").fetchHighlightItems(s);
        ((t = d.items.map((g, f) => ({
          ...g,
          index: f,
          postId: g.postId.replace(/^story_/, "highlight_"),
        }))),
          (n = d.username));
        let c = be(d.title || _("highlight_untitled")),
          u = new Date(),
          p = `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`;
        a = `${n}_highlight_${c}_${p}.zip`;
      } else {
        if (((n = Ce() || ""), !n)) {
          m(_("notify_username_failed"), "error");
          return;
        }
        let s = new N(n),
          l = await s.getUserId(n);
        if (!l) {
          m(_("notify_user_data_failed"), "error");
          return;
        }
        ((t = await s.fetchUserStories(l)),
          (t = t.map((u, p) => ({ ...u, index: p }))));
        let d = new Date(),
          c = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        a = `${n}_stories_${c}.zip`;
      }
      if (t.length === 0) {
        m(o ? _("notify_highlight_empty") : _("notify_no_stories"), "error");
        return;
      }
      let r = await w({
        type: "DOWNLOAD_ALL_STORIES_AS_ZIP",
        payload: { username: n, items: t, filename: a },
      });
      if (r?.error) {
        m(_("notify_download_failed", { error: r.error }), "error");
        return;
      }
      m(_("notify_downloaded_n_files_zip", { count: t.length }), "success", !0);
    } catch (t) {
      m(_("notify_download_failed", { error: D(t.message) }), "error");
    } finally {
      ((i.innerHTML = e), (i.style.pointerEvents = ""));
    }
  }
  function sa() {
    let i = new Date();
    return `${i.getFullYear()}-${String(i.getMonth() + 1).padStart(2, "0")}-${String(i.getDate()).padStart(2, "0")}`;
  }
  async function Jt(i, e) {
    if (!e.includeHighlights && !e.includeStories) {
      setTimeout(Q, 5e3);
      return;
    }
    let t = new N(i),
      n = 0;
    try {
      M(_("progress_extras_start"));
      let a = await t.getUserId(i);
      if (!a) {
        m(_("notify_user_data_failed"), "error");
        return;
      }
      (e.includeStories && (n += await cn(t, i, a)),
        e.includeHighlights && (n += await un(t, i, a)));
    } finally {
      (n > 0 &&
        m(_("notify_downloaded_n_files_zip", { count: n }), "success", !0),
        setTimeout(Q, 3e3));
    }
  }
  async function lt(i) {
    try {
      return (
        (await w({ type: "CHECK_EXTRAS_CANCELLED", payload: { taskId: i } }))
          ?.cancelled === !0
      );
    } catch {
      return !1;
    }
  }
  async function cn(i, e, t) {
    let a = (
      await w({
        type: "START_EXTRAS_TASK",
        payload: { username: e, kind: "stories" },
      })
    )?.taskId;
    if (!a) return 0;
    try {
      M(_("progress_stories_fetching"));
      let o = await i.fetchUserStories(t);
      if (await lt(a))
        return (
          await w({
            type: "COMPLETE_EXTRAS_TASK",
            payload: { taskId: a, downloaded: 0, failed: 0 },
          }),
          0
        );
      if (o.length === 0)
        return (
          await w({
            type: "COMPLETE_EXTRAS_TASK",
            payload: { taskId: a, downloaded: 0, failed: 0 },
          }),
          0
        );
      (await w({
        type: "UPDATE_EXTRAS_TOTAL",
        payload: { taskId: a, totalMediaFound: o.length, seenPostCount: 1 },
      }),
        M(_("progress_stories_packing", { count: o.length }), {
          posts: 1,
          media: o.length,
        }));
      let r = o.map((u, p) => ({ ...u, index: p })),
        s = `${e}_stories_${sa()}.zip`,
        l = await w({
          type: "DOWNLOAD_ALL_STORIES_AS_ZIP",
          payload: { username: e, items: r, filename: s, taskId: a },
        }),
        d = l?.downloaded ?? 0,
        c = l?.failed ?? 0;
      return (
        await w({
          type: "COMPLETE_EXTRAS_TASK",
          payload: { taskId: a, downloaded: d, failed: c },
        }),
        l?.error ? 0 : d
      );
    } catch {
      return (
        await w({
          type: "COMPLETE_EXTRAS_TASK",
          payload: { taskId: a, downloaded: 0, failed: 0 },
        }),
        0
      );
    }
  }
  async function un(i, e, t) {
    let a = (
      await w({
        type: "START_EXTRAS_TASK",
        payload: { username: e, kind: "highlights" },
      })
    )?.taskId;
    if (!a) return 0;
    try {
      M(_("progress_highlights_fetching_tray"));
      let o = await i.fetchHighlightsTray(t);
      if (await lt(a))
        return (
          await w({
            type: "COMPLETE_EXTRAS_TASK",
            payload: { taskId: a, downloaded: 0, failed: 0 },
          }),
          0
        );
      if (o.length === 0)
        return (
          await w({
            type: "COMPLETE_EXTRAS_TASK",
            payload: { taskId: a, downloaded: 0, failed: 0 },
          }),
          0
        );
      let r = [],
        s = e,
        l = 6;
      for (let f = 0; f < o.length; f += l) {
        if (await lt(a))
          return (
            await w({
              type: "COMPLETE_EXTRAS_TASK",
              payload: { taskId: a, downloaded: 0, failed: 0 },
            }),
            0
          );
        let h = o.slice(f, f + l),
          y = Math.min(f + h.length, o.length),
          S = h[0]?.title || _("highlight_untitled");
        M(
          _("progress_highlight_fetching", {
            current: y,
            total: o.length,
            title: S,
          }),
          { posts: y, media: r.length },
        );
        try {
          let E = await i.fetchHighlightItemsBatch(h.map((I) => I.id));
          for (let I of h) {
            let v = I.id.startsWith("highlight:") ? I.id : `highlight:${I.id}`,
              k = E.get(v);
            if (!k || k.items.length === 0) continue;
            k.username && (s = k.username);
            let A = k.title || I.title || _("highlight_untitled");
            for (let x = 0; x < k.items.length; x++) {
              let T = k.items[x];
              r.push({
                ...T,
                index: x,
                postId: T.postId.replace(/^story_/, "highlight_"),
                highlightTitle: A,
              });
            }
          }
        } catch {}
        await w({
          type: "UPDATE_EXTRAS_TOTAL",
          payload: { taskId: a, totalMediaFound: r.length, seenPostCount: y },
        });
      }
      if (r.length === 0)
        return (
          await w({
            type: "COMPLETE_EXTRAS_TASK",
            payload: { taskId: a, downloaded: 0, failed: 0 },
          }),
          0
        );
      M(_("progress_highlights_packing", { count: r.length }), {
        posts: o.length,
        media: r.length,
      });
      let d = (f) => {
        if (f.type !== "EXTRAS_PROGRESS" || f.payload?.taskId !== a) return;
        let { current: h, total: y, phase: S, path: E } = f.payload;
        if (S === "zipping") return;
        let I = typeof E == "string" ? E.split("/") : [],
          v = I.length === 4 ? I[2] : "";
        v &&
          M(
            _("progress_highlights_packing_named", {
              current: h,
              total: y,
              title: v,
            }),
            { posts: o.length, media: r.length },
          );
      };
      chrome.runtime.onMessage.addListener(d);
      let c = `${s}_highlights_${sa()}.zip`,
        u;
      try {
        u = await w({
          type: "DOWNLOAD_ALL_STORIES_AS_ZIP",
          payload: { username: s, items: r, filename: c, taskId: a },
        });
      } finally {
        chrome.runtime.onMessage.removeListener(d);
      }
      let p = u?.downloaded ?? 0,
        g = u?.failed ?? 0;
      return (
        await w({
          type: "COMPLETE_EXTRAS_TASK",
          payload: { taskId: a, downloaded: p, failed: g },
        }),
        u?.error ? 0 : p
      );
    } catch {
      return (
        await w({
          type: "COMPLETE_EXTRAS_TASK",
          payload: { taskId: a, downloaded: 0, failed: 0 },
        }),
        0
      );
    }
  }
  function la() {
    let i = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight / 2,
    );
    if (!i) return document;
    let e = null,
      t = null,
      n = i;
    for (; n && n !== document.body && n !== document.documentElement; ) {
      let a = n.getBoundingClientRect(),
        o =
          a.width >= window.innerWidth * 0.7 &&
          a.height >= window.innerHeight * 0.7;
      if (
        (a.width >= 300 &&
          a.height >= window.innerHeight * 0.5 &&
          a.width < window.innerWidth * 0.7 &&
          !e &&
          n.querySelector("svg") &&
          n.querySelector('div[role="button"]') &&
          (e = n),
        o && !t)
      ) {
        if (
          n.tagName === "SECTION" ||
          n.getAttribute("role") === "dialog" ||
          n.getAttribute("role") === "presentation"
        ) {
          t = n;
          break;
        }
        let s = window.getComputedStyle(n);
        if (
          s.position === "fixed" ||
          s.position === "absolute" ||
          (s.zIndex !== "auto" && parseInt(s.zIndex) > 0)
        ) {
          t = n;
          break;
        }
      }
      n = n.parentElement;
    }
    return t ?? e ?? document;
  }
  function da(i, e) {
    for (let t of i.querySelectorAll("svg"))
      for (let n of t.querySelectorAll("path"))
        if ((n.getAttribute("d") ?? "").startsWith(e)) return t;
    return null;
  }
  function pn(i) {
    for (let e of i.querySelectorAll("svg"))
      if (e.querySelectorAll("circle").length >= 3) return e;
    return null;
  }
  function gn() {
    let i = ["M16.792", "M13.973"],
      e = la(),
      t = e === document ? [document] : [e, document];
    for (let n of t)
      for (let a of i) {
        let o = da(n, a);
        if (!o) continue;
        let r = o.closest('div[role="button"]');
        if (!r || r.getBoundingClientRect().y < window.innerHeight * 0.5)
          continue;
        let l = r.parentElement;
        for (let d = 0; d < 5 && l; d++) {
          let c = window.getComputedStyle(l);
          if (c.display === "flex" || c.display === "inline-flex")
            return { row: l, anchorBtn: r };
          l = l.parentElement;
        }
      }
    return null;
  }
  function mn() {
    let i = la(),
      e = da(i, "M5.888"),
      t = e ? null : pn(i),
      n = e || t;
    if (!n) return null;
    let a = n.closest('div[role="button"]');
    if (!a) return null;
    let o = a.parentElement;
    for (let r = 0; r < 5 && o; r++) {
      let s = window.getComputedStyle(o);
      if (
        (s.display === "flex" || s.display === "inline-flex") &&
        o.children.length >= 3
      ) {
        for (let l of Array.from(o.children))
          if (l === a || l.contains(a)) return { row: o, playBtnWrapper: l };
      }
      o = o.parentElement;
    }
    return null;
  }
  function ea(i, e, t, n) {
    let a = i.cloneNode(!1);
    ((a.id = e), a.removeAttribute("data-visualcompletion"));
    let o = i.querySelector(":scope > div"),
      r = o ? o.cloneNode(!1) : document.createElement("div");
    ((r.style.display = "flex"),
      (r.style.alignItems = "center"),
      (r.style.justifyContent = "center"));
    let s = `
    <svg aria-label="${_("aria_download")}" fill="currentColor" height="${t}" role="img" viewBox="0 0 24 24" width="${t}" style="color:white;">
      <title>${_("aria_download")}</title>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="7 10 12 15 17 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="12" y1="15" x2="12" y2="3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    if (n) {
      ((r.innerHTML = s), a.appendChild(r));
      let l = document.createElement("span");
      ((l.textContent = n),
        (l.style.cssText =
          'color:white;font-size:12px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;white-space:nowrap;'),
        (a.style.gap = "4px"),
        a.appendChild(l));
    } else ((r.innerHTML = s), a.appendChild(r));
    return a;
  }
  var Je = !1,
    et = "";
  function ue(i = 0) {
    let e = !!document.getElementById("ig-saver-story-btn"),
      t = !!document.getElementById("ig-saver-story-all-btn");
    if (
      (e && t) ||
      (!se() && !F()) ||
      (et !== window.location.pathname && ((Je = !1), (et = "")), Je)
    )
      return;
    let n = e ? null : gn(),
      a = t ? null : mn();
    if (!e && !n && !t && !a) {
      i < 8
        ? setTimeout(() => ue(i + 1), 500 + i * 300)
        : ((Je = !0),
          (et = window.location.pathname),
          console.warn(
            "[Dog Saver] Could not find story viewer buttons after retries \u2014 IG UI may have changed",
          ));
      return;
    }
    if (n) {
      let d = ea(n.anchorBtn, "ig-saver-story-btn", 24);
      d.addEventListener("click", (u) => {
        (u.preventDefault(), u.stopPropagation(), dn(d));
      });
      let c = null;
      for (let u of Array.from(n.row.children))
        if (u === n.anchorBtn || u.contains(n.anchorBtn)) {
          c = u;
          break;
        }
      n.row.insertBefore(d, c || n.row.firstChild);
    }
    if (a) {
      let d = F() ? _("story_download_highlight") : _("story_download_all"),
        c = ea(a.playBtnWrapper, "ig-saver-story-all-btn", 16, d);
      (c.addEventListener("click", (u) => {
        (u.preventDefault(), u.stopPropagation(), _n(c));
      }),
        a.row.insertBefore(c, a.playBtnWrapper));
    }
    ((!e && !n) || (!t && !a)) &&
      i < 8 &&
      setTimeout(() => ue(i + 1), 500 + i * 300);
  }
  let filterWorker = null;
  function getFilterWorker() {
    if (!filterWorker) {
      try {
        filterWorker = new Worker(chrome.runtime.getURL("instagram/worker.js"));
        filterWorker.onerror = () => {
          try {
            filterWorker?.terminate();
          } catch {}
          filterWorker = null;
        };
      } catch (err) {
        console.warn("[Dog Saver] Worker unavailable, using inline parser:", err?.message || err);
        filterWorker = null;
      }
    }
    return filterWorker;
  }
  function parseInterceptedPostsInline(rawItems, username) {
    if (!Array.isArray(rawItems)) return [];
    let posts = [];
    for (let item of rawItems) {
      try {
        let wrappedNode = item.node ?? item,
          node =
            wrappedNode?.media_or_ad ??
            wrappedNode?.media ??
            wrappedNode?.post ??
            wrappedNode,
          normalized = normalizeInterceptedNodeInline(node),
          postId = normalized.shortcode || normalized.id,
          timestamp = normalized.taken_at_timestamp || 0,
          isCarousel =
            normalized.__typename === "GraphSidecar" ||
            normalized.edge_sidecar_to_children?.edges?.length > 0,
          children = isCarousel
            ? normalized.edge_sidecar_to_children?.edges || []
            : [{ node: normalized }],
          mediaItems = children.map((child, index) => {
            let media = child.node,
              isVideo = media.is_video === true || media.__typename === "GraphVideo",
              imageUrl = media.display_url || "",
              videoUrl = media.video_url || "";
            return {
              postId,
              index,
              type: isVideo ? "video" : "image",
              url: (isVideo && videoUrl ? videoUrl : imageUrl || videoUrl) || "",
              timestamp,
              creator:
                normalized.user?.username ||
                normalized.owner?.username ||
                node.user?.username ||
                node.owner?.username ||
                username ||
                "unknown",
            };
          }).filter((media) => media.url);
        posts.push({
          postId,
          shortcode: String(normalized.shortcode || ""),
          timestamp,
          isCarousel,
          carouselCount: children.length,
          mediaItems,
          typename: normalized.__typename || "",
          likeCount: normalized.likeCount,
          playCount: normalized.playCount,
          commentCount: normalized.commentCount,
          saveCount: normalized.saveCount,
          captionText: normalized.captionText,
        });
      } catch (err) {
        console.warn("[Dog Saver] Inline parser skipped item:", err?.message || err);
      }
    }
    return posts;
  }
  function normalizeInterceptedNodeInline(node) {
    let likeCount = node.like_count ?? node.edge_media_preview_like?.count ?? node.edge_liked_by?.count ?? 0,
      playCount = node.play_count ?? node.view_count ?? node.video_play_count ?? 0,
      commentCount = node.comment_count ?? node.edge_media_to_comment?.count ?? 0,
      saveCount = node.save_count ?? node.edge_media_preview_save?.count ?? 0,
      captionText =
        typeof node.caption === "string"
          ? node.caption
          : node.caption?.text ?? node.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
    if (node.shortcode != null || node.taken_at_timestamp != null)
      return { ...node, likeCount, playCount, commentCount, saveCount, captionText };
    let normalized = {
      shortcode: node.code ?? node.pk?.toString(),
      id: node.pk?.toString(),
      __typename: { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[node.media_type] || "GraphImage",
      is_video: node.media_type === 2,
      taken_at_timestamp: node.taken_at ?? node.taken_at_timestamp ?? 0,
      likeCount,
      playCount,
      commentCount,
      saveCount,
      captionText,
    };
    let candidates = node.image_versions2?.candidates;
    if (candidates?.length) normalized.display_url = candidates[0].url;
    if (Array.isArray(node.video_versions) && node.video_versions.length)
      normalized.video_url = selectInterceptedVideoUrlInline(node.video_versions, node.video_url);
    if (node.carousel_media?.length)
      normalized.edge_sidecar_to_children = {
        edges: node.carousel_media.map((item) => ({
          node: {
            display_url: item.image_versions2?.candidates?.[0]?.url,
            is_video: item.media_type === 2,
            video_url: selectInterceptedVideoUrlInline(item.video_versions, item.video_url),
          },
        })),
      };
    return normalized;
  }
  function selectInterceptedVideoUrlInline(versions, fallbackUrl) {
    if (!Array.isArray(versions) || versions.length === 0) return fallbackUrl || "";
    let sorted = [...versions].sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    for (let version of sorted) {
      let width = version.width || 0,
        height = version.height || 0;
      if (width > 0 && height > 0 && ((width <= 720 && height <= 1280) || (width <= 1280 && height <= 720)))
        return version.url || "";
    }
    return sorted[sorted.length - 1]?.url || fallbackUrl || "";
  }
  function ta() {
    injectDialogStyles();

    let interceptedCacheQueue = Promise.resolve();
    window.addEventListener("message", (event) => {
      try {
        if (event.source !== window || !event.data || event.data.type !== "IG_SAVER_INTERCEPTED_POSTS") return;
        let { rawItems, pagination } = event.data;
        let username = W() ? O() : "unknown",
          posts = parseInterceptedPostsInline(rawItems, username);
        rememberInterceptedPosts(posts);
        if (W() && username) {
          interceptedCacheQueue = interceptedCacheQueue
            .then(() => cacheInterceptedPostsInline(posts, pagination, username))
            .catch((err) => {
              console.warn("[Dog Saver] Intercepted post cache failed:", err?.message || err);
            });
        }
      } catch (err) {
        console.warn("[Dog Saver] Intercepted post cache failed:", err?.message || err);
      }
    });
    async function cacheInterceptedPostsInline(posts, pagination, username) {
        if (!posts || posts.length === 0) return;

        let key = `ig_saver_cache_${username.toLowerCase()}`;
        let res = await chrome.storage.local.get(key);
        let cache = res[key] || { posts: [], cursors: [null], hasNextPage: true, lastUpdated: 0 };

        let existingShortcodes = new Set(cache.posts.map(p => p.shortcode || p.postId));
        let addedAny = false;
        for (let p of posts) {
          let pKey = p.shortcode || p.postId;
          if (pKey && !existingShortcodes.has(pKey)) {
            cache.posts.push(p);
            existingShortcodes.add(pKey);
            addedAny = true;
          }
        }

        let paginationChanged = false;
        if (pagination) {
          if (cache.hasNextPage !== pagination.hasNextPage) {
            cache.hasNextPage = pagination.hasNextPage;
            paginationChanged = true;
          }
          if (pagination.endCursor && !cache.cursors.includes(pagination.endCursor)) {
            cache.cursors.push(pagination.endCursor);
            paginationChanged = true;
          }
        }
        if (!addedAny && !paginationChanged) return;
        cache.lastUpdated = Date.now();

        await chrome.storage.local.set({ [key]: cache });
    }

    (window.location.hostname === "www.instagram.com" && Ea(),
      W()
        ? (at(), Ve(), Qe())
        : J()
          ? (it(), je())
          : ee()
            ? (rt(), Xe())
            : tt() || De()
              ? st()
              : se() || F()
                ? ue()
                : de()
                  ? nt()
                  : le()
                    ? U()
                    : _e() && ot());
    let i = window.location.pathname;
    function e(l) {
      if (l !== i)
        if (((!W() && removeProfileActions()), (i = l), W()))
          (R(), $(), Ee(), at(), Ve(), Qe());
        else if (J()) {
          (R(), $());
          let d = document.getElementById("ig-saver-btn");
          d && d.remove();
          let c = document.getElementById("ig-saver-avatar-btn");
          (c && c.remove(), Ee(), it(), je());
        } else if (ee()) {
          (R(), $());
          let d = document.getElementById("ig-saver-btn");
          d && d.remove();
          let c = document.getElementById("ig-saver-avatar-btn");
          (c && c.remove(), Ee(), rt(), Xe());
        } else if (tt() || De()) {
          if (!!!document.querySelector('div[role="dialog"]')) {
            let c = document.getElementById("ig-saver-btn");
            c && c.remove();
            let u = document.getElementById("ig-saver-avatar-btn");
            u && u.remove();
          }
          (R(), $(), st());
        } else if (se() || F()) {
          let d = document.getElementById("ig-saver-btn");
          d && d.remove();
          let c = document.getElementById("ig-saver-avatar-btn");
          (c && c.remove(), R(), $(), ue());
        } else if (de()) (R(), $(), nt());
        else if (le()) (Ye(), R(), $(), U());
        else if (_e()) (R(), $(), Ye(), ot());
        else {
          let d = document.getElementById("ig-saver-btn");
          d && d.remove();
          let c = document.getElementById("ig-saver-avatar-btn");
          (c && c.remove(), R(), Ye(), $(), Ee());
        }
    }
    let t = history.pushState.bind(history);
    history.pushState = function (...l) {
      (t(...l), e(window.location.pathname));
    };
    let n = history.replaceState.bind(history);
    ((history.replaceState = function (...l) {
      (n(...l), e(window.location.pathname));
    }),
      window.addEventListener("popstate", () => e(window.location.pathname)));
    let a = null;
    function o() {
      a ||
        (a = setTimeout(() => {
          ((a = null),
            (se() || F()) &&
              (!document.getElementById("ig-saver-story-btn") ||
                !document.getElementById("ig-saver-story-all-btn")) &&
              ue());
        }, 600));
    }
    let mutationScanPending = false;
    new MutationObserver(() => {
      if (mutationScanPending) return;
      mutationScanPending = true;
      setTimeout(() => {
        mutationScanPending = false;
        if ((e(window.location.pathname), W())) (Ve(), Qe());
        else if (J()) je();
        else if (ee()) Xe();
        else if (de()) rn();
        else if (le()) {
          let l = document.getElementById("ig-saver-reels-btn");
          if (!l) U();
          else {
            let d = l.getBoundingClientRect();
            (d.bottom <= 0 ||
              d.top >= window.innerHeight ||
              d.right <= 0 ||
              d.left >= window.innerWidth) &&
              (l.remove(), (me = null), U());
          }
        } else
          _e()
            ? sn()
            : (se() || F()) &&
              (!document.getElementById("ig-saver-story-btn") ||
                !document.getElementById("ig-saver-story-all-btn")) &&
              o();
      }, 120);
    }).observe(document.body, { childList: !0, subtree: !0 });
    let s = null;
    document.addEventListener(
      "scroll",
      () => {
        le() &&
          (s && clearTimeout(s),
          (s = setTimeout(() => {
            let l = document.getElementById("ig-saver-reels-btn");
            if (!l) U();
            else {
              let d = l.getBoundingClientRect();
              if (
                d.bottom <= 0 ||
                d.top >= window.innerHeight ||
                d.right <= 0 ||
                d.left >= window.innerWidth
              )
                (l.remove(), (me = null), U());
              else {
                let u = l.parentElement;
                if (u) {
                  let p = u.getBoundingClientRect();
                  pe >= p.left &&
                    pe <= p.right &&
                    ge >= p.top &&
                    ge <= p.bottom &&
                    (l.style.opacity = "1");
                }
              }
            }
          }, 150)));
      },
      { capture: !0, passive: !0 },
    );
  }
  (async () => (
    await Bt(),
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", ta)
      : ta()
  ))();
})();
