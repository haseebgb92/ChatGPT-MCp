const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createPeerNetwork, validTailIp, parseInvite } = require('../src/peer-network');

test('accept only Tailscale CGNAT IPv4, never public addresses', () => {
  assert.equal(validTailIp('100.71.95.57'), true);
  assert.equal(validTailIp('100.127.255.255'), true);
  for (const ip of ['100.63.1.1', '100.128.1.1', '192.168.0.1', '127.0.0.1', '0.0.0.0', '100.71.95.999', 'host.example']) {
    assert.equal(validTailIp(ip), false, ip);
  }
});

test('validates private one-time-style invite syntax', () => {
  const invite = 'mcppeer://100.105.44.7:44176/' + 'a'.repeat(64);
  assert.deepEqual(parseInvite(invite), { ip: '100.105.44.7', token: 'a'.repeat(64) });
  assert.throws(() => parseInvite('mcppeer://8.8.8.8:44176/' + 'a'.repeat(64)));
  assert.throws(() => parseInvite('http://100.105.44.7:44176/' + 'a'.repeat(64)));
  assert.throws(() => parseInvite('mcppeer://100.105.44.7:44176/short'));
});

test('private config saved with restricted permissions; screen and control off by default', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-peers-'));
  const copied = [];
  const net = createPeerNetwork({
    userData: dir, clipboard: { writeText: t => copied.push(t) },
    desktopCapturer: { getSources: async () => [] },
    screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0 } }) }
  });
  try {
    const status = await net.init();
    assert.equal(status.sharingScreen, false);
    assert.equal(status.controlExpiresAt, null);
    assert.equal(status.peers.length, 0);
    const configFile = path.join(dir, 'peer-network.json');
    const c = JSON.parse(await fs.readFile(configFile, 'utf8'));
    assert.match(c.token, /^[a-f0-9]{64}$/);
    assert.equal((await fs.stat(configFile)).mode & 0o777, 0o600);
    if (status.running) {
      await net.invite();
      assert.match(copied[0], /^mcppeer:\/\/100\./);
      const unauth = await fetch('http://' + status.tailscaleIp + ':44176/v1/status');
      assert.equal(unauth.status, 401);
      const unpaired = await fetch('http://' + status.tailscaleIp + ':44176/v1/status', {
        headers: { authorization: 'Bearer ' + c.token }
      });
      assert.equal(unpaired.status, 403);
    }
    assert.throws(() => net.grantControl(100));
    await net.add('Test PC', 'mcppeer://100.90.90.90:44176/' + 'b'.repeat(64));
    assert.equal(net.list().peers.length, 1);
    assert.equal(JSON.stringify(net.list()).includes('bbbb'), false);
    await net.remove(net.list().peers[0].id);
    assert.equal(net.list().peers.length, 0);
  } finally {
    await net.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  }
});