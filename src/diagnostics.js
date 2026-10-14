'use strict';

// Privacy boundary: only allowlisted diagnostic codes leave the machine in a GitHub issue draft.
// Never include console output, paths, emails, tunnel IDs, OAuth state/codes, tokens or URLs.
const COMPONENTS = new Set(['app', 'local', 'browser', 'meta', 'updater', 'facebook', 'instagram', 'linkedin', 'mcp', 'cloud']);
const KINDS = new Set([
  'oauth_callback_port', 'oauth_local_certificate', 'oauth_state',
  'oauth_authorization_code', 'oauth_timeout_or_expired', 'oauth_token_exchange',
  'social_profile_fetch', 'network_connection', 'unclassified_error',
  'missing_runtime_key', 'invalid_tunnel_id', 'tunnel_client_missing',
  'meta_service_unavailable', 'node_runtime_missing', 'tunnel_exited',
  'permission_denied', 'http_request_failed', 'mcp_protocol_failure',
  'startup_failure', 'unexpected_error'
]);

function bridgeCategory(message) {
  const value = String(message || '');
  const lower = value.toLowerCase();
  if (/runtime api key.*missing|secure os credential encryption.*not available/.test(lower)) return 'missing_runtime_key';
  if (/tunnel id.*(missing|invalid|different)|invalid tunnel id/.test(lower)) return 'invalid_tunnel_id';
  if (/tunnel-client.*(not found|missing)/.test(lower)) return 'tunnel_client_missing';
  if (/start meta manager|local mcp service.*online|localhost.*38939/.test(lower)) return 'meta_service_unavailable';
  if (/node runtime.*missing|bundled node/.test(lower)) return 'node_runtime_missing';
  if (/stopped \(code=[1-9]|exit code [1-9]|exit status [1-9]/.test(lower)) return 'tunnel_exited';
  if (/permission denied|eacces|eperm|forbidden/.test(lower)) return 'permission_denied';
  if (/http [45][0-9][0-9]/.test(lower)) return 'http_request_failed';
  if (/mcp.*(protocol|initialize|handshake|transport)/.test(lower)) return 'mcp_protocol_failure';
  if (/fail|error|invalid|refused|denied|expired|not found|unable|stopped \(code=/.test(lower)) return 'unexpected_error';
  return null;
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (!COMPONENTS.has(event.component) || !KINDS.has(event.kind)) return null;
  const at = typeof event.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(event.at)
    ? event.at.slice(0, 19) + 'Z' : null;
  const httpStatus = Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599
    ? event.httpStatus : null;
  // Reconstruct from specific allowed fields; intentionally discard arbitrary attributes.
  return { at, component: event.component, kind: event.kind, httpStatus };
}

function parseDiagnosticEvents(content, max = 30) {
  return String(content || '').split(/\r?\n/).slice(-Math.max(1, max * 4))
    .map(line => { try { return normalizeEvent(JSON.parse(line)); } catch { return null; } })
    .filter(Boolean).slice(-max);
}

function createReport({ bridgeVersion, platform, mcpOnline, bridgeEvents, metaEvents }) {
  const safeVersion = /^\d+(?:\.\d+){1,3}$/.test(String(bridgeVersion)) ? bridgeVersion : 'unknown';
  const os = ['win32', 'linux', 'darwin'].includes(platform) ? platform : 'unknown';
  const display = events => events.length
    ? events.slice(-20).map(e => `- ${e.at || 'unknown time'} | ${e.component} | ${e.kind}${e.httpStatus ? ` | HTTP ${e.httpStatus}` : ''}`).join('\n')
    : '- No categorized failures recorded yet';
  return [
    'Meta Manager + MCP Bridge diagnostic report (privacy-filtered)',
    'Review this text before clicking Submit on GitHub.',
    '',
    `MCP Bridge: ${safeVersion}`,
    `Operating system: ${os}`,
    `Meta Manager local MCP: ${mcpOnline ? 'reachable' : 'not reachable'}`,
    '',
    'MCP Bridge failure categories:',
    display(bridgeEvents),
    '',
    'Meta Manager failure categories:',
    display(metaEvents),
    '',
    'No raw browser logs, account identities, file paths, tunnel IDs, tokens, or OAuth codes are included.',
    'Reproduction steps (please add manually):'
  ].join('\n');
}

module.exports = { bridgeCategory, normalizeEvent, parseDiagnosticEvents, createReport };
