// Peer tools exposed through the EXISTING Local MCP tunnel.
// No additional OpenAI API key or ChatGPT account credentials are shared.
import fs from 'node:fs/promises';
import { z } from 'zod';

const CONFIG_FILE = process.env.BRIDGE_PEER_CONFIG || '';
function validIp(ip) {
  if (typeof ip !== 'string' || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
  const a = ip.split('.').map(Number);
  return a.every(n => n <= 255) && a[0] === 100 && a[1] >= 64 && a[1] <= 127;
}
async function config() {
  if (!CONFIG_FILE) throw new Error('Update MCP Bridge and restart Local MCP to enable peers.');
  const x = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  return x;
}
async function target(peerName) {
  const c = await config();
  const peer = c.peers.find(p => p.id === peerName || p.name.toLowerCase() === peerName.toLowerCase());
  if (!peer || !validIp(peer.ip) || !/^[a-f0-9]{64}$/.test(peer.token)) throw new Error('Unknown peer. Use peer_list first.');
  return peer;
}
function ok(data) { return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] }; }
function fail(e) { return { isError: true, content: [{ type: 'text', text: e?.message || String(e) }] }; }
async function ask(peer, route, method = 'GET', body, binary = false) {
  const res = await fetch('http://' + peer.ip + ':44176' + route, {
    method, headers: { authorization: 'Bearer ' + peer.token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(binary ? 10000 : 25000)
  });
  if (!res.ok) {
    const body = await res.text();
    try { throw new Error(JSON.parse(body).error || 'Remote error: ' + res.status); }
    catch (e) { if (e instanceof SyntaxError) throw new Error('Remote error: ' + res.status); throw e; }
  }
  return binary ? Buffer.from(await res.arrayBuffer()) : await res.json();
}
export function installPeerTools(server) {
  server.tool('peer_list', 'List explicitly paired team computers on the private Tailscale network; does not expose credentials.', {}, async () => {
    try {
      const c = await config();
      return ok(c.peers.map(({ id, name, ip }) => ({ id, name, tailscale_ip: ip })));
    } catch (e) { return fail(e); }
  });
  server.tool('peer_status', 'Check availability and locally approved screen/control permissions of a paired PC.', {
    peer: z.string().min(1)
  }, async ({ peer }) => {
    try { return ok(await ask(await target(peer), '/v1/status')); } catch (e) { return fail(e); }
  });
  server.tool('peer_send_message', 'Send a simple chat message to a paired teammate through Tailscale.', {
    peer: z.string().min(1), message: z.string().min(1).max(2000)
  }, async ({ peer, message }) => {
    try { return ok(await ask(await target(peer), '/v1/messages', 'POST', { text: message })); } catch (e) { return fail(e); }
  });
  server.tool('peer_read_messages', 'Read recent chat messages on this computer from a paired teammate.', {
    peer: z.string().min(1)
  }, async ({ peer }) => {
    try {
      const p = await target(peer);
      const data = JSON.parse(await fs.readFile(CONFIG_FILE.replace(/peer-network\.json$/, 'peer-messages.json'), 'utf8'));
      return ok(data.filter(x => x.peerId === p.id).slice(-50));
    } catch (e) { return fail(e); }
  });
  server.tool('peer_view_screen', 'Capture a single screenshot from the paired PC. The person at that PC must explicitly enable screen sharing. Do not poll without a current task.', {
    peer: z.string().min(1)
  }, async ({ peer }) => {
    try {
      const jpeg = await ask(await target(peer), '/v1/screen', 'GET', undefined, true);
      return { content: [{ type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }] };
    } catch (e) { return fail(e); }
  });
  server.tool('peer_run_command', 'Execute a command on a paired PC only only after its user explicitly approves a peer-scoped control session. Commands run with that PC user privileges, not sandboxed; use carefully.', {
    peer: z.string().min(1), command: z.string().min(1).max(4000), timeout_seconds: z.number().int().min(1).max(20).default(10)
  }, async ({ peer, command, timeout_seconds }) => {
    try { return ok(await ask(await target(peer), '/v1/command', 'POST', { command, timeout: timeout_seconds })); } catch (e) { return fail(e); }
  });
  server.tool('peer_input', 'Send a mouse/keyboard action to a paired PC (Linux/X11) during an explicitly approved remote-control session.', {
    peer: z.string().min(1),
    type: z.enum(['click', 'move', 'key', 'type']),
    x: z.number().optional(), y: z.number().optional(),
    key: z.string().optional(), text: z.string().optional()
  }, async ({ peer, type, x, y, key, text }) => {
    try { return ok(await ask(await target(peer), '/v1/input', 'POST', { type, x, y, key, text })); } catch (e) { return fail(e); }
  });
}