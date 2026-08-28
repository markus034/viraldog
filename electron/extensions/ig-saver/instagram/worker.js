"use strict";

self.onmessage = function(e) {
  let { rawItems, username } = e.data;
  if (!Array.isArray(rawItems)) {
    self.postMessage({ posts: [] });
    return;
  }
  let posts = [];
  
  for (let item of rawItems) {
    try {
      let node = item.node ?? item;
      let parsed = parsePostNode(node, username);
      if (parsed) {
        posts.push(parsed);
      }
    } catch (err) {
      console.error("[Dog Saver Worker] Error parsing item:", err);
    }
  }

  self.postMessage({ posts });
};

function selectVideoUrl(versions, fallbackUrl) {
  if (Array.isArray(versions) && versions.length > 0) {
    let sorted = [...versions].sort((a, b) => {
      let areaA = (a.width || 0) * (a.height || 0);
      let areaB = (b.width || 0) * (b.height || 0);
      return areaB - areaA;
    });
    for (let v of sorted) {
      let w = v.width || 0;
      let h = v.height || 0;
      if (w > 0 && h > 0) {
        if ((w <= 720 && h <= 1280) || (w <= 1280 && h <= 720)) {
          return v.url || "";
        }
      }
    }
    return sorted[sorted.length - 1]?.url || fallbackUrl || "";
  }
  return fallbackUrl || "";
}

function normalizeNode(e) {
  let likeCount = e.like_count ?? e.edge_media_preview_like?.count ?? e.edge_liked_by?.count ?? 0;
  let playCount = e.play_count ?? e.view_count ?? e.video_play_count ?? 0;
  let commentCount = e.comment_count ?? e.edge_media_to_comment?.count ?? 0;
  let saveCount = e.save_count ?? e.edge_media_preview_save?.count ?? 0;
  let captionText = "";
  if (e.caption && typeof e.caption === "object") {
    captionText = e.caption.text ?? "";
  } else if (typeof e.caption === "string") {
    captionText = e.caption;
  } else {
    captionText = e.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
  }

  if (e.shortcode != null || e.taken_at_timestamp != null) {
    let clone = { ...e };
    if (clone.likeCount === undefined) clone.likeCount = likeCount;
    if (clone.playCount === undefined) clone.playCount = playCount;
    if (clone.commentCount === undefined) clone.commentCount = commentCount;
    if (clone.saveCount === undefined) clone.saveCount = saveCount;
    if (clone.captionText === undefined) clone.captionText = captionText;
    return clone;
  }

  let typename =
    { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[
      e.media_type
    ] || "GraphImage";

  let normalized = {
    shortcode: e.code ?? e.pk?.toString(),
    id: e.pk?.toString(),
    __typename: typename,
    is_video: e.media_type === 2,
    taken_at_timestamp: e.taken_at ?? e.taken_at_timestamp ?? 0,
    likeCount: likeCount,
    playCount: playCount,
    commentCount: commentCount,
    saveCount: saveCount,
    captionText: captionText,
  };

  let candidates = e.image_versions2?.candidates;
  if (candidates?.length) normalized.display_url = candidates[0].url;
  let video_versions = e.video_versions;
  if (Array.isArray(video_versions) && video_versions.length) {
    normalized.video_url = selectVideoUrl(video_versions, e.video_url);
  }
  if (e.carousel_media?.length) {
    normalized.edge_sidecar_to_children = {
      edges: e.carousel_media.map((s) => ({
        node: {
          display_url: s.image_versions2?.candidates?.[0]?.url,
          is_video: s.media_type === 2,
          video_url: selectVideoUrl(s.video_versions, s.video_url),
        },
      })),
    };
  }
  return normalized;
}

function parsePostNode(e, username) {
  let t = normalizeNode(e);
  let n = t.shortcode || t.id;
  let a = t.taken_at_timestamp || 0;
  let o = t.__typename || "";
  let r = o === "GraphSidecar" || t.edge_sidecar_to_children?.edges?.length > 0;
  let s = [];
  let l = 1;
  if (r && t.edge_sidecar_to_children?.edges) {
    let d = t.edge_sidecar_to_children.edges;
    l = d.length;
    let c = 0;
    for (let u of d) {
      let p = u.node;
      let g = parseMediaNodes(p, n, c, a, username);
      s.push(...g);
      c += g.length;
    }
  } else {
    s = parseMediaNodes(t, n, 0, a, username);
  }
  return {
    postId: n,
    shortcode: String(t.shortcode || ""),
    timestamp: a,
    isCarousel: r,
    carouselCount: l,
    mediaItems: s,
    typename: o,
    likeCount: t.likeCount,
    playCount: t.playCount,
    commentCount: t.commentCount,
    saveCount: t.saveCount,
    captionText: t.captionText,
  };
}

function parseMediaNodes(e, t, n, a, username) {
  let o = e.is_video === true || e.__typename === "GraphVideo";
  let r = e.display_url || "";
  let s = e.video_url || "";
  return [
    {
      postId: t,
      index: n,
      type: o ? "video" : "image",
      url: (o && s ? s : r || s) || "",
      timestamp: a,
      creator: username,
    },
  ];
}
