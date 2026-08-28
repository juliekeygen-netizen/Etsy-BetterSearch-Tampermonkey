'use strict';

/* v0.13.0 cache-first Favorites catalogue bootstrap.
 *
 * This module is intentionally data/lifecycle-only. It does not alter the
 * v0.12.15 visual shell. A complete IndexedDB scope may hydrate the live
 * Favorites catalogue immediately; network synchronization can then refresh
 * stale data in the background.
 */

var FAV_CACHE_PRESENTATION_VERSION0137 = 1;
favState.cacheKey0137 = favState.cacheKey0137 || '';
favState.cachePromise0137 = favState.cachePromise0137 || null;
favState.cacheScope0137 = favState.cacheScope0137 || null;
favState.cacheLoadedAt0137 = favState.cacheLoadedAt0137 || 0;
favState.loadSource0137 = favState.loadSource0137 || '';

function favCacheField0137(group, key) {
    const field = group?.[key];
    return field?.known === true ? field : null;
}

function favCacheValue0137(group, key, fallback) {
    const field = favCacheField0137(group, key);
    return field ? field.value : fallback;
}

function favCacheKnown0137(group, key) {
    return favCacheField0137(group, key) !== null;
}

function favCachePresentationFromRecord0137(record, observedAt = Date.now()) {
    return {
        version:FAV_CACHE_PRESENTATION_VERSION0137,
        observedAt:Math.max(0, Number(record?.indexObservedAt) || Number(observedAt) || Date.now()),
        imageUrl:String(record?.imageUrl || ''),
        secondaryImageUrl:String(record?.secondaryImageUrl || ''),
        videoSources:Array.isArray(record?.videoSources) ? record.videoSources.slice(0, 4) : [],
        priceFormatted:String(record?.priceFormatted || ''),
        originalPriceFormatted:String(record?.originalPriceFormatted || ''),
        shopName:String(record?.shopName || ''),
        shopUrl:String(record?.shopUrl || ''),
        shippingFormatted:String(record?.shippingFormatted || ''),
        urgency:String(record?.urgency || ''),
        isShopOnVacation:record?.isShopOnVacation === true,
        shouldShowBuyItNowButton:record?.shouldShowBuyItNowButton === true,
    };
}

function favCacheMergePresentation0137(existing, incoming) {
    const oldValue = existing && typeof existing === 'object' ? existing : null;
    const newValue = incoming && typeof incoming === 'object' ? incoming : null;
    if (!newValue) return oldValue || null;
    if (!oldValue) return { ...newValue };
    const oldAt = Math.max(0, Number(oldValue.observedAt) || 0);
    const newAt = Math.max(0, Number(newValue.observedAt) || 0);
    if (newAt < oldAt) return oldValue;
    return {
        ...oldValue,
        ...newValue,
        imageUrl:newValue.imageUrl || oldValue.imageUrl || '',
        secondaryImageUrl:newValue.secondaryImageUrl || oldValue.secondaryImageUrl || '',
        videoSources:Array.isArray(newValue.videoSources) && newValue.videoSources.length
            ? newValue.videoSources
            : (Array.isArray(oldValue.videoSources) ? oldValue.videoSources : []),
        priceFormatted:newValue.priceFormatted || oldValue.priceFormatted || '',
        originalPriceFormatted:newValue.originalPriceFormatted || oldValue.originalPriceFormatted || '',
        shopName:newValue.shopName || oldValue.shopName || '',
        shopUrl:newValue.shopUrl || oldValue.shopUrl || '',
        shippingFormatted:newValue.shippingFormatted || oldValue.shippingFormatted || '',
        urgency:newValue.urgency || oldValue.urgency || '',
        observedAt:Math.max(oldAt, newAt),
    };
}

/* Persist a small presentation snapshot beside the normalized metadata. This
 * keeps cache-first enhanced rendering useful after the first v0.13 refresh
 * without storing entire stale card HTML blobs in IndexedDB. */
var favIndexPatchFromRecordBefore0137 = favIndexPatchFromRecord;
favIndexPatchFromRecord = function favIndexPatchFromRecord0137(record, scope, observedAt = Date.now()) {
    const patch = favIndexPatchFromRecordBefore0137(record, scope, observedAt);
    patch.presentationSnapshot = favCachePresentationFromRecord0137(record, observedAt);
    return patch;
};

var favIndexMergeListingBefore0137 = favIndexMergeListing;
favIndexMergeListing = function favIndexMergeListing0137(existing, incoming, observedAt = Date.now()) {
    const merged = favIndexMergeListingBefore0137(existing, incoming, observedAt);
    merged.presentationSnapshot = favCacheMergePresentation0137(
        existing?.presentationSnapshot,
        incoming?.presentationSnapshot,
    );
    return merged;
};

async function favCacheReadScope0137(scope = favIndexCurrentScope()) {
    const scopeKey = scope?.scopeKey || favIndexScopeKey(scope);
    if (!scopeKey) return null;
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readonly');
    const [scopeRecord, listings, shops] = await Promise.all([
        favIndexRequest(transaction.objectStore('scopes').get(scopeKey)),
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('shops').getAll()),
    ]);
    if (!scopeRecord?.complete) return null;

    const listingById = new Map((listings || []).map((listing) => [String(listing?.listingId || ''), listing]));
    const shopById = new Map((shops || []).map((shop) => [String(shop?.shopId || ''), shop]));
    const ids = Array.from(scopeRecord.listingIds || [], String);
    return { scope:{ ...scope, scopeKey }, scopeRecord, ids, listingById, shopById };
}

function favCacheRecordFromIndexed0137(indexed, shop, liveListing, liveNode, order) {
    if (liveListing) {
        const live = favRecordFromListing(liveListing, liveNode, order);
        favIndexApplyListingMetadataToRecord(live, indexed);
        return live;
    }

    const presentation = indexed?.presentationSnapshot || {};
    const card = indexed?.cardMetadata || {};
    const shipping = indexed?.shippingMetadata || {};
    const urgency = indexed?.urgencyMetadata || {};
    const starSeller = shop?.starSeller?.known === true ? shop.starSeller.value === true : false;
    const stockLeft = Number(favCacheValue0137(urgency, 'stockLeft', NaN));
    const carts = Number(favCacheValue0137(urgency, 'carts', NaN));
    const price = Number(favCacheValue0137(card, 'price', NaN));
    const originalPrice = Number(favCacheValue0137(card, 'originalPrice', NaN));
    const rating = Number(favCacheValue0137(card, 'rating', NaN));
    const reviews = Number(favCacheValue0137(card, 'reviewCount', NaN));
    const shippingCost = Number(favCacheValue0137(shipping, 'cost', NaN));

    const record = {
        id:String(indexed?.listingId || ''),
        title:String(indexed?.title || ''),
        url:String(indexed?.url || ''),
        imageUrl:String(presentation.imageUrl || ''),
        secondaryImageUrl:String(presentation.secondaryImageUrl || ''),
        videoSources:Array.isArray(presentation.videoSources) ? presentation.videoSources.slice() : [],
        isBestSeller:favCacheValue0137(card, 'bestSeller', false) === true,
        isShopOnVacation:presentation.isShopOnVacation === true,
        isSoldOut:favCacheValue0137(card, 'soldOut', indexed?.availabilityState === 'sold-out') === true,
        shouldShowBuyItNowButton:presentation.shouldShowBuyItNowButton === true,
        price:Number.isFinite(price) ? price : NaN,
        priceFormatted:String(presentation.priceFormatted || ''),
        originalPrice:Number.isFinite(originalPrice) ? originalPrice : NaN,
        originalPriceFormatted:String(presentation.originalPriceFormatted || ''),
        discountPercent:Number(favCacheValue0137(card, 'discountPercent', 0)) || 0,
        isOnSale:favCacheValue0137(card, 'onSale', false) === true,
        isDownload:favCacheValue0137(card, 'digital', false) === true,
        hasFreeShipping:favCacheValue0137(card, 'freeShipping', false) === true,
        rating:Number.isFinite(rating) ? rating : NaN,
        reviews:Number.isFinite(reviews) ? reviews : NaN,
        shopName:String(presentation.shopName || shop?.shopName || ''),
        shopId:String(indexed?.shopId || ''),
        shopUrl:String(presentation.shopUrl || shop?.shopUrl || ''),
        isStarSeller:starSeller,
        hasVariations:favCacheValue0137(card, 'hasVariations', false) === true,
        isPersonalizable:favCacheValue0137(card, 'personalizable', false) === true,
        html:liveNode?.outerHTML || '',
        order,
        shipping:Number.isFinite(shippingCost) ? shippingCost : NaN,
        shippingFormatted:String(presentation.shippingFormatted || ''),
        estimatedDelivery:String(favCacheValue0137(shipping, 'estimatedDelivery', '') || ''),
        acceptsReturns:favCacheValue0137(shipping, 'returnsAccepted', false) === true,
        acceptsExchanges:favCacheValue0137(shipping, 'exchangesAccepted', false) === true,
        urgency:String(presentation.urgency || ''),
        carts:Number.isFinite(carts) ? carts : NaN,
        stockLeft:Number.isFinite(stockLeft) ? stockLeft : NaN,
        indexObservedAt:Math.max(0, Number(indexed?.lastCardRefreshAt) || Number(indexed?.lastSeenFavoriteAt) || 0),
        known:{
            isBestSeller:favCacheKnown0137(card, 'bestSeller'),
            isSoldOut:favCacheKnown0137(card, 'soldOut') || ['available','sold-out'].includes(indexed?.availabilityState),
            isDownload:favCacheKnown0137(card, 'digital'),
            hasFreeShipping:favCacheKnown0137(card, 'freeShipping'),
            isOnSale:favCacheKnown0137(card, 'onSale'),
            discountPercent:favCacheKnown0137(card, 'discountPercent'),
            rating:favCacheKnown0137(card, 'rating'),
            reviews:favCacheKnown0137(card, 'reviewCount'),
            isStarSeller:shop?.starSeller?.known === true,
            hasVariations:favCacheKnown0137(card, 'hasVariations'),
            isPersonalizable:favCacheKnown0137(card, 'personalizable'),
            shipping:favCacheKnown0137(shipping, 'cost'),
            acceptsReturns:favCacheKnown0137(shipping, 'returnsAccepted'),
            acceptsExchanges:favCacheKnown0137(shipping, 'exchangesAccepted'),
            carts:favCacheKnown0137(urgency, 'carts'),
            stockLeft:favCacheKnown0137(urgency, 'stockLeft'),
        },
        knownSource:{},
    };
    favIndexApplyListingMetadataToRecord(record, indexed);
    return record;
}

function favCacheMaterializeScope0137(snapshot) {
    if (!snapshot) return [];
    const liveNodes = favCardMap(document);
    const liveListings = new Map(
        favListingsFromProps(favProps()).map((listing) => [String(listing?.listingId ?? listing?.listing_id ?? ''), listing])
    );
    const records = [];
    snapshot.ids.forEach((idValue, order) => {
        const indexed = snapshot.listingById.get(String(idValue));
        if (!indexed || indexed.isFavorite !== true) return;
        const membership = indexed.favoriteScopes?.[snapshot.scope.scopeKey];
        if (membership?.active === false) return;
        const record = favCacheRecordFromIndexed0137(
            indexed,
            snapshot.shopById.get(String(indexed.shopId || '')),
            liveListings.get(String(idValue)),
            liveNodes.get(String(idValue)),
            order,
        );
        if (record.id) records.push(record);
    });
    return records;
}

function favCacheHasRequiredExtraInfo0137(records = favState.records) {
    if (!favNeedsExtraInfo()) return true;
    const filters = favCfg.filters || {};
    const needsShipping = Boolean(filters.maxShipping || favCfg.sort === 'shipping');
    const needsReturns = filters.returns === true;
    const needsExchanges = filters.exchanges === true;
    const needsCarts = Boolean(filters.minCarts || favCfg.sort === 'carts');
    const needsStock = Boolean(filters.lowStock || favCfg.sort === 'stock');
    const needsFreeShipping = filters.freeShipping === true;
    return records.every((record) =>
        (!needsShipping || record?.known?.shipping === true || (record?.known?.hasFreeShipping === true && record.hasFreeShipping === true))
        && (!needsReturns || record?.known?.acceptsReturns === true)
        && (!needsExchanges || record?.known?.acceptsExchanges === true)
        && (!needsCarts || record?.known?.carts === true)
        && (!needsStock || record?.known?.stockLeft === true)
        && (!needsFreeShipping || record?.known?.hasFreeShipping === true)
    );
}

async function favPrimeDatasetFromCache0137(options = {}) {
    if (!isFavoritesPage()) return false;
    const key = favDatasetKey();
    if (!options.force && favState.loadKey === key && favState.loadComplete) return true;
    if (!options.force && favState.cacheKey0137 === key && favState.cachePromise0137) return favState.cachePromise0137;

    const scope = favIndexCurrentScope();
    favState.cacheKey0137 = key;
    const promise = (async () => {
        try {
            const snapshot = await favCacheReadScope0137(scope);
            if (!snapshot || !isFavoritesPage() || favDatasetKey() !== key) return false;
            const records = favCacheMaterializeScope0137(snapshot);
            if (favDatasetKey() !== key) return false;

            favState.records = records;
            favState.recordsById = new Map(records.map((record) => [record.id, record]));
            favState.total = records.length;
            favState.loadKey = key;
            favState.loadComplete = true;
            favState.loading = false;
            favState.loadSource0137 = 'cache';
            favState.cacheScope0137 = snapshot.scopeRecord;
            favState.cacheLoadedAt0137 = Date.now();
            favState.groupQueryResolved = scope.type !== 'group' || !scope.query || snapshot.scopeRecord.complete === true;
            favState.extraReady = favCacheHasRequiredExtraInfo0137(records);
            favState.extraKey = favState.extraReady ? favExtraDatasetKey() : '';
            return true;
        } catch (error) {
            console.warn('[Etsy BetterSearch] Could not hydrate Favorites from IndexedDB:', error);
            return false;
        }
    })();

    favState.cachePromise0137 = promise.finally(() => {
        if (favState.cacheKey0137 === key) favState.cachePromise0137 = null;
    });
    return favState.cachePromise0137;
}

/* Network loading remains the fallback for a missing/incomplete cache or an
 * explicit force refresh. Normal startup and same-dataset route changes get the
 * complete cached scope first and leave stale refresh policy to favMaybeAutoSync. */
var favLoadAllNetwork0137 = favLoadAll;
favLoadAll = async function favLoadAllCacheFirst0137(force = false) {
    const key = favDatasetKey();
    if (!force) {
        if (favState.loadKey === key && favState.loadComplete) return favState.records;
        if (await favPrimeDatasetFromCache0137()) return favState.records;
    }
    const records = await favLoadAllNetwork0137(force);
    if (isFavoritesPage() && favDatasetKey() === key && favState.loadComplete) {
        favState.loadSource0137 = 'network';
        favState.cacheScope0137 = await favIndexGetScope(favIndexCurrentScope().scopeKey).catch(() => null);
    }
    return records;
};
