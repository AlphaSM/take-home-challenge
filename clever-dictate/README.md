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
cp .env.example .env   # required — setup fails without DATABASE_URL
npm run setup          # prisma generate + db push + seed
npm run dev            # http://localhost:3000
```

The `.env.example` defaults run fully offline on mock providers (no API keys,
no GPU). To run the pipeline on live Gemini models, see
[Live cloud providers](#live-cloud-providers-gemini) below.

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

**Runs fully offline with no API keys and no GPU** — all three pipeline stages
default to deterministic mock providers. Flip them to live cloud models via
`.env`; the app degrades back to the mock at runtime if a provider fails, so it
never hard-breaks.

## Live cloud providers (Gemini)

All three pipeline stages can run on Google Gemini via the `generateContent`
REST API (no SDK dependency). In `.env`:

```bash
VLM_PROVIDER=gemini
LLM_PROVIDER=gemini    # also accepts: anthropic
STT_PROVIDER=gemini    # also accepts: openai (Whisper API)
GEMINI_API_KEY=...     # https://aistudio.google.com/apikey (AIza... or AQ....)
```

| Env var                 | Default                 | Notes                                        |
| ----------------------- | ----------------------- | -------------------------------------------- |
| `GEMINI_VLM_MODEL`      | `gemini-3.5-flash`      | Screen-context vision; describes visible content (titles, headings, code) |
| `GEMINI_LLM_MODEL`      | `gemini-3.5-flash`      | Cleanup + suggestions. `gemini-3.1-pro-preview` works only on billing-enabled projects (free-tier quota is 0) |
| `GEMINI_STT_MODEL`      | `gemini-3.5-flash`      | One-shot audio transcription (verified against real WAVs). `gemini-3.1-flash-live-preview` is Live-API/WebSocket-only and cannot serve this interface |
| `GEMINI_FALLBACK_MODELS`| `gemini-3.1-flash-lite` | Comma-separated; tried when the primary hits persistent 429/503/404. Free-tier quotas are per-model buckets, so a fallback usually still has headroom |

Resilience, in order: retry transient 429/503 honoring Google's `RetryInfo`
delay → try each fallback model → degrade to the deterministic mock (logged as
`[api/vlm] provider failed, degrading to mock`). A quota blip therefore softens
output quality instead of erroring. Check the `provider` field on any pipeline
response (`gemini` vs `mock-vlm`/`mock-llm`/`mock-stt`) to confirm which path
actually ran — "it returned text" is not proof a live model did.

### Demo accounts (password: `password` for all)

Org **MakGlobal** (created by `npm run setup`):

| Email                   | Role    | Can do                                       |
| ----------------------- | ------- | -------------------------------------------- |
| `admin@makglobal.com`   | ADMIN   | Everything + Settings + Admin/Governance     |
| `auditor@makglobal.com` | AUDITOR | Read config, view audit ledger               |
| `user@makglobal.com`    | USER    | Dictate, view org sessions                   |

Org **Clever Profits** (added by `npx tsx prisma/add-clever-org.ts` — additive
and idempotent, safe on a live DB; re-run it after any `db:reset`, which wipes
back to MakGlobal only):

| Email                 | Role    |
| --------------------- | ------- |
| `admin@clever.com`    | ADMIN   |
| `auditor@clever.com`  | AUDITOR |
| `user@clever.com`     | USER    |

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
| `npm run db:reset`| Reset DB and re-seed (MakGlobal only — wipes Clever Profits) |
| `npm run db:seed` | Re-seed only                               |
| `npx tsx prisma/add-clever-org.ts` | Add/restore the Clever Profits org + logins (additive, idempotent) |

## Verification scripts (against a running server)

| Script                          | Proves                                              |
| ------------------------------- | --------------------------------------------------- |
| `node scripts/test-stt.mjs`     | Full audio → STT → LLM-cleanup pipeline with sample WAVs (`samples/`) |
| `node scripts/simulate-day.mjs` | A full 08:30→17:30 enterprise day: multi-user dictation, profile routing, dictionary enforcement, shared-session continuation, RBAC, audit ledger |

Both mint auth sessions for the seeded users and print PASS/FAIL tables.
See `USE_CASES.md` (29 catalogued use cases) and `docs/ENTERPRISE_DAY.md`.

> `test-stt.mjs` expects sample WAVs in `samples/` that are not committed:
> generate the offline fixture with `node scripts/gen-fixture-wav.mjs`, and
> (optionally) download the two OSR speech clips per `samples/README.md`.
> Note the script's PASS/FAIL assertions were written against the *mock*
> providers; with live Gemini the "failures" are the model doing real work
> (actual transcription instead of the hint echo).

## Setup notes & troubleshooting

- **`.env` is required.** `npm run setup` fails with `Environment variable not
  found: DATABASE_URL` on a fresh clone until you `cp .env.example .env`.
- **First page load is slow in dev.** Next.js compiles routes on demand; the
  first `/login` hit can take ~20s. Subsequent loads are fast.
- **Port 3000 already in use / 404s on every route (Windows).** Killing the
  `npm run dev` wrapper can orphan the child `next-server` process, which keeps
  serving a stale build on 3000 while a new instance silently moves to 3001.
  Fix: `Stop-Process -Name node -Force` (PowerShell), then restart `npm run
  dev` and confirm the log says port 3000.
- **Don't run `npm run dev` while building the desktop app.** Both use
  `.next/`: the dev server clobbers the production `standalone`/`static`
  output mid-package and you get an .exe with 404ing assets (and a dev server
  stuck at "Starting…"). Build first, then run.
- **Prisma `EPERM ... query_engine-windows.dll.node`** during `npm run build`:
  a running dev server locks the engine DLL. Stop node processes, rebuild.
- **Mic / screen capture / live STT need Chrome or Edge** (Web Speech API +
  Screen Capture API) on `localhost` or HTTPS. Other browsers degrade to the
  target-app dropdown and typed text.
- **Cleaned text looks identical to raw / context says "Unknown Application".**
  A provider degraded to mock — check the server log for `[ai]`/`[api/vlm]`
  warnings (usually free-tier quota exhaustion; wait a minute or add a
  fallback model).

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
  interface with cloud adapters (Gemini for all three stages; Anthropic LLM and
  OpenAI Whisper STT as alternatives) *and* a deterministic offline mock,
  selected by env with runtime degradation cloud → fallback model → mock. This
  is also the seam where local models (Moondream2 / Whisper / Qwen) would drop
  in.
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
