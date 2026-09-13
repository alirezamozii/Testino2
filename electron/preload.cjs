const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("testinoDesktop", {
  isElectron: true,
  platform: process.platform,
  openExternal: (url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      ipcRenderer.send("open-external", url);
    }
  },
});
