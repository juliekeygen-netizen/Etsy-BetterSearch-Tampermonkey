// Extension-origin Favorites maintenance worker.
//
// Only worker-safe shared persistence/parser primitives are bundled before this
// file. All mutable catalogue/queue operations below are extension-specific and
// keep the production invariants that matter in a service worker: immutable
// committed scope membership, exact-owner retirement, atomic read/merge/write,
// renewable queue leases, and stale-worker fencing.

const EBS_BACKGROUND_PROFILE_KEY = 'ebsf.extension.background.profile.v1';
const EBS_BACKGROUND_CATALOG_KEY = 'ebsf.extension.background.catalog.v1';
const EBS_BACKGROUND_MIGRATION_KEY = 'ebsf.extension.background.migration.v1';
const EBS_BACKGROUND_PAGE_SIZE = 20;
const EBS_BACKGROUND_CATALOGUE_PAGE_BUDGET = 8;
const EBS_BACKGROUND_WORK_BUDGET_MS = 20000;
const EBS_BACKGROUND_DEEP_JOB_BUDGET = 4;
const EBS_BACKGROUND_DEEP_DELAY_MS = 900;
const EBS_BACKGROUND_DEEP_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const EBS_BACKGROUND_DEEP_RETRY_LIMIT = 3;
const EBS_BACKGROUND_DEEP_LEASE_MS = 90 * 1000;
const EBS_BACKGROUND_DEEP_HEARTBEAT_MS = 20 * 1000;
const EBS_BACKGROUND_DEEP_CHALLENGE_PAUSE_MS = 5 * 60 * 1000;
const EBS_BACKGROUND_REQUEST_TIMEOUT_MS = 18000;
const EBS_BACKGROUND_SNAPSHOT_STORES = ['listings', 'shops', 'scopes', 'deepScanQueue'];
const EBS_BACKGROUND_SNAPSHOT_SEMANTICS_VERSION = 2;
const ebsBackgroundWorkerId = globalThis.crypto?.randomUUID?.()
  || `extension-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let ebsBackgroundWorkerPromise = null;

function ebsWorkerDecodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return ''; }
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (_) { return ''; }
    });
}

function ebsWorkerParseNumber(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return Number.NaN;
  const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1;
  const number = Number.parseFloat(raw.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, ''));
  return Number.isFinite(number) ? number * multiplier : Number.NaN;
}

function ebsWorkerParseMoney(value) {
  let raw = String(value ?? '').replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
  if (!raw) return Number.NaN;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.');
  else raw = raw.replace(/,/g, '');
  const number = Number.parseFloat(raw);
  return Number.isFinite(number) ? number : Number.NaN;
}

function ebsWorkerApiListings(payload) {
  if (Array.isArray(payload)) {
    if (payload.length && payload.every((entry) => Array.isArray(entry?.listings))) return payload.flatMap((entry) => entry.listings || []);
    return payload.filter((entry) => entry && (entry.listingId || entry.listing_id));
  }
  if (Array.isArray(payload?.listings)) return payload.listings;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.groups)) return payload.groups.flatMap((entry) => entry?.listings || []);
  return [];
}

function ebsWorkerRecordFromListing(listing, order, observedAt = Date.now()) {
  const id = String(listing?.listingId ?? listing?.listing_id ?? '');
  const price = listing?.priceDetails || {};
  const rating = listing?.ratingDetails || {};
  const has = (object, key) => Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
  return {
    id,
    title:ebsWorkerDecodeEntities(listing?.title || ''),
    url:String(listing?.url || (id ? `https://www.etsy.com/listing/${encodeURIComponent(id)}` : '')),
    imageUrl:String(listing?.imageUrl || ''),
    secondaryImageUrl:String(listing?.secondaryImageUrl || ''),
    videoSources:Array.isArray(listing?.videoSources) ? listing.videoSources : [],
    isBestSeller:listing?.isBestSeller === true,
    isShopOnVacation:listing?.isShopOnVacation === true,
    isSoldOut:listing?.isSoldOut === true,
    shouldShowBuyItNowButton:listing?.shouldShowBuyItNowButton === true,
    price:ebsWorkerParseMoney(price.currentFormattedPriceWithSymbol),
    priceFormatted:String(price.currentFormattedPriceWithSymbol || ''),
    originalPrice:ebsWorkerParseMoney(price.originalPrice),
    originalPriceFormatted:String(price.originalPrice || ''),
    discountPercent:Number(price.discountPercent) || 0,
    isOnSale:price.isOnSale === true || Number(price.discountPercent) > 0,
    isDownload:price.isDownload === true,
    hasFreeShipping:price.hasFreeShipping === true,
    rating:ebsWorkerParseNumber(rating.rating),
    reviews:ebsWorkerParseNumber(rating.count),
    shopName:ebsWorkerDecodeEntities(listing?.shop?.shopName || ''),
    shopId:String(listing?.shop?.shopId || ''),
    shopUrl:String(listing?.shop?.shopUrl || ''),
    isStarSeller:listing?.shop?.isStarSeller === true,
    hasVariations:listing?.hasVariations === true,
    isPersonalizable:listing?.isPersonalizable === true,
    html:'', order,
    shipping:Number.NaN, shippingFormatted:'', estimatedDelivery:'',
    acceptsReturns:false, acceptsExchanges:false, urgency:'', carts:Number.NaN, stockLeft:Number.NaN,
    indexObservedAt:observedAt,
    known:{
      isBestSeller:has(listing, 'isBestSeller'), isSoldOut:has(listing, 'isSoldOut'),
      isDownload:has(price, 'isDownload'), hasFreeShipping:has(price, 'hasFreeShipping'),
      isOnSale:has(price, 'isOnSale') || has(price, 'discountPercent'), discountPercent:has(price, 'discountPercent'),
      rating:has(rating, 'rating'), reviews:has(rating, 'count'), isStarSeller:has(listing?.shop, 'isStarSeller'),
      hasVariations:has(listing, 'hasVariations'), isPersonalizable:has(listing, 'isPersonalizable'),
    },
    knownSource:{ isDownload:has(price, 'isDownload') ? 'favorites-json' : 'unknown' },
  };
}

function ebsWorkerProfile(value = {}) {
  const owner = String(value?.owner || '').trim();
  const login = String(value?.login || '').trim();
  const locale = String(value?.locale || '').trim();
  return owner ? { owner, login, locale, registeredAt:Math.max(0, Number(value?.registeredAt) || Date.now()) } : null;
}

function ebsWorkerItemsScope(profile) {
  const base = { owner:String(profile?.owner || ''), login:String(profile?.login || ''), type:'items', id:'', query:'' };
  return { ...base, scopeKey:favIndexScopeKey(base), authoritativeFavoriteScope:true };
}

function ebsWorkerFavoritesUrl(profile, offset = 0, limit = EBS_BACKGROUND_PAGE_SIZE) {
  const url = new URL(`/api/v3/ajax/member/users/${encodeURIComponent(profile.owner)}/favorites/landing-listings`, 'https://www.etsy.com');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('include_additional_listing_images', 'true');
  url.searchParams.set('rearrange_sold_out', 'true');
  return url;
}

function ebsWorkerRetryAfterMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function ebsWorkerDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function ebsWorkerTimedFetch(url, options = {}, timeoutMs = EBS_BACKGROUND_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Background request timed out.', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(url, { ...options, signal:controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ebsWorkerFetchJson(url, profile, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const headers = { Accept:'application/json' };
      if (profile?.locale) headers['x-detected-locale'] = profile.locale;
      const response = await ebsWorkerTimedFetch(url.href || url, { method:'GET', credentials:'include', headers });
      if (!response.ok) {
        const error = new Error(`Favorites endpoint returned HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfterMs = ebsWorkerRetryAfterMs(response.headers?.get?.('Retry-After'));
        throw error;
      }
      const type = String(response.headers?.get?.('content-type') || '');
      if (type && !/json/i.test(type)) throw new Error('Favorites endpoint did not return JSON; Etsy sign-in may be required.');
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= attempts) break;
      const retryAfter = Math.max(0, Number(error?.retryAfterMs) || 0);
      await ebsWorkerDelay(retryAfter || Math.min(8000, 400 * (2 ** attempt)));
    }
  }
  throw lastError || new Error('Favorites background request failed.');
}

function ebsWorkerAnyActiveMembership(scopes) {
  return Object.values(scopes || {}).some((membership) => membership?.active === true);
}

function ebsWorkerMergeMembershipListing(existing, incoming, observedAt = Date.now()) {
  const merged = favIndexMergeListing(existing, incoming, observedAt);
  const oldScopes = existing?.favoriteScopes && typeof existing.favoriteScopes === 'object' ? existing.favoriteScopes : {};
  const scopes = { ...(merged?.favoriteScopes || oldScopes) };
  for (const [scopeKey, membershipValue] of Object.entries(incoming?.favoriteScopes || {})) {
    const membership = membershipValue && typeof membershipValue === 'object' ? membershipValue : {};
    const previous = oldScopes[scopeKey] && typeof oldScopes[scopeKey] === 'object' ? oldScopes[scopeKey] : {};
    const incomingAt = Math.max(0, Number(membership.lastSeenAt) || 0, Number(incoming?.lastSeenFavoriteAt) || 0, Number(observedAt) || 0);
    const removedAt = Math.max(0, Number(previous.removedAt) || 0);
    if (membership.active === true && previous.active === false && removedAt > incomingAt) continue;
    const next = { ...previous, ...membership };
    if (next.active === true) {
      delete next.removedAt;
      delete next.removalSource;
    }
    scopes[scopeKey] = next;
  }
  merged.favoriteScopes = scopes;
  if (ebsWorkerAnyActiveMembership(scopes)) {
    merged.isFavorite = true;
    merged.unfavoritedAt = 0;
  }
  return merged;
}

function ebsWorkerMarkScopeInactive(listing, scopeKey, observedAt, authoritative = false) {
  if (!listing || !scopeKey) return listing;
  const current = listing.favoriteScopes && typeof listing.favoriteScopes === 'object' ? listing.favoriteScopes : {};
  const membership = current[scopeKey];
  if (!membership?.active) return listing;
  const scopes = { ...current, [scopeKey]:{ ...membership, active:false, removedAt:observedAt } };
  const next = { ...listing, favoriteScopes:scopes };
  if (ebsWorkerAnyActiveMembership(scopes)) return { ...next, isFavorite:true, unfavoritedAt:0 };
  return authoritative ? { ...next, isFavorite:false, unfavoritedAt:observedAt } : next;
}

function ebsWorkerMergeRawListing(existing, incoming) {
  const observedAt = Math.max(Number(incoming?.lastSeenFavoriteAt) || 0, Number(incoming?.lastCardRefreshAt) || 0, Date.now());
  const merged = ebsWorkerMergeMembershipListing(existing, incoming, observedAt);
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

function ebsWorkerMergeRawShop(existing, incoming) {
  if (!existing) return incoming;
  const merged = { ...existing, ...incoming };
  for (const key of ['starSeller', 'giftCardSupport', 'shopRating', 'shopReviewCount', 'salesCount', 'tenure']) {
    if (existing?.[key] || incoming?.[key]) merged[key] = favIndexMergeField(existing?.[key], incoming?.[key]);
  }
  merged.lastObservedAt = Math.max(Number(existing.lastObservedAt) || 0, Number(incoming.lastObservedAt) || 0);
  merged.lastScannedAt = Math.max(Number(existing.lastScannedAt) || 0, Number(incoming.lastScannedAt) || 0);
  return merged;
}

function ebsWorkerScopeCommitAt(scope) {
  return Math.max(0, Number(scope?.snapshotCommittedAt) || 0, Number(scope?.lastCompleteSyncAt) || 0);
}

function ebsWorkerMergeScope(existing, incoming) {
  if (!existing) return incoming;
  const incomingComplete = ebsWorkerScopeCommitAt(incoming);
  const existingComplete = ebsWorkerScopeCommitAt(existing);
  if (incomingComplete > existingComplete) return { ...existing, ...incoming };
  if (incomingComplete < existingComplete) return { ...incoming, ...existing };
  return (Number(incoming.lastObservedAt) || 0) >= (Number(existing.lastObservedAt) || 0)
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
}

function ebsWorkerMergeJob(existing, incoming) {
  const normalize = (job) => job?.status === 'running'
    ? { ...job, status:'queued', attempts:Math.max(0, (Number(job.attempts) || 1) - 1), startedAt:0, nextAttemptAt:0, workerId:'', leaseUntil:0, error:'Recovered during database handoff' }
    : job;
  if (!existing) return normalize(incoming);
  if (existing.status === 'running' && Number(existing.leaseUntil) > Date.now()) return existing;
  const newer = (Number(incoming?.updatedAt) || 0) >= (Number(existing?.updatedAt) || 0) ? incoming : existing;
  return normalize(newer);
}

function ebsWorkerRequestGroup(requests, done, fail) {
  if (!requests.length) { done([]); return; }
  const values = new Array(requests.length);
  let remaining = requests.length;
  requests.forEach((request, index) => {
    request.onsuccess = () => {
      values[index] = request.result;
      remaining -= 1;
      if (!remaining) done(values);
    };
    request.onerror = () => fail(request.error || new Error('Favorites IndexedDB read failed.'));
  });
}

async function ebsWorkerImportRecords(storeName, records = []) {
  if (!EBS_BACKGROUND_SNAPSHOT_STORES.includes(storeName)) throw new Error(`Unsupported Favorites snapshot store: ${storeName}`);
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) return 0;
  const keyField = { listings:'listingId', shops:'shopId', scopes:'scopeKey', deepScanQueue:'id' }[storeName];
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const valid = list.filter((record) => String(record?.[keyField] || ''));
    const requests = valid.map((record) => store.get(String(record[keyField])));
    let imported = 0;
    let failure = null;
    const abort = (error) => { failure = error; try { transaction.abort(); } catch (_) {} };
    ebsWorkerRequestGroup(requests, (existing) => {
      try {
        valid.forEach((record, index) => {
          const old = existing[index];
          const merged = storeName === 'listings' ? ebsWorkerMergeRawListing(old, record)
            : storeName === 'shops' ? ebsWorkerMergeRawShop(old, record)
            : storeName === 'scopes' ? ebsWorkerMergeScope(old, record)
            : ebsWorkerMergeJob(old, record);
          if (merged) { store.put(merged); imported += 1; }
        });
      } catch (error) { abort(error); }
    }, abort);
    transaction.oncomplete = () => resolve(imported);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error(`Favorites ${storeName} import aborted.`));
  });
}

async function ebsWorkerExportRecords(storeName, offset = 0, limit = 200) {
  if (!EBS_BACKGROUND_SNAPSHOT_STORES.includes(storeName)) throw new Error(`Unsupported Favorites snapshot store: ${storeName}`);
  const db = await favIndexOpen();
  const all = await favIndexRequest(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.max(1, Math.min(500, Number(limit) || 200));
  const records = all.slice(start, start + size);
  return { store:storeName, records, offset:start, nextOffset:start + records.length, total:all.length, done:start + records.length >= all.length };
}

async function ebsWorkerClearIndex() {
  const db = await favIndexOpen();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(EBS_BACKGROUND_SNAPSHOT_STORES, 'readwrite');
    for (const storeName of EBS_BACKGROUND_SNAPSHOT_STORES) transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Favorites background index reset failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Favorites background index reset aborted.'));
  });
  await ebsStorageSet({ [EBS_BACKGROUND_CATALOG_KEY]:null });
}

async function ebsWorkerRegisterProfile(profileInput) {
  const profile = ebsWorkerProfile(profileInput);
  if (!profile) throw new Error('Open your own Etsy Favorites once so BetterSearch can learn the account owner for background maintenance.');
  const stored = await ebsStorageGet([EBS_BACKGROUND_PROFILE_KEY, EBS_BACKGROUND_MIGRATION_KEY]);
  const old = ebsWorkerProfile(stored?.[EBS_BACKGROUND_PROFILE_KEY]);
  const changedOwner = Boolean(old?.owner && old.owner !== profile.owner);
  if (changedOwner) await ebsWorkerClearIndex();
  const oldMigration = changedOwner ? null : stored?.[EBS_BACKGROUND_MIGRATION_KEY];
  const migration = {
    owner:profile.owner,
    seededAt:Math.max(0, Number(oldMigration?.seededAt) || 0),
    lastPageImportAt:Math.max(0, Number(oldMigration?.lastPageImportAt) || 0),
    lastBackgroundMutationAt:Math.max(0, Number(oldMigration?.lastBackgroundMutationAt) || 0),
  };
  await ebsStorageSet({ [EBS_BACKGROUND_PROFILE_KEY]:profile, [EBS_BACKGROUND_MIGRATION_KEY]:migration });
  return { profile, migration, needsPageSeed:!migration.seededAt };
}

async function ebsWorkerGetProfile() {
  const stored = await ebsStorageGet(EBS_BACKGROUND_PROFILE_KEY);
  return ebsWorkerProfile(stored?.[EBS_BACKGROUND_PROFILE_KEY]);
}

async function ebsWorkerMarkMigration(patch = {}) {
  const stored = await ebsStorageGet(EBS_BACKGROUND_MIGRATION_KEY);
  const old = stored?.[EBS_BACKGROUND_MIGRATION_KEY] || {};
  const next = { ...old, ...patch };
  await ebsStorageSet({ [EBS_BACKGROUND_MIGRATION_KEY]:next });
  return next;
}

async function ebsWorkerObserveCataloguePage(records, scope, state, observedAt = Date.now()) {
  const patches = (records || []).map((record) => favIndexPatchFromRecord(record, scope, observedAt)).filter((patch) => patch.listingId);
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readwrite');
    const listings = transaction.objectStore('listings');
    const shops = transaction.objectStore('shops');
    const scopes = transaction.objectStore('scopes');
    const listingRequests = patches.map((patch) => listings.get(patch.listingId));
    const shopPatches = Array.from(new Map(patches.filter((patch) => patch.shop).map((patch) => [patch.shop.shopId, patch.shop])).values());
    const shopRequests = shopPatches.map((patch) => shops.get(patch.shopId));
    const scopeRequest = scopes.get(scope.scopeKey);
    let listingRows = [], shopRows = [], oldScope = null, groups = 3, failure = null;
    const abort = (error) => { failure = error; try { transaction.abort(); } catch (_) {} };
    const finish = () => {
      groups -= 1;
      if (groups) return;
      try {
        const committedAt = ebsWorkerScopeCommitAt(oldScope);
        if (committedAt && Number(state.startedAt) < committedAt) throw new Error('Background catalogue generation is older than the current committed snapshot.');
        patches.forEach((patch, index) => listings.put(ebsWorkerMergeMembershipListing(listingRows[index], patch, observedAt)));
        shopPatches.forEach((patch, index) => shops.put(favIndexMergeShop(shopRows[index], patch)));
        const committedIds = oldScope?.complete === true ? Array.from(new Set((oldScope.listingIds || []).map(String))) : [];
        scopes.put({
          ...(oldScope || {}), ...scope,
          listingIds:committedIds,
          complete:oldScope?.complete === true,
          snapshotSemanticsVersion:EBS_BACKGROUND_SNAPSHOT_SEMANTICS_VERSION,
          snapshotGeneration:String(oldScope?.snapshotGeneration || ''),
          snapshotStartedAt:Math.max(0, Number(oldScope?.snapshotStartedAt) || committedAt),
          snapshotCommittedAt:committedAt,
          committedTotal:committedIds.length,
          pendingListingIds:Array.from(new Set((state.observedIds || []).map(String))),
          pendingGeneration:String(state.generation || ''),
          pendingStartedAt:Math.max(0, Number(state.startedAt) || observedAt),
          pendingObservedAt:observedAt,
          pendingTotal:(state.observedIds || []).length,
          lastObservedAt:Math.max(Number(oldScope?.lastObservedAt) || 0, observedAt),
          lastCompleteSyncAt:Math.max(0, Number(oldScope?.lastCompleteSyncAt) || 0),
          lastSyncState:'running',
          schemaVersion:FAV_INDEX_METADATA_VERSION,
        });
      } catch (error) { abort(error); }
    };
    ebsWorkerRequestGroup(listingRequests, (values) => { listingRows = values; finish(); }, abort);
    ebsWorkerRequestGroup(shopRequests, (values) => { shopRows = values; finish(); }, abort);
    scopeRequest.onsuccess = () => { oldScope = scopeRequest.result || null; finish(); };
    scopeRequest.onerror = () => abort(scopeRequest.error || new Error('Favorites scope read failed.'));
    transaction.oncomplete = () => resolve(patches.length);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Background catalogue partial observation aborted.'));
  });
}

async function ebsWorkerFinalizeCatalogue(scope, state, observedAt = Date.now()) {
  const observedIds = Array.from(new Set((state.observedIds || []).map(String)));
  const observedSet = new Set(observedIds);
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['listings', 'scopes'], 'readwrite');
    const listings = transaction.objectStore('listings');
    const scopes = transaction.objectStore('scopes');
    const allRequest = listings.getAll();
    const scopeRequest = scopes.get(scope.scopeKey);
    let allListings = [], oldScope = null, groups = 2, result = null, failure = null;
    const abort = (error) => { failure = error; try { transaction.abort(); } catch (_) {} };
    const finish = () => {
      groups -= 1;
      if (groups) return;
      try {
        const committedAt = ebsWorkerScopeCommitAt(oldScope);
        if (committedAt && Number(state.startedAt) < committedAt) throw new Error('Background catalogue completion lost to a newer committed snapshot.');
        const byId = new Map(allListings.map((listing) => [String(listing.listingId), listing]));
        for (const id of oldScope?.listingIds || []) {
          if (observedSet.has(String(id))) continue;
          const existing = byId.get(String(id));
          if (existing) listings.put(ebsWorkerMarkScopeInactive(existing, scope.scopeKey, observedAt, true));
        }
        result = {
          ...(oldScope || {}), ...scope,
          listingIds:observedIds,
          complete:true,
          snapshotSemanticsVersion:EBS_BACKGROUND_SNAPSHOT_SEMANTICS_VERSION,
          snapshotGeneration:String(state.generation || `${scope.scopeKey}@${state.startedAt || observedAt}`),
          snapshotStartedAt:Math.max(0, Number(state.startedAt) || observedAt),
          snapshotCommittedAt:observedAt,
          committedTotal:observedIds.length,
          pendingListingIds:[], pendingGeneration:'', pendingStartedAt:0, pendingObservedAt:0, pendingTotal:0,
          lastObservedAt:observedAt, lastCompleteSyncAt:observedAt, lastSyncState:'completed',
          schemaVersion:FAV_INDEX_METADATA_VERSION,
        };
        scopes.put(result);
      } catch (error) { abort(error); }
    };
    allRequest.onsuccess = () => { allListings = Array.from(allRequest.result || []); finish(); };
    allRequest.onerror = () => abort(allRequest.error || new Error('Favorites listing scan read failed.'));
    scopeRequest.onsuccess = () => { oldScope = scopeRequest.result || null; finish(); };
    scopeRequest.onerror = () => abort(scopeRequest.error || new Error('Favorites scope read failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Background catalogue completion aborted.'));
  });
}

async function ebsWorkerRunCatalogue(profile, options = {}) {
  const scope = ebsWorkerItemsScope(profile);
  const stored = await ebsStorageGet(EBS_BACKGROUND_CATALOG_KEY);
  const previous = stored?.[EBS_BACKGROUND_CATALOG_KEY];
  const canResume = previous?.owner === profile.owner && previous?.status === 'running'
    && Array.isArray(previous.observedIds) && Number(previous.startedAt) > 0;
  const state = canResume && options.force !== true ? { ...previous } : {
    owner:profile.owner, status:'running', offset:0, observedIds:[], pagesProcessed:0,
    startedAt:Date.now(), generation:'', updatedAt:Date.now(), error:'',
  };
  if (!state.generation) state.generation = `${scope.scopeKey}@${state.startedAt}`;
  const started = Date.now();
  let pagesThisWake = 0;
  let completed = false;
  while (pagesThisWake < EBS_BACKGROUND_CATALOGUE_PAGE_BUDGET && Date.now() - started < EBS_BACKGROUND_WORK_BUDGET_MS) {
    const offset = Math.max(0, Number(state.offset) || 0);
    const payload = await ebsWorkerFetchJson(ebsWorkerFavoritesUrl(profile, offset), profile);
    const listings = ebsWorkerApiListings(payload);
    const observedAt = Date.now();
    const records = listings.map((listing, index) => ebsWorkerRecordFromListing(listing, offset + index, observedAt)).filter((record) => record.id);
    const oldSize = state.observedIds.length;
    const seen = new Set(state.observedIds.map(String));
    for (const record of records) seen.add(String(record.id));
    state.observedIds = Array.from(seen);
    if (listings.length === EBS_BACKGROUND_PAGE_SIZE && state.observedIds.length === oldSize) {
      throw new Error('Favorites endpoint returned a full page with no new listings; background catalogue refresh stopped safely.');
    }
    await ebsWorkerObserveCataloguePage(records, scope, state, observedAt);
    state.pagesProcessed += 1;
    pagesThisWake += 1;
    state.offset = offset + EBS_BACKGROUND_PAGE_SIZE;
    state.updatedAt = Date.now();
    await ebsStorageSet({ [EBS_BACKGROUND_CATALOG_KEY]:state });
    await ebsPatchStatus?.({
      phase:'background-catalogue', executionOwner:'background',
      catalogueState:{ status:'running', processed:state.observedIds.length, pagesProcessed:state.pagesProcessed, startedAt:state.startedAt },
      lastResult:`Background catalogue: ${state.observedIds.length} favorites seen`,
    });
    if (listings.length < EBS_BACKGROUND_PAGE_SIZE) {
      await ebsWorkerFinalizeCatalogue(scope, state, observedAt);
      state.status = 'completed'; state.completedAt = Date.now(); state.updatedAt = state.completedAt; state.offset = 0;
      completed = true;
      await ebsStorageSet({ [EBS_BACKGROUND_CATALOG_KEY]:state });
      await ebsWorkerMarkMigration({ owner:profile.owner, lastBackgroundMutationAt:state.completedAt });
      break;
    }
  }
  return { completed, needsContinuation:!completed, processed:state.observedIds.length, pagesProcessed:state.pagesProcessed };
}

async function ebsWorkerReadOwnerIndex(owner) {
  const db = await favIndexOpen();
  const transaction = db.transaction(['listings', 'scopes'], 'readonly');
  const [listings, scopes] = await Promise.all([
    favIndexRequest(transaction.objectStore('listings').getAll()),
    favIndexRequest(transaction.objectStore('scopes').getAll()),
  ]);
  const canonical = scopes
    .filter((scope) => String(scope?.owner || '') === String(owner) && scope?.type === 'items' && !String(scope?.query || '') && scope?.complete === true)
    .sort((a, b) => ebsWorkerScopeCommitAt(b) - ebsWorkerScopeCommitAt(a))[0] || null;
  const ids = new Set((canonical?.listingIds || []).map(String));
  const committedAt = ebsWorkerScopeCommitAt(canonical);
  const active = listings.filter((listing) => {
    const id = String(listing?.listingId || '');
    if (!ids.has(id)) return false;
    const membership = canonical?.scopeKey ? listing?.favoriteScopes?.[canonical.scopeKey] : null;
    const trustedRemoval = membership?.active === false
      && membership?.removalSource === 'viewer-own-native-heart'
      && Number(membership?.removedAt) > committedAt;
    return !trustedRemoval;
  });
  return { listings, scopes, canonical, active };
}

function ebsWorkerQueueJob(listing, owner, options = {}, now = Date.now()) {
  const type = options.force ? 'forced_update' : (options.type || 'missing_metadata');
  const priority = type === 'forced_update' ? 1 : type === 'missing_metadata' ? 2 : 3;
  return {
    id:`listing:${String(listing.listingId)}`, listingId:String(listing.listingId), owner:String(owner || ''),
    type, priority, status:'queued', attempts:0, createdAt:now, startedAt:0, finishedAt:0,
    error:'', url:String(listing.url || ''), updatedAt:now, nextAttemptAt:0, workerId:'', leaseUntil:0,
  };
}

async function ebsWorkerQueueMutateAll(mutator) {
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('deepScanQueue', 'readwrite');
    const store = transaction.objectStore('deepScanQueue');
    const request = store.getAll();
    let result = null, failure = null;
    request.onsuccess = () => {
      try { result = mutator(Array.from(request.result || []), store); }
      catch (error) { failure = error; try { transaction.abort(); } catch (_) {} }
    };
    request.onerror = () => { failure = request.error; try { transaction.abort(); } catch (_) {} };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Background deep queue transaction aborted.'));
  });
}

async function ebsWorkerQueueMutateOne(id, mutator) {
  return favIndexMutateStoreRow01520('deepScanQueue', String(id), (job) => {
    if (!job) return favAtomicNoWrite01520(null);
    const next = mutator(job);
    return next ? favAtomicPut01520(next, next) : favAtomicNoWrite01520(null);
  });
}

async function ebsWorkerPopulateDeepQueue(profile, options = {}) {
  const index = await ebsWorkerReadOwnerIndex(profile.owner);
  if (!index.canonical) return { added:0, activeIds:new Set(), active:index.active };
  const activeIds = new Set(index.active.map((listing) => String(listing.listingId)));
  const now = Date.now();
  let added = 0;
  for (const listing of index.active) {
    const missing = !Number(listing.lastDeepScanAt)
      || String(listing.deepParserVersion || '') !== String(FAV_DEEP_PARSER_VERSION)
      || String(listing.shippingOriginParserVersion || '') !== String(FAV_DEEP_SHIPPING_ORIGIN_VERSION);
    const stale = Number(listing.lastDeepScanAt) > 0 && now - Number(listing.lastDeepScanAt) >= EBS_BACKGROUND_DEEP_STALE_MS;
    if (!options.force && !missing && !stale) continue;
    const incoming = ebsWorkerQueueJob(listing, profile.owner, {
      force:options.force === true,
      type:missing ? 'missing_metadata' : 'refresh_metadata',
    }, now);
    const changed = await favIndexMutateStoreRow01520('deepScanQueue', incoming.id, (existing) => {
      if (existing?.status === 'running' && Number(existing.leaseUntil) > now) return favAtomicNoWrite01520(false);
      const active = existing?.status === 'queued';
      const shouldReset = options.force === true || ['completed', 'failed'].includes(String(existing?.status || ''));
      const next = existing ? {
        ...existing,
        owner:profile.owner,
        type:incoming.priority < Number(existing.priority || 9) ? incoming.type : existing.type,
        priority:Math.min(Number(existing.priority) || incoming.priority, incoming.priority),
        url:incoming.url || existing.url || '',
        status:active && !shouldReset ? 'queued' : 'queued',
        attempts:shouldReset ? 0 : Math.max(0, Number(existing.attempts) || 0),
        startedAt:0, finishedAt:shouldReset ? 0 : Number(existing.finishedAt) || 0,
        error:shouldReset ? '' : String(existing.error || ''), nextAttemptAt:shouldReset ? 0 : Number(existing.nextAttemptAt) || 0,
        workerId:'', leaseUntil:0, updatedAt:now,
      } : incoming;
      return favAtomicPut01520(next, true);
    });
    if (changed) added += 1;
  }
  await ebsWorkerQueueMutateAll((jobs, store) => {
    for (const job of jobs) {
      if (job.status !== 'queued') continue;
      if (job.owner && String(job.owner) !== String(profile.owner)) continue;
      if (activeIds.has(String(job.listingId))) continue;
      store.put({ ...job, status:'completed', finishedAt:now, error:'Skipped: listing is no longer in committed Favorites', nextAttemptAt:0, workerId:'', leaseUntil:0, updatedAt:now });
    }
    return true;
  });
  return { added, activeIds, active:index.active };
}

async function ebsWorkerRecoverExpiredDeepJobs(now = Date.now()) {
  return ebsWorkerQueueMutateAll((jobs, store) => {
    let recovered = 0;
    for (const job of jobs) {
      if (job.status !== 'running') continue;
      const leaseUntil = Number(job.leaseUntil) || 0;
      const lastTouch = Math.max(Number(job.updatedAt) || 0, Number(job.startedAt) || 0);
      if (leaseUntil > now || (!leaseUntil && lastTouch && now - lastTouch < EBS_BACKGROUND_DEEP_LEASE_MS)) continue;
      store.put({ ...job, status:'queued', attempts:Math.max(0, (Number(job.attempts) || 1) - 1), startedAt:0, finishedAt:0,
        error:'Recovered expired/interrupted background metadata scan', nextAttemptAt:0, workerId:'', leaseUntil:0, updatedAt:now });
      recovered += 1;
    }
    return recovered;
  });
}

async function ebsWorkerClaimDeepJob(activeIds, owner, now = Date.now()) {
  return ebsWorkerQueueMutateAll((jobs, store) => {
    const job = jobs
      .filter((entry) => entry.status === 'queued' && activeIds.has(String(entry.listingId))
        && (!entry.owner || String(entry.owner) === String(owner)) && (Number(entry.nextAttemptAt) || 0) <= now)
      .sort((a, b) => Number(a.priority || 9) - Number(b.priority || 9) || Number(a.createdAt || 0) - Number(b.createdAt || 0))[0];
    if (!job) return null;
    const next = { ...job, owner:String(owner), status:'running', attempts:(Number(job.attempts) || 0) + 1, startedAt:now,
      finishedAt:0, error:'', workerId:ebsBackgroundWorkerId, leaseUntil:now + EBS_BACKGROUND_DEEP_LEASE_MS, updatedAt:now };
    store.put(next);
    return next;
  });
}

function ebsWorkerRenewDeepLease(job, now = Date.now()) {
  return ebsWorkerQueueMutateOne(job.id, (current) => {
    if (current.status !== 'running' || current.workerId !== ebsBackgroundWorkerId) return null;
    return { ...current, leaseUntil:now + EBS_BACKGROUND_DEEP_LEASE_MS, updatedAt:now };
  }).then(Boolean);
}

function ebsWorkerDeepObservationHasEvidence(parsed) {
  if (parsed?.completeSignals?.productJsonLd || parsed?.completeSignals?.offerJsonLd) return true;
  return [parsed?.cardMetadata, parsed?.listingMetadata, parsed?.shippingMetadata, parsed?.shopMetadata]
    .some((group) => Object.values(group || {}).some((field) => field?.known === true));
}

async function ebsWorkerFetchDeepListing(job) {
  const listingUrl = String(job.url || `https://www.etsy.com/listing/${encodeURIComponent(job.listingId)}`);
  const response = await ebsWorkerTimedFetch(listingUrl, { method:'GET', credentials:'include', headers:{ Accept:'text/html,application/xhtml+xml' } });
  if (!response.ok) {
    const error = new Error(`Listing metadata request failed (${response.status}).`);
    error.httpStatus = response.status;
    error.retryable = ![404, 410].includes(response.status);
    error.retryAfterMs = ebsWorkerRetryAfterMs(response.headers?.get?.('Retry-After'));
    throw error;
  }
  const html = await response.text();
  if (/\b(?:captcha|unusual (?:traffic|activity)|verify (?:that )?you(?:'re| are) human|robot check)\b/i.test(html)) {
    const error = new Error('Etsy returned a verification/challenge page; background metadata scanning paused safely.');
    error.code = 'challenge-page'; error.retryable = true; error.retryAfterMs = EBS_BACKGROUND_DEEP_CHALLENGE_PAUSE_MS;
    throw error;
  }
  const finalUrl = response.url || listingUrl;
  const parsed = favDeepParseListingHtml(html, finalUrl, { observedAt:Date.now() });
  const requestedId = listingUrl.match(/\/listing\/(\d+)/i)?.[1] || String(job.listingId || '');
  const parsedId = String(parsed?.identity?.url || '').match(/\/listing\/(\d+)/i)?.[1] || String(parsed?.identity?.listingId || '');
  if (requestedId && parsedId && requestedId !== parsedId) {
    const error = new Error(`Deep metadata identity mismatch (${requestedId} != ${parsedId}).`);
    error.code = 'listing-identity-mismatch'; error.retryable = true; throw error;
  }
  if (!ebsWorkerDeepObservationHasEvidence(parsed)) {
    const error = new Error('Listing page did not expose recognizable metadata; background scan result was not cached.');
    error.code = 'empty-listing-metadata'; error.retryable = true; throw error;
  }
  return parsed;
}

async function ebsWorkerCommitDeepSuccess(job, parsed, now = Date.now()) {
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['deepScanQueue', 'listings', 'shops'], 'readwrite');
    const queue = transaction.objectStore('deepScanQueue');
    const listings = transaction.objectStore('listings');
    const shops = transaction.objectStore('shops');
    const jobRequest = queue.get(job.id);
    let result = null, failure = null;
    const abort = (error) => { failure = error; try { transaction.abort(); } catch (_) {} };
    jobRequest.onsuccess = () => {
      const currentJob = jobRequest.result;
      if (!currentJob || currentJob.status !== 'running' || currentJob.workerId !== ebsBackgroundWorkerId || Number(currentJob.leaseUntil) <= now) {
        abort(new Error('Deep metadata job lease was lost before commit.'));
        return;
      }
      const listingRequest = listings.get(String(job.listingId));
      listingRequest.onerror = () => abort(listingRequest.error || new Error('Favorite listing read failed.'));
      listingRequest.onsuccess = () => {
        const existing = listingRequest.result;
        if (!existing) { abort(new Error(`Favorite ${job.listingId} is not present in the background Favorites index.`)); return; }
        const shopId = String(existing.shopId || '');
        const finish = (oldShop) => {
          try {
            const observedAt = Math.max(0, Number(parsed?.observedAt) || now);
            const next = {
              ...existing,
              url:parsed?.identity?.url || existing.url || '', title:parsed?.identity?.title || existing.title || '',
              lastDeepScanAt:Math.max(Number(existing.lastDeepScanAt) || 0, observedAt),
              deepParserVersion:String(parsed?.parserVersion || FAV_DEEP_PARSER_VERSION),
              shippingOriginParserVersion:FAV_DEEP_SHIPPING_ORIGIN_VERSION,
              listingMetadata:favIndexMergeMetadata(existing.listingMetadata, parsed?.listingMetadata || {}),
              shippingMetadata:favIndexMergeMetadata(existing.shippingMetadata, parsed?.shippingMetadata || {}),
              cardMetadata:favIndexMergeMetadata(existing.cardMetadata, parsed?.cardMetadata || {}),
            };
            if (parsed?.availabilityState && parsed.availabilityState !== 'unknown') Object.assign(next, favIndexMarkListingAvailability(next, parsed.availabilityState, observedAt));
            listings.put(next);
            if (shopId) {
              const starSeller = parsed?.shopMetadata?.starSeller;
              const nextShop = favIndexMergeShop(oldShop, {
                shopId, shopName:parsed?.identity?.shopName || oldShop?.shopName || '', shopUrl:oldShop?.shopUrl || '',
                starSeller:starSeller || favIndexUnknown(), observedAt,
              });
              nextShop.lastScannedAt = Math.max(Number(oldShop?.lastScannedAt) || 0, observedAt);
              shops.put(nextShop);
            }
            queue.put({ ...currentJob, status:'completed', finishedAt:now, error:'', nextAttemptAt:0, workerId:'', leaseUntil:0, updatedAt:now });
            result = next;
          } catch (error) { abort(error); }
        };
        if (!shopId) finish(null);
        else {
          const shopRequest = shops.get(shopId);
          shopRequest.onsuccess = () => finish(shopRequest.result || null);
          shopRequest.onerror = () => abort(shopRequest.error || new Error('Favorite shop read failed.'));
        }
      };
    };
    jobRequest.onerror = () => abort(jobRequest.error || new Error('Deep metadata queue read failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Deep metadata commit aborted.'));
  });
}

async function ebsWorkerFailDeepJob(job, error, now = Date.now()) {
  const db = await favIndexOpen();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['deepScanQueue', 'listings'], 'readwrite');
    const queue = transaction.objectStore('deepScanQueue');
    const listings = transaction.objectStore('listings');
    const request = queue.get(job.id);
    let result = null, failure = null;
    const abort = (reason) => { failure = reason; try { transaction.abort(); } catch (_) {} };
    request.onsuccess = () => {
      try {
        const current = request.result;
        if (!current || current.status !== 'running' || current.workerId !== ebsBackgroundWorkerId) { result = current || null; return; }
        const attempts = Math.max(0, Number(current.attempts) || 0);
        const retry = error?.retryable !== false && attempts < EBS_BACKGROUND_DEEP_RETRY_LIMIT;
        const retryAfter = Math.max(0, Number(error?.retryAfterMs) || 0);
        const challengePause = error?.code === 'challenge-page' ? EBS_BACKGROUND_DEEP_CHALLENGE_PAUSE_MS : 0;
        const backoff = Math.min(30000, 1000 * (2 ** Math.max(0, attempts - 1)));
        result = {
          ...current, status:retry ? 'queued' : 'failed', finishedAt:retry ? 0 : now,
          error:String(error?.message || error || 'Unknown metadata scan error'),
          nextAttemptAt:retry ? now + Math.max(backoff, retryAfter, challengePause) : 0,
          workerId:'', leaseUntil:0, updatedAt:now,
        };
        queue.put(result);
        if ([404, 410].includes(Number(error?.httpStatus))) {
          const listingRequest = listings.get(String(current.listingId));
          listingRequest.onsuccess = () => {
            const listing = listingRequest.result;
            if (listing) listings.put(favIndexMarkListingAvailability(listing, Number(error.httpStatus) === 410 ? 'deleted' : 'unavailable', now));
          };
          listingRequest.onerror = () => abort(listingRequest.error || new Error('Availability listing read failed.'));
        }
      } catch (reason) { abort(reason); }
    };
    request.onerror = () => abort(request.error || new Error('Deep metadata queue read failed.'));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { failure = failure || transaction.error; };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Deep metadata failure transition aborted.'));
  });
}

async function ebsWorkerRunDeep(profile, options = {}) {
  await ebsWorkerRecoverExpiredDeepJobs();
  const populated = await ebsWorkerPopulateDeepQueue(profile, { force:options.force === true });
  const { activeIds } = populated;
  const started = Date.now();
  let completed = 0, failed = 0, processed = 0, paused = false;
  while (processed < EBS_BACKGROUND_DEEP_JOB_BUDGET && Date.now() - started < EBS_BACKGROUND_WORK_BUDGET_MS) {
    const job = await ebsWorkerClaimDeepJob(activeIds, profile.owner);
    if (!job) break;
    processed += 1;
    let heartbeat = 0;
    let leaseLost = false;
    try {
      heartbeat = setInterval(() => {
        void ebsWorkerRenewDeepLease(job).then((renewed) => { if (!renewed) leaseLost = true; }).catch(() => { leaseLost = true; });
      }, EBS_BACKGROUND_DEEP_HEARTBEAT_MS);
      const parsed = await ebsWorkerFetchDeepListing(job);
      if (leaseLost || !(await ebsWorkerRenewDeepLease(job))) throw Object.assign(new Error('Deep metadata job lease was lost.'), { code:'deep-lease-lost', retryable:false });
      await ebsWorkerCommitDeepSuccess(job, parsed);
      completed += 1;
    } catch (error) {
      if (error?.code === 'deep-lease-lost') {
        // Another worker now owns the row; this stale execution must not mutate it.
      } else {
        const next = await ebsWorkerFailDeepJob(job, error);
        if (next?.status === 'failed') failed += 1;
        if (error?.code === 'challenge-page' || Number(error?.httpStatus) === 429 || Number(error?.retryAfterMs) > 0) paused = true;
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
    await ebsPatchStatus?.({
      phase:paused ? 'background-paused' : 'background-deep', executionOwner:'background',
      deepState:{ status:paused ? 'paused' : 'running', completed, failed, total:processed, queuedAdded:populated.added },
      lastResult:paused ? 'Background metadata paused for Etsy retry/challenge safety.' : `Background metadata: ${completed} completed this wake`,
    });
    if (paused) break;
    if (Date.now() - started < EBS_BACKGROUND_WORK_BUDGET_MS) await ebsWorkerDelay(EBS_BACKGROUND_DEEP_DELAY_MS);
  }
  const allJobs = await favIndexRequest((await favIndexOpen()).transaction('deepScanQueue', 'readonly').objectStore('deepScanQueue').getAll());
  const remaining = allJobs.filter((job) => job.status === 'queued' && activeIds.has(String(job.listingId))).length;
  if (completed || failed) await ebsWorkerMarkMigration({ owner:profile.owner, lastBackgroundMutationAt:Date.now() });
  return { completed, failed, processed, remaining, paused, needsContinuation:remaining > 0 && !paused };
}

async function ebsWorkerStats(owner) {
  const index = await ebsWorkerReadOwnerIndex(owner);
  const db = await favIndexOpen();
  const shops = await favIndexRequest(db.transaction('shops', 'readonly').objectStore('shops').getAll());
  const active = index.active;
  const indexedIds = new Set(index.scopes.filter((scope) => String(scope?.owner || '') === String(owner)).flatMap((scope) => scope?.listingIds || []).map(String));
  const indexed = index.listings.filter((listing) => indexedIds.has(String(listing.listingId)));
  const shopIds = new Set(indexed.map((listing) => String(listing.shopId || '')).filter(Boolean));
  const deep = active.filter((listing) => Number(listing.lastDeepScanAt) > 0);
  return {
    indexedFavorites:indexed.length, activeFavorites:active.length,
    indexedShops:shops.filter((shop) => shopIds.has(String(shop.shopId))).length,
    deepMetadataFavorites:deep.length,
    lastDeepUpdateAt:deep.reduce((latest, listing) => Math.max(latest, Number(listing.lastDeepScanAt) || 0), 0),
    lastFullSyncAt:ebsWorkerScopeCommitAt(index.canonical),
  };
}

async function ebsWorkerPopupDetails() {
  const stored = await ebsStorageGet([EBS_BACKGROUND_PROFILE_KEY, EBS_BACKGROUND_MIGRATION_KEY, EBS_BACKGROUND_CATALOG_KEY]);
  const profile = ebsWorkerProfile(stored?.[EBS_BACKGROUND_PROFILE_KEY]);
  const migration = stored?.[EBS_BACKGROUND_MIGRATION_KEY] || {};
  const catalog = stored?.[EBS_BACKGROUND_CATALOG_KEY] || null;
  const stats = profile ? await ebsWorkerStats(profile.owner).catch(() => null) : null;
  return { profile, migration, catalog, stats };
}

async function ebsBackgroundMaintenanceRunNoTab(options = {}) {
  if (ebsBackgroundWorkerPromise) return ebsBackgroundWorkerPromise;
  ebsBackgroundWorkerPromise = (async () => {
    const profile = await ebsWorkerGetProfile();
    if (!profile) return { accepted:false, reason:'profile-not-registered' };
    const result = { accepted:true, background:true, catalogue:null, deepMetadata:null, needsContinuation:false };
    try {
      if (options.catalogue !== false) {
        result.catalogue = await ebsWorkerRunCatalogue(profile, { force:options.force === true });
        result.needsContinuation ||= result.catalogue.needsContinuation === true;
        if (result.catalogue.needsContinuation) return result;
      }
      if (options.deepMetadata !== false) {
        result.deepMetadata = await ebsWorkerRunDeep(profile, { force:options.force === true });
        result.needsContinuation ||= result.deepMetadata.needsContinuation === true;
      }
      const completedAt = result.needsContinuation ? 0 : Date.now();
      await ebsPatchStatus?.({
        phase:result.deepMetadata?.paused ? 'background-paused' : (result.needsContinuation ? 'background-continuation' : 'idle'),
        executionOwner:'background',
        lastCompletedAt:completedAt || undefined,
        lastResult:result.deepMetadata?.paused
          ? 'Background metadata paused safely; it will retry on a later scheduled run.'
          : result.needsContinuation ? 'Background maintenance will continue in another worker wake.' : 'Background maintenance completed.',
      });
      return result;
    } catch (error) {
      const message = String(error?.message || error);
      const authentication = /sign-in|sign in|401|403|did not return json/i.test(message);
      await ebsPatchStatus?.({ phase:authentication ? 'authentication-required' : 'error', executionOwner:'background', lastResult:message });
      return { accepted:false, background:true, reason:authentication ? 'authentication-required' : 'background-error', error:message };
    }
  })().finally(() => { ebsBackgroundWorkerPromise = null; });
  return ebsBackgroundWorkerPromise;
}
