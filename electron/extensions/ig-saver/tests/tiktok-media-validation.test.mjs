import assert from "node:assert/strict";

await import("../tiktok/media-validation.js");

const validation = globalThis.DogSaverTikTokMediaValidation;
const encoder = new TextEncoder();

assert.ok(validation, "TikTok media validation should be exposed");

const mp4 = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x18,
  ...encoder.encode("ftypisom"),
  0x00,
  0x00,
  0x02,
  0x00,
]);
const html = encoder.encode("<!doctype html><html><body>Access denied</body></html>");
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

assert.equal(validation.isExpectedMedia(mp4, "video/mp4", "video"), true);
assert.equal(validation.isExpectedMedia(html, "text/html", "video"), false);
assert.equal(validation.isExpectedMedia(html, "video/mp4", "video"), false);
assert.equal(
  validation.isExpectedMedia(encoder.encode("not a video"), "video/mp4", "video"),
  false,
);
assert.equal(validation.isExpectedMedia(jpeg, "image/jpeg", "image"), true);
assert.equal(validation.isExpectedMedia(jpeg, "image/jpeg", "video"), false);
assert.equal(
  validation.isAllowedTikTokMediaUrl(
    "https://v16-webapp-prime.tiktok.com/video/example.mp4",
  ),
  true,
);
assert.equal(
  validation.isAllowedTikTokMediaUrl("https://tiktok.com.evil.example/video.mp4"),
  false,
);
assert.equal(
  validation.isAllowedTikTokMediaUrl(
    "http://v16-webapp-prime.tiktok.com/video.mp4",
  ),
  false,
);

console.log("tiktok media validation tests passed");
