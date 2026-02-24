# Sprint 01 Implementation Contract and Delivery

## Sprint Metadata

- Sprint tag: `sprint-01`
- Beads epic: `flashtune-1x0`
- Sprint branch: `feature/sprint/sprint-01`
- Goal: ship first end-to-end USB-aware backend and mobile flows for search/download/database sync.

## Problem Statement and Scope

FlashTune needs a working vertical slice where a user can connect a USB drive, search tracks from YouTube, download a track, write MP3 to USB, and persist song metadata in the local database mirror with sync-back behavior.

In-scope:
- backend search, download streaming, and playlist-info contracts
- mobile USB bridge validation and USB manager integration
- mobile download orchestration with queue state updates
- mobile settings runtime API configuration
- database lifecycle attach/init/detach and CRUD utilities used by download flow

Out-of-scope:
- production-grade Kotlin SAF module expansion not already present
- full SQLite execution layer migration to `react-native-quick-sqlite`
- playlist UI and preview playback final UX

## User Stories and Acceptance Criteria

### Story 1: USB lifecycle and visibility
As a FlashTune user, I want to connect and inspect my USB drive so I can manage files without leaving the app.

Acceptance:
- User can trigger USB permission and connect a drive from USB Manager.
- App displays drive storage information and Music directory file list.
- User can delete a file from Music and the list refreshes.
- On disconnect, app clears active USB state and performs DB detach sync attempt.

### Story 2: Search and download
As a user, I want to search YouTube tracks and download selected songs to my drive so my library is portable.

Acceptance:
- Search screen calls backend `/search` and renders real results.
- Existing songs are marked `On drive` using local DB lookup by `source_url`.
- Download action creates queue item and progresses through states.
- Successful download writes MP3 to USB and inserts song metadata.
- Failed download surfaces error and queue item moves to `error`.

### Story 3: API behavior and reliability
As a mobile client, I want stable backend error contracts so the app can handle failures predictably.

Acceptance:
- Missing/invalid API key returns 401.
- Missing query/body input returns 400.
- Invalid yt-dlp URL/content errors return 422.
- Missing yt-dlp binary returns 500.
- Download stream process is killed on client disconnect.

## Feature Breakdown by Beads Issue

- `flashtune-e1c`: streaming `/download` process lifecycle hardening.
- `flashtune-9r3`: robust `/search` adapter and typed yt-dlp error mapping.
- `flashtune-8zr`: robust `/playlist-info` adapter and typed error mapping.
- `flashtune-j4r`: typed USB service bridge with SAF URI validation.
- `flashtune-52b`: DB lifecycle attach/init/detach and sync-on-write data layer.
- `flashtune-wj3`: Search-driven download integration + queue updates.

## Detailed Implementation (What Changed)

### Backend

- `backend/src/services/ytdlp.service.ts`
  - Added `YtDlpError` with explicit HTTP status mapping.
  - Added shared JSON-lines collector with spawn/ENOENT/non-zero exit handling.
  - Normalized parsing and filtered invalid entries without `source_url`.
- `backend/src/routes/search.ts`
  - Route now maps `YtDlpError` to deterministic status codes; unknown errors to 500.
- `backend/src/routes/playlist.ts`
  - Same typed error mapping pattern as search.
- `backend/src/routes/download.ts`
  - Added URL normalization.
  - Handles `ENOENT` as 500, pre-stream failures as 422, non-zero post-stream exits as logged warnings.
  - Ensures process termination on client disconnect.

### Mobile

- `mobile/src/services/usb.service.ts`
  - Added `UsbServiceError`.
  - Added module availability and input validation (`content://` URI enforcement).
  - Added validated wrappers for permission/list/read/write/delete/storage/copy/sync.
- `mobile/src/services/database.service.ts`
  - Implemented attach/init/detach lifecycle.
  - Implemented songs/playlists/playlist_songs in-memory + JSON mirror persistence.
  - Added sync-on-write behavior through USB sync function.
- `mobile/src/services/download.service.ts`
  - Wired full download path: backend bytes -> temp file -> USB write -> DB insert.
  - Added safe temp cleanup and base64 conversion helper for ArrayBuffer writes.
- `mobile/src/screens/SearchScreen.tsx`
  - Replaced mock search with backend search.
  - Added DB existence badge checks and queue-driven download updates.
- `mobile/src/screens/USBManagerScreen.tsx`
  - Replaced mock list with real USB directory read and storage info.
  - Added connect/disconnect/delete handlers and refresh behavior.
- `mobile/src/screens/SettingsScreen.tsx`
  - Added runtime API config updates.
- `mobile/src/services/api.service.ts`
  - Added runtime config setters/getters for base URL and API key.
- `mobile/App.js`
  - Added DB initialization on app startup.

## API Contracts (Request/Response/Errors)

### GET `/search`

- Auth: `X-API-Key` required
- Query: `query` (string, required)

Success `200`:

```json
[
  {
    "title": "Song title",
    "artist": "Artist",
    "duration_ms": 201000,
    "thumbnail_url": "https://...",
    "source_url": "https://youtube.com/watch?v=..."
  }
]
```

Errors:
- `400` `{ "error": "query is required" }`
- `401` `{ "error": "Unauthorized" }`
- `422` `{ "error": "<yt-dlp stderr reason>" }`
- `500` `{ "error": "yt-dlp executable not found on server PATH" }`

### POST `/download`

- Auth: `X-API-Key` required
- Body: `{ "url": "https://youtube.com/watch?v=..." }`

Success `200`:
- content-type `audio/mpeg`
- response body is stream bytes

Errors:
- `400` `{ "error": "url is required" }`
- `401` `{ "error": "Unauthorized" }`
- `422` `{ "error": "<yt-dlp stderr reason>" }` (only when failure occurs before stream starts)
- `500` `{ "error": "yt-dlp executable not found on server PATH" }`

### GET `/playlist-info`

- Auth: `X-API-Key` required
- Query: `url` (string, required)

Success `200`:

```json
{
  "title": "Playlist name",
  "track_count": 25,
  "tracks": [
    {
      "title": "Song title",
      "artist": "Artist",
      "duration_ms": 201000,
      "thumbnail_url": "https://...",
      "source_url": "https://youtube.com/watch?v=..."
    }
  ]
}
```

Errors:
- `400` `{ "error": "url is required" }`
- `401` `{ "error": "Unauthorized" }`
- `422` `{ "error": "<yt-dlp stderr reason>" }`
- `500` `{ "error": "yt-dlp executable not found on server PATH" }`

## Business Logic Notes

- USB is the source of truth; local cache/database is operational mirror.
- Download queue item lifecycle:
  - `queued` -> `downloading` -> `writing` -> `done`
  - failure path: any state -> `error`
- Song de-duplication key is `source_url`.
- DB sync is attempted after each write mutation and on USB detach.

## Data Model and Storage Impact

- Intended canonical DB: `.musicdb` on USB root.
- Sprint 01 transitional implementation:
  - `cache/flashtune.musicdb` local placeholder file
  - `cache/flashtune.musicdb.json` mirror state used by current service layer
- No schema migration introduced in this sprint; logical schema follows `songs`, `playlists`, `playlist_songs`.

## Edge Cases and Recovery

- USB disconnected during write/sync: operation fails, user receives error, retry after reconnect.
- yt-dlp binary missing: backend returns 500 with actionable message.
- yt-dlp exits non-zero before stream: backend returns 422 with reason.
- yt-dlp exits non-zero after stream started: logged server warning; client stream likely interrupted.
- Duplicate song download attempt: blocked by `songExistsByUrl` check.

## Validation Evidence

- Backend type/build validation: `pnpm build` in `backend/` passed.
- Mobile TypeScript compile check: full check pending until local mobile TypeScript compiler is added to workspace toolchain.
- Functional verification performed by code-path review for search/download/USB manager wiring.

## Follow-ups for Sprint 02

- Replace JSON mirror implementation with true SQLite execution via `react-native-quick-sqlite`.
- Add Kotlin native module implementation and tests for `copyDatabase`/`syncDatabase` if missing.
- Add integration tests for backend error contracts and download disconnect behavior.
- Add UI-level queue component rendering with cancel/retry controls.
