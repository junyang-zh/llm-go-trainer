const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('goTrainerUpdates', {
  status: () => ipcRenderer.invoke('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  automatic: (value) => ipcRenderer.invoke('updates:automatic', value),
  openRelease: () => ipcRenderer.invoke('updates:open-release'),
});
