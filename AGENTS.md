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
bd update <id> --status closed        # mark complete
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

### Workplace Agents — full-stack orchestration

Use this agent layout for sessions that span `mobile/`, `backend/`, and docs.

1. **Orchestrator Agent (required lead)**
   - Owns planning, issue alignment, dependency order, and handoff quality.
   - Must run before any implementation agent.
   - Responsibilities:
     - verify active sprint branch and Beads issue context
     - claim issue (`bd update <id> --status in_progress`)
     - produce a detailed implementation plan (files, order, risks, validation, commit slicing)
     - wait for explicit user approval before implementation
     - coordinate parallel work between mobile/backend/docs agents
     - enforce completion gates before closeout

2. **Mobile Agent**
   - Scope: `mobile/` and Android native module integration points.
   - Source of truth: `docs/mobile.md`.
   - Responsibilities:
     - implement UI/store/service/native-bridge changes
     - enforce SAF rule: USB I/O only via native module (never RNFS for USB)
     - preserve `.musicdb` copy-and-sync behavior
     - provide mobile-specific validation notes

3. **Backend Agent**
   - Scope: `backend/` only.
   - Source of truth: `docs/backend.md`.
   - Responsibilities:
     - implement Fastify route/service/middleware updates
     - preserve streaming download behavior (no buffering/temp files)
     - ensure yt-dlp lifecycle handling (stderr, exit code, client disconnect kill)
     - preserve API key auth contract
     - provide backend-specific validation notes

4. **Docs Agent (mandatory when contracts/behavior change)**
   - Scope: `docs/overview.md`, `docs/mobile.md`, `docs/backend.md`.
   - Source of truth: runtime behavior implemented by Mobile/Backend agents.
   - Responsibilities:
     - update docs in the same branch whenever API, workflow, or behavior changes
     - keep cross-doc consistency (overview vs domain docs)
     - include edge cases and validation updates when relevant

5. **QA/Release Agent**
   - Scope: verification + repository landing tasks.
   - Responsibilities:
     - run agreed checks and summarize pass/fail evidence
     - verify Beads issue closeout and sync
     - run landing sequence (`git pull --rebase`, `bd sync`, `git push`, `git status`)
     - confirm branch is up to date with origin

#### Mandatory orchestration gates

- **Issue gate (required):** implementation work must be linked to an active Beads issue before coding starts.
- **Plan gate (required):** detailed orchestrator plan must be written and approved before coding starts.
- **Docs gate (required):** any API/workflow/behavior change must update relevant docs in the same branch.
- **Closeout gate (required):** issue status update + `bd sync` + successful push are required to finish.

#### Single-source reference policy

- Process/workflow authority: `AGENTS.md`
- Cross-domain architecture: `docs/overview.md`
- Mobile implementation authority: `docs/mobile.md`
- Backend implementation authority: `docs/backend.md`

Choose the narrowest authoritative doc for each task. Use `docs/overview.md` only when behavior crosses domains.

#### Agent handoff contract

Every agent handoff must include:
- changed files
- assumptions made
- risks/edge cases touched
- validation performed (or pending)
- required docs updates

Orchestrator must block completion if any handoff item is missing.

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
6. Share the plan with the user for review and wait for explicit implementation order.
7. After approval, implement in scoped commits (mobile/backend split when running in parallel).
8. Keep docs updated in the same change whenever behavior/contracts/workflow change (`docs/overview.md`, `docs/mobile.md`, `docs/backend.md`).
9. `bd update <id> --status closed`
10. `bd sync` → then follow **Landing the Plane** below

Implementation gate:
- Do not start implementation until the detailed plan is written and aligned with the active Beads issue.
- Do not start implementation until the user explicitly approves the plan and asks to proceed.
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
