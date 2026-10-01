import fs from 'node:fs/promises';
import path from 'node:path';

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

export async function resolveInside(rootPath, relativePath = '.', options = {}) {
  const allowMissing = Boolean(options.allowMissing);
  const realRoot = await fs.realpath(rootPath);
  const requested = path.resolve(realRoot, relativePath || '.');
  if (!isInside(realRoot, requested)) throw new Error('Path escapes the allowed root.');

  if (!allowMissing) {
    const realTarget = await fs.realpath(requested);
    if (!isInside(realRoot, realTarget)) throw new Error('Resolved path escapes the allowed root.');
    return { root: realRoot, target: realTarget };
  }

  let probe = requested;
  const suffix = [];
  while (probe !== realRoot) {
    try {
      const realExisting = await fs.realpath(probe);
      if (!isInside(realRoot, realExisting)) throw new Error('Resolved parent escapes the allowed root.');
      return { root: realRoot, target: path.join(realExisting, ...suffix.reverse()) };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      suffix.push(path.basename(probe));
      probe = path.dirname(probe);
    }
  }
  return { root: realRoot, target: requested };
}
