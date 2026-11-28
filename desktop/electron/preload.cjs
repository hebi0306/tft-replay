const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('appStorage', {
  getItem: key => ipcRenderer.sendSync('app-storage', key),
  setItem: (key, value) => ipcRenderer.sendSync('app-storage', key, value),
});
contextBridge.exposeInMainWorld('localReplay', {
  request: (method, args = {}) => ipcRenderer.invoke('local-replay', method, args),
});
