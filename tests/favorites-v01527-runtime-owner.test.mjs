import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [stateSource, ownerSource, userScript, runtimeSource, queueSource] = await Promise.all([
  readFile(new URL('../src/60-favorites-state.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/60b-favorites-runtime-owner.js', import.meta.url), 'utf8'),
  readFile(new URL('../etsy-bettersearch.user.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/63-favorites-runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/83-favorites-cross-page-queue.js', import.meta.url), 'utf8'),
]);

function makeRoot() {
  const attributes = new Map();
  return {
    getAttribute:(name) => attributes.get(name) ?? null,
    setAttribute:(name, value) => attributes.set(name, String(value)),
  };
}

function loadRuntime(root) {
  const warnings = [];
  const context = vm.createContext({
    Map,
    Set,
    URL,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Math,
    JSON,
    location:{ href:'https://www.etsy.com/people/alice/favorites', pathname:'/people/alice/favorites' },
    document:{ documentElement:root, querySelector:() => ({}) },
    GM_getValue:(_key, fallback) => fallback,
    defaultRule:() => ({ op:'or', text:'' }),
    normalizeRules:(value) => value,
    console:{ warn:(...args) => warnings.push(args), log() {}, error() {}, debug() {} },
  });
  vm.runInContext(`${stateSource}\n${ownerSource}\nglobalThis.testApi={ active:favFavoritesRuntimeActive01527, isFavoritesPage };`, context);
  return { api:context.testApi, warnings };
}

test('first production Favorites runtime claims the shared document marker', () => {
  const root = makeRoot();
  const first = loadRuntime(root);

  assert.equal(first.api.active, true);
  assert.equal(first.api.isFavoritesPage(), true);
  assert.equal(root.getAttribute('data-ebsf-favorites-runtime-owner'), 'active');
  assert.deepEqual(first.warnings, []);
});

test('second isolated-world production runtime becomes inert without replacing the owner marker', () => {
  const root = makeRoot();
  loadRuntime(root);
  const second = loadRuntime(root);

  assert.equal(second.api.active, false);
  assert.equal(second.api.isFavoritesPage(), false);
  assert.equal(root.getAttribute('data-ebsf-favorites-runtime-owner'), 'active');
  assert.equal(second.warnings.length, 1);
  assert.match(String(second.warnings[0][0]), /already owns this document/i);
});

test('the unavailable marker boundary fails closed', () => {
  const warnings = [];
  const context = vm.createContext({
    Map,
    Set,
    URL,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Math,
    JSON,
    location:{ href:'https://www.etsy.com/people/alice/favorites', pathname:'/people/alice/favorites' },
    document:{ documentElement:null, querySelector:() => ({}) },
    GM_getValue:(_key, fallback) => fallback,
    defaultRule:() => ({ op:'or', text:'' }),
    normalizeRules:(value) => value,
    console:{ warn:(...args) => warnings.push(args), log() {}, error() {}, debug() {} },
  });
  vm.runInContext(`${stateSource}\n${ownerSource}\nglobalThis.testApi={ active:favFavoritesRuntimeActive01527, isFavoritesPage };`, context);

  assert.equal(context.testApi.active, false);
  assert.equal(context.testApi.isFavoritesPage(), false);
  assert.equal(warnings.length, 1);
});

test('all delivery targets load the owner boundary before Favorites stateful work, and inert copies cannot start runtime or queue work', () => {
  const ownerLine = userScript.indexOf('src/60b-favorites-runtime-owner.js');
  assert.ok(ownerLine > userScript.indexOf('src/60-favorites-state.js'));
  assert.ok(ownerLine < userScript.indexOf('src/60a-favorites-owner-identity.js'));
  assert.match(runtimeSource, /function favHandleTransplantedClick\(event\) \{\s+if \(typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true\) return;/);
  assert.match(runtimeSource, /function favStartRuntime\(\) \{\s+if \(typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true\) return;/);
  assert.match(queueSource, /async function favDeepResumeExistingQueue0110\(\) \{\s+if \(typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true\) return false;/);
  assert.match(queueSource, /favDeepMaybeAutoScan = async function favDeepMaybeAutoScan0110\(\) \{\s+if \(typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true\) return false;/);
});
