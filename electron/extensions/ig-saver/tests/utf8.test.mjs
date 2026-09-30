import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const messages = JSON.parse(readFileSync(new URL("../_locales/pt_BR/messages.json", import.meta.url), "utf8"));

assert.match(messages.extName.message, /IG Saver|Dog Saver/);
assert.match(messages.extDescription.message, /vídeos/);
assert.match(messages.extDescription.message, /carrosséis/);
assert.match(messages.extDescription.message, /anúncios/);

for (const relativePath of [
  "../tiktok/content.js",
  "../tiktok/content.css",
  "../popup.html",
]) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.doesNotMatch(text, /Ã.|Â./, `${relativePath} contains mojibake`);
}

console.log("utf8 tests passed");
