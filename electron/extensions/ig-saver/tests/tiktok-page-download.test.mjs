import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

await import("../tiktok/media-validation.js");

const source = await readFile(
  new URL("../tiktok/interceptor.js", import.meta.url),
  "utf8",
);
const listeners = new Map();
const posted = [];
const fetchCalls = [];
const clicks = [];
const firstUrl = "https://v16-webapp-prime.tiktok.com/video/blocked";
const secondUrl = "https://v19-webapp-prime.tiktok.com/video/working";
const requestOnlyUrl = "https://v19-webapp-prime.tiktok.com/video/request-body";
const mp4 = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x18,
  ...new TextEncoder().encode("ftypisom"),
  0x00,
  0x00,
  0x02,
  0x00,
]);

const windowMock = {
  addEventListener(type, listener) {
    let current = listeners.get(type) || [];
    current.push(listener);
    listeners.set(type, current);
  },
  postMessage(message) {
    posted.push(message);
    for (let listener of listeners.get("message") || []) {
      listener({ data: message, source: windowMock });
    }
  },
  async fetch(url, options) {
    fetchCalls.push({ url, options });
    const resolvedUrl = url instanceof Request ? url.url : url;
    if (url instanceof Request) {
      if (url.bodyUsed) {
        throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
      }
      await url.text();
    }
    if (resolvedUrl === firstUrl) {
      return new Response("Access Denied", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response(mp4, {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
  },
};

function XMLHttpRequestMock() {}
XMLHttpRequestMock.prototype.open = function () {};
XMLHttpRequestMock.prototype.send = function () {};

class URLMock extends URL {}
URLMock.createObjectURL = () => "blob:https://www.tiktok.com/test";
URLMock.revokeObjectURL = () => {};

const context = vm.createContext({
  Blob,
  console,
  document: {
    createElement() {
      return {
        click() {
          clicks.push({ download: this.download, href: this.href });
        },
        remove() {},
        style: {},
      };
    },
    documentElement: { appendChild() {} },
  },
  DogSaverTikTokMediaValidation: globalThis.DogSaverTikTokMediaValidation,
  DogSaverTikTokParser: { extractPosts: () => [] },
  location: { href: "https://www.tiktok.com/@dog/video/123" },
  Response,
  Request,
  setTimeout(callback, delay) {
    if (delay < 1000) return globalThis.setTimeout(callback, delay);
    return 0;
  },
  URL: URLMock,
  window: windowMock,
  XMLHttpRequest: XMLHttpRequestMock,
});
context.globalThis = context;

vm.runInContext(source, context, { filename: "tiktok/interceptor.js" });

const requestWithBody = new Request(requestOnlyUrl, {
  method: "POST",
  body: "TikTok request body",
});
const requestResponse = await windowMock.fetch(requestWithBody);
assert.equal(requestResponse.ok, true);
assert.equal(requestWithBody.bodyUsed, true);

windowMock.postMessage({
  source: "dog-saver-tiktok-content-download",
  version: 1,
  requestId: "test-request-123",
  urls: [firstUrl, secondUrl],
  expectedType: "video",
  filename: "Dog_Saver_TikTok_test.mp4",
});

await new Promise((resolve) => setTimeout(resolve, 30));

const result = posted.find(
  (message) => message.source === "dog-saver-tiktok-page-download",
);
assert.equal(result?.ok, true);
assert.equal(fetchCalls.some((call) => call.url === secondUrl), true);
const firstDownloadFetch = fetchCalls.find((call) => call.url === firstUrl);
assert.equal(firstDownloadFetch.options.credentials, "same-origin");
assert.equal(firstDownloadFetch.options.referrer, context.location.href);
assert.deepEqual(clicks, [
  {
    download: "Dog_Saver_TikTok_test.mp4",
    href: "blob:https://www.tiktok.com/test",
  },
]);

console.log("tiktok page download tests passed");
