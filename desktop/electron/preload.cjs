const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localReplay', {
  request: (method, args = {}) => ipcRenderer.invoke('local-replay', method, args),
});
