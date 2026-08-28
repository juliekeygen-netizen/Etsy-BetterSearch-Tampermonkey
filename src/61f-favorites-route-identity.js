'use strict';

/* v0.13.0 committed-query identity boundary.
 *
 * The text currently sitting in Etsy's Search input is not necessarily the
 * dataset Etsy has committed to the route yet. Treat URL/SSR props as the
 * committed native query for network/cache/sync identity, while Strict/Multi
 * may continue using the live input as local filter state.
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
