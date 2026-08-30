'use strict';

/* v0.15.6/v0.15.9 immutable Favorites catalogue snapshots.
 *
 * Before this boundary, every partial crawler page rewrote scope.listingIds and
 * inherited oldScope.complete=true. Cache bootstrap could therefore observe a
 * scope that still advertised itself as complete while its committed membership
 * was being mutated by an in-progress refresh.
 *
 * Keep two explicit lanes instead:
 *   committed: listingIds + snapshotGeneration + lastCompleteSyncAt
 *   pending:   pendingListingIds + pendingGeneration + pendingStartedAt
 *
 * Listing/shop metadata can still be refreshed incrementally, but only a
 * verified complete observation may atomically replace committed membership.
 *
 * v0.15.9 additionally keeps the read/merge/write observation inside one
 * IndexedDB readwrite transaction. The previous v0.15.6 implementation read in
 * a readonly transaction, computed in JavaScript, then opened a later write
 * transaction. Two tabs could therefore interleave around that gap and let a
 * stale observation overwrite a newer committed generation. IndexedDB serializes
 * overlapping readwrite transactions, so reading the latest state from the same
 * transaction that writes it closes that cross-tab stale-write window.
 */
var FAV_SCOPE_SNAPSHOT_SEMANTICS_VERSION0156 = 2;

function favSnapshotIds0156(values) {
    return Array.from(new Set(Array.from(values || [], String).filter(Boolean)));
}

function favSnapshotLegacyGeneration0156(scope) {
    const explicit = String(scope?.snapshotGeneration || '');
    if (explicit) return explicit;
    const committedAt = Math.max(0, Number(scope?.snapshotCommittedAt) || Number(scope?.lastCompleteSyncAt) || 0);
    return scope?.complete === true && committedAt
        ? `legacy:${String(scope.scopeKey || '')}:${committedAt}`
        : '';
}

function favSnapshotExpectedTotal0156(scope) {
    try {
        if (typeof favCatalogStates0141 === 'undefined' || typeof favCatalogKey0141 !== 'function') return 0;
        return Math.max(0, Number(favCatalogStates0141.get(favCatalogKey0141(scope))?.expectedTotal) || 0);
    } catch (_) {
        return 0;
    }
}

function favSnapshotTransaction0156(oldScope, scopeKey, options, observedAt, complete) {
    const state = String(options.syncState || '');
    const explicitGeneration = String(options.snapshotGeneration || '');
    const explicitStartedAt = Math.max(0, Number(options.snapshotStartedAt) || 0);
    const oldPendingGeneration = String(oldScope?.pendingGeneration || '');
    const oldPendingStartedAt = Math.max(0, Number(oldScope?.pendingStartedAt) || 0);

    if (explicitGeneration) {
        return {
            transactional:true,
            generation:explicitGeneration,
            startedAt:explicitStartedAt || observedAt,
        };
    }

    const transactional = complete || state === 'running' || state === 'partial';
    if (!transactional) return { transactional:false, generation:'', startedAt:0 };

    /* A completed crawl follows the pending generation it built page by page.
     * Running pages reuse only another running generation. A new run after a
     * failed/partial state starts a fresh generation instead of appending to the
     * abandoned pending membership. */
    if (oldPendingGeneration && (complete || state === 'partial' || (state === 'running' && oldScope?.lastSyncState === 'running'))) {
        return {
            transactional:true,
            generation:oldPendingGeneration,
            startedAt:oldPendingStartedAt || observedAt,
        };
    }

    const startedAt = explicitStartedAt || observedAt;
    return {
        transactional:true,
        generation:`${scopeKey}@${startedAt}`,
        startedAt,
    };
}

function favSnapshotScopeRecord0156(oldScope, scope, scopeKey, observedIds, observedAt, options, transaction, commitSnapshot) {
    const oldComplete = oldScope?.complete === true;
    const committedIds = oldComplete ? favSnapshotIds0156(oldScope?.listingIds) : [];
    const committedAt = Math.max(0, Number(oldScope?.snapshotCommittedAt) || Number(oldScope?.lastCompleteSyncAt) || 0);
    const oldGeneration = favSnapshotLegacyGeneration0156(oldScope);
    const syncState = String(options.syncState || '');

    if (commitSnapshot) {
        return {
            ...(oldScope || {}),
            ...scope,
            scopeKey,
            listingIds:favSnapshotIds0156(observedIds),
            complete:true,
            snapshotSemanticsVersion:FAV_SCOPE_SNAPSHOT_SEMANTICS_VERSION0156,
            snapshotGeneration:transaction.generation || `${scopeKey}@${transaction.startedAt || observedAt}`,
            snapshotStartedAt:transaction.startedAt || observedAt,
            snapshotCommittedAt:observedAt,
            committedTotal:favSnapshotIds0156(observedIds).length,
            pendingListingIds:[],
            pendingGeneration:'',
            pendingStartedAt:0,
            pendingObservedAt:0,
            pendingTotal:0,
            lastObservedAt:Math.max(Math.max(0, Number(oldScope?.lastObservedAt) || 0), observedAt),
            lastCompleteSyncAt:observedAt,
            lastSyncState:'completed',
            schemaVersion:FAV_INDEX_METADATA_VERSION,
        };
    }

    let pendingIds = favSnapshotIds0156(oldScope?.pendingListingIds);
    let pendingGeneration = String(oldScope?.pendingGeneration || '');
    let pendingStartedAt = Math.max(0, Number(oldScope?.pendingStartedAt) || 0);
    let pendingObservedAt = Math.max(0, Number(oldScope?.pendingObservedAt) || 0);

    const pendingIsNotOlderThanCommit = !committedAt || transaction.startedAt >= committedAt;
    if (transaction.transactional && pendingIsNotOlderThanCommit) {
        if (pendingGeneration !== transaction.generation) pendingIds = [];
        pendingGeneration = transaction.generation;
        pendingStartedAt = transaction.startedAt || observedAt;
        pendingObservedAt = Math.max(pendingObservedAt, observedAt);
        pendingIds = favSnapshotIds0156([...pendingIds, ...observedIds]);
    }

    return {
        ...(oldScope || {}),
        ...scope,
        scopeKey,
        /* This is the core invariant: partial observations never edit the
         * committed membership list. */
        listingIds:committedIds,
        complete:oldComplete,
        snapshotSemanticsVersion:FAV_SCOPE_SNAPSHOT_SEMANTICS_VERSION0156,
        snapshotGeneration:oldGeneration,
        snapshotStartedAt:Math.max(0, Number(oldScope?.snapshotStartedAt) || committedAt),
        snapshotCommittedAt:committedAt,
        committedTotal:committedIds.length,
        pendingListingIds:pendingIds,
        pendingGeneration,
        pendingStartedAt,
        pendingObservedAt,
        pendingTotal:pendingIds.length,
        lastObservedAt:Math.max(Math.max(0, Number(oldScope?.lastObservedAt) || 0), observedAt),
        lastCompleteSyncAt:Math.max(0, Number(oldScope?.lastCompleteSyncAt) || 0),
        lastSyncState:syncState || oldScope?.lastSyncState || 'partial',
        schemaVersion:FAV_INDEX_METADATA_VERSION,
    };
}

function favSnapshotRequestGroup0159(requests, complete) {
    if (!requests.length) {
        complete([]);
        return;
    }
    const values = new Array(requests.length);
    let remaining = requests.length;
    requests.forEach((request, index) => {
        request.onsuccess = () => {
            values[index] = request.result;
            remaining -= 1;
            if (!remaining) complete(values);
        };
    });
}

/* Read, merge and persist through one readwrite transaction. Because every
 * observation touches the same scopes store (and listing/shop stores as needed),
 * IndexedDB serializes competing transactions across tabs before these reads are
 * allowed to run. The state used to build scopeRecord is therefore the latest
 * state owned by this transaction, never a stale snapshot captured before a
 * newer tab's commit. */
async function favSnapshotObserveAtomic0159(patches, scope, scopeKey, observedAt, options, completeRequested) {
    const expectedTotal = completeRequested ? favSnapshotExpectedTotal0156(scope) : 0;
    const observedIds = patches.map((patch) => patch.listingId);
    const db = await favIndexOpen();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readwrite');
        const listingStore = transaction.objectStore('listings');
        const shopStore = transaction.objectStore('shops');
        const scopeStore = transaction.objectStore('scopes');
        const shopIds = Array.from(new Set(patches.map((patch) => patch.shop?.shopId).filter(Boolean)));
        const listingRequests = completeRequested
            ? [listingStore.getAll()]
            : patches.map((patch) => listingStore.get(patch.listingId));
        const shopRequests = shopIds.map((shopId) => shopStore.get(shopId));
        const scopeRequest = scopeStore.get(scopeKey);
        let listingRows = [];
        let shopRows = [];
        let oldScope;
        let readGroupsRemaining = 3;
        let mergedResult = [];
        let failure = null;
        let settled = false;

        function rejectOnce(error) {
            if (settled) return;
            settled = true;
            reject(error || new Error('Favorites snapshot transaction failed.'));
        }

        transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            resolve(mergedResult);
        };
        transaction.onerror = () => {
            failure = failure || transaction.error || new Error('Favorites snapshot transaction failed.');
        };
        transaction.onabort = () => rejectOnce(failure || transaction.error || new Error('Favorites snapshot transaction aborted.'));

        function abortWith(error) {
            failure = error instanceof Error ? error : new Error(String(error || 'Favorites snapshot transaction failed.'));
            try { transaction.abort(); }
            catch (_) { rejectOnce(failure); }
        }

        function finalizeReads() {
            if (--readGroupsRemaining) return;
            try {
                const transactionState = favSnapshotTransaction0156(oldScope, scopeKey, options, observedAt, completeRequested);
                const oldCommittedAt = Math.max(0, Number(oldScope?.snapshotCommittedAt) || Number(oldScope?.lastCompleteSyncAt) || 0);
                const staleComplete = completeRequested
                    && oldCommittedAt > 0
                    && transactionState.startedAt > 0
                    && transactionState.startedAt < oldCommittedAt;

                if (completeRequested && !staleComplete && expectedTotal > 0 && observedIds.length !== expectedTotal) {
                    throw new Error(`Favorites complete snapshot count mismatch (${observedIds.length} crawled, ${expectedTotal} expected).`);
                }

                const commitSnapshot = completeRequested && !staleComplete;
                const flattenedListings = completeRequested ? (listingRows[0] || []) : listingRows;
                const existingById = new Map(flattenedListings.filter(Boolean).map((listing) => [String(listing.listingId), listing]));
                const merged = patches.map((patch) => favIndexMergeListing(existingById.get(patch.listingId), patch, observedAt));
                const shops = new Map();
                for (const patch of patches) if (patch.shop) shops.set(patch.shop.shopId, patch.shop);
                const existingShops = new Map(shopIds.map((shopId, index) => [shopId, shopRows[index]]));
                const mergedShops = Array.from(shops.values(), (patch) => favIndexMergeShop(existingShops.get(patch.shopId), patch));

                const observedSet = new Set(observedIds);
                let absentUpdates = [];
                if (commitSnapshot && oldScope?.complete === true && oldScope?.listingIds?.length) {
                    const absent = oldScope.listingIds
                        .map(String)
                        .filter((idValue) => !observedSet.has(idValue))
                        .map((idValue) => existingById.get(idValue))
                        .filter(Boolean);
                    absentUpdates = favIndexApplyScopeCompletion(absent, { ...scope, scopeKey }, observedSet, observedAt);
                }

                const scopeRecord = favSnapshotScopeRecord0156(
                    oldScope, scope, scopeKey, observedIds, observedAt, options, transactionState, commitSnapshot,
                );

                for (const listing of [...merged, ...absentUpdates]) listingStore.put(listing);
                for (const shop of mergedShops) shopStore.put(shop);
                scopeStore.put(scopeRecord);
                mergedResult = merged;
            } catch (error) {
                abortWith(error);
            }
        }

        favSnapshotRequestGroup0159(listingRequests, (values) => {
            listingRows = values;
            finalizeReads();
        });
        favSnapshotRequestGroup0159(shopRequests, (values) => {
            shopRows = values;
            finalizeReads();
        });
        scopeRequest.onsuccess = () => {
            oldScope = scopeRequest.result;
            finalizeReads();
        };
    });
}

/* Supersede the v0.15.3 owner-guarded writer at the persistence boundary while
 * preserving the same owner requirement. v0.15.9 keeps the complete observation
 * atomic rather than splitting the read and write transactions. */
var favIndexObserveRecordsNowBefore0156 = favIndexObserveRecordsNow;
favIndexObserveRecordsNow = async function favIndexObserveRecordsNow0156(records, options = {}) {
    const observedAt = Number(options.observedAt) || Date.now();
    const rawScope = options.scope || favIndexCurrentScope();
    const owner = typeof favScopeOwner0153 === 'function'
        ? favScopeOwner0153(rawScope)
        : String(rawScope?.owner || '').trim();
    if (!owner) return [];
    const scope = { ...rawScope, owner };
    const scopeKey = scope.scopeKey || favIndexScopeKey(scope);
    const patchMap = new Map();
    for (const record of records || []) {
        const patch = favIndexPatchFromRecord(record, { ...scope, scopeKey }, observedAt);
        if (patch.listingId) patchMap.set(patch.listingId, patch);
    }
    const patches = Array.from(patchMap.values());
    return favSnapshotObserveAtomic0159(patches, scope, scopeKey, observedAt, options, options.complete === true);
};

/* Cache compatibility: legacy scopes that say complete while also recording an
 * in-progress/partial sync were created under mutable v1 semantics and cannot
 * be proven immutable. Refuse those once, forcing a safe network refresh.
 * Stable legacy completed scopes remain usable and are annotated in-memory. */
var favCacheReadScopeBefore0156 = favCacheReadScope0137;
favCacheReadScope0137 = async function favCacheReadScope0156(scope = favIndexCurrentScope()) {
    const snapshot = await favCacheReadScopeBefore0156(scope);
    if (!snapshot) return null;
    const record = snapshot.scopeRecord || {};
    const semantics = Number(record.snapshotSemanticsVersion) || 0;
    if (semantics < FAV_SCOPE_SNAPSHOT_SEMANTICS_VERSION0156 && ['running', 'partial'].includes(String(record.lastSyncState || ''))) {
        return null;
    }
    if (!record.snapshotGeneration && record.complete === true) {
        snapshot.scopeRecord = {
            ...record,
            snapshotGeneration:favSnapshotLegacyGeneration0156(record),
            snapshotCommittedAt:Math.max(0, Number(record.lastCompleteSyncAt) || 0),
            committedTotal:favSnapshotIds0156(record.listingIds).length,
        };
    }
    return snapshot;
};

function favCaptureCommittedLiveSnapshot0156(scope) {
    const key = favCatalogKey0141(scope);
    if (!favCatalogIsCurrent0141(scope) || favState.loadKey !== key || favState.loadComplete !== true || !Array.isArray(favState.records)) return null;
    return {
        key,
        records:favState.records,
        recordsById:favState.recordsById,
        total:favState.total,
        loadSource:favState.loadSource0137,
        loadComplete:true,
        groupQueryResolved:favState.groupQueryResolved,
        extraReady:favState.extraReady,
        extraKey:favState.extraKey,
        cacheScope:favState.cacheScope0137,
        cachePresentationReady:favState.cachePresentationReady0137,
    };
}

function favRestoreCommittedLiveSnapshot0156(snapshot) {
    if (!snapshot || !isFavoritesPage() || favDatasetKey() !== snapshot.key) return false;
    favState.records = snapshot.records;
    favState.recordsById = snapshot.recordsById;
    favState.total = snapshot.total;
    favState.loadKey = snapshot.key;
    favState.loadComplete = true;
    favState.loadSource0137 = snapshot.loadSource;
    favState.groupQueryResolved = snapshot.groupQueryResolved;
    favState.extraReady = snapshot.extraReady;
    favState.extraKey = snapshot.extraKey;
    favState.cacheScope0137 = snapshot.cacheScope;
    favState.cachePresentationReady0137 = snapshot.cachePresentationReady;
    return true;
}

/* The crawler already keeps partial records off the live grid until completion,
 * but it previously flipped loadComplete=false as soon as refresh began and did
 * the same again on cancellation/error. Preserve the prior committed live
 * snapshot as authoritative while background/forced replacement is prepared. */
var favCatalogRefreshBefore0156 = favCatalogRefresh;
favCatalogRefresh = function favCatalogRefresh0156(scopeInput, options = {}) {
    const scope = favCatalogDescriptor0141(scopeInput, scopeInput?.query || '');
    const committed = favCaptureCommittedLiveSnapshot0156(scope);
    const refreshStartedAt = Date.now();
    const refreshGeneration = `${scope.scopeKey}@${refreshStartedAt}`;
    let promise;
    try {
        promise = favCatalogRefreshBefore0156(scopeInput, options);
    } catch (error) {
        favRestoreCommittedLiveSnapshot0156(committed);
        throw error;
    }

    if (committed) {
        /* The underlying refresh marks the dataset incomplete synchronously.
         * Restore the old committed snapshot immediately; loading=true and the
         * controller still describe the refresh in progress. */
        favRestoreCommittedLiveSnapshot0156(committed);
    }
    if (favCatalogIsCurrent0141(scope)) {
        favState.catalogRefreshGeneration0156 = refreshGeneration;
        favState.catalogRefreshStartedAt0156 = refreshStartedAt;
    }

    return Promise.resolve(promise).then((records) => {
        /* A cancellation resolves with current records in the historical
         * service. If it left the dataset marked incomplete, restore the prior
         * committed snapshot instead of converting a failed refresh into a
         * destructive live-state transition. */
        if (committed && favCatalogIsCurrent0141(scope) && favState.loadComplete !== true) {
            favRestoreCommittedLiveSnapshot0156(committed);
            return committed.records;
        }
        if (favCatalogIsCurrent0141(scope) && favState.loadComplete === true) {
            favState.catalogCommittedGeneration0156 = String(favState.cacheScope0137?.snapshotGeneration || refreshGeneration);
        }
        return records;
    }, (error) => {
        favRestoreCommittedLiveSnapshot0156(committed);
        throw error;
    }).finally(() => {
        if (favState.catalogRefreshGeneration0156 === refreshGeneration) {
            favState.catalogRefreshGeneration0156 = '';
            favState.catalogRefreshStartedAt0156 = 0;
        }
    });
};
