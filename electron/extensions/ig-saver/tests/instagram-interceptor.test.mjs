import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../instagram/interceptor.js", import.meta.url),
  "utf8",
);
const messages = [];
let resolveCloneText;
const cloneText = new Promise((resolve) => {
    resolveCloneText = resolve;
  }),
  response = {
    clone() {
      return { text: () => cloneText };
    },
  },
  originalPromise = Promise.resolve(response);

class XMLHttpRequestMock {
  constructor() {
    this.listeners = new Map();
    this.responseText = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  open() {}

  send() {
    this.listeners.get("load")?.();
  }
}

const windowMock = {
  addEventListener() {},
  fetch() {
    return originalPromise;
  },
  postMessage(message) {
    messages.push(message);
  },
  XMLHttpRequest: XMLHttpRequestMock,
};
const context = vm.createContext({
  console,
  URL,
  window: windowMock,
  XMLHttpRequest: XMLHttpRequestMock,
});

vm.runInContext(source, context, { filename: "instagram/interceptor.js" });

const interceptedPromise = windowMock.fetch(
  "https://www.instagram.com/api/v1/feed/user/123/",
);
assert.strictEqual(
  interceptedPromise,
  originalPromise,
  "the interceptor must preserve the page's original fetch promise",
);
await interceptedPromise;
assert.equal(messages.length, 0, "response parsing must not block fetch");

resolveCloneText(JSON.stringify({ items: [{ code: "ABC123", media_type: 1 }] }));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(messages[0]?.type, "IG_SAVER_INTERCEPTED_POSTS");
assert.equal(messages[0]?.rawItems?.[0]?.code, "ABC123");

const xhr = new XMLHttpRequestMock();
xhr.responseText = JSON.stringify({ items: [{ code: "XHR123", media_type: 1 }] });
xhr.open("GET", "https://www.instagram.com/api/v1/feed/user/123/");
xhr.send();
assert.equal(messages.at(-1)?.rawItems?.[0]?.code, "XHR123");
assert.equal(xhr instanceof XMLHttpRequestMock, true);

console.log("instagram interceptor tests passed");
