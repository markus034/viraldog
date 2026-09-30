const ALLOWED_TIKTOK_MEDIA_HOSTS = [
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

function matchesHost(hostname, allowedHost) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function isAllowedTikTokMediaUrl(value) {
  try {
    let url = new URL(String(value || ""));
    return (
      url.protocol === "https:" &&
      ALLOWED_TIKTOK_MEDIA_HOSTS.some((host) => matchesHost(url.hostname, host))
    );
  } catch {
    return false;
  }
}

function isAllowedTikTokZipUrl(value) {
  return (
    isAllowedTikTokMediaUrl(value) ||
    /^data:application\/json;base64,[a-z0-9+/=]+$/i.test(String(value || ""))
  );
}

if (typeof globalThis !== "undefined") {
  globalThis.DogSaverTikTokSecurity = {
    ALLOWED_TIKTOK_MEDIA_HOSTS,
    isAllowedTikTokMediaUrl,
    isAllowedTikTokZipUrl,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ALLOWED_TIKTOK_MEDIA_HOSTS,
    isAllowedTikTokMediaUrl,
    isAllowedTikTokZipUrl,
  };
}

export {
  ALLOWED_TIKTOK_MEDIA_HOSTS,
  isAllowedTikTokMediaUrl,
  isAllowedTikTokZipUrl,
};

