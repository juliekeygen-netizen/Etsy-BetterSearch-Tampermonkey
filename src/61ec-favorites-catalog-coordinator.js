'use strict';

/* v0.15.22 Favorites catalogue fallback coordinator.
 *
 * Web Locks remain the preferred cross-tab owner. The old no-Web-Locks path
 * used localStorage read -> write -> read, which cannot provide an atomic
 * compare-and-set across tabs and does not stop a crawler after token loss.
 *
 * The fallback now coordinates on the existing Favorites IndexedDB `scopes`
 * row for the canonical dataset. Acquisition, renewal, takeover and release are
 * read/merge/write operations inside one `scopes` readwrite transaction. The
 * final immutable snapshot transaction uses that same store and verifies the
 * exact active coordinator generation before it may commit membership.
 *
 * Using the existing scope row needs no IndexedDB schema/version migration, adds
 * no second persistent copy of raw owner/query identity, and closes the
 * suspended-worker gap that would remain if lease and snapshot lived in
 * separate databases.
 */
var favCatalogCoordinatorGuards01522 = new Map();
var favCatalogWithCrossTabLeaseBefore01522 = favCatalogWithCrossTabLease0141;
var favIndexObserveRecordsBefore01522 = favIndexObserveRecords;
var favSnapshotScopeRecordBefore01522 = favSnapshotScopeRecord0156;

function favCatalogLeaseLostError01522() {
    return new DOMException('Favorites catalogue coordinator lease ownership was lost.', 'AbortError');
}

function favCatalogCoordinatorScopeKey01522(scope) {
    return String(scope?.scopeKey || favIndexScopeKey(scope));
}

function favCatalogCoordinatorSnapshotGeneration01522(scopeRecord) {
    if (!scopeRecord) return '';
    if (typeof favSnapshotLegacyGeneration0156 === 'function') {
        return String(favSnapshotLegacyGeneration0156(scopeRecord) || '');
    }
    return String(scopeRecord.snapshotGeneration || '');
}

function favCatalogCoordinatorSeedScope01522(scope, scopeKey) {
    const owner = String(scope?.owner || '').trim();
    if (!owner) throw new Error('Favorites catalogue coordinator requires a profile owner.');
    return {
        scopeKey,
        owner,
        login:String(scope?.login || ''),
        type:String(scope?.type || 'items'),
        id:String(scope?.id || ''),
        query:String(scope?.query || ''),
        listingIds:[],
        complete:false,
        lastSyncState:'idle',
        schemaVersion:FAV_INDEX_METADATA_VERSION,
    };
}

/* Every coordinator decision reads and writes the actual dataset scope row in
 * one IndexedDB readwrite transaction. The same `scopes` store is used by the
 * immutable snapshot transaction, so lease takeover and final commit cannot
 * pass each other without one transaction observing the other's state. */
async function favCatalogCoordinatorMutateScope01522(scope, mutator) {
    const scopeKey = favCatalogCoordinatorScopeKey01522(scope);
    const db = await favIndexOpen();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('scopes', 'readwrite');
        const store = transaction.objectStore('scopes');
        const request = store.get(scopeKey);
        let result = null;
        let failure = null;
        let settled = false;

        function rejectOnce(error) {
            if (settled) return;
            settled = true;
            reject(error || new Error('Favorites catalogue coordinator transaction failed.'));
        }

        request.onsuccess = () => {
            try {
                const current = request.result || null;
                result = mutator(current, scopeKey) || { value:null };
                if (result.row) store.put(result.row);
            } catch (error) {
                failure = error;
                try { transaction.abort(); } catch (_) { rejectOnce(error); }
            }
        };
        request.onerror = () => {
            failure = request.error || new Error('Favorites catalogue coordinator read failed.');
            try { transaction.abort(); } catch (_) { rejectOnce(failure); }
        };
        transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            resolve(result?.value);
        };
        transaction.onerror = () => {
            failure = failure || transaction.error || new Error('Favorites catalogue coordinator transaction failed.');
        };
        transaction.onabort = () => rejectOnce(failure || transaction.error || new Error('Favorites catalogue coordinator transaction aborted.'));
    });
}

async function favCatalogCoordinatorBaseline01522(scope, requestedAt) {
    const stored = await favIndexGetScope(favCatalogCoordinatorScopeKey01522(scope)).catch(() => null);
    const committedAt = Math.max(0, Number(stored?.snapshotCommittedAt) || Number(stored?.lastCompleteSyncAt) || 0);
    return {
        generation:favCatalogCoordinatorSnapshotGeneration01522(stored),
        peerCompleted:Boolean(stored?.complete && committedAt >= requestedAt),
    };
}

function favCatalogCoordinatorPeerCompleted01522(current, requestedAt, baselineGeneration) {
    if (!current?.complete) return false;
    const committedAt = Math.max(0, Number(current.snapshotCommittedAt) || Number(current.lastCompleteSyncAt) || 0);
    const generation = favCatalogCoordinatorSnapshotGeneration01522(current);
    return Boolean(
        committedAt >= requestedAt
        && generation
        && generation !== String(baselineGeneration || '')
    );
}

function favCatalogCoordinatorClaimRow01522(current, scope, scopeKey, token, now) {
    const base = current || favCatalogCoordinatorSeedScope01522(scope, scopeKey);
    return {
        ...base,
        catalogCoordinatorGeneration:token,
        catalogCoordinatorLeaseToken:token,
        catalogCoordinatorWorkerId:favCatalogWorkerId0141,
        catalogCoordinatorLeaseUntil:now + FAV_CATALOG_LEASE_MS0141,
        catalogCoordinatorClaimedAt:now,
        catalogCoordinatorUpdatedAt:now,
    };
}

async function favCatalogAcquireCoordinatorLease01522(scope, requestedAt, signal) {
    const baseline = await favCatalogCoordinatorBaseline01522(scope, requestedAt);
    if (baseline.peerCompleted) {
        return { peerCompleted:true, token:'', baselineGeneration:baseline.generation };
    }

    const token = `${favCatalogWorkerId0141}:${Math.random().toString(36).slice(2)}`;
    for (;;) {
        if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        const now = Date.now();
        const decision = await favCatalogCoordinatorMutateScope01522(scope, (current, scopeKey) => {
            if (favCatalogCoordinatorPeerCompleted01522(current, requestedAt, baseline.generation)) {
                return { value:{ state:'peer-completed' } };
            }
            const liveOther = current
                && Number(current.catalogCoordinatorLeaseUntil) > now
                && current.catalogCoordinatorLeaseToken
                && current.catalogCoordinatorWorkerId !== favCatalogWorkerId0141;
            if (liveOther) return { value:{ state:'blocked' } };
            return {
                row:favCatalogCoordinatorClaimRow01522(current, scope, scopeKey, token, now),
                value:{ state:'acquired' },
            };
        });
        if (decision?.state === 'peer-completed') {
            return { peerCompleted:true, token:'', baselineGeneration:baseline.generation };
        }
        if (decision?.state === 'acquired') {
            return { peerCompleted:false, token, baselineGeneration:baseline.generation };
        }
        await sleep(FAV_CATALOG_LEASE_POLL_MS0141, signal);
    }
}

async function favCatalogRenewCoordinatorLease01522(guard) {
    if (!guard || guard.lost) return false;
    const now = Date.now();
    return favCatalogCoordinatorMutateScope01522(guard.scope, (current) => {
        if (!current || current.catalogCoordinatorLeaseToken !== guard.token) return { value:false };
        return {
            row:{
                ...current,
                catalogCoordinatorLeaseUntil:now + FAV_CATALOG_LEASE_MS0141,
                catalogCoordinatorUpdatedAt:now,
            },
            value:true,
        };
    });
}

async function favCatalogReleaseCoordinatorLease01522(guard) {
    if (!guard?.scope || !guard?.token) return false;
    const now = Date.now();
    return favCatalogCoordinatorMutateScope01522(guard.scope, (current) => {
        if (!current || current.catalogCoordinatorLeaseToken !== guard.token) return { value:false };
        return {
            row:{
                ...current,
                /* Keep catalogCoordinatorGeneration as the durable fencing
                 * generation. A later acquisition replaces it atomically. */
                catalogCoordinatorLeaseToken:'',
                catalogCoordinatorWorkerId:'',
                catalogCoordinatorLeaseUntil:0,
                catalogCoordinatorUpdatedAt:now,
            },
            value:true,
        };
    });
}

function favCatalogMarkCoordinatorLeaseLost01522(guard) {
    if (!guard) return favCatalogLeaseLostError01522();
    if (!guard.error) guard.error = favCatalogLeaseLostError01522();
    guard.lost = true;
    const entry = favCatalogInflight0141.get(guard.datasetKey);
    if (entry?.controller && !entry.controller.signal.aborted) {
        try { entry.controller.abort(guard.error); } catch (_) { try { entry.controller.abort(); } catch (_) {} }
    }
    return guard.error;
}

async function favCatalogAssertCoordinatorLease01522(guard) {
    if (!guard || guard.lost) throw guard?.error || favCatalogLeaseLostError01522();
    const owned = await favCatalogRenewCoordinatorLease01522(guard).catch(() => false);
    if (!owned) throw favCatalogMarkCoordinatorLeaseLost01522(guard);
    return true;
}

/* This wrapper runs synchronously inside 61ea's existing `scopes` readwrite
 * snapshot transaction, after its latest scope row has been read and before it
 * is written. Requiring both the durable generation and the still-live active
 * lease closes the classic lease-expiry/suspended-worker gap: a stale worker
 * cannot wake after takeover and publish a completed snapshot. */
favSnapshotScopeRecord0156 = function favSnapshotScopeRecord01522(
    oldScope, scope, scopeKey, observedIds, observedAt, options, transaction, commitSnapshot,
) {
    const expectedGeneration = String(options?.catalogCoordinatorGeneration || '');
    if (commitSnapshot && expectedGeneration) {
        const leaseUntil = Math.max(0, Number(oldScope?.catalogCoordinatorLeaseUntil) || 0);
        const generationMatches = String(oldScope?.catalogCoordinatorGeneration || '') === expectedGeneration;
        const tokenMatches = String(oldScope?.catalogCoordinatorLeaseToken || '') === expectedGeneration;
        if (!generationMatches || !tokenMatches || leaseUntil <= Date.now()) {
            throw favCatalogLeaseLostError01522();
        }
    }
    return favSnapshotScopeRecordBefore01522(
        oldScope, scope, scopeKey, observedIds, observedAt, options, transaction, commitSnapshot,
    );
};

/* Replace only the no-Web-Locks branch. Calling the previous implementation
 * when Web Locks exist preserves that already-correct fast path verbatim. */
favCatalogWithCrossTabLease0141 = async function favCatalogWithCrossTabLease01522(scope, requestedAt, signal, work) {
    if (globalThis.navigator?.locks?.request) {
        return favCatalogWithCrossTabLeaseBefore01522(scope, requestedAt, signal, work);
    }

    const lease = await favCatalogAcquireCoordinatorLease01522(scope, requestedAt, signal);
    if (lease.peerCompleted) return { peerCompleted:true };

    const datasetKey = favCatalogKey0141(scope);
    const guard = {
        token:lease.token,
        datasetKey,
        scope:{ ...scope },
        scopeKey:favCatalogCoordinatorScopeKey01522(scope),
        baselineGeneration:lease.baselineGeneration,
        lost:false,
        error:null,
    };
    favCatalogCoordinatorGuards01522.set(datasetKey, guard);

    const heartbeatMs = Math.max(1000, Math.floor(FAV_CATALOG_LEASE_MS0141 / 3));
    let heartbeatBusy = false;
    const heartbeat = globalThis.setInterval?.(() => {
        if (heartbeatBusy || guard.lost) return;
        heartbeatBusy = true;
        void favCatalogAssertCoordinatorLease01522(guard)
            .catch(() => {})
            .finally(() => { heartbeatBusy = false; });
    }, heartbeatMs);

    /* 61b's crawler calls touchLease synchronously. Keep that contract: throw
     * immediately once a heartbeat has observed loss, while each page boundary
     * also starts an atomic renewal. The complete snapshot path below awaits a
     * renewal and then revalidates the exact generation inside its own scope
     * transaction. */
    const touchLease = () => {
        if (guard.lost) throw guard.error || favCatalogLeaseLostError01522();
        void favCatalogAssertCoordinatorLease01522(guard).catch(() => {});
        return true;
    };

    try {
        await favCatalogAssertCoordinatorLease01522(guard);
        return await work(touchLease);
    } finally {
        if (heartbeat != null) globalThis.clearInterval?.(heartbeat);
        if (favCatalogCoordinatorGuards01522.get(datasetKey) === guard) {
            favCatalogCoordinatorGuards01522.delete(datasetKey);
        }
        await favCatalogReleaseCoordinatorLease01522(guard).catch(() => false);
    }
};

/* Fence only complete catalogue observations belonging to an active fallback
 * coordinator worker. Partial metadata/observation writes remain untouched.
 * The awaited renewal catches ordinary loss early; catalogCoordinatorGeneration
 * is then checked again synchronously inside 61ea's atomic snapshot transaction. */
favIndexObserveRecords = async function favIndexObserveRecords01522(records, options = {}) {
    if (options.complete === true) {
        const scope = options.scope || favIndexCurrentScope();
        const datasetKey = favCatalogKey0141(scope);
        const guard = favCatalogCoordinatorGuards01522.get(datasetKey);
        if (guard) {
            await favCatalogAssertCoordinatorLease01522(guard);
            return favIndexObserveRecordsBefore01522(records, {
                ...options,
                catalogCoordinatorGeneration:guard.token,
            });
        }
    }
    return favIndexObserveRecordsBefore01522(records, options);
};
