'use strict';

/* v0.15.19 owner-specific Favorites membership boundary.
 *
 * Listing metadata is global by listing ID, but Favorites membership is not.
 * The historical index also carried one global listing.isFavorite boolean and
 * allowed an authoritative All refresh for owner A to deactivate every stored
 * owner membership for the same listing. Cache/statistics then used that global
 * boolean as a gate, so owner B could disappear because owner A changed.
 *
 * This module is an early data-semantic owner. It loads after cache bootstrap
 * and before immutable snapshot commits. From here onward:
 *  - committed scope listingIds are authoritative membership for that scope;
 *  - listing.favoriteScopes is owner/scope evidence, never global authority;
 *  - listing.isFavorite is compatibility summary only;
 *  - exact scope completion retires only that exact scope membership;
 *  - a direct heart removal may retire only the verified viewer's own owner
 *    memberships, never another profile owner's membership.
 */

var FAV_MULTI_OWNER_REPAIR_KEY01519 = 'etsy-bettersearch.favorites.multi-owner-repair.v1';
var favMultiOwnerRepairPromise01519 = null;

function favIndexScopeOwnerFromKey01519(scopeKey) {
    const first = String(scopeKey || '').split('|', 1)[0] || '';
    if (!first) return '';
    try { return decodeURIComponent(first); }
    catch (_) { return first; }
}

function favIndexAnyActiveMembership01519(favoriteScopes) {
    return Object.values(favoriteScopes || {}).some((membership) => membership?.active === true);
}

function favIndexNormalizeMembershipSummary01519(listing, options = {}) {
    if (!listing) return listing;
    const scopes = listing.favoriteScopes && typeof listing.favoriteScopes === 'object'
        ? listing.favoriteScopes
        : {};
    const anyActive = favIndexAnyActiveMembership01519(scopes);
    if (anyActive) {
        if (listing.isFavorite === true && !listing.unfavoritedAt) return listing;
        return { ...listing, isFavorite:true, unfavoritedAt:0 };
    }
    if (options.allowDeactivate === true) {
        const observedAt = Math.max(0, Number(options.observedAt) || Date.now());
        if (listing.isFavorite === false && Number(listing.unfavoritedAt) === observedAt) return listing;
        return { ...listing, isFavorite:false, unfavoritedAt:observedAt };
    }
    return listing;
}

function favIndexMergeMembershipState01519(existing, incoming, merged, observedAt = Date.now()) {
    const oldScopes = existing?.favoriteScopes && typeof existing.favoriteScopes === 'object'
        ? existing.favoriteScopes
        : {};
    const scopes = { ...(merged?.favoriteScopes || oldScopes) };

    for (const [scopeKey, membershipValue] of Object.entries(incoming?.favoriteScopes || {})) {
        const membership = membershipValue && typeof membershipValue === 'object'
            ? membershipValue
            : {};
        const previous = oldScopes[scopeKey] && typeof oldScopes[scopeKey] === 'object'
            ? oldScopes[scopeKey]
            : {};
        const incomingAt = Math.max(
            0,
            Number(membership.lastSeenAt) || 0,
            Number(incoming?.lastSeenFavoriteAt) || 0,
            Number(observedAt) || 0,
        );
        const removedAt = Math.max(0, Number(previous.removedAt) || 0);

        /* A stale observation may not resurrect the SAME scope after newer
         * removal evidence. Another owner's scope is independent and is never
         * blocked by a listing-global unfavorite timestamp. */
        if (membership.active === true && previous.active === false && removedAt > incomingAt) continue;

        const next = { ...previous, ...membership };
        if (next.active === true && Object.prototype.hasOwnProperty.call(next, 'removedAt')) delete next.removedAt;
        scopes[scopeKey] = next;
    }

    let next = { ...(merged || existing || {}), favoriteScopes:scopes };
    const hasActive = favIndexAnyActiveMembership01519(scopes);
    if (hasActive) {
        next = { ...next, isFavorite:true, unfavoritedAt:0 };
    } else if (incoming?.isFavorite === false) {
        next = {
            ...next,
            isFavorite:false,
            unfavoritedAt:Math.max(0, Number(incoming.unfavoritedAt) || Number(observedAt) || Date.now()),
        };
    } else if (existing?.isFavorite === false) {
        next = { ...next, isFavorite:false, unfavoritedAt:Math.max(0, Number(existing.unfavoritedAt) || 0) };
    }
    return next;
}

/* The historical merge may suppress a positive scope patch because another
 * owner's newer global unfavorite timestamp exists. Re-apply membership at the
 * owner/scope boundary after metadata/presentation merging, using only the exact
 * scope's own removal evidence to reject a stale reactivation. */
var favIndexMergeListingBefore01519 = favIndexMergeListing;
favIndexMergeListing = function favIndexMergeListing01519(existing, incoming, observedAt = Date.now()) {
    const merged = favIndexMergeListingBefore01519(existing, incoming, observedAt);
    return favIndexMergeMembershipState01519(existing, incoming, merged, observedAt);
};

function favIndexMarkScopeInactive01519(existing, scopeKey, observedAt = Date.now(), options = {}) {
    if (!existing || !scopeKey) return existing;
    const current = existing.favoriteScopes && typeof existing.favoriteScopes === 'object'
        ? existing.favoriteScopes
        : {};
    const membership = current[scopeKey];
    if (!membership?.active) return existing;
    const scopes = {
        ...current,
        [scopeKey]: { ...membership, active:false, removedAt:observedAt },
    };
    return favIndexNormalizeMembershipSummary01519(
        { ...existing, favoriteScopes:scopes },
        { allowDeactivate:options.authoritative === true, observedAt },
    );
}

/* Complete replacement of one scope may retire only that scope. A no-query All
 * commit is authoritative for that owner/scope, not for every profile stored in
 * the same listing row. */
favIndexApplyScopeCompletion = function favIndexApplyScopeCompletion01519(listings, scope, observedIds, observedAt = Date.now()) {
    const scopeKey = scope?.scopeKey || favIndexScopeKey(scope);
    const seen = new Set(Array.from(observedIds || [], String));
    return (listings || []).map((listing) => {
        if (!listing || seen.has(String(listing.listingId))) return listing;
        return favIndexMarkScopeInactive01519(
            listing,
            scopeKey,
            observedAt,
            { authoritative:scope?.authoritativeFavoriteScope === true },
        );
    });
};

function favIndexMarkListingUnfavoriteForOwner01519(existing, owner, observedAt = Date.now()) {
    const wantedOwner = String(owner || '').trim();
    if (!existing || !wantedOwner) return existing;
    const current = existing.favoriteScopes && typeof existing.favoriteScopes === 'object'
        ? existing.favoriteScopes
        : {};
    let changed = false;
    const scopes = {};

    for (const [scopeKey, membershipValue] of Object.entries(current)) {
        const membership = membershipValue && typeof membershipValue === 'object'
            ? membershipValue
            : {};
        if (favIndexScopeOwnerFromKey01519(scopeKey) !== wantedOwner || membership.active !== true) {
            scopes[scopeKey] = membershipValue;
            continue;
        }
        scopes[scopeKey] = { ...membership, active:false, removedAt:observedAt };
        changed = true;
    }
    if (!changed) return existing;
    return favIndexNormalizeMembershipSummary01519(
        { ...existing, favoriteScopes:scopes },
        { allowDeactivate:true, observedAt },
    );
}

/* Keep the historical helper name for compatibility, but require an explicit
 * owner. An ownerless call is fail-closed and cannot globally retire profiles. */
favIndexMarkListingUnfavorite = function favIndexMarkListingUnfavorite01519(existing, observedAt = Date.now(), owner = '') {
    return favIndexMarkListingUnfavoriteForOwner01519(existing, owner, observedAt);
};

function favIndexOwnProfileOwner01519() {
    try {
        if (!favIsOwnFavoritesPage()) return '';
        return String(favScope()?.owner || '').trim();
    } catch (_) {
        return '';
    }
}

/* Direct heart actions use one readwrite transaction so a stale tab-local row
 * cannot erase concurrent metadata/membership changes. If this is not proven to
 * be the viewer's own profile, do not mutate durable profile membership at all. */
favIndexMarkUnfavoriteNow = async function favIndexMarkUnfavoriteNow01519(listingId, observedAt = Date.now(), options = {}) {
    const idValue = String(listingId || '');
    const owner = String(options?.owner || '').trim();
    if (!idValue || !owner) return false;
    const db = await favIndexOpen();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['listings'], 'readwrite');
        const store = transaction.objectStore('listings');
        const request = store.get(idValue);
        let changed = false;
        let failure = null;

        request.onsuccess = () => {
            try {
                const existing = request.result;
                if (!existing) return;
                const next = favIndexMarkListingUnfavoriteForOwner01519(existing, owner, observedAt);
                if (next === existing) return;
                store.put(next);
                changed = true;
            } catch (error) {
                failure = error;
                try { transaction.abort(); } catch (_) {}
            }
        };
        request.onerror = () => {
            failure = request.error || new Error('Favorites listing read failed.');
            try { transaction.abort(); } catch (_) {}
        };
        transaction.oncomplete = () => resolve(changed);
        transaction.onerror = () => reject(failure || transaction.error || new Error('Favorites unfavorite transaction failed.'));
        transaction.onabort = () => reject(failure || transaction.error || new Error('Favorites unfavorite transaction aborted.'));
    });
};

favIndexMarkUnfavorite = function favIndexMarkUnfavorite01519(listingId, observedAt = Date.now(), options = {}) {
    if (observedAt && typeof observedAt === 'object') {
        options = observedAt;
        observedAt = Date.now();
    }
    const owner = String(options?.owner || favIndexOwnProfileOwner01519()).trim();
    if (!owner) return Promise.resolve(false);
    return favIndexEnqueue(() => favIndexMarkUnfavoriteNow(listingId, observedAt, { ...options, owner }));
};

/* Committed scope membership is already represented by snapshot.ids. Do not let
 * legacy global isFavorite or a contradictory listing-side membership veto the
 * immutable committed snapshot. Adapt only the temporary read view, never the
 * durable listing row. */
function favCacheOwnerMembershipView01519(snapshot) {
    if (!snapshot) return snapshot;
    const scopeKey = String(snapshot?.scope?.scopeKey || snapshot?.scopeRecord?.scopeKey || '');
    const listingById = new Map(snapshot.listingById || []);
    for (const idValue of snapshot.ids || []) {
        const id = String(idValue);
        const listing = listingById.get(id);
        if (!listing) continue;
        const memberships = { ...(listing.favoriteScopes || {}) };
        if (scopeKey) {
            const membership = { ...(memberships[scopeKey] || {}), active:true };
            delete membership.removedAt;
            memberships[scopeKey] = membership;
        }
        listingById.set(id, { ...listing, isFavorite:true, unfavoritedAt:0, favoriteScopes:memberships });
    }
    return { ...snapshot, listingById };
}

var favCacheMaterializeScopeBefore01519 = favCacheMaterializeScope0137;
favCacheMaterializeScope0137 = function favCacheMaterializeScope01519(snapshot) {
    return favCacheMaterializeScopeBefore01519(favCacheOwnerMembershipView01519(snapshot));
};

var favCachePresentationReadyForScopeBefore01519 = favCachePresentationReadyForScope0137;
favCachePresentationReadyForScope0137 = function favCachePresentationReadyForScope01519(snapshot) {
    return favCachePresentationReadyForScopeBefore01519(favCacheOwnerMembershipView01519(snapshot));
};

function favOwnerActiveListings01519(listings, scopes, owner) {
    const wantedOwner = String(owner || '').trim();
    if (!wantedOwner) {
        return Array.from(listings || []).filter((listing) =>
            listing?.isFavorite === true || favIndexAnyActiveMembership01519(listing?.favoriteScopes)
        );
    }
    const ids = favOwnerScopeIds01510(scopes, wantedOwner);
    return Array.from(listings || []).filter((listing) => ids.has(String(listing?.listingId || '')));
}

/* Owner-scoped maintenance/counts derive activity from that owner's committed
 * scope IDs. The global summary remains only the ownerless legacy fallback. */
favIndexGetStats = async function favIndexGetStats01519(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'shops', 'scopes'], 'readonly');
    const [listings, shops, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('shops').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    const wantedOwner = String(owner || '').trim();
    const canonicalAll = wantedOwner ? favCanonicalAllScope01510(scopes, wantedOwner) : null;
    const ids = wantedOwner ? favOwnerScopeIds01510(scopes, wantedOwner) : null;
    const ownedListings = wantedOwner
        ? listings.filter((listing) => ids.has(String(listing.listingId)))
        : listings;
    const activeListings = favOwnerActiveListings01519(ownedListings, scopes, wantedOwner);
    const ownedShopIds = new Set(ownedListings.map((listing) => String(listing.shopId || '')).filter(Boolean));
    const deepListings = activeListings.filter((listing) => Number(listing.lastDeepScanAt) > 0);
    return {
        indexedFavorites:ownedListings.length,
        activeFavorites:activeListings.length,
        indexedShops:wantedOwner ? shops.filter((shop) => ownedShopIds.has(String(shop.shopId))).length : shops.length,
        deepMetadataFavorites:deepListings.length,
        lastDeepUpdateAt:deepListings.reduce((latest, listing) => Math.max(latest, Number(listing.lastDeepScanAt) || 0), 0),
        lastFullSyncAt:canonicalAll?.lastCompleteSyncAt || 0,
        allItemsScope:canonicalAll,
    };
};

favIndexGetActiveListings = async function favIndexGetActiveListings01519(owner = '') {
    const db = await favIndexOpen();
    const transaction = db.transaction(['listings', 'scopes'], 'readonly');
    const [listings, scopes] = await Promise.all([
        favIndexRequest(transaction.objectStore('listings').getAll()),
        favIndexRequest(transaction.objectStore('scopes').getAll()),
    ]);
    return favOwnerActiveListings01519(listings, scopes, owner);
};

/* Active memberships never carry a removal tombstone, regardless of the legacy
 * global summary. Keep the v0.15.10 query-membership cleanup, then normalize the
 * compatibility summary positively when any owner membership is active. */
var favRepairListingIntegrityBefore01519 = favRepairListingIntegrity01510;
favRepairListingIntegrity01510 = function favRepairListingIntegrity01519(listing, invalidScopeKeys = new Set()) {
    const repaired = favRepairListingIntegrityBefore01519(listing, invalidScopeKeys);
    if (!repaired) return repaired;
    const current = repaired.favoriteScopes && typeof repaired.favoriteScopes === 'object'
        ? repaired.favoriteScopes
        : {};
    let changed = false;
    const scopes = {};
    for (const [scopeKey, membershipValue] of Object.entries(current)) {
        const membership = membershipValue && typeof membershipValue === 'object'
            ? membershipValue
            : {};
        if (membership.active === true && Object.prototype.hasOwnProperty.call(membership, 'removedAt')) {
            const next = { ...membership };
            delete next.removedAt;
            scopes[scopeKey] = next;
            changed = true;
        } else {
            scopes[scopeKey] = membershipValue;
        }
    }
    let next = changed ? { ...repaired, favoriteScopes:scopes } : repaired;
    if (favIndexAnyActiveMembership01519(next.favoriteScopes) && (next.isFavorite !== true || next.unfavoritedAt)) {
        next = { ...next, isFavorite:true, unfavoritedAt:0 };
    }
    return next;
};

function favMultiOwnerRepairDone01519() {
    try { return globalThis.localStorage?.getItem(FAV_MULTI_OWNER_REPAIR_KEY01519) === '1'; }
    catch (_) { return false; }
}

function favMarkMultiOwnerRepairDone01519() {
    try { globalThis.localStorage?.setItem(FAV_MULTI_OWNER_REPAIR_KEY01519, '1'); }
    catch (_) {}
}

function favIndexRepairMultiOwnerMembership01519(db) {
    if (!db || favMultiOwnerRepairDone01519()) return Promise.resolve({ repaired:false, listingsUpdated:0 });
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['listings'], 'readwrite');
        const store = transaction.objectStore('listings');
        let listingsUpdated = 0;
        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const current = cursor.value;
            const next = favRepairListingIntegrity01510(current, new Set());
            if (next !== current) {
                cursor.update(next);
                listingsUpdated += 1;
            }
            cursor.continue();
        };
        request.onerror = () => transaction.abort();
        transaction.oncomplete = () => {
            favMarkMultiOwnerRepairDone01519();
            resolve({ repaired:listingsUpdated > 0, listingsUpdated });
        };
        transaction.onerror = () => reject(transaction.error || new Error('Favorites multi-owner repair failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('Favorites multi-owner repair was aborted.'));
    });
}

var favIndexOpenBefore01519 = favIndexOpen;
favIndexOpen = function favIndexOpen01519() {
    if (favMultiOwnerRepairPromise01519) return favMultiOwnerRepairPromise01519;
    favMultiOwnerRepairPromise01519 = Promise.resolve(favIndexOpenBefore01519())
        .then(async (db) => {
            await favIndexRepairMultiOwnerMembership01519(db);
            return db;
        })
        .catch((error) => {
            favMultiOwnerRepairPromise01519 = null;
            throw error;
        });
    return favMultiOwnerRepairPromise01519;
};
