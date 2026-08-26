'use strict';

/* v0.10.4 Phase 5 runtime guard.
 *
 * A second audit found two important lifecycle hazards that syntax/unit checks
 * could not expose on their own:
 *   1. a zero-work automatic deep scan still emitted a completed event, which
 *      could reapply Favorites and schedule another zero-work scan forever;
 *   2. terminally failed jobs were immediately eligible for automatic requeue,
 *      so a persistent Etsy/parser failure could loop indefinitely.
 *
 * This patch also tightens challenge-page detection and keeps user-facing deep
 * scanning terminology distinct from the cheap Favorites "Sync" operation.
 */

var FAV_DEEP_FAILED_REQUEUE_MS0104 = 6 * 60 * 60 * 1000;
var FAV_DEEP_UNAVAILABLE_RETRY_MS0104 = 24 * 60 * 60 * 1000;

function favDeepLooksLikeChallenge0104(html) {
    const text = String(html || '');
    const head = text.slice(0, 250000);
    return /(?:id|class)\s*=\s*["'][^"']*(?:captcha|challenge-container|verification-container)[^"']*["']/i.test(head)
        || /\b(?:g-recaptcha|h-captcha|hcaptcha|px-captcha|cf-chl-)\b/i.test(head)
        || /<title\b[^>]*>[^<]*(?:captcha|verify (?:you are human|your identity)|access denied)[^<]*<\/title>/i.test(head)
        || (/\bdata-sitekey\s*=\s*["'][^"']+["']/i.test(head) && /\bcaptcha\b/i.test(head))
        || /press and hold[^<]{0,160}(?:confirm|prove)[^<]{0,80}human/i.test(head);
}

/* Replace the broad v0.10.3 text check. A normal Etsy listing is allowed to
 * contain words such as "robot check" in its title/description without being
 * mistaken for an anti-bot challenge. */
favDeepFetchListing = async function favDeepFetchListing0104(recordOrUrl, options = {}) {
    const url = typeof recordOrUrl === 'string'
        ? recordOrUrl
        : String(recordOrUrl?.url || recordOrUrl?.listingUrl || '');
    if (!url) throw new Error('Deep metadata fetch requires a listing URL.');

    await favDeepWaitForCooldown0103(options.signal);

    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            signal: options.signal,
            headers: { Accept: 'text/html,application/xhtml+xml' },
        });

        if (!response.ok) {
            const error = new Error(`Listing metadata request failed (${response.status}).`);
            error.httpStatus = response.status;
            error.retryable = ![404, 410].includes(response.status);
            error.retryAfterMs = favRetryAfterMs(response.headers.get('Retry-After'));
            throw error;
        }

        const html = await response.text();
        if (favDeepLooksLikeChallenge0104(html)) {
            const error = new Error('Etsy returned a verification/challenge page; deep scanning paused safely.');
            error.code = 'challenge-page';
            error.retryable = true;
            error.retryAfterMs = 60000;
            throw error;
        }

        const finalUrl = response.url || url;
        const parsed = favDeepParseListingHtml(html, finalUrl, { observedAt: options.observedAt || Date.now() });
        const requestedId = favDeepRequestedListingId0103(url);
        const parsedProductId = favDeepParsedProductListingId0103(parsed);

        if (requestedId && parsedProductId && requestedId !== parsedProductId) {
            const error = new Error(`Deep metadata identity mismatch (${requestedId} != ${parsedProductId}).`);
            error.code = 'listing-identity-mismatch';
            error.retryable = true;
            throw error;
        }
        if (!favDeepObservationHasEvidence0103(parsed)) {
            const error = new Error('Listing page did not expose recognizable metadata; scan result was not cached.');
            error.code = 'empty-listing-metadata';
            error.retryable = true;
            throw error;
        }

        favDeepConsecutiveFailures0103 = 0;
        favDeepCooldownUntil0103 = 0;
        return parsed;
    } catch (error) {
        if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
        if (error?.retryable !== false) {
            favDeepConsecutiveFailures0103 += 1;
            const cooldown = favDeepCooldownMs0103(error);
            if (cooldown > 0) favDeepCooldownUntil0103 = Math.max(favDeepCooldownUntil0103, Date.now() + cooldown);
        }
        throw error;
    }
};

/* ---------- Automatic requeue guard ---------- */

favDeepPopulateQueue = async function favDeepPopulateQueue0104(options = {}) {
    const listings = await favIndexGetActiveListings(String(options.owner || favScope().owner || ''));
    const now = Date.now();
    let added = 0;

    for (const listing of listings) {
        const missingOrigin = listing.shippingOriginParserVersion !== FAV_DEEP_SHIPPING_ORIGIN_VERSION;
        const missing = !Number(listing.lastDeepScanAt)
            || listing.deepParserVersion !== FAV_DEEP_PARSER_VERSION
            || missingOrigin;
        const stale = Number(listing.lastDeepScanAt) > 0 && now - Number(listing.lastDeepScanAt) >= FAV_DEEP_METADATA_STALE_MS;
        if (!options.force && !missing && !stale) continue;

        const listingId = String(listing.listingId || '');
        if (!listingId) continue;
        const jobId = `listing:${listingId}`;
        const existingJob = await favIndexGet(FAV_DEEP_QUEUE_STORE, jobId);
        const activeJob = existingJob?.status === 'queued' || existingJob?.status === 'running';

        /* Never reset an active job underneath the worker, even if Update all
         * is clicked while the scan is already running. */
        if (activeJob) continue;

        if (!options.force && options.retryFailed !== true && existingJob?.status === 'failed') {
            const failedAt = Math.max(Number(existingJob.finishedAt) || 0, Number(existingJob.updatedAt) || 0);
            if (failedAt && now - failedAt < FAV_DEEP_FAILED_REQUEUE_MS0104) continue;
        }

        if (!options.force && options.retryFailed !== true && ['unavailable', 'deleted'].includes(listing.availabilityState)) {
            const unavailableAt = Number(listing.availabilityObservedAt) || 0;
            if (unavailableAt && now - unavailableAt < FAV_DEEP_UNAVAILABLE_RETRY_MS0104) continue;
        }

        const type = options.force ? 'forced_update' : (missing ? 'missing_metadata' : 'refresh_metadata');
        await favDeepQueueEnqueue(listingId, {
            type,
            url:listing.url,
            requeue:options.force === true || options.retryFailed === true,
        });
        added += 1;
    }

    if (added > 0 && favDeepState.status === 'running') {
        const activeJobs = (await favDeepQueueReadAll()).filter((job) => job.status === 'queued' || job.status === 'running');
        const done = Math.max(0, Number(favDeepState.completed) || 0) + Math.max(0, Number(favDeepState.failed) || 0);
        const total = Math.max(Number(favDeepState.total) || 0, done + activeJobs.length);
        if (total !== favDeepState.total) favDeepDispatchState({ status:'running', total });
    }

    return added;
};

/* A no-op scan must be silent. Emitting a terminal event when there was no
 * queued work can create a reapply -> auto-scan -> completed-event loop. */
favDeepStart = async function favDeepStart0104(options = {}) {
    try {
        await favDeepPopulateQueue(options);
        if (favDeepRunnerPromise) return favDeepRunnerPromise;

        /* Recover jobs left running by a browser/tab shutdown before deciding
         * that there is no work. */
        await favDeepQueueRecoverInterrupted();
        const queued = await favDeepQueueList('queued');
        if (!queued.length) {
            return {
                status:'idle',
                completed:0,
                failed:0,
                total:0,
                skipped:true,
            };
        }
        return favDeepRunQueue();
    } catch (error) {
        const detail = {
            status:'completed_with_errors',
            completed:0,
            failed:1,
            total:0,
            error:String(error?.message || error),
        };
        favDeepDispatchState(detail);
        return detail;
    }
};

/* Explicit user actions are allowed to retry recent failures immediately. */
favDeepScanMissing = function favDeepScanMissing0104() {
    favDeepAutoResumeSuppressed0103 = false;
    return favDeepStart({ force:false, retryFailed:true });
};

favDeepUpdateAll = function favDeepUpdateAll0104() {
    favDeepAutoResumeSuppressed0103 = false;
    return favDeepStart({ force:true, retryFailed:true });
};

/* ---------- Production terminology ---------- */

var favDeepProgressModelBefore0104 = favDeepProgressModel;
favDeepProgressModel = function favDeepProgressModel0104(state = favDeepState) {
    const model = favDeepProgressModelBefore0104(state);
    return { ...model, title:'Scanning metadata' };
};

var favRefreshSettingsStatusBefore0104 = favRefreshSettingsStatus;
favRefreshSettingsStatus = async function favRefreshSettingsStatus0104() {
    await favRefreshSettingsStatusBefore0104();
    const node = favState.settingsModal?.querySelector('[data-ebsf-status="deepState"]');
    if (!node) return;
    if (favDeepState.status === 'running') node.textContent = 'Scanning';
    else if (favDeepAutoResumeSuppressed0103) node.textContent = 'Paused';
};
