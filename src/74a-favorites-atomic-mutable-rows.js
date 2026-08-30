'use strict';

/* v0.15.20 atomic mutable-row integration.
 *
 * The deep parser, availability hardening and base queue modules historically
 * performed a readonly get, built a replacement row in JavaScript, then opened
 * a later readwrite transaction to put it. Across tabs that split boundary can
 * overwrite a newer membership, metadata field or worker lease.
 *
 * This module replaces those mutable write paths after modules 61c/61d/73/74
 * have installed their behavior, but before module 75 adds lease/CAS semantics.
 * Module 75 therefore captures these atomic queue implementations as its
 * fallbacks and remains the final owner of worker-held state transitions.
 */

function favAtomicQueueNormalizeLease01520(job) {
    if (!job || job.status === 'running') return job;
    return { ...job, workerId:'', leaseUntil:0 };
}

/* ---------- Deep listing metadata ---------- */

favIndexApplyDeepListingObservationNow = async function favIndexApplyDeepListingObservationNow01520(listingId, parsed, options = {}) {
    const idValue = String(listingId || parsed?.identity?.listingId || '');
    if (!idValue) throw new Error('Deep metadata observation is missing listing ID.');
    const observedAt = Math.max(0, Number(options.observedAt) || Number(parsed?.observedAt) || Date.now());

    return favIndexMutateListingAndShop01520(idValue, (existing, oldShop) => {
        if (!existing) throw new Error(`Favorite ${idValue} is not present in the Favorites index.`);

        const next = {
            ...existing,
            url:parsed?.identity?.url || existing.url || '',
            title:parsed?.identity?.title || existing.title || '',
            lastDeepScanAt:Math.max(Number(existing.lastDeepScanAt) || 0, observedAt),
            deepParserVersion:String(parsed?.parserVersion || FAV_DEEP_PARSER_VERSION),
            shippingOriginParserVersion:FAV_DEEP_SHIPPING_ORIGIN_VERSION,
            listingMetadata:favIndexMergeMetadata(existing.listingMetadata, parsed?.listingMetadata || {}),
            shippingMetadata:favIndexMergeMetadata(existing.shippingMetadata, parsed?.shippingMetadata || {}),
            cardMetadata:favIndexMergeMetadata(existing.cardMetadata, parsed?.cardMetadata || {}),
        };

        if (parsed?.availabilityState && parsed.availabilityState !== 'unknown') {
            Object.assign(next, favIndexMarkListingAvailability(next, parsed.availabilityState, observedAt));
        }

        let nextShop;
        if (existing.shopId) {
            const starSeller = parsed?.shopMetadata?.starSeller;
            nextShop = favIndexMergeShop(oldShop, {
                shopId:String(existing.shopId),
                shopName:parsed?.identity?.shopName || oldShop?.shopName || '',
                shopUrl:oldShop?.shopUrl || '',
                starSeller:starSeller || favIndexUnknown(),
                observedAt,
            });
            nextShop.lastScannedAt = Math.max(Number(oldShop?.lastScannedAt) || 0, observedAt);
        }

        return { listing:next, shop:nextShop, result:next };
    });
};

/* ---------- Availability ---------- */

favDeepMarkAvailability0103 = function favDeepMarkAvailability01520(listingId, availabilityState, observedAt = Date.now()) {
    const idValue = String(listingId || '');
    if (!idValue) return Promise.resolve(false);

    return favIndexEnqueue(async () => {
        const next = await favIndexMutateStoreRow01520('listings', idValue, (existing) => {
            if (!existing) return favAtomicNoWrite01520(null);
            const updated = favIndexMarkListingAvailability(existing, availabilityState, observedAt);
            return favAtomicPut01520(updated, updated);
        });
        if (!next) return false;
        const live = favState?.recordsById?.get?.(idValue);
        if (live) favIndexApplyListingMetadataToRecord(live, next);
        return true;
    });
};

/* ---------- Base queue enqueue/update/failure ---------- */

favDeepQueueEnqueue = function favDeepQueueEnqueue01520(listingId, options = {}) {
    return favDeepQueueSerialize(async () => {
        const incoming = favDeepQueueJob(listingId, options);
        if (!incoming.listingId) throw new Error('Deep metadata job requires a listing ID.');

        return favIndexMutateStoreRow01520(FAV_DEEP_QUEUE_STORE, incoming.id, (existing) => {
            const merged = favAtomicQueueNormalizeLease01520(
                favDeepQueueMergeJob(existing, incoming, options)
            );
            return favAtomicPut01520(merged, merged);
        });
    });
};

favDeepQueueUpdate = function favDeepQueueUpdate01520(idValue, patch = {}) {
    return favDeepQueueSerialize(() => favIndexMutateStoreRow01520(
        FAV_DEEP_QUEUE_STORE,
        String(idValue),
        (job) => {
            if (!job) return favAtomicNoWrite01520(null);
            const next = favAtomicQueueNormalizeLease01520({
                ...job,
                ...patch,
                updatedAt:Date.now(),
            });
            return favAtomicPut01520(next, next);
        },
    ));
};

/* Module 73 deliberately keeps its own public failure wrapper for retry-after,
 * non-retryable HTTP state and availability handling. Replace only the base
 * failure function it captured, so that wrapper's behavior remains intact while
 * its mutable queue row now reads/merges/writes atomically. */
favDeepQueueFailBefore0103 = function favDeepQueueFailAtomic01520(idValue, error, now = Date.now()) {
    return favDeepQueueSerialize(() => favIndexMutateStoreRow01520(
        FAV_DEEP_QUEUE_STORE,
        String(idValue),
        (job) => {
            if (!job) return favAtomicNoWrite01520(null);
            const retry = (Number(job.attempts) || 0) < FAV_DEEP_QUEUE_RETRY_LIMIT;
            const next = favAtomicQueueNormalizeLease01520({
                ...job,
                status:retry ? 'queued' : 'failed',
                finishedAt:retry ? 0 : now,
                error:String(error?.message || error || 'Unknown metadata scan error'),
                nextAttemptAt:retry
                    ? now + Math.min(30000, 1000 * (2 ** Math.max(0, (Number(job.attempts) || 0) - 1)))
                    : 0,
                updatedAt:now,
            });
            return favAtomicPut01520(next, next);
        },
    ));
};
