(function (root) {
  "use strict";

  const ALLOWED_HOSTS = [
    "tiktok.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    "byteoversea.com",
    "byteimg.com",
    "ibyteimg.com",
    "muscdn.com",
    "akamaized.net",
  ];

  function asBytes(value) {
    return value instanceof Uint8Array ? value : new Uint8Array(value || []);
  }

  function ascii(bytes, start, length) {
    let result = "",
      end = Math.min(bytes.length, start + length);
    for (let index = start; index < end; index++) {
      result += String.fromCharCode(bytes[index]);
    }
    return result;
  }

  function startsWith(bytes, signature) {
    return signature.every((value, index) => bytes[index] === value);
  }

  function isHtmlResponse(value, contentType = "") {
    let bytes = asBytes(value),
      type = String(contentType).toLowerCase();
    if (type.includes("text/html") || type.includes("application/xhtml")) {
      return true;
    }
    let prefix = ascii(bytes, 0, Math.min(bytes.length, 512))
      .replace(/^\s+/, "")
      .toLowerCase();
    return (
      prefix.startsWith("<!doctype html") ||
      prefix.startsWith("<html") ||
      prefix.startsWith("<head") ||
      prefix.startsWith("<body")
    );
  }

  function isMp4(value) {
    let bytes = asBytes(value),
      limit = Math.min(bytes.length - 3, 64);
    for (let index = 0; index < limit; index += 1) {
      if (
        bytes[index] === 0x66 &&
        bytes[index + 1] === 0x74 &&
        bytes[index + 2] === 0x79 &&
        bytes[index + 3] === 0x70
      )
        return true;
    }
    return false;
  }

  function isImage(value) {
    let bytes = asBytes(value);
    return (
      startsWith(bytes, [0xff, 0xd8, 0xff]) ||
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
      (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") ||
      ascii(bytes, 4, 8) === "ftypavif"
    );
  }

  function isExpectedMedia(value, contentType, expectedType) {
    if (isHtmlResponse(value, contentType)) return false;
    if (expectedType === "video") return isMp4(value);
    if (expectedType === "image") return isImage(value);
    return isMp4(value) || isImage(value);
  }

  function isAllowedTikTokMediaUrl(value) {
    try {
      let url = new URL(String(value || ""));
      return (
        url.protocol === "https:" &&
        ALLOWED_HOSTS.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
      );
    } catch {
      return false;
    }
  }

  root.DogSaverTikTokMediaValidation = {
    isAllowedTikTokMediaUrl,
    isExpectedMedia,
    isHtmlResponse,
    isImage,
    isMp4,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
