# Life OS — G11 STEM Academic Command Center

Premium Windows desktop productivity app for a Grade 11 STEM boarding student (STEM Gharbiya, Egypt).

## Stack

- **Electron 44** (desktop shell, secure IPC, SQLite in main process; upgraded from 33 because better-sqlite3 v13 needs Node ≥22)
- **React 18 + TypeScript + Vite 5** (renderer)
- **better-sqlite3 v13** (local SQLite, WAL mode, parameterized statements only; ships N-API prebuilds so no compiler is needed for dev or packaging)
- **electron-builder NSIS** (Windows installer)

Architecture: `electron/main.ts` (window + IPC) → `electron/preload.ts` (contextBridge, no Node in renderer) → `src/` (React) → `shared/` (types + pure logic, unit-tested). Database schema + seed in `electron/db.ts`.

## Development

```powershell
npm install
npm run dev:web    # browser preview (localStorage fallback) at http://localhost:5173
npm run dev        # full desktop: Vite + Electron (needs VITE_DEV_URL, defaults to :5173)
```

`npm run dev` runs `concurrently "vite" "tsc -p tsconfig.main.json && electron ."` — Electron loads the Vite dev server in development and `dist-renderer/index.html` when packaged. To run the unpackaged app against the production bundle (what the installer ships), set `LIFEOS_PROD=1` — this is how the automated UI test launches it.

## Production build + installer

```powershell
npm run build      # vite build (dist-renderer) + tsc (dist-electron)
npm run dist       # electron-builder --win nsis → release/Life OS Setup 1.0.0.exe
```

Requirements: Node 20+, Windows 10/11. `better-sqlite3` prebuilds download automatically; if the sandbox blocks downloads, run `npm rebuild better-sqlite3` once with build tools.

## Tests

```powershell
npm test            # vitest (23 unit tests) + SQLite integration suite (seed, CRUD, search, persistence, SQL-injection safety, corrupt-DB recovery)
npm run test:ui     # launches the real desktop app via Playwright, clicks all 12 sections, screenshots to shots/
npm run test:packaged # smoke test against release/win-unpacked (bundled SQLite)
npm run test:persist  # add task → close app → reopen → task still there
npm run typecheck   # tsc --noEmit
```

## Hardening (defense in depth)

- **Write-path sanitization**: every DB write goes through `sanitizeRow()` — unknown columns dropped (never reach SQL), per-field type/length/enum/ISO-date/JSON checks, `UserError` messages safe for UI; SQLite internals never leak to the renderer.
- **Injection-proof queries**: `ORDER BY` allow-list, clamped `LIMIT`, integer-validated ids, parameterized everything, hostile backup column names filtered.
- **Hardened restore**: 50 MB cap, JSON shape validation, per-row validation with skips, id-preserving inserts, FK-safe delete order, pre-restore `.bak`, row caps.
- **Corrupt-DB recovery**: broken file quarantined (never deleted), fresh seeded DB created, notice flag surfaced in Settings.
- **Data safety**: versioned migrations (`schema_version`), automatic startup copies (newest 5 in `backups/`).
- **Desktop containment**: `window.open` denied in-app, external links open in system browser only after `http(s)` validation (`javascript:`/`data:`/`file:` render as text), in-app navigation locked to `file://` + dev server, single-instance lock, no remote resources (fully offline).
- **Crash resilience**: React error boundary per page, throw-safe storage helpers, study timer parks interrupted sessions (main + renderer) with minute-granularity accumulator persisted to DB — no phantom hours.
- **CSP**: `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`, `connect-src` self + local dev only.

## Data

- SQLite file: `%APPDATA%/Life OS/lifeos.sqlite` (shown in Settings → Data safety)
- Seed: 11 subjects + 10 capstone phases + Bio brown identity. No fake grades/tasks/history.
- Backup/Restore (desktop): JSON dump with pre-restore `.bak` copy. Export: JSON + tasks CSV.
- Browser preview uses localStorage under `lifeos-fallback-v1` so UI can be verified without Electron.

## Features (all real, persisted)

Home (next-action + 1/1/1 daily plan + shutdown), Planner (day/week/agenda, school-block aware, overload warnings), Tasks (full CRUD + subtasks-ready + recurrence), School (subjects, red/yellow/green backlog with guarded transitions + recovery tasks, homework/assessments), Study timer (persisted across restart, reflection on finish), Capstone Bio brown (milestones, experiments, sources, EGP budget, blockers/decisions), CS50 + English + skills (≤3 active guard), Competitions (capacity tradeoff gate), Inbox + Later, Weekly reviews (prefilled from real data), Insights (real metrics, labeled gaps), Settings (theme, schedule, backup/restore, shortcuts), global search (Ctrl+K), quick add (Q).

## Keyboard

`Ctrl+K` search · `Q`/`Ctrl+N` quick add · `G H` home · `G T` tasks · `?` shortcuts · `Esc` close.
