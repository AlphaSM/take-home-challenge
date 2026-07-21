// Clever Dictate desktop shell.
//
// Boots the Next.js standalone server as a child Node process (using
// Electron's bundled Node runtime via ELECTRON_RUN_AS_NODE), waits for it to
// come up on 127.0.0.1:34115, then opens a BrowserWindow pointed at it.
//
// First-run bootstrap: a seeded SQLite template DB is packaged as an
// extraResource (resources/template.db). On first launch we copy it into
// the per-user Electron userData directory. Subsequent launches reuse the
// existing DB untouched (no reseed).

const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { utilityProcess } = require("electron");
const http = require("node:http");

const PORT = 34115;
const HOSTNAME = "127.0.0.1";
const APP_URL = `http://${HOSTNAME}:${PORT}`;

let child = null;
let mainWindow = null;

// Resolve the standalone server tree + template DB, whether running from
// asar-packaged resources or from the desktop/ dev tree directly.
function resolvePaths() {
  const isPackaged = app.isPackaged;
  const resourcesRoot = isPackaged ? process.resourcesPath : null;

  const serverDir = isPackaged
    ? path.join(resourcesRoot, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");

  const staticSrcDir = isPackaged
    ? path.join(resourcesRoot, "static")
    : path.join(__dirname, "..", ".next", "static");

  const templateDbPath = isPackaged
    ? path.join(resourcesRoot, "template.db")
    : path.join(__dirname, "resources", "template.db");

  return { serverDir, staticSrcDir, templateDbPath };
}

function ensureDatabase(templateDbPath) {
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "clever.db");

  if (!fs.existsSync(dbPath)) {
    console.log(`[main] No DB found at ${dbPath}; copying template from ${templateDbPath}`);
    fs.copyFileSync(templateDbPath, dbPath);
  } else {
    console.log(`[main] Reusing existing DB at ${dbPath}`);
  }
  return dbPath;
}

function ensureAuthSecret() {
  const userDataDir = app.getPath("userData");
  const secretPath = path.join(userDataDir, "auth-secret.txt");
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, secret, "utf8");
  return secret;
}

// Ensure .next/static is present at <serverDir>/.next/static — the Next.js
// standalone server does not include the static asset dir by default; it
// must be copied alongside server.js for CSS/JS chunks to be servable.
function ensureStaticAssets(serverDir, staticSrcDir) {
  const staticDestDir = path.join(serverDir, ".next", "static");
  if (fs.existsSync(staticDestDir)) return;
  if (!fs.existsSync(staticSrcDir)) {
    console.warn(`[main] WARNING: static source dir missing: ${staticSrcDir}`);
    return;
  }
  console.log(`[main] Copying static assets ${staticSrcDir} -> ${staticDestDir}`);
  fs.cpSync(staticSrcDir, staticDestDir, { recursive: true });
}

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not become ready (last status ${res.statusCode})`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Server did not become ready (connection refused / timeout)"));
        } else {
          setTimeout(attempt, 300);
        }
      });
    }
    attempt();
  });
}

function startServer() {
  const { serverDir, staticSrcDir, templateDbPath } = resolvePaths();

  ensureStaticAssets(serverDir, staticSrcDir);
  const dbPath = ensureDatabase(templateDbPath);
  const authSecret = ensureAuthSecret();

  const serverJsPath = path.join(serverDir, "server.js");
  if (!fs.existsSync(serverJsPath)) {
    throw new Error(`server.js not found at ${serverJsPath}`);
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME,
    DATABASE_URL: "file:" + dbPath.replace(/\\/g, "/"),
    AUTH_SECRET: authSecret,
    VLM_PROVIDER: "mock",
    LLM_PROVIDER: "mock",
    STT_PROVIDER: "browser",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  console.log(`[main] Starting standalone server from ${serverJsPath}`);
  child = utilityProcess.fork(serverJsPath, [], {
    cwd: serverDir,
    env,
    stdio: "pipe",
  });

  child.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[server:err] ${d}`));

  child.on("exit", (code) => {
    console.log(`[main] Server child exited with code ${code}`);
    child = null;
  });

  return waitForServer(`${APP_URL}/login`, 30000);
}

function killChild() {
  if (child) {
    try {
      child.kill();
    } catch (e) {
      console.warn("[main] Failed to kill child process:", e);
    }
    child = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0A0B0D",
    title: "Clever Dictate",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ["media", "display-capture", "clipboard-sanitized-write"];
    callback(allowed.includes(permission));
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupPermissions();
    try {
      await startServer();
      createWindow();
    } catch (err) {
      console.error("[main] Failed to start server:", err);
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    killChild();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    killChild();
  });
}
