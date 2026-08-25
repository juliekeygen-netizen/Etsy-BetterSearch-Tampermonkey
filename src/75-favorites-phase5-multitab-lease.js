'use strict';

/* v0.10.5 Phase 5 multi-tab queue hardening.
 *
 * IndexedDB persists across tabs, but the original recovery/claim path was only
 * serialized inside one JavaScript realm. Two Etsy tabs could therefore both
 * observe the same queued/running job: a newly opened tab could "recover" work
 * that another live tab was still processing, or two tabs could claim the same
 * queued listing before either write became visible.
 *
 * Claims and stale-job recovery now happen in one readwrite IDB transaction.
 * Running jobs carry a renewable lease so another live tab does not treat them
 * as interrupted. Legacy running jobs without a lease are recovered only after
 * a short grace period.
 */

var FAV_DEEP_LEASE_MS0105 = 90 * 1000;
var FAV_DEEP_HEARTBEAT_MS0105 = 20 * 1000;
var FAV_DEEP_LEGACY_RUNNING_GRACE_MS0105 = 90 * 1000;
var favDeepWorkerId0105 = globalThis.crypto?.randomUUID?.()
    || `ebsf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
var favDeepCurrentOwnership0105 = null;

function favDeepQueueReadwriteAll0105(mutator) {
    return favDeepQueueSerialize(async () => {
        const db = await favIndexOpen();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(FAV_DEEP_QUEUE_STORE, 'readwrite');
            const store = transaction.objectStore(FAV_DEEP_QUEUE_STORE);
            const request = store.getAll();
            let result = null;
            let thrown = null;

            request.onsuccess = () => {
                try {
                    result = mutator(Array.from(request.result || []), store);
                } catch (error) {
                    thrown = error;
                    try { transaction.abort(); } catch (_) {}
                }
            };
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(thrown || transaction.error || request.error || new Error('Deep queue transaction failed.'));
            transaction.onabort = () => reject(thrown || transaction.error || new Error('Deep queue transaction aborted.'));
        });
    });
}

function favDeepQueueMutateOne0105(idValue, mutator) {
    return favDeepQueueSerialize(async () => {
        const db = await favIndexOpen();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(FAV_DEEP_QUEUE_STORE, 'readwrite');
            const store = transaction.objectStore(FAV_DEEP_QUEUE_STORE);
            const request = store.get(String(idValue));
            let result = null;
            let thrown = null;

            request.onsuccess = () => {
                try {
                    const current = request.result;
                    if (!current) return;
                    result = mutator(current);
                    if (result) store.put(result);
                } catch (error) {
                    thrown = error;
                    try { transaction.abort(); } catch (_) {}
                }
            };
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(thrown || transaction.error || request.error || new Error('Deep queue update failed.'));
            transaction.onabort = () => reject(thrown || transaction.error || new Error('Deep queue update aborted.'));
        });
    });
}

/* One readwrite transaction is the claim lock. IndexedDB serializes conflicting
 * readwrite transactions on this object store across same-origin tabs, so the
 * second tab sees the first tab's committed running state before choosing. */
favDeepQueueClaimNext = async function favDeepQueueClaimNext0105(now = Date.now()) {
    const claimed = await favDeepQueueReadwriteAll0105((jobs, store) => {
        const job = jobs
            .filter((entry) => entry.status === 'queued' && (Number(entry.nextAttemptAt) || 0) <= now)
            .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0];
        if (!job) return null;

        const next = {
            ...job,
            status:'running',
            attempts:(Number(job.attempts) || 0) + 1,
            startedAt:now,
            finishedAt:0,
            error:'',
            workerId:favDeepWorkerId0105,
            leaseUntil:now + FAV_DEEP_LEASE_MS0105,
            updatedAt:now,
        };
        store.put(next);
        return next;
    });

    favDeepCurrentOwnership0105 = claimed
        ? { id:String(claimed.id), workerId:favDeepWorkerId0105 }
        : null;
    return claimed;
};

/* Only expired leases are interrupted. This prevents a second Favorites tab
 * from stealing/restarting the listing currently fetched by a live first tab. */
favDeepQueueRecoverInterrupted = function favDeepQueueRecoverInterrupted0105(now = Date.now()) {
    return favDeepQueueReadwriteAll0105((jobs, store) => {
        let recovered = 0;
        for (const job of jobs) {
            if (job.status !== 'running') continue;

            const leaseUntil = Number(job.leaseUntil) || 0;
            if (leaseUntil > now) continue;

            if (!leaseUntil) {
                const lastTouch = Math.max(Number(job.updatedAt) || 0, Number(job.startedAt) || 0);
                if (lastTouch && now - lastTouch < FAV_DEEP_LEGACY_RUNNING_GRACE_MS0105) continue;
            }

            store.put({
                ...job,
                status:'queued',
                attempts:Math.max(0, (Number(job.attempts) || 1) - 1),
                startedAt:0,
                finishedAt:0,
                error:'Recovered expired/interrupted metadata scan',
                nextAttemptAt:0,
                workerId:'',
                leaseUntil:0,
                updatedAt:now,
            });
            recovered += 1;
        }
        return recovered;
    });
};

function favDeepQueueRenewLease0105(ownership = favDeepCurrentOwnership0105, now = Date.now()) {
    if (!ownership?.id) return Promise.resolve(false);
    return favDeepQueueMutateOne0105(ownership.id, (job) => {
        if (job.status !== 'running' || job.workerId !== ownership.workerId) return null;
        return {
            ...job,
            leaseUntil:now + FAV_DEEP_LEASE_MS0105,
            updatedAt:now,
        };
    }).then(Boolean);
}

/* Clear ownership metadata whenever the generic queue updater transitions the
 * current job out of running state (complete, cancellation requeue, etc.). */
var favDeepQueueUpdateBefore0105 = favDeepQueueUpdate;
favDeepQueueUpdate = async function favDeepQueueUpdate0105(idValue, patch = {}) {
    const nextPatch = { ...patch };
    if (nextPatch.status && nextPatch.status !== 'running') {
        nextPatch.workerId = '';
        nextPatch.leaseUntil = 0;
    }
    const result = await favDeepQueueUpdateBefore0105(idValue, nextPatch);
    if (result?.status !== 'running' && favDeepCurrentOwnership0105?.id === String(idValue)) {
        favDeepCurrentOwnership0105 = null;
    }
    return result;
};

/* The failure implementation writes its first state transition directly, so do
 * one ownership cleanup after it settles as well. */
var favDeepQueueFailBefore0105 = favDeepQueueFail;
favDeepQueueFail = async function favDeepQueueFail0105(idValue, error, now = Date.now()) {
    let result = await favDeepQueueFailBefore0105(idValue, error, now);
    if (result && result.status !== 'running' && (result.workerId || Number(result.leaseUntil))) {
        result = await favDeepQueueMutateOne0105(idValue, (job) => ({ ...job, workerId:'', leaseUntil:0, updatedAt:Date.now() })) || result;
    }
    if (favDeepCurrentOwnership0105?.id === String(idValue)) favDeepCurrentOwnership0105 = null;
    return result;
};

/* Renew the lease while the network request is in flight. A stalled event loop
 * can still let a lease expire, but ordinary long/slow Etsy responses remain
 * protected without introducing an always-running background timer. */
var favDeepFetchListingBefore0105 = favDeepFetchListing;
favDeepFetchListing = async function favDeepFetchListing0105(recordOrUrl, options = {}) {
    const ownership = favDeepCurrentOwnership0105 ? { ...favDeepCurrentOwnership0105 } : null;
    let heartbeat = 0;

    if (ownership) {
        void favDeepQueueRenewLease0105(ownership).catch(() => {});
        heartbeat = setInterval(() => {
            void favDeepQueueRenewLease0105(ownership).catch(() => {});
        }, FAV_DEEP_HEARTBEAT_MS0105);
    }

    try {
        return await favDeepFetchListingBefore0105(recordOrUrl, options);
    } finally {
        if (heartbeat) clearInterval(heartbeat);
    }
};
