# Sprint 04 Implementation Contract — App Simplification

## Status

Planning. Pending final decision on `readFile` method (see open decisions).

## Sprint Metadata

- Sprint tag: `sprint-04`
- Sprint branch: `feature/sprint/sprint-04`
- Goal: Simplify the entire app to a working MVP — remove track player, remove SQLite database, switch to direct folder selection (no Music/ subfolder requirement), fix broken download writes, add a visible download status screen.

---

## Problem Statement

The current app has several critical runtime failures and complexity that must be addressed before the app is practically usable:

1. **0-byte / broken file download**: `writeFile` receives a string-concatenated URI (`${rootUri}/Music/${filename}`) which is not a valid SAF URI. The Kotlin module attempts path-segment traversal from root → `Music/` → file. On many Android devices/ROMs this fails silently or produces a 0-byte file. The fix: user selects the music directory directly, writes go straight into that folder with no traversal.

2. **Permission error on write**: Same root cause as above — SAF tree traversal into subdirectories is unreliable cross-device. Removing the traversal entirely solves it.

3. **Download state invisible**: The Zustand download queue is correctly populated by SearchScreen, but no UI component renders the queue. The state exists and is never shown.

4. **Track player over-engineering**: `react-native-track-player` is a heavy native dependency that requires a separate service worker, a patch file, and complex lifecycle management. The preview feature adds no critical value for MVP. Remove entirely.

5. **SQLite database adds friction**: The `.musicdb` copy-and-sync model requires SAF-based database I/O on every write. It complicates the download flow, the USB lifecycle, and the Library screen without adding value for MVP. Remove entirely.

6. **`Music/` subfolder requirement**: Users must have a `Music/` subfolder on their drive, or it must be created by the app. The new model: user selects any folder (their music folder), all I/O happens there directly.

---

## Scope

### In scope

- Remove `react-native-track-player` entirely (package, patch, service, store)
- Remove `expo-sqlite` entirely (package, database service)
- Remove playlist feature entirely
- Update Kotlin native module: remove database methods, fix `writeFile` signature
- Change USB/folder model: user selects music directory directly
- Library screen: rewrite to scan selected directory for MP3 files
- Download flow: write directly into selected folder, no DB insert
- Downloads screen: new screen (Modal) showing all download items with progress
- Download button in search: show per-item progress state inline
- USB Manager: simplify to folder selection + file tree + delete
- All dangerous actions (delete, change folder) require confirmation

### Out of scope

- `readFile` method — pending decision (see Open Decisions)
- Cloud sync
- iOS support
- Backend changes
- Audio playback of any kind

---

## Architectural Model After Sprint 04

```
User selects a music folder (any folder, via SAF picker in USB Manager tab)
    → Tree URI persisted in SharedPreferences (Kotlin) + Zustand state
    → Library tab: listDirectory(folderUri) → filter .mp3 → display
    → Download: temp file (RNFS) → writeFile(folderUri, filename, tempPath)
    → Delete: deleteFile(fileUri) with confirmation
    → Rename: renameFile(fileUri, newName) with confirmation
    → No database. No Music/ subfolder. No audio player.
```

The "USB connected" concept becomes "music folder selected". The `uri` field in `useUSBStore` stores the selected music folder URI. `connected` = true means a folder has been selected and is accessible.

---

## New `Song` Type

Derived entirely from the directory scan. No SQLite schema.

```ts
export interface Song {
  filename: string   // e.g. "Artist - Title.mp3" (raw from listDirectory)
  title: string      // parsed: everything after first " - " before ".mp3"
  artist: string     // parsed: everything before first " - "
  size: number       // bytes (from listDirectory)
  uri: string        // full SAF URI for this file (for delete/rename operations)
}
```

Parsing rule:
- Split filename (without `.mp3`) on first ` - `
- If found: `artist = parts[0]`, `title = parts[1]`
- If not found (no ` - `): `artist = "Unknown"`, `title = filename without extension`

---

## User Stories and Acceptance Criteria

### Story A — Select and use any folder
As a user, I want to select any folder on any storage as my music folder so I can use internal or USB storage without being forced into a specific subfolder.

Acceptance:
- SAF picker opens and lets user choose any directory
- All subsequent reads/writes target that directory directly
- Selected folder persists across app restarts
- "Change Folder" clears the selection and re-opens picker

### Story B — Download works reliably
As a user, I want downloads to consistently produce valid MP3 files in my selected folder.

Acceptance:
- Downloaded MP3 is non-zero bytes
- File appears in Library after download completes
- No permission errors during write
- Clear error message if download fails for any reason

### Story C — Download status is always visible
As a user, I want to see the status of all my downloads at any time.

Acceptance:
- Download button in search shows per-song progress (spinner while downloading)
- Downloads button (top-right of Search screen) opens a modal with all items
- Each item shows: title, artist, status, progress ring, and error if failed
- Active download count shown as badge on the Downloads button
- "Clear completed" removes done and error items

### Story D — Library shows scanned MP3 files
As a user, I want to see all MP3 files in my selected folder, be able to sort them, rename them, and delete them.

Acceptance:
- Library lists all `.mp3` files in the selected folder
- Sort works by title, artist, file size
- Long press shows: Rename, Delete
- Rename updates the actual filename on disk
- Delete removes file from disk with confirmation
- If no folder selected: message "Select a music folder in the USB tab"

### Story E — App is slimmer and builds cleanly
As a developer, I want all dead code and removed features fully purged.

Acceptance:
- `react-native-track-player` not in package.json, no references in source
- `expo-sqlite` not in package.json, no references in source
- No player store, player service, playlist code, or database service in source tree
- App builds without warnings related to removed packages
- Patch file for track-player is deleted

---

## File-by-File Change Plan

### Files to DELETE

| File | Reason |
|---|---|
| `mobile/src/services/track-player.service.ts` | Player removed |
| `mobile/src/store/player.store.ts` | Player removed |
| `mobile/src/services/database.service.ts` | No database |
| `mobile/patches/react-native-track-player+4.1.2.patch` | Player removed |

### Native Module — `UsbSafModule.kt`

**Remove methods:**
- `copyDatabase(usbRootUri, destPath)` — no longer needed
- `syncDatabase(sourcePath, usbRootUri)` — no longer needed
- `readFile(sourceUri, destPath)` — only used by preview player (removed), no callers remain

**Change `writeFile` signature:**

```kotlin
// OLD (broken — path traversal into Music/ subdirectory):
fun writeFile(destUri: String, sourcePath: String, promise: Promise)
// Called from JS as: writeFile(`${rootUri}/Music/${filename}`, tempPath)

// NEW (writes directly into selected folder):
fun writeFile(dirUri: String, filename: String, sourcePath: String, promise: Promise)
// Called from JS as: writeFile(selectedFolderUri, "Artist - Title.mp3", tempPath)
```

New implementation:
1. `resolveRootDirectory(dirUri)` → get DocumentFile for the folder
2. `dir.findFile(filename) ?: dir.createFile("audio/mpeg", filename)` → get or create target file
3. `contentResolver.openOutputStream(targetFile.uri, "wt")` → stream from `srcFile`
4. No path traversal into subdirectories

**Add `renameFile` method:**

```kotlin
fun renameFile(fileUri: String, newName: String, promise: Promise)
```

Implementation:
- `DocumentsContract.renameDocument(contentResolver, Uri.parse(fileUri), newName)` → returns new URI
- Resolve new URI as string and return via `promise.resolve(newUri.toString())`
- Error cases: file not found, rename not supported by provider

**Remove `readFile` method.** Was only used by the preview player (now removed entirely). No callers remain after Sprint 04. Dead native code — removed.

### `mobile/src/services/usb.service.ts`

- Remove exports: `copyDatabase`, `syncDatabase`
- Update `writeFile` signature:
  ```ts
  export const writeFile = (dirUri: string, filename: string, sourcePath: string): Promise<void>
  ```
- Add `renameFile` export:
  ```ts
  export const renameFile = (fileUri: string, newName: string): Promise<string>
  ```
- Remove `UsbModule` type entries for `copyDatabase`, `syncDatabase`
- Update `UsbModule` type for new `writeFile` and new `renameFile`

### `mobile/src/services/download.service.ts`

- Remove imports: `insertSong`, `songExistsByUrl`, `getLocalDatabasePath`, `syncDatabase`
- Change function signature: `downloadAndSave(result, dirUri, onProgress?)` — `dirUri` replaces `usbRootUri`
- Change write call:
  ```ts
  // OLD:
  await writeFile(`${usbRootUri}/Music/${filename}`, tempPath)
  // NEW:
  await writeFile(dirUri, filename, tempPath)
  ```
- Remove `syncDatabase` call after write (step no longer exists)
- Remove DB existence check and dummy db file creation at end

### `mobile/src/store/usb.store.ts`

- Add field: `cachedFilenames: Set<string>` (default: empty Set)
- Add action: `setCachedFilenames: (names: Set<string>) => void`
- Used by: Library (writes on scan), Search (reads for "on drive" badge)
- The `uri` field continues to store the selected folder URI (no rename needed)

### `mobile/src/types/index.ts`

- Replace `Song` interface with new slim version (above)
- Remove `Playlist` interface
- Keep: `SearchResult`, `PlaylistInfo`, `USBState`, `DownloadItem`, `DownloadStatus`
- Add `cachedFilenames: Set<string>` to `USBState`

### `mobile/src/screens/LibraryScreen.tsx` — **rewritten**

Remove entirely:
- All track-player imports and usage
- All player store imports and usage
- Preview bar component
- `startPreview`, `stopPreview`, `cleanupPreviewTempFile` functions
- `previewRequestRef`, `trackPlayerSetupPromise`, `ensureTrackPlayerSetup`
- All playlist imports and state
- Playlist modal and create-playlist modal
- All database imports (`getAllSongs`, `getAllPlaylists`, etc.)
- `deleteSong` (DB-only delete)

New implementation:
- `useFocusEffect` → `listDirectory(dirUri)` → filter `.mp3` → parse `Song[]` → `setSongs` → update `setCachedFilenames`
- Sort: title (A→Z), artist (A→Z), size (largest first)
- Sort chips: Title | Artist | Size
- `SongRow`: filename-derived title + artist + file size
- Long press → `Alert.alert` with actions:
  - **Rename**: `Alert.alert` prompt → `renameFile(song.uri, newName + '.mp3')` → rescan
  - **Delete**: confirmation alert ("Delete `title` from folder?") → `deleteFile(song.uri)` → rescan
- Empty state (no folder): `"Select a music folder in the USB tab"`
- Empty state (folder selected, no MP3s): `"No MP3 files in this folder"`
- Loading state while scanning

### `mobile/src/screens/USBManagerScreen.tsx` — **simplified**

Remove:
- `attachUsbDatabase`, `detachUsbDatabase` imports
- `stopTrackPlayer`, `resetTrackPlayer`, player store imports
- `loadDriveState` navigating into `${rootUri}/Music` (now uses `dirUri` directly)

Keep/update:
- Connect button → "Select Music Folder" — opens SAF picker
- On select: `requestUsbPermission()` → store URI → `loadDriveState(uri)`
- `loadDriveState(uri)`: calls `getStorageInfo(uri)` + `listDirectory(uri)` in parallel
- File list: all files in selected folder (not filtered to .mp3 only) — shows name + size + delete
- Delete file: confirmation alert ("Delete `filename`? This cannot be undone.") → `deleteFile` → reload
- "Change Folder" button: `clearUsbPermission()` → `setDisconnected()` → clears state
- Rename disconnect to "Change Folder"
- No "Re-authorize" button (replaced by "Change Folder")
- Storage bar: still works via `getStorageInfo`

### `mobile/src/screens/SearchScreen.tsx`

- Download guard: check `uri` (selected folder) — if null, show alert "Select a music folder first in the USB tab"
- Pass `uri` (dirUri) to `downloadAndSave` instead of `usbRootUri`
- "On drive" badge: check `cachedFilenames.has(sanitizeFilename(`${item.artist} - ${item.title}.mp3`))` from USB store
- Download button per row: replace static `↓` with stateful component:
  - `idle` → green `↓` button
  - `queued` | `downloading` | `writing` → `ActivityIndicator` (small, disabled)
  - `done` → same as "On drive" badge (green `✓`, mark `alreadyOnDrive = true`)
  - `error` → red `!` (tappable → opens Downloads modal)
- Add Downloads button to header (top-right): shows `⬇` icon with badge count of active items
- Tapping Downloads button opens `DownloadsScreen` modal

### New `mobile/src/screens/DownloadsScreen.tsx`

Full-screen Modal with close button.

```
Header: "Downloads" (left) + "Clear completed" button (right, only if any done/error items)
Body: FlatList of DownloadItem[]
Empty state: "No downloads yet"

Per item:
  [CircularProgress ring] [Title + Artist]     [Status label]
                           [Error message]      [Dismiss ✕ for errors]

Status label colors:
  queued    → grey "Queued"
  downloading → blue "Downloading"
  writing   → orange "Saving to folder"
  done      → green "Done"
  error     → red "Failed"
```

Circular progress: `Animated` + SVG-style ring using a `View` with `borderRadius` and `transform: rotate` trick (no extra dependency). Progress ring shows 0–100% for active items.

### `mobile/App.js`

- Remove `initDatabase` import and call from bootstrap
- Bootstrap now only: `hydrateApiConfig()`
- No navigation structure changes (Downloads is a Modal, not a tab)
- Keep 4 tabs: Search, Library, USB, Settings

### `mobile/src/components/USBStatusBar.tsx`

- Update text: "Music Folder · X free" when connected
- Update text when disconnected: "No folder selected — go to USB tab"

### `mobile/package.json`

Remove from `dependencies`:
- `react-native-track-player`
- `expo-sqlite`

Remove from `devDependencies`:
- (none related)

Keep (still needed):
- `react-native-fs` — temp file write during download
- `expo-file-system` — fallback for file I/O
- All navigation, zustand, axios, async-storage packages

---

## Download Flow (Post Sprint 04)

```
User taps ↓ on a search result
    → guard: dirUri must be set → Alert if not
    → addToQueue({ id, song, status: 'queued', progress: 0 })
    → updateItem(id, { status: 'downloading', progress: 0.05 })
    → downloadSong(url) → ArrayBuffer (axios, responseType: arraybuffer)
    → updateItem(id, { progress: 0.55 })
    → fs.writeFile(tempPath, base64(buffer), 'base64')
    → updateItem(id, { status: 'writing', progress: 0.75 })
    → writeFile(dirUri, filename, tempPath)   ← direct write, no traversal
    → updateItem(id, { status: 'done', progress: 1 })
    → update cachedFilenames in USB store (add new filename)
    → finally: fs.unlink(tempPath)
    → on error: updateItem(id, { status: 'error', error: message })
```

---

## Library Scan Flow (Post Sprint 04)

```
Library screen mounts or receives focus
    → if no dirUri: show empty state "Select a music folder in the USB tab"
    → listDirectory(dirUri)
    → filter: entry.isDirectory === false && entry.name.endsWith('.mp3')
    → map to Song[]: parse title/artist from filename, build uri from dirUri + name
    → setSongs(parsed)
    → useUSBStore.setCachedFilenames(new Set(parsed.map(s => s.filename)))
```

---

## Dependency Order (Execution)

1. **Kotlin**: remove `copyDatabase`/`syncDatabase`, fix `writeFile(dirUri, filename, sourcePath)`, add `renameFile`
2. **`usb.service.ts`**: match new native signatures, remove db exports
3. **`types/index.ts`**: new `Song` type, remove `Playlist`, update `USBState`
4. **`usb.store.ts`**: add `cachedFilenames` + `setCachedFilenames`
5. **`download.service.ts`**: remove DB, fix `writeFile` call
6. **`LibraryScreen.tsx`**: full rewrite (scan-based, no player, no playlists)
7. **`USBManagerScreen.tsx`**: simplify (no DB attach/detach, no player cleanup)
8. **`SearchScreen.tsx`**: update guard, badge, download button states, Downloads modal trigger
9. **`DownloadsScreen.tsx`**: new file
10. **`App.js`**: remove `initDatabase`, no structural changes
11. **`USBStatusBar.tsx`**: update text strings
12. **`package.json`**: remove `react-native-track-player`, `expo-sqlite`
13. **Delete files**: `track-player.service.ts`, `player.store.ts`, `database.service.ts`, `patches/`
14. **Docs**: update `docs/mobile.md`, `docs/overview.md`

Steps 1–5 must complete before 6–9. Steps 6–9 can parallelize. Steps 10–14 after 6–9.

---

## Validation Plan

1. Build compiles without errors after removing track-player and expo-sqlite
2. App boots without crash (no `initDatabase` call)
3. USB Manager: "Select Music Folder" opens SAF picker → folder selected → storage bar populates → files listed
4. Download one song → Library refreshes → file appears with correct filename and non-zero size
5. Download fails (bad URL) → error shows inline in download button + in Downloads modal
6. Downloads modal: opens from header button → shows all items → badge count correct
7. Library: sort by title/artist/size works
8. Library long-press rename → file renamed on disk → Library rescans and shows new name
9. Library long-press delete → confirmation shown → file removed from folder → Library rescans
10. "On drive" badge shows correctly in Search after downloading
11. App restart: selected folder URI persists → Library rescans on open
12. "Change Folder" clears state, re-shows picker on next connect

---

## Open Decisions

None. All decisions resolved.

---

## Commit Slicing Strategy (Post-Approval)

1. `feat(native): remove db methods, fix writeFile to direct-folder write, add renameFile`
2. `refactor(usb): update service signatures to match new native module`
3. `refactor(types): slim Song type, remove Playlist, add cachedFilenames to USBState`
4. `refactor(download): remove db integration, fix write path to selected folder`
5. `feat(library): rewrite to scan-based model, remove player and playlist code`
6. `refactor(usb-manager): simplify to folder selection and file tree`
7. `feat(search): update download button states and on-drive badge logic`
8. `feat(downloads): add downloads modal screen with circular progress`
9. `chore(app): remove initDatabase bootstrap, wire downloads modal`
10. `chore(deps): remove react-native-track-player and expo-sqlite`
11. `docs(mobile): update implementation guide for sprint-04 model`

---

## Beads Plan

Sprint 04 epic + child issues created in beads. See beads for current status.

Epic: `sprint-04` label.
Child issues carry `mobile` label and `sprint-04` label.
