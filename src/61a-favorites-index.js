'use strict';

/* Durable Favorites knowledge store. Feature code talks to this interface and
 * does not depend on Tampermonkey/extension preference storage. IndexedDB is
 * available to both delivery targets in Etsy's page context and is suitable for
 * the much larger listing/shop index planned for later scanner phases. */
var FAV_INDEX_DB_NAME = 'etsy-bettersearch-favorites';
var FAV_INDEX_DB_VERSION = 2;
var FAV_INDEX_METADATA_VERSION = 1;
var FAV_INDEX_PARSER_VERSION = 'favorites-card-v1';
var FAV_INDEX_SOURCE_PRIORITY = {
    'favorites-json': 10,
    'favorites-card-dom': 20,
    'favorites-aux-json': 30,
    'listing-page-html': 40,
    'shop-page-html': 50,
    unknown: 100,
};
var favIndexDatabasePromise = null;
var favIndexOperationQueue = Promise.resolve();

function favIndexEnqueue(operation) {
    const result = favIndexOperationQueue.then(operation);
    favIndexOperationQueue = result.catch(() => {});
    return result;
}

function favIndexUnknown(source = 'unknown') {
    return { value: null, known: false, source, observedAt: 0, parserVersion: '' };
}

function favIndexField(value, options = {}) {
    const known = options.known !== false;
    return {
        value: known ? value : null,
        known,
        source: String(options.source || (known ? 'favorites-json' : 'unknown')),
        observedAt: Math.max(0, Number(options.observedAt) || 0),
        parserVersion: String(options.parserVersion || (known ? FAV_INDEX_PARSER_VERSION : '')),
    };
}

function favIndexNormalizeField(field) {
    if (!field || typeof field !== 'object') return favIndexUnknown();
    return favIndexField(field.value, { ...field, known: field.known === true });
}

function favIndexMergeField(existing, incoming) {
    const oldField = favIndexNormalizeField(existing);
    const newField = favIndexNormalizeField(incoming);
    if (!newField.known) {
        if (!oldField.known && newField.observedAt >= oldField.observedAt) return newField;
        return oldField;
    }
    if (!oldField.known) return newField;
    const oldPriority = FAV_INDEX_SOURCE_PRIORITY[oldField.source] ?? 90;
    const newPriority = FAV_INDEX_SOURCE_PRIORITY[newField.source] ?? 90;
    if (newPriority < oldPriority) return newField;
    if (newPriority > oldPriority) return oldField;
    return newField.observedAt >= oldField.observedAt ? newField : oldField;
}

function favIndexMergeMetadata(existing = {}, incoming = {}) {
    const merged = { ...existing };
    for (const [key, field] of Object.entries(incoming || {})) {
        merged[key] = favIndexMergeField(existing[key], field);
    }
    return merged;
}

function favIndexEmptyListing(listingId, observedAt = Date.now()) {
    return {
        listingId: String(listingId),
        url: '',
        title: '',
        shopId: '',
        isFavorite: true,
        favoriteScopes: {},
        firstSeenAt: observedAt,
        lastSeenFavoriteAt: observedAt,
        unfavoritedAt: 0,
        lastCardRefreshAt: 0,
        lastDeepScanAt: 0,
        availabilityState: 'unknown',
        metadataVersion: FAV_INDEX_METADATA_VERSION,
        cardMetadata: {},
        listingMetadata: {
            etsysPick: favIndexUnknown(),
            vintage: favIndexUnknown(),
            vintageEra: favIndexUnknown(),
            giftWrap: favIndexUnknown(),
            category: favIndexUnknown(),
            sellerName: favIndexUnknown(),
        },
        shippingMetadata: {
            shipsFromCountry: favIndexUnknown(),
            processingDays: favIndexUnknown(),
            shipsTo: favIndexUnknown(),
        },
        urgencyMetadata: {
            carts: favIndexUnknown(),
            lowStock: favIndexUnknown(),
            stockLeft: favIndexUnknown(),
        },
    };
}

function favIndexScopeKey(scope) {
    const value = scope && typeof scope === 'object' ? scope : {};
    return [value.owner || '', value.type || 'items', value.id || '', value.query || '']
        .map((part) => encodeURIComponent(String(part)))
        .join('|');
}

function favIndexCurrentScope() {
    const scope = favScope();
    const query = favDatasetQuery();
    return {
        ...scope,
        query,
        nativeQuery: favNativeQuery(),
        scopeKey: favIndexScopeKey({ ...scope, query }),
        authoritativeFavoriteScope: scope.type === 'items' && !query,
    };
}

function favIndexKnown(record, key, value, observedAt, source = 'favorites-json') {
    return favIndexField(value, {
        known: record?.known?.[key] === true,
        source: record?.knownSource?.[key] || source,
        observedAt,
    });
}

function favIndexPatchFromRecord(record, scope, observedAt = Date.now()) {
    const idValue = String(record?.id || record?.listingId || '');
    observedAt = Math.max(0, Number(record?.indexObservedAt) || Number(observedAt) || Date.now());
    const scopeKey = scope?.scopeKey || favIndexScopeKey(scope);
    const finite = (value) => Number.isFinite(value);
    return {
        listingId: idValue,
        url: String(record?.url || ''),
        title: String(record?.title || ''),
        shopId: String(record?.shopId || ''),
        isFavorite: true,
        lastSeenFavoriteAt: observedAt,
        lastCardRefreshAt: observedAt,
        favoriteScopes: scopeKey ? { [scopeKey]: { active: true, lastSeenAt: observedAt } } : {},
        cardMetadata: {
            price: favIndexField(record?.price, { known: finite(record?.price), observedAt }),
            originalPrice: favIndexField(record?.originalPrice, { known: finite(record?.originalPrice), observedAt }),
            discountPercent: favIndexKnown(record, 'discountPercent', record?.discountPercent, observedAt),
            onSale: favIndexKnown(record, 'isOnSale', record?.isOnSale === true, observedAt),
            freeShipping: favIndexKnown(record, 'hasFreeShipping', record?.hasFreeShipping === true, observedAt),
            soldOut: favIndexKnown(record, 'isSoldOut', record?.isSoldOut === true, observedAt),
            digital: favIndexKnown(record, 'isDownload', record?.isDownload === true, observedAt),
            rating: favIndexKnown(record, 'rating', record?.rating, observedAt),
            reviewCount: favIndexKnown(record, 'reviews', record?.reviews, observedAt),
            bestSeller: favIndexKnown(record, 'isBestSeller', record?.isBestSeller === true, observedAt),
            personalizable: favIndexKnown(record, 'isPersonalizable', record?.isPersonalizable === true, observedAt),
            hasVariations: favIndexKnown(record, 'hasVariations', record?.hasVariations === true, observedAt),
        },
        listingMetadata: {},
        shippingMetadata: {
            cost: favIndexField(record?.shipping, { known: finite(record?.shipping), source: 'favorites-aux-json', observedAt }),
            estimatedDelivery: favIndexField(record?.estimatedDelivery, { known: Boolean(record?.estimatedDelivery), source: 'favorites-aux-json', observedAt }),
            returnsAccepted: favIndexField(record?.acceptsReturns === true, { known: record?.known?.acceptsReturns === true, source: 'favorites-aux-json', observedAt }),
            exchangesAccepted: favIndexField(record?.acceptsExchanges === true, { known: record?.known?.acceptsExchanges === true, source: 'favorites-aux-json', observedAt }),
        },
        urgencyMetadata: {
            carts: favIndexField(record?.carts, { known: finite(record?.carts), source: 'favorites-aux-json', observedAt }),
            lowStock: favIndexField(finite(record?.stockLeft), { known: finite(record?.stockLeft), source: 'favorites-aux-json', observedAt }),
            stockLeft: favIndexField(record?.stockLeft, { known: finite(record?.stockLeft), source: 'favorites-aux-json', observedAt }),
        },
        shop: record?.shopId ? {
            shopId: String(record.shopId),
            shopName: String(record.shopName || ''),
            shopUrl: String(record.shopUrl || ''),
            starSeller: favIndexKnown(record, 'isStarSeller', record?.isStarSeller === true, observedAt),
            observedAt,
        } : null,
    };
}

function favIndexMergeListing(existing, incoming, observedAt = Date.now()) {
    const base = existing ? { ...existing } : favIndexEmptyListing(incoming.listingId, observedAt);
    const incomingSeenAt = Number(incoming.lastSeenFavoriteAt) || observedAt;
    const staleRefavorite = base.isFavorite === false && (base.unfavoritedAt || 0) > incomingSeenAt;
    const scopes = { ...(base.favoriteScopes || {}) };
    for (const [key, membership] of Object.entries(incoming.favoriteScopes || {})) {
        if (staleRefavorite && membership.active) continue;
        scopes[key] = { ...(scopes[key] || {}), ...membership };
    }
    return {
        ...base,
        url: incoming.url || base.url || '',
        title: incoming.title || base.title || '',
        shopId: incoming.shopId || base.shopId || '',
        isFavorite: incoming.isFavorite === false ? false : (staleRefavorite ? false : true),
        favoriteScopes: scopes,
        firstSeenAt: base.firstSeenAt || observedAt,
        lastSeenFavoriteAt: Math.max(base.lastSeenFavoriteAt || 0, incoming.lastSeenFavoriteAt || observedAt),
        unfavoritedAt: incoming.isFavorite === false ? (incoming.unfavoritedAt || observedAt) : (staleRefavorite ? base.unfavoritedAt : 0),
        lastCardRefreshAt: Math.max(base.lastCardRefreshAt || 0, incoming.lastCardRefreshAt || 0),
        metadataVersion: FAV_INDEX_METADATA_VERSION,
        cardMetadata: favIndexMergeMetadata(base.cardMetadata, incoming.cardMetadata),
        listingMetadata: favIndexMergeMetadata(base.listingMetadata, incoming.listingMetadata),
        shippingMetadata: favIndexMergeMetadata(base.shippingMetadata, incoming.shippingMetadata),
        urgencyMetadata: favIndexMergeMetadata(base.urgencyMetadata, incoming.urgencyMetadata),
    };
}

function favIndexMarkListingUnfavorite(existing, observedAt = Date.now()) {
    if (!existing) return null;
    const scopes = {};
    for (const [key, membership] of Object.entries(existing.favoriteScopes || {})) {
        scopes[key] = { ...membership, active: false, removedAt: observedAt };
    }
    return { ...existing, isFavorite: false, unfavoritedAt: observedAt, favoriteScopes: scopes };
}

function favIndexMarkListingAvailability(existing, availabilityState, observedAt = Date.now()) {
    if (!existing) return null;
    const allowed = ['unknown', 'available', 'sold-out', 'unavailable', 'deleted'];
    const state = allowed.includes(availabilityState) ? availabilityState : 'unknown';
    return { ...existing, availabilityState: state, availabilityObservedAt: observedAt };
}

function favIndexApplyScopeCompletion(listings, scope, observedIds, observedAt = Date.now()) {
    const scopeKey = scope.scopeKey || favIndexScopeKey(scope);
    const seen = new Set(Array.from(observedIds || [], String));
    return (listings || []).map((listing) => {
        const membership = listing?.favoriteScopes?.[scopeKey];
        if (!membership?.active || seen.has(String(listing.listingId))) return listing;
        const favoriteScopes = {
            ...listing.favoriteScopes,
            [scopeKey]: { ...membership, active: false, removedAt: observedAt },
        };
        if (scope.authoritativeFavoriteScope) {
            return favIndexMarkListingUnfavorite({ ...listing, favoriteScopes }, observedAt);
        }
        return { ...listing, favoriteScopes };
    });
}

function favIndexMergeShop(existing, patch) {
    const base = existing || {
        shopId: patch.shopId,
        shopName: '',
        shopUrl: '',
        starSeller: favIndexUnknown(),
        giftCardSupport: favIndexUnknown(),
        shopRating: favIndexUnknown(),
        shopReviewCount: favIndexUnknown(),
        salesCount: favIndexUnknown(),
        tenure: favIndexUnknown(),
        lastScannedAt: 0,
    };
    return {
        ...base,
        shopName: patch.shopName || base.shopName,
        shopUrl: patch.shopUrl || base.shopUrl,
        starSeller: favIndexMergeField(base.starSeller, patch.starSeller),
        lastObservedAt: Math.max(base.lastObservedAt || 0, patch.observedAt || 0),
    };
}

function favIndexOpen() {
    if (favIndexDatabasePromise) return favIndexDatabasePromise;
    favIndexDatabasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(FAV_INDEX_DB_NAME, FAV_INDEX_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('listings')) {
                const listings = db.createObjectStore('listings', { keyPath: 'listingId' });
                listings.createIndex('isFavorite', 'isFavorite', { unique: false });
                listings.createIndex('shopId', 'shopId', { unique: false });
            }
            if (!db.objectStoreNames.contains('shops')) db.createObjectStore('shops', { keyPath: 'shopId' });
            if (!db.objectStoreNames.contains('scopes')) db.createObjectStore('scopes', { keyPath: 'scopeKey' });
            if (!db.objectStoreNames.contains('deepScanQueue')) {
                const queue = db.createObjectStore('deepScanQueue', { keyPath: 'id' });
                queue.createIndex('status', 'status', { unique:false });
                queue.createIndex('priority', 'priority', { unique:false });
                queue.createIndex('listingId', 'listingId', { unique:false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { favIndexDatabasePromise = null; reject(request.error); };
        request.onblocked = () => { favIndexDatabasePromise = null; reject(new Error('Favorites index upgrade is blocked by another tab.')); };
    });
    return favIndexDatabasePromise;
}

function favIndexRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function favIndexGet(storeName, key) {
    const db = await favIndexOpen();
    return favIndexRequest(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

async function favIndexReadObservation(patches, scopeKey, complete) {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readonly');
    const listingStore = transaction.objectStore('listings');
    const shopStore = transaction.objectStore('shops');
    const shopIds = Array.from(new Set(patches.map((patch) => patch.shop?.shopId).filter(Boolean)));
    const listingsPromise = complete
        ? favIndexRequest(listingStore.getAll())
        : Promise.all(patches.map((patch) => favIndexRequest(listingStore.get(patch.listingId))));
    const [listings, shops, scope] = await Promise.all([
        listingsPromise,
        Promise.all(shopIds.map((shopId) => favIndexRequest(shopStore.get(shopId)))),
        favIndexRequest(transaction.objectStore('scopes').get(scopeKey)),
    ]);
    return { listings, shops, shopIds, scope };
}

async function favIndexWrite(stores, writer) {
    const db = await favIndexOpen();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(stores, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Favorites index transaction aborted.'));
        writer(transaction);
    });
}

async function favIndexObserveRecordsNow(records, options = {}) {
    const observedAt = Number(options.observedAt) || Date.now();
    const scope = options.scope || favIndexCurrentScope();
    const scopeKey = scope.scopeKey || favIndexScopeKey(scope);
    const patchMap = new Map();
    for (const record of records || []) {
        const patch = favIndexPatchFromRecord(record, { ...scope, scopeKey }, observedAt);
        if (patch.listingId) patchMap.set(patch.listingId, patch);
    }
    const patches = Array.from(patchMap.values());
    const complete = options.complete === true;
    const snapshot = await favIndexReadObservation(patches, scopeKey, complete);
    const existingById = new Map(snapshot.listings.filter(Boolean).map((listing) => [String(listing.listingId), listing]));
    const merged = patches.map((patch) => favIndexMergeListing(existingById.get(patch.listingId), patch, observedAt));
    const shops = new Map();
    for (const patch of patches) if (patch.shop) shops.set(patch.shop.shopId, patch.shop);
    const existingShops = new Map(snapshot.shopIds.map((shopId, index) => [shopId, snapshot.shops[index]]));
    const mergedShops = Array.from(shops.values(), (patch) => favIndexMergeShop(existingShops.get(patch.shopId), patch));
    const oldScope = snapshot.scope;
    const observedIds = patches.map((patch) => patch.listingId);
    const observedSet = new Set(observedIds);
    let absentUpdates = [];
    if (complete && oldScope?.listingIds?.length) {
        const absent = oldScope.listingIds
            .map(String)
            .filter((idValue) => !observedSet.has(idValue))
            .map((idValue) => existingById.get(idValue))
            .filter(Boolean);
        absentUpdates = favIndexApplyScopeCompletion(absent, { ...scope, scopeKey }, observedSet, observedAt);
    }
    const scopeRecord = {
        ...(oldScope || {}),
        ...scope,
        scopeKey,
        listingIds: complete
            ? observedIds
            : Array.from(new Set([...(oldScope?.listingIds || []), ...observedIds])),
        lastObservedAt: observedAt,
        lastCompleteSyncAt: complete ? observedAt : (oldScope?.lastCompleteSyncAt || 0),
        complete: complete || oldScope?.complete === true,
        lastSyncState: complete ? 'completed' : (options.syncState || oldScope?.lastSyncState || 'partial'),
        schemaVersion: FAV_INDEX_METADATA_VERSION,
    };
    await favIndexWrite(['listings', 'shops', 'scopes'], (transaction) => {
        const listingStore = transaction.objectStore('listings');
        for (const listing of [...merged, ...absentUpdates]) listingStore.put(listing);
        const shopStore = transaction.objectStore('shops');
        for (const shop of mergedShops) shopStore.put(shop);
        transaction.objectStore('scopes').put(scopeRecord);
    });
    return merged;
}

function favIndexObserveRecords(records, options = {}) {
    return favIndexEnqueue(() => favIndexObserveRecordsNow(records, options));
}

function favIndexCollectionPropsMatchScope(scope, props) {
    if (scope?.type !== 'collection') return true;
    const expected = String(scope?.id || '').trim();
    if (!expected || !props || typeof props !== 'object') return false;
    const collection = props.collection && typeof props.collection === 'object' ? props.collection : {};
    const candidates = [collection.slug, collection.key, props.slug]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    try {
        const collectionPath = new URL(String(collection.url || ''), location.origin).pathname;
        const pathSlug = collectionPath.match(/\/favorites\/([^/?#]+)/i)?.[1];
        if (pathSlug) candidates.push(decodeURIComponent(pathSlug));
    } catch (_) {}
    return candidates.includes(expected);
}

function favIndexObserveCurrentPage() {
    const scope = favIndexCurrentScope();
    const props = favProps();
    /* Etsy soft-navigates the route before it necessarily swaps the old
     * collection's props and native cards. A partial observation from that
     * short gap must never be attached to the new collection's complete
     * snapshot: it would make an old listing appear as a member there. */
    if (!favIndexCollectionPropsMatchScope(scope, props)) return Promise.resolve([]);
    const liveNodes = favCardMap(document);
    const listings = favListingsFromProps(props).filter((listing) => liveNodes.has(String(listing?.listingId ?? listing?.listing_id ?? '')));
    if (!listings.length) return Promise.resolve([]);
    const records = favRecordsFromListings(listings, 0, liveNodes);
    return favIndexObserveRecords(records, { scope, complete: false });
}

async function favIndexMarkUnfavoriteNow(listingId, observedAt = Date.now()) {
    const idValue = String(listingId || '');
    if (!idValue) return false;
    const existing = await favIndexGet('listings', idValue);
    if (!existing) return false;
    await favIndexWrite(['listings'], (transaction) => {
        transaction.objectStore('listings').put(favIndexMarkListingUnfavorite(existing, observedAt));
    });
    return true;
}

async function favIndexGetScope(scopeKey) {
    return favIndexGet('scopes', scopeKey);
}

async function favIndexGetStats(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readonly');
    const [listings, shops, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('shops').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    const ownedScopes = owner ? scopes.filter((scope) => String(scope.owner || '') === String(owner)) : scopes;
    const allItems = ownedScopes
        .filter((scope) => scope.type === 'items' && !scope.query)
        .sort((a,b) => (b.lastCompleteSyncAt || 0) - (a.lastCompleteSyncAt || 0))[0];
    const indexedIds = new Set(ownedScopes.flatMap((scope) => scope.listingIds || []).map(String));
    const ownedListings = owner ? listings.filter((listing) => indexedIds.has(String(listing.listingId))) : listings;
    const ownedShopIds = new Set(ownedListings.map((listing) => String(listing.shopId || '')).filter(Boolean));
    const activeListings = ownedListings.filter((listing) => listing.isFavorite === true);
    const deepListings = activeListings.filter((listing) => Number(listing.lastDeepScanAt) > 0);
    return {
        indexedFavorites: ownedListings.length,
        activeFavorites: activeListings.length,
        indexedShops: owner ? shops.filter((shop) => ownedShopIds.has(String(shop.shopId))).length : shops.length,
        deepMetadataFavorites: deepListings.length,
        lastDeepUpdateAt: deepListings.reduce((latest, listing) => Math.max(latest, Number(listing.lastDeepScanAt) || 0), 0),
        lastFullSyncAt: allItems?.lastCompleteSyncAt || 0,
        allItemsScope: allItems || null,
    };
}

async function favIndexGetActiveListings(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'scopes'], 'readonly');
    const [listings, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    if (!owner) return listings.filter((listing) => listing.isFavorite === true);
    const ids = new Set(scopes
        .filter((scope) => String(scope.owner || '') === String(owner))
        .flatMap((scope) => scope.listingIds || [])
        .map(String));
    return listings.filter((listing) => listing.isFavorite === true && ids.has(String(listing.listingId)));
}

function favIndexApplyListingMetadataToRecord(record, listing) {
    if (!record || !listing) return record;
    const value = (group, key) => group?.[key]?.known ? group[key].value : undefined;
    const category = value(listing.listingMetadata, 'category');
    const sellerName = value(listing.listingMetadata, 'sellerName');
    record.deepMetadata = {
        scannedAt: Number(listing.lastDeepScanAt) || 0,
        parserVersion: String(listing.deepParserVersion || ''),
        etsysPick: value(listing.listingMetadata, 'etsysPick'),
        vintage: value(listing.listingMetadata, 'vintage'),
        vintageEra: value(listing.listingMetadata, 'vintageEra'),
        giftWrap: value(listing.listingMetadata, 'giftWrap'),
        category: Array.isArray(category) ? category.slice() : (category ? [String(category)] : []),
    };
    if (sellerName != null && String(sellerName).trim()) {
        record.shopName = String(sellerName).trim();
        record.known = record.known || {};
        record.known.shopName = true;
    }
    return record;
}

async function favIndexHydrateRecords(records) {
    const list = Array.from(records || []);
    if (!list.length) return list;
    const db = await favIndexOpen();
    const store = db.transaction('listings', 'readonly').objectStore('listings');
    const indexed = await Promise.all(list.map((record) => favIndexRequest(store.get(String(record.id || record.listingId || '')))));
    list.forEach((record, index) => favIndexApplyListingMetadataToRecord(record, indexed[index]));
    return list;
}

function favIndexMarkUnfavorite(listingId, observedAt = Date.now()) {
    return favIndexEnqueue(() => favIndexMarkUnfavoriteNow(listingId, observedAt));
}
