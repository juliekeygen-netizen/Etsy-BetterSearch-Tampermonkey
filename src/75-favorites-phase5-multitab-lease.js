'use strict';

/* v0.10.6 Phase 5 multi-tab queue hardening.
 *
 * IndexedDB queue claims/recovery are atomic across Etsy tabs and every running
 * job carries a renewable worker lease. v0.10.6 additionally makes completion,
 * cancellation and failure transitions compare-and-set on that lease owner.
 * This closes the stale-worker race where a tab that woke after its lease had
 * expired could overwrite a job already reclaimed by another tab.
 *
 * A listing-page response is also lease-verified before its parsed metadata is
 * handed back to the runner, and an Etsy challenge pauses the automatic worker
 * instead of continuing through the remaining queue.
 */

var FAV_DEEP_LEASE_MS0105 = 90 * 1000;
var FAV_DEEP_HEARTBEAT_MS0105 = 20 * 1000;
var FAV_DEEP_LEGACY_RUNNING_GRACE_MS0105 = 90 * 1000;
var FAV_DEEP_CHALLENGE_PAUSE_MS0106 = 5 * 60 * 1000;
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

function favDeepOwnershipSnapshot0106(idValue) {
    const ownership = favDeepCurrentOwnership0105;
    if (!ownership?.id || String(ownership.id) !== String(idValue)) return null;
    return { id:String(ownership.id), workerId:String(ownership.workerId || '') };
}

function favDeepLeaseLostError0106() {
    const error = new Error('Deep metadata job lease was lost to another Etsy tab.');
    error.code = 'deep-lease-lost';
    error.retryable = false;
    return error;
}

/* Any state transition performed by a worker that currently owns a running job
 * is compare-and-set in one readwrite transaction. A stale tab may observe the
 * newer job, but it is never allowed to mutate it. */
async function favDeepOwnedTransition0106(idValue, updater) {
    const ownership = favDeepOwnershipSnapshot0106(idValue);
    if (!ownership) return { owned:false, applied:false, current:null };

    const next = await favDeepQueueMutateOne0105(idValue, (job) => {
        if (job.status !== 'running' || job.workerId !== ownership.workerId) return null;
        const updated = updater({ ...job });
        if (!updated) return null;
        const result = { ...updated, updatedAt:Date.now() };
        if (result.status !== 'running') {
            result.workerId = '';
            result.leaseUntil = 0;
        }
        return result;
    });

    if (!next) {
        const current = await favIndexGet(FAV_DEEP_QUEUE_STORE, String(idValue)).catch(() => null);
        if (favDeepCurrentOwnership0105?.id === String(idValue)) favDeepCurrentOwnership0105 = null;
        return { owned:true, applied:false, current };
    }

    if (next.status !== 'running' && favDeepCurrentOwnership0105?.id === String(idValue)) {
        favDeepCurrentOwnership0105 = null;
    }
    return { owned:true, applied:true, current:next };
}

/* Generic queue updates remain available for settings/recovery code, but a
 * worker-owned transition out of running state must use the lease CAS above. */
var favDeepQueueUpdateBefore0106 = favDeepQueueUpdate;
favDeepQueueUpdate = async function favDeepQueueUpdate0106(idValue, patch = {}) {
    const ownership = favDeepOwnershipSnapshot0106(idValue);
    if (!ownership || !patch.status || patch.status === 'running') {
        return favDeepQueueUpdateBefore0106(idValue, patch);
    }

    const transition = await favDeepOwnedTransition0106(idValue, (job) => ({
        ...job,
        ...patch,
    }));
    return transition.current;
};

/* Completion must report a lost lease as an error to the runner. Otherwise the
 * runner would increment its local completed count even though this tab did not
 * actually complete the queue row. */
var favDeepQueueCompleteBefore0106 = favDeepQueueComplete;
favDeepQueueComplete = async function favDeepQueueComplete0106(idValue, now = Date.now()) {
    const ownership = favDeepOwnershipSnapshot0106(idValue);
    if (!ownership) return favDeepQueueCompleteBefore0106(idValue, now);

    const transition = await favDeepOwnedTransition0106(idValue, (job) => ({
        ...job,
        status:'completed',
        finishedAt:now,
        error:'',
        nextAttemptAt:0,
    }));
    if (!transition.applied) throw favDeepLeaseLostError0106();
    return transition.current;
};

/* Failure/retry is also an owned CAS. In particular, a stale tab cannot clear a
 * newer worker's lease after its own request wakes up late. */
var favDeepQueueFailBefore0106 = favDeepQueueFail;
favDeepQueueFail = async function favDeepQueueFail0106(idValue, error, now = Date.now()) {
    if (error?.code === 'deep-lease-lost') {
        if (favDeepCurrentOwnership0105?.id === String(idValue)) favDeepCurrentOwnership0105 = null;
        return favIndexGet(FAV_DEEP_QUEUE_STORE, String(idValue)).catch(() => null);
    }

    const ownership = favDeepOwnershipSnapshot0106(idValue);
    if (!ownership) return favDeepQueueFailBefore0106(idValue, error, now);

    const retryable = error?.retryable !== false;
    const retryAfterMs = Math.max(0, Number(error?.retryAfterMs) || 0);
    const challenge = error?.code === 'challenge-page';

    const transition = await favDeepOwnedTransition0106(idValue, (job) => {
        const attempts = Math.max(0, Number(job.attempts) || 0);
        const retry = retryable && attempts < FAV_DEEP_QUEUE_RETRY_LIMIT;
        const backoff = Math.min(30000, 1000 * (2 ** Math.max(0, attempts - 1)));
        const challengePause = challenge ? FAV_DEEP_CHALLENGE_PAUSE_MS0106 : 0;
        return {
            ...job,
            status:retry ? 'queued' : 'failed',
            finishedAt:retry ? 0 : now,
            error:String(error?.message || error || 'Unknown metadata scan error'),
            nextAttemptAt:retry ? now + Math.max(backoff, retryAfterMs, challengePause) : 0,
        };
    });

    if (!transition.applied) return transition.current;

    if (transition.current?.listingId && [404, 410].includes(Number(error?.httpStatus))) {
        await favDeepMarkAvailability0103(
            transition.current.listingId,
            Number(error.httpStatus) === 410 ? 'deleted' : 'unavailable',
            now
        );
    }

    if (challenge) {
        /* Do not keep walking the catalogue after Etsy presents a verification
         * page. This is a safety pause, not an evasion/retry acceleration. */
        favDeepAutoResumeSuppressed0103 = true;
        favDeepRunnerController?.abort();
    }

    return transition.current;
};

/* Heartbeat the lease while the network request is in flight, then perform one
 * final compare-and-renew before returning parsed metadata to the runner. This
 * prevents a stale response from being written after another tab reclaimed the
 * job during a long event-loop stall. */
var favDeepFetchListingBefore0106 = favDeepFetchListing;
favDeepFetchListing = async function favDeepFetchListing0106(recordOrUrl, options = {}) {
    const ownership = favDeepCurrentOwnership0105 ? { ...favDeepCurrentOwnership0105 } : null;
    let heartbeat = 0;
    let heartbeatPending = false;
    let heartbeatLost = false;

    if (ownership) {
        const ownsLease = await favDeepQueueRenewLease0105(ownership).catch(() => false);
        if (!ownsLease) throw favDeepLeaseLostError0106();

        heartbeat = setInterval(() => {
            if (heartbeatPending) return;
            heartbeatPending = true;
            void favDeepQueueRenewLease0105(ownership)
                .then((renewed) => { if (!renewed) heartbeatLost = true; })
                .catch(() => { heartbeatLost = true; })
                .finally(() => { heartbeatPending = false; });
        }, FAV_DEEP_HEARTBEAT_MS0105);
    }

    try {
        const parsed = await favDeepFetchListingBefore0106(recordOrUrl, options);
        if (ownership) {
            const renewed = !heartbeatLost
                && await favDeepQueueRenewLease0105(ownership).catch(() => false);
            if (!renewed) throw favDeepLeaseLostError0106();
        }
        return parsed;
    } finally {
        if (heartbeat) clearInterval(heartbeat);
    }
};

/* Direct unfavorites retain their cached metadata, but queued deep work for the
 * no-longer-favorite listing is retired so it is not fetched pointlessly later.
 * A currently running job is left alone; at most that one in-flight request
 * finishes, and it never re-favorites the index record. */
function favDeepRetireQueuedUnfavorite0106(listingId, now = Date.now()) {
    const idValue = String(listingId || '');
    if (!idValue) return Promise.resolve(false);
    return favDeepQueueMutateOne0105(`listing:${idValue}`, (job) => {
        if (job.status !== 'queued') return null;
        return {
            ...job,
            status:'completed',
            finishedAt:now,
            error:'Skipped: listing is no longer favorited',
            nextAttemptAt:0,
            workerId:'',
            leaseUntil:0,
            updatedAt:now,
        };
    }).then(Boolean);
}

var favIndexMarkUnfavoriteBefore0106 = favIndexMarkUnfavorite;
favIndexMarkUnfavorite = async function favIndexMarkUnfavorite0106(listingId, observedAt = Date.now()) {
    const changed = await favIndexMarkUnfavoriteBefore0106(listingId, observedAt);
    if (changed) await favDeepRetireQueuedUnfavorite0106(listingId, observedAt).catch(() => {});
    return changed;
};
