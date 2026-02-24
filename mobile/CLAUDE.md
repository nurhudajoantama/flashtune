# FlashTune Mobile — Mobile Agent

You are the **Mobile Agent** for FlashTune. You work exclusively inside this repo.

## Fizzy Board
Board ID: `03fnb11eejyyszzgmy4w0zoqs`
Your cards: tag `mobile`, column **Ready**

## Git Rules
- Branch off `dev`: `git checkout -b feature/<scope>/<card-slug> dev`
- Commit: `feat(<scope>): <description>`
- Push branch → move Fizzy card to **PR Opened** + comment with commit hash
- Never push to `dev` or `main` directly

## Commit Scopes
```
search    library    usb    download    player
settings  nav        db     types       native
```

## Per-Session Workflow
1. List Fizzy cards: tag `mobile`, status `Ready`
2. Pick highest priority → move to **In Progress**
3. Create branch, implement, commit, push
4. Move card → **PR Opened**, add commit hash in comment
5. Repeat

If blocked → **Needs Handoff** + comment `[BLOCKED] Waiting for: <exact description>` → pick next card

---

## Project Overview

FlashTune is an Android music downloader & manager. The phone is a pure middleman — MP3 files and the tracking database (.musicdb) live on a USB flashdrive connected via OTG, not on the phone's internal storage. Plugging the flashdrive into any phone with FlashTune installed instantly loads all music and history.

---

## Tech Stack

- **Framework:** React Native bare workflow via Expo bare template
- **Language:** TypeScript (strict mode)
- **State management:** Zustand
- **Navigation:** React Navigation — bottom tabs + stack navigator
- **File I/O (internal only):** react-native-fs — used for temp files only, never for USB
- **USB File I/O:** Custom Kotlin native module (SAF) — all USB operations go here
- **Database:** react-native-quick-sqlite — opens local copy of .musicdb
- **Preview player:** react-native-track-player
- **HTTP client:** axios

---

## Folder Structure

```
src/
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
│   ├── api.service.ts        # HTTP calls to backend
│   ├── usb.service.ts        # JS bridge to Kotlin SAF module
│   ├── database.service.ts   # .musicdb read/write (local copy)
│   └── download.service.ts   # Orchestrates full download flow
├── store/
│   ├── download.store.ts     # Queue & per-item download status
│   ├── usb.store.ts          # USB connection state & drive info
│   └── player.store.ts       # Preview player state
├── types/
│   └── index.ts
└── utils/
    └── helpers.ts

android/app/src/main/java/.../UsbSafModule/   ← Kotlin native module
```

---

## Screens

### Search
- Text search input (YouTube only)
- Manual URL input (single track or full playlist)
- Results list — badge on songs already on the flashdrive (checked against .musicdb)
- Tap to download single or whole playlist
- Persistent download queue panel at the bottom

### Library
- All songs tracked in .musicdb
- Sort: title, artist, album, date downloaded
- Filter: artist, album, playlist
- Tap → preview player modal
- Long press → edit metadata or delete
- Playlist management (create, rename, add/remove songs)

### USB Manager
- USB connected/disconnected status
- Storage bar (used / free)
- File browser for Music/ folder on flashdrive
- Delete files, show file sizes

### Settings
- Backend URL override
- API key input
- Clear temp files
- App version

---

## Architecture Decisions

### USB Access — SAF (Critical)
Android SAF returns `content://` URIs, not file paths. `react-native-fs` cannot use them.
**All USB file operations must go through the Kotlin native module.** Never use RNFS for USB.

The native module (inline in `android/`) exposes:
- `listDirectory(uri)` → file list
- `writeFile(uri, sourcePath)` → write from temp path to USB
- `readFile(uri, destPath)` → read from USB to temp path
- `deleteFile(uri)` → delete from USB
- `getStorageInfo(uri)` → `{ used, free, total }`

`usb.service.ts` is the JS bridge to these native methods.

### SQLite (.musicdb) — Copy & Sync
1. USB detected → native module copies `.musicdb` from USB root → `cache/flashtune.musicdb`
2. App opens local copy via react-native-quick-sqlite
3. Every write → immediately sync local copy back to USB
4. USB disconnect / app close → final sync, delete local copy
5. USB unplugged mid-sync → alert user (last few writes may be lost — acceptable tradeoff)

Flashdrive is always source of truth. Internal copy is a working mirror only.

### Download Flow
```
User triggers download
  → POST /download to backend (with X-API-Key header)
  → Backend streams MP3 bytes
  → Write to temp file (internal, RNFS)
  → Native module writes temp file → USB /Music/
  → Delete temp file
  → Insert song record into .musicdb
  → Sync .musicdb to USB
```

### Preview Player Flow
```
User taps preview
  → Native module reads MP3 from USB → temp file (internal)
  → react-native-track-player plays from temp path
  → Modal closes → delete temp file
```

### USB Status Indicator
`<USBStatusBar />` must be visible on every screen at all times:
- Connected: green dot + drive name + free space
- Disconnected: red dot + prompt to plug in

### Offline Mode
- Library browsing → works offline (reads from local .musicdb copy)
- USB file browsing → works offline
- Preview playback → works offline (reads from USB)
- Search → requires internet (show "No connection" state)
- Download → requires internet (disabled, show error)

---

## Database Schema (.musicdb)

### songs
| Column | Type |
|---|---|
| id | INTEGER PK |
| title | TEXT |
| artist | TEXT |
| album | TEXT |
| cover_path | TEXT (relative path on USB) |
| source_url | TEXT |
| source | TEXT ('youtube' or 'spotify') |
| filename | TEXT (inside Music/ folder) |
| download_date | TEXT (ISO 8601) |
| duration_ms | INTEGER |

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

---

## API Contracts (Backend)

Base URL from `.env` as `BACKEND_URL`. All requests include header `X-API-Key`.

```
GET /search
  Params:   ?query=string
  Response: SearchResult[]

POST /download
  Body:     { url: string }
  Response: MP3 byte stream

GET /playlist-info
  Params:   ?url=string
  Response: PlaylistInfo
```

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

## Android Permissions

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

## Edge Cases to Handle

| Scenario | Handling |
|---|---|
| USB unplugged during download | Cancel, delete partial temp file, alert user |
| USB unplugged during DB sync | Alert user, local .musicdb preserved for retry on reconnect |
| .musicdb missing on new drive | Create fresh DB, initialize schema |
| Song already on drive | Show badge in search, skip re-download |
| Backend unreachable | Error on Search, Library still usable |
| Temp files from crashed session | Clean up on app startup |
| Playlist with 100+ tracks | Queue all, show per-song progress, allow cancel per item |
