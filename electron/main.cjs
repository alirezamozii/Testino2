const { app, BrowserWindow, protocol, net, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

function debugLog(...args) {
  try {
    const logPath = path.join(app.getPath("userData"), "main-debug.log");
    const msg = `[${new Date().toISOString()}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")}\n`;
    fs.appendFileSync(logPath, msg, "utf8");
  } catch {}
}

debugLog("App started. argv:", process.argv, "isPackaged:", app.isPackaged);

process.on("uncaughtException", (err) => {
  debugLog("UNCAUGHT EXCEPTION:", err ? err.stack || err.message : err);
});

ipcMain.on("open-external", (_event, targetUrl) => {
  if (typeof targetUrl === "string" && /^https?:\/\//i.test(targetUrl)) {
    shell.openExternal(targetUrl);
  }
});

// Single-instance: a second instance used to lose the OPFS web lock and run
// in volatile MEMORY mode (all writes silently lost on close). Focus the
// existing window instead.
if (!app.requestSingleInstanceLock()) {
  debugLog("Failed to acquire single instance lock! Quitting.");
  app.quit();
} else {
  debugLog("Acquired single instance lock.");
  app.on("second-instance", (_event, argv) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      // Google OAuth return path: the system browser hands the PKCE code
      // back via the custom scheme, which re-launches the app with the URL
      // in argv. Route it into the SPA so supabase-js completes the exchange.
      const oauthUrl = argv.find((a) => typeof a === "string" && a.startsWith("app.testino.mobile://"));
      if (oauthUrl) {
        routeOAuthCallback(win, oauthUrl);
        return;
      }
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

debugLog("Setting default protocol client...");
try {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("app.testino.mobile", process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient("app.testino.mobile");
  }
  debugLog("Default protocol client set.");
} catch (e) {
  debugLog("Error setting default protocol client:", e);
}

function routeOAuthCallback(win, rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const searchOrHash = (parsed.search || "") + (parsed.hash || "");
    if (win.isMinimized()) win.restore();
    win.focus();
    win.loadURL(`app://localhost/auth/callback${searchOrHash}`);
  } catch (err) {
    console.error("OAuth callback routing failed:", err);
  }
}

debugLog("Registering schemes as privileged...");
try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        standard: true,
        secure: true,
        allowServiceWorkers: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
  debugLog("Registered schemes as privileged.");
} catch (e) {
  debugLog("Error registering schemes:", e);
}

function createWindow() {
  debugLog("createWindow called.");
  const isPackaged = app.isPackaged;
  const appRoot = isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  const outDir = path.join(appRoot, "out");
  debugLog("appRoot:", appRoot, "outDir:", outDir, "outDirExists:", fs.existsSync(outDir));

  const iconPath = path.join(appRoot, "public", "icon-512.png");

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: "تستینو | Testino",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    debugLog("mainWindow 'ready-to-show' event fired.");
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    debugLog(`[Renderer Console level=${level} line=${line} source=${sourceId}]: ${message}`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    debugLog("Renderer did-fail-load:", errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    debugLog("render-process-gone:", details);
  });

  // Window policy: Google OAuth frequently REJECTS embedded Electron
  // user-agents ("This browser or app may not be secure"), and any http(s)
  // window.open used to spawn unmanaged child windows that stranded the
  // user. Send all external http(s) links to the SYSTEM browser instead;
  // app:// stays inside the shell.
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (/^https?:\/\//i.test(targetUrl)) {
      shell.openExternal(targetUrl);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Guard against top-level navigations away from the app scheme.
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith("app://")) {
      event.preventDefault();
      if (/^https?:\/\//i.test(targetUrl)) shell.openExternal(targetUrl);
    }
  });

  mainWindow.on("close", () => {
    debugLog("mainWindow 'close' event fired.");
  });

  mainWindow.on("closed", () => {
    debugLog("mainWindow 'closed' event fired. Calling app.quit().");
    app.quit();
  });

  mainWindow.webContents.on("dom-ready", () => {
    debugLog("mainWindow webContents 'dom-ready' fired.");
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("crashed", (_event, killed) => {
    debugLog("mainWindow webContents 'crashed':", killed);
  });

  const initialOAuthUrl = process.argv.find((a) => typeof a === "string" && a.startsWith("app.testino.mobile://"));
  if (initialOAuthUrl) {
    debugLog("Loading initial OAuth URL:", initialOAuthUrl);
    routeOAuthCallback(mainWindow, initialOAuthUrl);
  } else {
    debugLog("Loading app://localhost/");
    mainWindow.loadURL("app://localhost/").catch(err => {
      debugLog("mainWindow.loadURL failed:", err);
    });
  }
}

app.whenReady().then(() => {
  debugLog("app.whenReady triggered.");
  const isPackaged = app.isPackaged;
  const appRoot = isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  const outDir = path.join(appRoot, "out");

  // Handle app:// scheme
  protocol.handle("app", (request) => {
    try {
      debugLog("protocol.handle serving URL:", request.url);
      const parsed = new URL(request.url);
      let relativePath = decodeURIComponent(parsed.pathname);
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.slice(1);
      }
      if (!relativePath || relativePath === "") {
        relativePath = "index.html";
      }

      let targetPath = path.join(outDir, relativePath);

      if (fs.existsSync(targetPath)) {
        if (fs.statSync(targetPath).isDirectory()) {
          targetPath = path.join(targetPath, "index.html");
        }
      } else {
        if (fs.existsSync(targetPath + ".html")) {
          targetPath = targetPath + ".html";
        } else if (fs.existsSync(path.join(targetPath, "index.html"))) {
          targetPath = path.join(targetPath, "index.html");
        } else {
          // Fallback to index.html for client-side routing
          targetPath = path.join(outDir, "index.html");
        }
      }

      return net.fetch(url.pathToFileURL(targetPath).toString());
    } catch (err) {
      console.error("Error serving app:// resource:", err);
      return new Response("Not Found", { status: 404 });
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  debugLog("window-all-closed fired.");
  if (process.platform !== "darwin") {
    app.quit();
  }
});
