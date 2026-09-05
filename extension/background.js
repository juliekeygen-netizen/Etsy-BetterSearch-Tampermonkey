// Cross-browser extension maintenance coordinator.
//
// Phase 1 deliberately keeps the existing Etsy-page Favorites runtime as the
// scanner/database owner. The background context owns scheduling, persisted
// maintenance preferences/status, popup commands, and delegation. A later
// phase can move the same message contract onto an extension-origin database
// without ever running two independent persistent scanners.

const ebsBackgroundApi = globalThis.browser ?? globalThis.chrome;
const EBS_NAMESPACE = 'etsy-bettersearch';
const EBS_MAINTENANCE_ALARM = 'etsy-bettersearch-maintenance';
const EBS_MAINTENANCE_SETTINGS_KEY = 'ebsf.extension.maintenance.settings.v1';
const EBS_MAINTENANCE_STATUS_KEY = 'ebsf.extension.maintenance.status.v1';
const EBS_MIN_INTERVAL_MINUTES = 15;
const EBS_DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  intervalMinutes: 60,
  catalogue: true,
  deepMetadata: true,
});

function ebsLastError() {
  return globalThis.chrome?.runtime?.lastError || null;
}

function ebsStorageGet(keys) {
  if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local.get(keys);
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.get(keys, (items) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message));
      else resolve(items || {});
    });
  });
}

function ebsStorageSet(values) {
  if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local.set(values);
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.set(values, () => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function ebsAlarmGet(name) {
  if (!ebsBackgroundApi?.alarms?.get) return Promise.resolve(null);
  if (globalThis.browser?.alarms?.get) return globalThis.browser.alarms.get(name);
  return new Promise((resolve, reject) => {
    globalThis.chrome.alarms.get(name, (alarm) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message));
      else resolve(alarm || null);
    });
  });
}

function ebsAlarmClear(name) {
  if (!ebsBackgroundApi?.alarms?.clear) return Promise.resolve(false);
  if (globalThis.browser?.alarms?.clear) return globalThis.browser.alarms.clear(name);
  return new Promise((resolve, reject) => {
    globalThis.chrome.alarms.clear(name, (cleared) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message));
      else resolve(Boolean(cleared));
    });
  });
}

function ebsAlarmCreate(name, alarmInfo) {
  if (!ebsBackgroundApi?.alarms?.create) return Promise.resolve();
  const result = ebsBackgroundApi.alarms.create(name, alarmInfo);
  return result && typeof result.then === 'function' ? result : Promise.resolve();
}

function ebsTabsQuery(queryInfo) {
  if (!ebsBackgroundApi?.tabs?.query) return Promise.resolve([]);
  if (globalThis.browser?.tabs?.query) return globalThis.browser.tabs.query(queryInfo);
  return new Promise((resolve, reject) => {
    globalThis.chrome.tabs.query(queryInfo, (tabs) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message));
      else resolve(tabs || []);
    });
  });
}

function ebsTabMessage(tabId, message) {
  if (!ebsBackgroundApi?.tabs?.sendMessage) return Promise.resolve(null);
  if (globalThis.browser?.tabs?.sendMessage) {
    return globalThis.browser.tabs.sendMessage(tabId, message).catch(() => null);
  }
  return new Promise((resolve) => {
    globalThis.chrome.tabs.sendMessage(tabId, message, (response) => {
      void ebsLastError();
      resolve(response || null);
    });
  });
}

function ebsNormalizeSettings(value = {}) {
  const interval = Math.max(EBS_MIN_INTERVAL_MINUTES, Math.round(Number(value.intervalMinutes) || EBS_DEFAULT_SETTINGS.intervalMinutes));
  return {
    enabled: value.enabled !== false,
    intervalMinutes: interval,
    catalogue: value.catalogue !== false,
    deepMetadata: value.deepMetadata !== false,
  };
}

async function ebsGetSettings() {
  const stored = await ebsStorageGet(EBS_MAINTENANCE_SETTINGS_KEY);
  return ebsNormalizeSettings(stored?.[EBS_MAINTENANCE_SETTINGS_KEY]);
}

async function ebsPatchStatus(patch = {}) {
  const stored = await ebsStorageGet(EBS_MAINTENANCE_STATUS_KEY);
  const previous = stored?.[EBS_MAINTENANCE_STATUS_KEY] || {};
  const next = {
    executionOwner: 'page-delegated',
    phase: 'idle',
    lastWakeAt: 0,
    lastDelegatedAt: 0,
    lastCompletedAt: 0,
    nextRunAt: 0,
    lastReason: '',
    lastResult: '',
    catalogueState: null,
    deepState: null,
    ...previous,
    ...patch,
    updatedAt: Date.now(),
  };
  await ebsStorageSet({ [EBS_MAINTENANCE_STATUS_KEY]: next });
  return next;
}

async function ebsEnsureMaintenanceAlarm(settingsInput = null) {
  const settings = ebsNormalizeSettings(settingsInput || await ebsGetSettings());
  if (!settings.enabled) {
    await ebsAlarmClear(EBS_MAINTENANCE_ALARM).catch(() => false);
    return ebsPatchStatus({ phase: 'disabled', nextRunAt: 0 });
  }

  const existing = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  const expectedPeriod = settings.intervalMinutes;
  if (!existing || Number(existing.periodInMinutes) !== expectedPeriod) {
    await ebsAlarmClear(EBS_MAINTENANCE_ALARM).catch(() => false);
    await ebsAlarmCreate(EBS_MAINTENANCE_ALARM, {
      delayInMinutes: Math.min(1, expectedPeriod),
      periodInMinutes: expectedPeriod,
    });
  }
  const alarm = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  return ebsPatchStatus({
    phase: 'idle',
    nextRunAt: Number(alarm?.scheduledTime) || (Date.now() + expectedPeriod * 60000),
  });
}

async function ebsDelegateMaintenance({ reason = 'scheduled', catalogue = true, deepMetadata = true, force = false } = {}) {
  const settings = await ebsGetSettings();
  if (!force && !settings.enabled) return { accepted: false, reason: 'disabled' };

  const wantsCatalogue = catalogue && settings.catalogue;
  const wantsDeep = deepMetadata && settings.deepMetadata;
  if (!wantsCatalogue && !wantsDeep) return { accepted: false, reason: 'nothing-enabled' };

  await ebsPatchStatus({ phase: 'waking', lastWakeAt: Date.now(), lastReason: reason, lastResult: '' });
  const tabs = await ebsTabsQuery({ url: ['https://www.etsy.com/*'] }).catch(() => []);
  for (const tab of tabs) {
    if (!Number.isInteger(tab?.id)) continue;
    const response = await ebsTabMessage(tab.id, {
      namespace: EBS_NAMESPACE,
      type: 'maintenance-run-current-page',
      reason,
      catalogue: wantsCatalogue,
      deepMetadata: wantsDeep,
      force,
    });
    if (!response?.accepted) continue;
    await ebsPatchStatus({
      phase: 'delegated',
      lastDelegatedAt: Date.now(),
      lastReason: reason,
      lastResult: `Delegated to Etsy tab ${tab.id}`,
      pageTabId: tab.id,
    });
    return { accepted: true, delegated: true, tabId: tab.id };
  }

  await ebsPatchStatus({
    phase: 'waiting-background-owner',
    lastReason: reason,
    lastResult: 'No eligible Etsy Favorites tab is open; background database/scanner migration is the next phase.',
    pageTabId: null,
  });
  return { accepted: false, delegated: false, reason: 'no-eligible-etsy-tab' };
}

async function ebsGetPopupState() {
  const settings = await ebsGetSettings();
  const stored = await ebsStorageGet(EBS_MAINTENANCE_STATUS_KEY);
  const status = stored?.[EBS_MAINTENANCE_STATUS_KEY] || await ebsPatchStatus({});
  const alarm = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  return {
    ok: true,
    settings,
    status: {
      ...status,
      nextRunAt: Number(alarm?.scheduledTime) || Number(status.nextRunAt) || 0,
    },
    capabilities: {
      scheduler: Boolean(ebsBackgroundApi?.alarms),
      pageDelegation: Boolean(ebsBackgroundApi?.tabs),
      noTabScanner: false,
    },
  };
}

async function ebsSetMaintenanceSettings(patch = {}) {
  const current = await ebsGetSettings();
  const settings = ebsNormalizeSettings({ ...current, ...patch });
  await ebsStorageSet({ [EBS_MAINTENANCE_SETTINGS_KEY]: settings });
  await ebsEnsureMaintenanceAlarm(settings);
  return ebsGetPopupState();
}

async function ebsHandlePageState(message, sender) {
  const channel = message.channel === 'deep' ? 'deepState' : 'catalogueState';
  const detail = message.detail && typeof message.detail === 'object' ? message.detail : {};
  const terminal = ['completed', 'completed_with_errors', 'cancelled', 'error'].includes(String(detail.status || ''));
  await ebsPatchStatus({
    [channel]: detail,
    phase: terminal ? 'idle' : 'page-running',
    pageTabId: sender?.tab?.id ?? null,
    lastCompletedAt: terminal ? Date.now() : undefined,
    lastResult: terminal ? `${message.channel || 'maintenance'}: ${detail.status}` : 'Maintenance running in Etsy tab',
  });
  return { ok: true };
}

function ebsRespondAsync(sendResponse, task) {
  Promise.resolve(task).then(
    (value) => sendResponse(value),
    (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
  );
  return true;
}

async function ebsBootstrap() {
  const settings = await ebsGetSettings();
  await ebsStorageSet({ [EBS_MAINTENANCE_SETTINGS_KEY]: settings });
  await ebsEnsureMaintenanceAlarm(settings);
}

if (ebsBackgroundApi?.runtime?.onInstalled) {
  ebsBackgroundApi.runtime.onInstalled.addListener(() => { void ebsBootstrap(); });
}
if (ebsBackgroundApi?.runtime?.onStartup) {
  ebsBackgroundApi.runtime.onStartup.addListener(() => { void ebsBootstrap(); });
}
if (ebsBackgroundApi?.alarms?.onAlarm) {
  ebsBackgroundApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== EBS_MAINTENANCE_ALARM) return;
    void ebsDelegateMaintenance({ reason: 'scheduled' }).finally(() => ebsEnsureMaintenanceAlarm());
  });
}

if (ebsBackgroundApi?.runtime?.onMessage) {
  ebsBackgroundApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.namespace !== EBS_NAMESPACE) return undefined;
    if (message.type === 'ping') {
      sendResponse({ ok: true, context: 'background' });
      return true;
    }
    if (message.type === 'maintenance-get-state') {
      return ebsRespondAsync(sendResponse, ebsGetPopupState());
    }
    if (message.type === 'maintenance-set-settings') {
      return ebsRespondAsync(sendResponse, ebsSetMaintenanceSettings(message.settings || {}));
    }
    if (message.type === 'maintenance-run-now') {
      return ebsRespondAsync(sendResponse, ebsDelegateMaintenance({
        reason: message.reason || 'manual',
        catalogue: message.catalogue !== false,
        deepMetadata: message.deepMetadata !== false,
        force: true,
      }));
    }
    if (message.type === 'maintenance-page-state') {
      return ebsRespondAsync(sendResponse, ebsHandlePageState(message, sender));
    }
    return undefined;
  });
}

void ebsBootstrap().catch((error) => {
  console.warn('Etsy BetterSearch background maintenance bootstrap failed.', error);
});
