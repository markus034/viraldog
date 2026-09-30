import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const content = await readFile(
    new URL("../tiktok/content.js", import.meta.url),
    "utf8",
  ),
  styles = await readFile(
    new URL("../tiktok/content.css", import.meta.url),
    "utf8",
  ),
  popup = await readFile(
    new URL("../popup.html", import.meta.url),
    "utf8",
  ),
  popupStyles = await readFile(
    new URL("../popup.css", import.meta.url),
    "utf8",
  );

assert.match(content, /id="dog-saver-tiktok-media-type"/);
assert.match(content, /id="dog-saver-tiktok-topk-dec"/);
assert.match(content, /id="dog-saver-tiktok-topk-inc"/);
assert.match(content, /id="dog-saver-tiktok-modal-row"/);
assert.match(content, /id="dog-saver-tiktok-filters-flyout"/);
assert.match(content, /id="dog-saver-tiktok-profile-favorite-btn"/);
assert.match(content, /class="dog-saver-tiktok-filter-arrow"/);
assert.doesNotMatch(content, /id="dog-saver-tiktok-videos"/);
assert.doesNotMatch(content, /id="dog-saver-tiktok-photos"/);

assert.match(styles, /--dog-tt-blue:\s*#0071e3/i);
assert.match(styles, /\.dog-saver-tiktok-modal-row/);
assert.match(styles, /\.dog-saver-tiktok-filters-flyout/);
assert.match(styles, /border-radius:\s*18px/);
assert.match(styles, /border-radius:\s*9999px/);
assert.match(styles, /backdrop-filter:\s*blur\(16px\)/);

assert.match(popup, /class="popup-card"/);
assert.match(popup, /id="popup-status" role="status" aria-live="polite"/);
assert.match(popup, /id="tab-tiktok"/);
assert.match(popup, /id="tab-instagram"/);
assert.match(popupStyles, /--primary-blue:\s*#0071e3/i);

console.log("tiktok UX tests passed");

