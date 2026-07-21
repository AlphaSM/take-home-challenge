#!/bin/sh
set -e

DB_PATH="${DATABASE_URL#file:}"
DB_DIR="$(dirname "$DB_PATH")"

mkdir -p "$DB_DIR"

echo "[entrypoint] Syncing database schema (prisma db push)..."
npx --no-install prisma db push --skip-generate --accept-data-loss

MARKER="${DB_DIR}/.seeded"
SEED_ON_START="${SEED_ON_START:-true}"

if [ "$SEED_ON_START" = "true" ] && [ ! -f "$MARKER" ]; then
  echo "[entrypoint] Seeding database (first run)..."
  npx --no-install tsx prisma/seed.ts
  touch "$MARKER"
else
  echo "[entrypoint] Skipping seed (already seeded or SEED_ON_START=false)."
fi

echo "[entrypoint] Starting server..."
exec "$@"
