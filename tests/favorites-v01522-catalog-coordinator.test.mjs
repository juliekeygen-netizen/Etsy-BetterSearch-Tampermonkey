import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/61ec-favorites-catalog-coordinator.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function executableSource(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function fixture() {
  const priorCalls = [];
  const observes = [];
  const inflight = new Map();
  const context = vm.createContext({
    console,
    Date,
    Math,
    Map,
    Promise,
    DOMException,
    AbortController,
    TextEncoder,
    Uint8Array,
    indexedDB: { open: () => { throw new Error('test should replace coordinator mutation before opening IndexedDB'); } },
    crypto: {
      subtle: {
        digest: async (_algorithm, bytes) => {
          const input = Array.from(new Uint8Array(bytes));
          const out = new Uint8Array(32);
          for (let i = 0; i < input.length; i += 1) out[i % out.length] = (out[i % out.length] + input[i] + i) & 255;
          return out.buffer;
        },
      },
    },
    navigator: {},
    FAV_CATALOG_LEASE_MS0141: 30_000,
    FAV_CATALOG_LEASE_POLL_MS0141: 250,
    favCatalogWorkerId0141: 'worker-A',
    favCatalogInflight0141: inflight,
    favCatalogKey0141: (scope) => `${scope.owner}|${scope.type}|${scope.id}|q:${scope.query || ''}`,
    favCatalogPeerCompleted0141: async () => false,
    favIndexCurrentScope: () => ({ owner:'owner', type:'items', id:'', query:'private words', scopeKey:'scope' }),
    favCatalogWithCrossTabLease0141: async (...args) => {
      priorCalls.push(args);
      return { legacy:true };
    },
    favIndexObserveRecords: async (records, options) => {
      observes.push({ records, options });
      return records;
    },
    sleep: async () => {},
    setInterval: () => 1,
    clearInterval: () => {},
  });
  vm.runInContext(`${source}\nglobalThis.testApi={
    key:favCatalogCoordinatorKey01522,
    acquire:favCatalogAcquireCoordinatorLease01522,
    renew:favCatalogRenewCoordinatorLease01522,
    release:favCatalogReleaseCoordinatorLease01522,
    markLost:favCatalogMarkCoordinatorLeaseLost01522,
    withLease:favCatalogWithCrossTabLease0141,
    observe:favIndexObserveRecords,
    guards:favCatalogCoordinatorGuards01522,
  };`, context);

  const rows = new Map();
  context.favCatalogCoordinatorMutate01522 = async (key, mutator) => {
    const result = mutator(rows.get(key) || null) || { value:null };
    if (result.delete === true) rows.delete(key);
    else if (result.row) rows.set(key, { ...result.row });
    return result.value;
  };
  return { context, api:context.testApi, rows, priorCalls, observes, inflight };
}

const scope = { owner:'private-owner', type:'items', id:'', query:'private search words', scopeKey:'scope' };

test('v0.15.22 is wired after immutable snapshots and before route identity', () => {
  const immutable = userscript.indexOf('/src/61ea-favorites-immutable-snapshots.js');
  const coordinator = userscript.indexOf('/src/61ec-favorites-catalog-coordinator.js');
  const route = userscript.indexOf('/src/61f-favorites-route-identity.js');
  assert.ok(immutable > 0 && coordinator > immutable && route > coordinator);
});

test('fallback coordinator uses a separate IndexedDB readwrite transaction, not localStorage election', () => {
  assert.match(source, /FAV_CATALOG_COORDINATOR_DB01522 = 'etsy-bettersearch-coordinator'/);
  assert.match(source, /db\.transaction\('leases', 'readwrite'\)/);
  assert.match(source, /store\.get\(key\)/);
  assert.match(source, /store\.put\(result\.row\)/);
  assert.doesNotMatch(executableSource(source), /\blocalStorage\b|favCatalogReadLease0141|favCatalogWriteLease0141/);
});

test('coordinator key is bounded/opaque and rows do not persist raw dataset identity', async () => {
  const { api } = fixture();
  const key = await api.key(scope);
  assert.match(key, /^catalog:[0-9a-f]{64}$/);
  assert.doesNotMatch(key, /private-owner|private search words/);
  const rowBlock = source.slice(source.indexOf('function favCatalogCoordinatorLeaseRow01522'), source.indexOf('async function favCatalogAcquireCoordinatorLease01522'));
  assert.doesNotMatch(rowBlock, /datasetKey|owner|query/);
});

test('active coordinator lease excludes another worker until expiry', async () => {
  const { context, api, rows } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  assert.equal(first.peerCompleted, false);
  assert.equal(rows.get(first.key).workerId, 'worker-A');

  context.favCatalogWorkerId0141 = 'worker-B';
  const current = rows.get(first.key);
  current.leaseUntil = Date.now() - 1;
  rows.set(first.key, current);
  const second = await api.acquire(scope, Date.now(), new AbortController().signal);
  assert.equal(second.peerCompleted, false);
  assert.notEqual(second.token, first.token);
  assert.equal(rows.get(first.key).workerId, 'worker-B');
});

test('worker that lost its token cannot renew and lease-loss aborts its in-flight crawler', async () => {
  const { context, api, rows, inflight } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  const controller = new AbortController();
  inflight.set(context.favCatalogKey0141(scope), { controller });

  rows.set(first.key, {
    ...rows.get(first.key),
    token:'winner-token',
    workerId:'worker-B',
    leaseUntil:Date.now() + 30_000,
  });
  const guard = { key:first.key, token:first.token, datasetKey:context.favCatalogKey0141(scope), lost:false, error:null };
  assert.equal(await api.renew(guard), false);
  const error = api.markLost(guard);
  assert.equal(error.name, 'AbortError');
  assert.equal(guard.lost, true);
  assert.equal(controller.signal.aborted, true);
});

test('losing worker release cannot delete the newer winner lease', async () => {
  const { api, rows } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  rows.set(first.key, {
    ...rows.get(first.key),
    token:'winner-token',
    workerId:'worker-B',
    leaseUntil:Date.now() + 30_000,
  });
  const released = await api.release({ key:first.key, token:first.token });
  assert.equal(released, false);
  assert.equal(rows.get(first.key).token, 'winner-token');
});

test('Web Locks availability delegates to the established v0.14 path verbatim', async () => {
  const { context, api, priorCalls } = fixture();
  context.navigator.locks = { request: () => {} };
  const work = async () => ({ ok:true });
  const result = await api.withLease(scope, 1, new AbortController().signal, work);
  assert.deepEqual(result, { legacy:true });
  assert.equal(priorCalls.length, 1);
  assert.equal(priorCalls[0][0], scope);
  assert.equal(priorCalls[0][3], work);
});

test('complete snapshot observations are fenced by an awaited coordinator assertion while partial writes are untouched', async () => {
  const { context, api, observes } = fixture();
  const datasetKey = context.favCatalogKey0141(scope);
  api.guards.set(datasetKey, { key:'catalog:test', token:'token', datasetKey, lost:false, error:null });
  let asserts = 0;
  context.favCatalogAssertCoordinatorLease01522 = async () => { asserts += 1; return true; };

  await api.observe([{ id:'1' }], { scope, complete:false, syncState:'running' });
  assert.equal(asserts, 0);
  await api.observe([{ id:'1' }], { scope, complete:true, syncState:'completed' });
  assert.equal(asserts, 1);
  assert.equal(observes.length, 2);
});

test('source keeps immutable snapshot generation as a second stale-commit fence', () => {
  assert.match(source, /61ea's snapshot\s*\n \* generation ordering remains the second\/final stale-commit fence/);
  assert.match(source, /if \(guard\) await favCatalogAssertCoordinatorLease01522\(guard\)/);
});
