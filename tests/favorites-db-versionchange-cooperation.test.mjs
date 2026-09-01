import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/61ac-favorites-db-versionchange.js', import.meta.url), 'utf8');

function makeDb(previous = null) {
  return {
    onversionchange:previous,
    closeCalls:0,
    close() { this.closeCalls += 1; },
  };
}

function loadFixture({ existingPromise = null, openDb = makeDb() } = {}) {
  let openCalls = 0;
  const events = [];
  const warnings = [];
  const context = vm.createContext({
    console:{ warn:(...args) => warnings.push(args), log() {}, error() {}, debug() {} },
    Promise,
    WeakSet,
    Number,
    Error,
    favIndexDatabasePromise:existingPromise,
    favIndexOpen:() => {
      openCalls += 1;
      return Promise.resolve(openDb);
    },
    document:{ dispatchEvent:(event) => events.push(event) },
    CustomEvent:class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
  });

  /* Production load order has 61ac before 61eb. Model 61eb's later v0.15.19
   * cached opener so these tests exercise the final packaged call chain rather
   * than only the inner 61ac wrapper. */
  vm.runInContext(`${source}
var favMultiOwnerRepairPromise01519 = null;
var favIndexOpenBefore01519Test = favIndexOpen;
favIndexOpen = function favIndexOpen01519Test() {
  if (favMultiOwnerRepairPromise01519) return favMultiOwnerRepairPromise01519;
  favMultiOwnerRepairPromise01519 = Promise.resolve(favIndexOpenBefore01519Test())
    .catch((error) => {
      favMultiOwnerRepairPromise01519 = null;
      throw error;
    });
  return favMultiOwnerRepairPromise01519;
};
globalThis.testApi={
    open:()=>favIndexOpen(),
    install:(db)=>favIndexInstallVersionchange01527(db),
    invalidated:()=>favIndexVersionInvalidated01527,
    databasePromise:()=>favIndexDatabasePromise,
    laterCache:()=>favMultiOwnerRepairPromise01519,
  };`, context);

  return {
    api:context.testApi,
    openDb,
    events,
    warnings,
    openCalls:() => openCalls,
  };
}

test('future final favIndexOpen connections receive a versionchange handler', async () => {
  const fixture = loadFixture();
  const db = await fixture.api.open();
  assert.equal(db, fixture.openDb);
  assert.equal(typeof db.onversionchange, 'function');
  assert.equal(fixture.openCalls(), 1);
  assert.ok(fixture.api.laterCache(), 'later v0.15.19 wrapper should cache the resolved opener');
});

test('versionchange closes the old connection and invalidates all opener caches until reload', async () => {
  const fixture = loadFixture();
  const db = await fixture.api.open();
  assert.ok(fixture.api.laterCache());

  db.onversionchange({ oldVersion:2, newVersion:3 });

  assert.equal(db.closeCalls, 1);
  assert.equal(fixture.api.invalidated(), true);
  assert.equal(fixture.api.databasePromise(), null);
  assert.equal(fixture.api.laterCache(), null, 'later v0.15.19 cache must not retain the closed DB');
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0].type, 'ebsf:favorites-index-versionchange');
  assert.deepEqual(
    JSON.parse(JSON.stringify(fixture.events[0].detail)),
    { oldVersion:2, newVersion:3 },
  );

  await assert.rejects(
    fixture.api.open(),
    /schema changed in another tab/i,
  );
  assert.equal(fixture.openCalls(), 1, 'invalidated final opener must not reopen the old schema');
  assert.equal(fixture.api.laterCache(), null, 'failed final reopen must remain uncached');
});

test('delete/versionchange with null newVersion also fails closed', async () => {
  const fixture = loadFixture();
  const db = await fixture.api.open();
  db.onversionchange({ oldVersion:2, newVersion:null });
  assert.equal(fixture.api.invalidated(), true);
  assert.equal(fixture.events[0].detail.newVersion, null);
  assert.equal(fixture.api.laterCache(), null);
});

test('an existing database promise is retrofitted without forcing another base open', async () => {
  const db = makeDb();
  const fixture = loadFixture({ existingPromise:Promise.resolve(db), openDb:db });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(typeof db.onversionchange, 'function');
  assert.equal(fixture.openCalls(), 0);

  db.onversionchange({ oldVersion:2, newVersion:3 });
  assert.equal(db.closeCalls, 1);
  assert.equal(fixture.api.invalidated(), true);
  assert.equal(fixture.api.laterCache(), null);
});

test('existing versionchange behavior is preserved before BetterSearch closes the connection', async () => {
  let previousCalls = 0;
  const db = makeDb(() => { previousCalls += 1; });
  const fixture = loadFixture({ openDb:db });
  await fixture.api.open();
  db.onversionchange({ oldVersion:2, newVersion:3 });
  assert.equal(previousCalls, 1);
  assert.equal(db.closeCalls, 1);
  assert.equal(fixture.api.laterCache(), null);
});

test('installing the boundary twice on the same DB does not double-wrap the handler', () => {
  let previousCalls = 0;
  const db = makeDb(() => { previousCalls += 1; });
  const fixture = loadFixture({ openDb:db });
  const first = fixture.api.install(db);
  const handler = db.onversionchange;
  const second = fixture.api.install(db);
  assert.equal(first, db);
  assert.equal(second, db);
  assert.equal(db.onversionchange, handler);
  db.onversionchange({ oldVersion:2, newVersion:3 });
  assert.equal(previousCalls, 1);
  assert.equal(db.closeCalls, 1);
});
