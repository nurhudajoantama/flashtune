# Sprint 03 Implementation Contract (Core Completion)

## Status

Approved and in implementation.

Progress snapshot:
- Implemented: native USB module bridge (`UsbSafModule` + package registration)
- Implemented: mobile DB migration to `react-native-quick-sqlite`
- Implemented: Library real-data binding and playlist membership interactions
- Implemented: preview playback lifecycle and cleanup path
- In progress: full QA matrix and docs closeout evidence

## Objective

Finish the remaining core product behaviors so FlashTune is practically usable end-to-end on Android:

1. Real SQLite-backed `.musicdb` operations
2. Working USB native bridge implementation
3. Real Library and Playlist behavior (not mock)
4. Preview playback lifecycle with guaranteed temp cleanup
5. Critical flow validation and closeout docs

---

## Re-analysis Findings (Current Codebase)

This plan is based on current repository state, not prior assumptions.

### 1) Native USB bridge is referenced but not implemented

- `mobile/src/services/usb.service.ts` expects `NativeModules.UsbSafModule` with:
  - `requestPermission`, `listDirectory`, `writeFile`, `readFile`, `deleteFile`, `getStorageInfo`, `copyDatabase`, `syncDatabase`
- No Kotlin module/package currently present under `mobile/android/app/src/main/java/**`.
- `MainApplication.kt` has no manual package registration for a custom USB module.

Impact:
- Core USB operations may fail immediately at runtime (`UsbSafModule is not available`).

### 2) Database layer is still JSON-mirror, not SQLite

- `mobile/src/services/database.service.ts` currently uses in-memory state + `flashtune.musicdb.json` mirror.
- It does not use `react-native-quick-sqlite`.
- `mobile/package.json` currently has no SQLite dependency.

Impact:
- Data model behavior diverges from product architecture and `.musicdb` contract.

### 3) Library UI still uses mock dataset

- `mobile/src/screens/LibraryScreen.tsx` renders `MOCK_SONGS` and mock actions (`console.log`).

Impact:
- Core local library management is not implemented.

### 4) Preview player flow is not implemented

- Only `mobile/src/store/player.store.ts` state exists.
- No preview modal/component + no track-player orchestration path currently wired.

Impact:
- Key listening workflow is missing.

### 5) Download uses real backend call but DB persistence is transitional

- `mobile/src/services/download.service.ts` writes MP3 to USB and inserts metadata via current DB service.
- Since DB service is JSON-mirror, this path is not yet true SQLite core behavior.

---

## Scope Boundaries

In scope for Sprint 03:

1. Implement Android `UsbSafModule` native bridge required by JS layer.
2. Migrate mobile DB service to real SQLite (`.musicdb` local copy + sync).
3. Wire Library screen to real song data and real actions.
4. Implement playlist persistence and membership operations.
5. Implement preview playback lifecycle.
6. Validate disconnect/reconnect and sync recovery behavior.
7. Update docs to reflect actual runtime behavior.

Out of scope:

- Cloud sync/accounts
- iOS support
- Backend source expansion beyond existing endpoints
- Full UI redesign

---

## User Stories and Acceptance Criteria

### Story A — Portable persistent library
As a user, I want downloaded tracks to remain available and queryable after app restart and USB reconnect.

Acceptance:
- Downloaded tracks are stored in SQLite schema (`songs`) and visible in Library after restart.
- Song dedup by `source_url` is enforced.

### Story B — Playlist management
As a user, I want to create playlists and manage songs in them.

Acceptance:
- Create/delete playlist works and persists.
- Add/remove song to playlist works and persists.
- Playlist ordering (`position`) remains consistent after removals.

### Story C — Preview flow
As a user, I want to preview songs from USB safely.

Acceptance:
- Tapping a song starts preview using temp file copied from USB.
- Closing/stop/error always deletes temp preview file.

### Story D — USB resilience
As a user, I want clear recovery when USB disconnects mid-operation.

Acceptance:
- Disconnect during DB sync/download surfaces clear error.
- Reconnect and reattach restores normal operation without crash.

---

## Detailed Task Breakdown (Execution Contract)

## Task 01 (P0) — Native USB module implementation

Owner: Mobile Agent (native)

Target files:
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/UsbSafModule.kt` (new)
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/UsbSafPackage.kt` (new)
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/MainApplication.kt` (register package)

Required methods:
- `requestPermission`
- `listDirectory`
- `writeFile`
- `readFile`
- `deleteFile`
- `getStorageInfo`
- `copyDatabase`
- `syncDatabase`

Definition of done:
- JS calls from `mobile/src/services/usb.service.ts` resolve successfully.
- Method parameter contracts match current TS wrapper expectations.

Risks:
- SAF URI permission persistence and URI tree traversal errors.

## Task 02 (P0) — SQLite migration for database service

Owner: Mobile Agent

Target files:
- `mobile/src/services/database.service.ts`
- `mobile/package.json` (add SQLite dependency)

Implementation requirements:
- replace in-memory JSON state with SQL queries
- initialize schema if missing
- keep local DB path `cache/flashtune.musicdb`
- maintain attach/detach sync hooks to USB (`copyDatabase`/`syncDatabase`)
- enforce song dedup by `source_url`

Definition of done:
- No JSON mirror dependency in normal flow.
- CRUD functions return persisted values from SQLite.

Risks:
- concurrency/race during rapid writes (download + UI mutations).

## Task 03 (P0) — Library screen real-data binding

Owner: Mobile Agent

Target files:
- `mobile/src/screens/LibraryScreen.tsx`
- `mobile/src/services/database.service.ts`

Implementation requirements:
- fetch songs from DB on screen focus/mount
- apply sort options to real rows
- wire long-press actions to real handlers:
  - edit metadata
  - add to playlist
  - delete song

Definition of done:
- Library no longer relies on `MOCK_SONGS`.
- Actions mutate DB and refresh UI.

## Task 04 (P0/P1) — Playlist persistence operations

Owner: Mobile Agent

Target files:
- `mobile/src/services/database.service.ts`
- `mobile/src/screens/LibraryScreen.tsx`
- `mobile/src/types/index.ts` (if needed)

Implementation requirements:
- finalize/create APIs for playlist CRUD and membership
- maintain stable `position` semantics
- prevent duplicate song links per playlist

Definition of done:
- playlist membership persists across restart.

## Task 05 (P1) — Preview player implementation

Owner: Mobile Agent

Target files:
- `mobile/src/screens/LibraryScreen.tsx`
- `mobile/src/store/player.store.ts`
- `mobile/src/services/usb.service.ts`
- `mobile/src/components/PreviewPlayerModal.tsx` (new if needed)

Implementation requirements:
- copy selected USB song to temp file via `readFile`
- play using `react-native-track-player`
- cleanup temp file in close/error/unmount

Definition of done:
- Preview works for existing USB file and leaves no temp leak.

## Task 06 (P1) — USB/DB consistency hardening

Owner: Mobile Agent

Target files:
- `mobile/src/services/download.service.ts`
- `mobile/src/services/database.service.ts`
- `mobile/src/screens/USBManagerScreen.tsx`

Implementation requirements:
- clearly classify and handle sync failures
- ensure delete-file action and DB state remain consistent
- ensure reconnect path rehydrates storage + DB state safely

Definition of done:
- failure messages actionable; no silent state corruption.

## Task 07 (P1) — QA and documentation closeout

Owner: QA/Docs Agent

Target files:
- `docs/mobile.md`
- `docs/overview.md`
- `docs/task/sprint03.md` (update with actual delivery)

Implementation requirements:
- record pass/fail evidence for critical flows
- document known limitations and follow-up backlog

---

## Dependency Order

1. Task 01 (native module)
2. Task 02 (SQLite migration)
3. Task 03 + Task 04 (library + playlists)
4. Task 05 (preview)
5. Task 06 (hardening)
6. Task 07 (QA/docs)

Parallelization note:
- Task 03 and Task 04 can run in parallel after Task 02 only if DB contract is frozen first.

---

## Validation Plan (Detailed)

Manual scenarios:
1. Fresh USB, no `.musicdb` -> app initializes schema and works.
2. Download one song -> appears in Library immediately.
3. Kill app/reopen -> song still visible.
4. Create playlist/add song/remove song -> persists after reopen.
5. Preview song -> audio plays; close -> temp file deleted.
6. Disconnect USB during sync -> clear error, no crash.
7. Reconnect USB -> state reattaches and operations resume.

Automated targets:
- DB service unit/integration tests for CRUD and playlist links.
- Basic smoke test for Library data load path.

---

## Commit Slicing Strategy (Post-Approval)

1. `feat(native): add android usb saf module bridge`
2. `refactor(db): migrate mobile musicdb service to sqlite`
3. `feat(library): bind library screen to persisted songs`
4. `feat(library): add playlist persistence and membership actions`
5. `feat(player): implement usb preview playback lifecycle`
6. `fix(usb): harden sync recovery and consistency handling`
7. `docs(mobile): finalize sprint-03 core behavior and validation`

---

## Beads Plan (After Approval Only)

Per `AGENTS.md`, no Beads creation during orchestration discussion.

After approval, create one Sprint 03 epic and the seven child tasks above, with dependencies matching the dependency order.

---

## Delivery Notes (Current Implementation)

Implemented files:
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/UsbSafModule.kt`
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/UsbSafPackage.kt`
- `mobile/android/app/src/main/java/com/nurhudajoantama/flashtune/MainApplication.kt`
- `mobile/src/services/database.service.ts`
- `mobile/src/screens/LibraryScreen.tsx`
- `mobile/src/store/player.store.ts`
- `mobile/src/screens/USBManagerScreen.tsx`
- `mobile/src/services/download.service.ts`
- `mobile/package.json`

Runtime behavior delivered:
- native USB module now exists and is registered in app package list
- DB layer now executes SQL against local `.musicdb` copy (no JSON mirror path)
- library is backed by persisted DB data with real sort/edit/delete/playlist operations
- preview flow reads USB track to temp file and uses track-player with explicit cleanup
- disconnect/delete/download paths include improved user-facing USB recovery messaging

Validation evidence captured:
- `npm install --package-lock-only` in `mobile/` succeeds after dependency updates
- full Android/Kotlin compile is environment-limited without local Android SDK configuration
- full TypeScript compile for mobile is environment-limited because `tsc` is not configured in this workspace package

Open follow-up checks:
- run Android device test for SAF permission picker + persisted URI behavior
- verify quick-sqlite absolute path behavior on target device/emulator
- complete manual QA matrix from this document and attach pass/fail notes
