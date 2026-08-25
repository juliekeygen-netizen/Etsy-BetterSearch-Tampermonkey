'use strict';

/* v0.11.0 durable deep-metadata queue resume across Etsy pages.
 *
 * The queue itself already lives in IndexedDB and v0.10.6 gives every running
 * row an atomic worker lease. This layer removes the Favorites-page lifecycle
 * restriction: an existing queue may be processed from any etsy.com page.
 * A manual Cancel is intentionally durable and is not cleared by navigation or
 * a browser restart; explicit Scan/Update actions clear it again.
 */

var FAV_DEEP_MANUAL_PAUSE_KEY0110 = 'etsy-bettersearch.favorites.deep-manual-pause.v1';
var FAV_DEEP_ENDED_WORKER_PREFIX0110 = 'etsy-bettersearch.deep-worker-ended.';
var favDeepResumeTimer0110 = 0;

function favDeepPauseStored0110() {
    return GM_getValue(FAV_DEEP_MANUAL_PAUSE_KEY0110, false) === true;
}

function favPersistDeepPause0110(paused) {
    favDeepAutoResumeSuppressed0103 = paused === true;
    GM_setValue(FAV_DEEP_MANUAL_PAUSE_KEY0110, favDeepAutoResumeSuppressed0103);
}

favDeepAutoResumeSuppressed0103 = favDeepPauseStored0110();

var favDeepCancelBefore0110 = favDeepCancel;
favDeepCancel = function favDeepCancel0110(reason = 'user') {
    /* Persist the user's intent even when this particular tab is not the lease
     * owner. Other Etsy workers read the shared flag before their next claim. */
    if (reason === 'user') favPersistDeepPause0110(true);
    return favDeepCancelBefore0110(reason);
};

var favDeepScanMissingBefore0110 = favDeepScanMissing;
favDeepScanMissing = function favDeepScanMissing0110() {
    favPersistDeepPause0110(false);
    return favDeepScanMissingBefore0110();
};

var favDeepUpdateAllBefore0110 = favDeepUpdateAll;
favDeepUpdateAll = function favDeepUpdateAll0110() {
    favPersistDeepPause0110(false);
    return favDeepUpdateAllBefore0110();
};

var favDeepQueueFailBefore0110 = favDeepQueueFail;
favDeepQueueFail = async function favDeepQueueFail0110(idValue, error, now = Date.now()) {
    /* Verification/challenge pages are a safety pause, never something to push
     * through automatically. A user may explicitly restart later. */
    if (error?.code === 'challenge-page') favPersistDeepPause0110(true);
    return favDeepQueueFailBefore0110(idValue, error, now);
};

/* A worker in another Etsy tab should also respect a Cancel made here. The
 * current in-flight request may finish, but no further queue row is claimed. */
var favDeepQueueClaimNextBefore0110 = favDeepQueueClaimNext;
favDeepQueueClaimNext = function favDeepQueueClaimNext0110(now = Date.now()) {
    if (favDeepPauseStored0110()) {
        favDeepAutoResumeSuppressed0103 = true;
        return Promise.resolve(null);
    }
    return favDeepQueueClaimNextBefore0110(now);
};

function favMarkDeepWorkerEnded0110() {
    const ownership = favDeepCurrentOwnership0105;
    if (!ownership?.workerId) return;
    try {
        localStorage.setItem(`${FAV_DEEP_ENDED_WORKER_PREFIX0110}${ownership.workerId}`, String(Date.now()));
    } catch (_) {}
}

window.addEventListener('pagehide', favMarkDeepWorkerEnded0110, { capture:true });

async function favDeepRecoverEndedWorkers0110(now = Date.now()) {
    if (typeof favDeepQueueReadwriteAll0105 !== 'function') return 0;
    const ended = new Set();
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index) || '';
            if (!key.startsWith(FAV_DEEP_ENDED_WORKER_PREFIX0110)) continue;
            const workerId = key.slice(FAV_DEEP_ENDED_WORKER_PREFIX0110.length);
            const markedAt = Number(localStorage.getItem(key)) || 0;
            if (!workerId || !markedAt || now - markedAt > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(key);
                continue;
            }
            ended.add(workerId);
        }
    } catch (_) {}
    if (!ended.size) return 0;

    const recovered = await favDeepQueueReadwriteAll0105((jobs, store) => {
        let count = 0;
        for (const job of jobs) {
            if (job.status !== 'running' || !ended.has(String(job.workerId || ''))) continue;
            store.put({
                ...job,
                status:'queued',
                attempts:Math.max(0, (Number(job.attempts) || 1) - 1),
                startedAt:0,
                finishedAt:0,
                error:'Recovered after Etsy page navigation',
                nextAttemptAt:0,
                workerId:'',
                leaseUntil:0,
                updatedAt:now,
            });
            count += 1;
        }
        return count;
    });

    if (recovered) {
        try {
            for (const workerId of ended) localStorage.removeItem(`${FAV_DEEP_ENDED_WORKER_PREFIX0110}${workerId}`);
        } catch (_) {}
    }
    return recovered;
}

function favScheduleDeepResume0110(delay) {
    clearTimeout(favDeepResumeTimer0110);
    const wait = Math.max(100, Math.min(5 * 60 * 1000, Number(delay) || 1000));
    favDeepResumeTimer0110 = setTimeout(() => { void favDeepResumeExistingQueue0110(); }, wait);
}

async function favDeepResumeExistingQueue0110() {
    if (favDeepPauseStored0110() || favCfg.autoScanMissingMetadata === false) {
        favDeepAutoResumeSuppressed0103 = favDeepPauseStored0110();
        return false;
    }
    if (!/^https:\/\/www\.etsy\.com\//i.test(location.href)) return false;

    try {
        await favDeepRecoverEndedWorkers0110();
        await favDeepQueueRecoverInterrupted();
        const queued = await favDeepQueueList('queued');
        if (queued.length) {
            void favDeepRunQueue();
            return true;
        }

        /* If a previous document vanished without pagehide, its lease is still
         * the authoritative guard. Recheck as soon as that lease can expire so
         * opening Etsy again eventually resumes without requiring Favorites. */
        const all = await favDeepQueueReadAll();
        const running = all.filter((job) => job.status === 'running');
        if (running.length) {
            const now = Date.now();
            const nextLease = Math.min(...running.map((job) => Number(job.leaseUntil) || (now + FAV_DEEP_LEGACY_RUNNING_GRACE_MS0105)));
            favScheduleDeepResume0110(Math.max(250, nextLease - now + 150));
        }
        return false;
    } catch (_) {
        favScheduleDeepResume0110(3000);
        return false;
    }
}

var favDeepMaybeAutoScanBefore0110 = favDeepMaybeAutoScan;
favDeepMaybeAutoScan = async function favDeepMaybeAutoScan0110() {
    if (favDeepPauseStored0110() || favCfg.autoScanMissingMetadata === false) return false;
    /* Favorites remains the discovery point that can add newly found/missing
     * listings to the durable queue. Everywhere else only resumes known work. */
    if (isFavoritesPage() && favIsOwnFavoritesPage()) return favDeepMaybeAutoScanBefore0110();
    return favDeepResumeExistingQueue0110();
};

/* `@match https://www.etsy.com/*` means this executes on listing/shop/cart/etc.
 * Closing every Etsy tab naturally pauses work. Opening any Etsy page later
 * resumes the saved queue. The progress replacement remains Favorites-only. */
setTimeout(() => { void favDeepResumeExistingQueue0110(); }, 0);
window.addEventListener('pageshow', () => { void favDeepResumeExistingQueue0110(); });
