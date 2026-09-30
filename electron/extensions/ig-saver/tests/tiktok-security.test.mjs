import assert from "node:assert/strict";
import {
  isAllowedTikTokMediaUrl,
  isAllowedTikTokZipUrl,
} from "../tiktok/security.js";

assert.equal(
  isAllowedTikTokMediaUrl("https://v16-webapp-prime.tiktok.com/video.mp4"),
  true,
);
assert.equal(
  isAllowedTikTokMediaUrl("https://p16-sign-va.tiktokcdn.com/image.jpeg"),
  true,
);
assert.equal(
  isAllowedTikTokMediaUrl("https://v19-sign.tiktokcdn-us.com/video.mp4"),
  true,
);
assert.equal(
  isAllowedTikTokMediaUrl("https://tiktokcdn.com.evil.example/video.mp4"),
  false,
);
assert.equal(
  isAllowedTikTokMediaUrl("http://v16-webapp-prime.tiktok.com/video.mp4"),
  false,
);
assert.equal(
  isAllowedTikTokMediaUrl("https://example.com/video.mp4"),
  false,
);
assert.equal(
  isAllowedTikTokZipUrl("data:application/json;base64,eyJvayI6dHJ1ZX0="),
  true,
);
assert.equal(isAllowedTikTokZipUrl("data:text/html;base64,PGgxPk88L2gxPg=="), false);

console.log("tiktok security tests passed");
