import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');
const identity = await readFile(new URL('../src/61f-favorites-route-identity.js', import.meta.url), 'utf8');
const correction = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');

test('query identity foundation loads before runtime and final client-state correction loads last', () => {
  const sync = userscript.indexOf('/src/61b-favorites-sync.js');
  const cache = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js');
  const identityIndex = userscript.indexOf('/src/61f-favorites-route-identity.js');
  const runtime = userscript.indexOf('/src/63-favorites-runtime.js');
  const correctionIndex = userscript.indexOf('/src/99-favorites-v0131-correctness.js');
  assert.ok(sync >= 0 && cache > sync && identityIndex > cache && runtime > identityIndex && correctionIndex > runtime);
});

test('base identity still seeds initial route or SSR query without treating draft text as committed', () => {
  assert.match(identity, /function favCommittedNativeQuery0138\(\)/);
  assert.match(identity, /search_query/);
  assert.match(identity, /searchParams\.has\('q'\)/);
  assert.match(identity, /favProps\(\)\?\.query/);
  assert.match(identity, /favDatasetQuery = function favDatasetQuery0138/);
});

test('final identity tracks Etsy client-side submitted search independently of URL changes', () => {
  assert.match(correction, /nativeCommittedQuery0140/);
  assert.match(correction, /nativePendingQuery0140/);
  assert.match(correction, /document\.addEventListener\('input'/);
  assert.match(correction, /document\.addEventListener\('submit'/);
  assert.match(correction, /favMaybeCommitSubmittedNativeQuery0140/);
  assert.match(correction, /favCommittedNativeQuery0138 = function favCommittedNativeQuery0140/);
  assert.match(correction, /favScheduleSync\(0\)/);
});

test('Strict and Multi keep full dataset identity while live input remains local view state', () => {
  assert.match(identity, /return favCfg\.strict \|\| favCfg\.multi \? '' : favCommittedNativeQuery0138\(\)/);
  assert.match(identity, /const query = favCfg\.strict \|\| favCfg\.multi \? favNativeQuery\(\) : favCommittedNativeQuery0138\(\)/);
  assert.match(correction, /if \(favCfg\.strict \|\| favCfg\.multi/);
});

test('scope synchronization follows the same final dataset query used by cache/network loading', () => {
  assert.match(identity, /favSyncCurrentScope = function favSyncCurrentScope0138/);
  assert.match(identity, /favSyncScopeDescriptor\(favScope\(\), favDatasetQuery\(\)\)/);
  assert.doesNotMatch(identity, /favSyncScopeDescriptor\(favScope\(\), favNativeQuery\(\)\)/);
});
