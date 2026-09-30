export function shouldInterceptInstagramUrl(url) {
  const isGraphQL = url.includes("/graphql/query") || url.includes("/api/graphql");
  const isFeed = url.includes("/api/v1/feed/") || url.includes("/api/v1/clips/") || url.includes("/reels_media");
  if (!isGraphQL && !isFeed) return false;
  return true;
}

export function extractRawItems(payload) {
  const connection = payload?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
  if (connection?.edges) return connection.edges;
  const homeConnection = payload?.data?.xdt_api__v1__feed__timeline__connection;
  if (homeConnection?.edges) return homeConnection.edges;
  const timeline = payload?.data?.user?.edge_owner_to_timeline_media;
  if (timeline?.edges) return timeline.edges;
  if (Array.isArray(payload?.feed_items)) return payload.feed_items;
  if (Array.isArray(payload?.items)) return payload.items;
  const shortcodeMedia = payload?.data?.xdt_shortcode_media;
  if (shortcodeMedia) return [shortcodeMedia];
  if (Array.isArray(payload?.reels_media) && payload.reels_media[0]?.items) return payload.reels_media[0].items;
  if (payload?.reels && typeof payload.reels === "object") {
    const values = Object.values(payload.reels);
    if (values[0]?.items && Array.isArray(values[0].items)) return values[0].items;
  }
  if (Array.isArray(payload?.reel?.items)) return payload.reel.items;
  return null;
}

export function getPaginationInfo(payload) {
  const connection = payload?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
  if (connection?.page_info) {
    return {
      hasNextPage: connection.page_info.has_next_page ?? false,
      endCursor: connection.page_info.end_cursor || null,
    };
  }
  const timeline = payload?.data?.user?.edge_owner_to_timeline_media;
  if (timeline?.page_info) {
    return {
      hasNextPage: timeline.page_info.has_next_page ?? false,
      endCursor: timeline.page_info.end_cursor || null,
    };
  }
  const homeConnection = payload?.data?.xdt_api__v1__feed__timeline__connection;
  if (homeConnection?.page_info) {
    return {
      hasNextPage: homeConnection.page_info.has_next_page ?? false,
      endCursor: homeConnection.page_info.end_cursor || null,
    };
  }
  if (payload?.paging_info) {
    return {
      hasNextPage: payload.paging_info.more_available ?? false,
      endCursor: payload.paging_info.max_id || null,
    };
  }
  if (payload?.next_max_id !== undefined || payload?.more_available !== undefined) {
    return {
      hasNextPage: payload.more_available ?? Boolean(payload.next_max_id),
      endCursor: payload.next_max_id || null,
    };
  }
  return null;
}
