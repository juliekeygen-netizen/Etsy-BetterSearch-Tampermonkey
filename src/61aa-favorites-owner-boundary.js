'use strict';

/* v0.15.3 owner-required Favorites persistence/network boundary.
 *
 * Every durable Favorites scope is user-owned. An empty owner is therefore not
 * a harmless partial identity: it can create a second durable scope universe
 * and, for items/collections, malformed `/users//...` requests.
 *
 * v0.15.10 extends this same persistence boundary with durable-index hygiene:
 *   - active memberships cannot retain stale removedAt tombstones;
 *   - unverified/oversized/stale query scopes are pruned together with their
 *     listing-side membership keys;
 *   - owner-scoped maintenance prefers the latest complete canonical All scope
 *     instead of unioning arbitrary retained query/collection scopes.
 */
var FAV_OWNER_SCOPE_REPAIR_KEY0153 = 'etsy-bettersearch.favorites.owner-scope-repair.v1';
var FAV_INDEX_INTEGRITY_REPAIR_KEY01510 = 'etsy-bettersearch.favorites.index-integrity-repair.v1';
var FAV_QUERY_SCOPE_GC_AT_KEY01510 = 'etsy-bettersearch.favorites.query-scope-gc-at.v1';
var FAV_QUERY_SCOPE_GC_INTERVAL_MS01510 = 6 * 60 * 60 * 1000;
var FAV_QUERY_SCOPE_TTL_MS01510 = 30 * 24 * 60 * 60 * 1000;
var FAV_QUERY_SCOPE_EMPTY_TTL_MS01510 = 24 * 60 * 60 * 1000;
var FAV_QUERY_SCOPE_MAX_PER_BASE01510 = 12;
var FAV_QUERY_SCOPE_MAX_CHARS01510 = 512;
var FAV_QUERY_COMMIT_SOURCES01510 = new Set(['route', 'ssr-props', 'favorites-search-commit']);
var favIndexOwnerRepairPromise0153 = null;

function favScopeOwner0153(scope) {
    return String(scope?.owner || '').trim();
}

function favScopeHasRequiredOwner0153(scope) {
    return Boolean(favScopeOwner0153(scope));
}

function favPruneInvalidScopeMemberships0153(listing, invalidScopeKeys) {
    const current = listing?.favoriteScopes && typeof listing.favoriteScopes === 'object'
        ? listing.favoriteScopes
        : {};
    let changed = false;
    const next = { ...current };
    for (const key of invalidScopeKeys || []) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
        delete next[key];
        changed = true;
    }
    return changed ? { ...listing, favoriteScopes:next } : listing;
}

function favScopeQueryText01510(scope) {
    return String(scope?.query || '').trim();
}

function favScopeQueryTrusted01510(scope) {
    const query = favScopeQueryText01510(scope);
    if (!query) return true;
    if (query.length > FAV_QUERY_SCOPE_MAX_CHARS01510) return false;
    return scope?.queryCommitVerified === true
        && FAV_QUERY_COMMIT_SOURCES01510.has(String(scope?.queryCommitSource || ''));
}

function favScopeFreshnessAt01510(scope) {
    return Math.max(
        0,
        Number(scope?.lastObservedAt) || 0,
        Number(scope?.snapshotCommittedAt) || 0,
        Number(scope?.lastCompleteSyncAt) || 0,
    );
}

function favScopeBaseIdentity01510(scope) {
    return [scope?.owner || '', scope?.type || 'items', scope?.id || '']
        .map((part) => encodeURIComponent(String(part)))
        .join('|');
}

function favQueryScopeKeysToPrune01510(scopes, now = Date.now()) {
    const invalid = new Set();
    const retainedByBase = new Map();
    const currentTime = Math.max(0, Number(now) || Date.now());

    for (const scope of scopes || []) {
        const query = favScopeQueryText01510(scope);
        if (!query) continue;
        const scopeKey = String(scope?.scopeKey || '');
        if (!scopeKey) continue;

        const observedAt = favScopeFreshnessAt01510(scope);
        const age = observedAt > 0 ? Math.max(0, currentTime - observedAt) : Number.POSITIVE_INFINITY;
        const committedCount = Array.isArray(scope?.listingIds)
            ? scope.listingIds.length
            : Math.max(0, Number(scope?.committedTotal) || 0);
        const zeroResult = committedCount === 0;

        if (
            !favScopeHasRequiredOwner0153(scope)
            || !favScopeQueryTrusted01510(scope)
            || age > FAV_QUERY_SCOPE_TTL_MS01510
            || (zeroResult && age > FAV_QUERY_SCOPE_EMPTY_TTL_MS01510)
        ) {
            invalid.add(scopeKey);
            continue;
        }

        const base = favScopeBaseIdentity01510(scope);
        if (!retainedByBase.has(base)) retainedByBase.set(base, []);
        retainedByBase.get(base).push({ scopeKey, observedAt });
    }

    for (const retained of retainedByBase.values()) {
        retained.sort((a, b) => b.observedAt - a.observedAt);
        for (const entry of retained.slice(FAV_QUERY_SCOPE_MAX_PER_BASE01510)) invalid.add(entry.scopeKey);
    }
    return invalid;
}

function favRepairListingIntegrity01510(listing, invalidScopeKeys = new Set()) {
    const current = listing?.favoriteScopes && typeof listing.favoriteScopes === 'object'
        ? listing.favoriteScopes
        : {};
    let changed = false;
    const nextScopes = {};

    for (const [scopeKey, membershipValue] of Object.entries(current)) {
        if (invalidScopeKeys.has(scopeKey)) {
            changed = true;
            continue;
        }
        const membership = membershipValue && typeof membershipValue === 'object'
            ? membershipValue
            : {};
        if (listing?.isFavorite === true && membership.active === true && Object.prototype.hasOwnProperty.call(membership, 'removedAt')) {
            const next = { ...membership };
            delete next.removedAt;
            nextScopes[scopeKey] = next;
            changed = true;
        } else {
            nextScopes[scopeKey] = membershipValue;
        }
    }

    return changed ? { ...listing, favoriteScopes:nextScopes } : listing;
}

function favOwnerRepairStorage0153() {
    try { return globalThis.localStorage || null; }
    catch (_) { return null; }
}

function favOwnerRepairDone0153() {
    try { return favOwnerRepairStorage0153()?.getItem(FAV_OWNER_SCOPE_REPAIR_KEY0153) === '1'; }
    catch (_) { return false; }
}

function favMarkOwnerRepairDone0153() {
    try { favOwnerRepairStorage0153()?.setItem(FAV_OWNER_SCOPE_REPAIR_KEY0153, '1'); }
    catch (_) {}
}

function favIndexIntegrityRepairDone01510() {
    try { return favOwnerRepairStorage0153()?.getItem(FAV_INDEX_INTEGRITY_REPAIR_KEY01510) === '1'; }
    catch (_) { return false; }
}

function favIndexQueryGcAt01510() {
    try { return Math.max(0, Number(favOwnerRepairStorage0153()?.getItem(FAV_QUERY_SCOPE_GC_AT_KEY01510)) || 0); }
    catch (_) { return 0; }
}

function favMarkIndexIntegrityRepairDone01510(now = Date.now()) {
    try {
        const storage = favOwnerRepairStorage0153();
        storage?.setItem(FAV_INDEX_INTEGRITY_REPAIR_KEY01510, '1');
        storage?.setItem(FAV_QUERY_SCOPE_GC_AT_KEY01510, String(Math.max(0, Number(now) || Date.now())));
    } catch (_) {}
}

/* Use one read/write upgrade-style transaction so invalid scope rows and the
 * matching listing-side membership keys are repaired as one unit. We retain
 * listing metadata itself: once its invalid membership is removed it no longer
 * belongs to any valid owner unless another legitimate scope references it. */
function favIndexRepairOwnerlessScopes0153(db) {
    if (!db || favOwnerRepairDone0153()) return Promise.resolve({ repaired:false, scopesRemoved:0, listingsUpdated:0 });

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['scopes', 'listings'], 'readwrite');
        const scopes = transaction.objectStore('scopes');
        const listings = transaction.objectStore('listings');
        const invalidScopeKeys = new Set();
        let scopesRemoved = 0;
        let listingsUpdated = 0;
        let listingScanStarted = false;

        const startListingScan = () => {
            if (listingScanStarted) return;
            listingScanStarted = true;
            if (!invalidScopeKeys.size) return;
            const request = listings.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const current = cursor.value;
                const next = favPruneInvalidScopeMemberships0153(current, invalidScopeKeys);
                if (next !== current) {
                    cursor.update(next);
                    listingsUpdated += 1;
                }
                cursor.continue();
            };
            request.onerror = () => transaction.abort();
        };

        const scopeRequest = scopes.openCursor();
        scopeRequest.onsuccess = () => {
            const cursor = scopeRequest.result;
            if (!cursor) {
                startListingScan();
                return;
            }
            const scope = cursor.value || {};
            if (!favScopeHasRequiredOwner0153(scope)) {
                const scopeKey = String(scope.scopeKey || cursor.primaryKey || '');
                if (scopeKey) invalidScopeKeys.add(scopeKey);
                cursor.delete();
                scopesRemoved += 1;
            }
            cursor.continue();
        };
        scopeRequest.onerror = () => transaction.abort();

        transaction.oncomplete = () => {
            favMarkOwnerRepairDone0153();
            resolve({ repaired:scopesRemoved > 0 || listingsUpdated > 0, scopesRemoved, listingsUpdated });
        };
        transaction.onerror = () => reject(transaction.error || new Error('Favorites owner-scope repair failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('Favorites owner-scope repair was aborted.'));
    });
}

/* v0.15.10 logical migration + recurring bounded query-cache GC.
 *
 * Legacy non-empty query scopes did not record trusted commit provenance, so
 * they cannot be distinguished from the historically observed free-form scope
 * pollution. Query scopes are caches, not the source of favorite truth: remove
 * unverifiable legacy query rows and their exact membership keys while keeping
 * listing/shop metadata. New verified query scopes remain bounded by TTL/LRU.
 *
 * This pass clears stale active-scope tombstones only on listings that are
 * currently globally favorite. It does not rewrite complete scope listingIds
 * from listing-side state; committed snapshot membership remains immutable
 * until a verified replacement commit. */
function favIndexRepairStorageIntegrity01510(db, now = Date.now()) {
    const currentTime = Math.max(0, Number(now) || Date.now());
    const migrationNeeded = !favIndexIntegrityRepairDone01510();
    const gcDue = currentTime - favIndexQueryGcAt01510() >= FAV_QUERY_SCOPE_GC_INTERVAL_MS01510;
    if (!db || (!migrationNeeded && !gcDue)) {
        return Promise.resolve({ repaired:false, scopesRemoved:0, listingsUpdated:0 });
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['scopes', 'listings'], 'readwrite');
        const scopes = transaction.objectStore('scopes');
        const listings = transaction.objectStore('listings');
        const seenScopes = [];
        const invalidScopeKeys = new Set();
        let scopesRemoved = 0;
        let listingsUpdated = 0;

        const startListingScan = () => {
            const request = listings.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const current = cursor.value;
                const next = favRepairListingIntegrity01510(current, invalidScopeKeys);
                if (next !== current) {
                    cursor.update(next);
                    listingsUpdated += 1;
                }
                cursor.continue();
            };
            request.onerror = () => transaction.abort();
        };

        const scopeRequest = scopes.openCursor();
        scopeRequest.onsuccess = () => {
            const cursor = scopeRequest.result;
            if (cursor) {
                seenScopes.push(cursor.value || {});
                cursor.continue();
                return;
            }

            for (const scopeKey of favQueryScopeKeysToPrune01510(seenScopes, currentTime)) {
                invalidScopeKeys.add(scopeKey);
                scopes.delete(scopeKey);
                scopesRemoved += 1;
            }
            startListingScan();
        };
        scopeRequest.onerror = () => transaction.abort();

        transaction.oncomplete = () => {
            favMarkIndexIntegrityRepairDone01510(currentTime);
            resolve({
                repaired:scopesRemoved > 0 || listingsUpdated > 0,
                scopesRemoved,
                listingsUpdated,
            });
        };
        transaction.onerror = () => reject(transaction.error || new Error('Favorites index integrity repair failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('Favorites index integrity repair was aborted.'));
    });
}

/* Every existing index caller goes through favIndexOpen(). Block those callers
 * on both repair transactions so invalid historical state cannot be consumed by
 * cache/bootstrap/statistics before cleanup completes. */
var favIndexOpenBefore0153 = favIndexOpen;
favIndexOpen = function favIndexOpen0153() {
    if (favIndexOwnerRepairPromise0153) return favIndexOwnerRepairPromise0153;
    const database = favIndexOpenBefore0153();
    favIndexOwnerRepairPromise0153 = database
        .then(async (db) => {
            await favIndexRepairOwnerlessScopes0153(db);
            await favIndexRepairStorageIntegrity01510(db);
            return db;
        })
        .catch((error) => {
            favIndexOwnerRepairPromise0153 = null;
            throw error;
        });
    return favIndexOwnerRepairPromise0153;
};

/* Storage is the final authority even before the later immutable-snapshot layer
 * is installed. 61f reasserts this query guard after 61ea's final writer. */
var favIndexObserveRecordsNowBefore0153 = favIndexObserveRecordsNow;
favIndexObserveRecordsNow = function favIndexObserveRecordsNow0153(records, options = {}) {
    const scope = options.scope || favIndexCurrentScope();
    const owner = favScopeOwner0153(scope);
    if (!owner || !favScopeQueryTrusted01510(scope)) return Promise.resolve([]);
    return favIndexObserveRecordsNowBefore0153(records, {
        ...options,
        scope:{ ...scope, owner },
    });
};

/* Reactivating an exact scope membership must clear its removal tombstone.
 * Keep the merge owner in 61a, then normalize the merged result once here. */
var favIndexMergeListingBefore01510 = favIndexMergeListing;
favIndexMergeListing = function favIndexMergeListing01510(existing, incoming, observedAt = Date.now()) {
    return favRepairListingIntegrity01510(
        favIndexMergeListingBefore01510(existing, incoming, observedAt),
        new Set(),
    );
};

function favCanonicalAllScope01510(scopes, owner) {
    const wantedOwner = String(owner || '');
    return Array.from(scopes || [])
        .filter((scope) =>
            String(scope?.owner || '') === wantedOwner
            && scope?.type === 'items'
            && !favScopeQueryText01510(scope)
            && scope?.complete === true
        )
        .sort((a, b) =>
            (Number(b?.snapshotCommittedAt) || Number(b?.lastCompleteSyncAt) || 0)
            - (Number(a?.snapshotCommittedAt) || Number(a?.lastCompleteSyncAt) || 0)
        )[0] || null;
}

function favOwnerScopeIds01510(scopes, owner) {
    const canonical = favCanonicalAllScope01510(scopes, owner);
    if (canonical) return new Set(Array.from(canonical.listingIds || [], String));

    /* Migration/fresh-profile fallback: without a complete All snapshot, use
     * only no-query scopes. Query caches must never broaden owner maintenance. */
    return new Set(Array.from(scopes || [])
        .filter((scope) => String(scope?.owner || '') === String(owner || '') && !favScopeQueryText01510(scope))
        .flatMap((scope) => scope?.listingIds || [])
        .map(String));
}

/* Owner stats/maintenance previously unioned every retained query/collection
 * scope. Prefer the latest complete canonical All scope, which is the only
 * durable membership snapshot with the semantics these callers need. */
favIndexGetStats = async function favIndexGetStats01510(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readonly');
    const [listings, shops, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('shops').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    const canonicalAll = owner ? favCanonicalAllScope01510(scopes, owner) : null;
    const ids = owner ? favOwnerScopeIds01510(scopes, owner) : null;
    const ownedListings = owner
        ? listings.filter((listing) => ids.has(String(listing.listingId)))
        : listings;
    const ownedShopIds = new Set(ownedListings.map((listing) => String(listing.shopId || '')).filter(Boolean));
    const activeListings = ownedListings.filter((listing) => listing.isFavorite === true);
    const deepListings = activeListings.filter((listing) => Number(listing.lastDeepScanAt) > 0);
    return {
        indexedFavorites:ownedListings.length,
        activeFavorites:activeListings.length,
        indexedShops:owner ? shops.filter((shop) => ownedShopIds.has(String(shop.shopId))).length : shops.length,
        deepMetadataFavorites:deepListings.length,
        lastDeepUpdateAt:deepListings.reduce((latest, listing) => Math.max(latest, Number(listing.lastDeepScanAt) || 0), 0),
        lastFullSyncAt:canonicalAll?.lastCompleteSyncAt || 0,
        allItemsScope:canonicalAll,
    };
};

favIndexGetActiveListings = async function favIndexGetActiveListings01510(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'scopes'], 'readonly');
    const [listings, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    if (!owner) return listings.filter((listing) => listing.isFavorite === true);
    const ids = favOwnerScopeIds01510(scopes, owner);
    return listings.filter((listing) =>
        listing.isFavorite === true
        && ids.has(String(listing.listingId))
    );
};

/* Guard the request boundary too. This prevents both `/users//favorites/...`
 * and `/users//collections/...` and also avoids ownerless group work even though
 * that endpoint does not encode the owner in its URL. */
var favApiUrlForScopeBefore0153 = favApiUrlForScope;
favApiUrlForScope = function favApiUrlForScope0153(scope, offset, limit, query = '') {
    const owner = favScopeOwner0153(scope);
    if (!owner) throw new Error('Could not determine the Favorites profile owner.');
    return favApiUrlForScopeBefore0153({ ...scope, owner }, offset, limit, query);
};