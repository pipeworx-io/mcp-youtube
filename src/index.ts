interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * YouTube MCP — wraps the YouTube Data API v3 (BYO API key)
 *
 * Tools:
 * - yt_search: search videos, channels, or playlists
 * - yt_video_details: get video details including stats
 * - yt_channel_details: get channel info and stats
 * - yt_channel_videos: list videos from a channel
 * - yt_video_comments: get comments on a video
 */


const BASE = 'https://www.googleapis.com/youtube/v3';

// ── Tool definitions ──────────────────────────────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'yt_search',
    description:
      'Search YouTube for videos, channels, or playlists. Returns snippet info including title, description, channel, thumbnails, and publish date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'YouTube Data API v3 key from Google Cloud Console' },
        query: { type: 'string', description: 'Search term' },
        type: {
          type: 'string',
          description: 'Resource type to search: "video", "channel", or "playlist" (default: "video")',
        },
        max_results: {
          type: 'number',
          description: 'Number of results to return (default 10, max 50)',
        },
        channel_id: {
          type: 'string',
          description: 'Filter results to a specific channel ID',
        },
        order: {
          type: 'string',
          description: 'Sort order: "date", "rating", "relevance", or "viewCount" (default: "relevance")',
        },
        published_after: {
          type: 'string',
          description: 'Filter results published after this ISO 8601 date (e.g. "2024-01-01T00:00:00Z")',
        },
      },
      required: ['_apiKey', 'query'],
    },
  },
  {
    name: 'yt_video_details',
    description:
      'Get detailed information about one or more YouTube videos including title, description, channel, duration, view/like/comment counts, and tags.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'YouTube Data API v3 key from Google Cloud Console' },
        video_id: {
          type: 'string',
          description: 'Video ID or comma-separated list of video IDs (max 50)',
        },
      },
      required: ['_apiKey', 'video_id'],
    },
  },
  {
    name: 'yt_channel_details',
    description:
      'Get YouTube channel information and statistics including subscriber count, video count, view count, description, and custom URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'YouTube Data API v3 key from Google Cloud Console' },
        channel_id: { type: 'string', description: 'Channel ID (starts with UC...)' },
        username: {
          type: 'string',
          description: 'Channel username (alternative to channel_id)',
        },
      },
      required: ['_apiKey'],
    },
  },
  {
    name: 'yt_channel_videos',
    description:
      'List recent videos from a YouTube channel, ordered by date. Returns video ID, title, description, and publish date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'YouTube Data API v3 key from Google Cloud Console' },
        channel_id: { type: 'string', description: 'Channel ID to list videos from' },
        max_results: {
          type: 'number',
          description: 'Number of videos to return (default 10, max 50)',
        },
        published_after: {
          type: 'string',
          description: 'Filter videos published after this ISO 8601 date',
        },
        published_before: {
          type: 'string',
          description: 'Filter videos published before this ISO 8601 date',
        },
      },
      required: ['_apiKey', 'channel_id'],
    },
  },
  {
    name: 'yt_video_comments',
    description:
      'Get top-level comment threads on a YouTube video. Returns author, text, like count, and publish date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'YouTube Data API v3 key from Google Cloud Console' },
        video_id: { type: 'string', description: 'Video ID to fetch comments for' },
        max_results: {
          type: 'number',
          description: 'Number of comment threads to return (default 20, max 100)',
        },
        order: {
          type: 'string',
          description: 'Sort order: "time" or "relevance" (default: "relevance")',
        },
      },
      required: ['_apiKey', 'video_id'],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

function extractKey(args: Record<string, unknown>): string {
  const key = args._apiKey as string;
  if (!key) throw new Error('YouTube Data API key required. Pass _apiKey parameter.');
  return key;
}

async function ytGet(key: string, path: string, params: Record<string, string>): Promise<unknown> {
  params.key = key;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Tool implementations ─────────────────────────────────────────────

async function search(
  key: string,
  query: string,
  type?: string,
  maxResults?: number,
  channelId?: string,
  order?: string,
  publishedAfter?: string,
) {
  const count = Math.min(50, Math.max(1, maxResults ?? 10));
  const params: Record<string, string> = {
    part: 'snippet',
    q: query,
    type: type ?? 'video',
    maxResults: String(count),
    order: order ?? 'relevance',
  };
  if (channelId) params.channelId = channelId;
  if (publishedAfter) params.publishedAfter = publishedAfter;

  const data = (await ytGet(key, '/search', params)) as {
    items: {
      id: { kind: string; videoId?: string; channelId?: string; playlistId?: string };
      snippet: {
        title: string;
        description: string;
        channelTitle: string;
        channelId: string;
        publishedAt: string;
        thumbnails: { default?: { url: string } };
      };
    }[];
    pageInfo: { totalResults: number; resultsPerPage: number };
  };

  return {
    total_results: data.pageInfo.totalResults,
    results: data.items.map((item) => ({
      id: item.id.videoId ?? item.id.channelId ?? item.id.playlistId ?? null,
      kind: item.id.kind,
      title: item.snippet.title,
      description: item.snippet.description,
      channel_title: item.snippet.channelTitle,
      channel_id: item.snippet.channelId,
      published_at: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.default?.url ?? null,
    })),
  };
}

async function videoDetails(key: string, videoId: string) {
  const params: Record<string, string> = {
    part: 'snippet,statistics,contentDetails',
    id: videoId,
  };

  const data = (await ytGet(key, '/videos', params)) as {
    items: {
      id: string;
      snippet: {
        title: string;
        description: string;
        channelTitle: string;
        channelId: string;
        publishedAt: string;
        tags?: string[];
        categoryId: string;
        thumbnails: { default?: { url: string } };
      };
      statistics: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
      contentDetails: {
        duration: string;
        definition: string;
      };
    }[];
  };

  return {
    videos: data.items.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      description: v.snippet.description,
      channel_title: v.snippet.channelTitle,
      channel_id: v.snippet.channelId,
      published_at: v.snippet.publishedAt,
      tags: v.snippet.tags ?? [],
      category_id: v.snippet.categoryId,
      thumbnail: v.snippet.thumbnails?.default?.url ?? null,
      duration: v.contentDetails.duration,
      definition: v.contentDetails.definition,
      view_count: v.statistics.viewCount ? Number(v.statistics.viewCount) : null,
      like_count: v.statistics.likeCount ? Number(v.statistics.likeCount) : null,
      comment_count: v.statistics.commentCount ? Number(v.statistics.commentCount) : null,
    })),
  };
}

async function channelDetails(key: string, channelId?: string, username?: string) {
  if (!channelId && !username) {
    throw new Error('Either channel_id or username is required.');
  }

  const params: Record<string, string> = {
    part: 'snippet,statistics,contentDetails',
  };
  if (channelId) {
    params.id = channelId;
  } else if (username) {
    params.forUsername = username;
  }

  const data = (await ytGet(key, '/channels', params)) as {
    items: {
      id: string;
      snippet: {
        title: string;
        description: string;
        customUrl?: string;
        publishedAt: string;
        country?: string;
        thumbnails: { default?: { url: string } };
      };
      statistics: {
        viewCount?: string;
        subscriberCount?: string;
        videoCount?: string;
        hiddenSubscriberCount: boolean;
      };
      contentDetails: {
        relatedPlaylists: { uploads: string };
      };
    }[];
  };

  if (!data.items || data.items.length === 0) {
    throw new Error('Channel not found.');
  }

  return {
    channels: data.items.map((ch) => ({
      id: ch.id,
      title: ch.snippet.title,
      description: ch.snippet.description,
      custom_url: ch.snippet.customUrl ?? null,
      published_at: ch.snippet.publishedAt,
      country: ch.snippet.country ?? null,
      thumbnail: ch.snippet.thumbnails?.default?.url ?? null,
      view_count: ch.statistics.viewCount ? Number(ch.statistics.viewCount) : null,
      subscriber_count: ch.statistics.hiddenSubscriberCount
        ? null
        : ch.statistics.subscriberCount
          ? Number(ch.statistics.subscriberCount)
          : null,
      video_count: ch.statistics.videoCount ? Number(ch.statistics.videoCount) : null,
      uploads_playlist: ch.contentDetails.relatedPlaylists.uploads,
    })),
  };
}

async function channelVideos(
  key: string,
  channelId: string,
  maxResults?: number,
  publishedAfter?: string,
  publishedBefore?: string,
) {
  const count = Math.min(50, Math.max(1, maxResults ?? 10));
  const params: Record<string, string> = {
    part: 'snippet',
    channelId,
    type: 'video',
    order: 'date',
    maxResults: String(count),
  };
  if (publishedAfter) params.publishedAfter = publishedAfter;
  if (publishedBefore) params.publishedBefore = publishedBefore;

  const data = (await ytGet(key, '/search', params)) as {
    items: {
      id: { videoId?: string };
      snippet: {
        title: string;
        description: string;
        publishedAt: string;
        thumbnails: { default?: { url: string } };
      };
    }[];
    pageInfo: { totalResults: number };
  };

  return {
    total_results: data.pageInfo.totalResults,
    videos: data.items.map((item) => ({
      video_id: item.id.videoId ?? null,
      title: item.snippet.title,
      description: item.snippet.description,
      published_at: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.default?.url ?? null,
    })),
  };
}

async function videoComments(key: string, videoId: string, maxResults?: number, order?: string) {
  const count = Math.min(100, Math.max(1, maxResults ?? 20));
  const params: Record<string, string> = {
    part: 'snippet',
    videoId,
    maxResults: String(count),
    order: order ?? 'relevance',
  };

  const data = (await ytGet(key, '/commentThreads', params)) as {
    items: {
      id: string;
      snippet: {
        topLevelComment: {
          id: string;
          snippet: {
            authorDisplayName: string;
            authorChannelUrl: string;
            textDisplay: string;
            likeCount: number;
            publishedAt: string;
            updatedAt: string;
          };
        };
        totalReplyCount: number;
      };
    }[];
    pageInfo: { totalResults: number };
  };

  return {
    total_results: data.pageInfo.totalResults,
    comments: data.items.map((thread) => {
      const c = thread.snippet.topLevelComment.snippet;
      return {
        comment_id: thread.snippet.topLevelComment.id,
        author: c.authorDisplayName,
        author_channel_url: c.authorChannelUrl,
        text: c.textDisplay,
        like_count: c.likeCount,
        reply_count: thread.snippet.totalReplyCount,
        published_at: c.publishedAt,
        updated_at: c.updatedAt,
      };
    }),
  };
}

// ── callTool dispatcher ──────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = extractKey(args);

  switch (name) {
    case 'yt_search':
      return search(
        apiKey,
        args.query as string,
        args.type as string | undefined,
        args.max_results as number | undefined,
        args.channel_id as string | undefined,
        args.order as string | undefined,
        args.published_after as string | undefined,
      );
    case 'yt_video_details':
      return videoDetails(apiKey, args.video_id as string);
    case 'yt_channel_details':
      return channelDetails(
        apiKey,
        args.channel_id as string | undefined,
        args.username as string | undefined,
      );
    case 'yt_channel_videos':
      return channelVideos(
        apiKey,
        args.channel_id as string,
        args.max_results as number | undefined,
        args.published_after as string | undefined,
        args.published_before as string | undefined,
      );
    case 'yt_video_comments':
      return videoComments(
        apiKey,
        args.video_id as string,
        args.max_results as number | undefined,
        args.order as string | undefined,
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 5 } } satisfies McpToolExport;
