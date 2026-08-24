import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

async function loadQueue(backing = new Map()) {
  const source = await readFile(resolve(ROOT, 'src/61d-favorites-deep-queue.js'), 'utf8');
  const store = {
    get: (key) => structuredClone(backing.get(String(key))),
    getAll: () => structuredClone(Array.from(backing.values())),
    put: (value) => backing.set(String(value.id), structuredClone(value)),
  };
  const db = { transaction: () => ({ objectStore: () => store }) };
  const context = vm.createContext({
    console, Date, Promise, Map, Array, Number, String, Object, Math, Set, AbortController, DOMException,
    document: { dispatchEvent: () => {} }, CustomEvent: class {},
    location: { origin: 'https://www.etsy.com' }, URL, encodeURIComponent,
    favIndexOpen: async () => db, favIndexRequest: async (value) => value,
    favIndexWrite: async (_stores, writer) => writer({ objectStore: () => store }),
    favScope: () => ({ owner: 'owner' }), favIndexGetActiveListings: async () => [],
    favCfg: { autoScanMissingMetadata: true }, isFavoritesPage: () => true,
    favIsOwnFavoritesPage: () => true, sleep: async () => {},
  });
  vm.runInContext(`${source}\nglobalThis.testApi={favDeepQueueJob,favDeepQueueMergeJob,favDeepQueueEnqueue,favDeepQueueList,favDeepQueueClaimNext,favDeepQueueComplete,favDeepQueueFail,favDeepQueueRecoverInterrupted,favDeepProgressModel};`, context);
  return { ...context.testApi, backing };
}

test('deep queue persists jobs and merges duplicate listing work', async () => {
  const first = await loadQueue();
  await first.favDeepQueueEnqueue('42', { type: 'refresh_metadata', url: '/listing/42' });
  await first.favDeepQueueEnqueue('42', { type: 'forced_update' });
  assert.equal(first.backing.size, 1);
  const [job] = await first.favDeepQueueList();
  for (const key of ['id', 'listingId', 'type', 'priority', 'status', 'attempts', 'createdAt', 'startedAt', 'finishedAt', 'error']) {
    assert.equal(Object.hasOwn(job, key), true, key);
  }
  assert.equal(job.id, 'listing:42');
  assert.equal(job.type, 'forced_update');
  assert.equal(job.status, 'queued');

  const afterReload = await loadQueue(first.backing);
  assert.equal((await afterReload.favDeepQueueList())[0].listingId, '42');
});

test('deep queue claims in priority order and completes real job state', async () => {
  const api = await loadQueue();
  await api.favDeepQueueEnqueue('slow', { type: 'refresh_metadata' });
  await api.favDeepQueueEnqueue('fast', { type: 'forced_update' });
  const claimed = await api.favDeepQueueClaimNext(100);
  assert.equal(claimed.listingId, 'fast');
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);
  const completed = await api.favDeepQueueComplete(claimed.id, 150);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.finishedAt, 150);
});

test('deep queue retries failures up to its retry limit and survives interrupted runs', async () => {
  const api = await loadQueue();
  await api.favDeepQueueEnqueue('42');
  let job;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    job = await api.favDeepQueueClaimNext(10000 * attempt);
    job = await api.favDeepQueueFail(job.id, new Error('network'), 10000 * attempt);
    assert.equal(job.status, attempt < 3 ? 'queued' : 'failed');
  }

  await api.favDeepQueueEnqueue('99');
  const running = await api.favDeepQueueClaimNext(50000);
  assert.equal(running.status, 'running');
  assert.equal(await api.favDeepQueueRecoverInterrupted(60000), 1);
  assert.equal((await api.favDeepQueueList('queued')).some((entry) => entry.listingId === '99'), true);
});

test('deep scanner progress is derived from queue state', async () => {
  const api = await loadQueue();
  const progress = api.favDeepProgressModel({ completed: 12, total: 63 });
  assert.equal(progress.title, 'Syncing');
  assert.equal(progress.detail, '12/63');
  assert.equal(Math.round(progress.ratio * 100), 19);
});
