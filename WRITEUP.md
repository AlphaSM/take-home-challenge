# Writeup

## 1. What I did

I rebuilt the single-user macOS prototype as a **multi-tenant web application**
(Next.js 15 + TypeScript + Prisma), and then packaged that same app three ways:
plain Node, **Docker** (runs anywhere), and an **Electron desktop app**
(Windows `.exe` built and launch-tested; macOS `.dmg` config + CI matrix). The
code is in [`clever-dictate/`](./clever-dictate/).

What it does now that it didn't before: **accounts and org tenancy, three
enforced roles (ADMIN / AUDITOR / USER), shared named sessions with full
provenance per dictation turn (screen context + raw STT + cleaned text +
which provider produced each), org-shared prompt profiles routed by detected
app, an org dictionary that forces jargon spelling, an append-only audit
ledger, and governance toggles** — on a real relational schema (SQLite dev,
Postgres-ready). The pipeline adds a stage the prototype didn't have: a **VLM
screen-context step** (screenshot → "you're in Jira" → steers the LLM cleanup),
implemented behind a provider abstraction with deterministic offline mocks and
cloud adapters (Gemini / Claude / OpenAI Whisper), so everything runs and
demos with **no API keys and no GPU**. It's engineered, not just working:
30-test vitest suite, ESLint gate, GitHub Actions CI (lint→test→build→Docker;
tag → GHCR; desktop matrix), a 29-entry use-case catalogue, and a scripted
"enterprise day" simulation that drives the real HTTP API as three users
(11/11 steps passing).

I rebuilt rather than hardened because (a) I'm on Windows — MLX/PyObjC code
can't even start here, and (b) the scoring explicitly rewards what a local
tool can't show: shared data, accounts, access control, team handoff.

## 2. Findings: confusions and breaks I hit

Verified by reading the code against the docs (I can't execute macOS/MLX on
Windows, so these are static findings; each was confirmed at a specific line):

- **Docs contradict the code, twice.** The `dictate.py` docstring says hold
  **Left** Option and an **8s** Qwen threshold; the code binds `alt_r`
  (Right Option, line 370) and `QWEN_THRESHOLD_S = 15` (line 31). The README's
  "don't trust the docs" warning is real.
- **Race on shared state.** Engine and tray are two processes doing unlocked
  read-modify-write on the same `history.json` (append vs. Clear-All rewrite)
  — concurrent writes can silently lose turns. This is the flat-JSON ceiling.
- **Fail-open silence gate.** `_check_audio_level` returns `True` on any
  exception, and its RMS>200 threshold is a magic number.
- **Cleanup silently discarded.** `correct_text` throws away the LLM result if
  it's >2× the raw length — reasonable guard, but invisible to the user; and
  `.strip('"')` mangles dictations that legitimately start/end with quotes.
- **Mic detection prefers built-in.** `detect_mic` picks "MacBook/Built-in"
  over any external mic, then falls back to device `:0`.
- **First words can be lost.** `start_recording` sleeps 0.5s *inside the
  key-press callback* before the "mic hot" chime; speech before the chime is
  gone, and the sleep blocks the hotkey listener thread.
- **History loses the raw transcript** (only cleaned text is saved), capped at
  100, with no app context — nothing to audit or re-clean.
- **Portability is zero by construction**: hardcoded dylib paths load at
  import, hardcoded `/usr/local/bin/python3` shebang vs. the README's
  framework-build requirement, `pkill`-by-script-name process management.

What I fixed: all of these are addressed structurally in the rebuild (DB
instead of JSON races; raw+clean both stored; provider seams instead of
hardcoded models; permission-gated capture in the browser/Electron). What I
left: the prototype itself untouched — it still runs on a Mac as before.

## 3. Prioritization: the next two weeks

Order: safety of data first, then real team workflows, then polish.

1. **Server-side Whisper as default STT** (seam exists; Web Speech is
   Chrome-only and off-device) — accuracy + privacy in one move.
2. **Auth hardening**: rate limits, CSRF, password reset, one real SSO IdP
   (the buttons exist as honest stubs).
3. **Prisma migrations + Postgres + backups** — before there's data worth losing.
4. **Session-level ACLs** (private/shared/assigned) — org-wide read is too coarse.
5. **Invitations + org onboarding** (schema supports it; UI doesn't yet).
6. **Enforce the governance toggles** — zero-retention must actually purge, provably.
7. **Real VLM** (Moondream2 local or Gemini) grounding on actual screen regions.

Deliberately skipped: realtime presence/collab (WebSocket infra for a demo
nobody asked for yet), cost telemetry beyond counters, mac code-signing.

## 4. Real-world readiness

- **Accuracy:** raw + cleaned stored per turn, so cleanup is auditable and
  re-runnable; org dictionary fixes jargon; profiles match tone per app.
  Whisper-server (P1) is the accuracy unlock.
- **Error handling:** providers degrade to offline mocks instead of failing;
  API routes validate with Zod and auth-guard (verified 401s in tests);
  the HUD surfaces mic/capture denial with a typed-text fallback.
- **Auth / access control:** scrypt + server-side sessions; role checks on
  every admin mutation; AUDITOR is read-only by construction. Gap: session
  ACLs and MFA/SSO.
- **Privacy and data:** default is fully local (mock providers, SQLite on
  disk/volume); screenshots are processed, not persisted; zero-retention
  toggle exists but isn't enforced yet — flagged, not faked.
- **Cost:** $0 in the default offline mode; cloud calls are opt-in per stage
  via env. Admin panel counts turns/providers as the seed of telemetry.
- **Reliability:** CI on every push; Docker restart-idempotent (seed-once
  verified); desktop app reuses its DB across launches (verified); 30 unit
  tests + two scripted end-to-end suites (STT 5/5, enterprise day 11/11).
- **Onboarding / non-technical users:** sign in → click mic → speak → copy;
  seeded demo org; desktop installer needs no terminal. Docs: README,
  USE_CASES.md, ENTERPRISE_DAY.md.

## 5. Trade-offs

Gave up the prototype's true offline-first guarantee for shared team data —
mitigated (local AI, local DB file, desktop build) but sync is not built; that
was the clock. Web Speech API as interim STT (wrong long-term, free now).
Mock VLM is honest scaffolding, not vision. Electron app bundles the full
server (~95MB, unsigned, default icon). E2EE/zero-retention are persisted
switches, not yet enforcement.

## 6. How I worked

- **Approach.** First hour: read the brief + Design.md, inventoried my
  constraints (Windows, no Apple Silicon), and made the one decision that
  shaped everything — rebuild up the ladder rather than patch what I can't
  run. Then data model first, UI last.
- **Where I used AI, and where I didn't.** I ran the build with Claude Code
  as the lead engineer and fanned parallel Sonnet subagents for independent
  workstreams (tests, CI, Docker, STT, simulation, Electron) with strict file
  ownership. I kept my own hands on the architecture calls: tenancy boundary,
  role model, provider seams, what to fake vs. build honestly.
- **Checking the AI.** Every agent had to prove its work with executed
  commands, and cross-checks caught real errors: one agent misattributed
  another's intentional bugfix to "a formatter"; the CI agent's lint gate
  exposed JSX violations the build had passed; my own first normaliser had a
  stray-space bug that only the test pass surfaced; and the whole submission
  nearly missed that the deliverable is a *fork of this repo* — caught by
  re-reading the brief, which is why this branch exists.
- **Unfamiliar ground.** MLX/PyObjC (can't run them here — I read the code
  line-by-line instead, which produced §2), electron-builder's Windows
  symlink/signing quirks (fixed with `signAndEditExecutable: false`).
- **Confidence.** Least sure about: Web Speech reliability across
  environments, the unenforced governance toggles being misread as working
  (documented three times to prevent that), and mac packaging (config + CI
  only, never executed on real hardware).

## 7. Open questions for stakeholders

1. Is off-device cloud inference acceptable for any team, or is local-only a
   hard compliance line? (Decides Whisper-server vs. cloud STT default.)
2. Which IdP does the company actually use — Google Workspace, Okta, Entra?
3. Is dictation history a *record* (retention, audit, legal hold) or a
   *convenience* (aggressive purge)? The data model supports either; policy
   decides.
4. Desktop-first or browser-first for rollout? That sets the packaging and
   update-channel investment.
5. What's the real budget ceiling for cloud tokens per user/month?

## Assumptions

English-only dictation for now. One org per user in the UI (schema already
supports many). Seeded demo credentials are acceptable for evaluation. The
~4–6h budget was spent on the rebuild + engineering rather than patching the
Mac prototype; the prototype remains runnable as-is. Port 34115 for the
desktop server; SQLite is a deliberate dev-tier choice with a documented
Postgres path.
