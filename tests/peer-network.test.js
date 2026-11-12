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
    userData: dir, listenerPort: 0, clipboard: { writeText: t => copied.push(t) },
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
      const unauth = await fetch('http://' + status.tailscaleIp + ':' + status.port + '/v1/status');
      assert.equal(unauth.status, 401);
      const unpaired = await fetch('http://' + status.tailscaleIp + ':' + status.port + '/v1/status', {
        headers: { authorization: 'Bearer ' + c.token }
      });
      assert.equal(unpaired.status, 403);
    }
    await net.add('Test PC', 'mcppeer://100.90.90.90:44176/' + 'b'.repeat(64));
    assert.equal(net.list().peers.length, 1);
    assert.equal(JSON.stringify(net.list()).includes('bbbb'), false);
    const peerId = net.list().peers[0].id;
    await assert.rejects(net.grantControl(1000, peerId), /between 1 and 720/);
    await assert.rejects(net.grantControl('until-revoked', 'unknown-id'), /Peer not found/);
    await net.grantControl(10, peerId);
    assert.equal(net.list().controlMode, 'timed');
    assert.ok(net.list().controlExpiresAt);
    await net.revokeControl();
    assert.equal(net.list().controlAllowed, false);
    await net.grantControl('until-revoked', peerId);
    assert.equal(net.list().controlMode, 'until-revoked');
    assert.equal(net.list().controlAllowed, true);
    assert.equal(net.list().controlPeerName, 'Test PC');
    assert.equal(net.list().controlExpiresAt, null);
    let disk = JSON.parse(await fs.readFile(configFile, 'utf8'));
    assert.equal(disk.persistentControlPeerId, peerId);
    await net.setScreen(true);
    assert.equal(net.list().sharingScreen, true);
    await net.shutdown();
    // Persistent control and screen state survive a real app restart.
    const again = createPeerNetwork({
      userData: dir, listenerPort: 0, clipboard: { writeText: () => {} },
      desktopCapturer: { getSources: async () => [] },
      screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0 } }) }
    });
    try {
      await again.init();
      assert.equal(again.list().controlAllowed, true);
      assert.equal(again.list().controlMode, 'until-revoked');
      assert.equal(again.list().sharingScreen, true);
      await again.revokeControl();
      await again.setScreen(false);
      disk = JSON.parse(await fs.readFile(configFile, 'utf8'));
      assert.equal(Object.hasOwn(disk, 'persistentControlPeerId'), false);
      assert.equal(disk.sharingScreen, false);
      await again.grantControl('until-revoked', peerId);
      await again.remove(peerId);
      assert.equal(again.list().controlAllowed, false);
      assert.equal(again.list().peers.length, 0);
    } finally {
      await again.shutdown();
    }
  } finally {
    await net.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  }
});