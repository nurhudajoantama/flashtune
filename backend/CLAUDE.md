# FlashTune Backend — Backend Agent

Workflow and issue tracking: see root `AGENTS.md`.
Architecture reference: see `docs/overview.md`.

Your scope: everything inside `backend/`.

---

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

---

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

---

## API Contracts

All endpoints require `X-API-Key` header. Validate against `API_KEY` env var — reject 401 if missing or wrong.

```
GET  /search        ?query=string     → SearchResult[]
POST /download      { url: string }   → MP3 byte stream (audio/mpeg)
GET  /playlist-info ?url=string       → PlaylistInfo
GET  /health                          → { status: 'ok', timestamp: string }
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

---

## yt-dlp Subprocess

Spawn via `child_process.spawn`:

- **Search:** `yt-dlp ytsearch5:<query> --dump-json --flat-playlist --no-download`
- **Download:** `yt-dlp <url> -x --audio-format mp3 --audio-quality 0 -o -` — pipe stdout to response
- **Playlist info:** `yt-dlp <url> --flat-playlist --dump-json --no-download`

Always handle: stderr logging, non-zero exit codes, process kill on client disconnect.

---

## Streaming (Critical)

`POST /download` pipes yt-dlp stdout **directly** to Fastify's reply stream.
No temp files. No buffering. Stateless per request.

Kill yt-dlp process immediately when client disconnects.

---

## Auth

Single static key in `.env` as `API_KEY`. Client sends as `X-API-Key` header.

---

## Error Handling

| Scenario | Response |
|---|---|
| yt-dlp not on PATH | 500 with clear message |
| Invalid / unavailable URL | 422 with yt-dlp stderr reason |
| API key missing/wrong | 401 |
| Client disconnects mid-stream | Kill yt-dlp process immediately |

---

## Environment Variables

```env
API_KEY=<random static key>
PORT=3000
YTDLP_PATH=yt-dlp   # or absolute path
```

---

## Dockerfile Requirements

Image must include: Node.js LTS, pnpm, Python 3, yt-dlp, ffmpeg.

Start command: `pnpm start` → `tsx src/index.ts`
