import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { makeManifest } from '../scripts/project.mjs';

const backgroundSource = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../extension/content-bridge.js', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

function makeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
  };
}

function createBackgroundHarness() {
  const storage = {};
  const alarms = new Map();
  let tabs = [];
  let tabResponse = null;
  const runtime = {
    onInstalled:makeEvent(),
    onStartup:makeEvent(),
    onMessage:makeEvent(),
  };
  const alarmEvents = { onAlarm:makeEvent() };
  const browser = {
    storage:{
      local:{
        async get(keys) {
          if (keys == null) return { ...storage };
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((key) => key in storage).map((key) => [key, storage[key]]));
        },
        async set(values) { Object.assign(storage, values); },
      },
    },
    runtime,
    alarms:{
      ...alarmEvents,
      async get(name) { return alarms.get(name) || null; },
      async clear(name) { return alarms.delete(name); },
      async create(name, info) {
        alarms.set(name, { name, ...info, scheduledTime:Date.now() + Number(info.delayInMinutes || info.periodInMinutes || 1) * 60000 });
      },
    },
    tabs:{
      async query() { return tabs.slice(); },
      async sendMessage() { return tabResponse; },
    },
  };
  const context = vm.createContext({
    browser,
    console:{ log() {}, warn() {}, error() {} },
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(backgroundSource, context, { filename:'extension/background.js' });

  const send = (message) => new Promise((resolve) => {
    const listener = runtime.onMessage.listeners[0];
    assert.equal(typeof listener, 'function');
    const keepAlive = listener({ namespace:'etsy-bettersearch', ...message }, {}, resolve);
    assert.equal(keepAlive, true);
  });

  return {
    storage,
    alarms,
    send,
    setTabs(value, response = null) { tabs = value; tabResponse = response; },
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Chrome and Firefox manifests expose the popup and alarm permission without adding cookie/tab permissions', () => {
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

test('background bootstrap persists defaults and creates a recurring maintenance alarm', async () => {
  const harness = createBackgroundHarness();
  await settle();
  const settings = plain(harness.storage['ebsf.extension.maintenance.settings.v1']);
  assert.deepEqual(settings, { enabled:true, intervalMinutes:60, catalogue:true, deepMetadata:true });
  const alarm = harness.alarms.get('etsy-bettersearch-maintenance');
  assert.equal(alarm.periodInMinutes, 60);
  const state = await harness.send({ type:'maintenance-get-state' });
  assert.equal(state.ok, true);
  assert.equal(state.capabilities.noTabScanner, false);
});

test('changing maintenance settings recreates or clears the alarm durably', async () => {
  const harness = createBackgroundHarness();
  await settle();
  let state = await harness.send({ type:'maintenance-set-settings', settings:{ intervalMinutes:180 } });
  assert.equal(state.settings.intervalMinutes, 180);
  assert.equal(harness.alarms.get('etsy-bettersearch-maintenance').periodInMinutes, 180);

  state = await harness.send({ type:'maintenance-set-settings', settings:{ enabled:false } });
  assert.equal(state.settings.enabled, false);
  assert.equal(harness.alarms.has('etsy-bettersearch-maintenance'), false);
});

test('manual maintenance delegates to one eligible Etsy tab and fails closed when none accepts', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.setTabs([{ id:41 }], { accepted:true, catalogue:true, deepMetadata:false });
  const accepted = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'test' });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.tabId, 41);

  harness.setTabs([], null);
  const deferred = await harness.send({ type:'maintenance-run-now', catalogue:true, deepMetadata:false, reason:'test-no-tab' });
  assert.equal(deferred.accepted, false);
  assert.equal(deferred.reason, 'no-eligible-etsy-tab');
  assert.equal(harness.storage['ebsf.extension.maintenance.status.v1'].phase, 'waiting-background-owner');
});

test('content bridge is extension-only, loaded after shared modules, and reuses existing scanner owners', () => {
  const sharedModulesPosition = buildSource.indexOf("${moduleSources.join('\\n')}");
  const bridgePosition = buildSource.indexOf('${contentBridge.trim()}');
  assert.match(buildSource, /extension\/content-bridge\.js/);
  assert.ok(sharedModulesPosition >= 0, 'generated extension bundle must still include the shared userscript module chain');
  assert.ok(bridgePosition > sharedModulesPosition, 'extension-only maintenance bridge must load after the shared module chain');
  assert.match(bridgeSource, /favMaybeAutoSync\(true\)/);
  assert.match(bridgeSource, /favSyncScope\(scope/);
  assert.match(bridgeSource, /favDeepStart\(\{ force:force === true \}\)/);
  assert.match(bridgeSource, /inactive-runtime-owner/);
});

test('popup exposes status, interval, automatic catalogue/deep controls and manual actions', () => {
  for (const id of ['status-pill', 'last-run', 'next-run', 'catalogue-state', 'deep-state', 'enabled', 'interval', 'catalogue', 'deep-metadata', 'sync-now', 'deep-now']) {
    assert.match(popupHtml, new RegExp(`id=["']${id}["']`));
  }
  assert.match(popupJs, /maintenance-get-state/);
  assert.match(popupJs, /maintenance-set-settings/);
  assert.match(popupJs, /maintenance-run-now/);
});
