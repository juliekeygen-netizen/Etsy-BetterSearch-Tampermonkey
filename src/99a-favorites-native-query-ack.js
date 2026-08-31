'use strict';

/* v0.15.23 native Favorites query acknowledgement boundary.
 *
 * Module 99 correctly separates live input text from submitted query state, but
 * its 850 ms settle fallback historically promoted the submitted text to the
 * same "committed" state used by v0.15.10 durable query provenance even when
 * Etsy had not produced any positive route/SSR/grid evidence. Keep the timeout
 * for runtime continuity, but make durable trust a separate, explicit fact.
 *
 * This module intentionally loads after 99 and before 101. Module 101 therefore
 * keeps wrapping the final favMaybeCommitSubmittedNativeQuery0140 implementation
 * for count-generation invalidation without needing another count owner.
 */
var FAV_NATIVE_QUERY_LATE_ACK_MS01523 = 5000;
var favCommittedNativeQueryProvenanceBefore01523 = favCommittedNativeQueryProvenance01510;
var favMarkNativeQuerySubmittedBefore01523 = favMarkNativeQuerySubmitted0140;

favState.nativeQueryVerificationScope01523 = String(favState.nativeQueryVerificationScope01523 || '');
favState.nativeQueryVerifiedValue01523 = String(favState.nativeQueryVerifiedValue01523 || '');
favState.nativeQueryCommitVerified01523 = favState.nativeQueryCommitVerified01523 === true;
favState.nativeQuerySubmitGrid01523 = favState.nativeQuerySubmitGrid01523 || null;
favState.nativeQuerySubmitGridFingerprint01523 = String(favState.nativeQuerySubmitGridFingerprint01523 || '');
favState.nativeQuerySubmitExplicitEvidence01523 = String(favState.nativeQuerySubmitExplicitEvidence01523 || '');
favState.nativeQueryUnverifiedValue01523 = String(favState.nativeQueryUnverifiedValue01523 || '');
favState.nativeQueryUnverifiedSubmittedAt01523 = Math.max(0, Number(favState.nativeQueryUnverifiedSubmittedAt01523) || 0);

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

/* Route/SSR evidence is useful only when it CHANGES after submit. Etsy often
 * leaves both at their pre-search value for client-side Favorites search, so an
 * already-matching stale SSR value must not be mistaken for a fresh ack. */
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
    const index = text.indexOf(':');
    if (index < 0) return '';
    if (text.startsWith('route:')) {
        const second = text.indexOf(':', index + 1);
        return second >= 0 ? text.slice(second + 1) : '';
    }
    return text.slice(index + 1);
}

function favEnsureNativeQueryVerification01523() {
    favEnsureNativeQueryScope0140();
    const scopeIdentity = favNativeQueryScopeIdentity0140();
    if (favState.nativeQueryVerificationScope01523 === scopeIdentity) return;

    const committed = String(favState.nativeCommittedQuery0140 || '').trim();
    const evidence = favNativeQueryExplicitEvidence01523();
    const explicitlyBacked = Boolean(committed)
        && favNativeQueryExplicitEvidenceValue01523(evidence) === committed
        && evidence !== 'none:';

    favState.nativeQueryVerificationScope01523 = scopeIdentity;
    favState.nativeQueryVerifiedValue01523 = !committed || explicitlyBacked ? committed : '';
    favState.nativeQueryCommitVerified01523 = !committed || explicitlyBacked;
    favState.nativeQuerySubmitGrid01523 = null;
    favState.nativeQuerySubmitGridFingerprint01523 = '';
    favState.nativeQuerySubmitExplicitEvidence01523 = '';
    favState.nativeQueryUnverifiedValue01523 = '';
    favState.nativeQueryUnverifiedSubmittedAt01523 = 0;
}

function favNativeQueryHasPositiveAck01523(value, allowLateGrid = true) {
    const next = String(value || '').trim();
    const currentEvidence = favNativeQueryExplicitEvidence01523();
    const explicitChanged = currentEvidence !== favState.nativeQuerySubmitExplicitEvidence01523;
    if (explicitChanged
        && currentEvidence !== 'none:'
        && favNativeQueryExplicitEvidenceValue01523(currentEvidence) === next) {
        return true;
    }

    if (!allowLateGrid) return false;
    const grid = favNativeQueryObservedGrid01523();
    if (!grid) return false;
    if (!favState.nativeQuerySubmitGrid01523) return true;
    if (grid !== favState.nativeQuerySubmitGrid01523) return true;
    return favNativeQueryGridFingerprint01523(grid) !== favState.nativeQuerySubmitGridFingerprint01523;
}

function favMarkNativeQueryVerification01523(value, verified, submittedAt = 0) {
    const next = String(value || '').trim();
    favState.nativeQueryVerifiedValue01523 = verified ? next : '';
    favState.nativeQueryCommitVerified01523 = verified === true;
    favState.nativeQueryUnverifiedValue01523 = verified ? '' : next;
    favState.nativeQueryUnverifiedSubmittedAt01523 = verified ? 0 : Math.max(0, Number(submittedAt) || Date.now());
}

function favFinalizeNativeQueryState01523(next, verified) {
    const value = String(next || '').trim();
    const changed = value !== favState.nativeCommittedQuery0140;
    const submittedAt = favState.nativeQuerySubmittedAt0140;

    favState.nativeCommittedQuery0140 = value;
    favMarkNativeQueryVerification01523(value, verified, submittedAt);
    favState.nativeQueryPendingDirty0140 = false;
    favState.nativeQueryAwaitingSettle0140 = false;
    favState.nativeQuerySubmittedAt0140 = 0;
    favState.nativeQuerySubmitFingerprint0140 = '';
    favClearNativeQuerySettleTimers0140();

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

favMarkNativeQuerySubmitted0140 = function favMarkNativeQuerySubmitted01523(input) {
    favMarkNativeQuerySubmittedBefore01523(input);
    if (!favState.nativeQueryAwaitingSettle0140) return;
    favEnsureNativeQueryVerification01523();
    const grid = favNativeQueryObservedGrid01523();
    favState.nativeQuerySubmitGrid01523 = grid || null;
    favState.nativeQuerySubmitGridFingerprint01523 = favNativeQueryGridFingerprint01523(grid);
    favState.nativeQuerySubmitExplicitEvidence01523 = favNativeQueryExplicitEvidence01523();
};

favMaybeCommitSubmittedNativeQuery0140 = function favMaybeCommitSubmittedNativeQuery01523() {
    if (favCfg.strict || favCfg.multi) return false;
    favEnsureNativeQueryVerification01523();

    /* A timeout-promoted non-empty query remains runtime-only. If Etsy responds
     * late, allow a bounded late grid/route/SSR transition to upgrade it to a
     * durable verified commit before current-page observation proceeds. */
    if (!favState.nativeQueryAwaitingSettle0140) {
        const unverified = String(favState.nativeQueryUnverifiedValue01523 || '').trim();
        const committed = String(favState.nativeCommittedQuery0140 || '').trim();
        if (!unverified || unverified !== committed) return false;
        const age = Date.now() - favState.nativeQueryUnverifiedSubmittedAt01523;
        const allowLateGrid = age >= 0 && age <= FAV_NATIVE_QUERY_LATE_ACK_MS01523;
        if (!favNativeQueryHasPositiveAck01523(unverified, allowLateGrid)) return false;
        favMarkNativeQueryVerification01523(unverified, true);
        favScheduleSync(0);
        return true;
    }

    const next = String(favState.nativePendingQuery0140 || '').trim();
    const elapsed = Date.now() - favState.nativeQuerySubmittedAt0140;
    const acknowledged = favNativeQueryHasPositiveAck01523(next, true);

    /* While a submitted query is neither acknowledged nor timed out, block the
     * observation caller from indexing the transitioning native grid under the
     * previous durable scope. The non-boolean truthy sentinel is intentional:
     * module 101 increments query generation only for a real boolean `true`. */
    if (!acknowledged && elapsed < FAV_QUERY_SETTLE_FALLBACK_MS0140) return 'pending';

    /* Empty query means canonical All and is trusted by definition elsewhere.
     * Never let a timer alone promote it; otherwise a failed Clear could replace
     * canonical membership while Etsy was still showing a searched dataset. */
    if (!acknowledged && !next) return 'pending';

    return favFinalizeNativeQueryState01523(next, acknowledged);
};

/* v0.15.10 intentionally treats the module-99 state machine as a valid durable
 * provenance source. Narrow only that source: route/SSR proof remains trusted,
 * but a timeout-promoted runtime query must stay unverified until 99a has seen
 * positive acknowledgement for this exact scope/value. */
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
