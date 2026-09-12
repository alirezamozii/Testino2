const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

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

  mainWindow.loadURL("app://localhost/");
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
