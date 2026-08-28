import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const identity = await readFile(new URL('../src/61f-favorites-route-identity.js', import.meta.url), 'utf8');

test('committed-query identity loads after cache/sync and before runtime', () => {
  const sync = userscript.indexOf('/src/61b-favorites-sync.js');
  const cache = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js');
  const identityIndex = userscript.indexOf('/src/61f-favorites-route-identity.js');
  const runtime = userscript.indexOf('/src/63-favorites-runtime.js');
  assert.ok(sync >= 0 && cache > sync && identityIndex > cache && runtime > identityIndex);
});

test('native dataset identity uses committed route or SSR query rather than draft input text', () => {
  assert.match(identity, /function favCommittedNativeQuery0138\(\)/);
  assert.match(identity, /search_query/);
  assert.match(identity, /searchParams\.has\('q'\)/);
  assert.match(identity, /favProps\(\)\?\.query/);
  assert.match(identity, /favDatasetQuery = function favDatasetQuery0138/);
  assert.match(identity, /favCommittedNativeQuery0138\(\)/);
});

test('Strict and Multi keep full dataset identity while live input remains local view state', () => {
  assert.match(identity, /return favCfg\.strict \|\| favCfg\.multi \? '' : favCommittedNativeQuery0138\(\)/);
  assert.match(identity, /const query = favCfg\.strict \|\| favCfg\.multi \? favNativeQuery\(\) : favCommittedNativeQuery0138\(\)/);
});

test('scope synchronization follows the same dataset query used by cache/network loading', () => {
  assert.match(identity, /favSyncCurrentScope = function favSyncCurrentScope0138/);
  assert.match(identity, /favSyncScopeDescriptor\(favScope\(\), favDatasetQuery\(\)\)/);
  assert.doesNotMatch(identity, /favSyncScopeDescriptor\(favScope\(\), favNativeQuery\(\)\)/);
});
