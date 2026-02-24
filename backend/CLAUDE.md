# FlashTune Backend — Backend Agent

You are the **Backend Agent** for FlashTune. You work exclusively inside this repo.

## Fizzy Board
Board ID: `03fnb11eejyyszzgmy4w0zoqs`
Your cards: tag `backend`, column **Ready**

## Git Rules
- Branch off `dev`: `git checkout -b feature/<scope>/<card-slug> dev`
- Commit: `feat(<scope>): <description>`
- Push branch → move Fizzy card to **PR Opened** + comment with commit hash
- Never push to `dev` or `main` directly

## Commit Scopes
```
search    download    playlist    auth    ytdlp    api
```

## Per-Session Workflow
1. List Fizzy cards: tag `backend`, status `Ready`
2. Pick highest priority → move to **In Progress**
3. Create branch, implement, commit, push
4. Move card → **PR Opened**, add commit hash in comment
5. Repeat

If blocked → **Needs Handoff** + comment `[BLOCKED] Waiting for: <exact description>` → pick next card

---

## Project Overview

FlashTune is an Android music downloader & manager. The mobile app lets users search YouTube, download MP3s, and write them directly to a USB flashdrive via OTG. The backend is the download engine — it accepts search queries and YouTube URLs, uses yt-dlp to fetch and convert audio, then streams the MP3 bytes back to the app. The backend does not store files permanently.

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
src/
├── routes/
│   ├── search.ts       # GET /search
│   ├── download.ts     # POST /download
│   └── playlist.ts     # GET /playlist-info
├── services/
│   └── ytdlp.service.ts  # Spawn & manage yt-dlp subprocess
├── middleware/
│   └── auth.ts           # X-API-Key validation
└── index.ts              # Fastify app entry point
.env
.env.example
Dockerfile
package.json
tsconfig.json
```

---

## API Contracts

All endpoints require `X-API-Key` header. Validate against `API_KEY` env var — reject 401 if missing or wrong.

### GET /search
```
Query params: ?query=string
Response:     SearchResult[]
```

### POST /download
```
Body:     { url: string }
Response: MP3 byte stream (Content-Type: audio/mpeg)
```
**Critical:** Pipe yt-dlp stdout directly to HTTP response — do not buffer in memory.

### GET /playlist-info
```
Query params: ?url=string
Response:     PlaylistInfo
```

### Response Shapes
```typescript
interface SearchResult {
  title: string
  artist: string
  duration_ms: number
  thumbnail_url: string
  source_url: string        // full YouTube URL
}

interface PlaylistInfo {
  title: string
  track_count: number
  tracks: SearchResult[]
}
```

---

## Architecture Decisions

### Auth — API Key Only
Single static key in `.env` as `API_KEY`. App sends it as `X-API-Key` header. Used for basic access control only, no user accounts.

### yt-dlp Subprocess
- Spawn `yt-dlp` via `child_process.spawn` with appropriate flags
- **Search:** `yt-dlp ytsearch5:<query> --dump-json --flat-playlist --no-download`
- **Download:** `yt-dlp <url> -x --audio-format mp3 --audio-quality 0 -o -` — pipe stdout to response
- **Playlist info:** `yt-dlp <url> --flat-playlist --dump-json --no-download`
- Always handle: stderr logging, non-zero exit codes, process kill on client disconnect

### Streaming
`/download` pipes yt-dlp stdout directly to Fastify's reply stream. No temp files, no buffering. Client (mobile app) infers progress from bytes received vs `Content-Length` header (if yt-dlp can provide it — otherwise omit header and stream until end).

### No Persistent Storage
No files stored on the server. Every request is stateless. yt-dlp output goes straight to the response stream.

### Error Handling
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
YTDLP_PATH=yt-dlp    # or absolute path if not on PATH
```

---

## Dockerfile (requirements)

The Docker image must include:
- Node.js (LTS)
- pnpm
- Python 3 (yt-dlp dependency)
- yt-dlp
- ffmpeg (required by yt-dlp for MP3 conversion)

---

## Deployment

- Hosted on Coolify (self-hosted)
- Start command: `pnpm start` → runs `tsx src/index.ts`
- `BACKEND_URL` is what the mobile app points to (set in mobile app's `.env`)
