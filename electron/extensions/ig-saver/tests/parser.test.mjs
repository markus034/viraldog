import assert from "node:assert/strict";
import { extractRawItems, getPaginationInfo, shouldInterceptInstagramUrl } from "../instagram/core/interceptor-parser.js";
import {
  normalizeNode,
  parsePostNode,
  selectVideoUrl,
  shortcodeToMediaId,
} from "../instagram/core/media-normalizer.js";

assert.equal(shouldInterceptInstagramUrl("https://www.instagram.com/graphql/query?x=1"), true);
assert.equal(shouldInterceptInstagramUrl("https://www.instagram.com/api/v1/feed/user/123/"), true);
assert.equal(shouldInterceptInstagramUrl("https://www.instagram.com/api/v1/feed/reels_media/"), true);

const graphql = {
  data: {
    user: {
      edge_owner_to_timeline_media: {
        edges: [{ node: { shortcode: "ABC" } }],
        page_info: { has_next_page: true, end_cursor: "cursor-1" },
      },
    },
  },
};
assert.equal(extractRawItems(graphql).length, 1);
assert.deepEqual(getPaginationInfo(graphql), { hasNextPage: true, endCursor: "cursor-1" });

const homeFeed = {
  feed_items: [
    {
      media_or_ad: {
        code: "ABC123",
        media_type: 2,
        video_versions: [{ url: "home-video.mp4", width: 720, height: 1280 }],
      },
    },
  ],
  more_available: true,
  next_max_id: "home-cursor",
};
assert.equal(extractRawItems(homeFeed)[0].media_or_ad.code, "ABC123");
assert.deepEqual(getPaginationInfo(homeFeed), {
  hasNextPage: true,
  endCursor: "home-cursor",
});

const homeGraphql = {
  data: {
    xdt_api__v1__feed__timeline__connection: {
      edges: [{ node: { media_or_ad: { code: "XYZ987" } } }],
      page_info: { has_next_page: false, end_cursor: null },
    },
  },
};
assert.equal(extractRawItems(homeGraphql)[0].node.media_or_ad.code, "XYZ987");
assert.deepEqual(getPaginationInfo(homeGraphql), {
  hasNextPage: false,
  endCursor: null,
});

assert.equal(shortcodeToMediaId("A"), "0");
assert.equal(shortcodeToMediaId("B"), "1");
assert.equal(shortcodeToMediaId("BA"), "64");
assert.equal(shortcodeToMediaId("invalid!"), "");

assert.equal(
  selectVideoUrl(
    [
      { width: 1920, height: 1080, url: "large.mp4" },
      { width: 720, height: 1280, url: "story.mp4" },
    ],
    "fallback.mp4",
  ),
  "story.mp4",
);

const normalized = normalizeNode({
  pk: 123,
  media_type: 2,
  taken_at: 1710000000,
  like_count: 10,
  play_count: 20,
  comment_count: 3,
  save_count: 4,
  caption: { text: "#demo caption" },
  video_versions: [{ width: 720, height: 1280, url: "video.mp4" }],
});
assert.equal(normalized.likeCount, 10);
assert.equal(normalized.playCount, 20);
assert.equal(normalized.captionText, "#demo caption");

const parsed = parsePostNode(normalized, "creator");
assert.equal(parsed.mediaItems[0].type, "video");
assert.equal(parsed.mediaItems[0].creator, "creator");

console.log("parser tests passed");
