import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const boundary = await readFile(new URL('../src/61aa-favorites-owner-boundary.js', import.meta.url), 'utf8');
const routeIdentity = await readFile(new URL('../src/61f-favorites-route-identity.js', import.meta.url), 'utf8');
const correction = await readFile(new URL('../src/99-favorites-v0131-correctness.js', import.meta.url), 'utf8');

function loadBoundaryHelpers() {
  const storage = new Map();
  const baseMerge = (existing, incoming, observedAt = Date.now()) => {
    const base = existing ? structuredClone(existing) : {
      listingId:String(incoming.listingId || ''),
      isFavorite:true,
      favoriteScopes:{},
      firstSeenAt:observedAt,
      lastSeenFavoriteAt:0,
      lastCardRefreshAt:0,
      cardMetadata:{}, listingMetadata:{}, shippingMetadata:{}, urgencyMetadata:{},
    };
    const favoriteScopes = structuredClone(base.favoriteScopes || {});
    for (const [key, membership] of Object.entries(incoming.favoriteScopes || {})) {
      favoriteScopes[key] = { ...(favoriteScopes[key] || {}), ...structuredClone(membership) };
    }
    return {
      ...base,
      ...structuredClone(incoming),
      favoriteScopes,
      isFavorite:incoming.isFavorite === false ? false : true,
    };
  };

  const context = vm.createContext({
    console, Promise, Set, Map, Array, Object, String, Number, Date, structuredClone,
    globalThis:null,
    favIndexOpen:async () => ({ name:'db' }),
    favIndexObserveRecordsNow:async () => [],
    favIndexCurrentScope:() => ({ owner:'owner', type:'items', id:'', query:'' }),
    favIndexMergeListing:baseMerge,
    favIndexGetStats:async () => ({}),
    favIndexGetActiveListings:async () => [],
    favIndexRequest:async () => null,
    favApiUrlForScope:(scope) => `owner:${scope.owner}`,
  });
  context.globalThis = context;
  context.localStorage = {
    getItem:(key) => storage.has(key) ? storage.get(key) : null,
    setItem:(key, value) => storage.set(key, String(value)),
  };
  vm.runInContext(`${boundary}
    globalThis.testApi={
      trusted:favScopeQueryTrusted01510,
      pruneKeys:favQueryScopeKeysToPrune01510,
      repairListing:favRepairListingIntegrity01510,
      merge:favIndexMergeListing,
      canonical:favCanonicalAllScope01510,
      ownerIds:favOwnerScopeIds01510,
    };
  `, context);
  return context.testApi;
}

function loadRouteFixture() {
  const calls = [];
  const context = vm.createContext({
    console, Promise, Set, Map, Array, Object, String, Number, Date, URL,
    location:{ href:'https://www.etsy.com/people/example?tab=items' },
    favCfg:{ strict:false, multi:false },
    favProps:() => ({ query:'' }),
    favNativeQuery:() => '',
    favScope:() => ({ owner:'owner', type:'items', id:'', login:'example' }),
    favDatasetQuery:() => '',
    favScopeKey:() => '',
    favSyncScopeDescriptor:(scope, query) => ({ ...scope, query }),
    favSyncCurrentScope:() => ({}),
    favIndexCurrentScope:() => ({ owner:'owner', type:'items', id:'', query:'', scopeKey:'scope' }),
    favCatalogDescriptor0141:(scope, query) => ({
      ...scope,
      query:String(query || ''),
      scopeKey:'scope',
      datasetKey:`owner|items||q:${String(query || '')}`,
    }),
    favIndexObserveRecordsNow:async (records, options) => {
      calls.push({ records:structuredClone(records), options:structuredClone(options) });
      return ['written'];
    },
    favScopeQueryTrusted01510:(scope) => {
      const query = String(scope?.query || '').trim();
      if (!query) return true;
      return query.length <= 512
        && scope?.queryCommitVerified === true
        && ['route','ssr-props','favorites-search-commit'].includes(String(scope?.queryCommitSource || ''));
    },
    favScopeHasRequiredOwner0153:(scope) => Boolean(String(scope?.owner || '').trim()),
    structuredClone,
  });
  vm.runInContext(`${routeIdentity}
    globalThis.testApi={
      provenance:(query)=>favCommittedNativeQueryProvenance01510(query),
      scope:(scope)=>favScopeWithQueryProvenance01510(scope),
      observe:(records, options)=>favIndexObserveRecordsNow(records, options),
      current:()=>favIndexCurrentScope(),
      descriptor:(scope, query)=>favCatalogDescriptor0141(scope, query),
      setCommitted:(value)=>{favCommittedNativeQuery0138=()=>String(value || '')},
      setHref:(value)=>{location.href=String(value)},
      setProps:(fn)=>{favProps=fn},
    };
  `, context);
  context.testApi.calls = calls;
  return context.testApi;
}

test('durable query identity accepts only bounded verified commit sources', () => {
  const api = loadBoundaryHelpers();
  assert.equal(api.trusted({ owner:'owner', query:'' }), true);
  assert.equal(api.trusted({
    owner:'owner', query:'intentional search',
    queryCommitVerified:true, queryCommitSource:'favorites-search-commit',
  }), true);
  assert.equal(api.trusted({ owner:'owner', query:'legacy search' }), false);
  assert.equal(api.trusted({
    owner:'owner', query:'search',
    queryCommitVerified:true, queryCommitSource:'unknown-source',
  }), false);
  assert.equal(api.trusted({
    owner:'owner', query:'x'.repeat(513),
    queryCommitVerified:true, queryCommitSource:'favorites-search-commit',
  }), false);
});

test('query retention never prunes canonical scopes and applies trust, TTL, zero-result TTL and LRU bounds', () => {
  const api = loadBoundaryHelpers();
  const DAY = 24 * 60 * 60 * 1000;
  const now = 100 * DAY;
  const verified = (key, query, observedAt, listingIds=['1']) => ({
    scopeKey:key, owner:'owner', type:'items', id:'', query,
    queryCommitVerified:true, queryCommitSource:'favorites-search-commit',
    lastObservedAt:observedAt, listingIds,
  });
  const scopes = [
    { scopeKey:'canonical', owner:'owner', type:'items', id:'', query:'', complete:true, lastObservedAt:1, listingIds:['1'] },
    { scopeKey:'legacy-unverified', owner:'owner', type:'items', id:'', query:'legacy', lastObservedAt:now, listingIds:['1'] },
    verified('zero-old', 'zero', now - 2 * DAY, []),
    verified('stale', 'stale', now - 31 * DAY, ['1']),
    verified('recent-zero', 'recent-zero', now - 2 * 60 * 60 * 1000, []),
  ];
  for (let index = 0; index < 14; index++) {
    scopes.push(verified(`lru-${index}`, `q-${index}`, now - index * 1000, ['1']));
  }

  const keys = api.pruneKeys(scopes, now);
  assert.equal(keys.has('canonical'), false);
  assert.equal(keys.has('legacy-unverified'), true);
  assert.equal(keys.has('zero-old'), true);
  assert.equal(keys.has('stale'), true);
  assert.equal(keys.has('recent-zero'), false);
  assert.equal(keys.has('lru-0'), false);
  assert.equal(keys.has('lru-11'), false);
  assert.equal(keys.has('lru-12'), true);
  assert.equal(keys.has('lru-13'), true);
});

test('reactivation clears stale removedAt and integrity cleanup removes only invalid membership keys', () => {
  const api = loadBoundaryHelpers();
  const old = {
    listingId:'1',
    isFavorite:true,
    favoriteScopes:{
      keep:{ active:false, removedAt:100, lastSeenAt:50 },
      invalid:{ active:true, removedAt:80, lastSeenAt:70 },
    },
  };
  const incoming = {
    listingId:'1',
    isFavorite:true,
    favoriteScopes:{ keep:{ active:true, lastSeenAt:200 } },
  };
  const merged = api.merge(old, incoming, 200);
  assert.equal(merged.favoriteScopes.keep.active, true);
  assert.equal(Object.hasOwn(merged.favoriteScopes.keep, 'removedAt'), false);
  assert.equal(merged.favoriteScopes.keep.lastSeenAt, 200);

  const repaired = api.repairListing(merged, new Set(['invalid']));
  assert.equal(Object.hasOwn(repaired.favoriteScopes, 'invalid'), false);
  assert.equal(repaired.favoriteScopes.keep.active, true);
});

test('owner maintenance uses latest complete canonical All membership instead of query or collection unions', () => {
  const api = loadBoundaryHelpers();
  const scopes = [
    { scopeKey:'old-all', owner:'owner', type:'items', id:'', query:'', complete:true, snapshotCommittedAt:100, listingIds:['A'] },
    { scopeKey:'new-all', owner:'owner', type:'items', id:'', query:'', complete:true, snapshotCommittedAt:200, listingIds:['B','C'] },
    { scopeKey:'query', owner:'owner', type:'items', id:'', query:'private-cache', complete:true, snapshotCommittedAt:300, listingIds:['Q'] },
    { scopeKey:'collection', owner:'owner', type:'collection', id:'x', query:'', complete:true, snapshotCommittedAt:400, listingIds:['D'] },
  ];
  assert.equal(api.canonical(scopes, 'owner').scopeKey, 'new-all');
  assert.deepEqual(Array.from(api.ownerIds(scopes, 'owner')).sort(), ['B','C']);
});

test('committed query provenance distinguishes route, SSR and settled native Search from arbitrary text', () => {
  const api = loadRouteFixture();

  api.setHref('https://www.etsy.com/people/example?tab=items&q=route-search');
  assert.deepEqual({ ...api.provenance('route-search') }, {
    queryCommitSource:'route', queryCommitVerified:true,
  });

  api.setHref('https://www.etsy.com/people/example?tab=items');
  api.setProps(() => ({ query:'ssr-search' }));
  assert.deepEqual({ ...api.provenance('ssr-search') }, {
    queryCommitSource:'ssr-props', queryCommitVerified:true,
  });

  api.setProps(() => ({ query:'' }));
  api.setCommitted('settled-search');
  assert.deepEqual({ ...api.provenance('settled-search') }, {
    queryCommitSource:'favorites-search-commit', queryCommitVerified:true,
  });

  assert.deepEqual({ ...api.provenance('unrelated focused text') }, {
    queryCommitSource:'unverified', queryCommitVerified:false,
  });
});

test('Diagnostics-note-like free-form text cannot become a durable query while Favorites Search is unchanged', async () => {
  const api = loadRouteFixture();
  api.setCommitted('current favorites search');
  const noteText = 'arbitrary diagnostic note '.repeat(18).trim();

  const rejected = await api.observe([{ id:'1' }], {
    scope:{ owner:'owner', type:'items', id:'', query:noteText, scopeKey:'note-scope' },
    complete:false,
  });
  assert.deepEqual(Array.from(rejected), []);
  assert.equal(api.calls.length, 0);

  const accepted = await api.observe([{ id:'1' }], {
    scope:{ owner:'owner', type:'items', id:'', query:'current favorites search', scopeKey:'search-scope' },
    complete:false,
  });
  assert.deepEqual(Array.from(accepted), ['written']);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].options.scope.queryCommitVerified, true);
  assert.equal(api.calls[0].options.scope.queryCommitSource, 'favorites-search-commit');
});

test('current v0.13.1 event boundary still ignores non-input Diagnostics marker textareas', () => {
  assert.match(correction, /function favIsFavoritesSearchInput0140\(input\)/);
  assert.match(correction, /if \(!input\?\.matches\?\.\('input'\)\) return false/);
  assert.match(correction, /input\.closest\?\.\('\.ebsf-native-search-slot'\)/);
  assert.doesNotMatch(correction, /document\.activeElement.*nativePendingQuery0140/s);
});

test('integrity repair is one scopes+listings transaction and never reconstructs complete listingIds from membership state', () => {
  assert.match(boundary, /favIndexRepairStorageIntegrity01510/);
  assert.match(boundary, /db\.transaction\(\['scopes', 'listings'\], 'readwrite'\)/);
  assert.match(boundary, /favQueryScopeKeysToPrune01510/);
  assert.match(boundary, /scopes\.delete\(scopeKey\)/);
  assert.match(boundary, /favRepairListingIntegrity01510\(current, invalidScopeKeys\)/);
  const repair = boundary.slice(
    boundary.indexOf('function favIndexRepairStorageIntegrity01510'),
    boundary.indexOf('/* Every existing index caller', boundary.indexOf('function favIndexRepairStorageIntegrity01510')),
  );
  assert.doesNotMatch(repair, /listingIds\s*:/);
  assert.doesNotMatch(repair, /scope\.listingIds\s*=/);
});

test('61f reasserts query trust after immutable-snapshot writer ordering', () => {
  const snapshots = routeIdentity.indexOf('var favIndexObserveRecordsNowBefore01510');
  assert.ok(snapshots >= 0);
  assert.match(routeIdentity, /61ea supersedes 61aa/);
  assert.match(routeIdentity, /favScopeWithQueryProvenance01510\(options\.scope \|\| favIndexCurrentScope\(\)\)/);
  assert.match(routeIdentity, /favScopeHasRequiredOwner0153\(scope\)/);
  assert.match(routeIdentity, /favScopeQueryTrusted01510\(scope\)/);
});
