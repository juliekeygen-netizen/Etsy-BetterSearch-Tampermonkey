'use strict';

/* v0.13.1 Favorites correctness hotfix.
 *
 * This layer fixes data/lifecycle regressions discovered after the cache-first
 * v0.13.0 rollout without changing the frozen v0.12.15 Favorites geometry.
 * It is intentionally loaded after the native page-state adapter and before the
 * deferred runtime is released by the final UI modules.
 */
var FAV_QUERY_SETTLE_FALLBACK_MS0140 = 850;
var FAV_VIEW_NATIVE_SETTLE_FALLBACK_MS0140 = 1200;

favState.presentationMigrationKey0140 = favState.presentationMigrationKey0140 || '';
favState.presentationMigrationPromise0140 = favState.presentationMigrationPromise0140 || null;
favState.nativeQueryScope0140 = favState.nativeQueryScope0140 || '';
favState.nativeCommittedQuery0140 = typeof favState.nativeCommittedQuery0140 === 'string' ? favState.nativeCommittedQuery0140 : '';
favState.nativePendingQuery0140 = typeof favState.nativePendingQuery0140 === 'string' ? favState.nativePendingQuery0140 : '';
favState.nativeQueryPendingDirty0140 = favState.nativeQueryPendingDirty0140 === true;
favState.nativeQueryAwaitingSettle0140 = favState.nativeQueryAwaitingSettle0140 === true;
favState.nativeQuerySubmittedAt0140 = Math.max(0, Number(favState.nativeQuerySubmittedAt0140) || 0);
favState.nativeQuerySubmitFingerprint0140 = favState.nativeQuerySubmitFingerprint0140 || '';
favState.nativeQuerySettleTimers0140 = Array.isArray(favState.nativeQuerySettleTimers0140) ? favState.nativeQuerySettleTimers0140 : [];
favState.viewRenderFallback0140 = Number(favState.viewRenderFallback0140) || 0;

function favFirstUsableImage0140(...values) {
    for (const value of values.flat(Infinity)) {
        const text = String(value || '').trim();
        if (!text || /^data:/i.test(text) || /^blob:/i.test(text)) continue;
        return text;
    }
    return '';
}

function favListingImageCandidates0140(listing) {
    const firstImage = Array.isArray(listing?.images) ? listing.images[0] : null;
    return [
        listing?.imageUrl,
        listing?.primaryImageUrl,
        listing?.image?.url,
        listing?.image?.url_570xN,
        listing?.image?.url_300x300,
        listing?.image?.url_fullxfull,
        firstImage?.url,
        firstImage?.url_570xN,
        firstImage?.url_300x300,
        firstImage?.url_fullxfull,
    ];
}

function favNodeImageUrl0140(node) {
    const image = node?.querySelector?.('img[data-clg-id="WtImage"], img.wt-image, img[alt], img[src]');
    if (!image) return '';
    const srcset = String(image.getAttribute?.('srcset') || '').trim();
    const srcsetFirst = srcset ? srcset.split(',')[0]?.trim().split(/\s+/)[0] : '';
    return favFirstUsableImage0140(
        image.currentSrc,
        image.src,
        image.getAttribute?.('src'),
        image.getAttribute?.('data-src'),
        srcsetFirst,
    );
}

/* Etsy occasionally omits the flat imageUrl field while the native card (or a
 * nested image object) still has a perfectly usable thumbnail. Preserve that
 * presentation data before it is written to IndexedDB. */
var favRecordFromListingBefore0140 = favRecordFromListing;
favRecordFromListing = function favRecordFromListing0140(listing, node, order) {
    const record = favRecordFromListingBefore0140(listing, node, order);
    if (!record.imageUrl) {
        record.imageUrl = favFirstUsableImage0140(
            favListingImageCandidates0140(listing),
            favNodeImageUrl0140(node),
            record.secondaryImageUrl,
        );
    }
    if (!record.secondaryImageUrl) {
        record.secondaryImageUrl = favFirstUsableImage0140(
            listing?.secondaryImageUrl,
            Array.isArray(listing?.images) && listing.images.length > 1
                ? favListingImageCandidates0140({ images:[listing.images[1]] })
                : '',
        );
    }
    return record;
};

function favIndexedPresentationRenderable0140(indexed, liveNode = null, liveListing = null) {
    if (!indexed || indexed.isFavorite !== true) return true;
    const state = String(indexed.availabilityState || '').toLowerCase();
    if (state === 'deleted' || state === 'unavailable') return true;

    const presentation = indexed.presentationSnapshot || {};
    const versionReady = Number(presentation.version) >= FAV_CACHE_PRESENTATION_VERSION0137;
    const liveImage = favFirstUsableImage0140(
        favListingImageCandidates0140(liveListing),
        favNodeImageUrl0140(liveNode),
    );
    const cachedImage = favFirstUsableImage0140(presentation.imageUrl, presentation.secondaryImageUrl);
    return versionReady
        && Boolean(liveImage || cachedImage)
        && Boolean(String(indexed.title || liveListing?.title || '').trim())
        && Boolean(String(indexed.url || liveListing?.url || '').trim());
}

/* A snapshot version alone is not presentation readiness. A v1 record with an
 * empty image URL was the direct cause of image-less synthetic cards. */
favCachePresentationReadyForScope0137 = function favCachePresentationReadyForScope0140(snapshot) {
    if (!snapshot) return false;
    const liveNodes = favCardMap(document);
    const liveListings = new Map(
        favListingsFromProps(favProps()).map((listing) => [String(listing?.listingId ?? listing?.listing_id ?? ''), listing])
    );
    return snapshot.ids.every((idValue) => {
        const id = String(idValue);
        const indexed = snapshot.listingById.get(id);
        if (!indexed || indexed.isFavorite !== true) return true;
        const membership = indexed.favoriteScopes?.[snapshot.scope.scopeKey];
        if (membership?.active === false) return true;
        return favIndexedPresentationRenderable0140(indexed, liveNodes.get(id), liveListings.get(id));
    });
};

/* Complete scope reconciliation only needs records that belong to the old
 * scope plus the incoming patches. Avoid loading every listing ever stored in
 * IndexedDB just because one scope completed a refresh. */
favIndexReadObservation = async function favIndexReadObservation0140(patches, scopeKey, complete) {
    const db = await favIndexOpen();
    const scope = await favIndexRequest(
        db.transaction('scopes', 'readonly').objectStore('scopes').get(scopeKey)
    );
    const patchIds = patches.map((patch) => String(patch.listingId || '')).filter(Boolean);
    const listingIds = complete
        ? Array.from(new Set([...(scope?.listingIds || []).map(String), ...patchIds]))
        : Array.from(new Set(patchIds));
    const shopIds = Array.from(new Set(patches.map((patch) => patch.shop?.shopId).filter(Boolean)));
    const transaction = db.transaction(['listings', 'shops'], 'readonly');
    const listingStore = transaction.objectStore('listings');
    const shopStore = transaction.objectStore('shops');
    const [listings, shops] = await Promise.all([
        Promise.all(listingIds.map((idValue) => favIndexRequest(listingStore.get(idValue)))),
        Promise.all(shopIds.map((shopId) => favIndexRequest(shopStore.get(shopId)))),
    ]);
    return { listings, shops, shopIds, scope };
};

function favRecordPresentationRenderable0140(record) {
    if (!record) return false;
    return Boolean(
        favFirstUsableImage0140(record.imageUrl, record.secondaryImageUrl, favNodeImageUrl0140(record.html ? (() => {
            try {
                const template = document.createElement('template');
                template.innerHTML = String(record.html || '').trim();
                return template.content.firstElementChild;
            } catch (_) {
                return null;
            }
        })() : null))
    );
}

async function favFinalizeNetworkPresentation0140(key, records) {
    if (!isFavoritesPage() || favDatasetKey() !== key || !favState.loadComplete) return records;
    favState.loadSource0137 = 'network';
    let snapshot = null;
    try {
        snapshot = await favCacheReadScope0137(favIndexCurrentScope());
    } catch (_) {}
    if (!isFavoritesPage() || favDatasetKey() !== key) return records;
    favState.cacheScope0137 = snapshot?.scopeRecord
        || await favIndexGetScope(favIndexCurrentScope().scopeKey).catch(() => null);
    favState.cachePresentationReady0137 = snapshot
        ? favCachePresentationReadyForScope0137(snapshot)
        : (Array.isArray(records) && records.every(favRecordPresentationRenderable0140));
    return records;
}

async function favRunPresentationMigration0140(key) {
    if (favState.presentationMigrationKey0140 === key && favState.presentationMigrationPromise0140) {
        return favState.presentationMigrationPromise0140;
    }
    favState.presentationMigrationKey0140 = key;
    const promise = (async () => {
        /* Cache hydration sets loadComplete=true, so force must be true here.
         * Calling the original loader with false silently returns the incomplete
         * cache and was the central v0.13.0 migration bug. */
        const records = await favLoadAllNetwork0137(true);
        return favFinalizeNetworkPresentation0140(key, records);
    })();
    favState.presentationMigrationPromise0140 = promise.finally(() => {
        if (favState.presentationMigrationKey0140 === key) {
            favState.presentationMigrationPromise0140 = null;
        }
    });
    return favState.presentationMigrationPromise0140;
}

/* Final cache-first loader. Missing cache uses the normal network loader;
 * incomplete presentation cache gets exactly one deduplicated forced migration
 * refresh. Source/readiness flags are only promoted after a real complete load. */
favLoadAll = async function favLoadAllCacheFirst0140(force = false) {
    const key = favDatasetKey();
    if (force) {
        const records = await favLoadAllNetwork0137(true);
        return favFinalizeNetworkPresentation0140(key, records);
    }
    if (favState.loadKey === key && favState.loadComplete && favState.loadSource0137 !== 'cache') {
        return favState.records;
    }
    const primed = await favPrimeDatasetFromCache0137();
    if (primed && favState.cachePresentationReady0137) return favState.records;
    if (primed) return favRunPresentationMigration0140(key);
    const records = await favLoadAllNetwork0137(false);
    return favFinalizeNetworkPresentation0140(key, records);
};

var favCommittedNativeQueryBefore0140 = favCommittedNativeQuery0138;

function favNativeQueryScopeIdentity0140() {
    const scope = favScope();
    return `${scope.owner}|${scope.type}|${scope.id}`;
}

function favEnsureNativeQueryScope0140() {
    const scopeKey = favNativeQueryScopeIdentity0140();
    if (favState.nativeQueryScope0140 === scopeKey) return;
    const initial = String(favCommittedNativeQueryBefore0140?.() || '').trim();
    favState.nativeQueryScope0140 = scopeKey;
    favState.nativeCommittedQuery0140 = initial;
    favState.nativePendingQuery0140 = initial;
    favState.nativeQueryPendingDirty0140 = false;
    favState.nativeQueryAwaitingSettle0140 = false;
    favState.nativeQuerySubmittedAt0140 = 0;
    favState.nativeQuerySubmitFingerprint0140 = '';
}

/* Native Favorites search is React/API state: the URL often never changes.
 * Keep an explicit committed value per Favorites scope instead of repeatedly
 * falling back to stale SSR props. */
favCommittedNativeQuery0138 = function favCommittedNativeQuery0140() {
    favEnsureNativeQueryScope0140();
    return favState.nativeCommittedQuery0140;
};

function favIsFavoritesSearchInput0140(input) {
    if (!input?.matches?.('input')) return false;
    if (input.closest?.('.ebsf-native-search-slot')) return true;
    const placeholder = String(input.getAttribute?.('placeholder') || '').toLowerCase();
    return placeholder === 'search your favorites' || placeholder === 'search within this collection';
}

function favNativeGridFingerprint0140() {
    const grid = favMainGrid();
    if (!grid) return '';
    return Array.from(grid.children)
        .map((node) => favListingIdFromNode(node))
        .filter(Boolean)
        .join(',');
}

function favRememberNativeQueryDraft0140(input) {
    if (favCfg.strict || favCfg.multi || !favIsFavoritesSearchInput0140(input)) return;
    favEnsureNativeQueryScope0140();
    const value = String(input.value || '').trim();
    favState.nativePendingQuery0140 = value;
    favState.nativeQueryPendingDirty0140 = value !== favState.nativeCommittedQuery0140;
}

function favClearNativeQuerySettleTimers0140() {
    for (const timer of favState.nativeQuerySettleTimers0140.splice(0)) clearTimeout(timer);
}

function favScheduleNativeQuerySettle0140() {
    favClearNativeQuerySettleTimers0140();
    for (const delay of [180, 420, FAV_QUERY_SETTLE_FALLBACK_MS0140]) {
        favState.nativeQuerySettleTimers0140.push(setTimeout(() => {
            if (!isFavoritesPage() || !favState.nativeQueryAwaitingSettle0140) return;
            favScheduleCurrentPageObservation(0);
        }, delay));
    }
}

function favMarkNativeQuerySubmitted0140(input) {
    if (favCfg.strict || favCfg.multi || !favIsFavoritesSearchInput0140(input)) return;
    favRememberNativeQueryDraft0140(input);
    favState.nativeQueryAwaitingSettle0140 = true;
    favState.nativeQuerySubmittedAt0140 = Date.now();
    favState.nativeQuerySubmitFingerprint0140 = favNativeGridFingerprint0140();
    favScheduleNativeQuerySettle0140();
}

function favMaybeCommitSubmittedNativeQuery0140() {
    if (favCfg.strict || favCfg.multi || !favState.nativeQueryAwaitingSettle0140) return false;
    favEnsureNativeQueryScope0140();
    const elapsed = Date.now() - favState.nativeQuerySubmittedAt0140;
    const fingerprint = favNativeGridFingerprint0140();
    const changedGrid = Boolean(fingerprint && fingerprint !== favState.nativeQuerySubmitFingerprint0140);
    if (!changedGrid && elapsed < FAV_QUERY_SETTLE_FALLBACK_MS0140) return false;

    const next = String(favState.nativePendingQuery0140 || '').trim();
    const changed = next !== favState.nativeCommittedQuery0140;
    favState.nativeCommittedQuery0140 = next;
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
    /* Let the existing dataset-change classifier perform the reset. Returning
     * before current-page indexing prevents search results being stored under
     * the old query scope. */
    favScheduleSync(0);
    return true;
}

document.addEventListener('input', (event) => {
    if (favIsFavoritesSearchInput0140(event.target)) favRememberNativeQueryDraft0140(event.target);
}, true);
document.addEventListener('search', (event) => {
    if (!favIsFavoritesSearchInput0140(event.target)) return;
    favRememberNativeQueryDraft0140(event.target);
    favMarkNativeQuerySubmitted0140(event.target);
}, true);
document.addEventListener('submit', (event) => {
    const input = event.target?.querySelector?.('input[placeholder="Search your favorites"],input[placeholder="Search within this collection"]');
    if (input) favMarkNativeQuerySubmitted0140(input);
}, true);

function favClearViewRenderFallback0140() {
    clearTimeout(favState.viewRenderFallback0140);
    favState.viewRenderFallback0140 = 0;
}

/* Page-only navigation must let Etsy reconcile its new native 20-card page
 * before BetterSearch swaps in cached enhanced results. This preserves fresh
 * native cards as presentation sources and removes the 15ms cache-overwrite
 * race observed in the HAR. */
favRefreshForViewChange0137 = function favRefreshForViewChange0140() {
    const requestKey = favDatasetKey();
    const viewKey = favViewKey0137();
    favSyncHandleRouteChange();
    favEnsureToolbar();
    favBindNativeSearch();
    favState.nativeCaptureViewKey0137 = '';
    favScheduleCurrentPageObservation(350);

    if (!favEnhancementActive()) {
        favClearViewRenderFallback0140();
        favClearNativeViewCapture0137();
        if (favState.filterOpen && favState.rail?.isConnected) favRefreshRail();
        return;
    }

    if (favState.loadKey !== requestKey || !favState.loadComplete) {
        favClearViewRenderFallback0140();
        void favRefreshRouteData();
        return;
    }

    favClearViewRenderFallback0140();
    favState.viewRenderFallback0140 = setTimeout(() => {
        favState.viewRenderFallback0140 = 0;
        if (!isFavoritesPage() || favDatasetKey() !== requestKey || favViewKey0137() !== viewKey) return;
        if (!favEnhancementActive() || favState.loadKey !== requestKey || !favState.loadComplete) return;
        favRenderCurrent();
        favUpdateScopeHeader0120?.();
    }, FAV_VIEW_NATIVE_SETTLE_FALLBACK_MS0140);
};

/* Rebind the observation boundary so submitted native queries are committed
 * before indexing and page transitions cancel the slow fallback as soon as a
 * fresh native page has been captured. */
favScheduleCurrentPageObservation = function favScheduleCurrentPageObservation0140(delay = 1000) {
    clearTimeout(favState.observeTimer);
    favState.observeTimer = setTimeout(() => {
        if (!isFavoritesPage() || favState.rendering) return;
        if (favMaybeCommitSubmittedNativeQuery0140()) return;
        const recaptured = favMaybeCaptureSettledNativePage0137();
        if (recaptured) favClearViewRenderFallback0140();
        favIndexObserveCurrentPage().catch(() => {});
        if (recaptured && favEnhancementActive() && favState.loadKey === favDatasetKey() && favState.loadComplete) {
            requestAnimationFrame(() => {
                if (isFavoritesPage() && favEnhancementActive()) favRenderCurrent();
            });
        }
    }, delay);
};

function favMutationContainsRail0140(node) {
    const element = favMutationElement0128(node);
    return Boolean(element?.matches?.('[data-ebsf-rail]') || element?.querySelector?.('[data-ebsf-rail]'));
}

var favShellMutationRelevantBefore0140 = favShellMutationRelevant0128;
function favShellMutationRelevant0140(record) {
    const target = favMutationElement0128(record.target);
    const removed = Array.from(record.removedNodes || []);
    if (removed.some(favMutationContainsRail0140)) return true;

    const sidebar = target?.closest?.('[data-testid="sidebar"]');
    if (sidebar && isFavoritesPage() && favDesktopShell0120() && !sidebar.querySelector('[data-ebsf-rail]')) return true;
    return favShellMutationRelevantBefore0140(record);
}

/* Module 94 replaced the earlier self-healing observer and accidentally made a
 * removed BetterSearch rail invisible to the repair predicate. Install the
 * corrected final observer before runtime starts. */
favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120 = new MutationObserver((records) => {
    if (records.some(favShellMutationRelevant0140)) favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body, { childList:true, subtree:true });

GM_addStyle(`
  /* Missing presentation data must never collapse a product card to a few text
   * lines. Keep the exact image slot geometry while a real thumbnail is being
   * repaired/refreshed. */
  .ebsf-fallback-card .ebsf-fallback-image{
    display:block!important;
    width:100%!important;
    aspect-ratio:1.259 / 1!important;
    min-height:0!important;
    background:#f1f1ee!important;
    object-fit:cover!important;
  }
`);

/* Initialize explicit query identity from the current scope before the deferred
 * runtime performs its first dataset/cache classification. */
favEnsureNativeQueryScope0140();
