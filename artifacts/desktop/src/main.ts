import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { setupNfc } from "./nfc";

const isDev = process.env["NODE_ENV"] !== "production";

// When start.bat sets ELECTRON_USE_BUILT_RENDERER=1, load from the locally
// built files served by Express rather than the Vite dev server.
const useBuiltRenderer =
  !app.isPackaged &&
  process.env["ELECTRON_USE_BUILT_RENDERER"] === "1";

// Treat packaged builds and "built renderer" runs the same way: serve via Express.
const serveFromExpress = app.isPackaged || useBuiltRenderer;

// Port the Express API server will listen on inside Electron.
// Defaults to 8082 to avoid clashing with the Replit dev workflow (8080).
const API_PORT = Number(process.env["ELECTRON_API_PORT"] ?? 8082);
// Port the Vite dev server is expected on (only used in pure dev mode).
const VITE_PORT = Number(process.env["ELECTRON_VITE_PORT"] ?? 18666);

let apiProcess: ChildProcess | null = null;
let win: BrowserWindow | null = null;

// ── Path helpers ──────────────────────────────────────────────────────────────

function apiServerEntryPath(): string {
  if (!isDev && process.resourcesPath) {
    return path.join(process.resourcesPath, "api-server", "index.mjs");
  }
  // Dev: path relative to this file once compiled to dist/
  return path.resolve(__dirname, "../../api-server/dist/index.mjs");
}

function rendererDistPath(): string {
  if (!isDev && process.resourcesPath) {
    return path.join(process.resourcesPath, "renderer");
  }
  return path.resolve(__dirname, "../../pokevault/dist/public");
}

// ── API server child-process ──────────────────────────────────────────────────

function startApiServer(): void {
  const entry = apiServerEntryPath();
  apiProcess = spawn("node", ["--enable-source-maps", entry], {
    env: {
      ...process.env,
      PORT: String(API_PORT),
      NODE_ENV: "production",
      ELECTRON: "1",
      RENDERER_PATH: rendererDistPath(),
    },
    stdio: isDev ? "inherit" : ["ignore", "ignore", "pipe"],
  });

  apiProcess.on("error", (err: Error) => {
    console.error("[desktop] Failed to start API server:", err.message);
  });

  apiProcess.on("exit", (code: number | null) => {
    if (code !== 0 && code !== null) {
      console.error("[desktop] API server exited with code", code);
    }
  });
}

async function pollUntilReady(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (r.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  // Don't throw — just proceed; the window will show an error page if truly broken
}

// ── Window creation ───────────────────────────────────────────────────────────

async function createWindow(): Promise<void> {
  // Tell the preload which port to advertise as the API base URL
  process.env["ELECTRON_API_PORT"] = String(API_PORT);

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
    title: "PokeVault",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // External links open in the system browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });

  if (serveFromExpress) {
    // Packaged app OR start.bat "built renderer" mode:
    // spin up the Express server which also serves the built React files.
    startApiServer();
    await pollUntilReady(`http://localhost:${API_PORT}/api/health`);
    await win.loadURL(`http://localhost:${API_PORT}`);
  } else {
    // Pure dev mode: Vite dev server and API server are already running
    // (Replit workflows or started manually in separate terminals).
    await pollUntilReady(`http://localhost:${VITE_PORT}`, 30_000);
    await win.loadURL(`http://localhost:${VITE_PORT}`);
    if (process.env["ELECTRON_DEVTOOLS"] === "1") {
      win.webContents.openDevTools();
    }
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  setupNfc(ipcMain, () => win);
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  apiProcess?.kill("SIGTERM");
});
