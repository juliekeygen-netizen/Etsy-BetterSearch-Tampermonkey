import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { makeManifest } from '../scripts/project.mjs';

const backgroundSource = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../extension/background-worker.js', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../extension/content-bridge.js', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

const MIGRATION_KEY = 'ebsf.extension.background.migration.v1';

function makeEvent() {
  const listeners = [];
  return { listeners, addListener(listener) { listeners.push(listener); } };
}

function createBackgroundHarness() {
  const storage = {};
  const alarms = new Map();
  const messages = [];
  const workerCalls = [];
  let tabs = [];
  let tabResponse = null;
  let profile = null;
  let workerResult = { accepted:true, background:true, catalogue:{ completed:true, needsContinuation:false }, deepMetadata:null, needsContinuation:false };

  const runtime = { onInstalled:makeEvent(), onStartup:makeEvent(), onMessage:makeEvent() };
  const browser = {
    storage:{ local:{
      async get(keys) {
        if (keys == null) return { ...storage };
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.filter((key) => key in storage).map((key) => [key, storage[key]]));
      },
      async set(values) { Object.assign(storage, values); },
    } },
    runtime,
    alarms:{
      onAlarm:makeEvent(),
      async get(name) { return alarms.get(name) || null; },
      async clear(name) { return alarms.delete(name); },
      async create(name, info) {
        alarms.set(name, { name, ...info, scheduledTime:Date.now() + Number(info.delayInMinutes || info.periodInMinutes || 1) * 60000 });
      },
    },
    tabs:{
      async query() { return tabs.slice(); },
      async sendMessage(tabId, message) { messages.push({ tabId, message }); return tabResponse; },
    },
  };

  const context = vm.createContext({
    browser,
    console:{ log() {}, warn() {}, error() {}, debug() {} },
    Date, Promise, setTimeout, clearTimeout,
    EBS_BACKGROUND_MIGRATION_KEY:MIGRATION_KEY,
    async ebsWorkerGetProfile() { return profile; },
    async ebsBackgroundMaintenanceRunNoTab(request) { workerCalls.push({ ...request }); return structuredClone(workerResult); },
    async ebsWorkerPopupDetails() {
      return {
        profile,
        migration:storage[MIGRATION_KEY] || {},
        catalog:storage['ebsf.extension.background.catalog.v1'] || null,
        stats:profile ? { indexedFavorites:7, activeFavorites:6, indexedShops:4, deepMetadataFavorites:3, lastDeepUpdateAt:10, lastFullSyncAt:20 } : null,
      };
    },
    async ebsWorkerRegisterProfile(input) { profile = { owner:String(input.owner), login:String(input.login || '') }; return { profile, needsPageSeed:true }; },
    async ebsWorkerImportRecords(_store, records) { return Array.isArray(records) ? records.length : 0; },
    async ebsWorkerExportRecords(store, offset = 0) { return { store, records:[], offset, nextOffset:offset, total:0, done:true }; },
    async ebsWorkerMarkMigration(patch) {
      const next = { ...(storage[MIGRATION_KEY] || {}), ...patch };
      storage[MIGRATION_KEY] = next;
      return next;
    },
    async ebsWorkerRecoverExpiredDeepJobs() { return 0; },
  });
  vm.runInContext(backgroundSource, context, { filename:'extension/background.js' });

  const send = (message, sender = {}) => new Promise((resolve) => {
    const listener = runtime.onMessage.listeners[0];
    assert.equal(typeof listener, 'function');
    const keepAlive = listener({ namespace:'etsy-bettersearch', ...message }, sender, resolve);
    assert.equal(keepAlive, true);
  });

  return {
    storage, alarms, messages, workerCalls, send,
    setTabs(value, response = null) { tabs = value; tabResponse = response; },
    setProfile(value) { profile = value; },
    setWorkerResult(value) { workerResult = value; },
    setMigration(value) { storage[MIGRATION_KEY] = { ...value }; },
    async fireAlarm(name) {
      const listener = browser.alarms.onAlarm.listeners[0];
      assert.equal(typeof listener, 'function');
      listener({ name });
      await settle();
    },
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('Chrome and Firefox manifests expose popup + alarms without cookie or tabs permission', () => {
  for (const target of ['chrome', 'firefox']) {
    const manifest = makeManifest(target, { version:'0.15.29', name:'Etsy BetterSearch', description:'test' });
    assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
    assert.equal(manifest.action.default_popup, 'popup.html');
    assert.equal(manifest.action.default_title, 'Etsy BetterSearch');
    assert.ok(manifest.host_permissions.includes('https://www.etsy.com/*'));
    assert.ok(!manifest.permissions.includes('cookies'));
    assert.ok(!manifest.permissions.includes('tabs'));
  }
});

test('background bootstrap persists defaults, creates alarm, and reports real no-tab capability', async () => {
  const harness = createBackgroundHarness();
  await settle();
  assert.deepEqual(plain(harness.storage['ebsf.extension.maintenance.settings.v1']), {
    enabled:true, intervalMinutes:60, catalogue:true, deepMetadata:true,
  });
  assert.equal(harness.alarms.get('etsy-bettersearch-maintenance').periodInMinutes, 60);
  const state = await harness.send({ type:'maintenance-get-state' });
  assert.equal(state.ok, true);
  assert.equal(state.capabilities.noTabScanner, true);
  assert.equal(state.capabilities.backgroundIndex, true);
  assert.equal(state.profile.initialized, false);
});

test('changing maintenance settings recreates alarm and disabling clears scheduled continuation', async () => {
  const harness = createBackgroundHarness();
  await settle();
  let state = await harness.send({ type:'maintenance-set-settings', settings:{ intervalMinutes:180 } });
  assert.equal(state.settings.intervalMinutes, 180);
  assert.equal(harness.alarms.get('etsy-bettersearch-maintenance').periodInMinutes, 180);

  harness.alarms.set('etsy-bettersearch-maintenance-continuation', { name:'etsy-bettersearch-maintenance-continuation' });
  harness.storage['ebsf.extension.maintenance.continuation.v1'] = { catalogue:true };
  state = await harness.send({ type:'maintenance-set-settings', settings:{ enabled:false } });
  assert.equal(state.settings.enabled, false);
  assert.equal(harness.alarms.has('etsy-bettersearch-maintenance'), false);
  assert.equal(harness.alarms.has('etsy-bettersearch-maintenance-continuation'), false);
  assert.equal(harness.storage['ebsf.extension.maintenance.continuation.v1'], null);
});

test('initialized profile uses background owner even when an Etsy tab is open', async () => {
  const harness = createBackgroundHarness();
  harness.setProfile({ owner:'123', login:'owner' });
  harness.setTabs([{ id:41 }], { accepted:true });
  await settle();

  const result = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'test-background' });
  assert.equal(result.accepted, true);
  assert.equal(result.background, true);
  assert.equal(harness.workerCalls.length, 1);
  assert.equal(harness.workerCalls[0].catalogue, true);
  assert.equal(harness.workerCalls[0].deepMetadata, false);
  assert.ok(!harness.messages.some(({ message }) => message.type === 'maintenance-run-current-page'));
  assert.ok(harness.messages.some(({ message }) => message.type === 'maintenance-background-updated'));
});

test('before owner initialization an own Favorites page is the only fallback and no-tab fails closed', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.setTabs([{ id:41 }], { accepted:true, catalogueStarted:true });
  const accepted = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'initialize' });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.initializationFallback, true);
  assert.equal(accepted.tabId, 41);
  assert.equal(harness.workerCalls.length, 0);

  harness.setTabs([], null);
  const deferred = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'needs-profile' });
  assert.equal(deferred.accepted, false);
  assert.equal(deferred.reason, 'profile-not-registered');
  assert.equal(harness.storage['ebsf.extension.maintenance.status.v1'].phase, 'needs-initialization');
});

test('bounded background continuation stays background-owned across later alarm wakes', async () => {
  const harness = createBackgroundHarness();
  harness.setProfile({ owner:'123', login:'owner' });
  harness.setWorkerResult({ accepted:true, background:true, catalogue:{ completed:false, needsContinuation:true }, deepMetadata:null, needsContinuation:true });
  await settle();
  const first = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'large-catalogue' });
  assert.equal(first.needsContinuation, true);
  assert.ok(harness.alarms.has('etsy-bettersearch-maintenance-continuation'));
  assert.equal(harness.storage['ebsf.extension.maintenance.continuation.v1'].catalogue, true);

  harness.setTabs([{ id:99 }], { accepted:true });
  await harness.fireAlarm('etsy-bettersearch-maintenance-continuation');
  assert.ok(harness.workerCalls.length >= 2);
  assert.ok(!harness.messages.some(({ message }) => message.type === 'maintenance-run-current-page'));
});

test('migration clocks distinguish page export from importing a known background generation', async () => {
  const harness = createBackgroundHarness();
  harness.setProfile({ owner:'123', login:'owner' });
  harness.setMigration({ owner:'123', seededAt:100, lastPageImportAt:300, lastBackgroundMutationAt:900 });
  await settle();

  let result = await harness.send({ type:'maintenance-finalize-page-import', owner:'123' });
  assert.equal(result.ok, true);
  assert.ok(Number(harness.storage[MIGRATION_KEY].lastPageExportAt) > 0);
  assert.equal(harness.storage[MIGRATION_KEY].lastPageImportAt, 300);

  result = await harness.send({ type:'maintenance-page-import-complete', owner:'123', throughAt:900 });
  assert.equal(result.ok, true);
  assert.equal(harness.storage[MIGRATION_KEY].lastPageImportAt, 900);

  const invalid = await harness.send({ type:'maintenance-page-import-complete', owner:'123', throughAt:901 });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /outside the known background generation/i);
});

test('background worker uses immutable catalogue generations and bounded resumable wakes', () => {
  assert.match(workerSource, /EBS_BACKGROUND_CATALOGUE_PAGE_BUDGET = 8/);
  assert.match(workerSource, /EBS_BACKGROUND_WORK_BUDGET_MS = 20000/);
  assert.match(workerSource, /pendingListingIds:Array\.from\(new Set\(\(state\.observedIds/);
  assert.match(workerSource, /listingIds:committedIds/);
  assert.match(workerSource, /snapshotGeneration:String\(state\.generation/);
  assert.match(workerSource, /if \(listings\.length < EBS_BACKGROUND_PAGE_SIZE\) \{/);
  assert.match(workerSource, /full page with no new listings/);
  assert.match(workerSource, /if \(changedOwner\) await ebsWorkerClearIndex\(\)/);
});

test('background snapshot handoff and deep mutable paths read + merge + write atomically', () => {
  assert.match(workerSource, /function ebsWorkerImportRecords[\s\S]*db\.transaction\(storeName, 'readwrite'\)/);
  assert.match(workerSource, /function ebsWorkerObserveCataloguePage[\s\S]*db\.transaction\(\['listings', 'shops', 'scopes'\], 'readwrite'\)/);
  assert.match(workerSource, /function ebsWorkerFinalizeCatalogue[\s\S]*db\.transaction\(\['listings', 'scopes'\], 'readwrite'\)/);
  assert.match(workerSource, /function ebsWorkerCommitDeepSuccess[\s\S]*db\.transaction\(\['deepScanQueue', 'listings', 'shops'\], 'readwrite'\)/);
  assert.match(workerSource, /currentJob\.status !== 'running'.*currentJob\.workerId !== ebsBackgroundWorkerId.*currentJob\.leaseUntil/s);
  assert.match(workerSource, /status:'running'.*workerId:ebsBackgroundWorkerId.*leaseUntil:now \+ EBS_BACKGROUND_DEEP_LEASE_MS/s);
  assert.match(workerSource, /Recovered expired\/interrupted background metadata scan/);
});

test('deep background worker validates Etsy responses and pauses instead of hammering challenge/rate-limit responses', () => {
  assert.match(workerSource, /verification\/challenge page/);
  assert.match(workerSource, /listing-identity-mismatch/);
  assert.match(workerSource, /did not expose recognizable metadata/);
  assert.match(workerSource, /\[404, 410\]\.includes/);
  assert.match(workerSource, /Retry-After/);
  assert.match(workerSource, /Number\(error\?\.httpStatus\) === 429/);
  assert.match(workerSource, /paused = true/);
  assert.doesNotMatch(workerSource, /\bdocument\s*[?.]/);
  assert.doesNotMatch(workerSource, /\bwindow\s*[?.]/);
});

test('build bundles only worker-safe shared primitives and puts worker before coordinator', () => {
  assert.match(buildSource, /'src\/61a-favorites-index\.js'/);
  assert.match(buildSource, /'src\/61ab-favorites-atomic-mutations\.js'/);
  assert.match(buildSource, /'src\/61c-favorites-deep-parser\.js'/);
  const backgroundListStart = buildSource.indexOf('const backgroundSharedPaths');
  const backgroundListEnd = buildSource.indexOf('];', backgroundListStart);
  const backgroundList = buildSource.slice(backgroundListStart, backgroundListEnd);
  assert.doesNotMatch(backgroundList, /61d-favorites-deep-queue/);
  const workerPosition = buildSource.indexOf('${backgroundWorker.trim()}');
  const coordinatorPosition = buildSource.indexOf('${backgroundCoordinator.trim()}');
  assert.ok(workerPosition >= 0 && coordinatorPosition > workerPosition);
});

test('extension content bridge makes background the automatic owner and converges replicas safely', () => {
  const sharedModulesPosition = buildSource.indexOf("${moduleSources.join('\\n')}");
  const bridgePosition = buildSource.indexOf('${contentBridge.trim()}');
  assert.ok(sharedModulesPosition >= 0);
  assert.ok(bridgePosition > sharedModulesPosition);
  assert.match(bridgeSource, /favMaybeAutoSync = function ebsExtensionPageAutoSyncDisabled/);
  assert.match(bridgeSource, /favDeepMaybeAutoScan = function ebsExtensionPageDeepAutoDisabled/);
  assert.match(bridgeSource, /ebsContentPageAutoSync\(true\)/);
  assert.match(bridgeSource, /maintenance-page-import-complete/);
  assert.match(bridgeSource, /lastBackgroundMutationAt/);
  assert.match(bridgeSource, /backgroundAt <= pageImportedAt/);
  assert.match(bridgeSource, /db\.transaction\(storeName, 'readwrite'\)/);
  assert.doesNotMatch(bridgeSource, /Background-owned no-tab scanning is the next migration phase/);
});

test('popup exposes background initialization, coverage, scheduling, and manual controls without stale migration copy', () => {
  for (const id of [
    'status-pill', 'profile-state', 'indexed-state', 'coverage-state', 'last-run', 'next-run',
    'catalogue-state', 'deep-state', 'enabled', 'interval', 'catalogue', 'deep-metadata', 'sync-now', 'deep-now',
  ]) assert.match(popupHtml, new RegExp(`id=["']${id}["']`));
  assert.match(popupHtml, /no Etsy tab is required after initialization/i);
  assert.match(popupJs, /maintenance-get-state/);
  assert.match(popupJs, /maintenance-set-settings/);
  assert.match(popupJs, /maintenance-run-now/);
  assert.match(popupJs, /profile-not-registered/);
  assert.doesNotMatch(`${popupHtml}\n${popupJs}`, /next migration phase/i);
});