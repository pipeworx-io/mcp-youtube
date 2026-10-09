# @pipeworx/youtube

YouTube videos, channels, comments and transcripts: search, video and channel
metadata with view/like counts, comment threads, and the caption text of a video.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1763+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `yt_search(query, type?, …)` — videos, channels or playlists matching a term.
- `yt_video_details(video_id)` — title, description, duration, view/like/comment counts, tags.
- `yt_channel_details(channel_id | username)` — subscriber, video and view counts.
- `yt_channel_videos(channel_id, …)` — a channel's recent uploads.
- `yt_video_comments(video_id, …)` — top-level comment threads.
- `yt_video_transcript(video_id, lang?, start_seconds?, max_chars?)` — the
  video's captions as timestamped segments plus the joined text, the track
  language, and whether it is auto-generated. Accepts a bare ID or a
  youtube.com / youtu.be URL. Long videos are paged: the response carries
  `truncated` and `next_start_seconds`; pass that back as `start_seconds`.

## Auth

- `yt_video_transcript` — **keyless.**
- Everything else — **BYO only**: a YouTube Data API v3 key from Google Cloud
  Console, passed as `_apiKey`. Pipeworx does not front a shared key.

## Data sources

- <https://www.googleapis.com/youtube/v3> — the Data API (all tools except the transcript).
- <https://www.youtube.com/youtubei/v1/player> — YouTube's own player endpoint,
  called with the ANDROID client context; its `captionTracks[].baseUrl` is then
  fetched with `fmt=json3` for the transcript.

**The transcript upstream is fragile.** It is an undocumented endpoint, not a
published API, and YouTube can change it without notice. What we know as of
2026-10-09 (edge-probed from a Worker, fleet #2846):

- The **WEB** watch page lists the same caption tracks, but their URLs carry
  `exp=xpe` and need a PO token: fetched bare they answer **200 with a 0-byte
  body**. That is a silent empty transcript, so the WEB route is not used.
  The ANDROID client's track URLs fetch without one.
- YouTube **intermittently** answers datacenter IPs with `LOGIN_REQUIRED`
  "Sign in to confirm you're not a bot". It lands per request rather than per
  video: through the live gateway it hit 7 of 10 consecutive calls with a
  single attempt, and then let the same videos through. So the tool tries the
  ANDROID client, then IOS (both give caption URLs that need no PO token;
  ANDROID_VR does not qualify, it was bot-checked on every probe). If both are
  refused it opens the public watch page. If that page shows the video plays
  and has no caption tracks, the answer is `captions_unavailable`. Otherwise
  both clients are retried carrying the visitor ID and cookies the page handed
  out. Only after all four are refused does the call fail `upstream_down`,
  saying that YouTube is blocking our servers. It never returns an empty
  transcript. The watch page itself answers 429 from some egress IPs, and in
  that case it is skipped.
- Translation (`&tlang=`) answers **429** from a datacenter IP, so a language
  the video has no track for is refused (`captions_unavailable`, listing the
  tracks it does have) rather than machine-translated.
- A video with no caption tracks fails `captions_unavailable`. A private,
  removed or region-blocked video fails `not_found` with YouTube's own reason.

If this starts failing for every video, check the ANDROID `clientVersion` in
`src/index.ts` first — YouTube retires old client versions.

**The egress relay is NOT the fallback after that. Measured and ruled out
2026-10-09 (fleet #2877).** It was the obvious next move and it is strictly
worse than what we have. Probed from a throwaway function on the relay's own
Supabase edge infra, against `www.youtube.com`:

| Leg the transcript needs | Through the relay | Residential control |
|---|---|---|
| `POST /youtubei/v1/player` | **403, 10/10** — Google's "Sorry… your computer or network may be sending automated queries" page, an identical 1,103 bytes on every call, across 5 different videos | 200 `OK`, 3/3, 2 caption tracks |
| `GET /watch?v=` | 200, 5/5, visitor ID present | — |
| `GET /api/timedtext` (signed) | 200, 3/3, 79,833 bytes — byte-identical to residential | 200, 79,833 bytes |

So the block is scoped to **exactly one endpoint** — the innertube player call —
and that is the only leg that fails on Cloudflare today. The relay refuses it
**100%** of the time; Cloudflare egress refuses it **40%** (8 of 20 live
`yt_video_transcript` calls across 10 videos, 2026-10-09). Routing the player
call through the relay would take the tool from partly working to never working,
which is why `www.youtube.com` is deliberately absent from the relay's
`ALLOWED_HOSTS` (there is a note there saying so). The two legs that *do* pass
the relay are not the ones that need help.

Measuring the 40% needs care: the gateway caches tool responses, so a probe that
repeats identical arguments reads far too healthy. An un-busted run of the same
10 videos scored 14/16; varying `max_chars` per call to defeat the cache gave
12/20. Vary an argument or you will measure the cache.

What is actually left, none of it tried: a residential/mobile proxy (costs
money, so it is Bruce's call), a PO-token minter so the WEB route's `exp=xpe`
URLs stop answering 0 bytes, or accepting the 40% and making the retry advice in
the error message the answer.

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

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/youtube/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1763+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

This pack takes your own API key (`_apiKey`) — we don't front one for it, so there's no curl here that would run without it. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/yt_search`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Standalone (no gateway account)

This package also runs as a local stdio MCP server — no Pipeworx account, no
gateway round-trip:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-youtube"]
    }
  }
}
```

Or run it directly to confirm it starts:

```bash
npx -y @pipeworx/mcp-youtube
```

It speaks MCP over stdin/stdout and answers `initialize`/`tools/list`/`tools/call`
for **only** this pack's tools — none of the shared meta-tools the gateway
connection above adds. Same source, same tools, no ask_pipeworx routing.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Youtube data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
