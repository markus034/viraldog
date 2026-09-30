import assert from "node:assert/strict";

await import("../tiktok/parser.js");

const parser = globalThis.DogSaverTikTokParser;

assert.ok(parser, "TikTok parser should be exposed");

const videoData = {
  __DEFAULT_SCOPE__: {
    "webapp.video-detail": {
      itemInfo: {
        itemStruct: {
          id: "123456789",
          isPinnedItem: true,
          desc: "Video de teste",
          createTime: "1700000000",
          author: { uniqueId: "dog.saver", nickname: "Dog Saver" },
          statsV2: {
            playCount: "1000",
            diggCount: "100",
            commentCount: "10",
            shareCount: "5",
            collectCount: "3",
          },
          video: {
            width: 720,
            height: 1280,
            downloadAddr: "https://watermarked.example/video.mp4",
            bitrateInfo: [
              {
                Bitrate: 900000,
                CodecType: "h264",
                PlayAddr: {
                  Width: 540,
                  Height: 960,
                  UrlList: ["https://cdn.example/540.mp4"],
                },
              },
              {
                Bitrate: 1800000,
                CodecType: "h265_hvc1",
                PlayAddr: {
                  Width: 720,
                  Height: 1280,
                  UrlList: [
                    "https://cdn.example/720.mp4",
                    "https://backup.example/720.mp4",
                  ],
                },
              },
            ],
          },
        },
      },
    },
  },
};

const videoPost = parser.parseHydrationData(
  videoData,
  "https://www.tiktok.com/@dog.saver/video/123456789",
);
assert.equal(videoPost.id, "123456789");
assert.equal(videoPost.mediaType, "video");
assert.equal(videoPost.pinned, true);
assert.equal(videoPost.media[0].url, "https://cdn.example/540.mp4");
assert.deepEqual(videoPost.media[0].fallbackUrls, [
  "https://watermarked.example/video.mp4",
]);
assert.match(videoPost.media[0].codec, /h264/i);
assert.notEqual(videoPost.media[0].url, videoData.__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct.video.downloadAddr);
assert.equal(videoPost.stats.views, 1000);

const compatibleDownloadFallback = parser.selectBestVideo({
  width: 1080,
  height: 1920,
  downloadAddr: "https://cdn.example/compatible-download.mp4",
  bitrateInfo: [
    {
      Bitrate: 2400000,
      CodecType: "bytevc1",
      PlayAddr: {
        Width: 1080,
        Height: 1920,
        UrlList: ["https://cdn.example/hevc-only.mp4"],
      },
    },
  ],
});
assert.equal(
  compatibleDownloadFallback.url,
  "https://cdn.example/compatible-download.mp4",
);
assert.deepEqual(compatibleDownloadFallback.fallbackUrls, []);

const photoData = {
  itemInfo: {
    itemStruct: {
      id: "987654321",
      desc: "Carrossel",
      createTime: 1700000001,
      author: { uniqueId: "dog.photos", nickname: "Dog Photos" },
      stats: {},
      imagePost: {
        images: [
          { imageURL: { urlList: ["https://cdn.example/one.jpeg"] } },
          { displayImage: { UrlList: ["https://cdn.example/two.jpeg"] } },
        ],
      },
    },
  },
};

const photoPost = parser.parseHydrationData(photoData);
assert.equal(photoPost.mediaType, "photos");
assert.deepEqual(
  photoPost.media.map((item) => item.url),
  ["https://cdn.example/one.jpeg", "https://cdn.example/two.jpeg"],
);
assert.equal(
  parser.postIdFromUrl("https://www.tiktok.com/@dog.photos/photo/987654321"),
  "987654321",
);
assert.equal(
  photoPost.sourceUrl,
  "https://www.tiktok.com/@dog.photos/photo/987654321",
);

const feedPosts = parser.extractPosts({
  itemList: [
    videoData.__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct,
    photoData.itemInfo.itemStruct,
    videoData.__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct,
  ],
});
assert.equal(feedPosts.length, 2);
assert.deepEqual(
  feedPosts.map((post) => post.id),
  ["123456789", "987654321"],
);

console.log("tiktok parser tests passed");
