# mcp-youtube

YouTube MCP — wraps the YouTube Data API v3 (BYO API key)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `yt_search` | Search YouTube for videos, channels, or playlists. Returns snippet info including title, description, channel, thumbnails, and publish date. |
| `yt_video_details` | Get detailed information about one or more YouTube videos including title, description, channel, duration, view/like/comment counts, and tags. |
| `yt_channel_details` | Get YouTube channel information and statistics including subscriber count, video count, view count, description, and custom URL. |
| `yt_channel_videos` | List recent videos from a YouTube channel, ordered by date. Returns video ID, title, description, and publish date. |
| `yt_video_comments` | Get top-level comment threads on a YouTube video. Returns author, text, like count, and publish date. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "youtube": {
      "url": "https://gateway.pipeworx.io/youtube/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Youtube data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
