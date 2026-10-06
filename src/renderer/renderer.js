let state = null;
let roots = [];
let mountedDrives = [];
const $ = id => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function rootNameFromPath(p) {
  const bits = String(p).replace(/[\\/]+$/, '').split(/[\\/]/);
  return (bits.pop() || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function humanBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return 'Unknown size';
  const units = ['B','KB','MB','GB','TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function cleanTunnel(id) {
  if (!id) return 'Tunnel not configured';
  return id.length > 20 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;
}

function setServicePill(id, running) {
  const el = $(id);
  el.textContent = running ? 'Running' : 'Offline';
  el.classList.toggle('on', running);
}

function setStatus(s) {
  state = s;
  const cfg = s.settings || {};

  $('localState').textContent = s.localRunning ? 'Running' : 'Stopped';
  $('browserState').textContent = s.browserRunning ? 'Running' : 'Stopped';
  $('localMeta').textContent = s.localRunning ? 'Secure tunnel active' : 'No local tunnel active';
  $('browserMeta').textContent = s.browserRunning ? 'Browser tunnel active' : 'No browser tunnel active';
  setServicePill('localDot', s.localRunning);
  setServicePill('browserDot', s.browserRunning);

  $('localToggle').textContent = s.localRunning ? 'Stop Local' : 'Start Local';
  $('browserToggle').textContent = s.browserRunning ? 'Stop Web' : 'Start Web';
  $('localToggle').classList.toggle('stop', s.localRunning);
  $('browserToggle').classList.toggle('stop', s.browserRunning);

  $('keyState').textContent = s.hasApiKey ? 'Valid' : 'Not configured';
  $('keyPill').textContent = s.hasApiKey ? 'Stored' : 'Missing';
  $('keyPill').classList.toggle('good', s.hasApiKey);

  const anyRunning = s.localRunning || s.browserRunning;
  $('sidebarDot').classList.toggle('on', anyRunning);
  $('sidebarStatus').textContent = anyRunning ? 'Services running' : 'Services stopped';
  $('sidebarSub').textContent = s.localRunning && s.browserRunning ? 'Local + Web MCP' : s.localRunning ? 'Local MCP' : s.browserRunning ? 'Web MCP' : 'Local + Web MCP';

  $('localTunnelLabel').textContent = cleanTunnel(cfg.localTunnelId);
  $('browserTunnelLabel').textContent = cleanTunnel(cfg.browserTunnelId);
  $('detectedTunnelClient').textContent = s.tunnelClientPath || 'Not found';
  $('clientStatus').textContent = s.tunnelClientPath ? 'Detected' : 'Not found';
  $('visionStatus').textContent = cfg.browserVision ? 'Enabled' : 'Disabled';
  $('statsStatus').textContent = cfg.browserUsageStatistics ? 'Enabled' : 'Disabled';

  if (!$('localTunnelId').dataset.dirty) $('localTunnelId').value = cfg.localTunnelId || '';
  if (!$('browserTunnelId').dataset.dirty) $('browserTunnelId').value = cfg.browserTunnelId || '';
  if (!$('apiKey').dataset.dirty) $('apiKey').value = s.hasApiKey ? '********' : '';
}

function updateCounts() {
  $('rootCount').textContent = `${roots.length} ${roots.length === 1 ? 'folder' : 'folders'}`;
  const accessible = mountedDrives.filter(d => d.accessible).length;
  $('mountCount').textContent = state?.platform === 'linux'
    ? `${accessible} mounted ${accessible === 1 ? 'drive' : 'drives'} detected`
    : 'Mounted-drive discovery is available on Linux';
}

function renderRoots() {
  const holder = $('roots');
  holder.innerHTML = '';
  if (!roots.length) {
    holder.innerHTML = '<div class="empty-state">No folders are exposed yet. Add a local folder or mounted drive.</div>';
    updateCounts();
    return;
  }

  roots.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'root-row';
    row.innerHTML = `
      <div class="root-name-wrap">
        <div class="folder-badge">▣</div>
        <input class="root-name" value="${escapeHtml(r.name || rootNameFromPath(r.path))}" aria-label="Root name" />
      </div>
      <div class="path" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</div>
      <select class="root-mode">
        <option value="read-write" ${r.mode !== 'read-only' ? 'selected' : ''}>Read / write</option>
        <option value="read-only" ${r.mode === 'read-only' ? 'selected' : ''}>Read only</option>
      </select>
      <button class="remove-root">Remove</button>`;
    row.querySelector('.root-name').oninput = e => roots[i].name = e.target.value;
    row.querySelector('.root-mode').onchange = e => roots[i].mode = e.target.value;
    row.querySelector('.remove-root').onclick = () => {
      roots.splice(i, 1);
      renderRoots();
    };
    holder.appendChild(row);
  });
  updateCounts();
}

function isPathAlreadyAdded(p) {
  return roots.some(r => String(r.path) === String(p));
}

function safeRootName(name, fallback) {
  return String(name || fallback || 'drive').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderMountedDrives() {
  const holder = $('mountedDrives');
  holder.innerHTML = '';

  if (state?.platform !== 'linux') {
    holder.innerHTML = '<div class="empty-state">Mounted-drive discovery is only needed on Linux. On Windows, use Add folder to select any drive.</div>';
    updateCounts();
    return;
  }

  if (!mountedDrives.length) {
    holder.innerHTML = '<div class="empty-state">No external mounted drives detected under /mnt, /media or /run/media.</div>';
    updateCounts();
    return;
  }

  for (const drive of mountedDrives) {
    const card = document.createElement('div');
    card.className = 'drive-card';
    const added = isPathAlreadyAdded(drive.path);
    card.innerHTML = `
      <div class="drive-top">
        <div class="drive-icon">▤</div>
        <div>
          <strong>${escapeHtml(drive.name || drive.label || 'Mounted drive')}</strong>
          <span>${escapeHtml([humanBytes(drive.size), drive.filesystem || null].filter(Boolean).join(' · '))}</span>
        </div>
      </div>
      <div class="drive-meta">${escapeHtml(drive.path)}</div>
      <div class="drive-actions">
        <button class="outline-btn add-drive" ${!drive.accessible || added ? 'disabled' : ''}>
          ${added ? 'Added' : drive.accessible ? 'Add whole drive' : 'Not accessible'}
        </button>
      </div>`;
    const btn = card.querySelector('.add-drive');
    if (!btn.disabled) {
      btn.onclick = () => {
        roots.push({
          name: safeRootName(drive.label || drive.name, rootNameFromPath(drive.path)),
          path: drive.path,
          mode: 'read-write'
        });
        renderRoots();
        renderMountedDrives();
      };
    }
    holder.appendChild(card);
  }
  updateCounts();
}

async function loadMountedDrives() {
  const holder = $('mountedDrives');
  holder.innerHTML = '<div class="empty-state">Checking mounted drives…</div>';
  try {
    mountedDrives = await window.bridge.listMountedDrives();
    if (!Array.isArray(mountedDrives)) mountedDrives = [];
  } catch {
    mountedDrives = [];
  }
  renderMountedDrives();
}

async function load() {
  state = await window.bridge.getState();
  const cfg = state.settings || {};
  roots = Array.isArray(cfg.roots) ? JSON.parse(JSON.stringify(cfg.roots)) : [];

  ['rememberApiKey','enableWrite','enableShell','fullShell','browserVision','browserUsageStatistics','startAtLogin','startLocalOnLaunch','startBrowserOnLaunch']
    .forEach(id => $(id).checked = Boolean(cfg[id]));

  $('customTunnelClient').value = cfg.customTunnelClient || '';
  setStatus(state);
  renderRoots();
  $('logs').textContent = (state.logs || []).join('\n');
  await loadMountedDrives();
}

$('addFolder').onclick = async () => {
  try {
    const selected = await window.bridge.chooseFolder();
    if (!selected?.path) return;
    if (isPathAlreadyAdded(selected.path)) {
      $('message').textContent = 'That folder is already exposed.';
      return;
    }
    roots.push({
      name: rootNameFromPath(selected.path),
      path: selected.path,
      mode: selected.writable ? 'read-write' : 'read-only'
    });
    renderRoots();
  } catch (e) {
    $('message').textContent = e.message || String(e);
  }
};

$('refreshDrives').onclick = loadMountedDrives;

$('save').onclick = async () => {
  try {
    $('message').textContent = 'Saving…';
    const settings = {
      apiKey: $('apiKey').value,
      localTunnelId: $('localTunnelId').value.trim(),
      browserTunnelId: $('browserTunnelId').value.trim(),
      rememberApiKey: $('rememberApiKey').checked,
      roots,
      enableWrite: $('enableWrite').checked,
      enableShell: $('enableShell').checked,
      fullShell: $('fullShell').checked,
      browserVision: $('browserVision').checked,
      browserUsageStatistics: $('browserUsageStatistics').checked,
      startAtLogin: $('startAtLogin').checked,
      startLocalOnLaunch: $('startLocalOnLaunch').checked,
      startBrowserOnLaunch: $('startBrowserOnLaunch').checked,
      customTunnelClient: $('customTunnelClient').value.trim()
    };
    await window.bridge.saveSettings(settings);
    $('apiKey').dataset.dirty = '';
    $('localTunnelId').dataset.dirty = '';
    $('browserTunnelId').dataset.dirty = '';
    $('message').textContent = 'Saved.';
  } catch (e) {
    $('message').textContent = e.message || String(e);
  }
};

$('localToggle').onclick = async () => {
  try { state.localRunning ? await window.bridge.stopLocal() : await window.bridge.startLocal(); }
  catch (e) { $('message').textContent = e.message || String(e); }
};

$('browserToggle').onclick = async () => {
  try { state.browserRunning ? await window.bridge.stopBrowser() : await window.bridge.startBrowser(); }
  catch (e) { $('message').textContent = e.message || String(e); }
};

$('restartAll').onclick = async () => {
  try { await window.bridge.restartAll(); }
  catch (e) { $('message').textContent = e.message || String(e); }
};

$('clearLogs').onclick = () => $('logs').textContent = '';

['apiKey','localTunnelId','browserTunnelId'].forEach(id => {
  $(id).oninput = () => $(id).dataset.dirty = '1';
});

document.querySelectorAll('button.link').forEach(b => {
  b.onclick = () => window.bridge.openExternal(b.dataset.url);
});

document.querySelectorAll('.nav-item').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.target)?.scrollIntoView({behavior:'smooth', block:'start'});
  };
});

window.bridge.onState(next => {
  setStatus(next);
});

window.bridge.onLog(line => {
  const log = $('logs');
  log.textContent += (log.textContent ? '\n' : '') + line;
  log.scrollTop = log.scrollHeight;
});

load();