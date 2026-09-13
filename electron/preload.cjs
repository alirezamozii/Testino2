const { contextBridge, shell } = require("electron");

contextBridge.exposeInMainWorld("testinoDesktop", {
  isElectron: true,
  platform: process.platform,
  openExternal: (url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  },
});
