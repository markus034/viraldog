# Dog Saver Architecture Notes

## Platform Separation

The extension keeps each platform implementation in its own top-level folder:

- `instagram/` contains the Instagram content script, page interceptor, media worker, background handlers, and parser/normalizer modules.
- `tiktok/` contains the TikTok content script, styles, hydration parser, and background handlers.
- `background.js` is the extension-level router. It imports both platform backgrounds and sends toolbar clicks to the active site.
- `offscreen.html` and `offscreen.js` are shared ZIP infrastructure used by both platforms.

Platform-specific code must stay inside its platform folder. Root files should only contain Chrome extension configuration or infrastructure shared by both platforms.

## Instagram Flow

- `instagram/interceptor.js` runs in the page main world and captures Instagram feed/GraphQL responses.
- `instagram/worker.js` normalizes intercepted post data into media items and engagement metadata.
- `instagram/content.js` owns the Instagram UI, dialogs, profile validation, filters, favorites, and progress panels.
- `instagram/background.js` owns Instagram task state, download queue, ZIP orchestration, licensing, and duplicate detection.
- `instagram/core/` contains the testable response parser and media normalizer.

## TikTok Flow

- `tiktok/interceptor.js` captures feed, profile, search, and detail API responses in the page main world.
- `tiktok/parser.js` normalizes intercepted/hydration data and selects playback variants instead of watermarked download addresses.
- `tiktok/profile-filters.js` applies media type, interval, keyword, and engagement filters before duplicate detection.
- `tiktok/content.js` owns integrated post/profile controls, favorites, profile collection, metadata export, and the duplicate registry.
- `tiktok/content.css` contains only TikTok interface styles.
- `tiktok/background.js` validates TikTok media hosts, handles direct files and ZIP requests, and creates the shared offscreen document.
- `popup.html` lets the user open Instagram or TikTok in a new tab from the extension action.

## Commercial Features

- Instagram global duplicate detection stores downloaded media fingerprints in `ig_saver_global_downloaded_media`.
- Instagram favorite profiles are stored locally under `ig_saver_favorite_profiles`.
- TikTok duplicate detection is shared by individual and profile modes under `dog_saver_tiktok_downloaded_posts`.
- Cloud export has a placeholder command, `GET_CLOUD_EXPORT_STATUS`, so the UI can gate a future Pro connector cleanly.

## Encoding And Tests

All source, locale, and documentation files must be UTF-8. `.editorconfig` enforces UTF-8 and `npm test` verifies parser behavior, manifest registrations, and Portuguese locale strings.

Run:

```bash
npm test
```
