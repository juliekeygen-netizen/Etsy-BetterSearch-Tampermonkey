import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function requiredModulePaths(source) {
  return Array.from(
    source.matchAll(/raw\.githubusercontent\.com\/juliekeygen-netizen\/Etsy-BetterSearch-Tampermonkey\/main\/(src\/[^?\s]+)\?v=[^\s]+/g),
    (match) => match[1]
  );
}

function executableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('post-runtime modules cannot directly bypass metadata coordination with favRenderCurrent()', async () => {
  const modules = requiredModulePaths(userscript);
  const runtimeIndex = modules.indexOf('src/63-favorites-runtime.js');
  assert.ok(runtimeIndex >= 0, 'Favorites runtime must be present in userscript module order');

  const offenders = [];
  for (const path of modules.slice(runtimeIndex + 1)) {
    const source = executableSource(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
    if (/\bfavRenderCurrent\s*\(\s*\)/.test(source)) offenders.push(path);
  }
  assert.deepEqual(offenders, [], `late direct render bypasses: ${offenders.join(', ')}`);
});

test('post-runtime modules cannot replace native Favorites grid children', async () => {
  const modules = requiredModulePaths(userscript);
  const runtimeIndex = modules.indexOf('src/63-favorites-runtime.js');
  const offenders = [];
  for (const path of modules.slice(runtimeIndex + 1)) {
    const source = executableSource(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
    const functions = source.split(/\n(?=(?:async\s+)?function\s+|var\s+\w+Before|fav\w+\s*=\s*(?:async\s*)?function)/);
    if (functions.some((block) => /favMainGrid\s*\(/.test(block) && /\.replaceChildren\s*\(/.test(block))) offenders.push(path);
  }
  assert.deepEqual(offenders, [], `late native-grid replacement found in: ${offenders.join(', ')}`);
});
