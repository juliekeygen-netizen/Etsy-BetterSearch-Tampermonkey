'use strict';
/* v0.15.23 native Favorites query acknowledgement boundary.
 *
 * Module 99 historically treated an 850 ms timer as sufficient to promote the
 * live submitted text to favCommittedNativeQuery0138(). v0.15.10 then treated
 * that state as durable "favorites-search-commit" provenance. A failed/stalled
 * Etsy search could therefore manufacture a durable query scope, and submit A
 * -> type B before A settled could commit B when A's grid response arrived.
 *
 * Keep module 99's timers only as recheck scheduling. Final committed identity
 * changes only after positive evidence bound to the exact submitted value:
 *   1. route/SSR query evidence changes to that exact value; or
 *   2. an exact same-origin Favorites resource request for that submitted value
 *      completes successfully; or
 *   3. where responseStatus is unavailable, the exact request completes AND
 *      Etsy's native grid settles away from the submit-time grid.
 *
 * The submitted query is snapshotted independently from the live draft. Typing
 * another value after submit never changes which query can be acknowledged.
 */
var FAV_NATIVE_QUERY_ACK_DEADLINE_MS01523 = 5000;
var favCommittedNativeQueryProvenanceBefore01523 = favCommittedNativeQueryProvenance01510;
var favMarkNativeQuerySubmittedBefore01523 = favMarkNativeQuerySubmitted0140;

favState.nativeQueryVerificationScope01523 = String(favState.nativeQueryVerificationScope01523 || '');
favState.nativeQueryVerifiedValue01523 = String(favState.nativeQueryVerifiedValue01523 || '');
favState.nativeQueryCommitVerified01523 = favState.nativeQueryCommitVerified01523 === true;
favState.nativeQuerySubmission01523 = favState.nativeQuerySubmission01523 || null;
favState.nativeQuerySubmitSequence01523 = Math.max(0, Number(favState.nativeQuerySubmitSequence01523) || 0);
favState.nativeQueryResourceObserver01523 = favState.nativeQueryResourceObserver01523 || null;
favState.nativeQueryAckDeadlineTimer01523 = Number(favState.nativeQueryAckDeadlineTimer01523) || 0;
favState.nativeQueryAckFollowupTimer01523 = Number(favState.nativeQueryAckFollowupTimer01523) || 0;

function favNativeQueryObservedGrid01523() {
    try {
        if (typeof favNativeMainGrid0141 === 'function') return favNativeMainGrid0141();
    } catch (_) {}
    try { return favMainGrid(); }
    catch (_) { return null; }
}

function favNativeQueryGridFingerprint01523(grid = favNativeQueryObservedGrid01523()) {
    if (!grid) return '';
    return Array.from(grid.children || [])
        .map((node) => favListingIdFromNode(node))
        .filter(Boolean)
        .join(',');
}

function favNativeQueryExplicitEvidence01523() {
    try {
        const url = new URL(location.href);
        if (url.searchParams.has('search_query')) {
            return `route:search_query:${String(url.searchParams.get('search_query') || '').trim()}`;
        }
        if (url.searchParams.has('q')) {
            return `route:q:${String(url.searchParams.get('q') || '').trim()}`;
        }
    } catch (_) {}
    try {
        const props = favProps?.();
        if (props && Object.prototype.hasOwnProperty.call(props, 'query')) {
            return `props:${String(props.query || '').trim()}`;
        }
    } catch (_) {}
    return 'none:';
}

function favNativeQueryExplicitEvidenceValue01523(evidence) {
    const text = String(evidence || '');
    if (text.startsWith('route:')) {
        const second = text.indexOf(':', text.indexOf(':') + 1);
        return second >= 0 ? text.slice(second + 1) : '';
    }
    const first = text.indexOf(':');
    return first >= 0 ? text.slice(first + 1) : '';
}

function favEnsureNativeQueryVerification01523() {
    favEnsureNativeQueryScope0140();
    const scopeIdentity = favNativeQueryScopeIdentity0140();
    if (favState.nativeQueryVerificationScope01523 === scopeIdentity) return;

    const committed = String(favState.nativeCommittedQuery0140 || '').trim();
    const evidence = favNativeQueryExplicitEvidence01523();
    const explicitlyBacked = Boolean(committed)
        && evidence !== 'none:'
        && favNativeQueryExplicitEvidenceValue01523(evidence) === committed;

    favState.nativeQueryVerificationScope01523 = scopeIdentity;
    favState.nativeQueryVerifiedValue01523 = !committed || explicitlyBacked ? committed : '';
    favState.nativeQueryCommitVerified01523 = !committed || explicitlyBacked;
    favCancelNativeQuerySubmission01523(false);
}

function favStopNativeQueryResourceObserver01523() {
    favState.nativeQueryResourceObserver01523?.disconnect?.();
    favState.nativeQueryResourceObserver01523 = null;
}

function favClearNativeQueryAckTimers01523() {
    clearTimeout(favState.nativeQueryAckDeadlineTimer01523);
    clearTimeout(favState.nativeQueryAckFollowupTimer01523);
    favState.nativeQueryAckDeadlineTimer01523 = 0;
    favState.nativeQueryAckFollowupTimer01523 = 0;
}

function favCancelNativeQuerySubmission01523(keepDraft = true) {
    favStopNativeQueryResourceObserver01523();
    favClearNativeQueryAckTimers01523();
    favState.nativeQuerySubmission01523 = null;
    if (!keepDraft) return;

    const draft = String(favState.nativePendingQuery0140 || '').trim();
    const committed = String(favState.nativeCommittedQuery0140 || '').trim();
    favState.nativeQueryAwaitingSettle0140 = false;
    favState.nativeQuerySubmittedAt0140 = 0;
    favState.nativeQuerySubmitFingerprint0140 = '';
    favState.nativeQueryPendingDirty0140 = draft !== committed;
    favClearNativeQuerySettleTimers0140();
}

function favNativeQueryResourceEndpointMatches01523(name, submission) {
    let url;
    try { url = new URL(String(name || ''), location.origin); }
    catch (_) { return false; }
    if (url.origin !== location.origin) return false;

    const scope = submission?.scope || {};
    const owner = String(scope.owner || '').trim();
    const id = String(scope.id || '').trim();
    const path = decodeURIComponent(url.pathname || '').replace(/\/+$/, '');
    let endpointMatch = false;
    if (scope.type === 'items' && owner) {
        endpointMatch = path.endsWith(`/api/v3/ajax/member/users/${owner}/favorites/landing-listings`);
    } else if (scope.type === 'collection' && owner && id) {
        endpointMatch = path.endsWith(`/api/v3/ajax/bespoke/member/users/${owner}/collections/${id}/landing-listings-bespoke`);
    }
    if (!endpointMatch) return false;
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isFinite(offset) || offset !== 0) return false;

    const expected = String(submission.value || '').trim();
    const actual = url.searchParams.has('query') ? String(url.searchParams.get('query') || '').trim() : '';
    return actual === expected;
}

function favNativeQueryRecordResource01523(entry, submission = favState.nativeQuerySubmission01523) {
    if (!submission || submission.sequence !== favState.nativeQuerySubmission01523?.sequence) return false;
    const entryStart = Math.max(0, Number(entry?.startTime) || 0);
    if (submission.performanceStart > 0 && entryStart + 0.01 < submission.performanceStart) return false;
    if (!favNativeQueryResourceEndpointMatches01523(entry?.name, submission)) return false;

    const status = Number(entry?.responseStatus);
    const statusKnown = Number.isFinite(status) && status > 0;
    submission.resourceCompleted = true;
    submission.resourceStatusKnown = statusKnown;
    submission.resourceStatus = statusKnown ? status : 0;
    submission.resourceSucceeded = statusKnown ? status >= 200 && status < 400 : false;
    submission.resourceResponseStarted = statusKnown || Math.max(0, Number(entry?.responseStart) || 0) > 0;
    submission.resourceFailed = statusKnown ? status >= 400 : false;
    submission.resourceResponseEnd = Math.max(0, Number(entry?.responseEnd) || 0);

    if (!submission.resourceFailed) {
        favScheduleCurrentPageObservation(0);
        clearTimeout(favState.nativeQueryAckFollowupTimer01523);
        const sequence = submission.sequence;
        favState.nativeQueryAckFollowupTimer01523 = setTimeout(() => {
            favState.nativeQueryAckFollowupTimer01523 = 0;
            if (favState.nativeQuerySubmission01523?.sequence === sequence) favScheduleCurrentPageObservation(0);
        }, 180);
    }
    return true;
}

function favNativeQueryScanResourceTimeline01523(submission = favState.nativeQuerySubmission01523) {
    if (!submission || typeof performance?.getEntriesByType !== 'function') return false;
    let matched = false;
    try {
        for (const entry of performance.getEntriesByType('resource') || []) {
            if (favNativeQueryRecordResource01523(entry, submission)) matched = true;
        }
    } catch (_) {}
    return matched;
}

function favWatchNativeQueryResources01523(submission) {
    favStopNativeQueryResourceObserver01523();
    if (typeof PerformanceObserver !== 'function') return;
    try {
        const observer = new PerformanceObserver((list) => {
            if (favState.nativeQuerySubmission01523?.sequence !== submission.sequence) return;
            for (const entry of list.getEntries?.() || []) favNativeQueryRecordResource01523(entry, submission);
        });
        try { observer.observe({ type:'resource', buffered:false }); }
        catch (_) { observer.observe({ entryTypes:['resource'] }); }
        favState.nativeQueryResourceObserver01523 = observer;
    } catch (_) {}
}

function favNativeQueryGridSettled01523(submission) {
    const grid = favNativeQueryObservedGrid01523();
    if (!grid) return false;
    if (!submission.grid) return true;
    if (grid !== submission.grid) return true;
    return favNativeQueryGridFingerprint01523(grid) !== submission.gridFingerprint;
}

function favNativeQueryExplicitAck01523(submission) {
    const current = favNativeQueryExplicitEvidence01523();
    return current !== submission.explicitEvidence
        && current !== 'none:'
        && favNativeQueryExplicitEvidenceValue01523(current) === submission.value;
}

function favNativeQueryHasPositiveAck01523(submission) {
    if (!submission) return false;
    if (favNativeQueryExplicitAck01523(submission)) return true;
    favNativeQueryScanResourceTimeline01523(submission);
    if (submission.resourceFailed) return false;
    if (!submission.resourceCompleted) return false;

    /* responseStatus is not implemented in every target browser. A known 2xx/
     * 3xx response is sufficient exact server acknowledgement for a non-empty
     * submitted query. When status is unavailable, require native result
     * settlement as a second independent signal. Clear-to-All always requires
     * native settlement so an unrelated no-query background refresh cannot
     * acknowledge a failed Clear action. */
    if (submission.value && submission.resourceStatusKnown && submission.resourceSucceeded) return true;
    if (!submission.resourceResponseStarted) return false;
    return favNativeQueryGridSettled01523(submission);
}

function favMarkNativeQueryVerification01523(value, verified) {
    const next = String(value || '').trim();
    favState.nativeQueryVerifiedValue01523 = verified ? next : '';
    favState.nativeQueryCommitVerified01523 = verified === true;
}

function favFinalizeNativeQuerySubmission01523(submission) {
    const next = String(submission?.value || '').trim();
    const previous = String(favState.nativeCommittedQuery0140 || '').trim();
    const draft = String(favState.nativePendingQuery0140 || '').trim();
    const changed = next !== previous;

    favState.nativeCommittedQuery0140 = next;
    favMarkNativeQueryVerification01523(next, true);
    favState.nativeQueryAwaitingSettle0140 = false;
    favState.nativeQuerySubmittedAt0140 = 0;
    favState.nativeQuerySubmitFingerprint0140 = '';
    favState.nativeQueryPendingDirty0140 = draft !== next;
    favClearNativeQuerySettleTimers0140();
    favCancelNativeQuerySubmission01523(false);

    if (!changed) return false;
    favState.localPage = 1;
    favState.localPageRouteKey0129 = '';
    if (typeof favState.nativePageIntent0139 !== 'undefined') {
        favState.nativePageIntent0139 = 0;
        favState.nativePageIntentAt0139 = 0;
    }
    favScheduleSync(0);
    return true;
}

function favStartNativeQuerySubmission01523(input) {
    favEnsureNativeQueryVerification01523();
    favCancelNativeQuerySubmission01523(false);
    const grid = favNativeQueryObservedGrid01523();
    const sequence = ++favState.nativeQuerySubmitSequence01523;
    let performanceStart = 0;
    try { performanceStart = Math.max(0, Number(performance?.now?.()) || 0); }
    catch (_) {}
    const submission = {
        sequence,
        scopeIdentity:favNativeQueryScopeIdentity0140(),
        scope:{ ...favScope() },
        value:String(input?.value || '').trim(),
        submittedAt:Date.now(),
        performanceStart,
        grid:grid || null,
        gridFingerprint:favNativeQueryGridFingerprint01523(grid),
        explicitEvidence:favNativeQueryExplicitEvidence01523(),
        resourceCompleted:false,
        resourceStatusKnown:false,
        resourceStatus:0,
        resourceSucceeded:false,
        resourceResponseStarted:false,
        resourceFailed:false,
        resourceResponseEnd:0,
    };
    favState.nativeQuerySubmission01523 = submission;
    favWatchNativeQueryResources01523(submission);

    favState.nativeQueryAckDeadlineTimer01523 = setTimeout(() => {
        favState.nativeQueryAckDeadlineTimer01523 = 0;
        if (favState.nativeQuerySubmission01523?.sequence === sequence) favScheduleCurrentPageObservation(0);
    }, FAV_NATIVE_QUERY_ACK_DEADLINE_MS01523);
    return submission;
}

favMarkNativeQuerySubmitted0140 = function favMarkNativeQuerySubmitted01523(input) {
    favMarkNativeQuerySubmittedBefore01523(input);
    if (!favState.nativeQueryAwaitingSettle0140) return;
    favStartNativeQuerySubmission01523(input);
};

favMaybeCommitSubmittedNativeQuery0140 = function favMaybeCommitSubmittedNativeQuery01523() {
    if (favCfg.strict || favCfg.multi) return false;
    favEnsureNativeQueryVerification01523();
    if (!favState.nativeQueryAwaitingSettle0140) return false;

    const submission = favState.nativeQuerySubmission01523;
    if (!submission || submission.scopeIdentity !== favNativeQueryScopeIdentity0140()) {
        favCancelNativeQuerySubmission01523(true);
        return false;
    }

    const committed = String(favState.nativeCommittedQuery0140 || '').trim();
    if (submission.value === committed
        && favState.nativeQueryCommitVerified01523 === true
        && favState.nativeQueryVerifiedValue01523 === committed) {
        favCancelNativeQuerySubmission01523(true);
        return false;
    }

    if (favNativeQueryHasPositiveAck01523(submission)) {
        return favFinalizeNativeQuerySubmission01523(submission);
    }

    const elapsed = Date.now() - submission.submittedAt;
    if (elapsed >= FAV_NATIVE_QUERY_ACK_DEADLINE_MS01523 || submission.resourceFailed) {
        /* If Etsy never changed the native result grid, abandoning this failed
         * submission is safe: subsequent observation still describes the prior
         * committed dataset. If the grid DID change without query-specific proof,
         * keep the transition unresolved and continue blocking observation.
         * Writing those cards under the old committed query would be worse than
         * temporarily refusing to index an identity we cannot prove. */
        if (!favNativeQueryGridSettled01523(submission)) {
            favCancelNativeQuerySubmission01523(true);
            return false;
        }
        favStopNativeQueryResourceObserver01523();
        favClearNativeQueryAckTimers01523();
        submission.expired = true;
        return 'pending';
    }

    /* Non-boolean truthy sentinel intentionally stops module99's observation
     * caller without telling later generation wrappers that a query committed. */
    return 'pending';
};

/* v0.15.10 already trusts route/SSR sources. Narrow only its dynamic
 * favorites-search-commit source: a non-empty committed value created by this
 * client-side state machine is durable only when the exact submission above was
 * positively acknowledged. */
favCommittedNativeQueryProvenance01510 = function favCommittedNativeQueryProvenance01523(query = favDatasetQuery()) {
    const result = favCommittedNativeQueryProvenanceBefore01523(query);
    if (result?.queryCommitSource !== 'favorites-search-commit') return result;

    favEnsureNativeQueryVerification01523();
    const value = String(query || '').trim();
    const committed = String(favState.nativeCommittedQuery0140 || '').trim();
    const verified = favState.nativeQueryCommitVerified01523 === true
        && favState.nativeQueryVerifiedValue01523 === value
        && committed === value;
    return verified
        ? result
        : { queryCommitSource:'favorites-search-unverified', queryCommitVerified:false };
};
