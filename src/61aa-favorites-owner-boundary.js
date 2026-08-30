'use strict';

/* v0.15.3 owner-required Favorites persistence/network boundary.
 *
 * Every durable Favorites scope is user-owned. An empty owner is therefore not
 * a harmless partial identity: it can create a second durable scope universe
 * and, for items/collections, malformed `/users//...` requests.
 *
 * This layer sits immediately after the index implementation and before the
 * catalogue/sync service. It:
 *   1. rejects ownerless scope observations before any IndexedDB write;
 *   2. rejects ownerless Favorites API scope construction before fetch;
 *   3. performs one idempotent repair of historical ownerless scope rows and
 *      removes only those exact scope-membership keys from listing records.
 */
var FAV_OWNER_SCOPE_REPAIR_KEY0153 = 'etsy-bettersearch.favorites.owner-scope-repair.v1';
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

/* Every existing index caller goes through favIndexOpen(). Block those callers
 * on the one-time repair so an old ownerless complete scope cannot be consumed
 * by cache bootstrap before the repair transaction removes it. */
var favIndexOpenBefore0153 = favIndexOpen;
favIndexOpen = function favIndexOpen0153() {
    if (favIndexOwnerRepairPromise0153) return favIndexOwnerRepairPromise0153;
    const database = favIndexOpenBefore0153();
    favIndexOwnerRepairPromise0153 = database
        .then((db) => favIndexRepairOwnerlessScopes0153(db).then(() => db))
        .catch((error) => {
            favIndexOwnerRepairPromise0153 = null;
            throw error;
        });
    return favIndexOwnerRepairPromise0153;
};

/* Storage is the final authority: even if some future caller accidentally
 * constructs owner:'', the invalid scope never reaches scopes/listings/shops. */
var favIndexObserveRecordsNowBefore0153 = favIndexObserveRecordsNow;
favIndexObserveRecordsNow = function favIndexObserveRecordsNow0153(records, options = {}) {
    const scope = options.scope || favIndexCurrentScope();
    const owner = favScopeOwner0153(scope);
    if (!owner) return Promise.resolve([]);
    return favIndexObserveRecordsNowBefore0153(records, {
        ...options,
        scope:{ ...scope, owner },
    });
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
