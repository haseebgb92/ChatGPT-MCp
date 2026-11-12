'use strict';

// Private peer transport for MCP Bridge. Only the Tailscale IPv4 interface is bound.
// Peer bearer tokens never enter renderer state or diagnostic reports.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const PORT = 44176;
const MAX_BODY = 32768;
const MAX_MESSAGES = 200;
const MAX_COMMAND_OUTPUT = 32768;

function validTailIp(value) {
  if (typeof value !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  const a = value.split('.').map(Number);
  return a.every(n => n <= 255) && a[0] === 100 && a[1] >= 64 && a[1] <= 127;
}
function randomToken() { return crypto.randomBytes(32).toString('hex'); }
function eqSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function tailIp() {
  try {
    const result = spawnSync(process.platform === 'win32' ? 'tailscale.exe' : 'tailscale',
      ['ip', '-4'], { encoding: 'utf8', timeout: 4000, windowsHide: true });
    const ip = (result.stdout || '').trim().split(/\s+/)[0];
    return validTailIp(ip) ? ip : '';
  } catch { return ''; }
}
function parseInvite(value) {
  const text = String(value || '').trim();
  const m = /^mcppeer:\/\/(100\.\d{1,3}\.\d{1,3}\.\d{1,3}):44176\/([a-f0-9]{64})$/i.exec(text);
  if (!m || !validTailIp(m[1])) throw new Error('Expected an MCP peer invite from a Tailscale IPv4 device.');
  return { ip: m[1], token: m[2].toLowerCase() };
}
async function jsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const data of req) {
    size += data.length;
    if (size > MAX_BODY) throw new Error('Request is too large.');
    chunks.push(data);
  }
  const input = Buffer.concat(chunks).toString('utf8');
  return input ? JSON.parse(input) : {};
}
function reply(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
async function runLimited(cmd, timeLimit) {
  const isWin = process.platform === 'win32';
  const command = isWin ? 'powershell.exe' : '/bin/bash';
  const args = isWin ? ['-NoProfile', '-NonInteractive', '-Command', cmd] : ['-lc', cmd];
  return await new Promise((resolve, reject) => {
    const cp = spawn(command, args, { cwd: os.homedir(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; cp.kill('SIGKILL'); }, timeLimit * 1000);
    cp.stdout.on('data', x => { stdout = (stdout + x.toString()).slice(0, MAX_COMMAND_OUTPUT); });
    cp.stderr.on('data', x => { stderr = (stderr + x.toString()).slice(0, MAX_COMMAND_OUTPUT); });
    cp.once('error', e => { clearTimeout(timer); reject(e); });
    cp.once('close', code => { clearTimeout(timer); resolve({ exit_code: code, timed_out: timedOut, stdout, stderr }); });
  });
}
async function xdo(args) {
  if (process.platform !== 'linux') throw new Error('Remote mouse/keyboard input is currently available on Linux/X11 only.');
  const cp = spawnSync('xdotool', args, { encoding: 'utf8', timeout: 2500, windowsHide: true });
  if (cp.status !== 0) throw new Error('Desktop input failed; ensure X11 and xdotool are available.');
}

function createPeerNetwork({ userData, clipboard, desktopCapturer, screen, log = () => {}, changed = () => {} }) {
  const configFile = path.join(userData, 'peer-network.json');
  const historyFile = path.join(userData, 'peer-messages.json');
  let config = { name: os.hostname(), token: randomToken(), peers: [] };
  let messages = [];
  let server = null;
  let ip = '';
  let screenEnabled = false;
  let controlExpires = 0;
  let lastCapture = 0;

  async function save() {
    await fs.mkdir(userData, { recursive: true, mode: 0o700 });
    await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    if (process.platform !== 'win32') await fs.chmod(configFile, 0o600);
  }
  async function saveMessages() {
    await fs.writeFile(historyFile, JSON.stringify(messages.slice(-MAX_MESSAGES), null, 2), { mode: 0o600 });
  }
  function list() {
    return {
      name: config.name,
      tailscaleIp: ip,
      running: Boolean(server && server.listening),
      port: PORT,
      sharingScreen: screenEnabled,
      controlExpiresAt: controlExpires > Date.now() ? new Date(controlExpires).toISOString() : null,
      peers: config.peers.map(({ id, name, ip: peerIp }) => ({ id, name, ip: peerIp }))
    };
  }
  function find(id) {
    const peer = config.peers.find(p => p.id === id);
    if (!peer) throw new Error('Peer not found.');
    return peer;
  }
  async function clientRequest(peer, pathname, method = 'GET', body, image = false) {
    if (!validTailIp(peer.ip)) throw new Error('Peer address must be a Tailscale IPv4 address.');
    const r = await fetch('http://' + peer.ip + ':' + PORT + pathname, {
      method, headers: { authorization: 'Bearer ' + peer.token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(image ? 10000 : 7000),
      cache: 'no-store'
    });
    if (!r.ok) {
      let reason = 'HTTP ' + r.status;
      try { reason = (await r.json()).error || reason; } catch {}
      throw new Error(reason);
    }
    if (image) return 'data:image/jpeg;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
    return await r.json();
  }
  function insertMessage(peerId, direction, text) {
    const item = { id: crypto.randomUUID(), peerId, direction, text, at: new Date().toISOString() };
    messages.push(item); messages = messages.slice(-MAX_MESSAGES);
    saveMessages().catch(() => {});
    changed();
    return item;
  }
  async function screenshot() {
    if (!screenEnabled) throw new Error('Screen sharing is off on this PC.');
    const now = Date.now();
    if (now - lastCapture < 450) throw new Error('Screen capture rate limited.');
    lastCapture = now;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 }, fetchWindowIcons: false });
    if (!sources.length || sources[0].thumbnail.isEmpty()) throw new Error('Unable to capture screen.');
    return sources[0].thumbnail.toJPEG(66);
  }
  async function handleInput(body) {
    if (controlExpires <= Date.now()) throw new Error('Remote control has not been approved on this PC.');
    const kind = String(body.type || '');
    if (process.platform === 'win32') {
      const script = path.join(__dirname, 'windows-input.ps1');
      const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
      const task = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, payload], { encoding: 'utf8', windowsHide: true, timeout: 6000 });
      if (task.status !== 0) throw new Error('Remote desktop input failed: ' + (task.stderr || task.error?.message || 'Windows input helper failed').slice(0, 500));
      return { ok: true };
    }
    if (kind === 'click' || kind === 'move') {
      const x = Number(body.x), y = Number(body.y);
      const display = screen.getPrimaryDisplay();
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > display.size.width || y > display.size.height) throw new Error('Coordinates outside primary screen.');
      const pos = [String(Math.round(x + display.bounds.x)), String(Math.round(y + display.bounds.y))];
      await xdo(['mousemove', ...pos]);
      if (kind === 'click') await xdo(['click', '1']);
      return { ok: true };
    }
    if (kind === 'key') {
      const key = String(body.key || '');
      if (!/^[a-zA-Z0-9_+\-]{1,35}$/.test(key)) throw new Error('Invalid key name.');
      await xdo(['key', '--clearmodifiers', key]);
      return { ok: true };
    }
    if (kind === 'type') {
      const text = String(body.text || '');
      if (!text || text.length > 1500) throw new Error('Text length must be 1–1500 characters.');
      await xdo(['type', '--clearmodifiers', '--delay', '2', '--', text]);
      return { ok: true };
    }
    throw new Error('Unsupported input operation.');
  }
  async function receive(req, res) {
    if (req.headers.authorization?.startsWith('Bearer ') !== true ||
        !eqSecret(req.headers.authorization.slice(7), config.token)) {
      reply(res, 401, { error: 'Unauthorized peer.' });
      return;
    }
    const incomingIp = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const sendingPeer = config.peers.find(p => p.ip === incomingIp);
    if (!sendingPeer) {
      reply(res, 403, { error: 'Mutual pairing required. Add each PC on the other PC first.' });
      return;
    }
    const url = new URL(req.url || '/', 'http://tailnet.local');
    const key = req.method + ' ' + url.pathname;
    try {
      if (key === 'GET /v1/status') {
        const display = screen.getPrimaryDisplay();
        return reply(res, 200, { name: config.name, tailscaleIp: ip, sharingScreen: screenEnabled,
          screenSize: { width: display.size.width, height: display.size.height },
          controlExpiresAt: controlExpires > Date.now() ? new Date(controlExpires).toISOString() : null });
      }
      if (key === 'GET /v1/messages') return reply(res, 200, { messages: messages.filter(m => m.peerId === sendingPeer.id).slice(-100) });
      if (key === 'POST /v1/messages') {
        const body = await jsonBody(req);
        const text = String(body.text || '').trim();
        if (!text || text.length > 2000) throw new Error('Message must contain 1–2000 characters.');
        return reply(res, 200, { saved: true, message: insertMessage(sendingPeer.id, 'received', text) });
      }
      if (key === 'GET /v1/screen') {
        const jpg = await screenshot();
        res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': jpg.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(jpg);
        return;
      }
      if (key === 'POST /v1/command') {
        if (controlExpires <= Date.now()) return reply(res, 403, { error: 'Remote control is disabled; local approval required.' });
        const body = await jsonBody(req);
        const command = String(body.command || '');
        if (!command || command.length > 4000) throw new Error('Invalid command length.');
        log('Peer executed a command in approved control session.');
        return reply(res, 200, await runLimited(command, Math.min(20, Math.max(1, Number(body.timeout) || 10))));
      }
      if (key === 'POST /v1/input') {
        const result = await handleInput(await jsonBody(req));
        return reply(res, 200, result);
      }
      return reply(res, 404, { error: 'Not found.' });
    } catch (e) {
      return reply(res, /off|disabled|approved/i.test(e.message) ? 403 : 400, { error: e.message });
    }
  }
  async function init() {
    await fs.mkdir(userData, { recursive: true, mode: 0o700 });
    try {
      const saved = JSON.parse(await fs.readFile(configFile, 'utf8'));
      if (typeof saved.token === 'string' && /^[a-f0-9]{64}$/.test(saved.token)) config.token = saved.token;
      if (typeof saved.name === 'string') config.name = saved.name.slice(0, 64);
      if (Array.isArray(saved.peers)) config.peers = saved.peers.filter(p => validTailIp(p.ip) && /^[a-f0-9]{64}$/.test(p.token));
    } catch {}
    try { const saved = JSON.parse(await fs.readFile(historyFile, 'utf8')); messages = Array.isArray(saved) ? saved.slice(-MAX_MESSAGES) : []; } catch {}
    await save();
    ip = tailIp();
    if (!ip) {
      log('Peer network not started: connect this computer to Tailscale.');
      changed();
      return list();
    }
    server = http.createServer((req, res) => receive(req, res));
    server.requestTimeout = 15000;
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, ip, resolve);
    });
    log('Private peer network active on Tailscale ' + ip + ':' + PORT);
    changed();
    return list();
  }
  return {
    init,
    list,
    async invite() {
      if (!ip) throw new Error('Tailscale is not online.');
      const value = 'mcppeer://' + ip + ':' + PORT + '/' + config.token;
      clipboard.writeText(value);
      return { copied: true };
    },
    async add(name, invite) {
      const p = parseInvite(invite);
      if (p.ip === ip) throw new Error('Cannot add this computer as its own peer.');
      const peer = { id: crypto.randomUUID(), name: String(name || 'Team PC').trim().slice(0, 64), ...p };
      config.peers = config.peers.filter(x => x.ip !== p.ip);
      config.peers.push(peer);
      await save();
      changed();
      return { id: peer.id, name: peer.name, ip: peer.ip };
    },
    async remove(id) { config.peers = config.peers.filter(p => p.id !== id); await save(); changed(); return list(); },
    async regenerateInvite() { config.token = randomToken(); await save(); changed(); return { regenerated: true }; },
    async status(id) { return await clientRequest(find(id), '/v1/status'); },
    async send(id, text) {
      text = String(text || '').trim();
      if (!text || text.length > 2000) throw new Error('Message must contain 1–2000 characters.');
      const result = await clientRequest(find(id), '/v1/messages', 'POST', { text });
      insertMessage(id, 'sent', text);
      return result;
    },
    async messages(id) {
      const local = messages.filter(m => m.peerId === id || m.peerId === 'incoming');
      return local.slice(-100);
    },
    async image(id) { return await clientRequest(find(id), '/v1/screen', 'GET', undefined, true); },
    async command(id, command, timeout) { return await clientRequest(find(id), '/v1/command', 'POST', { command, timeout }); },
    async input(id, data) { return await clientRequest(find(id), '/v1/input', 'POST', data); },
    setScreen(value) { screenEnabled = Boolean(value); changed(); return list(); },
    grantControl(minutes = 10) {
      const time = Number(minutes);
      if (!Number.isFinite(time) || time < 1 || time > 15) throw new Error('Control grant must be between 1–15 minutes.');
      controlExpires = Date.now() + time * 60000;
      changed();
      return list();
    },
    revokeControl() { controlExpires = 0; changed(); return list(); },
    async shutdown() {
      screenEnabled = false; controlExpires = 0;
      if (server) await new Promise(resolve => server.close(resolve));
      server = null;
    }
  };
}
module.exports = { createPeerNetwork, validTailIp, parseInvite };
