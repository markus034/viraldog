import assert from "node:assert/strict";

const listeners = [];
const fetchCalls = [];
const revokedUrls = [];
let buildCall;
let downloadCall;

globalThis.chrome = {
  runtime: {
    lastError: null,
    getContexts: async () => [{}],
    getURL: (path) => `chrome-extension://dog-saver/${path}`,
    onMessage: {
      addListener(listener) {
        listeners.push(listener);
      },
    },
    sendMessage(message, callback) {
      let response = {};
      if (message.type === "TIKTOK_FETCH_MEDIA_AND_CREATE_URL") {
        fetchCalls.push(message);
        response = {
          url: `blob:chrome-extension://dog-saver/media-${fetchCalls.length}`,
          contentType: "video/mp4",
          size: 1024,
        };
      } else if (message.type === "IG_SAVER_BUILD_ZIP_AND_CREATE_URL") {
        buildCall = message;
        response = {
          url: "blob:chrome-extension://dog-saver/profile.zip",
          downloaded: message.items.length,
          failed: 0,
        };
      } else if (message.type === "IG_SAVER_REVOKE_BLOB_URL") {
        revokedUrls.push(message.url);
      }
      if (callback) queueMicrotask(() => callback(response));
      return Promise.resolve(response);
    },
  },
  offscreen: {
    createDocument: async () => {},
  },
  downloads: {
    download(options, callback) {
      downloadCall = options;
      callback(42);
    },
  },
};

await import("../tiktok/background.js?profile-zip-test");

assert.equal(listeners.length, 1);
const response = await new Promise((resolve) => {
  let keepAlive = listeners[0](
    {
      type: "TIKTOK_DOWNLOAD_ZIP",
      payload: {
        filename: "Dog_Saver_TikTok_profile.zip",
        items: [
          {
            url: "https://v16-webapp-prime.tiktok.com/primary.mp4",
            urls: [
              "https://v16-webapp-prime.tiktok.com/primary.mp4",
              "https://v19-webapp-prime.tiktok.com/fallback.mp4",
            ],
            expectedType: "video",
            path: "TikTok_profile/video.mp4",
          },
          {
            url: "data:application/json;base64,eyJvayI6dHJ1ZX0=",
            path: "TikTok_profile/metadata.json",
          },
        ],
      },
    },
    {},
    resolve,
  );
  assert.equal(keepAlive, true);
});

assert.equal(response.failed, 0);
assert.equal(fetchCalls.length, 1);
assert.deepEqual(fetchCalls[0].urls, [
  "https://v16-webapp-prime.tiktok.com/primary.mp4",
  "https://v19-webapp-prime.tiktok.com/fallback.mp4",
]);
assert.equal(fetchCalls[0].expectedType, "video");
assert.equal(buildCall.items.length, 2);
assert.equal(
  buildCall.items[0].url,
  "blob:chrome-extension://dog-saver/media-1",
);
assert.equal(
  buildCall.items[1].url,
  "data:application/json;base64,eyJvayI6dHJ1ZX0=",
);
assert.equal(downloadCall.url, "blob:chrome-extension://dog-saver/profile.zip");
assert.ok(
  revokedUrls.includes("blob:chrome-extension://dog-saver/media-1"),
);
assert.ok(
  revokedUrls.includes("blob:chrome-extension://dog-saver/profile.zip"),
);

console.log("tiktok profile zip tests passed");
