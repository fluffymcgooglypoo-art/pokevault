import { app, BrowserWindow, ipcMain, shell, utilityProcess, Menu } from "electron";
import type { UtilityProcess } from "electron";
import path from "path";
import fs from "fs";
import { setupNfc } from "./nfc";

// Remove the default File/Edit/View/Window/Help menu bar
Menu.setApplicationMenu(null);

const isDev = process.env["NODE_ENV"] !== "production";
const useBuiltRenderer = !app.isPackaged && process.env["ELECTRON_USE_BUILT_RENDERER"] === "1";
const serveFromExpress = app.isPackaged || useBuiltRenderer;

const API_PORT = Number(process.env["ELECTRON_API_PORT"] ?? 8082);
const VITE_PORT = Number(process.env["ELECTRON_VITE_PORT"] ?? 18666);

let apiProcess: UtilityProcess | null = null;
let win: BrowserWindow | null = null;

// ── Config (persisted DATABASE_URL) ──────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath("userData"), "pokevault-config.json");

interface Config { databaseUrl?: string; }

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Config;
    }
  } catch { /* ignore */ }
  return {};
}

function saveConfig(cfg: Config): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

function getDatabaseUrl(): string | undefined {
  if (process.env["DATABASE_URL"]) return process.env["DATABASE_URL"];
  const cfg = loadConfig();
  return cfg.databaseUrl;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function apiServerEntryPath(): string {
  if (app.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, "api-server", "index.mjs");
  }
  return path.resolve(__dirname, "../../api-server/dist/index.mjs");
}

function rendererDistPath(): string {
  if (app.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, "renderer");
  }
  return path.resolve(__dirname, "../../pokevault/dist/public");
}

function setupPagePath(): string {
  // Packaged: dist/setup.html is bundled inside the asar
  return path.join(__dirname, "setup.html");
}

// ── API server ────────────────────────────────────────────────────────────────

function startApiServer(databaseUrl: string): void {
  const entry = apiServerEntryPath();
  apiProcess = utilityProcess.fork(entry, [], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      NODE_ENV: "production",
      ELECTRON: "1",
      DATABASE_URL: databaseUrl,
      RENDERER_PATH: rendererDistPath(),
    },
    stdio: isDev ? "inherit" : "pipe",
  });

  apiProcess.on("exit", (code: number) => {
    if (code !== 0) console.error("[desktop] API server exited with code", code);
  });
}

async function pollUntilReady(url: string, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (r.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// ── Window helpers ────────────────────────────────────────────────────────────

function makeWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
    title: "PokeVault",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}

// ── Setup flow ────────────────────────────────────────────────────────────────

async function showSetupWindow(): Promise<void> {
  win = makeWindow();
  win.on("closed", () => { win = null; });

  ipcMain.handleOnce("setup:save-database", async (_e, url: string) => {
    saveConfig({ databaseUrl: url });
    process.env["DATABASE_URL"] = url;
    // Restart into main app
    win?.close();
    await launchApp();
  });

  await win.loadFile(setupPagePath());
}

// ── Main app launch ───────────────────────────────────────────────────────────

async function launchApp(): Promise<void> {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    await showSetupWindow();
    return;
  }

  win = makeWindow();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => { win = null; });

  if (serveFromExpress) {
    startApiServer(dbUrl);
    const ready = await pollUntilReady(`http://localhost:${API_PORT}/api/health`);
    if (!ready) {
      // Server didn't come up — show a friendly error page
      await win.loadURL(
        `data:text/html,<html style="background:#0a0a0a;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Could not start PokeVault</h2><p style="color:#888;margin-top:1rem">The server failed to connect to the database.<br/>Check your DATABASE_URL and try again.</p><button onclick="location.reload()" style="margin-top:1.5rem;background:#00e5cc;color:#000;border:none;padding:.6rem 1.5rem;border-radius:5px;cursor:pointer;font-weight:700">Retry</button></div></html>`
      );
      return;
    }
    await win.loadURL(`http://localhost:${API_PORT}`);
  } else {
    await pollUntilReady(`http://localhost:${VITE_PORT}`, 30_000);
    await win.loadURL(`http://localhost:${VITE_PORT}`);
    if (process.env["ELECTRON_DEVTOOLS"] === "1") win.webContents.openDevTools();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupNfc(ipcMain, () => win);
  await launchApp();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await launchApp();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  apiProcess?.kill();
});
