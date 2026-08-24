'use strict';

/* Persistent browser-compatible deep metadata queue and single-worker scanner. */
var FAV_DEEP_QUEUE_STORE = 'deepScanQueue';
var FAV_DEEP_QUEUE_RETRY_LIMIT = 3;
var FAV_DEEP_QUEUE_REQUEST_DELAY_MS = 900;
var FAV_DEEP_METADATA_STALE_MS = 30 * 24 * 60 * 60 * 1000;
var FAV_DEEP_JOB_TYPES = ['missing_metadata', 'refresh_metadata', 'forced_update'];
var favDeepQueueWriteChain = Promise.resolve();
var favDeepRunnerPromise = null;
var favDeepRunnerController = null;
var favDeepState = { status:'idle', completed:0, failed:0, total:0 };

function favDeepQueueSerialize(operation) {
    const result = favDeepQueueWriteChain.then(operation);
    favDeepQueueWriteChain = result.catch(() => {});
    return result;
}

function favDeepQueuePriority(type = 'missing_metadata') {
    return ({ forced_update:1, missing_metadata:2, refresh_metadata:3 })[type] || 3;
}

function favDeepQueueNormalizeType(type) {
    return FAV_DEEP_JOB_TYPES.includes(type) ? type : 'missing_metadata';
}

function favDeepQueueJob(listingId, options = {}, now = Date.now()) {
    const listingIdValue = String(listingId || '');
    const type = favDeepQueueNormalizeType(options.type || options.reason);
    return {
        id: `listing:${listingIdValue}`,
        listingId: listingIdValue,
        type,
        priority: Number(options.priority) || favDeepQueuePriority(type),
        status: 'queued',
        attempts: 0,
        createdAt: now,
        startedAt: 0,
        finishedAt: 0,
        error: '',
        url: String(options.url || ''),
        updatedAt: now,
        nextAttemptAt: 0,
    };
}

function favDeepQueueMergeJob(existing, incoming, options = {}) {
    if (!existing) return incoming;
    const forceRequeue = options.requeue === true || incoming.type === 'forced_update';
    const active = existing.status === 'queued' || existing.status === 'running';
    return {
        ...existing,
        type: incoming.priority < existing.priority ? incoming.type : existing.type,
        priority: Math.min(existing.priority, incoming.priority),
        url: incoming.url || existing.url || '',
        status: active && !forceRequeue ? existing.status : 'queued',
        attempts: forceRequeue || ['completed', 'failed'].includes(existing.status) ? 0 : existing.attempts,
        startedAt: forceRequeue ? 0 : existing.startedAt,
        finishedAt: forceRequeue ? 0 : existing.finishedAt,
        error: forceRequeue || existing.status === 'failed' ? '' : existing.error,
        nextAttemptAt: forceRequeue ? 0 : (existing.nextAttemptAt || 0),
        updatedAt: incoming.updatedAt,
    };
}

async function favDeepQueueReadAll() {
    const db = await favIndexOpen();
    return favIndexRequest(db.transaction(FAV_DEEP_QUEUE_STORE, 'readonly').objectStore(FAV_DEEP_QUEUE_STORE).getAll());
}

function favDeepQueueEnqueue(listingId, options = {}) {
    return favDeepQueueSerialize(async () => {
        const incoming = favDeepQueueJob(listingId, options);
        if (!incoming.listingId) throw new Error('Deep metadata job requires a listing ID.');
        const db = await favIndexOpen();
        const oldStore = db.transaction(FAV_DEEP_QUEUE_STORE, 'readonly').objectStore(FAV_DEEP_QUEUE_STORE);
        const merged = favDeepQueueMergeJob(await favIndexRequest(oldStore.get(incoming.id)), incoming, options);
        await favIndexWrite([FAV_DEEP_QUEUE_STORE], (transaction) => transaction.objectStore(FAV_DEEP_QUEUE_STORE).put(merged));
        return merged;
    });
}

function favDeepQueueAdd(listingId, options = {}) { return favDeepQueueEnqueue(listingId, options); }

async function favDeepQueueList(status) {
    const jobs = await favDeepQueueReadAll();
    return jobs.filter((job) => !status || job.status === status)
        .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}

function favDeepQueueUpdate(idValue, patch) {
    return favDeepQueueSerialize(async () => {
        const db = await favIndexOpen();
        const oldStore = db.transaction(FAV_DEEP_QUEUE_STORE, 'readonly').objectStore(FAV_DEEP_QUEUE_STORE);
        const job = await favIndexRequest(oldStore.get(String(idValue)));
        if (!job) return null;
        const next = { ...job, ...patch, updatedAt:Date.now() };
        await favIndexWrite([FAV_DEEP_QUEUE_STORE], (transaction) => transaction.objectStore(FAV_DEEP_QUEUE_STORE).put(next));
        return next;
    });
}

function favDeepQueueClaimNext(now = Date.now()) {
    return favDeepQueueSerialize(async () => {
        const jobs = await favDeepQueueReadAll();
        const job = jobs.filter((entry) => entry.status === 'queued' && (Number(entry.nextAttemptAt) || 0) <= now)
            .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0];
        if (!job) return null;
        const claimed = { ...job, status:'running', attempts:(Number(job.attempts) || 0) + 1, startedAt:now, finishedAt:0, error:'', updatedAt:now };
        await favIndexWrite([FAV_DEEP_QUEUE_STORE], (transaction) => transaction.objectStore(FAV_DEEP_QUEUE_STORE).put(claimed));
        return claimed;
    });
}

function favDeepQueueComplete(idValue, now = Date.now()) {
    return favDeepQueueUpdate(idValue, { status:'completed', finishedAt:now, error:'', nextAttemptAt:0 });
}

function favDeepQueueFail(idValue, error, now = Date.now()) {
    return favDeepQueueSerialize(async () => {
        const db = await favIndexOpen();
        const oldStore = db.transaction(FAV_DEEP_QUEUE_STORE, 'readonly').objectStore(FAV_DEEP_QUEUE_STORE);
        const job = await favIndexRequest(oldStore.get(String(idValue)));
        if (!job) return null;
        const retry = (Number(job.attempts) || 0) < FAV_DEEP_QUEUE_RETRY_LIMIT;
        const next = {
            ...job,
            status: retry ? 'queued' : 'failed',
            finishedAt: retry ? 0 : now,
            error: String(error?.message || error || 'Unknown metadata scan error'),
            nextAttemptAt: retry ? now + Math.min(30000, 1000 * (2 ** Math.max(0, job.attempts - 1))) : 0,
            updatedAt: now,
        };
        await favIndexWrite([FAV_DEEP_QUEUE_STORE], (transaction) => transaction.objectStore(FAV_DEEP_QUEUE_STORE).put(next));
        return next;
    });
}

function favDeepQueueRecoverInterrupted(now = Date.now()) {
    return favDeepQueueSerialize(async () => {
        const interrupted = (await favDeepQueueReadAll()).filter((job) => job.status === 'running');
        if (!interrupted.length) return 0;
        await favIndexWrite([FAV_DEEP_QUEUE_STORE], (transaction) => {
            const store = transaction.objectStore(FAV_DEEP_QUEUE_STORE);
            for (const job of interrupted) store.put({ ...job, status:'queued', startedAt:0, error:'Interrupted by page/browser restart', nextAttemptAt:0, updatedAt:now });
        });
        return interrupted.length;
    });
}

function favDeepDispatchState(detail) {
    favDeepState = { ...favDeepState, ...detail };
    document.dispatchEvent(new CustomEvent('ebsf:favorites-deep-state', { detail:{ ...favDeepState } }));
}

function favDeepProgressModel(state = {}) {
    const completed = Math.max(0, Number(state.completed) || 0);
    const total = Math.max(0, Number(state.total) || 0);
    return { title:'Syncing', detail:total ? `${completed}/${total}` : '', ratio:total ? Math.min(1, completed / total) : 0 };
}

async function favDeepPopulateQueue(options = {}) {
    const listings = await favIndexGetActiveListings(String(options.owner || favScope().owner || ''));
    const now = Date.now();
    let added = 0;
    for (const listing of listings) {
        const missing = !Number(listing.lastDeepScanAt) || listing.deepParserVersion !== FAV_DEEP_PARSER_VERSION;
        const stale = Number(listing.lastDeepScanAt) > 0 && now - Number(listing.lastDeepScanAt) >= FAV_DEEP_METADATA_STALE_MS;
        if (!options.force && !missing && !stale) continue;
        const type = options.force ? 'forced_update' : (missing ? 'missing_metadata' : 'refresh_metadata');
        await favDeepQueueEnqueue(listing.listingId, { type, url:listing.url, requeue:options.force === true });
        added += 1;
    }
    return added;
}

async function favDeepRunQueue() {
    if (favDeepRunnerPromise) return favDeepRunnerPromise;
    const controller = new AbortController();
    favDeepRunnerController = controller;
    const promise = (async () => {
        await favDeepQueueRecoverInterrupted();
        const total = (await favDeepQueueList('queued')).length;
        let completed = 0;
        let failed = 0;
        if (total) favDeepDispatchState({ status:'running', completed, failed, total });
        while (!controller.signal.aborted) {
            const job = await favDeepQueueClaimNext();
            if (!job) {
                const waiting = (await favDeepQueueList('queued')).filter((entry) => Number(entry.nextAttemptAt) > Date.now());
                if (!waiting.length) break;
                const nextAt = Math.min(...waiting.map((entry) => Number(entry.nextAttemptAt)));
                await sleep(Math.min(1000, Math.max(25, nextAt - Date.now())), controller.signal);
                continue;
            }
            try {
                const listing = await favIndexGet('listings', job.listingId);
                const url = job.url || listing?.url || new URL(`/listing/${encodeURIComponent(job.listingId)}`, location.origin).href;
                const parsed = await favDeepFetchListing(url, { signal:controller.signal });
                const updated = await favIndexApplyDeepListingObservation(job.listingId, parsed);
                await favDeepQueueComplete(job.id);
                completed += 1;
                const live = favState?.recordsById?.get?.(job.listingId);
                if (live) favIndexApplyListingMetadataToRecord(live, updated);
            } catch (error) {
                if (error?.name === 'AbortError' || controller.signal.aborted) break;
                if ((await favDeepQueueFail(job.id, error))?.status === 'failed') failed += 1;
            }
            favDeepDispatchState({ status:'running', completed, failed, total });
            await sleep(FAV_DEEP_QUEUE_REQUEST_DELAY_MS, controller.signal);
        }
        const status = controller.signal.aborted ? 'cancelled' : (failed ? 'completed_with_errors' : 'completed');
        favDeepDispatchState({ status, completed, failed, total });
        return { status, completed, failed, total };
    })();
    const guarded = promise.catch((error) => {
        const detail = { status:'completed_with_errors', completed:0, failed:1, total:0, error:String(error?.message || error) };
        favDeepDispatchState(detail);
        return detail;
    });
    favDeepRunnerPromise = guarded.finally(() => { favDeepRunnerPromise = null; favDeepRunnerController = null; });
    return favDeepRunnerPromise;
}

async function favDeepStart(options = {}) {
    try {
        await favDeepPopulateQueue(options);
        return favDeepRunQueue();
    } catch (error) {
        const detail = { status:'completed_with_errors', completed:0, failed:1, total:0, error:String(error?.message || error) };
        favDeepDispatchState(detail);
        return detail;
    }
}

function favDeepScanMissing() { return favDeepStart({ force:false }); }
function favDeepUpdateAll() { return favDeepStart({ force:true }); }

async function favDeepMaybeAutoScan() {
    if (!favCfg.autoScanMissingMetadata || !isFavoritesPage() || !favIsOwnFavoritesPage()) return false;
    void favDeepStart({ force:false });
    return true;
}
