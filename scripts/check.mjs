import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  ROOT,
  localRequirePaths,
  metadataValue,
  parseUserscriptMetadata,
  readUserscript
} from './project.mjs';

const userscript = await readUserscript();
const metadata = parseUserscriptMetadata(userscript);
const version = metadataValue(metadata, 'version');
const modules = localRequirePaths(userscript);
const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));

if (!version) throw new Error('Missing userscript @version.');
if (pkg.version !== version) {
  throw new Error(`package.json version ${pkg.version} does not match userscript ${version}.`);
}
if (!modules.length) throw new Error('No local @require modules found.');

for (const module of modules) {
  await access(resolve(ROOT, module.path));
  if (module.cacheVersion !== version) {
    throw new Error(`${module.path} uses cache-buster ${module.cacheVersion || '(missing)'} instead of ${version}.`);
  }
}

const checkFiles = [
  'etsy-bettersearch.user.js',
  ...modules.map((item) => item.path),
  'extension/platform-prelude.js',
  'extension/background.js',
  'scripts/project.mjs',
  'scripts/build.mjs',
  'scripts/check.mjs',
  'tests/project.test.mjs',
  'tests/favorites.test.mjs'
];

for (const file of checkFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(ROOT, file)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`Syntax check failed: ${file}`);
  }
}

console.log(`Syntax checked ${checkFiles.length} files.`);
console.log(`Verified ${modules.length} userscript modules and v${version} cache-busters.`);
