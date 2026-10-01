const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, nativeImage, safeStorage } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

let win = null;
let tray = null;
let quitting = false;
let localProcess = null;
let browserProcess = null;
let sessionApiKey = '';
let logs = [];

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
  customTunnelClient: ''
};

function configPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function keyPath() { return path.join(app.getPath('userData'), 'runtime-key.bin'); }
function rootsPath() { return path.join(app.getPath('userData'), 'local-roots.json'); }

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
    localRunning: isRunning(localProcess),
    browserRunning: isRunning(browserProcess),
    logs: logs.slice(-200),
    tunnelClientPath: resolveTunnelClient(false) || ''
  };
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
  const s = String(value);
  if (process.platform === 'win32') return `"${s.replace(/"/g, '\\"')}"`;
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

async function writeRootsConfig(settings) {
  const roots = {};
  for (const item of settings.roots || []) {
    if (!item?.path) continue;
    const name = String(item.name || path.basename(item.path) || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
    roots[name] = { path: item.path, mode: item.mode === 'read-only' ? 'read-only' : 'read-write' };
  }
  if (!Object.keys(roots).length) throw new Error('Add at least one local folder first.');
  await fsp.writeFile(rootsPath(), JSON.stringify({ roots }, null, 2), { mode: 0o600 });
  return rootsPath();
}

async function buildLocalCommand(settings) {
  await writeRootsConfig(settings);
  const electronNode = process.execPath;
  const serverPath = path.join(app.getAppPath(), 'bundled', 'local-mcp', 'server.js');
  return `${quoteCommandArg(electronNode)} ${quoteCommandArg(serverPath)}`;
}

function buildBrowserCommand(settings) {
  const electronNode = process.execPath;
  const chromeScript = path.join(app.getAppPath(), 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp.js');
  const flags = ['--autoConnect'];
  if (settings.browserVision) flags.push('--experimentalVision');
  if (!settings.browserUsageStatistics) flags.push('--no-usage-statistics');
  return `${quoteCommandArg(electronNode)} ${quoteCommandArg(chromeScript)} ${flags.join(' ')}`;
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
  if (kind === 'local' && isRunning(localProcess)) return;
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
    ELECTRON_RUN_AS_NODE: '1',
    LOCAL_FOLDER_MCP_CONFIG: rootsPath(),
    ENABLE_WRITE: settings.enableWrite ? 'true' : 'false',
    ENABLE_SHELL: settings.enableShell ? 'true' : 'false',
    FULL_SHELL: settings.fullShell ? 'true' : 'false',
    CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: settings.browserUsageStatistics ? '0' : '1'
  };

  const child = spawn(
    tunnelClient,
    [
      'run',
      '--control-plane.tunnel-id', tunnelId,
      '--mcp.command', mcpCommand,
      '--health.listen-addr', '127.0.0.1:0'
    ],
    { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );

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
  const localWas = isRunning(localProcess);
  const browserWas = isRunning(browserProcess);
  await stopTunnel('local');
  await stopTunnel('browser');
  await new Promise(r => setTimeout(r, 800));
  if (localWas || settings.startLocalOnLaunch) await startTunnel('local');
  if (browserWas || settings.startBrowserOnLaunch) await startTunnel('browser');
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: `Local MCP: ${isRunning(localProcess) ? 'ON' : 'OFF'}`,
      click: () => isRunning(localProcess)
        ? stopTunnel('local')
        : startTunnel('local').catch(e => addLog('local', e.message))
    },
    {
      label: `Web MCP: ${isRunning(browserProcess) ? 'ON' : 'OFF'}`,
      click: () => isRunning(browserProcess)
        ? stopTunnel('browser')
        : startTunnel('browser').catch(e => addLog('browser', e.message))
    },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => showWindow() },
    { label: 'Restart Running Servers', click: () => restartAll().catch(e => addLog('app', e.message)) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}

function showWindow() {
  if (win) {
    win.show();
    win.focus();
  }
}

async function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    show: false,
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
      win.hide();
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
  tray.on('double-click', showWindow);
  refreshTrayMenu();
}

ipcMain.handle('state:get', getPublicState);

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? '' : result.filePaths[0];
});

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
ipcMain.handle('open:external', async (_e, url) => {
  if (/^https:\/\//i.test(url)) await shell.openExternal(url);
});

app.whenReady().then(async () => {
  await createWindow();
  createTray();

  const settings = await loadSettings();
  if (process.argv.includes('--hidden')) win.hide();
  if (settings.startLocalOnLaunch) {
    startTunnel('local').catch(e => addLog('local', e.message));
  }
  if (settings.startBrowserOnLaunch) {
    startTunnel('browser').catch(e => addLog('browser', e.message));
  }
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  quitting = true;
  stopTunnel('local');
  stopTunnel('browser');
});
