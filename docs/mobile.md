# FlashTune Mobile

Implementation guide for the Android React Native app in `mobile/`.

## Scope and User Story

Problem:
- Mobile app must orchestrate USB lifecycle, backend integration, and local state while respecting Android SAF constraints.

Primary story:
- As a user, I want to search and download songs to USB and see library/USB status inside one app so I can manage a portable music collection.

Acceptance baseline:
- USB connect/disconnect works through SAF permission and store state.
- Search executes against backend and can trigger download.
- Download writes song file to USB and metadata to local DB mirror.
- Error states are surfaced without app crash.

## Tech Stack

- **Framework:** React Native bare workflow (Expo bare template), Android only
- **Language:** TypeScript strict
- **State:** Zustand
- **Navigation:** React Navigation — bottom tabs + stack
- **File I/O (internal only):** react-native-fs — temp files only, never USB
- **USB File I/O:** Custom Kotlin native module (SAF) — all USB ops go here
- **Database:** react-native-quick-sqlite — opens local copy of `.musicdb`
- **Preview player:** react-native-track-player
- **HTTP:** axios

## Folder Structure

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
│   ├── download.store.ts
│   ├── usb.store.ts
│   └── player.store.ts
├── types/index.ts
└── utils/helpers.ts

mobile/android/app/src/main/java/.../UsbSafModule/   ← Kotlin native module
```

## Critical: USB Access via SAF

Android SAF returns `content://` URIs — not file paths.
`react-native-fs` cannot read or write these URIs.

All USB file operations must go through the Kotlin native module. Never use RNFS for USB.

Native module exposes:
- `listDirectory(uri)` → file list
- `writeFile(uri, sourcePath)` → write from temp path to USB
- `readFile(uri, destPath)` → read from USB to temp path
- `deleteFile(uri)` → delete from USB
- `getStorageInfo(uri)` → `{ used, free, total }`

`usb.service.ts` is the JS bridge to these methods.

## SQLite Strategy — Copy and Sync

1. USB detected → native module copies `.musicdb` from USB root → `cache/flashtune.musicdb`
2. App opens local copy via react-native-quick-sqlite
3. Every write → immediately sync local copy back to USB
4. USB disconnect / app close → final sync, delete local copy
5. USB unplugged mid-sync → alert user (acceptable tradeoff)

Flashdrive is always source of truth. Internal copy is a working mirror.

Current implementation status (Sprint 01):
- USB attach/detach lifecycle is implemented through `attachUsbDatabase`/`detachUsbDatabase`.
- Write operations are synced back to USB immediately.
- Local data mirror is currently persisted in `cache/flashtune.musicdb.json` while native `.musicdb` SQL execution integration is finalized.

Data transition note:
- Current service API is intentionally SQLite-shaped so implementation can be swapped from JSON mirror to actual SQLite with minimal screen/store changes.

## Download Flow

```
User triggers download
  → POST /download to backend (X-API-Key header)
  → Backend streams MP3 bytes
  → Write to temp file (internal, RNFS)
  → Native module writes temp file → USB /Music/
  → Delete temp file
  → Insert song into .musicdb
  → Sync .musicdb to USB
```

Current implementation status (Sprint 01):
- Search screen now calls backend `/search` and triggers download flow from result rows.
- Download queue statuses update through Zustand (`queued` → `downloading` → `writing` → `done/error`).

Business logic details:
- Dedup check runs before download using `source_url`.
- Temp file is always cleaned up in `finally` block.
- Queue item updates are progressive and reversible on failures.

## Preview Player Flow

```
User taps song
  → Native module reads MP3 from USB → temp file (internal)
  → react-native-track-player plays from temp path
  → Modal closes → delete temp file
```

## Database Schema (.musicdb)

### songs

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| title | TEXT | |
| artist | TEXT | |
| album | TEXT | |
| cover_path | TEXT | Relative path on USB |
| source_url | TEXT | YouTube URL |
| filename | TEXT | Inside Music/ folder |
| download_date | TEXT | ISO 8601 |
| duration_ms | INTEGER | |

### playlists

| Column | Type |
|---|---|
| id | INTEGER PK |
| name | TEXT |
| created_at | TEXT |

### playlist_songs

| Column | Type |
|---|---|
| playlist_id | INTEGER FK |
| song_id | INTEGER FK |
| position | INTEGER |

## API Contracts (Backend)

Base URL: `BACKEND_URL` env var. All requests: `X-API-Key` header.

```
GET  /search        ?query=string     → SearchResult[]
POST /download      { url: string }   → MP3 byte stream
GET  /playlist-info ?url=string       → PlaylistInfo
GET  /health                          → { status, timestamp }
```

Mobile request expectations:
- Every request except `/health` must include `X-API-Key`.
- `/search` and `/playlist-info` expect JSON payload responses.
- `/download` expects raw binary body and is converted to base64 for RNFS temp write.

Error handling contract in UI/service:
- 400/401/422/500 all map to actionable user message.
- Backend `error` field is propagated to alert/toast where available.

## Page-by-Page Behavior Contract

### Search screen
- Loading: shows activity indicator with `Searching YouTube...`.
- Empty before search: hint message.
- Empty after search: `No results found`.
- Result row:
  - if already in DB: badge `On drive`
  - else: download button creates queue item and starts workflow
- Error: alert with backend or service error message.

### USB Manager screen
- Disconnected: status card + connect button.
- Connected: storage metrics + Music file list + delete action.
- Delete: removes file and refreshes list from USB.
- Disconnect: detaches DB and clears USB store state.

### Settings screen
- Edits runtime backend URL and API key.
- Save updates in-memory API config used by services.
- Clear temp files remains confirmation-gated action.

### Library screen
- Currently skeleton sort/filter/action-sheet UI.
- Full data binding to DB service remains planned follow-up.

## Edge Cases

| Scenario | Handling |
|---|---|
| USB unplugged during download | Cancel, delete partial temp file, alert user |
| USB unplugged during DB sync | Alert user, local copy preserved for retry |
| `.musicdb` missing on new drive | Create fresh DB, initialize schema |
| Song already on drive | Show badge in search, skip re-download |
| Backend unreachable | Error on Search, Library still usable |
| Temp files from crashed session | Clean up on app startup |
| Playlist with 100+ tracks | Queue all, per-song progress, allow cancel per item |

Recovery behavior expectations:
- USB reconnect should allow re-running attach flow and continuing operations.
- Failed download keeps queue record in `error` for inspection/retry.
