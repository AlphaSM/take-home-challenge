#!/usr/bin/env node
// Builds a seeded SQLite template database at BUILD time, which is packaged
// as an extraResource. On first launch, main.js copies this template into
// the user's userData dir. This avoids needing the Prisma CLI inside the
// packaged app (which can't run `prisma db push` from an asar easily).
//
// Usage: node desktop/scripts/prepare-db.mjs
// Run from the repo root (or anywhere) — paths below are resolved relative
// to this script's location.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const resourcesDir = path.join(desktopDir, "resources");
const templateDbPath = path.join(resourcesDir, "template.db");

mkdirSync(resourcesDir, { recursive: true });

// Start fresh every time this script runs so it's idempotent.
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  const p = templateDbPath + suffix;
  if (existsSync(p)) rmSync(p);
}

const templateDbUrl = "file:" + templateDbPath.replace(/\\/g, "/");

const env = {
  ...process.env,
  DATABASE_URL: templateDbUrl,
};

console.log(`[prepare-db] Using DATABASE_URL=${templateDbUrl}`);
console.log("[prepare-db] Running prisma db push --skip-generate ...");
execFileSync(
  "npx",
  ["--no-install", "prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  { cwd: repoRoot, env, stdio: "inherit", shell: true }
);

console.log("[prepare-db] Seeding template database ...");
execFileSync("npx", ["--no-install", "tsx", "prisma/seed.ts"], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
  shell: true,
});

console.log(`[prepare-db] Done. Template DB at: ${templateDbPath}`);
