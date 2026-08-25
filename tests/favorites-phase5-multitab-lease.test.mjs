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

test('completion, cancellation and failures clear worker ownership metadata', async () => {
  const text = await source();
  assert.match(text, /nextPatch\.workerId = ''/);
  assert.match(text, /nextPatch\.leaseUntil = 0/);
  assert.match(text, /favDeepQueueFail0105/);
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
