// Team Peers UI: no secrets are retained in renderer state.
(() => {
  const p = id => document.getElementById(id);
  let peers = [];
  let selected = '';
  let viewing = false;
  let frameTimer = null;
  let remoteDisplay = { width: 0, height: 0 };
  const note = (id, text) => { p(id).textContent = text; };
  const fail = (id, error) => note(id, error && error.message ? error.message : String(error));
  const withPeer = () => {
    if (!selected) throw new Error('Choose a paired computer first.');
    return selected;
  };
  const stopViewing = () => {
    viewing = false;
    clearInterval(frameTimer);
    frameTimer = null;
    p('peerScreenToggle').textContent = 'Start viewing';
    p('peerScreenImage').hidden = true;
    p('peerScreenImage').removeAttribute('src');
    p('peerScreenHelp').hidden = false;
    note('peerScreenHelp', 'Screen viewing stopped.');
  };
  const renderMessages = async () => {
    if (!selected) { note('peerMessages', 'Select a peer to see messages.'); return; }
    try {
      const items = await window.bridge.peerMessages(selected);
      const holder = p('peerMessages');
      holder.replaceChildren();
      if (!items.length) { holder.textContent = 'No messages yet.'; return; }
      for (const m of items) {
        const item = document.createElement('div');
        item.className = 'peer-message ' + (m.direction === 'sent' ? 'sent' : '');
        const meta = document.createElement('small');
        meta.textContent = (m.direction === 'sent' ? 'You' : 'Teammate') + ' · ' + new Date(m.at).toLocaleTimeString();
        const text = document.createElement('div');
        text.textContent = m.text;
        item.append(meta, text);
        holder.append(item);
      }
      holder.scrollTop = holder.scrollHeight;
    } catch (e) { fail('peerRemoteStatus', e); }
  };
  const refresh = async () => {
    try {
      const data = await window.bridge.peerList();
      peers = data.peers || [];
      note('peerIdentity', data.name + ' · ' + (data.tailscaleIp || 'Tailscale offline') + ':' + data.port);
      note('peerNetworkState', data.running ? 'Tailscale connected' : 'Tailscale unavailable');
      p('peerNetworkState').classList.toggle('good', Boolean(data.running));
      p('peerCopyInvite').disabled = !data.running;
      p('peerShareScreen').checked = Boolean(data.sharingScreen);
      const active = data.controlExpiresAt && Date.parse(data.controlExpiresAt) > Date.now();
      note('peerPermissionStatus', 'Screen sharing: ' + (data.sharingScreen ? 'ON' : 'OFF') +
        ' · Remote control: ' + (active ? 'allowed until ' + new Date(data.controlExpiresAt).toLocaleTimeString() : 'OFF'));
      const select = p('peerSelect');
      select.replaceChildren(new Option('Choose a peer', ''));
      peers.forEach(peer => select.add(new Option(peer.name + ' (' + peer.ip + ')', peer.id)));
      if (!peers.some(peer => peer.id === selected)) { selected = ''; stopViewing(); }
      select.value = selected;
      await renderMessages();
    } catch (e) { fail('peerPairStatus', e); }
  };
  const check = async () => {
    try {
      const data = await window.bridge.peerStatus(withPeer());
      remoteDisplay = data.screenSize || { width: 0, height: 0 };
      note('peerRemoteStatus', data.name + ' · Connected' +
        ' · Screen: ' + (data.sharingScreen ? 'shared' : 'off') +
        ' · Control: ' + (data.controlExpiresAt ? 'approved' : 'disabled'));
      return data;
    } catch (e) { fail('peerRemoteStatus', e); return null; }
  };
  const drawFrame = async () => {
    if (!viewing || !selected) return;
    try {
      const frame = await window.bridge.peerScreen(selected);
      if (!viewing) return;
      p('peerScreenImage').src = frame;
      p('peerScreenImage').hidden = false;
      p('peerScreenHelp').hidden = true;
    } catch (e) {
      stopViewing();
      fail('peerScreenHelp', e);
    }
  };
  p('peerCopyInvite').onclick = async () => {
    try { await window.bridge.peerInvite(); note('peerPairStatus', 'Private invite copied. Share it only with your trusted teammate.'); }
    catch (e) { fail('peerPairStatus', e); }
  };
  p('peerRekey').onclick = async () => {
    if (!confirm('Revoke your existing invite? Previously paired computers will need your new invite to reconnect.')) return;
    try { await window.bridge.peerRekey(); note('peerPairStatus', 'Previous invite revoked. Copy the new one to reconnect.'); }
    catch (e) { fail('peerPairStatus', e); }
  };
  p('peerAdd').onclick = async () => {
    try {
      const item = await window.bridge.peerAdd(p('peerNewName').value, p('peerInviteText').value);
      p('peerInviteText').value = '';
      selected = item.id;
      note('peerPairStatus', 'Added ' + item.name + '. Add this PC on their computer as well for mutual access.');
      await refresh(); await check();
    } catch (e) { fail('peerPairStatus', e); }
  };
  p('peerSelect').onchange = async () => {
    selected = p('peerSelect').value;
    stopViewing(); await renderMessages();
    if (selected) await check();
  };
  p('peerCheck').onclick = check;
  p('peerRemove').onclick = async () => {
    if (!selected || !confirm('Remove the selected peer from this PC?')) return;
    try {
      await window.bridge.peerRemove(selected);
      selected = ''; await refresh();
      note('peerRemoteStatus', 'Peer removed. To revoke access *to* this PC, also revoke your old invite.');
    } catch (e) { fail('peerRemoteStatus', e); }
  };
  p('peerShareScreen').onchange = async () => {
    try { await window.bridge.peerShare(p('peerShareScreen').checked); await refresh(); }
    catch (e) { fail('peerPermissionStatus', e); }
  };
  p('peerGrantControl').onclick = async () => {
    if (!confirm('Allow paired peers to use your keyboard, mouse and user-level shell for the next 10 minutes?')) return;
    try { await window.bridge.peerGrant(10); await refresh(); }
    catch (e) { fail('peerPermissionStatus', e); }
  };
  p('peerRevokeControl').onclick = async () => {
    try { await window.bridge.peerRevoke(); await refresh(); }
    catch (e) { fail('peerPermissionStatus', e); }
  };
  p('peerSend').onclick = async () => {
    try {
      const text = p('peerMessageText').value.trim();
      if (!text) return;
      await window.bridge.peerSend(withPeer(), text);
      p('peerMessageText').value = '';
      await renderMessages();
    } catch (e) { fail('peerRemoteStatus', e); }
  };
  p('peerMessageText').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); p('peerSend').click(); }
  });
  p('peerScreenToggle').onclick = async () => {
    if (viewing) { stopViewing(); return; }
    if (!await check()) return;
    viewing = true;
    p('peerScreenToggle').textContent = 'Stop viewing';
    await drawFrame();
    if (viewing) frameTimer = setInterval(drawFrame, 1250);
  };
  p('peerScreenImage').onclick = async e => {
    if (!remoteDisplay.width || !remoteDisplay.height) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(r.width / remoteDisplay.width, r.height / remoteDisplay.height);
    const visibleWidth = remoteDisplay.width * ratio, visibleHeight = remoteDisplay.height * ratio;
    const startX = r.x + (r.width - visibleWidth) / 2, startY = r.y + (r.height - visibleHeight) / 2;
    const x = (e.clientX - startX) / ratio, y = (e.clientY - startY) / ratio;
    if (x < 0 || y < 0 || x > remoteDisplay.width || y > remoteDisplay.height) return;
    try { await window.bridge.peerInput(withPeer(), { type: 'click', x, y }); }
    catch (err) { fail('peerRemoteStatus', err); }
  };
  p('peerTypeButton').onclick = async () => {
    try {
      await window.bridge.peerInput(withPeer(), { type: 'type', text: p('peerRemoteType').value });
      p('peerRemoteType').value = '';
    } catch (e) { fail('peerRemoteStatus', e); }
  };
  p('peerCommandButton').onclick = async () => {
    const command = p('peerRemoteCommand').value.trim();
    if (!command || !confirm('Execute this command on the paired PC? The other PC must have approved a control session.')) return;
    try {
      const result = await window.bridge.peerCommand(withPeer(), command);
      p('peerCommandResult').hidden = false;
      p('peerCommandResult').textContent = (result.stdout || '') + '\n' + (result.stderr || '') + '\nExit: ' + result.exit_code;
    } catch (e) { fail('peerRemoteStatus', e); }
  };
  document.addEventListener('bridge:tabchange', event => {
    if (event.detail?.from === 'peers' && event.detail.to !== 'peers') stopViewing();
  });
  window.bridge.onPeerUpdate(refresh);
  setInterval(async () => {
    if (selected) await renderMessages();
  }, 4000);
  refresh();
})();