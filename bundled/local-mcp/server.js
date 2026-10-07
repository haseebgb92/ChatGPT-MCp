import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { resolveInside } from './security.js';

const MAX_READ_BYTES = Number(process.env.MAX_READ_BYTES || 512_000);
const MAX_SEARCH_FILES = Number(process.env.MAX_SEARCH_FILES || 3000);
const ENABLE_WRITE = /^(1|true|yes)$/i.test(process.env.ENABLE_WRITE || 'false');
const ENABLE_SHELL = /^(1|true|yes)$/i.test(process.env.ENABLE_SHELL || 'false');
const FULL_SHELL = /^(1|true|yes)$/i.test(process.env.FULL_SHELL || 'false');
const MAX_COMMAND_OUTPUT = Number(process.env.MAX_COMMAND_OUTPUT || 200_000);
const config = await loadConfig();

function roots() { return Object.keys(config.roots); }
function getRoot(name) {
  const root = config.roots[name];
  if (!root) throw new Error(`Unknown root '${name}'. Allowed roots: ${roots().join(', ')}`);
  return root;
}
function ok(data) { return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] }; }
function fail(error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }; }

function createMcpServer() {
const server = new McpServer({ name: 'local-folder-mcp', version: '0.3.1' });

server.tool('list_roots', 'List allowed local folders and whether each is read-only or read-write.', {}, async () => {
  try { return ok(Object.entries(config.roots).map(([name, item]) => ({ name, mode: item.mode }))); } catch (e) { return fail(e); }
});

server.tool('list_files', 'List files and folders inside an allowed root.', {
  root: z.string(), path: z.string().default('.')
}, async ({ root: rootName, path: relativePath }) => {
  try {
    const root = getRoot(rootName);
    const { root: realRoot, target } = await resolveInside(root.path, relativePath);
    const entries = await fs.readdir(target, { withFileTypes: true });
    const result = [];
    for (const entry of entries.slice(0, 1500)) {
      const full = path.join(target, entry.name);
      const st = await fs.lstat(full);
      result.push({
        name: entry.name,
        path: path.relative(realRoot, full),
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other',
        size: st.size,
        modified: st.mtime.toISOString()
      });
    }
    return ok(result);
  } catch (e) { return fail(e); }
});

server.tool('file_info', 'Return metadata for a file or directory.', { root: z.string(), path: z.string() }, async ({ root: rootName, path: relativePath }) => {
  try {
    const root = getRoot(rootName);
    const { root: realRoot, target } = await resolveInside(root.path, relativePath);
    const stat = await fs.stat(target);
    return ok({ root: rootName, path: path.relative(realRoot, target) || '.', type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other', size: stat.size, modified: stat.mtime.toISOString() });
  } catch (e) { return fail(e); }
});

server.tool('read_file', 'Read a UTF-8 text file. Large files are truncated.', { root: z.string(), path: z.string() }, async ({ root: rootName, path: relativePath }) => {
  try {
    const root = getRoot(rootName);
    const { target } = await resolveInside(root.path, relativePath);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error('Path is not a file.');
    const handle = await fs.open(target, 'r');
    try {
      const length = Math.min(stat.size, MAX_READ_BYTES);
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, 0);
      let text = buf.subarray(0, bytesRead).toString('utf8');
      if (stat.size > MAX_READ_BYTES) text += `\n\n[TRUNCATED: ${stat.size - MAX_READ_BYTES} more bytes]`;
      return ok(text);
    } finally { await handle.close(); }
  } catch (e) { return fail(e); }
});

server.tool('search_files', 'Search filenames and UTF-8 text contents recursively within an allowed root.', {
  root: z.string(), query: z.string().min(1), path: z.string().default('.'), max_results: z.number().int().min(1).max(200).default(50)
}, async ({ root: rootName, query, path: relativePath, max_results }) => {
  try {
    const root = getRoot(rootName);
    const { root: realRoot, target } = await resolveInside(root.path, relativePath);
    const q = query.toLowerCase();
    const results = [];
    let visited = 0;
    const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'vendor', '.venv']);
    async function walk(dir) {
      if (results.length >= max_results || visited >= MAX_SEARCH_FILES) return;
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (results.length >= max_results || visited >= MAX_SEARCH_FILES) return;
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(realRoot, full);
        if (entry.isDirectory()) { if (!skipDirs.has(entry.name)) await walk(full); continue; }
        if (!entry.isFile()) continue;
        visited++;
        if (entry.name.toLowerCase().includes(q)) { results.push({ path: rel, match: 'filename' }); continue; }
        try {
          const st = await fs.stat(full);
          if (st.size > 1_000_000) continue;
          const data = await fs.readFile(full);
          if (data.includes(0)) continue;
          const text = data.toString('utf8');
          const idx = text.toLowerCase().indexOf(q);
          if (idx >= 0) results.push({ path: rel, match: 'content', snippet: text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + query.length + 240)) });
        } catch {}
      }
    }
    await walk(target);
    return ok({ results, files_scanned: visited, scan_limit: MAX_SEARCH_FILES });
  } catch (e) { return fail(e); }
});

if (ENABLE_WRITE) {
  server.tool('write_file', 'Create or replace a UTF-8 text file in a read-write root.', { root: z.string(), path: z.string(), content: z.string() }, async ({ root: rootName, path: relativePath, content }) => {
    try {
      const root = getRoot(rootName);
      if (root.mode !== 'read-write') throw new Error(`Root '${rootName}' is read-only.`);
      const { target } = await resolveInside(root.path, relativePath, { allowMissing: true });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'w', mode: 0o600 });
      return ok({ saved: true, root: rootName, path: relativePath, bytes: Buffer.byteLength(content) });
    } catch (e) { return fail(e); }
  });

  server.tool('create_folder', 'Create a directory inside a read-write root.', { root: z.string(), path: z.string() }, async ({ root: rootName, path: relativePath }) => {
    try {
      const root = getRoot(rootName);
      if (root.mode !== 'read-write') throw new Error(`Root '${rootName}' is read-only.`);
      const { target } = await resolveInside(root.path, relativePath, { allowMissing: true });
      await fs.mkdir(target, { recursive: true });
      return ok({ created: true, root: rootName, path: relativePath });
    } catch (e) { return fail(e); }
  });
}

function restrictedCommandGuard(command) {
  if (FULL_SHELL) return;
  const blocked = [
    /(^|[;&|]\s*)sudo\b/i,
    /\b(shutdown|reboot|poweroff|halt|mkfs)\b/i,
    /\brm\s+-[^\n]*r[^\n]*f\b/i,
    /\bdd\s+.*\bof=\/dev\//i,
    />\s*\/dev\/(sd|nvme|mmcblk)/i,
    /:\(\)\s*\{\s*:\|:&\s*\};:/
  ];
  for (const rule of blocked) if (rule.test(command)) throw new Error('Command blocked by restricted shell policy. Enable Full Shell in the desktop app if you intentionally need unrestricted commands.');
}

if (ENABLE_SHELL) {
  server.tool('run_command', FULL_SHELL
    ? 'Run a terminal command with the current OS user privileges. WARNING: this is not sandboxed to the selected root.'
    : 'Run a terminal command starting in an allowed root. Common destructive system commands are blocked, but this is not a security sandbox.', {
      root: z.string(), cwd: z.string().default('.'), command: z.string().min(1), timeout_seconds: z.number().int().min(1).max(300).default(120)
    }, async ({ root: rootName, cwd, command, timeout_seconds }) => {
      try {
        const root = getRoot(rootName);
        if (root.mode !== 'read-write') throw new Error(`Root '${rootName}' is read-only.`);
        restrictedCommandGuard(command);
        const { target: workingDir } = await resolveInside(root.path, cwd || '.');
        const st = await fs.stat(workingDir);
        if (!st.isDirectory()) throw new Error('cwd must be a directory.');
        const isWin = process.platform === 'win32';
        const exe = isWin ? 'powershell.exe' : '/bin/bash';
        const args = isWin ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command];
        const result = await new Promise((resolve, reject) => {
          const child = spawn(exe, args, { cwd: workingDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '', stderr = '', timedOut = false, outputExceeded = false;
          const add = (kind, chunk) => {
            if (kind === 'stdout') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
            if (stdout.length + stderr.length > MAX_COMMAND_OUTPUT) { outputExceeded = true; child.kill('SIGKILL'); }
          };
          child.stdout.on('data', c => add('stdout', c));
          child.stderr.on('data', c => add('stderr', c));
          child.on('error', reject);
          const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout_seconds * 1000);
          child.on('close', (code, signal) => { clearTimeout(timer); resolve({ exit_code: code, signal, timed_out: timedOut, output_limit_exceeded: outputExceeded, stdout: stdout.slice(0, MAX_COMMAND_OUTPUT), stderr: stderr.slice(0, MAX_COMMAND_OUTPUT) }); });
        });
        return ok({ root: rootName, cwd: cwd || '.', command, ...result });
      } catch (e) { return fail(e); }
    });
}

return server;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 4 * 1024 * 1024) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

const httpPort = Number(process.env.LOCAL_MCP_HTTP_PORT || 0);

if (httpPort > 0) {
  const httpServer = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: 'local-folder-mcp' }));
      return;
    }
    if (pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let transport;
    let requestServer;
    try {
      const parsedBody = req.method === 'POST' ? await readJsonBody(req) : undefined;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      requestServer = createMcpServer();
      await requestServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      process.stderr.write(`Local MCP HTTP request failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
          id: null
        }));
      }
    } finally {
      try { await transport?.close(); } catch {}
      try { await requestServer?.close(); } catch {}
    }
  });

  httpServer.listen(httpPort, '127.0.0.1', () => {
    process.stderr.write(`Local MCP HTTP listening on http://127.0.0.1:${httpPort}/mcp\n`);
  });
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
