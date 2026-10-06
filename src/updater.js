const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const REPO = 'haseebgb92/ChatGPT-MCp';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const USER_AGENT = 'MCP-Bridge-Updater';

function parseVersion(input) {
  const match = String(input || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Too many download redirects.'));
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github+json'
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        requestBuffer(next, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', d => body += d);
        res.on('end', () => reject(new Error(`Update server returned HTTP ${res.statusCode}: ${body.slice(0, 180)}`)));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(30000, () => req.destroy(new Error('Update request timed out.')));
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  const buf = await requestBuffer(url);
  return JSON.parse(buf.toString('utf8'));
}

function targetPattern(platform, arch) {
  const a = arch === 'x64' ? '(x64|amd64)' : arch === 'arm64' ? '(arm64|aarch64)' : arch;
  if (platform === 'win32') return new RegExp(`MCP-Bridge-.*-win-${a}\\.exe$`, 'i');
  if (platform === 'linux') return new RegExp(`MCP-Bridge-.*-linux-${a}\\.deb$`, 'i');
  return null;
}

function selectAsset(release, platform, arch) {
  const pattern = targetPattern(platform, arch);
  if (!pattern) return null;
  return (release.assets || []).find(asset => pattern.test(asset.name));
}

async function checkForUpdate(currentVersion, platform, arch) {
  const release = await fetchJson(API);
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
  const asset = selectAsset(release, platform, arch);
  const checksumAsset = asset
    ? (release.assets || []).find(a => a.name === `${asset.name}.sha256`)
    : null;

  return {
    currentVersion,
    latestVersion,
    available: Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0),
    releaseName: release.name || release.tag_name || `v${latestVersion}`,
    notes: release.body || '',
    publishedAt: release.published_at || null,
    htmlUrl: release.html_url || null,
    asset: asset ? {
      name: asset.name,
      size: Number(asset.size || 0),
      url: asset.browser_download_url
    } : null,
    checksumAsset: checksumAsset ? {
      name: checksumAsset.name,
      url: checksumAsset.browser_download_url
    } : null
  };
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, destination, onProgress) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const clientFor = u => u.startsWith('https:') ? https : http;

  return new Promise((resolve, reject) => {
    const start = (nextUrl, redirects = 0) => {
      if (redirects > 8) return reject(new Error('Too many download redirects.'));
      const req = clientFor(nextUrl).get(nextUrl, { headers: { 'User-Agent': USER_AGENT } }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          start(new URL(res.headers.location, nextUrl).toString(), redirects + 1);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`Download failed with HTTP ${res.statusCode}.`));
          return;
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        const out = fs.createWriteStream(destination, { mode: 0o600 });
        res.on('data', chunk => {
          received += chunk.length;
          if (onProgress) onProgress({ received, total, percent: total ? Math.round(received * 100 / total) : null });
        });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(destination)));
        out.on('error', reject);
      });
      req.setTimeout(60000, () => req.destroy(new Error('Download timed out.')));
      req.on('error', reject);
    };
    start(url);
  });
}

async function downloadAndVerify(update, updatesDir, onProgress) {
  if (!update?.asset?.url) throw new Error('No installer is available for this platform.');
  if (!update?.checksumAsset?.url) throw new Error('Release checksum is missing; refusing to install an unverified update.');

  const installerPath = path.join(updatesDir, update.asset.name);
  await downloadFile(update.asset.url, installerPath, onProgress);

  const checksumText = (await requestBuffer(update.checksumAsset.url)).toString('utf8').trim();
  const expected = checksumText.split(/\s+/)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Release checksum is invalid.');

  const actual = await sha256File(installerPath);
  if (actual !== expected) {
    await fsp.rm(installerPath, { force: true });
    throw new Error('Downloaded update failed SHA-256 verification.');
  }

  return { installerPath, sha256: actual };
}

function installUpdate(platform, installerPath, options = {}) {
  if (platform === 'win32') {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    return { launched: true };
  }

  if (platform === 'linux') {
    const relaunchPath = options.relaunchPath || '/opt/MCP Bridge/mcp-bridge';
    const script = [
      'pkexec /usr/bin/apt-get install -y "$1"',
      'rc=$?',
      'if [ "$rc" -eq 0 ]; then',
      '  nohup "$2" >/dev/null 2>&1 &',
      'fi',
      'exit "$rc"'
    ].join('; ');
    const child = spawn('/bin/bash', ['-lc', script, '_', installerPath, relaunchPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return { launched: true };
  }

  throw new Error('Automatic installation is not supported on this platform.');
}

module.exports = {
  compareVersions,
  checkForUpdate,
  downloadAndVerify,
  installUpdate
};
