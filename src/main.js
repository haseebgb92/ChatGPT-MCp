const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, safeStorage } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { checkForUpdate, downloadAndVerify, installUpdate } = require('./updater');

const stableUserData = path.join(app.getPath('appData'), 'chatgpt-mcp-bridge');
app.setPath('userData', stableUserData);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.setName('ChatGPT MCP Bridge');
app.setAppUserModelId('com.advertpreneur.mcpbridge');


let win = null;
let tray = null;
let quitting = false;
let localProcess = null;
let browserProcess = null;
let sessionApiKey = '';
let logs = [];
let updateCheckTimer = null;
let updateInitialTimer = null;
let updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  available: false,
  progress: null,
  message: 'Updates have not been checked yet.',
  info: null,
  downloadedInstaller: null
};

const defaultSettings = {
  localTunnelId: '',
  browserTunnelId: '',
  rememberApiKey: true,
  roots: [],
  enableWrite: true,
  enableShell: true,
  fullShell: false,
  browserVision: true,
  browserUsageStatistics: false,
  startLocalOnLaunch: false,
  startBrowserOnLaunch: false,
  startAtLogin: false,
  customTunnelClient: '',
  automaticUpdateChecks: true
};

function configPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function keyPath() { return path.join(app.getPath('userData'), 'runtime-key.bin'); }
function rootsPath() { return path.join(app.getPath('userData'), 'local-roots.json'); }
function localPidPath() { return path.join(app.getPath('userData'), 'local-tunnel.pid'); }
function localLogPath() { return path.join(app.getPath('userData'), 'local-tunnel.log'); }

function readLocalPid() {
  if (process.platform !== 'linux') return 0;
  try {
    const pid = Number(fs.readFileSync(localPidPath(), 'utf8').trim());
    return Number.isInteger(pid) && pid > 1 ? pid : 0;
  } catch {
    return 0;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLocalRunning() {
  if (process.platform !== 'linux') return isRunning(localProcess);
  const pid = readLocalPid();
  if (pidAlive(pid)) return true;
  try { fs.unlinkSync(localPidPath()); } catch {}
  return false;
}

async function loadSettings() {
  try {
    const raw = await fsp.readFile(configPath(), 'utf8');
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch { return { ...defaultSettings }; }
}

async function loadSavedApiKey() {
  if (sessionApiKey) return sessionApiKey;
  try {
    const encrypted = await fsp.readFile(keyPath());
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(encrypted);
  } catch { return ''; }
}

async function storeApiKey(key, remember) {
  sessionApiKey = key || '';
  if (!remember || !key) {
    try { await fsp.unlink(keyPath()); } catch {}
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS credential encryption is not available. Disable “Remember API key” or enable your system keyring.');
  await fsp.writeFile(keyPath(), safeStorage.encryptString(key), { mode: 0o600 });
}

function redact(text) {
  return String(text || '').replace(/sk-[A-Za-z0-9_\-]{10,}/g, 'sk-***');
}

function addLog(source, data) {
  const line = `[${new Date().toLocaleTimeString()}] [${source}] ${redact(String(data).trimEnd())}`;
  logs.push(line);
  if (logs.length > 800) logs = logs.slice(-800);
  win?.webContents.send('log:update', line);
}

function isRunning(child) { return Boolean(child && child.exitCode === null && !child.killed); }

async function getPublicState() {
  const settings = await loadSettings();
  const apiKey = await loadSavedApiKey();
  return {
    settings: { ...settings, apiKey: apiKey ? '********' : '' },
    hasApiKey: Boolean(apiKey),
    localRunning: isLocalRunning(),
    browserRunning: isRunning(browserProcess),
    logs: logs.slice(-200),
    tunnelClientPath: resolveTunnelClient(false) || '',
    platform: process.platform,
    appVersion: app.getVersion(),
    update: updateState
  };
}


function emitUpdateState() {
  win?.webContents.send('update:state', updateState);
  broadcastState();
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  emitUpdateState();
}

async function performUpdateCheck({ silent = false } = {}) {
  if (updateState.status === 'checking' || updateState.status === 'downloading' || updateState.status === 'installing') {
    return updateState;
  }
  setUpdateState({
    status: 'checking',
    currentVersion: app.getVersion(),
    progress: null,
    message: silent ? 'Checking for updates…' : 'Checking GitHub Releases…'
  });
  try {
    const info = await checkForUpdate(app.getVersion(), process.platform, process.arch);
    if (info.available) {
      setUpdateState({
        status: 'available',
        latestVersion: info.latestVersion,
        available: true,
        info,
        downloadedInstaller: null,
        message: `MCP Bridge ${info.latestVersion} is available.`
      });
    } else {
      setUpdateState({
        status: 'up-to-date',
        latestVersion: info.latestVersion || app.getVersion(),
        available: false,
        info,
        progress: null,
        message: `MCP Bridge ${app.getVersion()} is up to date.`
      });
    }
  } catch (error) {
    setUpdateState({
      status: 'error',
      progress: null,
      message: `Update check failed: ${error.message}`
    });
  }
  return updateState;
}

async function performUpdateDownload() {
  const info = updateState.info;
  if (!info?.available) throw new Error('No update is currently available.');
  if (!info.asset) throw new Error('No compatible installer was published for this operating system.');
  setUpdateState({
    status: 'downloading',
    progress: { received: 0, total: info.asset.size || 0, percent: 0 },
    message: `Downloading ${info.asset.name}…`
  });

  try {
    const updatesDir = path.join(app.getPath('userData'), 'updates');
    const result = await downloadAndVerify(info, updatesDir, progress => {
      updateState = {
        ...updateState,
        status: 'downloading',
        progress,
        message: progress.percent == null
          ? 'Downloading update…'
          : `Downloading update… ${progress.percent}%`
      };
      win?.webContents.send('update:state', updateState);
    });
    setUpdateState({
      status: 'ready',
      progress: { ...updateState.progress, percent: 100 },
      downloadedInstaller: result.installerPath,
      message: `Update ${info.latestVersion} is downloaded and verified.`
    });
  } catch (error) {
    setUpdateState({
      status: 'error',
      progress: null,
      downloadedInstaller: null,
      message: `Update download failed: ${error.message}`
    });
  }
  return updateState;
}

async function performUpdateInstall() {
  if (!updateState.downloadedInstaller) throw new Error('Download the update first.');
  setUpdateState({ status: 'installing', message: 'Launching the verified installer…' });
  try {
    installUpdate(process.platform, updateState.downloadedInstaller);
    addLog('updater', `Launching update installer for ${updateState.latestVersion || 'new version'}.`);
    setTimeout(() => {
      quitting = true;
      app.quit();
    }, 700);
    return { ok: true };
  } catch (error) {
    setUpdateState({ status: 'error', message: `Could not launch installer: ${error.message}` });
    throw error;
  }
}

function scheduleUpdateChecks() {
  if (updateInitialTimer) {
    clearTimeout(updateInitialTimer);
    updateInitialTimer = null;
  }
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  loadSettings().then(settings => {
    if (!settings.automaticUpdateChecks) return;
    updateInitialTimer = setTimeout(() => {
      updateInitialTimer = null;
      performUpdateCheck({ silent: true });
    }, 15000);
    updateCheckTimer = setInterval(() => performUpdateCheck({ silent: true }), 6 * 60 * 60 * 1000);
  }).catch(() => {});
}

async function broadcastState() {
  win?.webContents.send('state:update', await getPublicState());
  refreshTrayMenu();
}

function resolveTunnelClient(logFailure = true) {
  const candidates = [];
  try {
    const settings = fs.existsSync(configPath()) ? JSON.parse(fs.readFileSync(configPath(), 'utf8')) : {};
    if (settings.customTunnelClient) candidates.push(settings.customTunnelClient);
  } catch {}

  const exe = process.platform === 'win32' ? 'tunnel-client.exe' : 'tunnel-client';
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'tunnel-client', exe));
  candidates.push(path.join(app.getAppPath(), 'vendor', 'tunnel-client', exe));

  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  const which = process.platform === 'win32'
    ? spawnSync('where', ['tunnel-client'], { encoding: 'utf8' })
    : spawnSync('which', ['tunnel-client'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim().split(/\r?\n/)[0];
  if (logFailure) addLog('app', 'tunnel-client not found. Install/build it or choose a custom tunnel-client executable in Settings.');
  return '';
}

function quoteCommandArg(value) {
  let s = String(value);
  // tunnel-client tokenizes mcp.command using POSIX-style escaping even on Windows.
  // Raw backslashes in paths such as C:\\Program Files\\... are therefore
  // consumed as escape characters. Forward slashes are valid Windows path
  // separators and survive the tokenizer.
  if (process.platform === 'win32') {
    s = s.replace(/\\/g, '/');
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

async function writeRootsConfig(settings) {
  const roots = {};
  for (const item of settings.roots || []) {
    if (!item?.path) continue;
    let realPath;
    try {
      realPath = await fsp.realpath(item.path);
      await fsp.access(realPath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Folder is not accessible: ${item.path}. Check that the drive is mounted and your user has permission.`);
    }
    const name = String(item.name || path.basename(realPath) || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
    roots[name] = { path: realPath, mode: item.mode === 'read-only' ? 'read-only' : 'read-write' };
  }
  if (!Object.keys(roots).length) throw new Error('Add at least one local folder first.');
  await fsp.writeFile(rootsPath(), JSON.stringify({ roots }, null, 2), { mode: 0o600 });
  return rootsPath();
}


function parseLsblkMounts() {
  if (process.platform !== 'linux') return [];
  const result = spawnSync('lsblk', ['--json', '--bytes', '--output', 'NAME,LABEL,UUID,SIZE,FSTYPE,TYPE,MOUNTPOINTS'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0 || !result.stdout) return [];
  try {
    const data = JSON.parse(result.stdout);
    const found = [];
    const walk = (items = []) => {
      for (const item of items) {
        const mounts = Array.isArray(item.mountpoints) ? item.mountpoints.filter(Boolean) : [];
        for (const mountPath of mounts) {
          if (!/^\/(mnt|media|run\/media)(\/|$)/.test(mountPath)) continue;
          found.push({
            id: item.uuid || item.name || mountPath,
            name: item.label || item.name || path.basename(mountPath),
            label: item.label || '',
            uuid: item.uuid || '',
            path: mountPath,
            size: Number(item.size || 0),
            filesystem: item.fstype || '',
            type: item.type || ''
          });
        }
        if (Array.isArray(item.children)) walk(item.children);
      }
    };
    walk(data.blockdevices || []);
    return found;
  } catch {
    return [];
  }
}

async function discoverMountedDrives() {
  const candidates = parseLsblkMounts();
  const unique = new Map();
  for (const item of candidates) {
    try {
      const realPath = await fsp.realpath(item.path);
      await fsp.access(realPath, fs.constants.R_OK);
      const stat = await fsp.stat(realPath);
      if (!stat.isDirectory()) continue;
      unique.set(realPath, { ...item, path: realPath, accessible: true });
    } catch {
      unique.set(item.path, { ...item, accessible: false });
    }
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function inspectFolder(folderPath) {
  const realPath = await fsp.realpath(folderPath);
  await fsp.access(realPath, fs.constants.R_OK);
  const stat = await fsp.stat(realPath);
  if (!stat.isDirectory()) throw new Error('Selected path is not a folder.');
  let writable = true;
  try { await fsp.access(realPath, fs.constants.W_OK); } catch { writable = false; }
  return { path: realPath, readable: true, writable };
}

function resolveNodeRuntime() {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const candidates = [];
  if (app.isPackaged) candidates.push(path.join(process.resourcesPath, 'node-runtime', exe));
  candidates.push(path.join(app.getAppPath(), 'vendor', 'node-runtime', exe));

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }

  const which = process.platform === 'win32'
    ? spawnSync('where', ['node'], { encoding: 'utf8' })
    : spawnSync('which', ['node'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim().split(/\r?\n/)[0];

  throw new Error('Bundled Node runtime is missing.');
}

async function buildLocalCommand(settings) {
  await writeRootsConfig(settings);
  const nodeRuntime = resolveNodeRuntime();
  const serverPath = path.join(app.getAppPath(), 'bundled', 'local-mcp', 'server.js');
  return `${quoteCommandArg(nodeRuntime)} ${quoteCommandArg(serverPath)}`;
}

function buildBrowserCommand(settings) {
  const nodeRuntime = resolveNodeRuntime();
  const chromeScript = path.join(app.getAppPath(), 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js');
  const flags = ['--autoConnect'];
  if (settings.browserVision) flags.push('--experimentalVision');
  if (!settings.browserUsageStatistics) flags.push('--no-usage-statistics');
  return `${quoteCommandArg(nodeRuntime)} ${quoteCommandArg(chromeScript)} ${flags.join(' ')}`;
}

async function startTunnel(kind) {
  const settings = await loadSettings();
  const apiKey = await loadSavedApiKey();
  if (!apiKey) throw new Error('Runtime API key is missing. Add it in Settings.');

  const tunnelId = kind === 'local' ? settings.localTunnelId : settings.browserTunnelId;
  if (!/^tunnel_[0-9a-f]{32}$/.test(tunnelId || '')) throw new Error(`${kind === 'local' ? 'Local' : 'Web'} tunnel ID is missing or invalid.`);
  if (settings.localTunnelId && settings.browserTunnelId && settings.localTunnelId === settings.browserTunnelId) {
    throw new Error('Local and Web must use different tunnel IDs if both servers will run simultaneously.');
  }
  if (kind === 'local' && isLocalRunning()) return;
  if (kind === 'browser' && isRunning(browserProcess)) return;

  const tunnelClient = resolveTunnelClient();
  if (!tunnelClient) throw new Error('tunnel-client executable not found.');

  const mcpCommand = kind === 'local'
    ? await buildLocalCommand(settings)
    : buildBrowserCommand(settings);

  const env = {
    ...process.env,
    CONTROL_PLANE_API_KEY: apiKey,
    CONTROL_PLANE_TUNNEL_ID: tunnelId,
    MCP_COMMAND: mcpCommand,
    LOCAL_FOLDER_MCP_CONFIG: rootsPath(),
    ENABLE_WRITE: settings.enableWrite ? 'true' : 'false',
    ENABLE_SHELL: settings.enableShell ? 'true' : 'false',
    FULL_SHELL: settings.fullShell ? 'true' : 'false',
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: settings.browserUsageStatistics ? '0' : '1'
  };

  const args = [
    'run',
    '--control-plane.tunnel-id', tunnelId,
    '--mcp.command', mcpCommand,
    '--health.listen-addr', '127.0.0.1:0'
  ];

  if (kind === 'local' && process.platform === 'linux') {
    await fsp.mkdir(app.getPath('userData'), { recursive: true });
    const logFd = fs.openSync(localLogPath(), 'a', 0o600);
    const child = spawn(tunnelClient, args, {
      env,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd]
    });
    fs.closeSync(logFd);
    child.unref();
    await fsp.writeFile(localPidPath(), String(child.pid), { mode: 0o600 });
    localProcess = null;
    addLog(kind, `Starting independent Linux tunnel ${tunnelId} (pid=${child.pid}).`);
    addLog(kind, `Tunnel log: ${localLogPath()}`);
    setTimeout(() => {
      if (!pidAlive(child.pid)) {
        try { fs.unlinkSync(localPidPath()); } catch {}
        addLog(kind, 'Linux Local MCP tunnel exited during startup. Check the tunnel log.');
      } else {
        addLog(kind, 'Linux Local MCP tunnel is running independently.');
      }
      broadcastState();
    }, 1500);
    await broadcastState();
    return;
  }

  const child = spawn(tunnelClient, args, {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (kind === 'local') localProcess = child;
  else browserProcess = child;

  addLog(kind, `Starting tunnel ${tunnelId}...`);
  child.stdout.on('data', d => addLog(kind, d));
  child.stderr.on('data', d => addLog(kind, d));
  child.on('error', e => addLog(kind, `ERROR: ${e.message}`));
  child.on('close', (code, signal) => {
    addLog(kind, `Stopped (code=${code}, signal=${signal || 'none'}).`);
    if (kind === 'local') localProcess = null;
    else browserProcess = null;
    broadcastState();
  });

  await broadcastState();
}

async function stopTunnel(kind) {
  if (kind === 'local' && process.platform === 'linux') {
    const pid = readLocalPid();
    if (!pidAlive(pid)) {
      try { await fsp.unlink(localPidPath()); } catch {}
      return;
    }
    addLog(kind, `Stopping independent Linux tunnel (pid=${pid})...`);
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    try { await fsp.unlink(localPidPath()); } catch {}
    await broadcastState();
    return;
  }

  const child = kind === 'local' ? localProcess : browserProcess;
  if (!isRunning(child)) return;
  addLog(kind, 'Stopping...');
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

async function restartAll() {
  const settings = await loadSettings();
  const localWas = isLocalRunning();
  const browserWas = isRunning(browserProcess);
  await stopTunnel('local');
  await stopTunnel('browser');
  await new Promise(r => setTimeout(r, 800));
  if (localWas || settings.startLocalOnLaunch) await startTunnel('local');
  if (browserWas || settings.startBrowserOnLaunch) await startTunnel('browser');
}

function refreshTrayMenu() {
  if (!tray) return;
  const localOn = isLocalRunning();
  const webOn = isRunning(browserProcess);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open MCP Bridge', click: showWindow },
    { type: 'separator' },
    { label: localOn ? 'Stop Local MCP' : 'Start Local MCP', click: () => localOn ? stopTunnel('local') : startTunnel('local').catch(e => addLog('local', e.message)) },
    { label: webOn ? 'Stop Web MCP' : 'Start Web MCP', click: () => webOn ? stopTunnel('browser') : startTunnel('browser').catch(e => addLog('browser', e.message)) },
    { label: 'Restart running services', enabled: localOn || webOn, click: () => restartAll().catch(e => addLog('app', e.message)) },
    { type: 'separator' },
    {
      label: updateState.available
        ? `Update to ${updateState.latestVersion}`
        : 'Check for updates',
      click: () => {
        showWindow();
        performUpdateCheck().catch(e => addLog('updater', e.message));
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}

function showWindow() {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    show: false,
    title: 'MCP Bridge',
    icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    if (!quitting) {
      e.preventDefault();
      win.minimize();
    }
  });
  win.once('ready-to-show', () => win.show());
}

function createTray() {
  const trayPath = path.join(
    app.getAppPath(),
    'assets',
    process.platform === 'win32' ? 'tray.ico' : 'tray.png'
  );
  tray = new Tray(nativeImage.createFromPath(trayPath));
  tray.setToolTip('ChatGPT MCP Bridge');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  refreshTrayMenu();
}

ipcMain.handle('state:get', getPublicState);

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return inspectFolder(result.filePaths[0]);
});
ipcMain.handle('drives:list', async () => discoverMountedDrives());
ipcMain.handle('folder:inspect', async (_e, folderPath) => inspectFolder(folderPath));

ipcMain.handle('settings:save', async (_e, incoming) => {
  const existing = await loadSettings();
  const settings = { ...existing, ...incoming };
  const apiKey =
    incoming.apiKey && incoming.apiKey !== '********'
      ? incoming.apiKey.trim()
      : await loadSavedApiKey();

  delete settings.apiKey;

  if (
    settings.localTunnelId &&
    settings.browserTunnelId &&
    settings.localTunnelId === settings.browserTunnelId
  ) {
    throw new Error('Use a different tunnel ID for Local MCP and Web MCP.');
  }

  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(configPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
  await storeApiKey(apiKey, settings.rememberApiKey);

  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.startAtLogin),
    args: ['--hidden']
  });

  addLog('app', 'Settings saved.');
  scheduleUpdateChecks();
  await broadcastState();
  return { ok: true };
});

ipcMain.handle('local:start', async () => {
  await startTunnel('local');
  return { ok: true };
});
ipcMain.handle('local:stop', async () => {
  await stopTunnel('local');
  return { ok: true };
});
ipcMain.handle('browser:start', async () => {
  await startTunnel('browser');
  return { ok: true };
});
ipcMain.handle('browser:stop', async () => {
  await stopTunnel('browser');
  return { ok: true };
});
ipcMain.handle('servers:restart-all', async () => {
  await restartAll();
  return { ok: true };
});
ipcMain.handle('update:check', async () => performUpdateCheck());
ipcMain.handle('update:download', async () => performUpdateDownload());
ipcMain.handle('update:install', async () => performUpdateInstall());
ipcMain.handle('update:get-state', async () => updateState);

ipcMain.handle('open:external', async (_e, url) => {
  if (/^https:\/\//i.test(url)) await shell.openExternal(url);
});

app.whenReady().then(async () => {
  await createWindow();
  createTray();

  const settings = await loadSettings();
  if (process.argv.includes('--hidden')) {
    win.hide();
  } else {
    showWindow();
  }
  if (settings.startLocalOnLaunch) {
    startTunnel('local').catch(e => addLog('local', e.message));
  }
  if (settings.startBrowserOnLaunch) {
    startTunnel('browser').catch(e => addLog('browser', e.message));
  }
  scheduleUpdateChecks();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  quitting = true;
  if (updateInitialTimer) clearTimeout(updateInitialTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (process.platform !== 'linux') stopTunnel('local');
  stopTunnel('browser');
});
