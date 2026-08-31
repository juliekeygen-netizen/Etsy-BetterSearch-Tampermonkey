'use strict';

/* v0.15.22 Favorites catalogue fallback coordinator.
 *
 * Web Locks remain the preferred cross-tab owner. The old no-Web-Locks path
 * used localStorage read -> write -> read, which cannot provide an atomic
 * compare-and-set across tabs. Replace that fallback with a tiny, separate
 * IndexedDB coordinator database whose readwrite transaction serializes lease
 * acquisition/renewal for one opaque dataset key.
 *
 * The primary Favorites index stays schema/version independent from this
 * coordinator. The coordinator stores no raw owner/query/dataset text.
 * Immutable snapshot generation checks remain the final data-correctness fence;
 * this layer prevents duplicate workers from continuing after lease takeover.
 */
var FAV_CATALOG_COORDINATOR_DB01522 = 'etsy-bettersearch-coordinator';
var FAV_CATALOG_COORDINATOR_VERSION01522 = 1;
var favCatalogCoordinatorDatabasePromise01522 = null;
var favCatalogCoordinatorGuards01522 = new Map();
var favCatalogWithCrossTabLeaseBefore01522 = favCatalogWithCrossTabLease0141;
var favIndexObserveRecordsBefore01522 = favIndexObserveRecords;

function favCatalogLeaseLostError01522() {
    return new DOMException('Favorites catalogue coordinator lease ownership was lost.', 'AbortError');
}

function favCatalogCoordinatorOpen01522() {
    if (favCatalogCoordinatorDatabasePromise01522) return favCatalogCoordinatorDatabasePromise01522;
    favCatalogCoordinatorDatabasePromise01522 = new Promise((resolve, reject) => {
        const request = indexedDB.open(FAV_CATALOG_COORDINATOR_DB01522, FAV_CATALOG_COORDINATOR_VERSION01522);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('leases')) db.createObjectStore('leases', { keyPath:'key' });
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                try { db.close(); } catch (_) {}
                if (favCatalogCoordinatorDatabasePromise01522) favCatalogCoordinatorDatabasePromise01522 = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            favCatalogCoordinatorDatabasePromise01522 = null;
            reject(request.error || new Error('Favorites catalogue coordinator could not open.'));
        };
        request.onblocked = () => {
            favCatalogCoordinatorDatabasePromise01522 = null;
            reject(new Error('Favorites catalogue coordinator upgrade is blocked by another tab.'));
        };
    });
    return favCatalogCoordinatorDatabasePromise01522;
}

async function favCatalogCoordinatorKey01522(scope) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') {
        throw new Error('Favorites catalogue coordinator requires Web Crypto for opaque dataset identity.');
    }
    const canonical = favCatalogKey0141(scope);
    const bytes = new TextEncoder().encode(canonical);
    const digest = await subtle.digest('SHA-256', bytes);
    return `catalog:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/* Every lease decision is made from the row read inside the same IndexedDB
 * readwrite transaction that writes/deletes it. Competing transactions on the
 * leases store serialize across tabs, unlike the retired localStorage sequence. */
async function favCatalogCoordinatorMutate01522(key, mutator) {
    const db = await favCatalogCoordinatorOpen01522();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('leases', 'readwrite');
        const store = transaction.objectStore('leases');
        const request = store.get(key);
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
                result = mutator(request.result || null) || { value:null };
                if (result.delete === true) store.delete(key);
                else if (result.row) store.put(result.row);
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

function favCatalogCoordinatorLeaseRow01522(key, token, now = Date.now()) {
    return {
        key,
        token,
        workerId:favCatalogWorkerId0141,
        leaseUntil:now + FAV_CATALOG_LEASE_MS0141,
        updatedAt:now,
    };
}

async function favCatalogAcquireCoordinatorLease01522(scope, requestedAt, signal) {
    const key = await favCatalogCoordinatorKey01522(scope);
    const token = `${favCatalogWorkerId0141}:${Math.random().toString(36).slice(2)}`;
    for (;;) {
        if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        if (await favCatalogPeerCompleted0141(scope, requestedAt)) return { peerCompleted:true, key, token:'' };
        const now = Date.now();
        const acquired = await favCatalogCoordinatorMutate01522(key, (current) => {
            const liveOther = current
                && Number(current.leaseUntil) > now
                && current.workerId !== favCatalogWorkerId0141;
            if (liveOther) return { value:false };
            return { row:favCatalogCoordinatorLeaseRow01522(key, token, now), value:true };
        });
        if (acquired) return { peerCompleted:false, key, token };
        await sleep(FAV_CATALOG_LEASE_POLL_MS0141, signal);
    }
}

async function favCatalogRenewCoordinatorLease01522(guard) {
    if (!guard || guard.lost) return false;
    const now = Date.now();
    return favCatalogCoordinatorMutate01522(guard.key, (current) => {
        if (current?.token !== guard.token) return { value:false };
        return {
            row:{ ...current, leaseUntil:now + FAV_CATALOG_LEASE_MS0141, updatedAt:now },
            value:true,
        };
    });
}

async function favCatalogReleaseCoordinatorLease01522(guard) {
    if (!guard?.key || !guard?.token) return false;
    return favCatalogCoordinatorMutate01522(guard.key, (current) => current?.token === guard.token
        ? { delete:true, value:true }
        : { value:false });
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
        key:lease.key,
        token:lease.token,
        datasetKey,
        scopeKey:String(scope?.scopeKey || ''),
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
     * immediately once a heartbeat has observed loss, and also start an atomic
     * renewal in the background at page boundaries. The authoritative complete
     * write below gets a separately awaited lease assertion. */
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

/* 61ea is already the final atomic snapshot writer at this load point. Fence
 * only complete catalogue observations belonging to an active coordinator
 * worker. Partial metadata/observation writes remain untouched. This awaited
 * check closes the important final-page -> complete-snapshot gap. If a newer
 * worker commits while an older suspended worker later resumes, 61ea's snapshot
 * generation ordering remains the second/final stale-commit fence. */
favIndexObserveRecords = async function favIndexObserveRecords01522(records, options = {}) {
    if (options.complete === true) {
        const scope = options.scope || favIndexCurrentScope();
        const datasetKey = favCatalogKey0141(scope);
        const guard = favCatalogCoordinatorGuards01522.get(datasetKey);
        if (guard) await favCatalogAssertCoordinatorLease01522(guard);
    }
    return favIndexObserveRecordsBefore01522(records, options);
};
