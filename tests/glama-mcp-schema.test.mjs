import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('local MCP discovery describes all read-only tools without requiring write or shell access', { timeout: 20000 }, async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-glama-schema-'));
  const configPath = path.join(fixture, 'roots.json');
  const sampleRoot = path.join(fixture, 'safe-example');
  await fs.mkdir(sampleRoot);
  await fs.writeFile(path.join(sampleRoot, 'demo.txt'), 'Harmless local MCP schema test.');
  await fs.writeFile(configPath, JSON.stringify({ roots: { demonstration: { path: sampleRoot, mode: 'read-only' } } }));

  const server = fileURLToPath(new URL('../bundled/local-mcp/server.js', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: {
      ...process.env,
      LOCAL_FOLDER_MCP_CONFIG: configPath,
      ENABLE_WRITE: 'false',
      ENABLE_SHELL: 'false',
      FULL_SHELL: 'false',
      LOCAL_MCP_HTTP_PORT: '0'
    },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'glama-tool-catalog-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const response = await client.listTools();
    const tools = response.tools;
    assert.deepEqual(
      tools.map(tool => tool.name).sort(),
      ['file_info', 'list_files', 'list_roots', 'read_file', 'search_files'].sort()
    );
    for (const tool of tools) {
      assert.ok(tool.description && tool.description.length > 90, 'Missing useful description: ' + tool.name);
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
      const fields = Object.values(tool.inputSchema?.properties ?? {});
      for (const field of fields) {
        assert.ok(typeof field.description === 'string' && field.description.length > 20,
          'Undocumented input parameter in ' + tool.name);
      }
    }
    const roots = await client.callTool({ name: 'list_roots', arguments: {} });
    assert.equal(roots.isError, undefined);
    assert.deepEqual(JSON.parse(roots.content[0].text), [{ name: 'demonstration', mode: 'read-only' }]);
  } finally {
    await client.close().catch(() => {});
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test('write and shell tools report explicit risk annotations in their schemas, with no invocation', { timeout: 20000 }, async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-glama-opt-in-'));
  const configPath = path.join(fixture, 'roots.json');
  await fs.writeFile(configPath, JSON.stringify({ roots: { testOnly: { path: fixture, mode: 'read-write' } } }));
  const server = fileURLToPath(new URL('../bundled/local-mcp/server.js', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: {
      ...process.env,
      LOCAL_FOLDER_MCP_CONFIG: configPath,
      ENABLE_WRITE: 'true',
      ENABLE_SHELL: 'true',
      FULL_SHELL: 'false',
      LOCAL_MCP_HTTP_PORT: '0'
    },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'glama-risk-metadata-test', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 8);
    for (const tool of tools) {
      assert.ok(tool.description?.length > 90, tool.name);
      for (const param of Object.values(tool.inputSchema?.properties ?? {})) {
        assert.ok(param.description?.length > 20, 'Undocumented schema property: ' + tool.name);
      }
    }
    const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
    assert.equal(byName.write_file.annotations?.destructiveHint, true);
    assert.equal(byName.write_file.annotations?.readOnlyHint, false);
    assert.equal(byName.create_folder.annotations?.idempotentHint, true);
    assert.equal(byName.create_folder.annotations?.destructiveHint, false);
    assert.equal(byName.run_command.annotations?.destructiveHint, true);
    assert.equal(byName.run_command.annotations?.openWorldHint, true);
  } finally {
    await client.close().catch(() => {});
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
