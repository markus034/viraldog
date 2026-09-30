import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

assert.equal(manifest.background.service_worker, "background.js");
await access(new URL("../background.js", import.meta.url));
await access(new URL("../instagram/background.js", import.meta.url));
await access(new URL("../tiktok/background.js", import.meta.url));

const instagramScripts = manifest.content_scripts.filter((entry) =>
  entry.matches?.includes("https://www.instagram.com/*"),
);
assert.deepEqual(
  instagramScripts.map((entry) => entry.js).flat(),
  ["instagram/interceptor.js", "instagram/content.js"],
);

assert.ok(
  manifest.host_permissions.includes("https://*.tiktok.com/*"),
  "TikTok host permission should be present",
);

const tiktokScripts = manifest.content_scripts.filter((entry) =>
    entry.matches?.includes("https://www.tiktok.com/*"),
  ),
  tiktokInterceptor = tiktokScripts.find((entry) => entry.world === "MAIN"),
  tiktokScript = tiktokScripts.find((entry) =>
    entry.js?.includes("tiktok/content.js"),
  );

assert.ok(tiktokScript, "TikTok content script registration should exist");
assert.deepEqual(tiktokScript.js, [
  "tiktok/parser.js",
  "tiktok/profile-filters.js",
  "tiktok/content.js",
]);
assert.deepEqual(tiktokScript.css, ["tiktok/content.css"]);
assert.deepEqual(tiktokInterceptor.js, [
  "tiktok/media-validation.js",
  "tiktok/parser.js",
  "tiktok/interceptor.js",
]);
assert.equal(tiktokInterceptor.run_at, "document_start");

assert.equal(manifest.action.default_popup, "popup.html");
for (const relativePath of [
  "popup.html",
  "popup.css",
  "popup.js",
  "assets/instagram.svg",
  "assets/tiktok.svg",
  "tiktok/media-validation.js",
  "tiktok/media-fetch.js",
]) {
  await access(new URL(`../${relativePath}`, import.meta.url));
}

const offscreenHtml = await readFile(
  new URL("../offscreen.html", import.meta.url),
  "utf8",
);
assert.match(offscreenHtml, /tiktok\/media-validation\.js/);
assert.match(offscreenHtml, /tiktok\/media-fetch\.js/);

for (const relativePath of [...tiktokScript.js, ...tiktokScript.css]) {
  await access(new URL(`../${relativePath}`, import.meta.url));
}

for (const relativePath of tiktokInterceptor.js) {
  await access(new URL(`../${relativePath}`, import.meta.url));
}

for (const entry of instagramScripts) {
  for (const relativePath of entry.js) {
    await access(new URL(`../${relativePath}`, import.meta.url));
  }
}

assert.deepEqual(
  manifest.web_accessible_resources[0].resources,
  ["instagram/worker.js"],
);

console.log("tiktok manifest tests passed");
