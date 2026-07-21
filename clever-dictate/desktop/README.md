# Clever Dictate — Desktop (Electron)

Packages the existing Next.js 15 web app (`output: "standalone"`) as a
desktop application. The app itself is unmodified — this directory only adds
an Electron shell around it.

## How it works

1. `npx next build` (run from the repo root) produces `.next/standalone/server.js`
   and `.next/static`. The standalone server does **not** include the static
   asset directory by default, so it must be present at
   `.next/standalone/.next/static` for CSS/JS chunks to be servable
   (verified: without this copy, `/login` loads but all asset requests 404).
2. At **build time**, `desktop/scripts/prepare-db.mjs` creates a seeded SQLite
   template database (`desktop/resources/template.db`) by running
   `prisma db push --skip-generate` + `tsx prisma/seed.ts` against it. This
   avoids needing the Prisma CLI inside the packaged app.
3. `electron-builder` packages, as `extraResources` (outside the asar, since
   the standalone server reads files off disk at runtime):
   - `.next/standalone` → `resources/standalone`
   - `.next/static` → `resources/static`
   - `desktop/resources/template.db` → `resources/template.db`
4. On **first launch**, `desktop/main.js`:
   - Copies `.next/static` into `resources/standalone/.next/static` if not
     already present (belt-and-suspenders — also done for the dev path).
   - Copies `template.db` → `<userData>/clever.db` if that file doesn't
     already exist (subsequent launches reuse the same DB — no reseed).
   - Generates and persists a per-install `AUTH_SECRET` in
     `<userData>/auth-secret.txt`.
   - Spawns the standalone server with Electron's bundled Node via
     `utilityProcess.fork(serverJsPath)`, with `PORT=34115`,
     `HOSTNAME=127.0.0.1`, `DATABASE_URL=file:<userData>/clever.db`,
     `VLM_PROVIDER=mock`, `LLM_PROVIDER=mock`, `STT_PROVIDER=browser`.
   - Polls `http://127.0.0.1:34115/login` until it returns a non-5xx status
     (30s timeout), then opens a `BrowserWindow` (1280x800, dark background
     `#0A0B0D`, title "Clever Dictate") loading that URL.
   - Grants `media`, `display-capture`, and `clipboard-sanitized-write`
     permission requests (needed for mic + screen capture).
   - Enforces a single-instance lock; kills the child server process on
     `window-all-closed` / `before-quit`.

## Where the database lives

- **Verified actual path (both dev and packaged portable exe)**:
  `%APPDATA%\clever-dictate-desktop\clever.db`
  (i.e. `C:\Users\<you>\AppData\Roaming\clever-dictate-desktop\clever.db`).
  Electron's `userData` dir is keyed off `app.getName()`, which defaults to
  the `name` field in `package.json` (`clever-dictate-desktop`) — **not**
  `build.productName` ("Clever Dictate") — unless `app.setName()` is called
  explicitly, which `main.js` currently does not do. This was confirmed by
  running the packaged portable exe and inspecting `%APPDATA%`; no
  `Clever Dictate` folder was created, only `clever-dictate-desktop`.
  The same path is used whether the app is run via `npm run dev` from this
  directory or as the built portable/NSIS-installed exe.
- Also in that same folder: `auth-secret.txt` (persisted per-install
  `AUTH_SECRET`).
- First launch logs the resolved path to stdout, e.g.
  `[main] No DB found at <path>; copying template...`. Subsequent launches
  log `[main] Reusing existing DB at <path>` and do **not** touch the DB
  (verified: inserted a marker row via Prisma, relaunched the exe, marker
  and all 3 seeded users were still present — confirms no reseed-on-launch
  behavior).

## Port

The embedded server always binds `127.0.0.1:34115` (chosen to avoid the
project's dev instance on 3001 and the reserved 3000/3100-3210 range).

## Build commands

All commands assume you've already run `npm run build` at the repo root
(produces `.next/standalone` + `.next/static`).

```bash
# From repo root — builds the web app, prepares the seeded DB, installs
# desktop deps:
npm run desktop:prepare

# Run in dev (unpacked) mode:
npm run desktop:dev

# Package for Windows (NSIS installer + portable exe):
npm run desktop:dist
# (equivalent to: npm --prefix desktop run dist:win)
```

### Windows

```bash
npm --prefix desktop run dist:win
```

Produces `desktop/dist/*.exe` — an NSIS installer and a portable exe.

> **Known Windows issue (encountered and fixed during development):**
> electron-builder downloads a `winCodeSign` tooling archive even for
> unsigned Windows-only builds, and extracting it fails on stock Windows
> accounts with `Cannot create symbolic link: A required privilege is not
> held by the client` (it contains macOS `.dylib` symlinks, and creating
> symlinks on Windows requires Developer Mode or an elevated/admin shell).
> This is why `desktop/package.json`'s `build.win` block sets
> `"signAndEditExecutable": false` — it skips the `rcedit`/`signtool` step
> that pulls in `winCodeSign`, and both the NSIS installer and portable exe
> build cleanly without it. If you re-enable executable signing/icon editing
> for a real release, you'll need Developer Mode enabled (or an elevated
> shell) the first time so electron-builder can populate its tool cache.

### macOS

```bash
npm --prefix desktop run dist:mac
```

**Cannot be built from Windows.** electron-builder requires running on
macOS (or a macOS CI runner, e.g. GitHub Actions `macos-latest`) to produce
a signed `.dmg`/`.zip` — this is an Apple toolchain requirement
(`codesign`, DMG creation), not something electron-builder works around.
The `mac` build config block in `desktop/package.json` is ready to go; run
this script on a Mac or in CI.

## Notes

- The Electron `desktop/` directory has its own `package.json` and
  `node_modules` so Electron/electron-builder dependencies never touch the
  main Next.js app's dependency tree.
- `desktop/dist/`, `desktop/node_modules/`, and
  `desktop/resources/template.db` are all gitignored — the template DB is
  a build artifact, regenerated by `npm run desktop:prepare`.
