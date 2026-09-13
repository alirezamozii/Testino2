const { app, BrowserWindow, protocol, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

// Single-instance: a second instance used to lose the OPFS web lock and run
// in volatile MEMORY mode (all writes silently lost on close). Focus the
// existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
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
      win.focus();
    }
  });
}

// OS-level handler for app.testino.mobile:// — after Google consent the
// system browser redirects here; the OS re-opens (or focuses) the app.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("app.testino.mobile", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("app.testino.mobile");
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

// 1. Register privileged secure scheme so OPFS, Web Workers, and Web Locks operate properly
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

function createWindow() {
  const isPackaged = app.isPackaged;
  const appRoot = isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  const outDir = path.join(appRoot, "out");

  const iconPath = path.join(appRoot, "public", "icon-512.png");

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: "تستینو | Testino",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
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

  const initialOAuthUrl = process.argv.find((a) => typeof a === "string" && a.startsWith("app.testino.mobile://"));
  if (initialOAuthUrl) {
    routeOAuthCallback(mainWindow, initialOAuthUrl);
  } else {
    mainWindow.loadURL("app://localhost/");
  }
}

app.whenReady().then(() => {
  const isPackaged = app.isPackaged;
  const appRoot = isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  const outDir = path.join(appRoot, "out");

  // Handle app:// scheme
  protocol.handle("app", (request) => {
    try {
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
