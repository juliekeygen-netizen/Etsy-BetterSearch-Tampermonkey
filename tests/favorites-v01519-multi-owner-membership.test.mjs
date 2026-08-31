import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const modulePath = resolve(ROOT, 'src/61eb-favorites-multi-owner-membership.js');

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function scopeKey(owner, type = 'items', id = '', query = '') {
  return [owner, type, id, query].map((part) => encodeURIComponent(String(part))).join('|');
}

function ownerScopeIds(scopes, owner) {
  const all = scopes
    .filter((scope) => String(scope.owner || '') === String(owner) && scope.type === 'items' && !scope.query && scope.complete === true)
    .sort((a, b) => (b.snapshotCommittedAt || b.lastCompleteSyncAt || 0) - (a.snapshotCommittedAt || a.lastCompleteSyncAt || 0))[0];
  if (all) return new Set((all.listingIds || []).map(String));
  return new Set(scopes
    .filter((scope) => String(scope.owner || '') === String(owner) && !scope.query)
    .flatMap((scope) => scope.listingIds || [])
    .map(String));
}

async function createContext(overrides = {}) {
  const source = await readFile(modulePath, 'utf8');
  const localStorage = overrides.localStorage || {
    getItem: () => '1',
    setItem: () => {},
  };
  const context = vm.createContext({
    console,
    structuredClone: globalThis.structuredClone,
    localStorage,
    favIndexScopeKey: (scope) => scope.scopeKey || scopeKey(scope.owner, scope.type, scope.id, scope.query),
    favIndexMergeListing(existing, incoming, observedAt = Date.now()) {
      const staleGlobal = existing?.isFavorite === false && Number(existing?.unfavoritedAt || 0) > Number(observedAt || 0);
      const favoriteScopes = { ...(existing?.favoriteScopes || {}) };
      for (const [key, membership] of Object.entries(incoming?.favoriteScopes || {})) {
        if (staleGlobal && membership?.active === true) continue;
        favoriteScopes[key] = { ...(favoriteScopes[key] || {}), ...membership };
      }
      return {
        ...(existing || {}),
        ...(incoming || {}),
        isFavorite: staleGlobal ? false : incoming?.isFavorite !== false,
        unfavoritedAt: staleGlobal ? existing.unfavoritedAt : (incoming?.isFavorite === false ? observedAt : 0),
        favoriteScopes,
      };
    },
    favIndexApplyScopeCompletion: (listings) => listings,
    favIndexMarkListingUnfavorite: (listing) => listing,
    favIndexMarkUnfavoriteNow: async () => false,
    favIndexMarkUnfavorite: async () => false,
    favCacheMaterializeScope0137(snapshot) {
      return (snapshot?.ids || []).filter((id) => {
        const listing = snapshot.listingById.get(String(id));
        if (!listing || listing.isFavorite !== true) return false;
        return listing.favoriteScopes?.[snapshot.scope.scopeKey]?.active !== false;
      }).map(String);
    },
    favCachePresentationReadyForScope0137(snapshot) {
      return (snapshot?.ids || []).every((id) => {
        const listing = snapshot.listingById.get(String(id));
        if (!listing || listing.isFavorite !== true) return true;
        return listing.favoriteScopes?.[snapshot.scope.scopeKey]?.active !== false;
      });
    },
    favOwnerScopeIds01510: ownerScopeIds,
    favCanonicalAllScope01510(scopes, owner) {
      return scopes
        .filter((scope) => String(scope.owner || '') === String(owner) && scope.type === 'items' && !scope.query && scope.complete === true)
        .sort((a, b) => (b.snapshotCommittedAt || b.lastCompleteSyncAt || 0) - (a.snapshotCommittedAt || a.lastCompleteSyncAt || 0))[0] || null;
    },
    favIndexGetStats: async () => ({}),
    favIndexGetActiveListings: async () => [],
    favRepairListingIntegrity01510(listing, invalid = new Set()) {
      if (!listing) return listing;
      const nextScopes = { ...(listing.favoriteScopes || {}) };
      let changed = false;
      for (const key of invalid) {
        if (Object.hasOwn(nextScopes, key)) {
          delete nextScopes[key];
          changed = true;
        }
      }
      return changed ? { ...listing, favoriteScopes:nextScopes } : listing;
    },
    favIndexOpen: async () => overrides.db || null,
    favIndexRequest: overrides.favIndexRequest || (async () => []),
    favIndexEnqueue: (operation) => Promise.resolve().then(operation),
    favIsOwnFavoritesPage: () => overrides.ownProfile === true,
    favScope: () => ({ owner:overrides.currentOwner || 'ownerA' }),
    ...overrides.globals,
  });
  vm.runInContext(source, context);
  return context;
}

function twoOwnerListing() {
  const a = scopeKey('ownerA');
  const b = scopeKey('ownerB');
  return {
    listingId:'X',
    isFavorite:true,
    unfavoritedAt:0,
    title:'metadata survives',
    metadataRevision:2,
    favoriteScopes:{
      [a]:{ active:true, lastSeenAt:100 },
      [b]:{ active:true, lastSeenAt:100 },
    },
  };
}

test('complete owner-A replacement retires only owner A and preserves owner B', async () => {
  const context = await createContext();
  const listing = twoOwnerListing();
  const a = scopeKey('ownerA');
  const b = scopeKey('ownerB');
  const [next] = context.favIndexApplyScopeCompletion(
    [listing],
    { owner:'ownerA', type:'items', query:'', scopeKey:a, authoritativeFavoriteScope:true },
    new Set(),
    200,
  );

  assert.equal(next.favoriteScopes[a].active, false);
  assert.equal(next.favoriteScopes[a].removedAt, 200);
  assert.equal(next.favoriteScopes[b].active, true);
  assert.equal(next.favoriteScopes[b].removedAt, undefined);
  assert.equal(next.isFavorite, true, 'global compatibility summary stays positive while another owner remains active');
  assert.equal(next.unfavoritedAt, 0);
});

test('other-owner observation is not blocked by a newer global unfavorite timestamp', async () => {
  const context = await createContext();
  const a = scopeKey('ownerA');
  const b = scopeKey('ownerB');
  const existing = {
    listingId:'X',
    isFavorite:false,
    unfavoritedAt:500,
    favoriteScopes:{
      [a]:{ active:false, removedAt:500, lastSeenAt:100 },
    },
  };
  const incomingB = {
    listingId:'X',
    isFavorite:true,
    lastSeenFavoriteAt:200,
    favoriteScopes:{ [b]:{ active:true, lastSeenAt:200 } },
  };
  const next = context.favIndexMergeListing(existing, incomingB, 200);

  assert.equal(next.favoriteScopes[a].active, false);
  assert.equal(next.favoriteScopes[b].active, true);
  assert.equal(next.isFavorite, true);
  assert.equal(next.unfavoritedAt, 0);
});

test('same-scope stale observation cannot resurrect newer removal evidence', async () => {
  const context = await createContext();
  const a = scopeKey('ownerA');
  const existing = {
    listingId:'X',
    isFavorite:false,
    unfavoritedAt:500,
    favoriteScopes:{ [a]:{ active:false, removedAt:500, lastSeenAt:100 } },
  };
  const stale = {
    listingId:'X',
    isFavorite:true,
    lastSeenFavoriteAt:200,
    favoriteScopes:{ [a]:{ active:true, lastSeenAt:200 } },
  };
  const next = context.favIndexMergeListing(existing, stale, 200);

  assert.equal(next.favoriteScopes[a].active, false);
  assert.equal(next.favoriteScopes[a].removedAt, 500);
  assert.equal(next.isFavorite, false);
  assert.equal(next.unfavoritedAt, 500);
});

test('committed owner scope materializes even when legacy global favorite state is false', async () => {
  const context = await createContext();
  const b = scopeKey('ownerB');
  const snapshot = {
    scope:{ owner:'ownerB', type:'items', query:'', scopeKey:b },
    scopeRecord:{ complete:true, listingIds:['X'], scopeKey:b },
    ids:['X'],
    listingById:new Map([['X', {
      listingId:'X',
      isFavorite:false,
      unfavoritedAt:900,
      favoriteScopes:{ [b]:{ active:false, removedAt:900 } },
    }]]),
    shopById:new Map(),
  };

  assert.deepEqual(Array.from(context.favCacheMaterializeScope0137(snapshot)), ['X']);
  assert.equal(context.favCachePresentationReadyForScope0137(snapshot), true);
  assert.equal(snapshot.listingById.get('X').isFavorite, false, 'cache adaptation does not mutate the durable row/view passed in');
});

test('owner-scoped maintenance derives activity from that owner committed IDs, not global isFavorite', async () => {
  const context = await createContext();
  const scopes = [
    { owner:'ownerA', type:'items', query:'', complete:true, listingIds:['A'], snapshotCommittedAt:20 },
    { owner:'ownerB', type:'items', query:'', complete:true, listingIds:['X'], snapshotCommittedAt:30 },
  ];
  const listings = [
    { listingId:'A', isFavorite:true, favoriteScopes:{} },
    { listingId:'X', isFavorite:false, favoriteScopes:{} },
  ];

  assert.deepEqual(
    Array.from(context.favOwnerActiveListings01519(listings, scopes, 'ownerB'), (row) => row.listingId),
    ['X'],
  );
  assert.deepEqual(
    Array.from(context.favOwnerActiveListings01519(listings, scopes, 'ownerA'), (row) => row.listingId),
    ['A'],
  );
});

test('owner-specific direct helper cannot deactivate another owner', async () => {
  const context = await createContext();
  const listing = twoOwnerListing();
  const a = scopeKey('ownerA');
  const b = scopeKey('ownerB');
  const next = context.favIndexMarkListingUnfavoriteForOwner01519(listing, 'ownerA', 300);

  assert.equal(next.favoriteScopes[a].active, false);
  assert.equal(next.favoriteScopes[b].active, true);
  assert.equal(next.isFavorite, true);
  assert.equal(context.favIndexMarkListingUnfavorite(listing, 300), listing, 'ownerless legacy helper fails closed');
});

test('direct unfavorite reads and merges latest row inside one readwrite transaction', async () => {
  let stored = twoOwnerListing();
  stored.metadataRevision = 7;
  const modes = [];
  const db = {
    transaction(_stores, mode) {
      modes.push(mode);
      const tx = {
        oncomplete:null,
        onerror:null,
        onabort:null,
        error:null,
        objectStore() {
          return {
            get() {
              const request = { result:undefined, error:null, onsuccess:null, onerror:null };
              queueMicrotask(() => {
                request.result = clone(stored);
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            put(next) {
              stored = clone(next);
            },
          };
        },
      };
      return tx;
    },
  };
  const context = await createContext({ db, ownProfile:true, currentOwner:'ownerA' });
  const changed = await context.favIndexMarkUnfavoriteNow('X', 400, { owner:'ownerA' });
  const a = scopeKey('ownerA');
  const b = scopeKey('ownerB');

  assert.equal(changed, true);
  assert.deepEqual(modes, ['readwrite']);
  assert.equal(stored.metadataRevision, 7, 'newer unrelated row fields survive the transaction');
  assert.equal(stored.favoriteScopes[a].active, false);
  assert.equal(stored.favoriteScopes[b].active, true);
});

test('public-profile heart path cannot mutate that profile durable membership', async () => {
  let transactions = 0;
  const db = { transaction() { transactions += 1; throw new Error('must not open'); } };
  const context = await createContext({ db, ownProfile:false, currentOwner:'ownerB' });
  assert.equal(await context.favIndexMarkUnfavorite('X'), false);
  assert.equal(transactions, 0);
});

test('repair clears active tombstones and restores positive compatibility summary', async () => {
  const context = await createContext();
  const a = scopeKey('ownerA');
  const listing = {
    listingId:'X',
    isFavorite:false,
    unfavoritedAt:900,
    favoriteScopes:{ [a]:{ active:true, lastSeenAt:800, removedAt:850 } },
  };
  const next = context.favRepairListingIntegrity01510(listing, new Set());
  assert.equal(next.favoriteScopes[a].active, true);
  assert.equal(next.favoriteScopes[a].removedAt, undefined);
  assert.equal(next.isFavorite, true);
  assert.equal(next.unfavoritedAt, 0);
});

test('module loads between cache bootstrap and immutable snapshot writer at release version', async () => {
  const userscript = await readFile(resolve(ROOT, 'etsy-bettersearch.user.js'), 'utf8');
  const cache = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js?v=0.15.22');
  const membership = userscript.indexOf('/src/61eb-favorites-multi-owner-membership.js?v=0.15.22');
  const snapshot = userscript.indexOf('/src/61ea-favorites-immutable-snapshots.js?v=0.15.22');
  assert.ok(cache >= 0 && membership > cache && snapshot > membership);
  assert.match(userscript, /@version\s+0\.15\.22/);
});
