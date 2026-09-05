// Cross-browser extension maintenance coordinator.
//
// Chrome/Firefox background contexts own recurring Favorites maintenance and an
// extension-origin index. After one own-Favorites visit has registered the
// profile, scheduled/manual work runs here even with no Etsy tab. Before that
// one-time initialization, an open own-Favorites page remains the only safe
// fallback because it is the only place that can prove the owner identity.

const ebsBackgroundApi = globalThis.browser ?? globalThis.chrome;
const EBS_NAMESPACE = 'etsy-bettersearch';
const EBS_MAINTENANCE_ALARM = 'etsy-bettersearch-maintenance';
const EBS_CONTINUATION_ALARM = 'etsy-bettersearch-maintenance-continuation';
const EBS_CONTINUATION_KEY = 'ebsf.extension.maintenance.continuation.v1';
const EBS_MAINTENANCE_SETTINGS_KEY = 'ebsf.extension.maintenance.settings.v1';
const EBS_MAINTENANCE_STATUS_KEY = 'ebsf.extension.maintenance.status.v1';
const EBS_MIN_INTERVAL_MINUTES = 15;
const EBS_DEFAULT_SETTINGS = Object.freeze({ enabled:true, intervalMinutes:60, catalogue:true, deepMetadata:true });

function ebsLastError() { return globalThis.chrome?.runtime?.lastError || null; }

function ebsStorageGet(keys) {
  if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local.get(keys);
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.get(keys, (items) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message)); else resolve(items || {});
    });
  });
}

function ebsStorageSet(values) {
  if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local.set(values);
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.set(values, () => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message)); else resolve();
    });
  });
}

function ebsAlarmGet(name) {
  if (!ebsBackgroundApi?.alarms?.get) return Promise.resolve(null);
  if (globalThis.browser?.alarms?.get) return globalThis.browser.alarms.get(name);
  return new Promise((resolve, reject) => {
    globalThis.chrome.alarms.get(name, (alarm) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message)); else resolve(alarm || null);
    });
  });
}

function ebsAlarmClear(name) {
  if (!ebsBackgroundApi?.alarms?.clear) return Promise.resolve(false);
  if (globalThis.browser?.alarms?.clear) return globalThis.browser.alarms.clear(name);
  return new Promise((resolve, reject) => {
    globalThis.chrome.alarms.clear(name, (cleared) => {
      const error = ebsLastError();
      if (error) reject(new Error(error.message)); else resolve(Boolean(cleared));
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
      if (error) reject(new Error(error.message)); else resolve(tabs || []);
    });
  });
}

function ebsTabMessage(tabId, message) {
  if (!ebsBackgroundApi?.tabs?.sendMessage) return Promise.resolve(null);
  if (globalThis.browser?.tabs?.sendMessage) return globalThis.browser.tabs.sendMessage(tabId, message).catch(() => null);
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
    enabled:value.enabled !== false,
    intervalMinutes:interval,
    catalogue:value.catalogue !== false,
    deepMetadata:value.deepMetadata !== false,
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
    executionOwner:'background', phase:'idle', lastWakeAt:0, lastDelegatedAt:0,
    lastCompletedAt:0, nextRunAt:0, lastReason:'', lastResult:'', pageTabId:null,
    catalogueState:null, deepState:null, ...previous, ...patch, updatedAt:Date.now(),
  };
  for (const [key, value] of Object.entries(next)) if (value === undefined) delete next[key];
  await ebsStorageSet({ [EBS_MAINTENANCE_STATUS_KEY]:next });
  return next;
}

async function ebsEnsureMaintenanceAlarm(settingsInput = null) {
  const settings = ebsNormalizeSettings(settingsInput || await ebsGetSettings());
  if (!settings.enabled) {
    await ebsAlarmClear(EBS_MAINTENANCE_ALARM).catch(() => false);
    await ebsAlarmClear(EBS_CONTINUATION_ALARM).catch(() => false);
    await ebsStorageSet({ [EBS_CONTINUATION_KEY]:null });
    return ebsPatchStatus({ phase:'disabled', nextRunAt:0 });
  }
  const existing = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  if (!existing || Number(existing.periodInMinutes) !== settings.intervalMinutes) {
    await ebsAlarmClear(EBS_MAINTENANCE_ALARM).catch(() => false);
    await ebsAlarmCreate(EBS_MAINTENANCE_ALARM, {
      delayInMinutes:Math.min(1, settings.intervalMinutes),
      periodInMinutes:settings.intervalMinutes,
    });
  }
  const alarm = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  return ebsPatchStatus({ phase:'idle', nextRunAt:Number(alarm?.scheduledTime) || (Date.now() + settings.intervalMinutes * 60000) });
}

async function ebsScheduleContinuation(request) {
  const payload = {
    catalogue:request.catalogue !== false,
    deepMetadata:request.deepMetadata !== false,
    reason:String(request.reason || 'continuation'),
    createdAt:Date.now(),
  };
  await ebsStorageSet({ [EBS_CONTINUATION_KEY]:payload });
  await ebsAlarmClear(EBS_CONTINUATION_ALARM).catch(() => false);
  await ebsAlarmCreate(EBS_CONTINUATION_ALARM, { delayInMinutes:0.5 });
}

async function ebsClearContinuation() {
  await ebsAlarmClear(EBS_CONTINUATION_ALARM).catch(() => false);
  await ebsStorageSet({ [EBS_CONTINUATION_KEY]:null });
}

async function ebsNotifyBackgroundUpdated() {
  const tabs = await ebsTabsQuery({ url:['https://www.etsy.com/*'] }).catch(() => []);
  await Promise.all(tabs
    .filter((tab) => Number.isInteger(tab?.id))
    .map((tab) => ebsTabMessage(tab.id, { namespace:EBS_NAMESPACE, type:'maintenance-background-updated' })));
}

function ebsBackgroundResultMutated(result) {
  return Boolean(
    result?.catalogue?.completed
    || Number(result?.deepMetadata?.completed) > 0
    || Number(result?.deepMetadata?.failed) > 0
  );
}

async function ebsRunBackgroundOwner(request) {
  if (typeof ebsBackgroundMaintenanceRunNoTab !== 'function') return { accepted:false, reason:'background-worker-unavailable' };
  const result = await ebsBackgroundMaintenanceRunNoTab(request);
  if (result?.needsContinuation) await ebsScheduleContinuation(request);
  else await ebsClearContinuation();
  if (ebsBackgroundResultMutated(result)) await ebsNotifyBackgroundUpdated().catch(() => {});
  return result;
}

async function ebsDelegateToInitializingPage(request) {
  const tabs = await ebsTabsQuery({ url:['https://www.etsy.com/*'] }).catch(() => []);
  for (const tab of tabs) {
    if (!Number.isInteger(tab?.id)) continue;
    const response = await ebsTabMessage(tab.id, {
      namespace:EBS_NAMESPACE,
      type:'maintenance-run-current-page',
      reason:request.reason,
      catalogue:request.catalogue,
      deepMetadata:request.deepMetadata,
      force:request.force,
    });
    if (!response?.accepted) continue;
    await ebsPatchStatus({
      phase:'delegated-initialization', executionOwner:'page-initialization', lastDelegatedAt:Date.now(),
      lastReason:request.reason, lastResult:`Initializing background maintenance from Etsy Favorites tab ${tab.id}`, pageTabId:tab.id,
    });
    return { accepted:true, delegated:true, initializationFallback:true, tabId:tab.id, ...response };
  }
  return { accepted:false, reason:'profile-not-registered' };
}

async function ebsDelegateMaintenance({ reason='scheduled', catalogue=true, deepMetadata=true, force=false, preferBackground=false } = {}) {
  const settings = await ebsGetSettings();
  if (!force && !settings.enabled) return { accepted:false, reason:'disabled' };
  const wantsCatalogue = catalogue && (force || settings.catalogue);
  const wantsDeep = deepMetadata && (force || settings.deepMetadata);
  if (!wantsCatalogue && !wantsDeep) return { accepted:false, reason:'nothing-enabled' };

  const request = { reason, catalogue:wantsCatalogue, deepMetadata:wantsDeep, force };
  await ebsPatchStatus({ phase:'waking', executionOwner:'background', lastWakeAt:Date.now(), lastReason:reason, lastResult:'', pageTabId:null });

  const profile = typeof ebsWorkerGetProfile === 'function' ? await ebsWorkerGetProfile().catch(() => null) : null;
  if (profile || preferBackground) {
    await ebsPatchStatus({ phase:'background-starting', executionOwner:'background', lastReason:reason, lastResult:'Running background Favorites maintenance.', pageTabId:null });
    const result = await ebsRunBackgroundOwner(request);
    if (result?.accepted || result?.reason !== 'profile-not-registered') return result;
  }

  // A page is used only for the one-time identity/seed bootstrap. Once a
  // profile exists, recurring work never depends on an Etsy tab being open.
  const fallback = await ebsDelegateToInitializingPage(request);
  if (fallback.accepted) return fallback;
  await ebsPatchStatus({
    phase:'needs-initialization', executionOwner:'background', pageTabId:null, lastReason:reason,
    lastResult:'Open your own Etsy Favorites once to initialize no-tab background maintenance.',
  });
  return { accepted:false, reason:'profile-not-registered' };
}

async function ebsRunContinuation() {
  const stored = await ebsStorageGet(EBS_CONTINUATION_KEY);
  const request = stored?.[EBS_CONTINUATION_KEY];
  if (!request) return false;
  const settings = await ebsGetSettings();
  if (!settings.enabled) { await ebsClearContinuation(); return false; }
  return ebsDelegateMaintenance({ ...request, reason:'continuation', force:false, preferBackground:true });
}

async function ebsGetPopupState() {
  const settings = await ebsGetSettings();
  const stored = await ebsStorageGet(EBS_MAINTENANCE_STATUS_KEY);
  const status = stored?.[EBS_MAINTENANCE_STATUS_KEY] || await ebsPatchStatus({});
  const alarm = await ebsAlarmGet(EBS_MAINTENANCE_ALARM).catch(() => null);
  const worker = typeof ebsWorkerPopupDetails === 'function'
    ? await ebsWorkerPopupDetails().catch(() => ({ profile:null, migration:{}, catalog:null, stats:null }))
    : { profile:null, migration:{}, catalog:null, stats:null };
  const profile = worker.profile;
  const migration = worker.migration || {};
  return {
    ok:true,
    settings,
    status:{ ...status, nextRunAt:Number(alarm?.scheduledTime) || Number(status.nextRunAt) || 0 },
    profile:profile ? { owner:profile.owner, login:profile.login, initialized:true } : { initialized:false },
    migration:{
      seededAt:Number(migration.seededAt) || 0,
      lastPageExportAt:Number(migration.lastPageExportAt) || 0,
      lastPageImportAt:Number(migration.lastPageImportAt) || 0,
      lastBackgroundMutationAt:Number(migration.lastBackgroundMutationAt) || 0,
    },
    catalog:worker.catalog || null,
    stats:worker.stats || null,
    capabilities:{
      scheduler:Boolean(ebsBackgroundApi?.alarms),
      pageInitializationFallback:Boolean(ebsBackgroundApi?.tabs),
      noTabScanner:typeof ebsBackgroundMaintenanceRunNoTab === 'function',
      backgroundIndex:typeof ebsWorkerExportRecords === 'function',
    },
  };
}

async function ebsSetMaintenanceSettings(patch = {}) {
  const current = await ebsGetSettings();
  const settings = ebsNormalizeSettings({ ...current, ...patch });
  await ebsStorageSet({ [EBS_MAINTENANCE_SETTINGS_KEY]:settings });
  await ebsEnsureMaintenanceAlarm(settings);
  return ebsGetPopupState();
}

async function ebsHandlePageState(message, sender) {
  const channel = message.channel === 'deep' ? 'deepState' : 'catalogueState';
  const detail = message.detail && typeof message.detail === 'object' ? message.detail : {};
  const terminal = ['completed', 'completed_with_errors', 'cancelled', 'error'].includes(String(detail.status || ''));
  const patch = {
    [channel]:detail,
    phase:terminal ? 'idle' : 'page-running',
    executionOwner:'page-explicit',
    pageTabId:sender?.tab?.id ?? null,
    lastResult:terminal ? `${message.channel || 'maintenance'}: ${detail.status}` : 'Explicit maintenance running in Etsy Favorites tab',
  };
  if (terminal) patch.lastCompletedAt = Date.now();
  await ebsPatchStatus(patch);
  return { ok:true };
}

async function ebsImportPageChunk(message) {
  if (typeof ebsWorkerImportRecords !== 'function') throw new Error('Background Favorites index is unavailable.');
  const imported = await ebsWorkerImportRecords(String(message.store || ''), message.records || []);
  return { ok:true, imported };
}

// Legacy message name retained for compatibility with the first bridge build.
// This is a page -> background export acknowledgement, not a background -> page
// import timestamp.
async function ebsFinalizePageImport(message = {}) {
  const profile = typeof ebsWorkerGetProfile === 'function' ? await ebsWorkerGetProfile().catch(() => null) : null;
  const owner = String(message.owner || '').trim();
  if (!profile?.owner || !owner || String(profile.owner) !== owner) throw new Error('Favorites page export owner does not match the initialized background profile.');
  const stored = await ebsStorageGet(EBS_BACKGROUND_MIGRATION_KEY);
  const current = stored?.[EBS_BACKGROUND_MIGRATION_KEY] || {};
  const now = Date.now();
  const next = await ebsWorkerMarkMigration({
    owner,
    seededAt:Math.max(0, Number(current.seededAt) || now),
    lastPageExportAt:now,
  });
  return { ok:true, completedAt:now, migration:next };
}

async function ebsMarkPageImportComplete(message = {}) {
  const profile = typeof ebsWorkerGetProfile === 'function' ? await ebsWorkerGetProfile().catch(() => null) : null;
  const owner = String(message.owner || '').trim();
  if (!profile?.owner || !owner || String(profile.owner) !== owner) throw new Error('Favorites page import owner does not match the initialized background profile.');
  const throughAt = Math.max(0, Number(message.throughAt) || 0);
  const stored = await ebsStorageGet(EBS_BACKGROUND_MIGRATION_KEY);
  const current = stored?.[EBS_BACKGROUND_MIGRATION_KEY] || {};
  const lastBackgroundMutationAt = Math.max(0, Number(current.lastBackgroundMutationAt) || 0);
  if (!throughAt || throughAt > lastBackgroundMutationAt) throw new Error('Favorites page import acknowledgement is outside the known background generation.');
  const next = await ebsWorkerMarkMigration({
    owner,
    lastPageImportAt:Math.max(Number(current.lastPageImportAt) || 0, throughAt),
  });
  return { ok:true, throughAt, migration:next };
}

function ebsRespondAsync(sendResponse, task) {
  Promise.resolve(task).then(
    (value) => sendResponse(value),
    (error) => sendResponse({ ok:false, error:String(error?.message || error) }),
  );
  return true;
}

async function ebsBootstrap() {
  const settings = await ebsGetSettings();
  await ebsStorageSet({ [EBS_MAINTENANCE_SETTINGS_KEY]:settings });
  await ebsEnsureMaintenanceAlarm(settings);
  if (typeof ebsWorkerRecoverExpiredDeepJobs === 'function') await ebsWorkerRecoverExpiredDeepJobs().catch(() => 0);
}

if (ebsBackgroundApi?.runtime?.onInstalled) ebsBackgroundApi.runtime.onInstalled.addListener(() => { void ebsBootstrap(); });
if (ebsBackgroundApi?.runtime?.onStartup) ebsBackgroundApi.runtime.onStartup.addListener(() => { void ebsBootstrap(); });
if (ebsBackgroundApi?.alarms?.onAlarm) {
  ebsBackgroundApi.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === EBS_MAINTENANCE_ALARM) {
      void ebsDelegateMaintenance({ reason:'scheduled' }).finally(() => ebsEnsureMaintenanceAlarm());
    } else if (alarm?.name === EBS_CONTINUATION_ALARM) {
      void ebsRunContinuation();
    }
  });
}

if (ebsBackgroundApi?.runtime?.onMessage) {
  ebsBackgroundApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.namespace !== EBS_NAMESPACE) return undefined;
    if (message.type === 'ping') { sendResponse({ ok:true, context:'background' }); return true; }
    if (message.type === 'maintenance-get-state') return ebsRespondAsync(sendResponse, ebsGetPopupState());
    if (message.type === 'maintenance-set-settings') return ebsRespondAsync(sendResponse, ebsSetMaintenanceSettings(message.settings || {}));
    if (message.type === 'maintenance-run-now') return ebsRespondAsync(sendResponse, ebsDelegateMaintenance({
      reason:message.reason || 'manual', catalogue:message.catalogue !== false,
      deepMetadata:message.deepMetadata !== false, force:true,
    }));
    if (message.type === 'maintenance-page-state') return ebsRespondAsync(sendResponse, ebsHandlePageState(message, sender));
    if (message.type === 'maintenance-register-profile') return ebsRespondAsync(sendResponse, ebsWorkerRegisterProfile(message.profile || {}));
    if (message.type === 'maintenance-import-page-chunk') return ebsRespondAsync(sendResponse, ebsImportPageChunk(message));
    if (message.type === 'maintenance-finalize-page-import') return ebsRespondAsync(sendResponse, ebsFinalizePageImport(message));
    if (message.type === 'maintenance-page-import-complete') return ebsRespondAsync(sendResponse, ebsMarkPageImportComplete(message));
    if (message.type === 'maintenance-export-snapshot') return ebsRespondAsync(sendResponse, ebsWorkerExportRecords(message.store, message.offset, message.limit));
    return undefined;
  });
}

void ebsBootstrap().catch((error) => {
  console.warn('Etsy BetterSearch background maintenance bootstrap failed.', error);
});
