# CI/CD

## Overview

Two GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`** — runs on every push to `main` and every pull request.
- **`release.yml`** — runs when a tag matching `v*` is pushed, and publishes a
  Docker image to GitHub Container Registry (GHCR).

## `ci.yml`

### Job: `quality`

Runs on `ubuntu-latest` with Node 22 (npm dependencies cached via
`actions/setup-node`). Steps, in order:

1. `npm ci` — clean install from `package-lock.json`.
2. `npx prisma generate` — generate the Prisma client (required before build
   and before anything that imports `@prisma/client`).
3. `npm run lint -- --max-warnings=0` — ESLint via `next lint`, using
   `.eslintrc.json` (`next/core-web-vitals` + `next/typescript`). Zero
   warnings tolerated.
4. `npm test --if-present` — runs the Vitest suite if a `test` script is
   present in `package.json` (no-op otherwise, so CI doesn't break if the
   test suite isn't wired up yet).
5. `npm run build` — full `prisma generate && next build`, with
   `DATABASE_URL=file:./ci.db` and `AUTH_SECRET=ci` so the build has valid
   (dummy) environment values without touching real secrets.

### Job: `docker`

Depends on `quality` passing. Builds the repo's `Dockerfile` with
`docker/build-push-action` (`push: false`) using the GitHub Actions cache
(`type=gha`) for fast, incremental builds. This validates the image builds
cleanly without publishing anything.

## `release.yml`

Triggered by pushing a tag matching `v*` (e.g. `v1.2.0`). Steps:

1. Extract the version number from the tag (strips the leading `v`).
2. Log in to `ghcr.io` using `docker/login-action` with the built-in
   `GITHUB_TOKEN` (no extra secrets needed — just ensure the repo/workflow
   has `packages: write` permission, already set in the workflow).
3. Build and push the image with `docker/build-push-action`, tagging it:
   - `ghcr.io/<owner>/<repo>:latest`
   - `ghcr.io/<owner>/<repo>:<version>` (e.g. `1.2.0`)

## Cutting a release

```bash
git checkout main
git pull
git tag v1.2.0
git push origin v1.2.0
```

Pushing the tag triggers `release.yml`, which builds and pushes
`ghcr.io/<owner>/<repo>:1.2.0` and `ghcr.io/<owner>/<repo>:latest`. Watch
progress under the repo's **Actions** tab. Once complete, pull it with:

```bash
docker pull ghcr.io/<owner>/<repo>:1.2.0
```

## Notes / known issues

- `next lint` requires `eslint` and `eslint-config-next` as installed
  devDependencies plus a config file; both were added
  (`.eslintrc.json` extends `next/core-web-vitals` and `next/typescript`).
- Running `npm run lint -- --max-warnings=0` locally currently surfaces a
  handful of pre-existing issues in `src/` (unrelated to the CI setup
  itself), so the `quality` job will fail until these are fixed:
  - `src/app/login/page.tsx:17` and `src/components/SessionTimeline.tsx:34`
    — JSX comments not wrapped in `{/* ... */}` braces
    (`react/jsx-no-comment-textnodes`).
  - `src/lib/ai/cloud.ts` — several unused imports/consts
    (`@typescript-eslint/no-unused-vars`).
  These were intentionally left untouched (out of scope for the CI/CD task)
  and should be fixed in application code directly.
