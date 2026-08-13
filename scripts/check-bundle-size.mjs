import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const assetsDir = new URL('../dist/assets/', import.meta.url);
const files = await readdir(assetsDir);
const entryFiles = files.filter((name) => /^index-.*\.js$/.test(name));

if (entryFiles.length === 0) {
  console.error('No production entry JS bundle found in dist/assets.');
  process.exit(1);
}

const limitBytes = 800 * 1024;
for (const name of entryFiles) {
  const info = await stat(join(assetsDir.pathname, name));
  const sizeKb = info.size / 1024;
  console.log(`${name}: ${sizeKb.toFixed(1)} KiB (limit 800 KiB)`);
  if (info.size > limitBytes) {
    console.error(`Initial bundle ${name} exceeds the 800 KiB release limit.`);
    process.exitCode = 1;
  }
}
