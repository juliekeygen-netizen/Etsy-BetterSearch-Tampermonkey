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

test('post-runtime direct renders are limited to v0.15 local page re-slicing', async () => {
  const modules = requiredModulePaths(userscript);
  const runtimeIndex = modules.indexOf('src/63-favorites-runtime.js');
  assert.ok(runtimeIndex >= 0, 'Favorites runtime must be present in userscript module order');

  const offenders = [];
  for (const path of modules.slice(runtimeIndex + 1)) {
    const source = executableSource(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
    const calls = source.match(/\bfavRenderCurrent\s*\(\s*\)/g) || [];
    if (!calls.length) continue;
    if (path !== 'src/95-favorites-responsive-pagination.js') {
      offenders.push(path);
      continue;
    }

    const start = source.indexOf('function favGoToLocalPage0150');
    const end = source.indexOf('favRenderPagination = function favRenderPagination0150', start);
    assert.ok(start >= 0 && end > start, 'module 95 local-page handler must remain bounded');
    const localPageBlock = source.slice(start, end);
    assert.equal(
      (localPageBlock.match(/\bfavRenderCurrent\s*\(\s*\)/g) || []).length,
      calls.length,
      'module 95 direct renders must stay inside favGoToLocalPage0150',
    );
    assert.match(localPageBlock, /favState\.localPage\s*=\s*target/);
    assert.doesNotMatch(
      localPageBlock,
      /\bfavReapply\s*\(|\bfavLoadAll\s*\(|\bfavFetchJson\s*\(|\bfetch\s*\(|\blocation\.(?:href|assign|replace)\b|\bhistory\.(?:pushState|replaceState)\b/,
      'local page clicks must only re-slice already-loaded results',
    );
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
