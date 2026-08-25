import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ROOT } from '../scripts/project.mjs';

const leasePath = resolve(ROOT, 'src/75-favorites-phase5-multitab-lease.js');

async function source() {
  return readFile(leasePath, 'utf8');
}

test('deep queue claims use one cross-tab readwrite transaction', async () => {
  const text = await source();
  assert.match(text, /db\.transaction\(FAV_DEEP_QUEUE_STORE, 'readwrite'\)/);
  assert.match(text, /favDeepQueueClaimNext0105/);
  assert.match(text, /workerId:favDeepWorkerId0105/);
  assert.match(text, /leaseUntil:now \+ FAV_DEEP_LEASE_MS0105/);
});

test('running deep jobs are recovered only after their lease expires', async () => {
  const text = await source();
  assert.match(text, /favDeepQueueRecoverInterrupted0105/);
  assert.match(text, /if \(leaseUntil > now\) continue/);
  assert.match(text, /FAV_DEEP_LEGACY_RUNNING_GRACE_MS0105/);
  assert.match(text, /Recovered expired\/interrupted metadata scan/);
});

test('active deep requests renew a bounded worker lease', async () => {
  const text = await source();
  assert.match(text, /FAV_DEEP_HEARTBEAT_MS0105 = 20 \* 1000/);
  assert.match(text, /favDeepQueueRenewLease0105/);
  assert.match(text, /setInterval/);
  assert.match(text, /clearInterval/);
});

test('worker-owned terminal transitions compare-and-set the current lease owner', async () => {
  const text = await source();
  assert.match(text, /favDeepOwnedTransition0106/);
  assert.match(text, /job\.status !== 'running' \|\| job\.workerId !== ownership\.workerId/);
  assert.match(text, /favDeepQueueComplete0106/);
  assert.match(text, /favDeepQueueFail0106/);
  assert.match(text, /deep-lease-lost/);
});

test('a stale listing response is lease-verified before metadata can be applied', async () => {
  const text = await source();
  const start = text.indexOf('favDeepFetchListing = async function favDeepFetchListing0106');
  assert.ok(start >= 0);
  const block = text.slice(start);
  const fetchAt = block.indexOf('await favDeepFetchListingBefore0106');
  const finalRenewAt = block.indexOf('await favDeepQueueRenewLease0105(ownership)', fetchAt);
  const returnAt = block.indexOf('return parsed', fetchAt);
  assert.ok(fetchAt >= 0);
  assert.ok(finalRenewAt > fetchAt);
  assert.ok(returnAt > finalRenewAt);
});

test('challenge pages pause automatic deep scanning instead of walking the rest of the queue', async () => {
  const text = await source();
  assert.match(text, /FAV_DEEP_CHALLENGE_PAUSE_MS0106 = 5 \* 60 \* 1000/);
  assert.match(text, /error\?\.code === 'challenge-page'/);
  assert.match(text, /favDeepAutoResumeSuppressed0103 = true/);
  assert.match(text, /favDeepRunnerController\?\.abort\(\)/);
});

test('direct unfavorites keep metadata but retire queued deep work', async () => {
  const text = await source();
  assert.match(text, /favDeepRetireQueuedUnfavorite0106/);
  assert.match(text, /if \(job\.status !== 'queued'\) return null/);
  assert.match(text, /Skipped: listing is no longer favorited/);
  assert.match(text, /favIndexMarkUnfavorite0106/);
});

test('multi-tab lease hardening loads after runtime guard and before Favorites runtime', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const guard = userscript.indexOf('src/74-favorites-phase5-runtime-guard.js');
  const lease = userscript.indexOf('src/75-favorites-phase5-multitab-lease.js');
  const runtime = userscript.indexOf('src/63-favorites-runtime.js');
  assert.ok(guard >= 0);
  assert.ok(lease > guard);
  assert.ok(runtime > lease);
});
