'use strict';

/* v0.15.24 final destination-sensitive metadata generation boundary.
 *
 * The catalogue/dataset key is structural Favorites identity; it does not
 * identify the buyer destination used by Etsy's additional-listing-info API.
 * A request started for destination A must therefore never mutate, persist or
 * authorize rendering after the live destination has advanced to B, even when
 * the Favorites dataset itself did not change. Indexed destination-sensitive
 * fields are likewise usable only for the destination that produced them.
 *
 * This module intentionally loads after the final render transaction (105), so
 * it can close the complete async/hydration/render boundary in one place while
 * leaving destination-independent metadata and deep scans unchanged.
 */
var FAV_METADATA_CONTEXT_STALE_MESSAGE01524 = 'Stale Favorites metadata context';
favState.metadataContextIdentity01524 = String(favState.metadataContextIdentity01524 || '');
favState.metadataContextGeneration01524 = Math.max(0, Number(favState.metadataContextGeneration01524) || 0);

function favMetadataDestinationSensitiveRequirements01524(requirements) {
    const values = requirements instanceof Set ? requirements : new Set(requirements || []);
    return values.has('shipping') || values.has('freeShippingFallback');
}

function favMetadataContextSnapshot01524() {
    const datasetKey = String(favDatasetKey());
    const destination = favMetadataDestination0141();
    const contextKey = String(destination?.contextKey || '');
    const identity = `${datasetKey}\u0000${contextKey}`;
    if (favState.metadataContextIdentity01524 !== identity) {
        favState.metadataContextIdentity01524 = identity;
        favState.metadataContextGeneration01524 += 1;
    }
    return {
        datasetKey,
        destination:{
            country:String(destination?.country || ''),
            postal:String(destination?.postal || ''),
            contextKey,
        },
        contextKey,
        identity,
        generation:favState.metadataContextGeneration01524,
    };
}

function favMetadataContextSnapshotCurrent01524(snapshot) {
    if (!snapshot) return false;
    const current = favMetadataContextSnapshot01524();
    return current.identity === snapshot.identity
        && current.generation === snapshot.generation;
}

function favMetadataStaleContextError01524() {
    return new DOMException(FAV_METADATA_CONTEXT_STALE_MESSAGE01524, 'AbortError');
}

function favMetadataIsStaleContextError01524(error) {
    return error?.name === 'AbortError'
        && String(error?.message || '') === FAV_METADATA_CONTEXT_STALE_MESSAGE01524;
}

function favMetadataAssertOperationCurrent01524(operation) {
    if (!isFavoritesPage() || String(favDatasetKey()) !== String(operation?.datasetKey || '')) {
        throw favMetadataStaleContextError01524();
    }
    if (operation?.destinationSensitive === true
        && !favMetadataContextSnapshotCurrent01524(operation.contextSnapshot)) {
        throw favMetadataStaleContextError01524();
    }
    return true;
}

function favMetadataIndexedFieldCurrent01524(field, contextKey = favMetadataContextSnapshot01524().contextKey) {
    if (field?.known !== true) return true;
    return String(field.contextKey || '') === String(contextKey || '');
}

function favMetadataMaskWrongDestinationFields01524(listing, contextKey) {
    const shipping = listing?.shippingMetadata;
    if (!shipping || typeof shipping !== 'object') return listing;
    const costCurrent = favMetadataIndexedFieldCurrent01524(shipping.cost, contextKey);
    const deliveryCurrent = favMetadataIndexedFieldCurrent01524(shipping.estimatedDelivery, contextKey);
    if (costCurrent && deliveryCurrent) return listing;
    return {
        ...listing,
        shippingMetadata:{
            ...shipping,
            ...(!costCurrent ? { cost:{ ...(shipping.cost || {}), known:false } } : {}),
            ...(!deliveryCurrent ? { estimatedDelivery:{ ...(shipping.estimatedDelivery || {}), known:false } } : {}),
        },
    };
}

function favMetadataRestoreOrClearNumber01524(record, property, knownKey, beforeValue, beforeKnown, beforeMeta, contextKey) {
    const priorContextCurrent = !beforeMeta || String(beforeMeta.contextKey || '') === String(contextKey || '');
    if (priorContextCurrent && beforeKnown === true && Number.isFinite(Number(beforeValue))) {
        record[property] = Number(beforeValue);
        record.known = record.known || {};
        record.known[knownKey] = true;
        return;
    }
    record[property] = Number.NaN;
    record.known = record.known || {};
    record.known[knownKey] = false;
}

function favMetadataRestoreOrClearText01524(record, property, knownKey, beforeValue, beforeKnown, beforeMeta, contextKey) {
    const priorContextCurrent = !beforeMeta || String(beforeMeta.contextKey || '') === String(contextKey || '');
    if (priorContextCurrent && beforeKnown === true && String(beforeValue || '')) {
        record[property] = String(beforeValue);
        record.known = record.known || {};
        record.known[knownKey] = true;
        return;
    }
    record[property] = '';
    record.known = record.known || {};
    record.known[knownKey] = false;
}

/* Module 71 hydrates shippingMetadata.cost/estimatedDelivery into raw record
 * fields. Mask wrong-context indexed fields before that historical wrapper sees
 * them, then restore an already-current live/card value if one existed. */
var favIndexApplyListingMetadataToRecordBefore01524 = favIndexApplyListingMetadataToRecord;
favIndexApplyListingMetadataToRecord = function favIndexApplyListingMetadataToRecord01524(record, listing) {
    if (!record || !listing) return favIndexApplyListingMetadataToRecordBefore01524(record, listing);
    const contextKey = favMetadataContextSnapshot01524().contextKey;
    const shipping = listing.shippingMetadata || {};
    const costCurrent = favMetadataIndexedFieldCurrent01524(shipping.cost, contextKey);
    const deliveryCurrent = favMetadataIndexedFieldCurrent01524(shipping.estimatedDelivery, contextKey);
    const beforeShipping = record.shipping;
    const beforeShippingKnown = record?.known?.shipping === true;
    const beforeShippingMeta = favMetadataMeta0141(record, 'shipping');
    const beforeDelivery = record.estimatedDelivery;
    const beforeDeliveryKnown = record?.known?.estimatedDelivery === true;
    const beforeDeliveryMeta = favMetadataMeta0141(record, 'estimatedDelivery');
    const safeListing = favMetadataMaskWrongDestinationFields01524(listing, contextKey);
    const next = favIndexApplyListingMetadataToRecordBefore01524(record, safeListing);
    if (!next) return next;
    if (!costCurrent) {
        favMetadataRestoreOrClearNumber01524(
            next, 'shipping', 'shipping', beforeShipping, beforeShippingKnown,
            beforeShippingMeta, contextKey,
        );
    }
    if (!deliveryCurrent) {
        favMetadataRestoreOrClearText01524(
            next, 'estimatedDelivery', 'estimatedDelivery', beforeDelivery,
            beforeDeliveryKnown, beforeDeliveryMeta, contextKey,
        );
    }
    return next;
};

/* Cache-only records are initially constructed directly from indexed fields
 * before the dynamic hydration hook runs. When there is no live Etsy listing
 * backing the record, explicitly clear a mismatched cached destination value. */
var favCacheRecordFromIndexedBefore01524 = favCacheRecordFromIndexed0137;
favCacheRecordFromIndexed0137 = function favCacheRecordFromIndexed01524(indexed, shop, liveListing, liveNode, order) {
    const record = favCacheRecordFromIndexedBefore01524(indexed, shop, liveListing, liveNode, order);
    if (!record || liveListing) return record;
    const contextKey = favMetadataContextSnapshot01524().contextKey;
    const shipping = indexed?.shippingMetadata || {};
    if (!favMetadataIndexedFieldCurrent01524(shipping.cost, contextKey)) {
        record.shipping = Number.NaN;
        record.known = record.known || {};
        record.known.shipping = false;
    }
    if (!favMetadataIndexedFieldCurrent01524(shipping.estimatedDelivery, contextKey)) {
        record.estimatedDelivery = '';
        record.known = record.known || {};
        record.known.estimatedDelivery = false;
    }
    return record;
};

/* Replace the auxiliary request owner with the same batching/persistence flow,
 * but bind each operation to the exact dataset + destination generation. */
favMetadataFetchAux0141 = async function favMetadataFetchAux01524(requirements, options = {}) {
    if (!requirements.size || !favState.records.length) return { requested:0, unresolved:0 };
    const destinationSensitive = favMetadataDestinationSensitiveRequirements01524(requirements);
    const contextSnapshot = destinationSensitive
        ? (options.metadataContextSnapshot01524 || favMetadataContextSnapshot01524())
        : favMetadataContextSnapshot01524();
    const datasetKey = String(favDatasetKey());
    const destination = destinationSensitive
        ? contextSnapshot.destination
        : favMetadataDestination0141();
    const scope = favIndexCurrentScope();
    const requestKey = [
        datasetKey,
        String(destination?.contextKey || ''),
        destinationSensitive ? `g:${contextSnapshot.generation}` : 'g:independent',
        Array.from(requirements).sort().join(','),
    ].join('|');
    if (favMetadataInflight0141.has(requestKey)) return favMetadataInflight0141.get(requestKey);

    const operation = { datasetKey, destinationSensitive, contextSnapshot };
    const promise = (async () => {
        favMetadataAssertOperationCurrent01524(operation);
        const ordered = favMetadataPriorityRecords0141();
        const needed = ordered.filter((record) => favMetadataAuxRequestNeeded0141(record, requirements));
        if (!needed.length) return { requested:0, unresolved:0 };
        const controller = new AbortController();
        let requested = 0;
        for (let index = 0; index < needed.length; index += 30) {
            favMetadataAssertOperationCurrent01524(operation);
            const batch = needed.slice(index, index + 30);
            const url = new URL('/api/v3/ajax/bespoke/member/users/favorites/additional-listing-info', location.origin);
            batch.forEach((record) => url.searchParams.append('listing_ids[]', record.id));
            if (destination?.country) url.searchParams.set('country_iso_code', destination.country);
            url.searchParams.set('postal_code', String(destination?.postal || ''));
            const data = await favFetchJson(url, controller.signal);
            favMetadataAssertOperationCurrent01524(operation);
            const observedAt = Date.now();
            for (const record of batch) {
                favMetadataApplyAux0141(record, data?.map?.[record.id] || null, requirements, observedAt, destination);
            }
            requested += batch.length;
            favMetadataAssertOperationCurrent01524(operation);
            await favIndexObserveRecords(batch, { scope, complete:false, syncState:'metadata' });
            favMetadataAssertOperationCurrent01524(operation);
        }
        const unresolved = favState.records.reduce((count, record) => count
            + Array.from(requirements).filter((capability) => !favMetadataFieldState0141(record, capability).known).length, 0);
        return { requested, unresolved };
    })();
    const wrapped = promise.finally(() => favMetadataInflight0141.delete(requestKey));
    favMetadataInflight0141.set(requestKey, wrapped);
    return wrapped;
};

/* Ensure/coverage uses the same generation token as the fetch. A superseded
 * reapply is cancelled instead of reaching the historical render branch. */
favMetadataEnsureCurrentRequirements0141 = async function favMetadataEnsureCurrentRequirements01524(options = {}) {
    if (!isFavoritesPage()) return { complete:true, pending:0, unresolved:0, capabilities:[] };
    const datasetKey = String(favDatasetKey());
    const requirements = options.requirements instanceof Set ? options.requirements : favMetadataRequirements0141();
    const auxRequirements = options.deepOnly ? new Set() : favMetadataAuxRequirements0141(requirements);
    const deepRequirements = favMetadataDeepRequirements0141(requirements);
    const destinationSensitive = favMetadataDestinationSensitiveRequirements01524(auxRequirements);
    const contextSnapshot = destinationSensitive ? favMetadataContextSnapshot01524() : null;
    const operation = { datasetKey, destinationSensitive, contextSnapshot };
    let auxResult = { requested:0, unresolved:0 };
    let deepResult = { queued:0, unresolved:0 };
    if (auxRequirements.size) {
        auxResult = await favMetadataFetchAux0141(auxRequirements, {
            ...options,
            metadataContextSnapshot01524:contextSnapshot,
        });
    }
    favMetadataAssertOperationCurrent01524(operation);
    if (deepRequirements.size) deepResult = await favMetadataQueueDeep0141(deepRequirements);
    favMetadataAssertOperationCurrent01524(operation);
    const coverage = favMetadataCoverage0141(requirements, auxResult, deepResult);
    coverage.destinationSensitive01524 = destinationSensitive;
    coverage.metadataContextKey01524 = destinationSensitive ? contextSnapshot.contextKey : '';
    coverage.metadataContextGeneration01524 = destinationSensitive ? contextSnapshot.generation : 0;
    return coverage;
};

/* Keep the final v0.15.12 atomic renderer from accepting coverage produced for
 * another destination. Calling the snapshot helper here also advances the
 * monotonic generation immediately when the render observes a context change. */
var favMetadataCoverageCurrentBefore01524 = favMetadataCoverageCurrent01512;
favMetadataCoverageCurrent01512 = function favMetadataCoverageCurrent01524() {
    if (!favMetadataCoverageCurrentBefore01524()) return false;
    const requirements = favMetadataRequirements0141(favCfg);
    if (!favMetadataDestinationSensitiveRequirements01524(requirements)) return true;
    const coverage = favState.metadataCoverage0141 || {};
    const current = favMetadataContextSnapshot01524();
    return coverage.destinationSensitive01524 === true
        && String(coverage.metadataContextKey01524 || '') === current.contextKey
        && Number(coverage.metadataContextGeneration01524) === current.generation;
};

/* Superseded async metadata work is an expected cancellation, not a user-facing
 * failure. Swallow only the exact v0.15.24 stale-context AbortError. */
var favReapplyBefore01524 = favReapply;
favReapply = async function favReapply01524(...args) {
    try {
        return await favReapplyBefore01524(...args);
    } catch (error) {
        if (favMetadataIsStaleContextError01524(error)) return false;
        throw error;
    }
};

favEnsureExtraInfo = function favEnsureExtraInfo01524() {
    return favMetadataEnsureCurrentRequirements0141()
        .then((coverage) => coverage.complete)
        .catch((error) => {
            if (favMetadataIsStaleContextError01524(error)) return false;
            throw error;
        });
};
