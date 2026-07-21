# Clever Dictate — Writeup

## TL;DR

The prototype was a single-user macOS/MLX desktop app that saved to flat JSON.
I rebuilt it as a **multi-tenant web application with a real relational data
model**, because the scoring — and the actual product need — rewards shared,
governed team data far more than another local-only feature. The novel part of
the brief (VLM screen-context → STT → LLM cleanup) is implemented as a
**provider-abstracted pipeline** that runs end-to-end offline today and swaps to
local or cloud models by changing one env var.

What works today: accounts + orgs + RBAC, the full three-stage dictation
pipeline, shared sessions/history, org-shared prompt profiles and dictionary,
and an admin/governance surface (roles, append-only audit ledger, privacy
toggles). It builds clean and the pipeline is verified end-to-end.

---

## 1. Where I chose to move it forward, and why

The brief frames a ladder: *local store → local-first with sync → networked
backend*, and explicitly says the things that score are the hard-to-fake ones:
**a dependable data model, shared multi-user data, accounts, access control,
team handoff.** A single SQLite file on one laptop is still one person's data.

So I made the deliberate call to climb to the **networked-backend rung** and
spend my time on the data model and the multi-user substrate, not on polishing a
single-user desktop binary I can't even run (no Apple Silicon; I'm on Windows).
The Stitch mockups in the repo (`/designs`) already imagine this exact product —
org dictionary, RBAC matrix, audit ledger, cost telemetry — which confirmed the
web/multi-user direction was the intended one.

**Trade-off I accepted:** I gave up the prototype's genuine local-first offline
guarantee (it worked with zero network). A web app needs the server reachable.
I mitigated this by keeping the *AI* fully local-capable (offline mock/local
providers) and by designing the data model so a local-first sync layer can be
added later (see §5) — but I did not build sync. That's an honest gap, chosen on
purpose to spend the budget on the data model instead.

## 2. The data model (the part I most wanted to get right)

`prisma/schema.prisma`. Principles:

- **Organization is the tenancy boundary.** Every domain row (`Session`,
  `Dictation`, `ContextProfile`, `DictionaryEntry`, `AuditLog`) carries `orgId`
  and every query is org-scoped. This is what makes data *shared* and *isolated*
  at the same time.
- **Identity is separated from authorization.** `User` is who you are;
  `Membership(userId, orgId, role)` is what you can do. The same person can be
  ADMIN in one org and USER in another — the schema already supports multi-org
  without change, even though the UI currently uses your first membership.
- **A `Dictation` stores the full provenance of a turn** — the VLM screen
  context (summary + structured primitives), the raw STT text, *and* the LLM
  clean text, plus which providers produced each. This makes a turn auditable
  and re-cleanable, and it's the schema-level answer to "team handoff": a
  teammate opening a session sees not just the text but the context it was
  captured in.
- **Org-shared config steers the AI.** `ContextProfile` is the VLM→LLM router
  ("if the app looks like Jira, apply the Scrum-Master prompt");
  `DictionaryEntry` forces jargon spelling org-wide. These are the levers that
  make dictation *consistent across a team* rather than per-person.
- **`AuditLog` is append-only** and written on every meaningful mutation
  (session create, profile/dictionary change, role change, governance toggle).

It's SQLite for local dev but written to be Postgres-ready (swap the datasource;
the only SQLite-specific concession is roles-as-strings instead of a DB enum,
which the app layer constrains).

## 3. The dictation pipeline

Design.md's five steps map to `src/lib/ai/`:

| Stage | Interface | Offline default | Cloud adapter |
| --- | --- | --- | --- |
| 1–3 VLM screen context | `VlmProvider` | `mock-vlm` (keyword heuristics) | Gemini 1.5 Flash-8B |
| 4 STT | browser | Web Speech API | (Whisper route — seam left) |
| 5 LLM cleanup | `LlmProvider` | `mock-llm` (real normalisation + dictionary) | Claude (Anthropic) |

The important design decision: **every stage is an interface with both a real
adapter and a deterministic mock, chosen by env.** This is why the whole product
is demonstrable with no keys and no GPU, why tests are reproducible, and why
dropping in Moondream2 / Whisper / Qwen locally (the brief's recommended models)
is a localized change — implement the interface, flip the env var. The registry
degrades to the mock on any provider error, so a missing key never hard-fails.

The `mock-llm` is not a stub: it does genuine filler removal, spoken-punctuation
conversion, capitalisation, terminal punctuation, org-dictionary enforcement,
and context-aware bullet-formatting. That's most of what the "clean this text"
prompt is actually for, so the offline demo shows the real behaviour.

## 4. What's built and verified

- **Auth & multi-user:** cookie sessions (scrypt-hashed passwords, server-side
  session tokens), org scoping, three roles with enforced access
  (USER/AUDITOR/ADMIN). Server actions guard admin-only mutations.
- **Core dictation UX:** floating HUD with screen-capture → VLM context flash →
  live transcription + waveform → stop → raw/clean dual view → copy / AI
  suggestions / save. Saving persists to a shared session and refreshes the
  timeline.
- **Session workspace & history:** org-wide session list, per-session timeline
  with VLM context cards and dual-text (raw/clean) blocks, hover-to-copy.
- **Settings:** VLM→LLM prompt-profile matrix and shared corporate dictionary
  (admin-editable, read-only for others).
- **Admin & governance:** RBAC role editor, append-only audit ledger, cost/
  telemetry readouts, E2EE / zero-retention toggles.
- **Quality gate:** `npm run build` passes (12 routes typecheck clean); the
  pipeline was verified end-to-end over HTTP (VLM app-detection, filler removal,
  dictionary enforcement `mac global→MAKGLOBAL`, profile routing, suggestions).

## 5. What it would take to be a company could-use-it-daily product

Prioritized. This is the part I'd defend in review.

### P0 — correctness & safety before anyone relies on it
1. **Real STT server path.** Web Speech API is Chrome-only, sends audio to
   Google, and has no diarization. Ship the Whisper route behind the existing
   STT seam (`distil-whisper` server-side or `whisper.cpp`) so transcription is
   consistent, private, and browser-independent.
2. **Auth hardening.** Add rate limiting, password reset, email verification,
   CSRF protection on server actions, and session rotation. The magic-link and
   SSO/SAML buttons are present but stubbed — wire at least one real IdP.
3. **Input limits & validation everywhere.** Screenshot payload caps, per-user
   quotas, and Zod on every route (started, not universal).
4. **Migrations, not `db push`.** Move to `prisma migrate` with a real Postgres
   and a backup/restore story before there's data worth losing.

### P1 — make "team" real
5. **Multi-org UI + invitations.** The schema supports multi-org and roles; the
   UI needs an org switcher, an invite flow (the `+ Invite` button is a stub),
   and org creation/onboarding.
6. **Sharing & permissions at the session level.** Right now every org member
   sees every org session. Real teams need private/shared/assigned sessions and
   per-session ACLs — the "team handoff" story needs ownership + sharing, not
   just a shared pool.
7. **Realtime presence & collaboration.** The design shows live presence and
   "dictate to a live thread." That needs WebSockets and a concurrency model
   for two people appending to one session.
8. **Governance that does something.** The E2EE and zero-retention toggles are
   persisted but not enforced. Zero-retention especially is a promise: it must
   actually purge raw audio/screenshots on a schedule and be provable in the
   audit log.

### P2 — local-first & scale (the rung above)
9. **Local-first sync.** To recover the prototype's offline strength *and* keep
   shared data, add an offline write queue + sync (the schema's per-row `orgId`
   + timestamps are compatible with a last-writer-wins or CRDT layer). This is
   the "local-first with sync" rung and is where I'd invest next for this
   specific product, because dictation happens whether or not the network is up.
10. **Observability & cost controls.** Real token/cost telemetry (the admin card
    is a placeholder), per-org usage limits, structured logging, error tracking.
11. **The VLM done properly.** The paper's "visual primitives" (bounding boxes
    as units of reasoning) are modeled in the schema (`primitives`) but the mock
    only emits placeholder boxes. A real VLM (Moondream2 local or Gemini) should
    ground context on actual regions, and we should let the LLM *point at* those
    regions during cleanup.

### Things I'd explicitly cut or defer
- The elaborate onboarding/hardware-benchmark screen from the mockups — nice
  demo, low value until there's a real local-model install step.
- Cross-device "registered endpoints" in the RBAC matrix — premature until
  there's a desktop client again.

## 6. Hardening pass (phase 2)

A second pass took the build from "works" to "engineered":

- **Tests:** 30-test vitest suite over the normaliser, VLM heuristics, and auth
  hashing. Writing them caught and fixed two real bugs (spoken-punctuation
  ordering; dictionary terms with non-word edges like `c++` never matching).
- **CI/CD:** GitHub Actions — lint (`--max-warnings=0`) → tests → build →
  Docker image on every push/PR; tag `v*` publishes to GHCR (`docs/CICD.md`).
- **Containerised:** multi-stage Dockerfile (Next standalone output, node:22-slim),
  `/data` volume for the DB, seed-once entrypoint idempotent across restarts,
  docker-compose. Verified: build → run → `/login` 200 → restart → no data wipe.
- **Server-side STT seam:** `/api/stt` behind the same provider pattern
  (mock with real WAV-header duration parsing + OpenAI Whisper adapter), tested
  with downloaded public-domain speech WAVs and a synthetic offline fixture
  (`samples/`, `scripts/test-stt.mjs` — 5/5 passing, proving audio → STT →
  cleanup end-to-end).
- **Use-case catalogue + enterprise-day simulation:** `USE_CASES.md` (29 use
  cases, honestly rated Implemented/Partial/Roadmap) and
  `scripts/simulate-day.mjs`, which drives the real HTTP API through a full
  08:30→17:30 workday as three users — 11/11 steps passing
  (`docs/ENTERPRISE_DAY.md`).
- **Defects fixed from the simulation's findings:** AUDITOR can now access the
  admin/governance page read-only (was ADMIN-only, contradicting the role's
  purpose); dictionary deletions are now audit-logged; JSX lint violations fixed.

## 6b. Desktop packaging (phase 3)

The web app is now also a **desktop application**: an Electron shell
(`desktop/`) embeds the Next standalone server (port 34115, localhost-only),
ships a build-time seeded template SQLite DB copied to the per-install data dir
on first run, generates a per-install `AUTH_SECRET`, and natively grants the
mic/screen-capture permissions the dictation flow needs. `electron-builder`
produces a Windows NSIS installer + portable `.exe` (both built and launch-
tested on this machine: first-run seeds, second-run reuses the DB); the macOS
`.dmg` target builds from the same config via the `Desktop` CI workflow
(Windows + macOS matrix). Caveats: artifacts are unsigned (no cert), default
Electron icon, and the desktop build currently bundles the full server — a
future optimisation is pruning the standalone tree.

## 7. Honest limitations of what I shipped

- Session-level authorization is coarse (org-wide read). Fine for a demo, wrong
  for a real team (see P1.6).
- Governance toggles and the "Invite/SSO/magic-link" affordances are visible but
  not fully wired — deliberately surfaced as roadmap, not faked as working.
- Screen capture + Web Speech need a Chromium browser with a user gesture; the
  app degrades (app-picker dropdown, typed text) but the marquee experience
  assumes Chrome.

---

## Appendix: build timer

Per the goal, both phases were timed start to finish.

| Phase | Start | Finish | Elapsed |
| --- | --- | --- | --- |
| 1 — Initial build (scaffold → data model → pipeline → auth → UI → docs) | 2026-07-20 23:13:00 | 2026-07-20 23:25:24 | ~12 min |
| 2 — Hardening (tests, CI/CD, Docker, STT+audio, use cases, simulation, fixes) | 2026-07-21 00:30:32 | 2026-07-21 00:41:38 | ~11 min |
| 3 — Desktop app (Electron .exe/.dmg, tested at every step) | 2026-07-21 01:27:53 | 2026-07-21 01:40:40 | ~13 min |
| **Total focused build time** | | | **~36 min** |

Phase 2 fanned five parallel subagents across independent workstreams
(containerisation, CI/CD, tests, STT, simulation), then integrated, re-verified
everything (30/30 tests, lint clean, build clean, Docker smoke 200, STT 5/5,
enterprise-day 11/11), and fixed the defects the verification surfaced.
