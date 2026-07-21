# Clever Dictate — Use Case Catalogue

This is a complete, honest catalogue of every independent use of the product as
it exists in this repository today. Each use case lists actor/role,
preconditions, the main flow, the expected outcome, and a **current status**:

- **Implemented** — works end-to-end against real code paths in this repo.
- **Partial** — works but with a known gap (coarse authorization, no
  validation, UI present but behavior incomplete, etc).
- **Roadmap** — visibly present in the UI but intentionally stubbed (disabled
  button, no handler), per `WRITEUP.md`.

Grounded in: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/auth.ts`,
`src/lib/pipeline.ts`, `src/lib/actions/config.ts`, `src/lib/actions/auth.ts`,
`src/lib/ai/*`, `src/app/api/*/route.ts`, `src/app/app/**`, `src/app/login/**`.

---

## Authentication & session lifecycle

### UC-01 — Sign in with email/password
- **Actor:** Any registered user (ADMIN / AUDITOR / USER).
- **Preconditions:** User row exists with a membership in an org (seeded:
  `admin@makglobal.com`, `auditor@makglobal.com`, `user@makglobal.com`, all
  password `password`).
- **Main flow:** POST the login form (`src/app/login/LoginForm.tsx` →
  `loginAction` in `src/lib/actions/auth.ts`). Looks up `User` by email,
  verifies scrypt hash (`verifyPassword`), requires at least one
  `Membership`, calls `createSession(userId)` which inserts an `AuthSession`
  row and sets the `clever_session` httpOnly cookie, then redirects to
  `/app`.
- **Expected outcome:** Authenticated session cookie set; user lands on the
  workspace with their org's sessions visible.
- **Status:** **Implemented.**

### UC-02 — Sign out
- **Actor:** Any signed-in user.
- **Preconditions:** Valid `clever_session` cookie.
- **Main flow:** `logoutAction` in `src/lib/actions/auth.ts` deletes the
  matching `AuthSession` row (`db.authSession.deleteMany({ where: { token }})`)
  and clears the cookie, redirects to `/login`.
- **Expected outcome:** Cookie cleared, DB session row removed, subsequent
  requests are unauthenticated.
- **Status:** **Implemented.**

### UC-03 — Reject unauthenticated access
- **Actor:** Anonymous / expired-session caller.
- **Preconditions:** No `clever_session` cookie, or a token not present /
  expired in `AuthSession`.
- **Main flow:** Any `/app/*` server component calls `getCurrentUser()` /
  `requireUser()` and redirects to `/login` on `null`. Any `/api/*` route
  calls `getCurrentUser()` and returns `401 { error: "unauthenticated" }`
  (see `vlm`, `cleanup`, `suggest`, `dictations` routes).
- **Expected outcome:** No org data is ever returned without a valid session;
  API calls get HTTP 401, page loads redirect to `/login`.
- **Status:** **Implemented.**

### UC-04 — Passwordless magic-link sign-in
- **Actor:** Any user.
- **Preconditions:** None.
- **Main flow:** Button "Send passwordless magic link" on `/login`.
- **Expected outcome:** Would email a one-time sign-in link.
- **Status:** **Roadmap.** Button is present but `disabled`
  (`src/app/login/page.tsx` line ~37), no handler exists. Documented in
  `WRITEUP.md` P0 item 2.

### UC-05 — SSO / SAML corporate identity sign-in
- **Actor:** Any user, enterprise IdP.
- **Preconditions:** An IdP integration would need to exist.
- **Main flow:** Button "Sign in with Corporate Identity (SSO / SAML)" on
  `/login`.
- **Expected outcome:** Would redirect to IdP, exchange assertion for a
  session.
- **Status:** **Roadmap.** Button is `disabled`, no handler, no IdP config
  anywhere in the codebase.

### UC-06 — Session expiry enforcement
- **Actor:** Any user with a stale cookie.
- **Preconditions:** `AuthSession.expiresAt` in the past (30-day TTL from
  `createSession`).
- **Main flow:** `getCurrentUser()` checks `session.expiresAt < new Date()`
  and returns `null` if expired (the row is not proactively deleted, just
  ignored).
- **Expected outcome:** Expired sessions are treated as logged out.
- **Status:** **Implemented** (no rotation, no rate limiting, no CSRF
  hardening on server actions — noted as gaps in `WRITEUP.md` P0.2).

---

## Core dictation pipeline

### UC-07 — Dictate a new session with screen context
- **Actor:** USER (also ADMIN/AUDITOR can technically call the same APIs).
- **Preconditions:** Signed in; browser grants Screen Capture permission (or,
  offline/headless, a `hint` string is supplied in place of an image).
- **Main flow:** HUD captures a screenshot → `POST /api/vlm` with
  `{ image | hint }` → `getVlm().describe()` returns
  `{ appContext, summary, primitives, provider }` → live STT via Web Speech
  API → on stop, `POST /api/dictations` with `{ rawText, context,
  sessionTitle }` (no `sessionId`) → server creates a new `Session` row,
  runs `resolveCleanup()` (matches `ContextProfile` by `matchApp`, applies
  org `DictionaryEntry` list, calls `getLlm().cleanup()`), persists a
  `Dictation` row with raw + clean + full context provenance, writes an
  `AuditLog` row (`session.create`).
- **Expected outcome:** New session appears in the sidebar; response includes
  `dictation`, `sessionId`, `profileName` (e.g. "Scrum Master" for a
  Jira-hinted turn).
- **Status:** **Implemented** (verified end-to-end over HTTP per
  `WRITEUP.md` §4; also re-verified by `scripts/simulate-day.mjs` in this
  change).

### UC-08 — Dictate without screen context (context unavailable)
- **Actor:** USER.
- **Preconditions:** Signed in; no image and no hint supplied, or Screen
  Capture denied.
- **Main flow:** `POST /api/dictations` with `context: null`. `resolveCleanup`
  is called with `context = null`; no `ContextProfile` can match (`app` is
  empty string), so `profileName` is `null` and cleanup falls back to plain
  normalisation + dictionary enforcement only.
- **Expected outcome:** Turn is saved with `appContext: null`,
  `contextSummary: null`, `profileName: null`, but raw/clean text and
  dictionary enforcement still work.
- **Status:** **Implemented.**

### UC-09 — Dictate with offline app-hint (no GPU/vision, deterministic mock)
- **Actor:** USER, offline / no cloud keys configured.
- **Preconditions:** `VLM_PROVIDER` unset or `mock` (the default).
- **Main flow:** Caller passes a `hint` string (e.g. window title text) to
  `POST /api/vlm` instead of an image. `mockVlm.describe()` lowercases the
  hint and matches against keyword heuristics (`APP_HINTS` in
  `src/lib/ai/mock.ts`: VS Code / Gmail / Slack / Jira / Linear / Notion) to
  produce a deterministic, honest `ScreenContext`.
  Also exposed as a UI affordance: an "app-picker dropdown" the user can
  select from when Screen Capture is unavailable (per README/WRITEUP).
- **Expected outcome:** A meaningful `appContext`/`summary` is produced with
  zero network calls and zero API keys, driving correct profile routing
  downstream (e.g. hint "jira sprint backlog" → app "Jira" →
  profile "Scrum Master").
- **Status:** **Implemented.**

### UC-10 — Continue an existing session (same-thread turn append)
- **Actor:** USER (or any org member — no per-session ownership check).
- **Preconditions:** A `Session.id` already exists in the caller's org.
- **Main flow:** `POST /api/dictations` with `sessionId` set.
  `db.session.findFirst({ where: { id: sessionId, orgId: user.orgId } })`
  finds the existing session (org-scoped, not author-scoped); a new
  `Dictation` row is appended to it; `Session.updatedAt` is bumped. No new
  `session.create` audit event is written (only new sessions get that).
- **Expected outcome:** A second (or Nth) turn — potentially by a *different*
  user — lands in the same session/timeline, proving shared, team-visible
  session continuation.
- **Status:** **Implemented** — but see UC-20 (no per-session ACL; any org
  member, not just the creator or invited participants, can append).

### UC-11 — Copy clean text to clipboard
- **Actor:** USER/ADMIN/AUDITOR viewing a dictation result.
- **Preconditions:** A cleanup result (live preview or saved dictation) is
  rendered in the HUD or session timeline.
- **Main flow:** Client-side "Copy" button uses the browser Clipboard API on
  the rendered `cleanText`/`rawText` (component-level, no server round trip).
- **Expected outcome:** Text is on the OS clipboard.
- **Status:** **Implemented** (client-only feature; not exercised by the
  HTTP simulation since it requires a real browser clipboard).

### UC-12 — Get AI follow-up suggestions
- **Actor:** USER (or any signed-in role).
- **Preconditions:** Signed in; have `rawText` (and optionally `context`)
  in hand, typically from the live HUD preview before saving.
- **Main flow:** `POST /api/suggest` with `{ rawText, context }` →
  `getLlm().suggest()` → `mockLlm.suggest()` returns exactly 3 fixed-shape
  suggestions templated on the detected app: "Rephrase for {app} in a more
  concise, professional tone", "Turn this into a bulleted action list",
  "Draft a follow-up reply based on this".
- **Expected outcome:** Array of 3 suggestion strings.
- **Status:** **Implemented** (mock provider; cloud provider is a seam, not
  built — `src/lib/ai/cloud.ts` has an Anthropic LLM adapter for `cleanup`,
  suggestions still come from whichever provider `getLlm()` resolves to).

### UC-13 — Review raw vs. clean text side by side
- **Actor:** Any signed-in org member viewing a session.
- **Preconditions:** A `Dictation` row exists.
- **Main flow:** HUD (live, pre-save) and `SessionTimeline`
  (`src/app/app/sessions/[id]/page.tsx`) render `rawText` and `cleanText` as
  dual blocks per turn, plus the VLM context card (`appContext`,
  `contextSummary`) and which `profileName`/providers produced it.
- **Expected outcome:** A reader can see exactly what was said, what was
  cleaned to, and under what context/profile — the "provenance" story from
  `WRITEUP.md` §2.
- **Status:** **Implemented.** Note: `Dictation.editedText` exists in the
  schema (for tracking post-cleanup manual edits) but no UI currently writes
  to it — editing-after-cleanup is schema-ready, not wired.

### UC-14 — Browse / search session history
- **Actor:** Any signed-in org member.
- **Preconditions:** Sessions exist in the org.
- **Main flow:** `Sidebar` lists all `Session` rows for `user.orgId`
  (`AppLayout` queries `db.session.findMany({ where: { orgId } })`), with
  category filters (`category` field, e.g. "VS Code", "Jira", "Gmail").
  Clicking a session loads `/app/sessions/[id]` (org-scoped fetch).
- **Expected outcome:** Every org member sees the full shared pool of
  sessions and can open any of them.
- **Status:** **Partial.** Browsing works, but there is no free-text search
  across dictation content (only category-based sidebar filtering) and no
  per-session visibility control — see UC-20.

### UC-15 — Provider fallback (cloud key missing → mock)
- **Actor:** System (any pipeline call).
- **Preconditions:** `VLM_PROVIDER=gemini` or `LLM_PROVIDER=anthropic` set
  without a valid API key, or construction of the cloud adapter throws for
  any reason.
- **Main flow:** `getVlm()` / `getLlm()` in `src/lib/ai/index.ts` wrap cloud
  adapter construction in try/catch; on any error they `console.warn` and
  return the deterministic mock (`mockVlm` / `mockLlm`) instead of throwing.
- **Expected outcome:** The app never hard-fails a dictation turn due to a
  missing/invalid cloud credential; it silently and deterministically
  degrades to the offline mock.
- **Status:** **Implemented.**

---

## Org-shared configuration (Settings — ADMIN write, others read-only)

### UC-16 — Add a context profile (VLM→LLM router rule)
- **Actor:** ADMIN.
- **Preconditions:** Signed in as ADMIN.
- **Main flow:** `addProfile` server action (`src/lib/actions/config.ts`)
  guards with `requireAdmin()`, creates a `ContextProfile`
  `{ matchApp, profileName, prompt }` scoped to `user.orgId`, writes an
  `AuditLog` (`profile.create`), revalidates `/app/settings`.
- **Expected outcome:** New profile immediately affects future dictation
  cleanup routing (matched by substring against detected `appContext`).
- **Status:** **Implemented.**

### UC-17 — Delete a context profile
- **Actor:** ADMIN.
- **Preconditions:** Profile exists in the admin's org.
- **Main flow:** `deleteProfile` guards with `requireAdmin()`,
  `db.contextProfile.deleteMany({ where: { id, orgId } })` (org-scoped so
  cross-org IDs can't be deleted), audits `profile.delete`.
- **Expected outcome:** Profile no longer matches future turns.
- **Status:** **Implemented.**

### UC-18 — Add / update a corporate dictionary term
- **Actor:** ADMIN.
- **Preconditions:** Signed in as ADMIN.
- **Main flow:** `addDictionaryEntry` guards with `requireAdmin()`, upserts
  `DictionaryEntry` on the `(orgId, term)` unique key, audits
  `dictionary.propagate`. Enforcement happens in `mockLlm.cleanup` via
  `applyDictionary()` — a case-insensitive word-boundary regex replace of
  `term` → `replacement` (e.g. seeded: `mac global` → `MAKGLOBAL`).
- **Expected outcome:** Every future dictation containing the term (any
  case, org-wide) is corrected to the enforced spelling.
- **Status:** **Implemented.**

### UC-19 — Delete a dictionary term
- **Actor:** ADMIN.
- **Preconditions:** Entry exists in the admin's org.
- **Main flow:** `deleteDictionaryEntry` guards with `requireAdmin()`,
  org-scoped delete. **Note:** unlike other admin mutations, this action does
  **not** write an `AuditLog` row — an inconsistency worth flagging.
- **Expected outcome:** Term no longer enforced in future cleanups.
- **Status:** **Implemented** (with the audit-gap noted above).

### UC-20 — Read-only Settings access for non-admins
- **Actor:** USER / AUDITOR.
- **Preconditions:** Signed in as non-ADMIN.
- **Main flow:** `/app/settings` page renders the same profile/dictionary
  tables but the mutating forms are admin-only in the UI; the server actions
  themselves (`addProfile`, `deleteProfile`, `addDictionaryEntry`,
  `deleteDictionaryEntry`, `updateRole`, `toggleGovernance`) independently
  enforce `requireAdmin()` — so even a crafted direct call from a non-admin
  session throws `FORBIDDEN`.
- **Expected outcome:** Non-admins can see org config but cannot mutate it,
  defense-in-depth (UI hide + server check).
- **Status:** **Implemented.**

---

## RBAC, admin & governance

### UC-21 — Change a member's role
- **Actor:** ADMIN.
- **Preconditions:** Target user has a `Membership` in the admin's org.
- **Main flow:** `updateRole` guards with `requireAdmin()`, validates role is
  one of `ADMIN|AUDITOR|USER`, `db.membership.updateMany({ where: { userId,
  orgId } })` (org-scoped), audits `rbac.update`.
- **Expected outcome:** Target user's effective role changes on next
  `getCurrentUser()` call (immediate — no session invalidation needed since
  role is read live from `Membership`, not cached in the session token).
- **Status:** **Implemented.** Note: an admin can demote themself (no
  self-protection check), which could lock the org out of admin access if
  it's the only admin — an edge case gap.

### UC-22 — View the audit ledger
- **Actor:** ADMIN or AUDITOR.
- **Preconditions:** Signed in as ADMIN (full `/app/admin` page) — **AUDITOR
  does not currently get a dedicated ledger page**, see UC-24.
- **Main flow:** `/app/admin` queries the 20 most recent `AuditLog` rows for
  the org, ordered by `createdAt desc`, joined to actor name.
- **Expected outcome:** Chronological, append-only record of
  `session.create`, `profile.create/delete`, `dictionary.propagate`,
  `rbac.update`, `governance.toggle` events.
- **Status:** **Partial.** The ledger itself is real and append-only
  (nothing ever updates/deletes an `AuditLog` row), but the admin page that
  displays it is gated to ADMIN only via `if (!isAdmin(user.role))
  redirect("/app")` — AUDITOR is blocked from the one UI surface that shows
  it, which contradicts the intended AUDITOR capability ("Read config, view
  audit ledger" per `README.md`'s role table). AUDITOR *can* read the
  underlying data via direct DB/API if a route existed, but no route
  currently serves the ledger to non-admins.

### UC-23 — Toggle E2EE / zero-data-retention governance flags
- **Actor:** ADMIN.
- **Preconditions:** Signed in as ADMIN.
- **Main flow:** `toggleGovernance` guards with `requireAdmin()`, flips
  `Organization.enforceE2EE` or `Organization.zeroDataRetention`, audits
  `governance.toggle`.
- **Expected outcome:** Toggle state persists and is audited.
- **Status:** **Partial — persisted but not enforced.** Per `WRITEUP.md`
  P1.8: flipping `zeroDataRetention` does not actually purge any
  audio/screenshot data (no raw audio is even stored today —
  `screenshotRef` is a pointer field, not populated), and `enforceE2EE` has
  no corresponding encryption code path. These are governance *promises*,
  not enforced behavior yet.

### UC-24 — Auditor read-only access
- **Actor:** AUDITOR.
- **Preconditions:** Signed in as `auditor@makglobal.com`.
- **Main flow:** AUDITOR can sign in, view `/app` workspace and org sessions
  (org-scoped reads are role-agnostic), and call read-style API routes like
  `/api/cleanup` (no role check beyond "signed in" — see route code, it only
  calls `getCurrentUser()`, not `isAdmin()`). AUDITOR is blocked from
  `/app/admin` (redirects to `/app`) and from all `requireAdmin()`-guarded
  server actions.
- **Expected outcome:** AUDITOR can observe org dictation activity and even
  trigger read-style pipeline calls, but cannot mutate config, roles, or
  governance flags.
- **Status:** **Partial.** Role separation for mutation is solid
  (`requireAdmin()` on every write path), but "view audit ledger" — the
  AUDITOR's headline capability per the README — is not actually reachable
  by an AUDITOR today (see UC-22). Also, AUDITOR has no restriction at all
  on calling the *mutating* dictation-creation route (`/api/dictations`) —
  an auditor can create sessions/dictations just like a USER, which is
  arguably a role-boundary gap (auditors probably shouldn't write org data).

### UC-25 — Invite a new team member
- **Actor:** ADMIN.
- **Preconditions:** None.
- **Main flow:** "+ Invite" button in `Topbar` (`src/components/Topbar.tsx`).
- **Expected outcome:** Would send an invitation / add a pending membership
  for a new email.
- **Status:** **Roadmap.** Button has no `onClick`/action — pure UI stub,
  `title="Roadmap — see WRITEUP.md"`. New users can currently only be added
  via `prisma/seed.ts` or direct DB access; there is no signup flow at all.

### UC-26 — Multi-org switching
- **Actor:** Any user who is a member of >1 org.
- **Preconditions:** Schema supports it (`Membership` is many-to-many between
  `User` and `Organization`).
- **Main flow:** Would let a user switch their "active org" context.
- **Expected outcome:** Different org's data/roles apply after switching.
- **Status:** **Roadmap.** `getCurrentUser()` hard-codes
  `memberships[0]` — the user's *first* membership row — as the active org
  with no UI or mechanism to pick another. Schema-ready, not implemented.

### UC-27 — Session-level sharing / per-session ACLs
- **Actor:** Any org member.
- **Preconditions:** N/A.
- **Main flow:** Would let a session be private, shared with specific
  members, or assigned to a subset of the org.
- **Expected outcome:** Fine-grained visibility beyond "every org member sees
  every org session."
- **Status:** **Roadmap.** Every read of `Session`/`Dictation` is
  `orgId`-scoped only (`AppLayout`, `/app/sessions/[id]`,
  `/api/dictations` POST's `findFirst`) — there is no owner-only or
  shared-with-list concept anywhere in the schema or query layer. Explicitly
  called out as a gap in `WRITEUP.md` P1.6.

---

## Cross-cutting / system-level

### UC-28 — Multi-tenant isolation between organizations
- **Actor:** System.
- **Preconditions:** Two or more `Organization` rows exist.
- **Main flow:** Every domain query (`Session`, `Dictation` via `session`,
  `ContextProfile`, `DictionaryEntry`, `AuditLog`, `Membership`) filters by
  `orgId` derived from the caller's session, never from client input alone
  (e.g. `/api/dictations`'s `findFirst({ where: { id: sessionId, orgId }})`
  prevents cross-org `sessionId` guessing).
- **Expected outcome:** Org A can never read or write Org B's data even with
  a valid session token for Org A.
- **Status:** **Implemented.** (Only one org — MakGlobal — is seeded, so this
  is verified by code inspection, not by the simulation script, which
  operates within a single org.)

### UC-29 — Append-only audit trail for every governed mutation
- **Actor:** System.
- **Preconditions:** N/A.
- **Main flow:** `audit()` helper in `src/lib/pipeline.ts` is called from:
  new-session creation (`/api/dictations`), `profile.create`,
  `profile.delete`, `dictionary.propagate`, `rbac.update`,
  `governance.toggle`. No code path ever updates or deletes an `AuditLog`
  row.
- **Expected outcome:** A durable, chronological compliance trail.
- **Status:** **Partial.** Real and append-only for the actions listed, but
  not exhaustive: `deleteDictionaryEntry` does not audit (see UC-19), and
  appending a turn to an *existing* session (UC-10) does not audit anything
  (only the session's initial creation is logged).

---

## Status summary

| Status | Count | IDs |
| --- | --- | --- |
| Implemented | 20 | UC-01, 02, 03, 06, 07, 08, 09, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 28 (+11 fully solid) |
| Partial | 6 | UC-14, 22, 23, 24, 29, (21 self-demotion edge case) |
| Roadmap | 4 | UC-04, 05, 25, 26, 27 |

(Some use cases are Implemented with a noted caveat rather than purely
binary — read each entry's Status line for the precise nuance.)
