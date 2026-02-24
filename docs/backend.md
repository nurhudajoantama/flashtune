# FlashTune Backend

Implementation guide for the Fastify API in `backend/`.

## Scope and User Story

Problem:
- Mobile app requires stable, stream-capable YouTube adapter endpoints with explicit error contracts.

Primary story:
- As a mobile client, I want a reliable backend search/download API so I can stream and persist songs to USB without backend state.

Acceptance baseline:
- All protected routes validate `X-API-Key`.
- `/download` streams bytes without temp files.
- yt-dlp failures are mapped to deterministic status codes.

Sprint 02 planned auth extension:
- Support YAML-defined multi-token list with enabled/disabled entries.

## Tech Stack

| | Choice |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Fastify |
| TS execution | tsx (run `.ts` directly, no build step) |
| Package manager | pnpm |
| Downloads | yt-dlp (CLI, spawned as subprocess) |
| Audio source | YouTube only |
| Deployment | Dockerfile on Coolify |

## Folder Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── search.ts       # GET /search
│   │   ├── download.ts     # POST /download
│   │   └── playlist.ts     # GET /playlist-info
│   ├── services/
│   │   └── ytdlp.service.ts
│   ├── middleware/
│   │   └── auth.ts         # X-API-Key validation
│   └── index.ts            # Fastify entry point
├── .env
├── .env.example
├── Dockerfile
├── package.json
└── tsconfig.json
```

## API Contracts

All endpoints require `X-API-Key` header. Validate against `API_KEY` env var and reject 401 if missing or wrong.

```
GET  /search        ?query=string     → SearchResult[]
POST /download      { url: string }   → MP3 byte stream (audio/mpeg)
GET  /playlist-info ?url=string       → PlaylistInfo
GET  /health                          → { status: 'ok', timestamp: string }
```

### Request and Response Examples

`GET /search?query=bohemian+rhapsody`

```json
[
  {
    "title": "Bohemian Rhapsody",
    "artist": "Queen",
    "duration_ms": 354000,
    "thumbnail_url": "https://i.ytimg.com/...",
    "source_url": "https://www.youtube.com/watch?v=fJ9rUzIMcZQ"
  }
]
```

`POST /download`

```json
{ "url": "https://www.youtube.com/watch?v=fJ9rUzIMcZQ" }
```

Response:
- status `200`
- header `Content-Type: audio/mpeg`
- body: binary stream

`GET /playlist-info?url=https://www.youtube.com/playlist?list=...`

```json
{
  "title": "My Playlist",
  "track_count": 12,
  "tracks": [
    {
      "title": "Track 1",
      "artist": "Artist",
      "duration_ms": 201000,
      "thumbnail_url": "https://i.ytimg.com/...",
      "source_url": "https://www.youtube.com/watch?v=..."
    }
  ]
}
```

### Response Shapes

```typescript
interface SearchResult {
  title: string
  artist: string
  duration_ms: number
  thumbnail_url: string
  source_url: string   // full YouTube URL
}

interface PlaylistInfo {
  title: string
  track_count: number
  tracks: SearchResult[]
}
```

## yt-dlp Subprocess

Spawn via `child_process.spawn`:

- **Search:** `yt-dlp ytsearch5:<query> --dump-json --flat-playlist --no-download`
- **Download:** `yt-dlp <url> -x --audio-format mp3 --audio-quality 0 -o -` and pipe stdout to response
- **Playlist info:** `yt-dlp <url> --flat-playlist --dump-json --no-download`

Always handle: stderr logging, non-zero exit codes, process kill on client disconnect.

Current implementation behavior:
- shared JSON-lines collector for search/playlist endpoints
- typed `YtDlpError` with status codes for route-level mapping
- `ENOENT` (binary missing) handled as 500
- non-zero exit with stderr mapped to 422 for domain/content errors

## Streaming (Critical)

`POST /download` pipes yt-dlp stdout directly to Fastify's reply stream.
No temp files. No buffering. Stateless per request.

Kill yt-dlp process immediately when client disconnects.

Streaming lifecycle:
- spawn process with mp3 extraction flags
- begin reply with `audio/mpeg`
- detect first stdout chunk as stream start marker
- if process fails before first chunk, return JSON error (422/500)
- if process fails after stream starts, log warning and terminate process

## Auth

Single static key in `.env` as `API_KEY`. Client sends as `X-API-Key` header.

Planned auth v2 contract (Sprint 02):

- Config source: `backend/config/tokens.yaml` (override with `TOKEN_CONFIG_PATH`).
- Header remains unchanged: `X-API-Key`.
- Backend validates key against YAML `token_list` (enabled tokens only).

Planned auth errors:
- `401`: missing/invalid/disabled token
- `500`: auth config invalid/unreadable

## Error Handling

| Scenario | Response |
|---|---|
| yt-dlp not on PATH | 500 with clear message |
| Invalid / unavailable URL | 422 with yt-dlp stderr reason |
| API key missing/wrong | 401 |
| Client disconnects mid-stream | Kill yt-dlp process immediately |

Canonical error payload:

```json
{ "error": "human readable message" }
```

Status mapping:
- `400`: validation (missing `query` or `url`)
- `401`: auth failure
- `422`: yt-dlp content/domain failure
- `500`: runtime failure (binary missing or unexpected error)

## Business Logic Notes

- Backend remains stateless per request.
- No durable task queue in backend; mobile owns queue orchestration.
- No server-side deduplication; dedup belongs to mobile `.musicdb` layer.
- Search and playlist adapters normalize upstream yt-dlp fields into stable app contracts.

## Environment Variables

```env
API_KEY=<random static key>
PORT=3000
YTDLP_PATH=yt-dlp   # or absolute path
```

## Dockerfile Requirements

Image must include: Node.js LTS, pnpm, Python 3, yt-dlp, ffmpeg.

Start command: `pnpm start` -> `tsx src/index.ts`
