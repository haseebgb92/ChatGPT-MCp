const test = require('node:test');
const assert = require('node:assert/strict');
const { bridgeCategory, parseDiagnosticEvents, createReport } = require('../src/diagnostics');

test('categorizes common Meta Manager tunnel failures', () => {
  assert.equal(bridgeCategory('Start Meta Manager first. Its local MCP service must be online.'), 'meta_service_unavailable');
  assert.equal(bridgeCategory('Runtime API key is missing.'), 'missing_runtime_key');
  assert.equal(bridgeCategory('Meta Manager MCP tunnel exited with exit code 1'), 'tunnel_exited');
  assert.equal(bridgeCategory('Tunnel session healthy'), null);
});
test('discard raw account data, token and unsupported diagnostics', () => {
  const content = [
    JSON.stringify({source:'meta-manager',component:'instagram',kind:'oauth_token_exchange',httpStatus:400,at:'2026-10-14T07:30:00Z',token:'secret-very-sensitive',email:'user@example.com'}),
    JSON.stringify({component:'instagram',kind:'user@example.com',at:'2026-10-14T07:30:00Z'}),
    JSON.stringify({component:'facebook',kind:'oauth_local_certificate',at:'2026-10-14T07:31:00Z',code:'oauth-123'}),
    'invalid json'
  ].join('\n');
  const events = parseDiagnosticEvents(content);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind,'oauth_token_exchange');
  const report = createReport({bridgeVersion:'0.2.11',platform:'win32',mcpOnline:false,bridgeEvents:[],metaEvents:events});
  for (const secret of ['secret-very-sensitive','user@example.com','oauth-123']) {
    assert.ok(!report.includes(secret), secret);
  }
  assert.match(report,/HTTP 400/);
  assert.match(report,/oauth_local_certificate/);
});
test('report does not echo arbitrary fields', () => {
  const event = parseDiagnosticEvents(JSON.stringify({component:'mcp',kind:'startup_failure',at:'2026-10-14T07:30:00Z',path:'C:\\Users\\Test\\secret.txt',tunnelId:'tunnel_bad',access_token:'dont-share'}));
  const report=createReport({bridgeVersion:'0.2.11',platform:'win32',mcpOnline:true,bridgeEvents:event,metaEvents:[]});
  assert.ok(!report.includes('secret.txt'));
  assert.ok(!report.includes('tunnel_bad'));
  assert.ok(!report.includes('dont-share'));
});