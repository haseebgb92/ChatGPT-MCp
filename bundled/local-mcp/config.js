import fs from 'node:fs/promises';
import path from 'node:path';

export async function loadConfig() {
  const configPath = process.env.LOCAL_FOLDER_MCP_CONFIG || path.resolve('config/folders.json');
  const raw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  if (!config?.roots || typeof config.roots !== 'object') {
    throw new Error('Config must contain a roots object.');
  }
  for (const [name, item] of Object.entries(config.roots)) {
    if (!item?.path) throw new Error(`Root ${name} is missing path.`);
    if (!['read-only', 'read-write'].includes(item.mode)) {
      throw new Error(`Root ${name} mode must be read-only or read-write.`);
    }
  }
  return config;
}
