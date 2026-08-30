import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const snapshotSource = await readFile(resolve(ROOT, 'src/61ea-favorites-immutable-snapshots.js'), 'utf8');
const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');

function loadHelpers() {
  const end = snapshotSource.indexOf('/* Supersede the v0.15.3 owner-guarded writer');
  const context = vm.createContext({
    console, Promise, Set, Map, Array, String, Number, Date, Error,
    FAV_INDEX_METADATA_VERSION:1,
  });
  vm.runInContext(`${snapshotSource.slice(0, end)}\nglobalThis.testApi={
    ids:favSnapshotIds0156,
    tx:favSnapshotTransaction0156,
    scope:favSnapshotScopeRecord0156,
    generation:favSnapshotLegacyGeneration0156,
  };`, context);
  return context.testApi;
}

function loadBoundary({ oldScope = null, expectedTotal = 0, cacheRead = async () => null, catalogRefresh = null } = {}) {
  const writes = [];
  const absenceCalls = [];
  const transactions = [];
  let currentScope = oldScope ? structuredClone(oldScope) : null;
  let currentListings = (currentScope?.listingIds || []).map((id) => ({
    listingId:String(id), isFavorite:true, favoriteScopes:{ scope:{ active:true } },
  }));
  const state = {
    records:[{ id:'old' }],
    recordsById:new Map([['old', { id:'old' }]]),
    total:1,
    loadKey:'dataset',
    loadComplete:true,
    loading:false,
    loadSource0137:'cache',
    groupQueryResolved:true,
    extraReady:true,
    extraKey:'extra',
    cacheScope0137:{ snapshotGeneration:'old-generation' },
    cachePresentationReady0137:true,
  };

  /* A small IndexedDB transaction model. Readwrite transactions that touch the
   * same stores are activated in creation order. Crucially, get() producers read
   * the shared state only when that transaction becomes active, so the second
   * transaction observes writes committed by the first just like IndexedDB. */
  const transactionQueue = [];
  let activeTransaction = null;

  function finishTransaction(tx, aborted = false) {
    if (activeTransaction !== tx) return;
    activeTransaction = null;
    queueMicrotask(() => {
      if (aborted) tx.onabort?.();
      else tx.oncomplete?.();
      pumpTransactions();
    });
  }

  function pumpTransactions() {
    if (activeTransaction || !transactionQueue.length) return;
    const tx = transactionQueue.shift();
    activeTransaction = tx;
    queueMicrotask(() => {
      if (tx.aborted) return finishTransaction(tx, true);
      for (const job of tx.readJobs.splice(0)) {
        if (tx.aborted) break;
        try { job(); }
        catch (error) {
          tx.error = error;
          tx.onerror?.();
          tx.aborted = true;
          break;
        }
      }
      if (tx.aborted) finishTransaction(tx, true);
    });
  }

  function createRequest(tx, producer) {
    const request = { result:undefined, error:null, onsuccess:null, onerror:null };
    tx.readJobs.push(() => {
      try {
        request.result = structuredClone(producer());
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        request.onerror?.();
        throw error;
      }
    });
    return request;
  }

  const db = {
    transaction(storeNames, mode) {
      assert.equal(mode, 'readwrite', 'snapshot observation must use one readwrite transaction');
      const tx = {
        mode,
        storeNames:[...storeNames],
        readJobs:[],
        aborted:false,
        error:null,
        oncomplete:null,
        onerror:null,
        onabort:null,
        abort() {
          if (this.aborted) return;
          this.aborted = true;
          if (activeTransaction === this) finishTransaction(this, true);
        },
        objectStore(name) {
          if (name === 'listings') return {
            getAll:() => createRequest(tx, () => currentListings),
            get:(id) => createRequest(tx, () => currentListings.find((listing) => String(listing.listingId) === String(id))),
            put:(value) => {
              const saved = structuredClone(value);
              writes.push({ store:'listings', value:saved });
              const index = currentListings.findIndex((listing) => String(listing.listingId) === String(saved.listingId));
              if (index >= 0) currentListings[index] = saved;
              else currentListings.push(saved);
            },
          };
          if (name === 'shops') return {
            get:() => createRequest(tx, () => undefined),
            put:(value) => writes.push({ store:'shops', value:structuredClone(value) }),
          };
          if (name === 'scopes') return {
            get:() => createRequest(tx, () => currentScope),
            put:(value) => {
              const saved = structuredClone(value);
              writes.push({ store:'scopes', value:saved });
              currentScope = saved;
              queueMicrotask(() => {
                if (!tx.aborted) finishTransaction(tx, false);
              });
            },
          };
          throw new Error(`Unexpected store ${name}`);
        },
      };
      transactions.push(tx);
      transactionQueue.push(tx);
      pumpTransactions();
      return tx;
    },
  };

  const context = vm.createContext({
    console, Promise, Set, Map, Array, String, Number, Date, Error,
    FAV_INDEX_METADATA_VERSION:1,
    favState:state,
    favIndexObserveRecordsNow: async () => [],
    favCacheReadScope0137: (...args) => cacheRead(...args),
    favCatalogRefresh: catalogRefresh || (() => Promise.resolve([])),
    favIndexCurrentScope: () => ({ owner:'owner', type:'items', id:'', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true }),
    favScopeOwner0153: (scope) => String(scope?.owner || '').trim(),
    favIndexScopeKey: (scope) => String(scope?.scopeKey || 'scope'),
    favIndexPatchFromRecord: (record) => ({ listingId:String(record.id), title:String(record.title || ''), favoriteScopes:{} }),
    favIndexMergeListing: (existing, patch) => ({ ...(existing || {}), ...patch, isFavorite:true, favoriteScopes:existing?.favoriteScopes || {} }),
    favIndexMergeShop: (_existing, patch) => patch,
    favIndexApplyScopeCompletion: (listings) => {
      absenceCalls.push(listings.map((listing) => String(listing.listingId)));
      return listings.map((listing) => ({ ...listing, removed:true }));
    },
    favIndexOpen: async () => db,
    favCatalogStates0141:new Map([['dataset', { expectedTotal }]]),
    favCatalogKey0141: (scope) => String(scope?.datasetKey || 'dataset'),
    favCatalogDescriptor0141: (scope) => ({ ...scope, datasetKey:String(scope?.datasetKey || 'dataset'), scopeKey:String(scope?.scopeKey || 'scope') }),
    favCatalogIsCurrent0141: (scope) => String(scope?.datasetKey || 'dataset') === 'dataset',
    favDatasetKey: () => 'dataset',
    isFavoritesPage: () => true,
    structuredClone,
  });
  vm.runInContext(`${snapshotSource}\nglobalThis.testApi={
    observe:(records, options)=>favIndexObserveRecordsNow(records, options),
    readCache:(scope)=>favCacheReadScope0137(scope),
    refresh:(scope, options)=>favCatalogRefresh(scope, options),
    state:favState,
  };`, context);
  context.testApi.writes = writes;
  context.testApi.absenceCalls = absenceCalls;
  context.testApi.transactions = transactions;
  context.testApi.setOldScope = (value) => {
    currentScope = value ? structuredClone(value) : null;
    currentListings = (currentScope?.listingIds || []).map((id) => ({
      listingId:String(id), isFavorite:true, favoriteScopes:{ scope:{ active:true } },
    }));
  };
  return context.testApi;
}

function lastScopeWrite(api) {
  return api.writes.filter((entry) => entry.store === 'scopes').at(-1)?.value || null;
}

test('immutable snapshot module is wired after cache bootstrap and before route identity', () => {
  const cache = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js');
  const snapshots = userscript.indexOf('/src/61ea-favorites-immutable-snapshots.js');
  const route = userscript.indexOf('/src/61f-favorites-route-identity.js');
  assert.ok(cache >= 0 && snapshots > cache && route > snapshots);
});

test('partial running pages never mutate committed listingIds', () => {
  const api = loadHelpers();
  const old = {
    scopeKey:'scope', complete:true, listingIds:['old-a','old-b'],
    lastCompleteSyncAt:100, snapshotCommittedAt:100,
    snapshotGeneration:'committed-1', lastSyncState:'completed',
  };
  const tx1 = api.tx(old, 'scope', { syncState:'running', snapshotGeneration:'refresh-2', snapshotStartedAt:200 }, 210, false);
  const page1 = api.scope(old, { owner:'owner' }, 'scope', ['new-a'], 210, { syncState:'running' }, tx1, false);
  assert.deepEqual(Array.from(page1.listingIds), ['old-a','old-b']);
  assert.deepEqual(Array.from(page1.pendingListingIds), ['new-a']);
  assert.equal(page1.complete, true);
  assert.equal(page1.snapshotGeneration, 'committed-1');
  assert.equal(page1.pendingGeneration, 'refresh-2');

  const tx2 = api.tx(page1, 'scope', { syncState:'running' }, 220, false);
  const page2 = api.scope(page1, { owner:'owner' }, 'scope', ['new-b'], 220, { syncState:'running' }, tx2, false);
  assert.deepEqual(Array.from(page2.listingIds), ['old-a','old-b']);
  assert.deepEqual(Array.from(page2.pendingListingIds), ['new-a','new-b']);
  assert.equal(page2.snapshotGeneration, 'committed-1');
});

test('a failed partial generation stays non-authoritative and the next running refresh starts fresh', () => {
  const api = loadHelpers();
  const old = {
    scopeKey:'scope', complete:true, listingIds:['old'], snapshotGeneration:'committed-1',
    snapshotCommittedAt:100, lastCompleteSyncAt:100, lastSyncState:'running',
    pendingListingIds:['stale-a'], pendingGeneration:'failed-gen', pendingStartedAt:200,
  };
  const partialTx = api.tx(old, 'scope', { syncState:'partial' }, 230, false);
  const failed = api.scope(old, {}, 'scope', ['stale-b'], 230, { syncState:'partial' }, partialTx, false);
  assert.deepEqual(Array.from(failed.listingIds), ['old']);
  assert.deepEqual(Array.from(failed.pendingListingIds), ['stale-a','stale-b']);

  const retryTx = api.tx(failed, 'scope', { syncState:'running' }, 300, false);
  assert.notEqual(retryTx.generation, 'failed-gen');
  const retry = api.scope(failed, {}, 'scope', ['fresh-a'], 300, { syncState:'running' }, retryTx, false);
  assert.deepEqual(Array.from(retry.listingIds), ['old']);
  assert.deepEqual(Array.from(retry.pendingListingIds), ['fresh-a']);
});

test('verified complete commit atomically swaps membership and clears pending state', () => {
  const api = loadHelpers();
  const old = {
    scopeKey:'scope', complete:true, listingIds:['old-a','old-b'], snapshotGeneration:'committed-1',
    snapshotCommittedAt:100, lastCompleteSyncAt:100, lastSyncState:'running',
    pendingListingIds:['new-a'], pendingGeneration:'refresh-2', pendingStartedAt:200,
  };
  const tx = api.tx(old, 'scope', { syncState:'completed' }, 250, true);
  const committed = api.scope(old, { owner:'owner' }, 'scope', ['new-a','new-b'], 250, { syncState:'completed' }, tx, true);
  assert.deepEqual(Array.from(committed.listingIds), ['new-a','new-b']);
  assert.deepEqual(Array.from(committed.pendingListingIds), []);
  assert.equal(committed.snapshotGeneration, 'refresh-2');
  assert.equal(committed.snapshotCommittedAt, 250);
  assert.equal(committed.lastCompleteSyncAt, 250);
  assert.equal(committed.committedTotal, 2);
});

test('final writer preserves old committed membership during running observations', async () => {
  const old = {
    owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset',
    complete:true, listingIds:['old-a','old-b'], snapshotGeneration:'committed-1',
    snapshotCommittedAt:100, lastCompleteSyncAt:100, lastSyncState:'completed',
  };
  const api = loadBoundary({ oldScope:old });
  await api.observe([{ id:'new-a' }], {
    scope:{ owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset' },
    complete:false, syncState:'running', snapshotGeneration:'refresh-2', snapshotStartedAt:200, observedAt:210,
  });
  const saved = lastScopeWrite(api);
  assert.deepEqual(saved.listingIds, ['old-a','old-b']);
  assert.deepEqual(saved.pendingListingIds, ['new-a']);
  assert.equal(saved.complete, true);
  assert.equal(saved.snapshotGeneration, 'committed-1');
  assert.equal(api.transactions.length, 1);
  assert.equal(api.transactions[0].mode, 'readwrite');
});

test('expected-total mismatch rejects a complete commit before any database write or absence reconciliation', async () => {
  const old = {
    owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true,
    complete:true, listingIds:['old'], snapshotGeneration:'committed-1', snapshotCommittedAt:100,
    lastCompleteSyncAt:100, lastSyncState:'running', pendingGeneration:'refresh-2', pendingStartedAt:200,
  };
  const api = loadBoundary({ oldScope:old, expectedTotal:2 });
  await assert.rejects(
    api.observe([{ id:'only-one' }], {
      scope:{ owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true },
      complete:true, syncState:'completed', observedAt:250,
    }),
    /complete snapshot count mismatch/,
  );
  assert.equal(api.writes.length, 0);
  assert.equal(api.absenceCalls.length, 0);
});

test('accepted complete generation reconciles absence only at the commit boundary', async () => {
  const old = {
    owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true,
    complete:true, listingIds:['keep','gone'], snapshotGeneration:'committed-1', snapshotCommittedAt:100,
    lastCompleteSyncAt:100, lastSyncState:'running', pendingGeneration:'refresh-2', pendingStartedAt:200,
  };
  const api = loadBoundary({ oldScope:old, expectedTotal:1 });
  await api.observe([{ id:'keep' }], {
    scope:{ owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true },
    complete:true, syncState:'completed', observedAt:250,
  });
  assert.deepEqual(api.absenceCalls, [['gone']]);
  const saved = lastScopeWrite(api);
  assert.deepEqual(saved.listingIds, ['keep']);
  assert.deepEqual(saved.pendingListingIds, []);
  assert.equal(saved.complete, true);
});

test('overlapping cross-tab-style observations cannot let a stale partial writer regress a newer committed generation', async () => {
  const old = {
    owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true,
    complete:true, listingIds:['old'], snapshotGeneration:'committed-1', snapshotCommittedAt:100,
    lastCompleteSyncAt:100, lastSyncState:'completed',
  };

  for (const staleFirst of [true, false]) {
    const api = loadBoundary({ oldScope:old, expectedTotal:1 });
    const stale = () => api.observe([{ id:'stale-page' }], {
      scope:{ owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true },
      complete:false, syncState:'running', snapshotGeneration:'stale-refresh', snapshotStartedAt:150, observedAt:160,
    });
    const commit = () => api.observe([{ id:'current' }], {
      scope:{ owner:'owner', type:'items', scopeKey:'scope', datasetKey:'dataset', authoritativeFavoriteScope:true },
      complete:true, syncState:'completed', snapshotGeneration:'current-refresh', snapshotStartedAt:200, observedAt:250,
    });
    await Promise.all(staleFirst ? [stale(), commit()] : [commit(), stale()]);
    const saved = lastScopeWrite(api);
    assert.equal(saved.snapshotGeneration, 'current-refresh', `current generation must win with staleFirst=${staleFirst}`);
    assert.equal(saved.snapshotCommittedAt, 250);
    assert.deepEqual(saved.listingIds, ['current']);
    assert.ok(api.transactions.every((tx) => tx.mode === 'readwrite'));
  }
});

test('atomic observation path never calls the old separate readonly-snapshot/write helpers', () => {
  const start = snapshotSource.indexOf('async function favSnapshotObserveAtomic0159');
  const end = snapshotSource.indexOf('/* Supersede the v0.15.3 owner-guarded writer', start);
  const block = snapshotSource.slice(start, end);
  assert.match(block, /db\.transaction\(\['listings', 'shops', 'scopes'\], 'readwrite'\)/);
  assert.doesNotMatch(block, /favIndexReadObservation/);
  assert.doesNotMatch(block, /favIndexWrite/);
});

test('ownerless observations remain rejected after the final snapshot writer override', async () => {
  const api = loadBoundary();
  const result = await api.observe([{ id:'1' }], { scope:{ owner:'', type:'items', scopeKey:'scope', datasetKey:'dataset' } });
  assert.deepEqual(Array.from(result), []);
  assert.equal(api.writes.length, 0);
  assert.equal(api.transactions.length, 0);
});

test('cache rejects unsafe mutable legacy running snapshots but accepts immutable v2 pending refreshes', async () => {
  const unsafe = loadBoundary({ cacheRead:async () => ({
    scopeRecord:{ complete:true, listingIds:['a'], lastCompleteSyncAt:100, lastSyncState:'running' }, ids:['a'],
  }) });
  assert.equal(await unsafe.readCache({ scopeKey:'scope' }), null);

  const safeRecord = {
    complete:true, listingIds:['a'], snapshotSemanticsVersion:2, snapshotGeneration:'g1',
    snapshotCommittedAt:100, lastCompleteSyncAt:100, lastSyncState:'running',
    pendingListingIds:['b'], pendingGeneration:'g2',
  };
  const safe = loadBoundary({ cacheRead:async () => ({ scopeRecord:safeRecord, ids:['a'] }) });
  const snapshot = await safe.readCache({ scopeKey:'scope' });
  assert.equal(snapshot.scopeRecord.snapshotGeneration, 'g1');
  assert.deepEqual(snapshot.ids, ['a']);
});

test('live refresh keeps the previous complete snapshot authoritative while replacement is in flight and restores it on failure', async () => {
  let rejectRefresh;
  const deferred = new Promise((_resolve, reject) => { rejectRefresh = reject; });
  const api = loadBoundary({
    catalogRefresh:() => {
      api.state.loadComplete = false;
      api.state.loading = true;
      api.state.records = [];
      api.state.recordsById = new Map();
      api.state.total = 0;
      return deferred;
    },
  });
  const oldRecords = api.state.records;
  const promise = api.refresh({ owner:'owner', scopeKey:'scope', datasetKey:'dataset' }, {});
  assert.equal(api.state.loadComplete, true);
  assert.equal(api.state.records, oldRecords);
  assert.equal(api.state.total, 1);
  assert.equal(api.state.loading, true);
  rejectRefresh(new Error('network'));
  await assert.rejects(promise, /network/);
  assert.equal(api.state.loadComplete, true);
  assert.equal(api.state.records, oldRecords);
  assert.equal(api.state.total, 1);
});

test('successful live refresh swaps to the new committed records only after the underlying refresh resolves', async () => {
  let resolveRefresh;
  const deferred = new Promise((resolve) => { resolveRefresh = resolve; });
  const api = loadBoundary({
    catalogRefresh:() => {
      api.state.loadComplete = false;
      api.state.loading = true;
      return deferred.then(() => {
        api.state.records = [{ id:'new' }];
        api.state.recordsById = new Map([['new', { id:'new' }]]);
        api.state.total = 1;
        api.state.loadComplete = true;
        api.state.loadSource0137 = 'network';
        api.state.cacheScope0137 = { snapshotGeneration:'new-generation' };
        return api.state.records;
      });
    },
  });
  const oldRecords = api.state.records;
  const promise = api.refresh({ owner:'owner', scopeKey:'scope', datasetKey:'dataset' }, {});
  assert.equal(api.state.records, oldRecords);
  assert.equal(api.state.loadComplete, true);
  resolveRefresh();
  const records = await promise;
  assert.equal(records[0].id, 'new');
  assert.equal(api.state.records[0].id, 'new');
  assert.equal(api.state.loadComplete, true);
});
