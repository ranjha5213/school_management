const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("schoolLicense", {
  activate: (key) => ipcRenderer.invoke("license:activate", key),
  getStatus: () => ipcRenderer.invoke("license:status"),
});

