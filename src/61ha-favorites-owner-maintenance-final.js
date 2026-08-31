'use strict';

/* v0.15.21 final owner-maintenance boundary.
 *
 * v0.15.19 made committed owner/scope membership authoritative and demoted the
 * listing-global isFavorite field to a compatibility summary. The metadata
 * coordinator (61h) still contains an older owner-scoped maintenance helper and
 * loads later, so it unintentionally replaced v0.15.19's owner-aware
 * favIndexGetActiveListings implementation with a global-isFavorite gate.
 *
 * Keep 61h's metadata coordination behavior intact, then reassert only this one
 * persistence-reading semantic immediately afterwards. Deep queue population
 * and manual Update all resolve favIndexGetActiveListings dynamically, so they
 * now consume committed owner IDs plus the trusted post-snapshot heart overlay
 * defined by 61eb. No catalogue, cache, snapshot, or repair wrapper is reordered.
 */

favIndexGetActiveListings = async function favIndexGetActiveListings01521(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'scopes'], 'readonly');
    const [listings, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    return favOwnerActiveListings01519(listings, scopes, owner);
};
