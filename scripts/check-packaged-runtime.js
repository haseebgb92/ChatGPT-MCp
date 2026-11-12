'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const platform = process.argv[2];
if (!['win', 'linux'].includes(platform)) process.exit(2);
const isWindows = platform === 'win';
const suffix = isWindows ? '.exe' : '';
const targetRoot = path.join(__dirname, '..', 'dist', isWindows ? 'win-unpacked' : 'linux-unpacked', 'resources');
for (const [directory, name] of [['tunnel-client','tunnel-client' + suffix], ['node-runtime','node' + suffix]]) {
  const source = path.join(__dirname, '..', 'vendor', directory, name);
  const target = path.join(targetRoot, directory, name);
  if (!fs.existsSync(target)) throw new Error('Installer missing required ' + platform + ' executable: ' + target);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash(source) !== hash(target)) throw new Error('Executable was changed during packaging: ' + target);
  console.log('Packaged executable verified: ' + target);
}
for (const [directory, name] of [['tunnel-client', 'tunnel-client'],['node-runtime','node']]) {
  const wrong = path.join(targetRoot, directory, name + (isWindows ? '' : '.exe'));
  if (fs.existsSync(wrong)) throw new Error('Wrong-platform executable leaked into ' + platform + ' installer: ' + wrong);
}
console.log('Packaged resources passed ' + platform + ' platform checks.');
