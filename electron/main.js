const path = require("path");
const fs = require("fs");
const http = require("http");
const { app, BrowserWindow, ipcMain } = require("electron");
const { loadSavedLicense, saveLicenseKey } = require("./license");

let mainWindow = null;
let activationWindow = null;
let serverStarted = false;

function getDataDir() {
  return path.join(app.getPath("userData"), "school-data");
}

function resolveFrontendDist() {
  const candidates = [
    path.join(__dirname, "../frontend/dist"),
    path.join(process.resourcesPath || __dirname, "app.asar/frontend/dist"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host, port, path: "/api/health" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error("Timed out waiting for backend server."));
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

function startBackendOnce() {
  if (serverStarted) return Promise.resolve(process.env.PORT || "4000");

  const dataDir = getDataDir();
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const port = process.env.PORT || "4000";
  process.env.PORT = port;
  process.env.SCHOOL_DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dataDir, "school_management.db");
  process.env.BACKUP_DIR = backupDir;
  process.env.FRONTEND_DIST_DIR = resolveFrontendDist();

  // Adjust path if your backend entry is backend/server.js or backend/src/server.js
  require("../backend/server.js");
  serverStarted = true;
  return waitForPort(Number(port)).then(() => port);
}

async function openMainApp() {
  const port = await startBackendOnce();
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.close();
    activationWindow = null;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function openActivationScreen() {
  activationWindow = new BrowserWindow({
    width: 520,
    height: 360,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  activationWindow.loadFile(path.join(__dirname, "activation.html"));
}

ipcMain.handle("license:status", () => {
  return loadSavedLicense(getDataDir()) || { valid: false };
});

ipcMain.handle("license:activate", async (_event, key) => {
  const result = saveLicenseKey(getDataDir(), key);
  if (result.valid) {
    setTimeout(() => {
      openMainApp().catch(console.error);
    }, 600);
  }
  return result;
});

app.whenReady().then(() => {
  const saved = loadSavedLicense(getDataDir());
  if (saved && saved.valid) {
    openMainApp().catch(console.error);
  } else {
    openActivationScreen();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

