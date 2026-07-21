#!/usr/bin/env node
// scripts/simulate-day.mjs
//
// Simulates a full enterprise working day at "MakGlobal" against a REAL,
// already-running Clever Dictate server (see README "npm run dev" / build+start),
// using the real HTTP API (fetch) plus @prisma/client for the two things HTTP
// can't do: minting session cookies directly (no /api/login route exists —
// auth is via server actions + a form post, not a JSON endpoint) and reading
// the audit ledger to verify governance behavior.
//
// Usage:
//   PORT=3160 node scripts/simulate-day.mjs
//
// Requires: the app's DB already seeded (npm run setup), and the Next.js
// server already running on PORT (default 3000). This script does not start
// or stop the server itself.
//
// Design note: server actions (src/lib/actions/*.ts) are Next.js "use server"
// functions bound to React form submissions with framework-internal encoding
// (a POST to the page route with a special header/body format) — they are not
// stable, callable JSON endpoints. So step "10:00" (admin adds a dictionary
// term) is verified two ways: (a) documented here as NOT HTTP-callable from a
// plain script, and (b) exercised indirectly by relying on the dictionary
// entries already seeded by prisma/seed.ts (term "mac global" -> "MAKGLOBAL")
// and asserting the pipeline enforces them on a fresh dictation.

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const db = new PrismaClient();

// --- tiny simulated clock, purely cosmetic for logging -------------------
let clock = "08:30";
function log(step, msg) {
  console.log(`[${clock}] ${step ? `(${step}) ` : ""}${msg}`);
}
function setClock(t) {
  clock = t;
}

// --- results table ---------------------------------------------------------
/** @type {Array<{step: string, actor: string, expected: string, actual: string, pass: boolean}>} */
const results = [];
function record(step, actor, expected, actual, pass) {
  results.push({ step, actor, expected, actual, pass });
  log(step, `${pass ? "PASS" : "FAIL"} — ${actor}: expected ${expected}; actual ${actual}`);
}

// --- auth: mint AuthSession rows directly via Prisma ------------------------
// There is no JSON login endpoint (login is a server-action form post), so per
// the task brief we mint `AuthSession` rows the same way src/lib/auth.ts's
// createSession() does, and send the resulting token as the `clever_session`
// cookie on every fetch.
async function mintSessionCookie(email) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`seed user not found: ${email}`);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.authSession.create({ data: { token, userId: user.id, expiresAt } });
  return `clever_session=${token}`;
}

async function api(cookie, path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response (e.g. an HTML redirect) — leave json null
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`\n=== Clever Dictate — Enterprise Day Simulation (MakGlobal) ===`);
  console.log(`Target server: ${BASE}\n`);

  // Sanity: server reachable at all.
  try {
    const ping = await fetch(`${BASE}/login`);
    if (!ping.ok && ping.status !== 200) {
      console.warn(`Warning: GET /login returned ${ping.status} — continuing anyway.`);
    }
  } catch (e) {
    console.error(`Cannot reach server at ${BASE}. Is it running? (${e.message})`);
    process.exit(1);
  }

  // Mint cookies for the three seeded users. See prisma/seed.ts.
  const marcusCookie = await mintSessionCookie("user@makglobal.com"); // USER
  const adminCookie = await mintSessionCookie("admin@makglobal.com"); // ADMIN
  const auditorCookie = await mintSessionCookie("auditor@makglobal.com"); // AUDITOR

  // -------------------------------------------------------------------------
  setClock("08:30");
  log("UC-07", "Marcus (USER) dictates standup notes with Slack screen context.");
  {
    const vlm = await api(marcusCookie, "/api/vlm", {
      method: "POST",
      body: { hint: "slack thread" },
    });
    const vlmOk = vlm.status === 200 && vlm.json?.context?.appContext === "Slack";
    record(
      "08:30 VLM (standup)",
      "Marcus (USER)",
      "200, appContext=Slack",
      `status=${vlm.status}, appContext=${vlm.json?.context?.appContext}`,
      vlmOk,
    );

    const dictate = await api(marcusCookie, "/api/dictations", {
      method: "POST",
      body: {
        sessionTitle: "Standup 2026-07-21",
        rawText:
          "um so yesterday I fixed the login bug and today I am working on the dictation pipeline new line no blockers",
        context: vlm.json?.context ?? null,
      },
    });
    const dictateOk =
      dictate.status === 200 &&
      !!dictate.json?.sessionId &&
      typeof dictate.json?.dictation?.cleanText === "string" &&
      dictate.json.dictation.cleanText.length > 0;
    record(
      "08:30 dictate standup",
      "Marcus (USER)",
      "200, new session created, non-empty cleanText",
      `status=${dictate.status}, sessionId=${dictate.json?.sessionId}, cleanText="${dictate.json?.dictation?.cleanText}"`,
      dictateOk,
    );

    // Save the sessionId for the 13:00 continuation step.
    global.__morningSessionId = dictate.json?.sessionId;
  }

  // -------------------------------------------------------------------------
  setClock("09:15");
  log("UC-07/UC-09", "Marcus dictates Jira ticket items with a jira hint.");
  {
    const vlm = await api(marcusCookie, "/api/vlm", {
      method: "POST",
      body: { hint: "jira sprint backlog" },
    });
    const dictate = await api(marcusCookie, "/api/dictations", {
      method: "POST",
      body: {
        sessionTitle: "Sprint backlog grooming",
        rawText: "add retry logic and fix the flaky test and update the changelog",
        context: vlm.json?.context ?? null,
      },
    });
    const cleanText = dictate.json?.dictation?.cleanText ?? "";
    const hasBullets = /^- /m.test(cleanText) && cleanText.split("\n").filter((l) => l.startsWith("- ")).length >= 2;
    const profileOk = dictate.json?.profileName === "Scrum Master";
    const ok = dictate.status === 200 && hasBullets && profileOk;
    record(
      "09:15 dictate Jira ticket",
      "Marcus (USER)",
      "cleanText has bullet lines, profileName=Scrum Master",
      `status=${dictate.status}, profileName=${dictate.json?.profileName}, cleanText="${cleanText.replace(/\n/g, "\\n")}"`,
      ok,
    );
  }

  // -------------------------------------------------------------------------
  setClock("10:00");
  log(
    "UC-18",
    "Dictionary enforcement check (admin dictionary mutation is a server action, not HTTP-callable from this script — see file header note). Verifying existing seeded term enforcement instead.",
  );
  {
    // NOTE: addDictionaryEntry() in src/lib/actions/config.ts is a Next.js
    // server action, not a JSON API route — it can't be POSTed directly from
    // a plain fetch script without replicating Next's internal action-invoke
    // protocol. Per the task brief, we document this and instead verify the
    // *effect* of an admin-managed dictionary entry (seeded: "mac global" ->
    // "MAKGLOBAL") is enforced end-to-end through the real HTTP pipeline.
    const dictate = await api(marcusCookie, "/api/dictations", {
      method: "POST",
      body: {
        sessionTitle: "Vendor intro call notes",
        rawText: "we are partnering with mac global on the new rollout",
        context: null,
      },
    });
    const cleanText = dictate.json?.dictation?.cleanText ?? "";
    const ok = dictate.status === 200 && cleanText.includes("MAKGLOBAL");
    record(
      "10:00 dictionary enforcement",
      "Marcus (USER), enforcing ADMIN-owned config",
      'cleanText contains "MAKGLOBAL"',
      `status=${dictate.status}, cleanText="${cleanText}"`,
      ok,
    );
  }

  // -------------------------------------------------------------------------
  setClock("11:30");
  log("UC-07", "Marcus drafts an email with Gmail screen context.");
  {
    const vlm = await api(marcusCookie, "/api/vlm", {
      method: "POST",
      body: { hint: "gmail compose subject: rollout plan" },
    });
    const dictate = await api(marcusCookie, "/api/dictations", {
      method: "POST",
      body: {
        sessionTitle: "Rollout announcement email",
        rawText: "hey team wanted to share that the rollout is going ahead next week",
        context: vlm.json?.context ?? null,
      },
    });
    const ok = dictate.status === 200 && dictate.json?.profileName === "Professional Email";
    record(
      "11:30 draft email",
      "Marcus (USER)",
      "profileName=Professional Email",
      `status=${dictate.status}, profileName=${dictate.json?.profileName}`,
      ok,
    );
  }

  // -------------------------------------------------------------------------
  setClock("13:00");
  log("UC-10", "Afternoon: a second user turn is appended to the SAME morning session.");
  {
    const sessionId = global.__morningSessionId;
    if (!sessionId) {
      record(
        "13:00 session continuation",
        "Marcus (USER)",
        "sessionId reused from 08:30",
        "no sessionId captured from 08:30 step",
        false,
      );
    } else {
      const dictate = await api(marcusCookie, "/api/dictations", {
        method: "POST",
        body: {
          sessionId,
          rawText: "afternoon update the pipeline fix is deployed and verified in staging",
          context: null,
        },
      });
      const ok = dictate.status === 200 && dictate.json?.sessionId === sessionId;
      record(
        "13:00 session continuation",
        "Marcus (USER)",
        `same sessionId (${sessionId}) reused, no new session created`,
        `status=${dictate.status}, returned sessionId=${dictate.json?.sessionId}`,
        ok,
      );

      // Extra proof: the session now has >= 2 dictations.
      const count = await db.dictation.count({ where: { sessionId } });
      record(
        "13:00 turn count check",
        "system",
        ">= 2 dictations in the shared session",
        `dictation count=${count}`,
        count >= 2,
      );
    }
  }

  // -------------------------------------------------------------------------
  setClock("14:00");
  log("UC-12", "/api/suggest returns 3 suggestions.");
  {
    const res = await api(marcusCookie, "/api/suggest", {
      method: "POST",
      body: { rawText: "the deploy is done", context: { appContext: "Slack" } },
    });
    const ok = res.status === 200 && Array.isArray(res.json?.suggestions) && res.json.suggestions.length === 3;
    record(
      "14:00 suggestions",
      "Marcus (USER)",
      "200, 3 suggestions",
      `status=${res.status}, count=${res.json?.suggestions?.length}`,
      ok,
    );
  }

  // -------------------------------------------------------------------------
  setClock("15:00");
  log("UC-24/UC-03", "Auditor calls /api/cleanup (allowed); unauthenticated call is rejected.");
  {
    const auditorRes = await api(auditorCookie, "/api/cleanup", {
      method: "POST",
      body: { rawText: "auditor spot-check of the cleanup pipeline", context: null },
    });
    const auditorOk = auditorRes.status === 200 && typeof auditorRes.json?.cleanText === "string";
    record(
      "15:00 auditor /api/cleanup",
      "Ava (AUDITOR)",
      "200, cleanText present (AUDITOR is not blocked from read-style pipeline calls)",
      `status=${auditorRes.status}, cleanText="${auditorRes.json?.cleanText}"`,
      auditorOk,
    );

    const anonRes = await api(null, "/api/cleanup", {
      method: "POST",
      body: { rawText: "should be rejected", context: null },
    });
    const anonOk = anonRes.status === 401;
    record(
      "15:00 unauthenticated /api/cleanup",
      "anonymous",
      "401",
      `status=${anonRes.status}, body=${JSON.stringify(anonRes.json)}`,
      anonOk,
    );
  }

  // -------------------------------------------------------------------------
  setClock("16:30");
  log("UC-29", "Verify audit ledger rows exist for session.create via Prisma.");
  {
    const orgUser = await db.user.findUnique({ where: { email: "user@makglobal.com" } });
    const logs = await db.auditLog.findMany({
      where: { actorId: orgUser.id, action: "session.create" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const ok = logs.length >= 2; // "Standup 2026-07-21" + "Sprint backlog grooming" + "Vendor intro..." + "Rollout..."
    record(
      "16:30 audit ledger check",
      "system (verifying ADMIN-visible ledger)",
      ">= 2 session.create rows authored by Marcus today",
      `found ${logs.length} rows: ${logs.map((l) => l.target).join(" | ")}`,
      ok,
    );
  }

  // -------------------------------------------------------------------------
  setClock("17:30");
  console.log("\n=== End-of-day summary ===\n");
  const colWidths = { step: 30, actor: 16, expected: 42, actual: 42, result: 6 };
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  const header = `${pad("Step", colWidths.step)} | ${pad("Actor", colWidths.actor)} | ${pad(
    "Expected",
    colWidths.expected,
  )} | ${pad("Actual", colWidths.actual)} | Result`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    console.log(
      `${pad(r.step, colWidths.step)} | ${pad(r.actor, colWidths.actor)} | ${pad(
        r.expected,
        colWidths.expected,
      )} | ${pad(r.actual, colWidths.actual)} | ${r.pass ? "PASS" : "FAIL"}`,
    );
  }

  const failCount = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failCount}/${results.length} steps passed.`);

  await db.$disconnect();

  if (failCount > 0) {
    console.error(`\n${failCount} step(s) FAILED.`);
    process.exit(1);
  } else {
    console.log("\nAll steps PASSED.");
    process.exit(0);
  }
}

main().catch(async (e) => {
  console.error("Simulation crashed:", e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
