// Extension-origin Favorites maintenance worker.
//
// This file is bundled after the shared IndexedDB/deep-parser/deep-queue
// libraries and before background.js. It intentionally owns only extension-
// origin state; page-origin state is synchronized through content-bridge.js.

const EBS_BACKGROUND_PROFILE_KEY = 'ebsf.extension.background.profile.v1';
const EBS_BACKGROUND_CATALOG_KEY = 'ebsf.extension.background.catalog.v1';
const EBS_BACKGROUND_MIGRATION_KEY = 'ebsf.extension.background.migration.v1';
const EBS_BACKGROUND_PAGE_SIZE = 20;
const EBS_BACKGROUND_WORK_BUDGET_MS = 20000;
const EBS_BACKGROUND_DEEP_DELAY_MS = 900;
const EBS_BACKGROUND_SNAPSHOT_STORES = ['listings', 'shops', 'scopes', 'deepScanQueue'];

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
    html:'',
    order,
    shipping:Number.NaN,
    shippingFormatted:'',
    estimatedDelivery:'',
    acceptsReturns:false,
    acceptsExchanges:false,
    urgency:'',
    carts:Number.NaN,
    stockLeft:Number.NaN,
    indexObservedAt:observedAt,
    known:{
      isBestSeller:has(listing, 'isBestSeller'),
      isSoldOut:has(listing, 'isSoldOut'),
      isDownload:has(price, 'isDownload'),
      hasFreeShipping:has(price, 'hasFreeShipping'),
      isOnSale:has(price, 'isOnSale') || has(price, 'discountPercent'),
      discountPercent:has(price, 'discountPercent'),
      rating:has(rating, 'rating'),
      reviews:has(rating, 'count'),
      isStarSeller:has(listing?.shop, 'isStarSeller'),
      hasVariations:has(listing, 'hasVariations'),
      isPersonalizable:has(listing, 'isPersonalizable'),
    },
    knownSource:{ isDownload:has(price, 'isDownload') ? 'favorites-json' : 'unknown' },
  };
}

function ebsWorkerProfile(value = {}) {
  const owner = String(value.owner || '').trim();
  const login = String(value.login || '').trim();
  const locale = String(value.locale || '').trim();
  return owner ? { owner, login, locale, registeredAt:Math.max(0, Number(value.registeredAt) || Date.now()) } : null;
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

async function ebsWorkerFetchJson(url, profile, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const headers = { Accept:'application/json' };
      if (profile?.locale) headers['x-detected-locale'] = profile.locale;
      const response = await fetch(url.href || url, { method:'GET', credentials:'include', headers });
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

function ebsWorkerMergeRawListing(existing, incoming) {
  const observedAt = Math.max(Number(incoming?.lastSeenFavoriteAt) || 0, Number(incoming?.lastCardRefreshAt) || 0, Date.now());
  const merged = favIndexMergeListing(existing, incoming, observedAt);
  const incomingDeep = Number(incoming?.lastDeepScanAt) || 0;
  const existingDeep = Number(existing?.lastDeepScanAt) || 0;
  if (incomingDeep >= existingDeep) {
    merged.lastDeepScanAt = incomingDeep;
    merged.deepParserVersion = String(incoming?.deepParserVersion || merged.deepParserVersion || '');
    merged.shippingOriginParserVersion = String(incoming?.shippingOriginParserVersion || merged.shippingOriginParserVersion || '');
  } else {
    merged.lastDeepScanAt = existingDeep;
    merged.deepParserVersion = String(existing?.deepParserVersion || merged.deepParserVersion || '');
    merged.shippingOriginParserVersion = String(existing?.shippingOriginParserVersion || merged.shippingOriginParserVersion || '');
  }
  const incomingAvailabilityAt = Number(incoming?.availabilityObservedAt) || 0;
  const existingAvailabilityAt = Number(existing?.availabilityObservedAt) || 0;
  if (incomingAvailabilityAt >= existingAvailabilityAt && incoming?.availabilityState) {
    merged.availabilityState = incoming.availabilityState;
    merged.availabilityObservedAt = incomingAvailabilityAt;
  }
  merged.firstSeenAt = Math.min(...[existing?.firstSeenAt, incoming?.firstSeenAt].map(Number).filter((value) => value > 0)) || observedAt;
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

function ebsWorkerMergeScope(existing, incoming) {
  if (!existing) return incoming;
  const incomingComplete = Number(incoming.lastCompleteSyncAt) || 0;
  const existingComplete = Number(existing.lastCompleteSyncAt) || 0;
  if (incomingComplete > existingComplete) return { ...existing, ...incoming };
  if (incomingComplete < existingComplete) return { ...incoming, ...existing };
  return (Number(incoming.lastObservedAt) || 0) >= (Number(existing.lastObservedAt) || 0)
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
}

function ebsWorkerMergeJob(existing, incoming) {
  if (!existing) return incoming?.status === 'running' ? { ...incoming, status:'queued', startedAt:0, nextAttemptAt:0 } : incoming;
  const newer = (Number(incoming?.updatedAt) || 0) >= (Number(existing?.updatedAt) || 0) ? incoming : existing;
  return newer?.status === 'running' ? { ...newer, status:'queued', startedAt:0, nextAttemptAt:0, error:'Recovered during database handoff' } : newer;
}

async function ebsWorkerImportRecords(storeName, records = []) {
  if (!EBS_BACKGROUND_SNAPSHOT_STORES.includes(storeName)) throw new Error(`Unsupported Favorites snapshot store: ${storeName}`);
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return 0;
  const db = await favIndexOpen();
  const keyField = { listings:'listingId', shops:'shopId', scopes:'scopeKey', deepScanQueue:'id' }[storeName];
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const existing = await Promise.all(list.map((record) => favIndexRequest(store.get(String(record?.[keyField] || '')))));
  const merged = list.map((record, index) => {
    const old = existing[index];
    if (storeName === 'listings') return ebsWorkerMergeRawListing(old, record);
    if (storeName === 'shops') return ebsWorkerMergeRawShop(old, record);
    if (storeName === 'scopes') return ebsWorkerMergeScope(old, record);
    return ebsWorkerMergeJob(old, record);
  }).filter(Boolean);
  await favIndexWrite([storeName], (transaction) => {
    const target = transaction.objectStore(storeName);
    for (const record of merged) target.put(record);
  });
  return merged.length;
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

async function ebsWorkerRegisterProfile(profileInput) {
  const profile = ebsWorkerProfile(profileInput);
  if (!profile) throw new Error('Open your own Etsy Favorites once so BetterSearch can learn the account owner for background maintenance.');
  const stored = await ebsStorageGet([EBS_BACKGROUND_PROFILE_KEY, EBS_BACKGROUND_MIGRATION_KEY]);
  const old = ebsWorkerProfile(stored?.[EBS_BACKGROUND_PROFILE_KEY]);
  const changedOwner = Boolean(old?.owner && old.owner !== profile.owner);
  const migration = changedOwner ? { owner:profile.owner, seededAt:0, lastPageImportAt:0, lastBackgroundMutationAt:0 } : {
    owner:profile.owner,
    seededAt:Math.max(0, Number(stored?.[EBS_BACKGROUND_MIGRATION_KEY]?.seededAt) || 0),
    lastPageImportAt:Math.max(0, Number(stored?.[EBS_BACKGROUND_MIGRATION_KEY]?.lastPageImportAt) || 0),
    lastBackgroundMutationAt:Math.max(0, Number(stored?.[EBS_BACKGROUND_MIGRATION_KEY]?.lastBackgroundMutationAt) || 0),
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

async function ebsWorkerFinalizeCatalogue(scope, observedIds, observedAt = Date.now()) {
  const db = await favIndexOpen();
  const transaction = db.transaction(['listings', 'scopes'], 'readonly');
  const [listings, oldScope] = await Promise.all([
    favIndexRequest(transaction.objectStore('listings').getAll()),
    favIndexRequest(transaction.objectStore('scopes').get(scope.scopeKey)),
  ]);
  const observedSet = new Set((observedIds || []).map(String));
  const absent = listings.filter((listing) => listing?.favoriteScopes?.[scope.scopeKey]?.active && !observedSet.has(String(listing.listingId)));
  const absentUpdates = favIndexApplyScopeCompletion(absent, scope, observedSet, observedAt);
  const scopeRecord = {
    ...(oldScope || {}), ...scope,
    listingIds:Array.from(observedSet),
    lastObservedAt:observedAt,
    lastCompleteSyncAt:observedAt,
    complete:true,
    lastSyncState:'completed',
    schemaVersion:FAV_INDEX_METADATA_VERSION,
  };
  await favIndexWrite(['listings', 'scopes'], (writeTx) => {
    const listingStore = writeTx.objectStore('listings');
    for (const listing of absentUpdates) listingStore.put(listing);
    writeTx.objectStore('scopes').put(scopeRecord);
  });
  return scopeRecord;
}

async function ebsWorkerRunCatalogue(profile, options = {}) {
  const scope = ebsWorkerItemsScope(profile);
  const stored = await ebsStorageGet(EBS_BACKGROUND_CATALOG_KEY);
  const previous = stored?.[EBS_BACKGROUND_CATALOG_KEY];
  const canResume = previous?.owner === profile.owner && previous?.status === 'running' && Array.isArray(previous.observedIds);
  const state = canResume && options.force !== true ? { ...previous } : {
    owner:profile.owner,
    status:'running',
    offset:0,
    observedIds:[],
    pagesProcessed:0,
    startedAt:Date.now(),
    updatedAt:Date.now(),
    error:'',
  };
  const started = Date.now();
  let completed = false;
  while (Date.now() - started < EBS_BACKGROUND_WORK_BUDGET_MS) {
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
    await favIndexObserveRecords(records, { scope, complete:false, syncState:'running', observedAt });
    state.pagesProcessed += 1;
    state.offset = offset + EBS_BACKGROUND_PAGE_SIZE;
    state.updatedAt = Date.now();
    await ebsStorageSet({ [EBS_BACKGROUND_CATALOG_KEY]:state });
    await ebsPatchStatus?.({
      phase:'background-catalogue',
      catalogueState:{ status:'running', processed:state.observedIds.length, pagesProcessed:state.pagesProcessed, startedAt:state.startedAt },
      lastResult:`Background catalogue: ${state.observedIds.length} favorites seen`,
    });
    if (listings.length < EBS_BACKGROUND_PAGE_SIZE) {
      await ebsWorkerFinalizeCatalogue(scope, state.observedIds, observedAt);
      state.status = 'completed';
      state.completedAt = Date.now();
      state.updatedAt = state.completedAt;
      state.offset = 0;
      completed = true;
      await ebsStorageSet({ [EBS_BACKGROUND_CATALOG_KEY]:state });
      await ebsWorkerMarkMigration({ lastBackgroundMutationAt:state.completedAt });
      break;
    }
  }
  return { completed, needsContinuation:!completed, processed:state.observedIds.length, pagesProcessed:state.pagesProcessed };
}

async function ebsWorkerRunDeep(profile, options = {}) {
  await favDeepQueueRecoverInterrupted();
  const added = await favDeepPopulateQueue({ owner:profile.owner, force:options.force === true });
  const queuedAtStart = (await favDeepQueueList('queued')).length;
  const started = Date.now();
  let completed = 0;
  let failed = 0;
  while (Date.now() - started < EBS_BACKGROUND_WORK_BUDGET_MS) {
    const job = await favDeepQueueClaimNext();
    if (!job) {
      const waiting = (await favDeepQueueList('queued')).filter((entry) => Number(entry.nextAttemptAt) > Date.now());
      if (!waiting.length) break;
      if (Math.min(...waiting.map((entry) => Number(entry.nextAttemptAt))) - Date.now() > 1000) break;
      await ebsWorkerDelay(250);
      continue;
    }
    try {
      const listing = await favIndexGet('listings', job.listingId);
      const url = job.url || listing?.url || `https://www.etsy.com/listing/${encodeURIComponent(job.listingId)}`;
      const parsed = await favDeepFetchListing(url, { observedAt:Date.now() });
      await favIndexApplyDeepListingObservation(job.listingId, parsed);
      await favDeepQueueComplete(job.id);
      completed += 1;
    } catch (error) {
      const next = await favDeepQueueFail(job.id, error);
      if (next?.status === 'failed') failed += 1;
    }
    await ebsPatchStatus?.({
      phase:'background-deep',
      deepState:{ status:'running', completed, failed, total:queuedAtStart, queuedAdded:added },
      lastResult:`Background metadata: ${completed}/${queuedAtStart}`,
    });
    await ebsWorkerDelay(EBS_BACKGROUND_DEEP_DELAY_MS);
  }
  const remaining = (await favDeepQueueList('queued')).length;
  if (completed || failed) await ebsWorkerMarkMigration({ lastBackgroundMutationAt:Date.now() });
  return { completed, failed, total:queuedAtStart, remaining, needsContinuation:remaining > 0 };
}

async function ebsBackgroundMaintenanceRunNoTab(options = {}) {
  const profile = await ebsWorkerGetProfile();
  if (!profile) return { accepted:false, reason:'profile-not-registered' };
  const result = { accepted:true, background:true, catalogue:null, deepMetadata:null, needsContinuation:false };
  try {
    if (options.catalogue !== false) {
      result.catalogue = await ebsWorkerRunCatalogue(profile, { force:options.force === true });
      result.needsContinuation ||= result.catalogue.needsContinuation === true;
      // Avoid deep metadata against a partial initial catalogue. Continue the
      // catalogue first, then populate/scan its complete active set.
      if (result.catalogue.needsContinuation) return result;
    }
    if (options.deepMetadata !== false) {
      result.deepMetadata = await ebsWorkerRunDeep(profile, { force:options.force === true && options.reason === 'manual-deep' });
      result.needsContinuation ||= result.deepMetadata.needsContinuation === true;
    }
    const completedAt = result.needsContinuation ? 0 : Date.now();
    await ebsPatchStatus?.({
      phase:result.needsContinuation ? 'background-continuation' : 'idle',
      lastCompletedAt:completedAt || undefined,
      lastResult:result.needsContinuation ? 'Background maintenance will continue in another worker wake.' : 'Background maintenance completed.',
    });
    return result;
  } catch (error) {
    const message = String(error?.message || error);
    const authentication = /sign-in|sign in|401|403|did not return json/i.test(message);
    await ebsPatchStatus?.({ phase:authentication ? 'authentication-required' : 'error', lastResult:message });
    return { accepted:false, background:true, reason:authentication ? 'authentication-required' : 'background-error', error:message };
  }
}
