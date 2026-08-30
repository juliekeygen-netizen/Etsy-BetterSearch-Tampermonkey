'use strict';

/* v0.13.0 committed-query identity boundary.
 *
 * The text currently sitting in Etsy's Search input is not necessarily the
 * dataset Etsy has committed to the route yet. Treat URL/SSR props as the
 * committed native query for network/cache/sync identity, while Strict/Multi
 * may continue using the live input as local filter state.
 *
 * v0.15.10 adds provenance to non-empty durable query identity. A persisted
 * query must be traceable to route/SSR state or to the final v0.13.1 committed
 * native-search state; arbitrary focused/input text is never a durable scope.
 */

function favCommittedNativeQuery0138() {
    try {
        const url = new URL(location.href);
        const routeValue = url.searchParams.has('search_query')
            ? url.searchParams.get('search_query')
            : (url.searchParams.has('q') ? url.searchParams.get('q') : null);
        if (routeValue !== null) return String(routeValue || '').trim();
    } catch (_) {}
    return String(favProps()?.query || '').trim();
}

/* A native Etsy query changes the catalogue only after Etsy commits it to the
 * route/SSR state. Strict/Multi deliberately fetch the unqueried scope and use
 * the live input only for local matching. */
favDatasetQuery = function favDatasetQuery0138() {
    return favCfg.strict || favCfg.multi ? '' : favCommittedNativeQuery0138();
};

/* Keep legacy scope-key consumers useful as a view identity. For native Etsy
 * search use the committed query; for local Strict/Multi use the live input so
 * a submitted local query can still cause a view refresh without invalidating
 * the underlying catalogue. */
favScopeKey = function favScopeKey0138() {
    const scope = favScope();
    const query = favCfg.strict || favCfg.multi ? favNativeQuery() : favCommittedNativeQuery0138();
    return `${scope.owner}|${scope.type}|${scope.id}|${query}`;
};

/* Synchronization must follow the same server-side dataset identity as the
 * cache/network loader. In Strict/Multi mode that means synchronizing the full
 * native scope, not an unsubmitted/local text value. */
favSyncCurrentScope = function favSyncCurrentScope0138() {
    return favSyncScopeDescriptor(favScope(), favDatasetQuery());
};

function favCommittedNativeQueryProvenance01510(query = favDatasetQuery()) {
    const value = String(query || '').trim();
    if (!value) return { queryCommitSource:'none', queryCommitVerified:true };

    try {
        const url = new URL(location.href);
        const routeValue = url.searchParams.has('search_query')
            ? url.searchParams.get('search_query')
            : (url.searchParams.has('q') ? url.searchParams.get('q') : null);
        if (routeValue !== null && String(routeValue || '').trim() === value) {
            return { queryCommitSource:'route', queryCommitVerified:true };
        }
    } catch (_) {}

    const propsQuery = String(favProps()?.query || '').trim();
    if (propsQuery && propsQuery === value) {
        return { queryCommitSource:'ssr-props', queryCommitVerified:true };
    }

    /* Module 99 later overrides favCommittedNativeQuery0138 with the explicit
     * submitted-query state machine. This dynamic call therefore recognizes a
     * client-side Etsy Search commit after its settle boundary, without trusting
     * the live focused input itself. */
    const committed = String(favCommittedNativeQuery0138?.() || '').trim();
    if (committed && committed === value) {
        return { queryCommitSource:'favorites-search-commit', queryCommitVerified:true };
    }

    return { queryCommitSource:'unverified', queryCommitVerified:false };
}

function favScopeWithQueryProvenance01510(scope) {
    const value = { ...(scope || {}) };
    const query = String(value.query || '').trim();
    value.query = query;
    if (!query) {
        value.queryCommitSource = 'none';
        value.queryCommitVerified = true;
        return value;
    }

    if (typeof favScopeQueryTrusted01510 === 'function' && favScopeQueryTrusted01510(value)) {
        return value;
    }
    return { ...value, ...favCommittedNativeQueryProvenance01510(query) };
}

/* Persist provenance on every current index scope. The scope record writer
 * spreads this object, so the commit source becomes part of durable cache
 * identity without changing the scopeKey format. */
var favIndexCurrentScopeBefore01510 = favIndexCurrentScope;
favIndexCurrentScope = function favIndexCurrentScope01510() {
    return favScopeWithQueryProvenance01510(favIndexCurrentScopeBefore01510());
};

/* Catalogue/sync descriptors are also persistence inputs. Preserve inherited
 * provenance for internal group-query subscopes; otherwise derive it only from
 * the current committed native query boundary. */
var favCatalogDescriptorBefore01510 = favCatalogDescriptor0141;
favCatalogDescriptor0141 = function favCatalogDescriptor01510(
    scope = favScope(),
    query = typeof favDatasetQuery === 'function' ? favDatasetQuery() : '',
) {
    return favScopeWithQueryProvenance01510(
        favCatalogDescriptorBefore01510(scope, query),
    );
};

/* 61ea supersedes 61aa's original writer with the immutable/atomic snapshot
 * implementation. Reassert query trust here, after 61ea, so this is the final
 * storage boundary. Invalid query identity simply remains an uncached view; it
 * never creates a durable Favorites scope. */
var favIndexObserveRecordsNowBefore01510 = favIndexObserveRecordsNow;
favIndexObserveRecordsNow = function favIndexObserveRecordsNow01510(records, options = {}) {
    const scope = favScopeWithQueryProvenance01510(options.scope || favIndexCurrentScope());
    if (
        !favScopeHasRequiredOwner0153(scope)
        || (typeof favScopeQueryTrusted01510 === 'function' && !favScopeQueryTrusted01510(scope))
    ) {
        return Promise.resolve([]);
    }
    return favIndexObserveRecordsNowBefore01510(records, { ...options, scope });
};
