# FlashTune — App Overview

## Concept

FlashTune is an Android music downloader & manager built around USB OTG flashdrives. The phone is a pure middleman — MP3 files and the tracking database live on the flashdrive, not internal storage. Plugging the flashdrive into any phone with FlashTune installed instantly loads all your music and history.

---

## Repository Structure

```
flashtune/
├── mobile/           # React Native (Android)
├── backend/          # Node.js API
├── docs/
│   ├── overview.md   # This file — architecture reference
│   ├── mobile.md     # Mobile implementation rules and behavior
│   ├── backend.md    # Backend implementation rules and API behavior
│   └── task/         # Sprint/task implementation contracts
├── AGENTS.md         # Agent workflow guide
└── CLAUDE.md         # Short pointer to AGENTS.md
```

---

## Tech Stack

### Mobile (mobile/)

| Layer | Choice | Notes |
|---|---|---|
| Framework | React Native bare workflow (Expo bare template) | Native module access + EAS Build |
| Language | TypeScript (strict) | |
| State | Zustand | Lightweight, no boilerplate |
| Navigation | React Navigation (bottom tabs + stack) | |
| File I/O (internal) | react-native-fs | Temp files only, never USB |
| USB File I/O | Custom native module (SAF, Kotlin) | SAF returns content:// URIs, RNFS can't use them |
| Database | react-native-quick-sqlite | Opens local copy of .musicdb |
| Preview Player | react-native-track-player | Plays from temp file |
| HTTP | axios | Backend communication |

### Backend (backend/)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js | |
| Language | TypeScript | |
| Framework | Fastify | Better streaming primitives |
| TS execution | tsx | Run .ts directly, no build step |
| Package manager | pnpm | |
| Downloads | yt-dlp | CLI tool, spawned as subprocess |
| Audio source | YouTube only | |
| API style | REST | |
| Deployment | Dockerfile on Coolify | Needs Node + yt-dlp + ffmpeg + Python |

---

## Architecture Decisions

### USB Access (SAF)

Android Storage Access Framework (SAF) is used for USB OTG access. User grants permission once via `ACTION_OPEN_DOCUMENT_TREE`, persisted URI saved for future sessions.

Custom native module written in **Kotlin**, inline in `android/`, handles ALL USB file operations:
- List directory
- Write file (from byte stream or temp path)
- Read file (to temp path)
- Delete file
- Get storage info (used / free)

SAF returns `content://` URIs, not file paths — **all USB I/O must go through the native module**, never RNFS.

### SQLite (.musicdb) Strategy — Copy & Sync (Option A)

1. USB plugs in → native module copies `.musicdb` from flashdrive root to phone internal storage (`cache/flashtune.musicdb`)
2. App opens local copy via react-native-quick-sqlite
3. Every write operation → immediately sync local copy back to flashdrive
4. On USB disconnect or app close → final sync, delete local copy
5. If unplug detected mid-sync → alert user (last few operations may be lost — acceptable tradeoff)

Flashdrive is always the source of truth. Internal copy is a working mirror only.

### Download Flow

```
User triggers download
    → App POST /download to backend (with X-API-Key header)
    → Backend downloads via yt-dlp
    → Streams MP3 bytes back to app
    → App writes to temp file (internal storage, RNFS)
    → SAF native module writes temp file to USB /Music/
    → Delete temp file
    → Update .musicdb (insert song record)
    → Sync .musicdb to flashdrive
```

### Preview Player Flow

```
User taps preview on a song
    → SAF native module reads MP3 from USB → temp file (internal)
    → react-native-track-player plays from temp file path
    → Modal closed → delete temp file
```

---

## Product Stories (Current Baseline)

### Story A: Portable USB library
As a user, I want my songs and metadata to live on USB so I can move my library between devices.

### Story B: Search and save
As a user, I want to search YouTube tracks and download selected songs to USB so I can build my offline collection.

### Story C: Safe recoverable operations
As a user, I want clear errors and retry behavior when USB or network fails so I do not lose trust in the app.

---

## Business Logic Overview

- USB storage is source of truth for MP3 and `.musicdb`.
- Mobile keeps a local working mirror for runtime operations.
- Backend is stateless and request-scoped; no temp file persistence for downloads.
- Download transaction (logical):
  1. search result selected
  2. backend stream requested
  3. temp file write in app sandbox
  4. native SAF write to USB `Music/`
  5. song metadata write
  6. DB sync back to USB
- Duplicate prevention is based on `source_url`.

---

## Backend API

**Base URL:** `BACKEND_URL` in `.env`
**Auth:** `X-API-Key` header — random static key stored in `.env` as `API_KEY`. Backend uses this for rate limiting only, no user accounts.

| Method | Endpoint | Body / Params | Response |
|---|---|---|---|
| GET | /search | `?query=string` | `SearchResult[]` |
| POST | /download | `{ url: string }` | MP3 stream |
| GET | /playlist-info | `?url=string` | `PlaylistInfo` |

### Status and Error Contract

| Endpoint | 200 | 400 | 401 | 422 | 500 |
|---|---|---|---|---|---|
| GET /search | list results | missing query | missing/wrong key | yt-dlp domain failure | server/runtime failure |
| POST /download | audio stream | missing url | missing/wrong key | yt-dlp pre-stream failure | yt-dlp binary/runtime failure |
| GET /playlist-info | playlist payload | missing url | missing/wrong key | yt-dlp domain failure | server/runtime failure |

Error payload shape:

```json
{ "error": "human readable message" }
```

Auth header requirement for all non-health endpoints:

```http
X-API-Key: <API_KEY>
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

## File Storage Layout (on flashdrive)

```
[USB Root]/
├── .musicdb          ← SQLite database (all tracking data)
└── Music/
    ├── artist - title.mp3
    ├── artist - title.mp3
    └── ...
```

---

## Database Schema (.musicdb)

### songs

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| title | TEXT | |
| artist | TEXT | |
| album | TEXT | |
| cover_path | TEXT | Relative path on USB |
| source_url | TEXT | YouTube URL |
| filename | TEXT | Filename inside Music/ folder |
| download_date | TEXT | ISO 8601 |
| duration_ms | INTEGER | |

### playlists

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| created_at | TEXT | ISO 8601 |

### playlist_songs

| Column | Type | Notes |
|---|---|---|
| playlist_id | INTEGER | FK → playlists.id |
| song_id | INTEGER | FK → songs.id |
| position | INTEGER | Order within playlist |

---

## App Screens

### Search
- Text search input (YouTube only)
- Manual URL input (single track or playlist)
- Results list — each song shows "Already on drive" badge if found in .musicdb
- Tap to download single song or entire playlist
- Active downloads visible in persistent queue panel

### Library
- All songs tracked in .musicdb
- Sort by: title, artist, album, date downloaded
- Filter by artist, album, playlist
- Tap song → preview player modal
- Long press → edit metadata or delete
- Playlist management (create, rename, add/remove songs)

### USB Manager
- USB status (connected / disconnected)
- Storage info bar (used / free)
- File browser (Music/ folder contents)
- Delete files
- File size per item

### Settings
- Backend URL override
- API key input
- Clear temp files
- App version info

---

## Mobile Folder Structure

```
mobile/src/
├── screens/
│   ├── SearchScreen.tsx
│   ├── LibraryScreen.tsx
│   ├── USBManagerScreen.tsx
│   └── SettingsScreen.tsx
├── components/
│   ├── SongCard.tsx
│   ├── DownloadQueue.tsx
│   ├── PreviewPlayerModal.tsx
│   └── USBStatusBar.tsx
├── services/
│   ├── api.service.ts        # Backend HTTP calls
│   ├── usb.service.ts        # SAF native module JS bridge
│   ├── database.service.ts   # .musicdb read/write (local copy)
│   └── download.service.ts   # Orchestrate full download flow
├── store/
│   ├── download.store.ts     # Queue & per-item status
│   ├── usb.store.ts          # USB connection + drive info
│   └── player.store.ts       # Preview player state
├── types/
│   └── index.ts              # All shared TS types & interfaces
└── utils/
    └── helpers.ts

mobile/android/app/src/main/java/.../
└── UsbSafModule/             # Kotlin native module (inline)
```

## Backend Folder Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── search.ts
│   │   ├── download.ts
│   │   └── playlist.ts
│   ├── services/
│   │   └── ytdlp.service.ts   # Spawn yt-dlp subprocess
│   ├── middleware/
│   │   └── auth.ts            # X-API-Key check
│   └── index.ts               # Fastify app entry point
├── .env
├── Dockerfile
└── package.json
```

---

## Android Permissions (AndroidManifest.xml)

```xml
<uses-feature android:name="android.hardware.usb.host" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

SAF permission granted at runtime via `ACTION_OPEN_DOCUMENT_TREE` — no manifest entry needed.

---

## Offline Mode

| Feature | Works Offline? |
|---|---|
| Library browsing | Yes |
| USB file browsing | Yes |
| Preview playback | Yes (reads from USB → temp copy) |
| Metadata editing | Yes |
| Search | No — show "No connection" state |
| Download | No — disabled, show error |

No extra architecture needed — offline support is natural to the design.

---

## USB Status Indicator

Persistent bar visible on all screens at all times:
- Green dot + "USB Connected" + drive name + free space
- Red dot + "USB Disconnected" + prompt to plug in

---

## Known Edge Cases

| Scenario | Handling |
|---|---|
| USB unplugged during download | Cancel download, delete partial temp file, alert user |
| USB unplugged during DB sync | Alert user, local .musicdb preserved for retry on reconnect |
| .musicdb missing on new drive | Create fresh database, initialize schema automatically |
| Song already exists on drive | Show badge in search results, skip re-download if tapped |
| Backend unreachable | Show error state on Search screen, Library still usable |
| Temp files from crashed session | Clean up on app startup |
| Playlist URL with 100+ tracks | Queue all, show progress, allow cancel per-song |

---

## Detailed Sprint Specs

- Sprint 01 implementation contract and delivery notes: `docs/task/sprint01.md`
