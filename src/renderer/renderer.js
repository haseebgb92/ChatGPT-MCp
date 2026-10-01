let state = null;
let roots = [];
const $ = id => document.getElementById(id);

function rootNameFromPath(p) {
  const bits = String(p).replace(/[\\/]+$/, '').split(/[\\/]/);
  return (bits.pop() || 'root').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function renderRoots() {
  const holder = $('roots');
  holder.innerHTML = '';
  if (!roots.length) {
    holder.innerHTML = '<p class="hint">No folders added yet.</p>';
    return;
  }
  roots.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'root-row';
    row.innerHTML = `
      <input class="root-name" value="${escapeHtml(r.name || rootNameFromPath(r.path))}" aria-label="Root name" />
      <div class="path" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</div>
      <select class="root-mode"><option value="read-write" ${r.mode !== 'read-only' ? 'selected' : ''}>Read / write</option><option value="read-only" ${r.mode === 'read-only' ? 'selected' : ''}>Read only</option></select>
      <button class="remove-root">Remove</button>`;
    row.querySelector('.root-name').oninput = e => roots[i].name = e.target.value;
    row.querySelector('.root-mode').onchange = e => roots[i].mode = e.target.value;
    row.querySelector('.remove-root').onclick = () => { roots.splice(i, 1); renderRoots(); };
    holder.appendChild(row);
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function setStatus(s) {
  state = s;
  const cfg = s.settings || {};
  $('localDot').classList.toggle('on', s.localRunning);
  $('browserDot').classList.toggle('on', s.browserRunning);
  $('localToggle').textContent = s.localRunning ? 'Stop Local' : 'Start Local';
  $('browserToggle').textContent = s.browserRunning ? 'Stop Web' : 'Start Web';
  $('detectedTunnelClient').textContent = s.tunnelClientPath || 'Not found';
  if (!$('localTunnelId').dataset.dirty) $('localTunnelId').value = cfg.localTunnelId || '';
  if (!$('browserTunnelId').dataset.dirty) $('browserTunnelId').value = cfg.browserTunnelId || '';
  if (!$('apiKey').dataset.dirty) $('apiKey').value = s.hasApiKey ? '********' : '';
}

async function load() {
  state = await window.bridge.getState();
  const cfg = state.settings || {};
  roots = Array.isArray(cfg.roots) ? JSON.parse(JSON.stringify(cfg.roots)) : [];
  ['rememberApiKey','enableWrite','enableShell','fullShell','browserVision','browserUsageStatistics','startAtLogin','startLocalOnLaunch','startBrowserOnLaunch'].forEach(id => $(id).checked = Boolean(cfg[id]));
  $('customTunnelClient').value = cfg.customTunnelClient || '';
  setStatus(state);
  renderRoots();
  $('logs').textContent = (state.logs || []).join('\n');
}

$('addFolder').onclick = async () => {
  const p = await window.bridge.chooseFolder();
  if (!p) return;
  roots.push({ name: rootNameFromPath(p), path: p, mode: 'read-write' });
  renderRoots();
};

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
  } catch (e) { $('message').textContent = e.message || String(e); }
};

$('localToggle').onclick = async () => { try { state.localRunning ? await window.bridge.stopLocal() : await window.bridge.startLocal(); } catch (e) { alert(e.message || e); } };
$('browserToggle').onclick = async () => { try { state.browserRunning ? await window.bridge.stopBrowser() : await window.bridge.startBrowser(); } catch (e) { alert(e.message || e); } };
$('restartAll').onclick = async () => { try { await window.bridge.restartAll(); } catch (e) { alert(e.message || e); } };
$('clearLogs').onclick = () => $('logs').textContent = '';
['apiKey','localTunnelId','browserTunnelId'].forEach(id => $(id).oninput = () => $(id).dataset.dirty = '1');
document.querySelectorAll('button.link').forEach(b => b.onclick = () => window.bridge.openExternal(b.dataset.url));

window.bridge.onState(setStatus);
window.bridge.onLog(line => {
  const log = $('logs');
  log.textContent += (log.textContent ? '\n' : '') + line;
  log.scrollTop = log.scrollHeight;
});

load();
