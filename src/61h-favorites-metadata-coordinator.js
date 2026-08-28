'use strict';

/* v0.14.0 demand-driven metadata coordinator.
 *
 * Metadata work is requested by capability. Card/catalogue data remains the
 * first choice; the auxiliary endpoint is used only for active requirements,
 * and listing-page deep scans are queued only when an active deep capability
 * actually needs them. Freshness and destination context are tracked per field.
 */
var FAV_METADATA_TTL0141 = {
    shipping: 6 * 60 * 60 * 1000,
    estimatedDelivery: 6 * 60 * 60 * 1000,
    returns: 7 * 24 * 60 * 60 * 1000,
    exchanges: 7 * 24 * 60 * 60 * 1000,
    carts: 15 * 60 * 1000,
    stock: 15 * 60 * 1000,
    deep: typeof FAV_DEEP_METADATA_STALE_MS === 'number' ? FAV_DEEP_METADATA_STALE_MS : 30 * 24 * 60 * 60 * 1000,
};
var FAV_METADATA_AUX_CAPS0141 = new Set(['shipping','returns','exchanges','carts','stock','freeShippingFallback']);
var FAV_METADATA_DEEP_CAPS0141 = new Set(['category','etsysPick','vintage','giftWrap','shipsFrom','processing','shipsTo']);
var favMetadataInflight0141 = new Map();
favState.metadataCoverage0141 = favState.metadataCoverage0141 || null;
favState.metadataReapplyTimer0141 = Number(favState.metadataReapplyTimer0141) || 0;

/* Preserve optional field context through the normalized IndexedDB merge path. */
var favIndexNormalizeFieldBefore0141 = favIndexNormalizeField;
favIndexNormalizeField = function favIndexNormalizeField0141(field) {
    const normalized = favIndexNormalizeFieldBefore0141(field);
    normalized.contextKey = String(field?.contextKey || '');
    return normalized;
};

var favIndexFieldBefore0141 = favIndexField;
favIndexField = function favIndexField0141(value, options = {}) {
    return { ...favIndexFieldBefore0141(value, options), contextKey:String(options.contextKey || '') };
};

function favMetadataDestination0141() {
    const props = favProps();
    const country = String(props?.countryIsoCode || '').trim().toUpperCase();
    const postal = String(props?.buyerPostalCode || '').trim().toUpperCase();
    return { country, postal, contextKey:`${country}|${postal}` };
}

function favMetadataMeta0141(record, key) {
    return record?.metadataMeta0141?.[key] || null;
}

function favMetadataSetMeta0141(record, key, values = {}) {
    record.metadataMeta0141 = record.metadataMeta0141 || {};
    record.metadataMeta0141[key] = {
        observedAt:Math.max(0, Number(values.observedAt) || Date.now()),
        contextKey:String(values.contextKey || ''),
        known:values.known === true,
        source:String(values.source || 'favorites-aux-json'),
    };
    return record.metadataMeta0141[key];
}

function favMetadataIndexField0141(value, meta, parserVersion = FAV_INDEX_PARSER_VERSION) {
    return favIndexField(value, {
        known:meta?.known === true,
        source:meta?.source || 'favorites-aux-json',
        observedAt:meta?.observedAt || Date.now(),
        parserVersion,
        contextKey:meta?.contextKey || '',
    });
}

/* Persist field-specific observation time/context instead of stamping auxiliary
 * data with the card observation timestamp. Unknown-but-observed is preserved. */
var favIndexPatchFromRecordBefore0141 = favIndexPatchFromRecord;
favIndexPatchFromRecord = function favIndexPatchFromRecord0141(record, scope, observedAt = Date.now()) {
    const patch = favIndexPatchFromRecordBefore0141(record, scope, observedAt);
    const meta = record?.metadataMeta0141 || {};
    if (meta.shipping) patch.shippingMetadata.cost = favMetadataIndexField0141(record.shipping, meta.shipping);
    if (meta.estimatedDelivery) patch.shippingMetadata.estimatedDelivery = favMetadataIndexField0141(record.estimatedDelivery, meta.estimatedDelivery);
    if (meta.returns) patch.shippingMetadata.returnsAccepted = favMetadataIndexField0141(record.acceptsReturns === true, meta.returns);
    if (meta.exchanges) patch.shippingMetadata.exchangesAccepted = favMetadataIndexField0141(record.acceptsExchanges === true, meta.exchanges);
    if (meta.carts) patch.urgencyMetadata.carts = favMetadataIndexField0141(record.carts, meta.carts);
    if (meta.stock) {
        patch.urgencyMetadata.stockLeft = favMetadataIndexField0141(record.stockLeft, meta.stock);
        patch.urgencyMetadata.lowStock = favMetadataIndexField0141(Number.isFinite(record.stockLeft), meta.stock);
    }
    return patch;
};

function favMetadataMetaFromIndexedField0141(field) {
    if (!field || typeof field !== 'object' || !Number(field.observedAt)) return null;
    return {
        observedAt:Number(field.observedAt) || 0,
        contextKey:String(field.contextKey || ''),
        known:field.known === true,
        source:String(field.source || ''),
    };
}

/* Cache materialization keeps the provenance required for freshness decisions. */
var favCacheRecordFromIndexedBefore0141 = favCacheRecordFromIndexed0137;
favCacheRecordFromIndexed0137 = function favCacheRecordFromIndexed0141(indexed, shop, liveListing, liveNode, order) {
    const record = favCacheRecordFromIndexedBefore0141(indexed, shop, liveListing, liveNode, order);
    const shipping = indexed?.shippingMetadata || {};
    const urgency = indexed?.urgencyMetadata || {};
    const meta = {
        shipping:favMetadataMetaFromIndexedField0141(shipping.cost),
        estimatedDelivery:favMetadataMetaFromIndexedField0141(shipping.estimatedDelivery),
        returns:favMetadataMetaFromIndexedField0141(shipping.returnsAccepted),
        exchanges:favMetadataMetaFromIndexedField0141(shipping.exchangesAccepted),
        carts:favMetadataMetaFromIndexedField0141(urgency.carts),
        stock:favMetadataMetaFromIndexedField0141(urgency.stockLeft),
    };
    record.metadataMeta0141 = Object.fromEntries(Object.entries(meta).filter(([, value]) => Boolean(value)));
    return record;
};

function favMetadataRequirements0141(config = favCfg) {
    const filters = config?.filters || {};
    const required = new Set();
    if (filters.maxShipping || config.sort === 'shipping') required.add('shipping');
    if (filters.returns === true) required.add('returns');
    if (filters.exchanges === true) required.add('exchanges');
    if (filters.minCarts || config.sort === 'carts') required.add('carts');
    if (filters.lowStock || config.sort === 'stock') required.add('stock');
    if (filters.freeShipping === true) required.add('freeShippingFallback');
    if (filters.category) required.add('category');
    if (filters.etsysPick === true) required.add('etsysPick');
    if (filters.vintage === true) required.add('vintage');
    if (filters.giftWrap === true) required.add('giftWrap');
    if (filters.shipsFrom && filters.shipsFrom !== 'anywhere') required.add('shipsFrom');
    if (filters.ready1Day || filters.ready3Days) required.add('processing');
    if (filters.shipTo && String(filters.shipTo).toUpperCase() !== 'ZZ') required.add('shipsTo');
    return required;
}

function favMetadataAuxRequirements0141(requirements) {
    return new Set(Array.from(requirements || []).filter((capability) => FAV_METADATA_AUX_CAPS0141.has(capability)));
}

function favMetadataDeepRequirements0141(requirements) {
    return new Set(Array.from(requirements || []).filter((capability) => FAV_METADATA_DEEP_CAPS0141.has(capability)));
}

function favMetadataVisibleIds0141() {
    return new Set(Array.from(favCardMap(document).keys(), String));
}

function favMetadataPriorityRecords0141(records = favState.records) {
    const visible = favMetadataVisibleIds0141();
    return records.slice().sort((a, b) => Number(!visible.has(String(a.id))) - Number(!visible.has(String(b.id))) || a.order - b.order);
}

function favMetadataFieldState0141(record, capability, now = Date.now()) {
    const destination = favMetadataDestination0141();
    const key = capability === 'freeShippingFallback' ? 'shipping' : capability;
    const meta = favMetadataMeta0141(record, key);
    const ttl = FAV_METADATA_TTL0141[key] || FAV_METADATA_TTL0141.deep;
    const contextSensitive = key === 'shipping' || key === 'estimatedDelivery';
    const contextOk = !contextSensitive || Boolean(meta && meta.contextKey === destination.contextKey);
    const fresh = Boolean(meta && contextOk && now - Number(meta.observedAt || 0) < ttl);
    if (capability === 'freeShippingFallback' && record?.known?.hasFreeShipping === true) {
        return { resolved:true, known:true, fresh:true };
    }
    return { resolved:fresh, known:fresh && meta?.known === true, fresh };
}

function favMetadataDeepState0141(record, capability, now = Date.now()) {
    const scannedAt = Math.max(0, Number(record?.deepMetadata?.scannedAt) || 0);
    const parserCurrent = !record?.deepMetadata?.parserVersion || record.deepMetadata.parserVersion === FAV_DEEP_PARSER_VERSION;
    const fresh = Boolean(scannedAt && parserCurrent && now - scannedAt < FAV_METADATA_TTL0141.deep);
    let known = false;
    if (capability === 'category') known = Array.isArray(record?.deepMetadata?.category) && record.deepMetadata.category.length > 0;
    else if (capability === 'etsysPick') known = typeof record?.deepMetadata?.etsysPick === 'boolean';
    else if (capability === 'vintage') known = typeof record?.deepMetadata?.vintage === 'boolean';
    else if (capability === 'giftWrap') known = typeof record?.deepMetadata?.giftWrap === 'boolean';
    else if (capability === 'shipsFrom') known = record?.known?.shipsFromCountry === true;
    else if (capability === 'processing') known = record?.known?.processingDays === true || Number.isFinite(record?.processingDays);
    else if (capability === 'shipsTo') known = record?.known?.shipsTo === true;
    return { resolved:fresh, known:fresh && known, fresh };
}

function favMetadataAuxRequestNeeded0141(record, requirements, now = Date.now()) {
    for (const capability of requirements) {
        if (!favMetadataFieldState0141(record, capability, now).resolved) return true;
    }
    return false;
}

function favMetadataApplyAux0141(record, extra, requirements, observedAt, destination) {
    const has = (key) => Boolean(extra && Object.prototype.hasOwnProperty.call(extra, key));
    record.known = record.known || {};

    if (requirements.has('shipping') || requirements.has('freeShippingFallback')) {
        const shippingKnown = has('shipping_costs');
        record.shippingFormatted = shippingKnown ? String(extra.shipping_costs || '') : String(record.shippingFormatted || '');
        const parsed = shippingKnown ? favParseMoney(extra.shipping_costs) : NaN;
        record.shipping = Number.isFinite(parsed) ? parsed : (record?.known?.hasFreeShipping === true && record.hasFreeShipping ? 0 : NaN);
        record.known.shipping = shippingKnown || (record?.known?.hasFreeShipping === true && record.hasFreeShipping === true);
        if (record.shipping === 0) { record.hasFreeShipping = true; record.known.hasFreeShipping = true; }
        favMetadataSetMeta0141(record, 'shipping', { observedAt, contextKey:destination.contextKey, known:record.known.shipping });

        const deliveryKnown = has('estimated_delivery') && Boolean(String(extra?.estimated_delivery || ''));
        record.estimatedDelivery = deliveryKnown ? String(extra.estimated_delivery) : '';
        record.known.estimatedDelivery = deliveryKnown;
        favMetadataSetMeta0141(record, 'estimatedDelivery', { observedAt, contextKey:destination.contextKey, known:deliveryKnown });
    }

    if (requirements.has('returns')) {
        const known = has('accepts_returns');
        record.acceptsReturns = known && String(extra.accepts_returns) === '1';
        record.known.acceptsReturns = known;
        favMetadataSetMeta0141(record, 'returns', { observedAt, known });
    }
    if (requirements.has('exchanges')) {
        const known = has('accepts_exchanges');
        record.acceptsExchanges = known && String(extra.accepts_exchanges) === '1';
        record.known.acceptsExchanges = known;
        favMetadataSetMeta0141(record, 'exchanges', { observedAt, known });
    }
    if (requirements.has('carts') || requirements.has('stock')) {
        const urgencyKnown = has('urgency_signal') && Boolean(String(extra?.urgency_signal || ''));
        record.urgency = urgencyKnown ? String(extra.urgency_signal) : '';
        const carts = record.urgency.match(/in\s+(\d+)\s+carts?/i);
        const stock = record.urgency.match(/(?:only\s+)?(\d+)\s+left/i);
        if (requirements.has('carts')) {
            record.carts = carts ? Number(carts[1]) : NaN;
            record.known.carts = Boolean(carts);
            favMetadataSetMeta0141(record, 'carts', { observedAt, known:Boolean(carts) });
        }
        if (requirements.has('stock')) {
            record.stockLeft = /\bone\s+left\b/i.test(record.urgency) ? 1 : (stock ? Number(stock[1]) : NaN);
            record.known.stockLeft = Number.isFinite(record.stockLeft);
            favMetadataSetMeta0141(record, 'stock', { observedAt, known:record.known.stockLeft });
        }
    }
}

async function favMetadataFetchAux0141(requirements, options = {}) {
    if (!requirements.size || !favState.records.length) return { requested:0, unresolved:0 };
    const datasetKey = favDatasetKey();
    const destination = favMetadataDestination0141();
    const requestKey = `${datasetKey}|${destination.contextKey}|${Array.from(requirements).sort().join(',')}`;
    if (favMetadataInflight0141.has(requestKey)) return favMetadataInflight0141.get(requestKey);

    const promise = (async () => {
        const ordered = favMetadataPriorityRecords0141();
        const needed = ordered.filter((record) => favMetadataAuxRequestNeeded0141(record, requirements));
        if (!needed.length) return { requested:0, unresolved:0 };
        const controller = new AbortController();
        let requested = 0;
        for (let index = 0; index < needed.length; index += 30) {
            if (!isFavoritesPage() || favDatasetKey() !== datasetKey) throw new DOMException('Stale metadata request', 'AbortError');
            const batch = needed.slice(index, index + 30);
            const url = new URL('/api/v3/ajax/bespoke/member/users/favorites/additional-listing-info', location.origin);
            batch.forEach((record) => url.searchParams.append('listing_ids[]', record.id));
            if (destination.country) url.searchParams.set('country_iso_code', destination.country);
            url.searchParams.set('postal_code', destination.postal);
            const data = await favFetchJson(url, controller.signal);
            const observedAt = Date.now();
            for (const record of batch) {
                favMetadataApplyAux0141(record, data?.map?.[record.id] || null, requirements, observedAt, destination);
            }
            requested += batch.length;
            await favIndexObserveRecords(batch, { scope:favIndexCurrentScope(), complete:false, syncState:'metadata' });
        }
        const unresolved = favState.records.reduce((count, record) => count + Array.from(requirements).filter((capability) => !favMetadataFieldState0141(record, capability).known).length, 0);
        return { requested, unresolved };
    })();
    const wrapped = promise.finally(() => favMetadataInflight0141.delete(requestKey));
    favMetadataInflight0141.set(requestKey, wrapped);
    return wrapped;
}

async function favMetadataIndexedById0141(records = favState.records) {
    if (!records.length) return new Map();
    const db = await favIndexOpen();
    const store = db.transaction('listings', 'readonly').objectStore('listings');
    const values = await Promise.all(records.map((record) => favIndexRequest(store.get(String(record.id)))));
    return new Map(values.filter(Boolean).map((listing) => [String(listing.listingId), listing]));
}

function favMetadataDeepNeedsWork0141(record, indexed, requirements, now = Date.now()) {
    if (!requirements.size) return false;
    const scanStale = !Number(indexed?.lastDeepScanAt)
        || indexed.deepParserVersion !== FAV_DEEP_PARSER_VERSION
        || now - Number(indexed.lastDeepScanAt || 0) >= FAV_METADATA_TTL0141.deep;
    if (scanStale) return true;
    if (requirements.has('shipsFrom') && indexed?.shippingOriginParserVersion !== FAV_DEEP_SHIPPING_ORIGIN_VERSION) return true;
    return false;
}

async function favMetadataQueueDeep0141(requirements) {
    if (!requirements.size || !favState.records.length) return { queued:0, unresolved:0 };
    const ordered = favMetadataPriorityRecords0141();
    const visible = favMetadataVisibleIds0141();
    const indexedById = await favMetadataIndexedById0141(ordered);
    let queued = 0;
    for (const record of ordered) {
        const indexed = indexedById.get(String(record.id));
        if (!favMetadataDeepNeedsWork0141(record, indexed, requirements)) continue;
        await favDeepQueueEnqueue(record.id, {
            type:'missing_metadata',
            priority:visible.has(String(record.id)) ? 1 : 2,
            url:record.url || indexed?.url || '',
        });
        queued += 1;
    }
    if (queued) void favDeepRunQueue();
    const unresolved = ordered.reduce((count, record) => count + Array.from(requirements).filter((capability) => !favMetadataDeepState0141(record, capability).known).length, 0);
    return { queued, unresolved };
}

function favMetadataCoverage0141(requirements, auxResult = {}, deepResult = {}) {
    const capabilities = Array.from(requirements || []);
    const aux = favMetadataAuxRequirements0141(requirements);
    const deep = favMetadataDeepRequirements0141(requirements);
    const unresolved = favState.records.reduce((count, record) => {
        for (const capability of capabilities) {
            const state = aux.has(capability)
                ? favMetadataFieldState0141(record, capability)
                : favMetadataDeepState0141(record, capability);
            if (!state.known) count += 1;
        }
        return count;
    }, 0);
    const coverage = {
        datasetKey:favDatasetKey(), capabilities,
        auxRequested:Number(auxResult.requested) || 0,
        deepQueued:Number(deepResult.queued) || 0,
        pending:Number(deepResult.queued) || 0,
        unresolved,
        complete:!(Number(deepResult.queued) || 0),
        observedAt:Date.now(),
    };
    favState.metadataCoverage0141 = coverage;
    document.dispatchEvent(new CustomEvent('ebsf:favorites-metadata-coverage', { detail:{ ...coverage } }));
    return coverage;
}

async function favMetadataEnsureCurrentRequirements(options = {}) {
    if (!isFavoritesPage()) return { complete:true, pending:0, unresolved:0, capabilities:[] };
    const datasetKey = favDatasetKey();
    const requirements = options.requirements instanceof Set ? options.requirements : favMetadataRequirements0141();
    const auxRequirements = options.deepOnly ? new Set() : favMetadataAuxRequirements0141(requirements);
    const deepRequirements = favMetadataDeepRequirements0141(requirements);
    let auxResult = { requested:0, unresolved:0 };
    let deepResult = { queued:0, unresolved:0 };
    if (auxRequirements.size) auxResult = await favMetadataFetchAux0141(auxRequirements, options);
    if (!isFavoritesPage() || datasetKey !== favDatasetKey()) return { complete:false, stale:true, pending:0, unresolved:0, capabilities:Array.from(requirements) };
    if (deepRequirements.size) deepResult = await favMetadataQueueDeep0141(deepRequirements);
    return favMetadataCoverage0141(requirements, auxResult, deepResult);
}

/* The old extra-info API remains callable, but it is now a capability adapter
 * instead of a whole-catalogue auxiliary pass. */
favEnsureExtraInfo = function favEnsureExtraInfo0141() {
    return favMetadataEnsureCurrentRequirements0141().then((coverage) => coverage.complete);
};

/* Owner-scoped deep maintenance reads exact scope membership instead of every
 * historical listing in the database. This also keeps manual Update all intact. */
favIndexGetActiveListings = async function favIndexGetActiveListings0141(owner = '') {
    const db = await favIndexOpen();
    if (!owner) {
        const store = db.transaction('listings', 'readonly').objectStore('listings');
        if (store.indexNames?.contains?.('isFavorite')) {
            return favIndexRequest(store.index('isFavorite').getAll(true));
        }
        return (await favIndexRequest(store.getAll())).filter((listing) => listing.isFavorite === true);
    }
    const authoritativeKey = favIndexScopeKey({ owner, type:'items', id:'', query:'' });
    let scope = await favIndexRequest(db.transaction('scopes', 'readonly').objectStore('scopes').get(authoritativeKey));
    let ids = Array.from(new Set((scope?.listingIds || []).map(String).filter(Boolean)));
    if (!ids.length) {
        const scopes = await favIndexRequest(db.transaction('scopes', 'readonly').objectStore('scopes').getAll());
        ids = Array.from(new Set(scopes.filter((entry) => String(entry.owner || '') === String(owner)).flatMap((entry) => entry.listingIds || []).map(String)));
    }
    if (!ids.length) return [];
    const store = db.transaction('listings', 'readonly').objectStore('listings');
    const listings = await Promise.all(ids.map((idValue) => favIndexRequest(store.get(idValue))));
    return listings.filter((listing) => listing?.isFavorite === true);
};

/* Automatic deep work is dependency-driven. Plain Favorites browsing never
 * queues a whole catalogue just because metadata could be enriched. */
favDeepMaybeAutoScan = async function favDeepMaybeAutoScan0141() {
    if (!favCfg.autoScanMissingMetadata || !isFavoritesPage() || !favIsOwnFavoritesPage()) return false;
    const deep = favMetadataDeepRequirements0141(favMetadataRequirements0141());
    if (!deep.size) return false;
    await favMetadataEnsureCurrentRequirements0141({ requirements:deep, deepOnly:true });
    return true;
};

function favMetadataScheduleReapply0141() {
    clearTimeout(favState.metadataReapplyTimer0141);
    favState.metadataReapplyTimer0141 = setTimeout(() => {
        if (!isFavoritesPage() || !favEnhancementActive()) return;
        favIndexHydrateRecords(favState.records)
            .then(() => favReapply())
            .catch((error) => console.warn('[Etsy BetterSearch] Metadata reapply failed:', error));
    }, 80);
}

document.addEventListener('ebsf:favorites-deep-state', (event) => {
    const status = String(event.detail?.status || '');
    if (!['completed','completed_with_errors','cancelled'].includes(status)) return;
    if (favMetadataDeepRequirements0141(favMetadataRequirements0141()).size) favMetadataScheduleReapply0141();
});
