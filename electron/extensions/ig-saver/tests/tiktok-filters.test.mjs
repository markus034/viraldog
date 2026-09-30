import assert from "node:assert/strict";

await import("../tiktok/profile-filters.js");

const filters = globalThis.DogSaverTikTokFilters;
const now = Date.UTC(2026, 6, 22, 12, 0, 0);
const day = 24 * 60 * 60 * 1000;
const posts = [
  {
    id: "1",
    mediaType: "video",
    description: "Praia e viagem #Ferias",
    createdAt: (now - day) / 1000,
    stats: { likes: 5000, views: 50000, comments: 300 },
  },
  {
    id: "2",
    mediaType: "photos",
    description: "Café da manhã #rotina",
    createdAt: (now - 5 * day) / 1000,
    stats: { likes: 800, views: 7000, comments: 80 },
  },
  {
    id: "3",
    mediaType: "video",
    description: "Arquivo antigo",
    createdAt: (now - 40 * day) / 1000,
    stats: { likes: 50, views: 900, comments: 2 },
  },
];

assert.deepEqual(
  filters.filterProfilePosts(posts, {}, now).posts.map((post) => post.id),
  ["1", "2", "3"],
);
assert.deepEqual(
  filters
    .filterProfilePosts(posts, { strategy: "topk", topK: 2 }, now)
    .posts.map((post) => post.id),
  ["1", "2"],
);

const filteredTopKPosts = [
  {
    ...posts[0],
    id: "newest-filtered-out",
    description: "Sem a palavra desejada",
  },
  { ...posts[1], id: "match-1", description: "#cachorro um" },
  { ...posts[2], id: "match-2", description: "#cachorro dois" },
];
assert.deepEqual(
  filters
    .filterProfilePosts(
      filteredTopKPosts,
      { strategy: "topk", topK: 2, keyword: "cachorro" },
      now,
    )
    .posts.map((post) => post.id),
  ["match-1", "match-2"],
);
assert.equal(
  filters.shouldStopProfileScan(filteredTopKPosts.slice(0, 2), {
    strategy: "topk",
    topK: 2,
    keyword: "cachorro",
  }, now).stop,
  false,
);
assert.deepEqual(
  filters.shouldStopProfileScan(filteredTopKPosts, {
    strategy: "topk",
    topK: 2,
    keyword: "cachorro",
  }, now),
  {
    stop: true,
    reason: "topk",
    result: filters.filterProfilePosts(
      filteredTopKPosts,
      { strategy: "topk", topK: 2, keyword: "cachorro" },
      now,
    ),
  },
);
assert.deepEqual(
  filters
    .filterProfilePosts(posts, { strategy: "lastNDays", nDays: 7 }, now)
    .posts.map((post) => post.id),
  ["1", "2"],
);

const secondTimestamp = posts[1].createdAt * 1000;
assert.deepEqual(
  filters
    .filterProfilePosts(
      posts,
      {
        strategy: "range",
        fromTs: secondTimestamp,
        toTs: secondTimestamp,
      },
      now,
    )
    .posts.map((post) => post.id),
  ["2"],
);
assert.deepEqual(
  filters
    .filterProfilePosts(posts, { keyword: "VIAGEM" }, now)
    .posts.map((post) => post.id),
  ["1"],
);
assert.deepEqual(
  filters
    .filterProfilePosts(posts, { keyword: "ferias" }, now)
    .posts.map((post) => post.id),
  ["1"],
);
assert.deepEqual(
  filters
    .filterProfilePosts(
      posts,
      { minLikes: 1000, minViews: 10000, minComments: 100 },
      now,
    )
    .posts.map((post) => post.id),
  ["1"],
);
assert.deepEqual(
  filters
    .filterProfilePosts(posts, { includePhotos: false }, now)
    .posts.map((post) => post.id),
  ["1", "3"],
);
assert.equal(
  filters.activeFilterCount({
    strategy: "lastNDays",
    keyword: "praia",
    minLikes: 100,
    minViews: 200,
    minComments: 3,
  }),
  5,
);

assert.equal(
  filters.shouldStopProfileScan(
    [posts[0], { ...posts[2], pinned: true }],
    { strategy: "lastNDays", nDays: 7 },
    now,
  ).stop,
  false,
);
assert.equal(
  filters.shouldStopProfileScan(
    posts,
    { strategy: "lastNDays", nDays: 7 },
    now,
  ).reason,
  "date",
);

console.log("tiktok filter tests passed");
