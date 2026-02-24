# FlashTune — Agent Instructions

Full reference for any agent working in this monorepo.
Detailed architecture lives in `docs/overview.md`.

---

## Project

FlashTune is an Android music downloader & manager. The phone is a pure middleman — MP3 files and the tracking database (`.musicdb`) live on a USB OTG flashdrive, not internal storage.

---

## Monorepo Structure

```
flashtune/                  ← single repo, pnpm workspace
├── mobile/                 ← React Native Android app (Mobile Agent)
├── backend/                ← Fastify API (Backend Agent)
├── docs/
│   ├── overview.md         ← architecture reference
│   ├── mobile.md           ← mobile implementation guide
│   └── backend.md          ← backend implementation guide
├── AGENTS.md               ← this file
└── pnpm-workspace.yaml
```

---

## Issue Tracking — Beads (`bd`)

```bash
bd ready                              # list issues available to work on
bd show <id>                          # view full issue details
bd update <id> --status in_progress   # claim an issue
bd update <id> --status done          # mark complete
bd sync                               # sync issues to git
```

Labels: `mobile`, `backend`
Issues live in `.beads/` — always synced to git via `bd sync`.

Sprint planning rules:
- Every sprint must have one Beads epic (issue type `epic`) tagged with the sprint label (for example `sprint-01`).
- All sprint issues must be linked under that epic (children/dependencies) and carry the same sprint label.

---

## Git Workflow

```
main   ← stable, human merges via PR
└── dev   ← integration branch
    └── feature/sprint/<sprint-tag>   ← sprint branch (required)
        ├── feature/mobile/<slug>      ← optional task branch
        └── feature/backend/<slug>     ← optional task branch
```

Rules:
- Always branch off `dev`
- Always create one branch per sprint: `feature/sprint/<sprint-tag>`
- Never push directly to `dev` or `main`
- Commit format: `<type>(<scope>): <description>`
  - Types: `feat`, `fix`, `chore`, `refactor`, `docs`
  - Mobile scopes: `search` `library` `usb` `download` `player` `settings` `nav` `db` `types` `native`
  - Backend scopes: `search` `download` `playlist` `auth` `ytdlp` `api`
- For parallel mobile/backend work, keep commits path-scoped when possible:
  - `git commit -m "<type>(<scope>): <description>" -- <file1> <file2>`
  - Stage new files first with `git add <file>`
- PRs are per sprint or per major feature (not per task)

---

## Agents

### Mobile Agent — works in `mobile/`
- React Native bare workflow (Expo), TypeScript strict, Android only
- See `docs/mobile.md` for critical technical rules (SAF, download flow)

### Backend Agent — works in `backend/`
- Fastify + tsx + pnpm, yt-dlp subprocess, YouTube only
- See `docs/backend.md` for critical technical rules (streaming, auth)

---

## Per-Session Workflow

1. Create or switch to sprint branch: `git checkout -b feature/sprint/<sprint-tag> dev`
2. Create sprint epic (if missing): `bd create "Sprint <n>" -t epic -l sprint-<n>`
3. Run `bd ready` — find available issues with your label and sprint tag
4. Pick highest priority → `bd update <id> --status in_progress`
5. Before coding, create a detailed implementation plan as the orchestrator agent:
   - break work into concrete subtasks (mobile/backend/docs)
   - define file-level change plan and dependency order
   - identify risks, edge cases, and validation steps
   - define commit slicing strategy for parallel work
6. Implement in scoped commits (mobile/backend split when running in parallel)
7. Keep docs updated in the same change whenever behavior/contracts/workflow change (`docs/overview.md`, `docs/mobile.md`, `docs/backend.md`)
8. `bd update <id> --status done`
9. `bd sync` → then follow **Landing the Plane** below

Implementation gate:
- Do not start implementation until the detailed plan is written and aligned with the active Beads issue.
- If scope changes during implementation, update the plan first, then continue coding.

If blocked: `bd update <id> --notes "[BLOCKED] Waiting for: <description>"` → pick next issue

---

## Landing the Plane (End of Session)

**Work is NOT complete until `git push` succeeds.**

```bash
git pull --rebase
bd sync
git push
git status   # must show "up to date with origin"
```

- File beads issues for any remaining / follow-up work
- Never leave uncommitted or unpushed changes
