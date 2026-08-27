'use strict';

/* v0.10.3 Phase 5 hardening.
 *
 * Audit fixes for the persistent deep scanner:
 *  - parse JSON-LD raw first so entity text inside valid JSON cannot corrupt it;
 *  - reject empty/challenge/mismatched listing pages instead of caching them as a
 *    successful deep scan;
 *  - treat 404/410 as terminal listing availability observations;
 *  - honor Retry-After and add a small circuit-breaker after repeated Etsy/network
 *    failures;
 *  - make cancellation real, restart-safe, and non-self-restarting;
 *  - keep queue totals monotonic when more Favorites are discovered mid-run.
 */

/* Parser behavior changed enough that records scanned by the previous parser
 * need one refresh. The rest of the index still keeps per-field provenance. */
FAV_DEEP_PARSER_VERSION = 'listing-html-v3';

/* ---------- JSON-LD parsing ---------- */

favDeepJsonLdNodes = function favDeepJsonLdNodes0103(html) {
    const nodes = [];
    const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = re.exec(String(html || '')))) {
        const raw = String(match[1] || '').trim();
        if (!raw) continue;

        let parsed;
        try {
            /* Important: valid JSON may legitimately contain text such as
             * &quot;. Decoding the whole JSON string before JSON.parse can turn
             * that text into an unescaped quote and make valid JSON invalid. */
            parsed = JSON.parse(raw);
        } catch (_) {
            /* Keep a compatibility fallback for genuinely HTML-escaped script
             * payloads, but only after raw JSON parsing has failed. */
            const decoded = favDeepDecodeText(raw).trim();
            if (!decoded || decoded === raw) continue;
            try { parsed = JSON.parse(decoded); } catch (_) { continue; }
        }
        favDeepFlattenJson(parsed, nodes);
    }
    return nodes;
};

function favDeepObservationHasEvidence0103(parsed) {
    if (parsed?.completeSignals?.productJsonLd || parsed?.completeSignals?.offerJsonLd) return true;
    const groups = [parsed?.cardMetadata, parsed?.listingMetadata, parsed?.shippingMetadata, parsed?.shopMetadata];
    return groups.some((group) => Object.values(group || {}).some((field) => field?.known === true));
}

function favDeepRequestedListingId0103(url) {
    return String(url || '').match(/\/listing\/(\d+)/i)?.[1] || '';
}

function favDeepParsedProductListingId0103(parsed) {
    return String(parsed?.identity?.url || '').match(/\/listing\/(\d+)/i)?.[1] || '';
}

/* ---------- Request hardening / circuit breaker ---------- */

var favDeepConsecutiveFailures0103 = 0;
var favDeepCooldownUntil0103 = 0;

function favDeepCooldownMs0103(error) {
    const retryAfter = Math.max(0, Number(error?.retryAfterMs) || 0);
    if (retryAfter) return Math.min(5 * 60 * 1000, retryAfter);
    if (favDeepConsecutiveFailures0103 < 3) return 0;
    const exponent = Math.min(4, favDeepConsecutiveFailures0103 - 3);
    return Math.min(2 * 60 * 1000, 15000 * (2 ** exponent));
}

async function favDeepWaitForCooldown0103(signal) {
    const remaining = favDeepCooldownUntil0103 - Date.now();
    if (remaining <= 0) return;
    await sleep(remaining, signal);
}

favDeepFetchListing = async function favDeepFetchListing0103(recordOrUrl, options = {}) {
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
        if (/\b(?:captcha|unusual (?:traffic|activity)|verify (?:that )?you(?:'re| are) human|robot check)\b/i.test(html)) {
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

/* ---------- Queue failure semantics ---------- */

async function favDeepMarkAvailability0103(listingId, availabilityState, observedAt = Date.now()) {
    const idValue = String(listingId || '');
    if (!idValue) return false;
    return favIndexEnqueue(async () => {
        const existing = await favIndexGet('listings', idValue);
        if (!existing) return false;
        const next = favIndexMarkListingAvailability(existing, availabilityState, observedAt);
        await favIndexWrite(['listings'], (transaction) => transaction.objectStore('listings').put(next));
        const live = favState?.recordsById?.get?.(idValue);
        if (live) favIndexApplyListingMetadataToRecord(live, next);
        return true;
    });
}

var favDeepQueueFailBefore0103 = favDeepQueueFail;
favDeepQueueFail = async function favDeepQueueFail0103(idValue, error, now = Date.now()) {
    if (error?.retryable === false) {
        const job = await favIndexGet(FAV_DEEP_QUEUE_STORE, String(idValue));
        const next = await favDeepQueueUpdate(idValue, {
            status: 'failed',
            finishedAt: now,
            error: String(error?.message || error || 'Non-retryable metadata scan error'),
            nextAttemptAt: 0,
        });
        if (job?.listingId && [404, 410].includes(Number(error?.httpStatus))) {
            await favDeepMarkAvailability0103(job.listingId, Number(error.httpStatus) === 410 ? 'deleted' : 'unavailable', now);
        }
        return next;
    }

    let next = await favDeepQueueFailBefore0103(idValue, error, now);
    const retryAfterMs = Math.max(0, Number(error?.retryAfterMs) || 0);
    if (next?.status === 'queued' && retryAfterMs > 0) {
        const desired = now + retryAfterMs;
        if ((Number(next.nextAttemptAt) || 0) < desired) {
            next = await favDeepQueueUpdate(idValue, { nextAttemptAt: desired });
        }
    }
    return next;
};

/* Hydrate unavailable/deleted states into the current positive "Available only"
 * filter without discarding the Favorite or its cached metadata. */
var favIndexApplyListingMetadataToRecordBefore0103 = favIndexApplyListingMetadataToRecord;
favIndexApplyListingMetadataToRecord = function favIndexApplyListingMetadataToRecord0103(record, listing) {
    record = favIndexApplyListingMetadataToRecordBefore0103(record, listing);
    if (!record || !listing) return record;
    record.availabilityState = String(listing.availabilityState || 'unknown');
    if (record.availabilityState === 'unavailable' || record.availabilityState === 'deleted') {
        record.isSoldOut = true;
        record.known = record.known || {};
        record.known.isSoldOut = true;
    }
    return record;
};

/* ---------- Correct, cancelable queue runner ---------- */

favDeepRunQueue = function favDeepRunQueue0103() {
    if (favDeepRunnerPromise) return favDeepRunnerPromise;

    const controller = new AbortController();
    favDeepRunnerController = controller;

    const run = (async () => {
        await favDeepQueueRecoverInterrupted();
        let total = (await favDeepQueueList('queued')).length;
        let completed = 0;
        let failed = 0;
        if (total) favDeepDispatchState({ status:'running', completed, failed, total, error:'' });

        while (!controller.signal.aborted) {
            let job = await favDeepQueueClaimNext();
            if (!job) {
                const waiting = (await favDeepQueueList('queued')).filter((entry) => Number(entry.nextAttemptAt) > Date.now());
                if (!waiting.length) break;
                const nextAt = Math.min(...waiting.map((entry) => Number(entry.nextAttemptAt)));
                try {
                    await sleep(Math.min(1000, Math.max(25, nextAt - Date.now())), controller.signal);
                } catch (error) {
                    if (error?.name === 'AbortError' || controller.signal.aborted) break;
                    throw error;
                }
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
                if (error?.name === 'AbortError' || controller.signal.aborted) {
                    /* Cancellation must not consume a retry attempt. Put the
                     * claimed job back into the durable queue immediately. */
                    await favDeepQueueUpdate(job.id, {
                        status:'queued',
                        attempts:Math.max(0, (Number(job.attempts) || 1) - 1),
                        startedAt:0,
                        finishedAt:0,
                        error:'',
                        nextAttemptAt:0,
                    });
                    break;
                }
                if ((await favDeepQueueFail(job.id, error))?.status === 'failed') failed += 1;
            }

            total = Math.max(total, Number(favDeepState.total) || 0, completed + failed);
            favDeepDispatchState({ status:'running', completed, failed, total });

            try {
                await sleep(FAV_DEEP_QUEUE_REQUEST_DELAY_MS, controller.signal);
            } catch (error) {
                if (error?.name === 'AbortError' || controller.signal.aborted) break;
                throw error;
            }
        }

        total = Math.max(total, Number(favDeepState.total) || 0, completed + failed);
        const status = controller.signal.aborted ? 'cancelled' : (failed ? 'completed_with_errors' : 'completed');
        favDeepDispatchState({ status, completed, failed, total });
        return { status, completed, failed, total };
    })();

    const guarded = run.catch((error) => {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
            const detail = {
                status:'cancelled',
                completed:Math.max(0, Number(favDeepState.completed) || 0),
                failed:Math.max(0, Number(favDeepState.failed) || 0),
                total:Math.max(0, Number(favDeepState.total) || 0),
                error:'',
            };
            favDeepDispatchState(detail);
            return detail;
        }
        const detail = {
            status:'completed_with_errors',
            completed:Math.max(0, Number(favDeepState.completed) || 0),
            failed:Math.max(1, Number(favDeepState.failed) || 0),
            total:Math.max(0, Number(favDeepState.total) || 0),
            error:String(error?.message || error),
        };
        favDeepDispatchState(detail);
        return detail;
    });

    favDeepRunnerPromise = guarded.finally(() => {
        favDeepRunnerPromise = null;
        favDeepRunnerController = null;
    });
    return favDeepRunnerPromise;
};

/* ---------- Cancellation / auto-resume control ---------- */

var favDeepAutoResumeSuppressed0103 = false;

function favDeepCancel(reason = 'user') {
    if (favDeepState.status !== 'running' || !favDeepRunnerController) return false;
    if (reason === 'user') favDeepAutoResumeSuppressed0103 = true;
    favDeepRunnerController.abort();
    return true;
}

var favDeepMaybeAutoScanBefore0103 = favDeepMaybeAutoScan;
favDeepMaybeAutoScan = async function favDeepMaybeAutoScan0103() {
    if (favDeepAutoResumeSuppressed0103) return false;
    return favDeepMaybeAutoScanBefore0103();
};

var favDeepScanMissingBefore0103 = favDeepScanMissing;
favDeepScanMissing = function favDeepScanMissing0103() {
    favDeepAutoResumeSuppressed0103 = false;
    return favDeepScanMissingBefore0103();
};

var favDeepUpdateAllBefore0103 = favDeepUpdateAll;
favDeepUpdateAll = function favDeepUpdateAll0103() {
    favDeepAutoResumeSuppressed0103 = false;
    return favDeepUpdateAllBefore0103();
};

/* ---------- Progress polish for cooldowns ---------- */

var favDeepProgressModelBefore0103 = favDeepProgressModel;
favDeepProgressModel = function favDeepProgressModel0103(state = favDeepState) {
    const model = favDeepProgressModelBefore0103(state);
    const cooldown = Math.max(0, favDeepCooldownUntil0103 - Date.now());
    if (state.status === 'running' && cooldown > 0) {
        const seconds = Math.max(1, Math.ceil(cooldown / 1000));
        return { ...model, detail:[model.detail, `cooldown ~${seconds}s`].filter(Boolean).join(' · ') };
    }
    return model;
};

/* ---------- Settings UI ---------- */

var favRefreshSettingsStatusBefore0103 = favRefreshSettingsStatus;
favRefreshSettingsStatus = async function favRefreshSettingsStatus0103() {
    await favRefreshSettingsStatusBefore0103();
    const layer = favState.settingsModal;
    if (!layer) return;
    const cancel = layer.querySelector('[data-ebsf-deep-cancel]');
    if (cancel) cancel.hidden = favDeepState.status !== 'running';
    const state = layer.querySelector('[data-ebsf-status="deepState"]');
    if (state && favDeepState.status !== 'running' && favDeepAutoResumeSuppressed0103) state.textContent = 'Paused';
};

var favOpenSettingsModalBefore0103 = favOpenSettingsModal;
favOpenSettingsModal = function favOpenSettingsModal0103(event) {
    favOpenSettingsModalBefore0103(event);
    const layer = favState.settingsModal;
    const actions = layer?.querySelector('.ebsf-deep-section .ebsf-deep-actions');
    if (!layer || !actions) return;

    if (!actions.querySelector('[data-ebsf-deep-cancel]')) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'ebs-button is-quiet ebsf-deep-cancel';
        cancel.dataset.ebsfDeepCancel = '';
        cancel.textContent = 'Cancel deep scan';
        cancel.hidden = favDeepState.status !== 'running';
        cancel.addEventListener('click', () => favDeepCancel('user'));
        actions.append(cancel);
    }

    /* Re-enabling automatic deep scans is an explicit request to allow them
     * again after a manual cancellation. Capture runs before the older listener
     * that may call favDeepMaybeAutoScan(). */
    layer.querySelector('[data-ebsf-auto-deep]')?.addEventListener('change', (changeEvent) => {
        if (changeEvent.target.checked) favDeepAutoResumeSuppressed0103 = false;
    }, true);

    void favRefreshSettingsStatus();
};

GM_addStyle(`
  .ebsf-deep-actions .ebsf-deep-cancel{
    grid-column:1 / -1;
  }
`);
