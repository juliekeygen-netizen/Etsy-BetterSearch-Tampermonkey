// Extension-only page/background maintenance bridge. Tampermonkey never loads
// this file. The Etsy-page IndexedDB remains a UI cache/compatibility replica;
// the extension background keeps its own origin-scoped copy so maintenance can
// continue while no Etsy tab exists.

const ebsContentApi = globalThis.browser ?? globalThis.chrome;
const EBS_CONTENT_NAMESPACE = 'etsy-bettersearch';
const EBS_CONTENT_SNAPSHOT_STORES = ['listings', 'shops', 'scopes', 'deepScanQueue'];
const EBS_CONTENT_CHUNK_SIZE = 150;
let ebsContentOwnerReady = '';
let ebsContentSyncPromise = null;
let ebsContentPushTimer = 0;

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
  if (result?.ok === false) throw new Error(result.error || 'Could not finalize background Favorites migration.');
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
  merged.firstSeenAt = Math.min(...[existing?.firstSeenAt, incoming?.firstSeenAt].map(Number).filter((value) => value > 0)) || observedAt;
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

function ebsContentMergeScope(existing, incoming) {
  if (!existing) return incoming;
  const incomingComplete = Number(incoming.lastCompleteSyncAt) || 0;
  const existingComplete = Number(existing.lastCompleteSyncAt) || 0;
  if (incomingComplete > existingComplete) return { ...existing, ...incoming };
  if (incomingComplete < existingComplete) return { ...incoming, ...existing };
  return (Number(incoming.lastObservedAt) || 0) >= (Number(existing.lastObservedAt) || 0)
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
}

function ebsContentMergeJob(existing, incoming) {
  if (!existing) return incoming?.status === 'running' ? { ...incoming, status:'queued', startedAt:0, nextAttemptAt:0 } : incoming;
  const newer = (Number(incoming?.updatedAt) || 0) >= (Number(existing?.updatedAt) || 0) ? incoming : existing;
  return newer?.status === 'running' ? { ...newer, status:'queued', startedAt:0, nextAttemptAt:0, error:'Recovered during database handoff' } : newer;
}

async function ebsContentImportRecords(storeName, records = []) {
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return 0;
  const keyField = { listings:'listingId', shops:'shopId', scopes:'scopeKey', deepScanQueue:'id' }[storeName];
  if (!keyField) throw new Error(`Unsupported Favorites snapshot store: ${storeName}`);
  const db = await favIndexOpen();
  const readStore = db.transaction(storeName, 'readonly').objectStore(storeName);
  const existing = await Promise.all(list.map((record) => favIndexRequest(readStore.get(String(record?.[keyField] || '')))));
  const merged = list.map((record, index) => {
    const old = existing[index];
    if (storeName === 'listings') return ebsContentMergeRawListing(old, record);
    if (storeName === 'shops') return ebsContentMergeRawShop(old, record);
    if (storeName === 'scopes') return ebsContentMergeScope(old, record);
    return ebsContentMergeJob(old, record);
  }).filter(Boolean);
  await favIndexWrite([storeName], (transaction) => {
    const store = transaction.objectStore(storeName);
    for (const record of merged) store.put(record);
  });
  return merged.length;
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
  if (typeof favPrimeDatasetFromCache0137 === 'function') {
    await Promise.resolve(favPrimeDatasetFromCache0137({ force:true })).catch(() => {});
  }
  if (typeof favEnhancementActive === 'function' && favEnhancementActive() && typeof favReapply === 'function') {
    await Promise.resolve(favReapply()).catch(() => {});
  }
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
    await ebsContentPullBackgroundSnapshot();
    await ebsContentRefreshFromImportedIndex();
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
  if (typeof favMaybeAutoSync !== 'function') return Promise.resolve(false);
  return Promise.resolve(favMaybeAutoSync(true));
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
      Promise.resolve(ebsContentPullBackgroundSnapshot()).then(() => ebsContentRefreshFromImportedIndex()).then(
        () => sendResponse({ ok:true }),
        (error) => sendResponse({ ok:false, error:String(error?.message || error) }),
      );
      return true;
    }
    return undefined;
  });
}

// Hard navigation and Etsy soft-navigation are both common. The runtime events
// above cover active scans; these small delayed probes cover entering Favorites
// from another Etsy route without a reload.
for (const delay of [0, 700, 1800]) setTimeout(() => { void ebsContentInitializeBackgroundIndex(); }, delay);
window.addEventListener?.('popstate', () => { ebsContentOwnerReady = ''; void ebsContentInitializeBackgroundIndex(); });
