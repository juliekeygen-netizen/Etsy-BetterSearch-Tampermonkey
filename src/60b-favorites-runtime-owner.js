'use strict';

/* Cross-delivery Favorites runtime ownership boundary.
 *
 * Tampermonkey and extension content scripts live in separate JavaScript
 * worlds, so their module-global flags cannot prevent both from installing
 * observers, UI, or durable queue work on the same Etsy document. The document
 * element is shared across those worlds. Claim one deliberately narrow marker
 * before any Favorites runtime startup; a later production BetterSearch copy
 * remains inert for this document. The standalone Diagnostics extension does
 * not load the shared production module chain and is intentionally unaffected.
 *
 * The marker is document-lifetime only. A navigation creates a new document,
 * so there is no cross-page persistence, owner/profile data, or stale lease to
 * clean up. Synchronous attribute read/write executes on the page's one event
 * loop, making a first-runtime-wins claim deterministic for the two injections.
 */

var FAV_RUNTIME_OWNER_ATTRIBUTE01527 = 'data-ebsf-favorites-runtime-owner';
var FAV_RUNTIME_OWNER_VALUE01527 = 'active';
var favFavoritesRuntimeActive01527 = true;

function favClaimFavoritesRuntimeOwner01527() {
    const root = document.documentElement;
    if (!root?.getAttribute || !root?.setAttribute) {
        favFavoritesRuntimeActive01527 = false;
        console.warn?.('[Etsy BetterSearch] Favorites runtime did not start because the document owner marker is unavailable.');
        return false;
    }

    const existing = String(root.getAttribute(FAV_RUNTIME_OWNER_ATTRIBUTE01527) || '').trim();
    if (existing) {
        favFavoritesRuntimeActive01527 = false;
        console.warn?.('[Etsy BetterSearch] Another BetterSearch Favorites runtime already owns this document; this copy is inactive.');
        return false;
    }

    root.setAttribute(FAV_RUNTIME_OWNER_ATTRIBUTE01527, FAV_RUNTIME_OWNER_VALUE01527);
    favFavoritesRuntimeActive01527 = root.getAttribute(FAV_RUNTIME_OWNER_ATTRIBUTE01527) === FAV_RUNTIME_OWNER_VALUE01527;
    if (!favFavoritesRuntimeActive01527) {
        console.warn?.('[Etsy BetterSearch] Favorites runtime ownership changed before startup; this copy is inactive.');
    }
    return favFavoritesRuntimeActive01527;
}

favClaimFavoritesRuntimeOwner01527();
favState.runtimeOwnerActive01527 = favFavoritesRuntimeActive01527;

/* Most late modules already gate their scheduled startup through this helper.
 * Keep that guard at the earliest shared Favorites boundary so an inactive
 * delivery cannot mount shell UI or begin catalogue/index operations. */
var isFavoritesPageBefore01527 = isFavoritesPage;
isFavoritesPage = function isFavoritesPage01527(...args) {
    return favFavoritesRuntimeActive01527 === true && isFavoritesPageBefore01527(...args);
};
