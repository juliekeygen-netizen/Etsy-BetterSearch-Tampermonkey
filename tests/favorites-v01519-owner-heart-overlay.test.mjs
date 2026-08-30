import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { ROOT } from '../scripts/project.mjs';

const sourcePath = resolve(ROOT, 'src/61eb-favorites-multi-owner-membership.js');

function key(owner) {
  return [owner, 'items', '', ''].map((part) => encodeURIComponent(String(part))).join('|');
}

async function context() {
  const source = await readFile(sourcePath, 'utf8');
  const ctx = vm.createContext({
    console,
    structuredClone: globalThis.structuredClone,
    localStorage:{ getItem:() => '1', setItem:() => {} },
    favIndexScopeKey:(scope) => scope.scopeKey,
    favIndexMergeListing(existing, incoming) {
      return { ...(existing || {}), ...(incoming || {}), favoriteScopes:{ ...(existing?.favoriteScopes || {}) } };
    },
    favIndexApplyScopeCompletion:(rows) => rows,
    favIndexMarkListingUnfavorite:(row) => row,
    favIndexMarkUnfavoriteNow:async () => false,
    favIndexMarkUnfavorite:async () => false,
    favCacheMaterializeScope0137(snapshot) {
      return snapshot.ids.filter((id) => {
        const listing = snapshot.listingById.get(String(id));
        return listing?.isFavorite === true
          && listing.favoriteScopes?.[snapshot.scope.scopeKey]?.active !== false;
      });
    },
    favCachePresentationReadyForScope0137:() => true,
    favOwnerScopeIds01510(scopes, owner) {
      const canonical = scopes.find((scope) => scope.owner === owner && scope.type === 'items' && scope.complete && !scope.query);
      return new Set((canonical?.listingIds || []).map(String));
    },
    favCanonicalAllScope01510(scopes, owner) {
      return scopes.find((scope) => scope.owner === owner && scope.type === 'items' && scope.complete && !scope.query) || null;
    },
    favIndexGetStats:async () => ({}),
    favIndexGetActiveListings:async () => [],
    favRepairListingIntegrity01510:(listing) => listing,
    favIndexOpen:async () => null,
    favIndexRequest:async () => [],
    favIndexEnqueue:(operation) => Promise.resolve().then(operation),
    favIsOwnFavoritesPage:() => true,
    favScope:() => ({ owner:'ownerA' }),
  });
  vm.runInContext(source, ctx);
  return ctx;
}

test('trusted own-heart removal newer than snapshot suppresses committed cache membership', async () => {
  const ctx = await context();
  const scopeKey = key('ownerA');
  const snapshot = {
    scope:{ owner:'ownerA', type:'items', scopeKey },
    scopeRecord:{ owner:'ownerA', type:'items', scopeKey, complete:true, listingIds:['X'], snapshotCommittedAt:100 },
    ids:['X'],
    listingById:new Map([['X', {
      listingId:'X',
      isFavorite:false,
      unfavoritedAt:200,
      favoriteScopes:{
        [scopeKey]:{ active:false, removedAt:200, removalSource:'viewer-own-native-heart' },
      },
    }]]),
  };

  assert.deepEqual(Array.from(ctx.favCacheMaterializeScope0137(snapshot)), []);
  assert.equal(ctx.favTrustedOwnHeartRemoval01519(snapshot.listingById.get('X'), scopeKey, snapshot.scopeRecord), true);
});

test('legacy contradictory inactive membership cannot veto immutable committed snapshot', async () => {
  const ctx = await context();
  const scopeKey = key('ownerA');
  const snapshot = {
    scope:{ owner:'ownerA', type:'items', scopeKey },
    scopeRecord:{ owner:'ownerA', type:'items', scopeKey, complete:true, listingIds:['X'], snapshotCommittedAt:100 },
    ids:['X'],
    listingById:new Map([['X', {
      listingId:'X',
      isFavorite:false,
      unfavoritedAt:200,
      favoriteScopes:{ [scopeKey]:{ active:false, removedAt:200 } },
    }]]),
  };

  assert.deepEqual(Array.from(ctx.favCacheMaterializeScope0137(snapshot)), ['X']);
});

test('heart removal older than the committed generation is superseded by the snapshot', async () => {
  const ctx = await context();
  const scopeKey = key('ownerA');
  const listing = {
    listingId:'X',
    isFavorite:false,
    favoriteScopes:{
      [scopeKey]:{ active:false, removedAt:90, removalSource:'viewer-own-native-heart' },
    },
  };
  const scope = { owner:'ownerA', type:'items', scopeKey, complete:true, listingIds:['X'], snapshotCommittedAt:100 };

  assert.equal(ctx.favTrustedOwnHeartRemoval01519(listing, scopeKey, scope), false);
  assert.deepEqual(
    Array.from(ctx.favOwnerActiveListings01519([listing], [scope], 'ownerA'), (row) => row.listingId),
    ['X'],
  );
});

test('trusted post-snapshot removal is excluded from owner maintenance', async () => {
  const ctx = await context();
  const scopeKey = key('ownerA');
  const listing = {
    listingId:'X',
    isFavorite:false,
    favoriteScopes:{
      [scopeKey]:{ active:false, removedAt:200, removalSource:'viewer-own-native-heart' },
    },
  };
  const scope = { owner:'ownerA', type:'items', scopeKey, complete:true, listingIds:['X'], snapshotCommittedAt:100 };

  assert.deepEqual(ctx.favOwnerActiveListings01519([listing], [scope], 'ownerA'), []);
});

test('new positive exact-scope observation clears trusted removal provenance', async () => {
  const ctx = await context();
  const scopeKey = key('ownerA');
  const existing = {
    listingId:'X',
    isFavorite:false,
    unfavoritedAt:200,
    favoriteScopes:{
      [scopeKey]:{ active:false, removedAt:200, removalSource:'viewer-own-native-heart' },
    },
  };
  const incoming = {
    listingId:'X',
    isFavorite:true,
    lastSeenFavoriteAt:300,
    favoriteScopes:{ [scopeKey]:{ active:true, lastSeenAt:300 } },
  };
  const next = ctx.favIndexMergeListing(existing, incoming, 300);

  assert.equal(next.favoriteScopes[scopeKey].active, true);
  assert.equal(next.favoriteScopes[scopeKey].removedAt, undefined);
  assert.equal(next.favoriteScopes[scopeKey].removalSource, undefined);
  assert.equal(next.isFavorite, true);
});
