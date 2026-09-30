export function selectVideoUrl(versions, fallbackUrl = "") {
  if (!Array.isArray(versions) || versions.length === 0) return fallbackUrl || "";
  const sorted = [...versions].sort((a, b) => {
    const areaA = (a.width || 0) * (a.height || 0);
    const areaB = (b.width || 0) * (b.height || 0);
    return areaB - areaA;
  });
  for (const version of sorted) {
    const width = version.width || 0;
    const height = version.height || 0;
    if (width > 0 && height > 0) {
      if ((width <= 720 && height <= 1280) || (width <= 1280 && height <= 720)) {
        return version.url || "";
      }
    }
  }
  return sorted.at(-1)?.url || fallbackUrl || "";
}

export function shortcodeToMediaId(shortcode) {
  if (typeof shortcode !== "string" || !shortcode) return "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let value = 0n;
  for (const character of shortcode) {
    const index = alphabet.indexOf(character);
    if (index < 0) return "";
    value = value * 64n + BigInt(index);
  }
  return value.toString();
}

export function normalizeNode(node) {
  const likeCount = node.like_count ?? node.edge_media_preview_like?.count ?? node.edge_liked_by?.count ?? 0;
  const playCount = node.play_count ?? node.view_count ?? node.video_play_count ?? 0;
  const commentCount = node.comment_count ?? node.edge_media_to_comment?.count ?? 0;
  const saveCount = node.save_count ?? node.edge_media_preview_save?.count ?? 0;
  const captionText =
    typeof node.caption === "string"
      ? node.caption
      : node.caption?.text ?? node.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";

  if (node.shortcode != null || node.taken_at_timestamp != null) {
    return { ...node, likeCount, playCount, commentCount, saveCount, captionText };
  }

  const typename = { 1: "GraphImage", 2: "GraphVideo", 8: "GraphSidecar" }[node.media_type] || "GraphImage";
  const normalized = {
    shortcode: node.code ?? node.pk?.toString(),
    id: node.pk?.toString(),
    __typename: typename,
    is_video: node.media_type === 2,
    taken_at_timestamp: node.taken_at ?? node.taken_at_timestamp ?? 0,
    likeCount,
    playCount,
    commentCount,
    saveCount,
    captionText,
  };

  const candidates = node.image_versions2?.candidates;
  if (candidates?.length) normalized.display_url = candidates[0].url;
  if (Array.isArray(node.video_versions) && node.video_versions.length) {
    normalized.video_url = selectVideoUrl(node.video_versions, node.video_url);
  }
  if (node.carousel_media?.length) {
    normalized.edge_sidecar_to_children = {
      edges: node.carousel_media.map((item) => ({
        node: {
          display_url: item.image_versions2?.candidates?.[0]?.url,
          is_video: item.media_type === 2,
          video_url: selectVideoUrl(item.video_versions, item.video_url),
        },
      })),
    };
  }
  return normalized;
}

export function parsePostNode(rawNode, username) {
  const node = normalizeNode(rawNode);
  const postId = node.shortcode || node.id;
  const timestamp = node.taken_at_timestamp || 0;
  const isCarousel = node.__typename === "GraphSidecar" || node.edge_sidecar_to_children?.edges?.length > 0;
  const children = isCarousel ? node.edge_sidecar_to_children?.edges || [] : [{ node }];
  const mediaItems = children.flatMap((child, index) => parseMediaNode(child.node, postId, index, timestamp, username));

  return {
    postId,
    shortcode: String(node.shortcode || ""),
    timestamp,
    isCarousel,
    carouselCount: children.length,
    mediaItems,
    typename: node.__typename || "",
    likeCount: node.likeCount,
    playCount: node.playCount,
    commentCount: node.commentCount,
    saveCount: node.saveCount,
    captionText: node.captionText,
  };
}

function parseMediaNode(node, postId, index, timestamp, username) {
  const isVideo = node.is_video === true || node.__typename === "GraphVideo";
  const imageUrl = node.display_url || "";
  const videoUrl = node.video_url || "";
  return [
    {
      postId,
      index,
      type: isVideo ? "video" : "image",
      url: (isVideo && videoUrl ? videoUrl : imageUrl || videoUrl) || "",
      timestamp,
      creator: username,
    },
  ];
}
