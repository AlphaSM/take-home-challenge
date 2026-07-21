# Clever Dictate

Context-aware, **multi-user** dictation for teams.

Hold-to-talk, speak, and get clean text back — enriched by what's on your screen.
The pipeline is:

```
screenshot ──▶ [VLM] ──▶ screen context ─┐
                                          ├─▶ [LLM cleanup] ──▶ final text ──▶ saved to a shared session
   speech ───▶ [STT] ──▶ raw transcript ─┘
```

This is a rebuild of the original single-user macOS/MLX prototype into a
**networked, multi-tenant web app**. See [`WRITEUP.md`](./WRITEUP.md) for the
reasoning behind that choice and what it would take to make it team-ready.

## Quick start

```bash
cd clever-dictate
npm install
npm run setup      # prisma generate + db push + seed
npm run dev        # http://localhost:3000
```

### Or run it anywhere with Docker

```bash
docker compose up --build   # http://localhost:3000
# or:
docker build -t clever-dictate . && docker run -p 3000:3000 -e AUTH_SECRET=change-me clever-dictate
```

The container initialises its SQLite DB on a `/data` volume on first boot,
seeds the demo org once, and is idempotent across restarts.

### Or run it as a desktop app (.exe / .dmg)

```bash
npm run desktop:prepare   # build web + seeded template DB + desktop deps
npm run desktop:dist      # → desktop/dist/Clever Dictate Setup 0.1.0.exe (+ portable .exe)
```

The Electron shell embeds the production server (port 34115), stores its DB per
install (`%APPDATA%/clever-dictate-desktop/clever.db` on Windows), and grants
mic + screen-capture permissions natively. macOS `.dmg` builds via the same
config on a mac or the `Desktop` GitHub Actions workflow (Windows + macOS
matrix). Details in `desktop/README.md`.

**Runs fully offline with no API keys and no GPU** — the VLM/LLM stages default
to deterministic local providers. Set `VLM_PROVIDER=gemini` /
`LLM_PROVIDER=anthropic` in `.env` (with keys) to use cloud models instead.

### Demo accounts (org: MakGlobal, password: `password`)

| Email                   | Role    | Can do                                       |
| ----------------------- | ------- | -------------------------------------------- |
| `admin@makglobal.com`   | ADMIN   | Everything + Settings + Admin/Governance     |
| `auditor@makglobal.com` | AUDITOR | Read config, view audit ledger               |
| `user@makglobal.com`    | USER    | Dictate, view org sessions                   |

## Using it

1. Sign in. You land on the workspace with recent org sessions.
2. Click the **mic** in the floating HUD. It captures screen context (grant the
   Screen Capture prompt, or pick a target app from the dropdown when offline),
   then starts live transcription (Chrome/Chromium — Web Speech API).
3. Speak, then **Stop & clean**. You'll see the raw transcript and the cleaned
   result side by side, plus which org prompt profile was applied.
4. **Copy**, get **AI suggestions**, or **Save turn** — saving persists the turn
   (raw + clean + screen context) to a shared, named session.
5. **Settings** manages the org's VLM→LLM prompt profiles and shared dictionary.
   **Admin** manages roles (RBAC), the audit ledger, and governance toggles.

## Scripts

| Script            | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Dev server                                 |
| `npm run build`   | Production build (runs `prisma generate`)  |
| `npm test`        | Vitest unit suite (30 tests)               |
| `npm run lint`    | ESLint (`next/core-web-vitals` + TS)       |
| `npm run setup`   | Generate client, push schema, seed         |
| `npm run db:reset`| Reset DB and re-seed                       |
| `npm run db:seed` | Re-seed only                               |

## Verification scripts (against a running server)

| Script                          | Proves                                              |
| ------------------------------- | --------------------------------------------------- |
| `node scripts/test-stt.mjs`     | Full audio → STT → LLM-cleanup pipeline with sample WAVs (`samples/`) |
| `node scripts/simulate-day.mjs` | A full 08:30→17:30 enterprise day: multi-user dictation, profile routing, dictionary enforcement, shared-session continuation, RBAC, audit ledger |

Both mint auth sessions for the seeded users and print PASS/FAIL tables.
See `USE_CASES.md` (29 catalogued use cases) and `docs/ENTERPRISE_DAY.md`.

## CI/CD

GitHub Actions (`.github/workflows/`): every push/PR runs lint → tests →
build → Docker image build; pushing a `v*` tag builds and publishes the image
to GHCR. Details in `docs/CICD.md`.

## Architecture

- **Next.js 15 (App Router) + TypeScript** — one codebase, server components +
  API routes + server actions.
- **Prisma + SQLite** — a real relational data model (`prisma/schema.prisma`),
  Postgres-ready. Everything is scoped to an `Organization`.
- **AI provider abstraction** (`src/lib/ai/`) — every pipeline stage is an
  interface with a cloud adapter (Anthropic / Gemini) *and* a deterministic
  offline mock, selected by env. This is the seam where local models
  (Moondream2 / Whisper / Qwen) would drop in.
- **Browser capture** (`src/lib/capture.ts`, `src/lib/speech.ts`) — Screen
  Capture API for the screenshot, Web Speech API for live STT, both with
  graceful fallbacks.

```
src/
  app/            routes: /login, /app, /app/sessions/[id], /app/settings, /app/admin, /api/*
  components/     Sidebar, Topbar, DictationHUD, SessionTimeline, ...
  lib/
    ai/           provider abstraction (types, mock, cloud, registry)
    actions/      server actions (auth, config)
    auth.ts db.ts pipeline.ts capture.ts speech.ts
prisma/
  schema.prisma   the data model
  seed.ts         org + 3 users + sessions + config
```

See [`WRITEUP.md`](./WRITEUP.md) for scope, trade-offs, and the path to
production.
