# syntax=docker/dockerfile:1

##########
# deps: install full node_modules (dev deps included) for build stage
##########
FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

##########
# builder: prisma generate + next build (standalone output)
##########
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build does not touch the DB (all routes are dynamic/server-rendered on
# demand), but `prisma generate` just needs a syntactically valid URL and
# Next.js reads env at build time for some checks, so provide a dummy value.
ENV DATABASE_URL="file:./dev.db"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

##########
# runtime: minimal image with standalone server + prisma CLI for migrations/seed
##########
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Default DB location: a mounted volume so data survives container restarts.
ENV DATABASE_URL="file:/data/clever.db"
ENV SEED_ON_START=true

# Standalone server output (includes a pruned node_modules with only the
# runtime deps next actually needs).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema + seed script, needed at container start to run migrations
# (db push) and seed the database. The prisma CLI (and its own dependency
# tree, e.g. @prisma/config -> effect) plus tsx (-> esbuild) are pulled from
# the builder's full node_modules wholesale — hand-picking individual
# sub-dependencies is brittle since Prisma's CLI dependency graph is deep.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
