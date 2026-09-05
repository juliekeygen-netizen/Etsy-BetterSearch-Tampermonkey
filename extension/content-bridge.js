// Extension-only page/background maintenance bridge. Tampermonkey never loads
// this file. The Etsy-page IndexedDB is a UI cache/compatibility replica; the
// extension background owns automatic catalogue/deep maintenance so it can run
// with no Etsy tab.

const ebsContentApi = globalThis.browser ?? globalThis.chrome;
const EBS_CONTENT_NAMESPACE = 'etsy-bettersearch';
const EBS_CONTENT_SNAPSHOT_STORES = ['listings', 'shops', 'scopes', 'deepScanQueue'];
const EBS_CONTENT_CHUNK_SIZE = 150;
let ebsContentOwnerReady = '';
let ebsContentSyncPromise = null;
let ebsContentPushTimer = 0;
let ebsContentPullTimer = 0;

// Extension delivery has a real service-worker scheduler. Suppress only the
// page runtime's automatic maintenance hooks; explicit page UI actions remain
// unchanged. The captured auto-sync implementation is retained solely as a
// first-run fallback before the background has learned an owner profile.
const ebsContentPageAutoSync = typeof favMaybeAutoSync === 'function' ? favMaybeAutoSync : null;
if (ebsContentPageAutoSync) favMaybeAutoSync = function ebsExtensionPageAutoSyncDisabled() { return Promise.resolve(false); };
if (typeof favDeepMaybeAutoScan === 'function') favDeepMaybeAutoScan = function ebsExtensionPageDeepAutoDisabled() { return Promise.resolve(false); };

function ebsContentMessage(message) {
  if (!ebsContentApi?.runtime?.sendMessage) return Promise.resolve(null);
  const payload = { namespace:EBS_CONTENT_NAMESPACE, ...message };
  if (globalThis.browser?.runtime?.sendMessage) return globalThis.browser.runtime.sendMessage(payload).catch(() => null);
  return new Promise((resolve) => {
    try {
      globalThis.chrome.runtime.sendMessage(payload, (response) => {
        void globalThis.chrome.runtime?.lastError;
        resolve(response || null);
      });
    } catch (_) { resolve(null); }
  });
}

function ebsContentSend(message) { void ebsContentMessage(message); }

function ebsContentSerializableState(detail = {}) {
  return {
    status:String(detail.status || 'idle'),
    processed:Math.max(0, Number(detail.processed ?? detail.completed) || 0),
    completed:Math.max(0, Number(detail.completed) || 0),
    failed:Math.max(0, Number(detail.failed) || 0),
    total:Math.max(0, Number(detail.total ?? detail.expectedTotal) || 0),
    pagesProcessed:Math.max(0, Number(detail.pagesProcessed) || 0),
    startedAt:Math.max(0, Number(detail.startedAt) || 0),
    completedAt:Math.max(0, Number(detail.completedAt) || 0),
    error:String(detail.error || ''),
  };
}

function ebsContentProfile() {
  if (typeof isFavoritesPage !== 'function' || !isFavoritesPage()) return null;
  const props = typeof favProps === 'function' ? favProps() : null;
  if (!props || (typeof favIsOwnFavoritesPage === 'function' && !favIsOwnFavoritesPage(props))) return null;
  const owner = String(props.profileOwnerUserId || '').trim();
  if (!owner) return null;
  return {
    owner,
    login:typeof favProfileLogin === 'function' ? String(favProfileLogin() || '') : '',
    locale:typeof favDetectedLocaleHeader === 'function' ? String(favDetectedLocaleHeader() || '') : '',
    registeredAt:Date.now(),
  };
}

function ebsContentTerminal(detail = {}) {
  return ['completed', 'completed_with_errors', 'cancelled', 'error'].includes(String(detail.status || ''));
}

function ebsContentBackgroundActive(state) {
  const phase = String(state?.status?.phase || '');
  return ['background-starting', 'background-catalogue', 'background-deep', 'background-continuation'].includes(phase);
}

function ebsContentPageBusy() {
  const catalogBusy = typeof favCatalogInflight0141 !== 'undefined' && favCatalogInflight0141?.size > 0;
  const deepBusy = typeof favDeepRunnerPromise !== 'undefined' && Boolean(favDeepRunnerPromise);
  return Boolean(catalogBusy || deepBusy);
}

function ebsContentCancelPageMaintenanceForBackground() {
  try { favState?.controller?.abort?.(); } catch (_) {}
  try { if (typeof favCancelSync === 'function') favCancelSync('extension-background-owner'); } catch (_) {}
  try { if (typeof favDeepCancel === 'function') favDeepCancel('extension-background-owner'); } catch (_) {}
}

async function ebsContentOwnedPageSnapshot(profile) {
  const db = await favIndexOpen();
  const transaction = db.transaction(EBS_CONTENT_SNAPSHOT_STORES, 'readonly');
  const [listings, shops, scopes, jobs] = await Promise.all([
    favIndexRequest(transaction.objectStore('listings').getAll()),
    favIndexRequest(transaction.objectStore('shops').getAll()),
    favIndexRequest(transaction.objectStore('scopes').getAll()),
    favIndexRequest(transaction.objectStore('deepScanQueue').getAll()),
  ]);
  const ownedScopes = scopes.filter((scope) => String(scope?.owner || '') === String(profile.owner));
  const listingIds = new Set(ownedScopes.flatMap((scope) => scope?.listingIds || []).map(String));
  const ownedListings = listings.filter((listing) => listingIds.has(String(listing?.listingId || '')));
  const shopIds = new Set(ownedListings.map((listing) => String(listing?.shopId || '')).filter(Boolean));
  return {
    listings:ownedListings,
    shops:shops.filter((shop) => shopIds.has(String(shop?.shopId || ''))),
    scopes:ownedScopes,
    deepScanQueue:jobs.filter((job) => listingIds.has(String(job?.listingId || ''))),
  };
}

async function ebsContentPushSnapshot(profile, snapshot) {
  for (const store of EBS_CONTENT_SNAPSHOT_STORES) {
    const records = Array.isArray(snapshot?.[store]) ? snapshot[store] : [];
    for (let offset = 0; offset < records.length; offset += EBS_CONTENT_CHUNK_SIZE) {
      const response = await ebsContentMessage({
        type:'maintenance-import-page-chunk', store,
        records:records.slice(offset, offset + EBS_CONTENT_CHUNK_SIZE),
      });
      if (response?.ok === false) throw new Error(response.error || `Could not import ${store} into background index.`);
    }
  }
  const result = await ebsContentMessage({ type:'maintenance-finalize-page-import', owner:profile.owner });
  if (result?.ok === false) throw new Error(result.error || 'Could not finalize background Favorites seed/export.');
}

function ebsContentMergeRawListing(existing, incoming) {
  const observedAt = Math.max(Number(incoming?.lastSeenFavoriteAt) || 0, Number(incoming?.lastCardRefreshAt) || 0, Date.now());
  const merged = favIndexMergeListing(existing, incoming, observedAt);
  const incomingDeep = Number(incoming?.lastDeepScanAt) || 0;
  const existingDeep = Number(existing?.lastDeepScanAt) || 0;
  const deepSource = incomingDeep >= existingDeep ? incoming : existing;
  merged.lastDeepScanAt = Math.max(incomingDeep, existingDeep);
  merged.deepParserVersion = String(deepSource?.deepParserVersion || merged.deepParserVersion || '');
  merged.shippingOriginParserVersion = String(deepSource?.shippingOriginParserVersion || merged.shippingOriginParserVersion || '');
  const incomingAvailabilityAt = Number(incoming?.availabilityObservedAt) || 0;
  const existingAvailabilityAt = Number(existing?.availabilityObservedAt) || 0;
  const availabilitySource = incomingAvailabilityAt >= existingAvailabilityAt ? incoming : existing;
  if (availabilitySource?.availabilityState) {
    merged.availabilityState = availabilitySource.availabilityState;
    merged.availabilityObservedAt = Math.max(incomingAvailabilityAt, existingAvailabilityAt);
  }
  const firstSeen = [existing?.firstSeenAt, incoming?.firstSeenAt].map(Number).filter((value) => value > 0);
  merged.firstSeenAt = firstSeen.length ? Math.min(...firstSeen) : observedAt;
  return merged;
}

function ebsContentMergeRawShop(existing, incoming) {
  if (!existing) return incoming;
  const merged = { ...existing, ...incoming };
  for (const key of ['starSeller', 'giftCardSupport', 'shopRating', 'shopReviewCount', 'salesCount', 'tenure']) {
    if (existing?.[key] || incoming?.[key]) merged[key] = favIndexMergeField(existing?.[key], incoming?.[key]);
  }
  merged.lastObservedAt = Math.max(Number(existing.lastObservedAt) || 0, Number(incoming.lastObservedAt) || 0);
  merged.lastScannedAt = Math.max(Number(existing.lastScannedAt) || 0, Number(incoming.lastScannedAt) || 0);
  return merged;
}

function ebsContentScopeCommitAt(scope) {
  return Math.max(0, Number(scope?.snapshotCommittedAt) || 0, Number(scope?.lastCompleteSyncAt) || 0);
}

function ebsContentMergeScope(existing, incoming) {
  if (!existing) return incoming;
  const incomingComplete = ebsContentScopeCommitAt(incoming);
  const existingComplete = ebsContentScopeCommitAt(existing);
  if (incomingComplete > existingComplete) return { ...existing, ...incoming };
  if (incomingComplete < existingComplete) return { ...incoming, ...existing };
  return (Number(incoming.lastObservedAt) || 0) >= (Number(existing.lastObservedAt) || 0)
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
}

function ebsContentMergeJob(existing, incoming) {
  const normalize = (job) => job?.status === 'running'
    ? { ...job, status:'queued', attempts:Math.max(0, (Number(job.attempts) || 1) - 1), startedAt:0, nextAttemptAt:0, workerId:'', leaseUntil:0, error:'Recovered during database handoff' }
    : job;
  if (!existing) return normalize(incoming);
  if (existing.status === 'running' && Number(existing.leaseUntil) > Date.now()) return existing;
  const newer = (Number(incoming?.updatedAt) || 0) >= (Number(existing?.updatedAt) || 0) ? incoming : existing;
  return normalize(newer);
}

function ebsContentRequestGroup(requests, done, fail) {
  if (!requests.length) { done([]); return; }
  const values = new Array(requests.length);
  let remaining = requests.length;
  requests.forEach((request, index) => {
    request.onsuccess = () => {
      values[index] = request.result;
      remaining -= 1;
      if (!remaining) done(values);
    };
    request.onerror = () => fail(request.error || new Error('Favorites page replica read failed.'));
  });
}

async function ebsContentImportRecords(storeName, records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) return 0;
  const keyField = { listings:'listingId', shops:'shopId', scopes:'scopeKey', deepScanQueue:'id' }[storeName];
  if (!keyField) throw new Error(`Unsupported Favorites snapshot store: ${storeName}`);
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const valid = list.filter((record) => String(record?.[keyField] || ''));
    const requests = valid.map((record) => store.get(String(record[keyField])));
    let imported = 0;
    let failure = null;
    const abort = (error) => { failure = error; try { transaction.abort(); } catch (_) {} };
    ebsContentRequestGroup(requests, (existing) => {
      try {
        valid.forEach((record, index) => {
          const old = existing[index];
          const merged = storeName === 'listings' ? ebsContentMergeRawListing(old, record)
            : storeName === 'shops' ? ebsContentMergeRawShop(old, record)
            : storeName === 'scopes' ? ebsContentMergeScope(old, record)
            : ebsContentMergeJob(old, record);
          if (merged) { store.put(merged); imported += 1; }
        });
      } catch (error) { abort(error); }
    }, abort);
    transaction.oncomplete = () => resolve(imported);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error(`Favorites page ${storeName} import aborted.`));
  });
}

async function ebsContentPullBackgroundSnapshot() {
  for (const store of EBS_CONTENT_SNAPSHOT_STORES) {
    let offset = 0;
    for (;;) {
      const page = await ebsContentMessage({ type:'maintenance-export-snapshot', store, offset, limit:200 });
      if (!page || page.ok === false) {
        if (page?.error) throw new Error(page.error);
        break;
      }
      await ebsContentImportRecords(store, page.records || []);
      if (page.done || !page.records?.length) break;
      offset = Number(page.nextOffset) || (offset + page.records.length);
    }
  }
}

async function ebsContentRefreshFromImportedIndex() {
  if (typeof favPrimeDatasetFromCache0137 === 'function') await Promise.resolve(favPrimeDatasetFromCache0137({ force:true })).catch(() => {});
  if (typeof favEnhancementActive === 'function' && favEnhancementActive() && typeof favReapply === 'function') await Promise.resolve(favReapply()).catch(() => {});
}

async function ebsContentImportBackgroundIfNeeded(force = false) {
  const state = await ebsContentMessage({ type:'maintenance-get-state' });
  if (!state?.ok) return false;
  if (ebsContentBackgroundActive(state)) {
    ebsContentCancelPageMaintenanceForBackground();
    ebsContentScheduleBackgroundPull(1500);
    return false;
  }
  const migration = state.migration || {};
  const backgroundAt = Math.max(0, Number(migration.lastBackgroundMutationAt) || 0);
  const pageImportedAt = Math.max(0, Number(migration.lastPageImportAt) || 0);
  if (!force && (!backgroundAt || backgroundAt <= pageImportedAt)) return false;
  if (ebsContentPageBusy()) {
    ebsContentScheduleBackgroundPull(1200);
    return false;
  }
  await ebsContentPullBackgroundSnapshot();
  await ebsContentRefreshFromImportedIndex();
  const marked = await ebsContentMessage({ type:'maintenance-page-import-complete', owner:state.profile?.owner || '', throughAt:backgroundAt });
  if (marked?.ok === false) throw new Error(marked.error || 'Could not record background-to-page Favorites handoff.');
  return true;
}

function ebsContentScheduleBackgroundPull(delay = 1200) {
  clearTimeout(ebsContentPullTimer);
  ebsContentPullTimer = setTimeout(() => {
    ebsContentPullTimer = 0;
    void ebsContentImportBackgroundIfNeeded().catch((error) => console.debug?.('[EBSF] Background snapshot import deferred.', error));
  }, Math.max(250, Number(delay) || 1200));
}

async function ebsContentInitializeBackgroundIndex() {
  const profile = ebsContentProfile();
  if (!profile) return false;
  if (ebsContentOwnerReady === profile.owner) return true;
  if (ebsContentSyncPromise) return ebsContentSyncPromise;
  ebsContentSyncPromise = (async () => {
    await Promise.resolve(typeof favIndexObserveCurrentPage === 'function' ? favIndexObserveCurrentPage() : null).catch(() => {});
    const registration = await ebsContentMessage({ type:'maintenance-register-profile', profile });
    if (!registration) return false;
    if (registration.error) throw new Error(registration.error);
    if (registration.needsPageSeed) {
      const snapshot = await ebsContentOwnedPageSnapshot(profile);
      await ebsContentPushSnapshot(profile, snapshot);
    }
    await ebsContentImportBackgroundIfNeeded();
    ebsContentOwnerReady = profile.owner;
    return true;
  })().catch((error) => {
    console.warn('Etsy BetterSearch background index handoff deferred.', error);
    return false;
  }).finally(() => { ebsContentSyncPromise = null; });
  return ebsContentSyncPromise;
}

async function ebsContentPushCurrentIndex() {
  const profile = ebsContentProfile();
  if (!profile) return false;
  const snapshot = await ebsContentOwnedPageSnapshot(profile);
  await ebsContentPushSnapshot(profile, snapshot);
  return true;
}

function ebsContentSchedulePush() {
  clearTimeout(ebsContentPushTimer);
  ebsContentPushTimer = setTimeout(() => {
    ebsContentPushTimer = 0;
    void ebsContentPushCurrentIndex().catch((error) => console.debug?.('[EBSF] Background index export deferred.', error));
  }, 700);
}

function ebsContentHandlePageState(channel, detail) {
  ebsContentSend({ type:'maintenance-page-state', channel, detail:ebsContentSerializableState(detail) });
  void ebsContentInitializeBackgroundIndex();
  if (ebsContentTerminal(detail)) ebsContentSchedulePush();
}

document.addEventListener?.('ebsf:favorites-sync-state', (event) => ebsContentHandlePageState('catalogue', event.detail));
document.addEventListener?.('ebsf:favorites-catalog-state', (event) => ebsContentHandlePageState('catalogue', event.detail));
document.addEventListener?.('ebsf:favorites-deep-state', (event) => ebsContentHandlePageState('deep', event.detail));

function ebsRunScheduledCatalogue() {
  if (!ebsContentPageAutoSync) return Promise.resolve(false);
  return Promise.resolve(ebsContentPageAutoSync(true));
}

function ebsRunForcedCatalogue() {
  if (typeof favSyncAllItemsScope !== 'function' || typeof favSyncScope !== 'function') return Promise.resolve(false);
  const scope = favSyncAllItemsScope();
  return Promise.resolve(favSyncScope(scope, {
    independent:true,
    reason:'extension-popup',
    applyLive:typeof favCatalogIsCurrent0141 === 'function' ? favCatalogIsCurrent0141(scope) : false,
  })).then(() => true);
}

function ebsRunDeep(force) {
  if (typeof favDeepStart !== 'function') return Promise.resolve(false);
  void Promise.resolve(favDeepStart({ force:force === true })).catch(() => {});
  return Promise.resolve(true);
}

async function ebsHandleMaintenanceRequest(message) {
  if (typeof isFavoritesPage !== 'function' || !isFavoritesPage()) return { accepted:false, reason:'not-favorites-page' };
  if (typeof favIsOwnFavoritesPage === 'function' && !favIsOwnFavoritesPage()) return { accepted:false, reason:'not-own-favorites' };
  if (typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true) return { accepted:false, reason:'inactive-runtime-owner' };

  await ebsContentInitializeBackgroundIndex();
  const catalogueRequested = message.catalogue !== false;
  const deepRequested = message.deepMetadata !== false;
  let catalogueStarted = false;
  let deepStarted = false;
  if (catalogueRequested) catalogueStarted = message.force === true ? await ebsRunForcedCatalogue() : await ebsRunScheduledCatalogue();
  if (deepRequested) deepStarted = await ebsRunDeep(message.force === true && message.reason === 'manual-deep');
  return {
    accepted:Boolean(catalogueRequested || deepRequested),
    catalogueStarted:Boolean(catalogueStarted),
    deepMetadataStarted:Boolean(deepStarted),
  };
}

async function ebsContentHandleBackgroundUpdated() {
  ebsContentOwnerReady = '';
  if (ebsContentPageBusy()) {
    ebsContentScheduleBackgroundPull(1200);
    return { ok:true, deferred:true };
  }
  await ebsContentImportBackgroundIfNeeded();
  return { ok:true };
}

if (ebsContentApi?.runtime?.onMessage) {
  ebsContentApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.namespace !== EBS_CONTENT_NAMESPACE) return undefined;
    if (message.type === 'maintenance-run-current-page') {
      Promise.resolve(ebsHandleMaintenanceRequest(message)).then(
        (result) => sendResponse(result),
        (error) => sendResponse({ accepted:false, error:String(error?.message || error) }),
      );
      return true;
    }
    if (message.type === 'maintenance-background-updated') {
      Promise.resolve(ebsContentHandleBackgroundUpdated()).then(
        (result) => sendResponse(result),
        (error) => sendResponse({ ok:false, error:String(error?.message || error) }),
      );
      return true;
    }
    return undefined;
  });
}

for (const delay of [0, 700, 1800]) setTimeout(() => { void ebsContentInitializeBackgroundIndex(); }, delay);
window.addEventListener?.('popstate', () => { ebsContentOwnerReady = ''; void ebsContentInitializeBackgroundIndex(); });
