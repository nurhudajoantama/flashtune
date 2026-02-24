# Sprint 02 Implementation Contract (Review Before Coding)

## Goal

Replace single backend `API_KEY` with a simple multi-token YAML config (`token_list`), while keeping client usage simple (`X-API-Key`).

## Scope

In scope:
- backend reads token list from YAML
- auth middleware validates incoming `X-API-Key` against enabled tokens
- mobile persists backend URL and API key locally across app restarts
- docs updated for schema, behavior, and migration
- migration-safe fallback from YAML token list to legacy `.env API_KEY` (temporary)
- auth observability and safe logging (no token leakage)
- auth and config validation test matrix
- startup health visibility for auth config state
- mobile auth error UX improvements
- `.musicdb` implementation follow-up planning (SQLite migration track)

Out of scope:
- token scopes
- token id/secret pair auth
- rate limiting
- user accounts/OAuth

## User Stories

1. As an operator, I want multiple API tokens in one YAML file so I can rotate or separate usage without code changes.
2. As a developer, I want the same request header (`X-API-Key`) so mobile integration stays simple.
3. As a mobile user, I want backend URL and API key saved persistently so I do not re-enter them after reopening the app.

## Acceptance Criteria

1. Backend loads YAML `token_list` at startup.
2. Request with enabled token in list is authorized.
3. Request with missing/unknown/disabled token returns 401.
4. Existing header contract remains `X-API-Key`.
5. Mobile saves and restores backend URL + API key on app restart.
6. Docs clearly describe YAML format and migration from `.env API_KEY`.
7. Fallback behavior is explicit and configurable (`yaml-only` vs `yaml-with-legacy-fallback`).
8. Auth logs/metrics include result reason (`ok`, `missing`, `invalid`, `disabled`, `config_error`) without exposing token values.
9. `/health` exposes auth config readiness signal (non-secret), e.g. `auth_config_loaded: true|false`.
10. Mobile shows specific auth failure guidance on 401 (e.g. "Invalid API key, check Settings").
11. Automated or scripted checks cover enabled/disabled/unknown token, malformed YAML, and fallback mode behavior.

## YAML Contract (Simple)

Default path: `backend/config/tokens.yaml`
Override: `TOKEN_CONFIG_PATH`

```yaml
version: 1
token_list:
  - name: mobile-default
    token: "abc123"
    enabled: true
  - name: ci-token
    token: "def456"
    enabled: true
  - name: old-token
    token: "ghi789"
    enabled: false
```

Validation rules:
- `version` must be `1`
- `token_list` must be non-empty array
- each item requires `name`, `token`, `enabled`
- token values must be unique

## API Contract

No endpoint shape changes.

Auth header remains:

```http
X-API-Key: <token>
```

Auth errors:

```json
{ "error": "Unauthorized" }
```

Status mapping:
- `401`: missing/invalid/disabled token
- `500`: token config unreadable/invalid

`/health` extension (Sprint 02):

```json
{
  "status": "ok",
  "timestamp": "2026-02-24T00:00:00.000Z",
  "auth_config_loaded": true,
  "auth_mode": "yaml-only"
}
```

## Mobile Contract

Settings fields:
- Backend URL
- API Key

Persistence:
- store keys:
  - `flashtune.backend_url`
  - `flashtune.api_key`
- hydrate on app startup before first API call
- save updates memory config + persisted storage

## Business Logic

- backend startup:
  - parse YAML
  - build enabled token set in memory
  - fail fast if invalid config
  - optional legacy fallback reads `.env API_KEY` only when fallback mode is enabled
- request auth:
  - read `X-API-Key`
  - check membership in enabled token set
  - emit redacted auth result event/metric

## Added Sprint Workstreams

### P0
- YAML token list loader + strict validation + startup fail-fast
- Auth middleware backed by enabled token set
- Mobile persistent settings (`backend_url`, `api_key`) + startup hydration
- Migration fallback switch + docs/runbook

### P1
- Auth scenario tests (backend)
- Mobile auth error UX copy and handling
- `/health` auth readiness fields
- Safe auth observability (reason codes, redaction)

### P2 (carry-forward if needed)
- Full `.musicdb` SQLite migration work package definition and kickoff tasks

## Validation Plan

Manual:
1. enabled token -> 200
2. disabled token -> 401
3. unknown token -> 401
4. malformed YAML -> startup failure with clear log
5. reopen app -> backend URL and API key retained
6. fallback mode ON: legacy `.env API_KEY` still works when not in token list
7. fallback mode OFF: legacy `.env API_KEY` is rejected unless listed in YAML
8. `/health` reports auth config loaded flag correctly
9. logs contain auth reason, but never raw token values

Automated target:
- backend unit tests for YAML parser/validator
- backend auth middleware table-driven tests
- mobile settings persistence test (hydrate on launch)

## Commit Plan (After Approval)

1. `feat(auth): add yaml token_list loader`
2. `feat(auth): validate X-API-Key using enabled token list`
3. `feat(auth): add legacy fallback mode and auth readiness health fields`
4. `feat(settings): persist backend url and api key`
5. `fix(settings): surface clear auth error guidance in mobile flows`
6. `test(auth): add token-list and fallback behavior coverage`
7. `docs(auth): document token_list schema, migration, and operations runbook`
