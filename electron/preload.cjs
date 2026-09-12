const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("testinoDesktop", {
  isElectron: true,
  platform: process.platform,
});
