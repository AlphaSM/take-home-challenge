# A Day at MakGlobal — Simulated Enterprise Usage

This document narrates a simulated full working day of "MakGlobal" (the
seeded demo org — see `prisma/seed.ts`) using Clever Dictate, as exercised by
`scripts/simulate-day.mjs` against a real running server over HTTP. Each
timeline step is mapped to the use case(s) it demonstrates in
[`USE_CASES.md`](../USE_CASES.md).

The script does not fabricate results: every step is a real HTTP call (or,
where the product genuinely has no HTTP surface, a documented `@prisma/client`
call) against the live pipeline (VLM mock → LLM mock cleanup → dictionary
enforcement → persistence → audit).

## Cast

| Name | Email | Role | UC coverage |
| --- | --- | --- | --- |
| Marcus V. | `user@makglobal.com` | USER | UC-07 through UC-13 |
| S: Admin | `admin@makglobal.com` | ADMIN | UC-16–19, UC-21–23 (config already seeded; see note below) |
| Ava Auditor | `auditor@makglobal.com` | AUDITOR | UC-24 |

## Timeline

### 08:30 — Marcus dictates standup notes (UC-07, UC-09)
Marcus's screen is a Slack thread. The HUD would normally screenshot it; the
script instead passes the offline `hint: "slack thread"` to `POST /api/vlm`
(UC-09 — deterministic offline app-detection with no GPU/keys), which returns
`appContext: "Slack"`. That context is then passed with the raw dictated text
to `POST /api/dictations` with no `sessionId`, so a brand-new session titled
**"Standup 2026-07-21"** is created (UC-07), a `Dictation` row is written with
full raw/clean/context provenance, and a `session.create` audit event is
logged (UC-29).

### 09:15 — Marcus dictates Jira ticket items (UC-07, UC-09)
Hint `"jira sprint backlog"` routes the mock VLM to `appContext: "Jira"`. The
VLM→LLM router (`resolveCleanup` in `src/lib/pipeline.ts`) matches the
org's seeded "Scrum Master" `ContextProfile` (`matchApp: "Jira"`), and the
mock LLM's list-detection heuristic turns the comma/and-separated dictation
into bullet lines. The script asserts both `cleanText` contains `- ` bullet
lines and `profileName === "Scrum Master"`.

### 10:00 — Dictionary enforcement (UC-18)
The task calls for "admin adds a dictionary term." In this product, that
mutation (`addDictionaryEntry` in `src/lib/actions/config.ts`) is a Next.js
**server action** bound to a React form submit — it is not a stable JSON
HTTP endpoint a plain script can POST to (Next encodes server-action
invocations with internal, non-public wire format tied to the client
bundle). **This is documented here rather than faked**: the script does not
call it. Instead it verifies the *effect* an admin-managed dictionary entry
has, using the term already seeded by `prisma/seed.ts`
(`"mac global" → "MAKGLOBAL"`): Marcus dictates a sentence containing
"mac global" and the script asserts the persisted `cleanText` contains
"MAKGLOBAL". This proves the enforcement path (`applyDictionary` in
`src/lib/ai/mock.ts`) that the admin UI writes into, end-to-end.

### 11:30 — Marcus drafts an email (UC-07)
Hint `"gmail compose subject: rollout plan"` → mock VLM detects `Gmail` →
router matches the seeded "Professional Email" profile. Script asserts
`profileName === "Professional Email"`.

### 13:00 — Afternoon continuation of the same session (UC-10)
The script reuses the `sessionId` returned by the 08:30 standup dictation and
POSTs a second turn to `/api/dictations` with that `sessionId` set. The
server's `db.session.findFirst({ where: { id: sessionId, orgId } })` finds
the existing session (org-scoped only — not author-scoped, see UC-10's
status note) and appends a new `Dictation` row rather than creating a new
session. The script confirms the response's `sessionId` is unchanged and that
the session now holds >= 2 dictation turns — proof of shared, team-visible
session continuation, the core "team handoff" claim in `WRITEUP.md`.

### 14:00 — AI suggestions (UC-12)
`POST /api/suggest` is called with sample text; the script asserts exactly 3
suggestion strings come back (the mock LLM's `suggest()` always returns a
fixed-shape array of 3, templated on the detected app).

### 15:00 — Auditor access + unauthenticated rejection (UC-24, UC-03)
Two calls:
1. Ava (AUDITOR) calls `POST /api/cleanup` and gets `200` with a `cleanText`
   back — proving AUDITOR is not blocked from read-style pipeline calls (the
   route only checks `getCurrentUser()`, not `isAdmin()`).
2. An anonymous call (no cookie) to the same route returns `401` — proving
   UC-03's unauthenticated-rejection guarantee holds on every API route.

We did not GET an HTML session page for the auditor because, per the task's
own note, the more decisive signal is the API-level role check; the
`/app/sessions/[id]` page would 200 for any org member regardless of role
(no per-role page gating beyond `/app/admin`), which is already covered by
UC-14/UC-20's analysis in `USE_CASES.md`.

### 16:30 — Audit ledger verification (UC-29)
Direct `@prisma/client` query for `AuditLog` rows with
`action: "session.create"` authored by Marcus, confirming at least the two
new sessions created earlier in the day (Standup, Sprint backlog grooming)
were durably logged — the append-only compliance trail claim in
`WRITEUP.md` §2 and §4.

### 17:30 — Summary table
The script prints a `step | actor | expected | actual | PASS/FAIL` table and
exits non-zero if any step failed, so it can be used as a lightweight
integration smoke test as well as a demo narrative.

## Reproduce it yourself

```bash
cd clever-dictate
npm install
npm run setup                      # prisma generate + db push + seed

# In one terminal: start the app on a spare port (avoid 3000/3150/3200 if
# other things may be running; this repo's verification used 3160):
npx next dev -p 3160
# (or for a production-like run: npm run build && npx next start -p 3160)

# In another terminal:
PORT=3160 node scripts/simulate-day.mjs
```

Exit code `0` means every step in the timeline passed; non-zero means at
least one assertion failed (see the printed table for which).

## Notes on data produced

Running the simulation creates real rows in the dev SQLite database
(`prisma/dev.db` per `.env`'s `DATABASE_URL`): new `AuthSession` tokens for
the three seeded users, four new `Session`/`Dictation` rows for Marcus's day
(Standup, Sprint backlog grooming, Vendor intro call notes, Rollout
announcement email — plus the 13:00 continuation turn on the standup
session), and additional `AuditLog` rows. This is left in place after a
verification run rather than reset, because it makes the seeded demo richer
(more sessions/history to show off) without touching the original seed
fixtures produced by `prisma/seed.ts`. Re-run `npm run db:reset` at any time
to return to a pristine seeded state.
