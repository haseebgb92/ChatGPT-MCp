import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Glama container exposes only public read-only example tools', {timeout:30000}, async () => {
  const transport = new StdioClientTransport({
    command:'docker',
    args:['run','--rm','-i','--network=none','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','-e','ENABLE_WRITE=true','-e','ENABLE_SHELL=true',
      '-e','FULL_SHELL=true','-e','LOCAL_MCP_HTTP_PORT=9000','mcp-bridge:glama-readonly'],
    stderr:'pipe'
  });
  const client = new Client({name:'glama-bridge-container-test',version:'1.0.0'},{capabilities:{}});
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools;
    assert.deepEqual(tools.map(t=>t.name).sort(),[
      'list_roots','list_files','file_info','read_file','search_files'
    ].sort());
    assert.ok(tools.every(t=>t.annotations?.readOnlyHint===true));
    const roots=await client.callTool({name:'list_roots',arguments:{}});
    assert.deepEqual(JSON.parse(roots.content[0].text),[{name:'public_examples',mode:'read-only'}]);
    const doc=await client.callTool({name:'read_file',arguments:{root:'public_examples',path:'START_HERE.md'}});
    assert.equal(doc.isError,undefined);
    assert.match(doc.content[0].text,/does NOT connect to your PC/);
    const escape=await client.callTool({name:'read_file',arguments:{root:'public_examples',path:'../../../../etc/passwd'}});
    assert.equal(escape.isError,true);
    assert.doesNotMatch(escape.content[0].text,/root:x:/);
  } finally { await client.close().catch(()=>{}); }
});
