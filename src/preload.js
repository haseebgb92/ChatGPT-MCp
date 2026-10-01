const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  startLocal: () => ipcRenderer.invoke('local:start'),
  stopLocal: () => ipcRenderer.invoke('local:stop'),
  startBrowser: () => ipcRenderer.invoke('browser:start'),
  stopBrowser: () => ipcRenderer.invoke('browser:stop'),
  restartAll: () => ipcRenderer.invoke('servers:restart-all'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onState: (cb) => ipcRenderer.on('state:update', (_e, state) => cb(state)),
  onLog: (cb) => ipcRenderer.on('log:update', (_e, line) => cb(line))
});
