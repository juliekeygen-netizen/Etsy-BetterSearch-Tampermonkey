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
  const rows = new Map();
  let sleepHook = null;

  const context = vm.createContext({
    console,
    Date,
    Math,
    Map,
    Promise,
    DOMException,
    AbortController,
    navigator: {},
    FAV_INDEX_METADATA_VERSION: 6,
    FAV_CATALOG_LEASE_MS0141: 30_000,
    FAV_CATALOG_LEASE_POLL_MS0141: 250,
    favCatalogWorkerId0141: 'worker-A',
    favCatalogInflight0141: inflight,
    favCatalogKey0141: (value) => `${value.owner}|${value.type}|${value.id}|q:${value.query || ''}`,
    favIndexScopeKey: (value) => value.scopeKey || `scope:${value.owner}:${value.type}:${value.id}:${value.query || ''}`,
    favIndexGetScope: async (key) => rows.get(String(key)) || null,
    favIndexOpen: async () => { throw new Error('test replaces the coordinator mutation helper before IndexedDB access'); },
    favSnapshotLegacyGeneration0156: (record) => {
      const explicit = String(record?.snapshotGeneration || '');
      if (explicit) return explicit;
      const committedAt = Math.max(0, Number(record?.snapshotCommittedAt) || Number(record?.lastCompleteSyncAt) || 0);
      return record?.complete && committedAt ? `legacy:${record.scopeKey}:${committedAt}` : '';
    },
    favSnapshotScopeRecord0156: (oldScope, passedScope, scopeKey, observedIds, observedAt, options, transaction, commitSnapshot) => ({
      base:true,
      oldScope,
      passedScope,
      scopeKey,
      observedIds,
      observedAt,
      options,
      transaction,
      commitSnapshot,
    }),
    favIndexCurrentScope: () => ({ owner:'owner', type:'items', id:'', query:'', scopeKey:'scope' }),
    favCatalogWithCrossTabLease0141: async (...args) => {
      priorCalls.push(args);
      return { legacy:true };
    },
    favIndexObserveRecords: async (records, options) => {
      observes.push({ records, options });
      return records;
    },
    sleep: async (...args) => sleepHook?.(...args),
    setInterval: () => 1,
    clearInterval: () => {},
  });

  vm.runInContext(`${source}\nglobalThis.testApi={
    acquire:favCatalogAcquireCoordinatorLease01522,
    renew:favCatalogRenewCoordinatorLease01522,
    release:favCatalogReleaseCoordinatorLease01522,
    markLost:favCatalogMarkCoordinatorLeaseLost01522,
    assertLease:favCatalogAssertCoordinatorLease01522,
    withLease:favCatalogWithCrossTabLease0141,
    observe:favIndexObserveRecords,
    scopeRecord:favSnapshotScopeRecord0156,
    peerCompleted:favCatalogCoordinatorPeerCompleted01522,
    guards:favCatalogCoordinatorGuards01522,
  };`, context);

  context.favCatalogCoordinatorMutateScope01522 = async (passedScope, mutator) => {
    const scopeKey = context.favIndexScopeKey(passedScope);
    const result = mutator(rows.get(scopeKey) || null, scopeKey) || { value:null };
    if (result.row) rows.set(scopeKey, { ...result.row });
    return result.value;
  };

  return {
    context,
    api:context.testApi,
    rows,
    priorCalls,
    observes,
    inflight,
    setSleepHook: (hook) => { sleepHook = hook; },
  };
}

const scope = { owner:'private-owner', type:'items', id:'', query:'private search words', scopeKey:'scope' };

function guardFor(context, token) {
  return {
    token,
    datasetKey:context.favCatalogKey0141(scope),
    scope:{ ...scope },
    scopeKey:'scope',
    baselineGeneration:'',
    lost:false,
    error:null,
  };
}

test('v0.15.22 is wired after immutable snapshots and before route identity', () => {
  const immutable = userscript.indexOf('/src/61ea-favorites-immutable-snapshots.js');
  const coordinator = userscript.indexOf('/src/61ec-favorites-catalog-coordinator.js');
  const route = userscript.indexOf('/src/61f-favorites-route-identity.js');
  assert.ok(immutable > 0 && coordinator > immutable && route > coordinator);
});

test('fallback coordinator serializes on the existing scopes store and retires executable localStorage election', () => {
  const executable = executableSource(source);
  assert.match(source, /db\.transaction\('scopes', 'readwrite'\)/);
  assert.match(source, /store\.get\(scopeKey\)/);
  assert.match(source, /store\.put\(result\.row\)/);
  assert.doesNotMatch(executable, /\blocalStorage\b|favCatalogAcquireStorageLease0141|favCatalogReadLease0141|favCatalogWriteLease0141/);
  assert.doesNotMatch(executable, /indexedDB\.open\(/);
});

test('atomic acquisition claims the canonical scope with one exact coordinator generation', async () => {
  const { api, rows } = fixture();
  const lease = await api.acquire(scope, Date.now(), new AbortController().signal);
  const row = rows.get('scope');
  assert.equal(lease.peerCompleted, false);
  assert.ok(lease.token.startsWith('worker-A:'));
  assert.equal(row.catalogCoordinatorGeneration, lease.token);
  assert.equal(row.catalogCoordinatorLeaseToken, lease.token);
  assert.equal(row.catalogCoordinatorWorkerId, 'worker-A');
  assert.ok(row.catalogCoordinatorLeaseUntil > Date.now());
  assert.equal(row.owner, 'private-owner');
  assert.equal(row.complete, false);
});

test('an active lease owned by another worker cannot be acquired', async () => {
  const { context, api, rows, setSleepHook } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  const firstToken = first.token;
  context.favCatalogWorkerId0141 = 'worker-B';
  setSleepHook(async () => { throw new Error('blocked-on-active-lease'); });

  await assert.rejects(
    api.acquire(scope, Date.now(), new AbortController().signal),
    /blocked-on-active-lease/,
  );
  assert.equal(rows.get('scope').catalogCoordinatorLeaseToken, firstToken);
  assert.equal(rows.get('scope').catalogCoordinatorWorkerId, 'worker-A');
});

test('an expired lease can be atomically taken over with a new generation', async () => {
  const { context, api, rows } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  rows.set('scope', { ...rows.get('scope'), catalogCoordinatorLeaseUntil:Date.now() - 1 });
  context.favCatalogWorkerId0141 = 'worker-B';

  const second = await api.acquire(scope, Date.now(), new AbortController().signal);
  const row = rows.get('scope');
  assert.equal(second.peerCompleted, false);
  assert.notEqual(second.token, first.token);
  assert.equal(row.catalogCoordinatorGeneration, second.token);
  assert.equal(row.catalogCoordinatorLeaseToken, second.token);
  assert.equal(row.catalogCoordinatorWorkerId, 'worker-B');
});

test('peer completion requires a newly committed snapshot generation, not only a newer timestamp', async () => {
  const { context, api, rows, setSleepHook } = fixture();
  const requestedAt = Date.now();
  rows.set('scope', {
    ...scope,
    listingIds:['1'],
    complete:true,
    snapshotGeneration:'old-generation',
    snapshotCommittedAt:requestedAt - 100,
    lastCompleteSyncAt:requestedAt - 100,
    catalogCoordinatorGeneration:'peer-token',
    catalogCoordinatorLeaseToken:'peer-token',
    catalogCoordinatorWorkerId:'worker-B',
    catalogCoordinatorLeaseUntil:requestedAt + 30_000,
  });
  context.favCatalogWorkerId0141 = 'worker-A';
  let slept = false;
  setSleepHook(async () => {
    if (slept) return;
    slept = true;
    rows.set('scope', {
      ...rows.get('scope'),
      snapshotGeneration:'new-generation',
      snapshotCommittedAt:requestedAt + 1,
      lastCompleteSyncAt:requestedAt + 1,
      catalogCoordinatorLeaseToken:'',
      catalogCoordinatorWorkerId:'',
      catalogCoordinatorLeaseUntil:0,
    });
  });

  const result = await api.acquire(scope, requestedAt, new AbortController().signal);
  assert.equal(result.peerCompleted, true);
  assert.equal(rows.get('scope').snapshotGeneration, 'new-generation');
  assert.equal(rows.get('scope').catalogCoordinatorLeaseToken, '');
});

test('timestamp-only peer completion with the same generation is not accepted', async () => {
  const { context, api, rows, setSleepHook } = fixture();
  const requestedAt = Date.now();
  rows.set('scope', {
    ...scope,
    listingIds:['1'],
    complete:true,
    snapshotGeneration:'same-generation',
    snapshotCommittedAt:requestedAt - 100,
    lastCompleteSyncAt:requestedAt - 100,
    catalogCoordinatorGeneration:'peer-token',
    catalogCoordinatorLeaseToken:'peer-token',
    catalogCoordinatorWorkerId:'worker-B',
    catalogCoordinatorLeaseUntil:requestedAt + 30_000,
  });
  context.favCatalogWorkerId0141 = 'worker-A';
  let slept = false;
  setSleepHook(async () => {
    if (slept) return;
    slept = true;
    rows.set('scope', {
      ...rows.get('scope'),
      snapshotCommittedAt:requestedAt + 1,
      lastCompleteSyncAt:requestedAt + 1,
      catalogCoordinatorLeaseToken:'',
      catalogCoordinatorWorkerId:'',
      catalogCoordinatorLeaseUntil:0,
    });
  });

  const result = await api.acquire(scope, requestedAt, new AbortController().signal);
  assert.equal(result.peerCompleted, false);
  assert.notEqual(rows.get('scope').catalogCoordinatorGeneration, 'peer-token');
  assert.ok(rows.get('scope').catalogCoordinatorLeaseToken.startsWith('worker-A:'));
});

test('worker that loses the active token cannot renew and lease-loss aborts its in-flight crawler', async () => {
  const { context, api, rows, inflight } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  const controller = new AbortController();
  inflight.set(context.favCatalogKey0141(scope), { controller });
  rows.set('scope', {
    ...rows.get('scope'),
    catalogCoordinatorGeneration:'winner-token',
    catalogCoordinatorLeaseToken:'winner-token',
    catalogCoordinatorWorkerId:'worker-B',
    catalogCoordinatorLeaseUntil:Date.now() + 30_000,
  });
  const guard = guardFor(context, first.token);

  assert.equal(await api.renew(guard), false);
  const error = api.markLost(guard);
  assert.equal(error.name, 'AbortError');
  assert.equal(guard.lost, true);
  assert.equal(controller.signal.aborted, true);
});

test('losing release cannot clear a newer winner, while owner release retains the durable generation fence', async () => {
  const { context, api, rows } = fixture();
  const first = await api.acquire(scope, Date.now(), new AbortController().signal);
  rows.set('scope', { ...rows.get('scope'), catalogCoordinatorLeaseUntil:Date.now() - 1 });
  context.favCatalogWorkerId0141 = 'worker-B';
  const second = await api.acquire(scope, Date.now(), new AbortController().signal);

  assert.equal(await api.release(guardFor(context, first.token)), false);
  assert.equal(rows.get('scope').catalogCoordinatorLeaseToken, second.token);
  assert.equal(await api.release(guardFor(context, second.token)), true);
  assert.equal(rows.get('scope').catalogCoordinatorGeneration, second.token);
  assert.equal(rows.get('scope').catalogCoordinatorLeaseToken, '');
  assert.equal(rows.get('scope').catalogCoordinatorLeaseUntil, 0);
});

test('Web Locks availability delegates to the established v0.14 path verbatim', async () => {
  const { context, api, priorCalls } = fixture();
  context.navigator.locks = { request: () => {} };
  const work = async () => ({ ok:true });
  const result = await api.withLease(scope, 1, new AbortController().signal, work);
  assert.equal(result.legacy, true);
  assert.equal(priorCalls.length, 1);
  assert.equal(priorCalls[0][0], scope);
  assert.equal(priorCalls[0][3], work);
});

test('complete observations carry the active generation into the snapshot transaction while partial writes remain untouched', async () => {
  const { context, api, rows, observes } = fixture();
  const token = 'worker-A:token';
  rows.set('scope', {
    ...scope,
    complete:false,
    listingIds:[],
    catalogCoordinatorGeneration:token,
    catalogCoordinatorLeaseToken:token,
    catalogCoordinatorWorkerId:'worker-A',
    catalogCoordinatorLeaseUntil:Date.now() + 30_000,
  });
  api.guards.set(context.favCatalogKey0141(scope), guardFor(context, token));

  await api.observe([{ id:'1' }], { scope, complete:false, syncState:'running' });
  assert.equal(observes[0].options.catalogCoordinatorGeneration, undefined);
  await api.observe([{ id:'1' }], { scope, complete:true, syncState:'completed' });
  assert.equal(observes[1].options.catalogCoordinatorGeneration, token);
});

test('snapshot commit fence accepts only the exact live coordinator generation', () => {
  const { api } = fixture();
  const token = 'worker-A:token';
  const liveScope = {
    ...scope,
    catalogCoordinatorGeneration:token,
    catalogCoordinatorLeaseToken:token,
    catalogCoordinatorLeaseUntil:Date.now() + 30_000,
  };
  const args = [liveScope, scope, 'scope', ['1'], Date.now(), { catalogCoordinatorGeneration:token }, { generation:'g', startedAt:Date.now() }, true];
  assert.equal(api.scopeRecord(...args).base, true);

  assert.throws(
    () => api.scopeRecord({ ...liveScope, catalogCoordinatorGeneration:'new-owner' }, ...args.slice(1)),
    (error) => error?.name === 'AbortError',
  );
  assert.throws(
    () => api.scopeRecord({ ...liveScope, catalogCoordinatorLeaseToken:'new-owner' }, ...args.slice(1)),
    (error) => error?.name === 'AbortError',
  );
  assert.throws(
    () => api.scopeRecord({ ...liveScope, catalogCoordinatorLeaseUntil:Date.now() - 1 }, ...args.slice(1)),
    (error) => error?.name === 'AbortError',
  );
});

test('snapshot fence is opt-in so the established Web Locks complete path remains unchanged', () => {
  const { api } = fixture();
  const result = api.scopeRecord(
    { ...scope, complete:true }, scope, 'scope', ['1'], Date.now(), {}, { generation:'g', startedAt:Date.now() }, true,
  );
  assert.equal(result.base, true);
});
