// PUBLIC Glama sample only. No access to local computer or user credentials.
// Force read-only mode, even when deployment supplies an unsafe environment.
process.env.ENABLE_WRITE = 'false';
process.env.ENABLE_SHELL = 'false';
process.env.FULL_SHELL = 'false';
process.env.LOCAL_MCP_HTTP_PORT = '0';
process.env.LOCAL_FOLDER_MCP_CONFIG = '/opt/mcp/glama/bridge/config.json';
process.env.MAX_READ_BYTES = '65536';
process.env.MAX_SEARCH_FILES = '60';
await import('../../bundled/local-mcp/server.js');
