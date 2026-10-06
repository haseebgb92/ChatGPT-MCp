const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  listMountedDrives: () => ipcRenderer.invoke('drives:list'),
  inspectFolder: (folderPath) => ipcRenderer.invoke('folder:inspect', folderPath),
  startLocal: () => ipcRenderer.invoke('local:start'),
  stopLocal: () => ipcRenderer.invoke('local:stop'),
  startBrowser: () => ipcRenderer.invoke('browser:start'),
  stopBrowser: () => ipcRenderer.invoke('browser:stop'),
  restartAll: () => ipcRenderer.invoke('servers:restart-all'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onState: (cb) => ipcRenderer.on('state:update', (_e, state) => cb(state)),
  onLog: (cb) => ipcRenderer.on('log:update', (_e, line) => cb(line)),
  onUpdateState: (cb) => ipcRenderer.on('update:state', (_e, state) => cb(state))
});
