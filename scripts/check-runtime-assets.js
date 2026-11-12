'use strict';
const fs = require('node:fs');
const path = require('node:path');

const platform = process.argv[2];
if (!['win','linux'].includes(platform)) {
  console.error('Usage: node scripts/check-runtime-assets.js win|linux');
  process.exit(2);
}
const suffix = platform === 'win' ? '.exe' : '';
const items = [
  { path: 'vendor/tunnel-client/tunnel-client' + suffix, min: 1024 * 1024 },
  { path: 'vendor/node-runtime/node' + suffix, min: 1024 * 1024 }
];
for (const entry of items) {
  const file = path.resolve(__dirname, '..', entry.path);
  if (!fs.existsSync(file)) {
    console.error('BUILD BLOCKED: ' + entry.path + ' is missing. This platform requires a bundled executable.');
    process.exit(1);
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size < entry.min) {
    console.error('BUILD BLOCKED: ' + entry.path + ' is not a valid full executable.');
    process.exit(1);
  }
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(1024);
    fs.readSync(fd, header, 0, header.length, 0);
    if (platform === 'linux') {
      if (header.toString('hex', 0, 4) !== '7f454c46' || header[4] !== 2 || header.readUInt16LE(18) !== 62) {
        throw new Error('Linux x64 ELF executable expected');
      }
    } else {
      if (header.toString('ascii', 0, 2) !== 'MZ') throw new Error('Windows PE executable expected');
      const offset = header.readUInt32LE(0x3c);
      const pe = Buffer.alloc(6);
      fs.readSync(fd, pe, 0, 6, offset);
      if (pe.toString('hex', 0, 4) !== '50450000' || pe.readUInt16LE(4) !== 0x8664) {
        throw new Error('Windows x64 PE executable expected');
      }
    }
    console.log('Verified ' + platform + ' runtime: ' + entry.path + ' (' + Math.round(stat.size/1024/1024) + ' MB)');
  } catch (e) {
    console.error('BUILD BLOCKED: ' + entry.path + ': ' + e.message);
    process.exitCode = 1;
  } finally { fs.closeSync(fd); }
}