import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const identity = await readFile(new URL('../src/60a-favorites-owner-identity.js', import.meta.url), 'utf8');
const boundary = await readFile(new URL('../src/61aa-favorites-owner-boundary.js', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8');

function loadIdentityFixture() {
  const context = vm.createContext({ console, Map });
  vm.runInContext(`
    globalThis.fixtureLogin = 'alice';
    globalThis.fixtureDirectOwner = '111';
    globalThis.favProfileLogin = () => fixtureLogin;
    globalThis.favScope = () => ({ type:'items', id:'', login:fixtureLogin, owner:fixtureDirectOwner });
    ${identity}
    globalThis.testApi={
      scope:()=>favScope(),
      identity:(scope)=>favOwnerIdentity0153(scope),
      setLogin:(value)=>{fixtureLogin=String(value)},
      setDirectOwner:(value)=>{fixtureDirectOwner=String(value || '')},
      remembered:(value)=>favOwnerByLogin0153.get(value) || '',
      last:()=>({...favLastOwnerIdentity0153}),
    };
  `, context);
  return context.testApi;
}

function loadBoundaryFixture() {
  const calls = { observe:[], api:[], open:0 };
  let currentScope = { type:'items', id:'', login:'alice', owner:'' };
  const storage = new Map();
  const context = vm.createContext({
    console,
    Promise,
    Set,
    Map,
    Object,
    globalThis: null,
    favIndexOpen: async () => { calls.open += 1; return { name:'db' }; },
    favIndexObserveRecordsNow: async (records, options) => {
      calls.observe.push({ records, options });
      return ['written'];
    },
    favIndexCurrentScope: () => currentScope,
    favApiUrlForScope: (scope, offset, limit, query) => {
      calls.api.push({ scope, offset, limit, query });
      return `owner:${scope.owner}`;
    },
  });
  context.globalThis = context;
  context.localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  vm.runInContext(`${boundary}\nglobalThis.testApi={
    scopeOwner:favScopeOwner0153,
    hasOwner:favScopeHasRequiredOwner0153,
    prune:favPruneInvalidScopeMemberships0153,
    observe:(records, options)=>favIndexObserveRecordsNow(records, options),
    api:(scope, offset=0, limit=20, query='')=>favApiUrlForScope(scope, offset, limit, query),
    open:()=>favIndexOpen(),
    resetOpen:(fn)=>{favIndexOpenBefore0153=fn;favIndexOwnerRepairPromise0153=null},
    setRepair:(fn)=>{favIndexRepairOwnerlessScopes0153=fn;favIndexOwnerRepairPromise0153=null},
    repairDone:()=>favOwnerRepairDone0153(),
  };`, context);
  context.testApi.calls = calls;
  context.testApi.setCurrentScope = (scope) => { currentScope = scope; };
  return context.testApi;
}

test('owner identity survives a transient props gap on the same profile login', () => {
  const api = loadIdentityFixture();
  assert.equal(api.scope().owner, '111');
  assert.equal(api.remembered('alice'), '111');

  api.setDirectOwner('');
  assert.equal(api.scope().owner, '111');
  assert.deepEqual({ ...api.last() }, { login:'alice', owner:'111' });
});

test('soft navigation cannot teach the next profile login the previous route owner id', () => {
  const api = loadIdentityFixture();
  assert.equal(api.scope().owner, '111');

  // URL/login has changed but Etsy's old text/props is still mounted.
  api.setLogin('bob');
  api.setDirectOwner('111');
  assert.equal(api.scope().owner, '');
  assert.equal(api.remembered('bob'), '');

  // Once Bob's real props arrive, the new owner is accepted and retained.
  api.setDirectOwner('222');
  assert.equal(api.scope().owner, '222');
  assert.equal(api.remembered('bob'), '222');

  api.setDirectOwner('');
  assert.equal(api.scope().owner, '222');
});

test('remembered owner identity is keyed by profile login and can be reused after returning', () => {
  const api = loadIdentityFixture();
  assert.equal(api.scope().owner, '111');

  api.setLogin('bob');
  api.setDirectOwner('222');
  assert.equal(api.scope().owner, '222');

  api.setLogin('alice');
  api.setDirectOwner('');
  assert.equal(api.scope().owner, '111');
});

test('ownerless index observations are rejected before the underlying writer', async () => {
  const api = loadBoundaryFixture();
  const result = await api.observe([{ id:'1' }], { scope:{ type:'items', id:'', owner:'', login:'alice' } });
  assert.deepEqual(Array.from(result), []);
  assert.equal(api.calls.observe.length, 0);
});

test('valid index observations normalize owner and reach the original writer', async () => {
  const api = loadBoundaryFixture();
  const result = await api.observe([{ id:'1' }], { scope:{ type:'items', id:'', owner:' 123 ', login:'alice' } });
  assert.deepEqual(Array.from(result), ['written']);
  assert.equal(api.calls.observe.length, 1);
  assert.equal(api.calls.observe[0].options.scope.owner, '123');
});

test('ownerless current-scope observation is rejected even when caller omits explicit scope', async () => {
  const api = loadBoundaryFixture();
  api.setCurrentScope({ type:'collection', id:'abc', owner:'', login:'alice' });
  await api.observe([{ id:'1' }]);
  assert.equal(api.calls.observe.length, 0);
});

test('Favorites API boundary refuses every ownerless scope before URL construction', () => {
  const api = loadBoundaryFixture();
  for (const type of ['items', 'collection', 'group']) {
    assert.throws(
      () => api.api({ type, id:type === 'items' ? '' : 'abc', owner:'', login:'alice' }),
      /Could not determine the Favorites profile owner/,
      type,
    );
  }
  assert.equal(api.calls.api.length, 0);
});

test('valid Favorites API scope reaches the original URL builder with normalized owner', () => {
  const api = loadBoundaryFixture();
  assert.equal(api.api({ type:'collection', id:'abc', owner:' 456 ', login:'alice' }), 'owner:456');
  assert.equal(api.calls.api.length, 1);
  assert.equal(api.calls.api[0].scope.owner, '456');
});

test('repair pruning removes only exact invalid scope membership keys and preserves metadata', () => {
  const api = loadBoundaryFixture();
  const listing = {
    listingId:'10',
    title:'keep me',
    cardMetadata:{ price:{ known:true, value:5 } },
    favoriteScopes:{
      '|items||':{ active:true, lastSeenAt:1 },
      '123|items||':{ active:true, lastSeenAt:2 },
      '123|collection|abc|':{ active:true, lastSeenAt:3 },
    },
  };
  const next = api.prune(listing, new Set(['|items||']));
  assert.notEqual(next, listing);
  assert.deepEqual(Object.keys(next.favoriteScopes).sort(), ['123|collection|abc|', '123|items||']);
  assert.equal(next.title, 'keep me');
  assert.equal(next.cardMetadata.price.value, 5);

  const unchanged = api.prune(next, new Set(['missing']));
  assert.equal(unchanged, next);
});

test('all index callers wait on one shared owner-repair promise per document', async () => {
  const api = loadBoundaryFixture();
  let opens = 0;
  let repairs = 0;
  let releaseRepair;
  const repairGate = new Promise((resolve) => { releaseRepair = resolve; });
  const db = { name:'db' };

  api.resetOpen(async () => { opens += 1; return db; });
  api.setRepair(async (value) => {
    repairs += 1;
    assert.equal(value, db);
    await repairGate;
  });

  const first = api.open();
  const second = api.open();
  await Promise.resolve();
  assert.equal(opens, 1, 'the shared repair gate also shares the underlying open request');
  assert.equal(repairs, 1, 'repair itself must be shared');

  releaseRepair();
  assert.equal(await first, db);
  assert.equal(await second, db);
  assert.equal(repairs, 1);
});

test('owner repair is transactionally scoped to scopes + listings and marks completion only after transaction completion', () => {
  assert.match(boundary, /db\.transaction\(\['scopes', 'listings'\], 'readwrite'\)/);
  assert.match(boundary, /const invalidScopeKeys = new Set\(\)/);
  assert.match(boundary, /cursor\.delete\(\)/);
  assert.match(boundary, /favPruneInvalidScopeMemberships0153\(current, invalidScopeKeys\)/);
  assert.match(boundary, /cursor\.update\(next\)/);
  const completion = boundary.slice(boundary.indexOf('transaction.oncomplete'));
  assert.match(completion, /favMarkOwnerRepairDone0153\(\)/);
});

test('owner boundary modules load before catalogue/sync and cache consumers', () => {
  const state = userscript.indexOf('/src/60-favorites-state.js');
  const owner = userscript.indexOf('/src/60a-favorites-owner-identity.js');
  const data = userscript.indexOf('/src/61-favorites-data.js');
  const index = userscript.indexOf('/src/61a-favorites-index.js');
  const boundaryIndex = userscript.indexOf('/src/61aa-favorites-owner-boundary.js');
  const sync = userscript.indexOf('/src/61b-favorites-sync.js');
  const cache = userscript.indexOf('/src/61e-favorites-cache-bootstrap.js');
  assert.ok(state >= 0 && owner > state && data > owner && index > data && boundaryIndex > index && sync > boundaryIndex && cache > sync);
});
