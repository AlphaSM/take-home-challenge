#!/usr/bin/env node
// End-to-end smoke test for the server-side STT seam: mints a real session
// token directly in the DB (no browser/server-actions needed), then POSTs
// sample WAV files to /api/stt, then chains one result through /api/cleanup
// to prove the full audio -> STT -> LLM-cleanup pipeline works.
//
// Usage:
//   node scripts/test-stt.mjs
//   PORT=3150 node scripts/test-stt.mjs
//
// Requires a running server (dev or prod) on PORT (default 3000), and the DB
// seeded via `npm run db:seed` (user@makglobal.com / password "password").

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, "..", "samples");
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const SEED_EMAIL = "user@makglobal.com";

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name} — ${detail}`);
}

async function mintSession(db) {
  const user = await db.user.findUnique({ where: { email: SEED_EMAIL } });
  if (!user) {
    throw new Error(
      `Seed user ${SEED_EMAIL} not found. Run \`npm run db:seed\` first.`,
    );
  }
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
    },
  });
  return token;
}

async function postStt(token, filePath, hint) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append(
    "audio",
    new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
    path.basename(filePath),
  );
  if (hint) form.append("hint", hint);

  const res = await fetch(`${BASE_URL}/api/stt`, {
    method: "POST",
    headers: { cookie: `clever_session=${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function postCleanup(token, rawText, context) {
  const res = await fetch(`${BASE_URL}/api/cleanup`, {
    method: "POST",
    headers: { cookie: `clever_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify({ rawText, context }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const db = new PrismaClient();
  let token;
  try {
    token = await mintSession(db);
  } catch (e) {
    console.error(`FATAL: could not mint session — ${e.message}`);
    process.exitCode = 1;
    await db.$disconnect();
    return;
  }

  // --- Sanity: unauthenticated request must 401 -----------------------------
  try {
    const bytes = await readFile(path.join(SAMPLES_DIR, "fixture-1s.wav"));
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/wav" }));
    const res = await fetch(`${BASE_URL}/api/stt`, { method: "POST", body: form });
    record("auth guard rejects unauthenticated request", res.status === 401, `status=${res.status}`);
  } catch (e) {
    record("auth guard rejects unauthenticated request", false, `error: ${e.message}`);
  }

  // --- Sample 1: synthetic fixture, no hint -> placeholder transcript ------
  try {
    const filePath = path.join(SAMPLES_DIR, "fixture-1s.wav");
    const { status, json } = await postStt(token, filePath);
    const ok =
      status === 200 &&
      typeof json.text === "string" &&
      json.text.includes("[offline stt]") &&
      typeof json.durationSec === "number" &&
      Math.abs(json.durationSec - 1) < 0.05;
    record(
      "fixture-1s.wav -> /api/stt (no hint, placeholder transcript + parsed duration)",
      ok,
      `status=${status} provider=${json.provider} durationSec=${json.durationSec} text="${json.text}"`,
    );
  } catch (e) {
    record("fixture-1s.wav -> /api/stt", false, `error: ${e.message}`);
  }

  // --- Sample 2: real speech WAV, no hint -> duration parsed from real header
  try {
    const filePath = path.join(SAMPLES_DIR, "OSR_us_000_0011_8k.wav");
    const { status, json } = await postStt(token, filePath);
    const ok = status === 200 && typeof json.durationSec === "number" && json.durationSec > 0;
    record(
      "OSR_us_000_0011_8k.wav -> /api/stt (real WAV header parsed)",
      ok,
      `status=${status} provider=${json.provider} durationSec=${json.durationSec}`,
    );
  } catch (e) {
    record("OSR_us_000_0011_8k.wav -> /api/stt", false, `error: ${e.message}`);
  }

  // --- Sample 3: real speech WAV + hint -> full pipeline through cleanup ---
  const HINT_TEXT = "add retry logic and fix the cookie same site attribute";
  let sttText = null;
  try {
    const filePath = path.join(SAMPLES_DIR, "OSR_us_000_0010_8k.wav");
    const { status, json } = await postStt(token, filePath, HINT_TEXT);
    const ok = status === 200 && json.text === HINT_TEXT && typeof json.durationSec === "number";
    sttText = json.text;
    record(
      "OSR_us_000_0010_8k.wav -> /api/stt (hint injected as ground-truth transcript)",
      ok,
      `status=${status} provider=${json.provider} durationSec=${json.durationSec} text="${json.text}"`,
    );
  } catch (e) {
    record("OSR_us_000_0010_8k.wav -> /api/stt (with hint)", false, `error: ${e.message}`);
  }

  // Chain the STT output through /api/cleanup with a Jira context, proving
  // audio -> stt -> cleanup end-to-end.
  if (sttText) {
    try {
      const jiraContext = {
        appContext: "Jira",
        summary: "Editing a Jira ticket",
        primitives: [{ label: "ticket: AUTH-142" }],
        provider: "mock-vlm",
      };
      const { status, json } = await postCleanup(token, sttText, jiraContext);
      const ok =
        status === 200 &&
        typeof json.cleanText === "string" &&
        /retry logic/i.test(json.cleanText) &&
        /same ?site/i.test(json.cleanText);
      record(
        "STT output -> /api/cleanup (Jira context, full pipeline)",
        ok,
        `status=${status} provider=${json.provider} profileName=${json.profileName} cleanText="${json.cleanText}"`,
      );
    } catch (e) {
      record("STT output -> /api/cleanup", false, `error: ${e.message}`);
    }
  } else {
    record("STT output -> /api/cleanup", false, "skipped — no STT text from previous step");
  }

  await db.$disconnect();

  // --- Summary table ---------------------------------------------------------
  console.log("\n=== STT pipeline test summary ===");
  const width = Math.max(...results.map((r) => r.name.length), 10);
  for (const r of results) {
    console.log(`${(r.pass ? "PASS" : "FAIL").padEnd(6)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exitCode = 1;
});
