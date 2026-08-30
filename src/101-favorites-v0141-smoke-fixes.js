'use strict';

/* v0.14.1 smoke fixes + v0.14.2 browser-runtime hardening + v0.15.0
 * local-pagination ownership verification.
 *
 * The logged-in HAR/browser passes exposed ownership seams between the v0.14
 * catalogue/metadata runtime and the older late Favorites shell chain. This
 * final layer keeps a deliberately narrow responsibility:
 *
 * 1. claim the permanent desktop rail as soon as the sidebar host exists and
 *    fail safe back to Etsy's native sidebar if custom rail construction throws;
 * 2. make the header's “shown” count follow the grid that is actually visible;
 * 3. verify the local grid represents the CURRENT dataset/sort/filter request;
 * 4. refresh cloned local cards from Etsy's hidden native cards when Etsy later
 *    hydrates Shipping / delivery / returns metadata;
 * 5. keep unknown filter capability data visible instead of treating unknown as
 *    definitely unavailable and collapsing whole drawers;
 * 6. verify the native grid/pager are ACTUALLY visually suppressed while the
 *    v0.15 BetterSearch local grid/pager own the visible results.
 *
 * Module 95 now owns deliberate local pagination without replacing
 * favRenderCurrent(), so the post-render shell repair installed by module 89
 * remains in the real renderer chain.
 */
favState.renderIntegrityTimer0142 = Number(favState.renderIntegrityTimer0142) || 0;
favState.renderSignature0143 = String(favState.renderSignature0143 || '');
favState.renderStatus0143 = String(favState.renderStatus0143 || 'native');
favState.nativeHydrationObserver0143 = favState.nativeHydrationObserver0143 || null;
favState.nativeHydrationTimer0143 = Number(favState.nativeHydrationTimer0143) || 0;
favState.nativeHydrationWarmup0143 = Number(favState.nativeHydrationWarmup0143) || 0;
favState.nativeHydrationTarget0143 = favState.nativeHydrationTarget0143 || null;

function favRequestedRenderSignature0143() {
    let config = '';
    try { config = JSON.stringify(favNormalizeConfig(favCfg)); }
    catch (_) { config = JSON.stringify(favCfg || {}); }
    return `${favDatasetKey()}|${config}`;
}

function favNodeVisuallySuppressed0143(node) {
    if (!node?.isConnected) return false;
    if (typeof favVisualDisplayNone0150 === 'function') return favVisualDisplayNone0150(node);
    try { return getComputedStyle(node).display === 'none'; }
    catch (_) { return node.hidden === true; }
}

function favLocalGridMounted0143() {
    const currentNative = favNativeMainGrid0141?.();
    const nativeGrid = currentNative?.isConnected
        ? currentNative
        : favState.nativeGrid?.isConnected ? favState.nativeGrid : null;
    const local = favState.localGrid0141;
    const paginationHealthy = typeof favLocalPaginationOwnershipHealthy0150 !== 'function'
        || favLocalPaginationOwnershipHealthy0150();
    return Boolean(
        favState.renderMode0141 === 'bettersearch-local'
        && local?.isConnected
        && !local.hidden
        && !favNodeVisuallySuppressed0143(local)
        && nativeGrid?.isConnected
        && nativeGrid.hidden === true
        && nativeGrid.hasAttribute?.('data-ebsf-native-hidden')
        && favNodeVisuallySuppressed0143(nativeGrid)
        && paginationHealthy
    );
}

function favLocalGridAuthoritative0142() {
    return Boolean(
        favLocalGridMounted0143()
        && favState.renderSignature0143
        && favState.renderSignature0143 === favRequestedRenderSignature0143()
    );
}

function favSetRenderStatus0143(status) {
    favState.renderStatus0143 = String(status || 'native');
    if (document.body) document.body.dataset.ebsfRenderStatus = favState.renderStatus0143;
}

/* A BetterSearch option can be active while v0.14 intentionally keeps Etsy's
 * native grid visible (for example while deep metadata is pending), or while a
 * dataset/view transition is settling. Counting a stale/empty filtered array in
 * those states produced “N favorites · 0 shown” beside visible native cards. */
var favScopeCountsBefore0142 = favScopeCounts0120;
favScopeCounts0120 = function favScopeCounts0142() {
    const previous = favScopeCountsBefore0142();
    const total = Math.max(0, Number(previous?.total) || 0);
    if (!favLocalGridAuthoritative0142()) return { total, shown:total };
    return {
        total,
        shown:Array.isArray(favState.filtered) ? favState.filtered.length : total,
    };
};

function favRestoreNativeSidebarAfterRailFailure0143(sidebar) {
    if (!sidebar || sidebar.querySelector(':scope > [data-ebsf-rail]')) return;
    const source = sidebar.querySelector(':scope > .ebsf-native-favorites-source');
    if (source) {
        source.hidden = false;
        source.inert = false;
        for (const child of Array.from(source.childNodes)) sidebar.insertBefore(child, source);
        source.remove();
    }
    sidebar.classList.remove('ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    if (favState.nativeSource0120 === source) favState.nativeSource0120 = null;
    if (favState.sidebar === sidebar) favState.sidebar = null;
    favState.rail = null;
    favState.filterOpen = false;
}

function favEnsurePermanentRail0142() {
    if (!isFavoritesPage() || !favDesktopShell0120()) return false;
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (!sidebar) return false;
    try {
        if (!sidebar.querySelector(':scope > [data-ebsf-rail]')) favInstallPermanentRail0120();
    } catch (error) {
        /* favInstallPermanentRail0120 historically captures/hides native sidebar
         * children before building the custom rail. If that build throws, never
         * leave a blank reserved column; restore Etsy's native contents first. */
        favRestoreNativeSidebarAfterRailFailure0143(sidebar);
        console.warn('[Etsy BetterSearch] Filter rail install failed; restored Etsy sidebar.', error);
        return false;
    }
    const rail = sidebar.querySelector(':scope > [data-ebsf-rail]');
    if (!rail) {
        favRestoreNativeSidebarAfterRailFailure0143(sidebar);
        return false;
    }
    favState.sidebar = sidebar;
    favState.rail = rail;
    favState.filterOpen = true;
    sidebar.classList.add('ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    favPolishFilterButton?.();
    return true;
}

/* Rail ownership depends only on the sidebar host; do not wait for Etsy's
 * independently hydrated results-content sibling before claiming it. */
var favInstallPageShellBefore0142 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0142() {
    if (isFavoritesPage() && favDesktopShell0120()) favEnsurePermanentRail0142();
    const result = favInstallPageShellBefore0142?.();
    requestAnimationFrame(() => {
        if (!isFavoritesPage()) return;
        favEnsurePermanentRail0142();
        favUpdateScopeHeader0120?.();
    });
    return result;
};

/* Dynamic filter availability is three-state. Existing code correctly decides
 * whether a capability is positively present, but a false result is only safe
 * to hide when coverage for that capability is complete. Unknown/pending stays
 * visible so drawers such as Item qualities cannot disappear during hydration. */
function favBindingKnowledgeComplete0143(bindingKey, records) {
    if (!favState.loadComplete || !Array.isArray(records) || !records.length) return false;
    const every = (predicate) => records.every((record) => {
        try { return predicate(record) === true; } catch (_) { return false; }
    });
    if (bindingKey.startsWith('category:')) return favDeepVisibilityReady0110();
    if (bindingKey.startsWith('ships-origin:') || ['ships-europe','ships-eu','ships-local'].includes(bindingKey)) {
        return every((record) => record?.known?.shipsFromCountry === true);
    }
    if (bindingKey === 'etsys-picks') return every((record) => Number(record?.deepMetadata?.scannedAt) > 0 && typeof record?.deepMetadata?.etsysPick === 'boolean');
    if (bindingKey === 'gift-wrap') return every((record) => Number(record?.deepMetadata?.scannedAt) > 0 && typeof record?.deepMetadata?.giftWrap === 'boolean');
    if (bindingKey === 'vintage') return every((record) => Number(record?.deepMetadata?.scannedAt) > 0 && typeof record?.deepMetadata?.vintage === 'boolean');
    if (bindingKey === 'star-seller') return every((record) => record?.known?.isStarSeller === true);
    if (bindingKey === 'available-only') return every((record) => record?.known?.isSoldOut === true);
    if (bindingKey === 'on-sale') return every((record) => record?.known?.isOnSale === true || record?.known?.discountPercent === true);
    if (bindingKey === 'free-shipping') return every((record) => record?.known?.hasFreeShipping === true || favMetadataFieldState0141?.(record, 'freeShippingFallback')?.resolved === true);
    if (bindingKey === 'customizable') return every((record) => record?.known?.isPersonalizable === true);
    if (bindingKey === 'has-variations') return every((record) => record?.known?.hasVariations === true);
    if (bindingKey === 'physical' || bindingKey === 'digital') return every((record) => record?.known?.isDownload === true);
    if (bindingKey === 'price-range') return every((record) => Number.isFinite(record?.price));
    if (bindingKey === 'min-rating') return every((record) => record?.known?.rating === true);
    if (bindingKey === 'min-reviews') return every((record) => record?.known?.reviews === true);
    if (bindingKey === 'max-shipping') return every((record) => favMetadataFieldState0141?.(record, 'shipping')?.resolved === true);
    if (bindingKey === 'returns') return every((record) => favMetadataFieldState0141?.(record, 'returns')?.resolved === true);
    if (bindingKey === 'exchanges') return every((record) => favMetadataFieldState0141?.(record, 'exchanges')?.resolved === true);
    if (bindingKey === 'low-stock') return every((record) => favMetadataFieldState0141?.(record, 'stock')?.resolved === true);
    if (bindingKey === 'min-carts') return every((record) => favMetadataFieldState0141?.(record, 'carts')?.resolved === true);
    if (bindingKey === 'shop') return every((record) => Boolean(String(record?.shopName || '').trim()));
    return true;
}

var favBindingAvailableBefore0143 = favBindingAvailable0120;
favBindingAvailable0120 = function favBindingAvailable0143(bindingKey) {
    if (favAvailabilityMode0110() === 'disabled' || favBindingActive0120(bindingKey)) return true;
    const records = favRecordsForBinding0120(bindingKey);
    const available = favBindingAvailableBefore0143(bindingKey);
    if (available) return true;
    return !favBindingKnowledgeComplete0143(bindingKey, records);
};

function favStopNativeHydrationWatch0143() {
    favState.nativeHydrationObserver0143?.disconnect?.();
    favState.nativeHydrationObserver0143 = null;
    favState.nativeHydrationTarget0143 = null;
    clearTimeout(favState.nativeHydrationTimer0143);
    clearTimeout(favState.nativeHydrationWarmup0143);
    favState.nativeHydrationTimer0143 = 0;
    favState.nativeHydrationWarmup0143 = 0;
}

function favRefreshOwnedCardsFromNative0143() {
    if (!favLocalGridAuthoritative0142()) return false;
    const local = favState.localGrid0141;
    const live = favNativeCardMap0141?.(document) || new Map();
    let replaced = 0;
    for (const card of Array.from(local?.children || [])) {
        const idValue = String(card?.dataset?.ebsfId || favListingIdFromNode(card) || '');
        if (!idValue) continue;
        const native = live.get(idValue);
        const record = favState.recordsById?.get?.(idValue);
        if (!native?.isConnected || !record) continue;
        const replacement = favPrepareOwnedCard0141(native.cloneNode(true), record);
        card.replaceWith(replacement);
        replaced += 1;
    }
    return replaced > 0;
}

function favScheduleNativeHydrationRefresh0143() {
    clearTimeout(favState.nativeHydrationTimer0143);
    favState.nativeHydrationTimer0143 = setTimeout(() => {
        favState.nativeHydrationTimer0143 = 0;
        favRefreshOwnedCardsFromNative0143();
    }, 90);
}

function favWatchNativeHydration0143() {
    if (!favLocalGridAuthoritative0142()) {
        favStopNativeHydrationWatch0143();
        return;
    }
    const native = favNativeMainGrid0141?.();
    if (!native?.isConnected) {
        favStopNativeHydrationWatch0143();
        return;
    }
    if (favState.nativeHydrationObserver0143 && favState.nativeHydrationTarget0143 === native) return;
    favStopNativeHydrationWatch0143();
    const observer = new MutationObserver(() => favScheduleNativeHydrationRefresh0143());
    observer.observe(native, {
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class','aria-label','aria-pressed'],
    });
    favState.nativeHydrationObserver0143 = observer;
    favState.nativeHydrationTarget0143 = native;
    /* Etsy often hydrates card metadata in the first few frames after initial
     * paint. One delayed refresh covers a response that landed just before the
     * observer was attached. Track it so repeated shell checks cannot stack
     * warm-up refreshes. */
    favState.nativeHydrationWarmup0143 = setTimeout(() => {
        favState.nativeHydrationWarmup0143 = 0;
        favScheduleNativeHydrationRefresh0143();
    }, 180);
}

function favRenderIntegrityReady0142(datasetKey) {
    if (!isFavoritesPage() || datasetKey !== favDatasetKey()) return false;
    if (!favEnhancementActive()) return false;
    if (!favState.loadComplete || favState.loadKey !== datasetKey) return false;
    if (Number(favState.metadataCoverage0141?.pending) > 0) return false;
    return Boolean(favNativeMainGrid0141?.());
}

function favRepairLocalOwnership0142(datasetKey) {
    if (!favRenderIntegrityReady0142(datasetKey)) return;

    /* Etsy can reconcile display/native pager state without removing our local
     * grid. Reassert visual ownership first; only re-run the catalogue/metadata
     * pipeline if the current result signature is still not authoritative. */
    if (favState.renderMode0141 === 'bettersearch-local' && favState.localGrid0141?.isConnected) {
        favApplyLocalVisualOwnership0150?.();
    }

    if (favLocalGridAuthoritative0142()) {
        favUpdateScopeHeader0120?.();
        favEnsurePermanentRail0142();
        favWatchNativeHydration0143();
        return;
    }

    /* Never repair by calling a historical renderer directly. Re-enter the
     * authoritative v0.14 catalogue + metadata pipeline so a stale signature,
     * removed grid, or Etsy reconciliation is resolved from current state. */
    void Promise.resolve(favReapply()).catch((error) => {
        console.debug?.('[EBSF] local Favorites render repair deferred', error);
    });
}

function favScheduleRenderIntegrity0142(delay = 0, datasetKey = favDatasetKey()) {
    clearTimeout(favState.renderIntegrityTimer0142);
    favState.renderIntegrityTimer0142 = setTimeout(() => {
        favState.renderIntegrityTimer0142 = 0;
        favRepairLocalOwnership0142(datasetKey);
    }, Math.max(0, Number(delay) || 0));
}

/* Reapply owns catalogue + metadata readiness. Track the exact requested
 * render generation and make failure/pending/native/local states explicit so a
 * selected Sort cannot be mistaken internally for a successfully rendered one. */
var favReapplyBefore0142 = favReapply;
favReapply = async function favReapply0142(...args) {
    const datasetKey = favDatasetKey();
    favSetRenderStatus0143(favEnhancementActive() ? 'loading' : 'native');
    try {
        const result = await favReapplyBefore0142(...args);
        if (datasetKey !== favDatasetKey()) return result;
        if (favState.renderMode0141 === 'bettersearch-local') favApplyLocalVisualOwnership0150?.();
        if (favLocalGridMounted0143()) {
            favState.renderSignature0143 = favRequestedRenderSignature0143();
            favSetRenderStatus0143('bettersearch-local');
            favWatchNativeHydration0143();
        } else {
            favState.renderSignature0143 = '';
            favStopNativeHydrationWatch0143();
            favSetRenderStatus0143(Number(favState.metadataCoverage0141?.pending) > 0 ? 'metadata-pending' : (favEnhancementActive() ? 'native-fallback' : 'native'));
        }
        favScheduleRenderIntegrity0142(0, datasetKey);
        setTimeout(() => {
            if (datasetKey === favDatasetKey()) favScheduleRenderIntegrity0142(120, datasetKey);
        }, 40);
        return result;
    } catch (error) {
        if (datasetKey === favDatasetKey()) {
            favState.renderSignature0143 = '';
            favStopNativeHydrationWatch0143();
            favSetRenderStatus0143('error');
            favUpdateScopeHeader0120?.();
            favEnsurePermanentRail0142();
        }
        throw error;
    }
};

/* Reuse the existing body lifecycle signal rather than adding another broad
 * observer. The only new observer above is scoped to the hidden native product
 * grid and exists solely while a BetterSearch local grid is authoritative. */
var favScheduleSyncBefore0142 = favScheduleSync;
favScheduleSync = function favScheduleSync0142(delay = 100) {
    const result = favScheduleSyncBefore0142(delay);
    if (favState.renderMode0141 === 'bettersearch-local') {
        favScheduleRenderIntegrity0142(Math.max(80, Number(delay) || 0));
    }
    return result;
};

/* Native-mode transitions immediately invalidate the local render generation
 * and restore truthful counts. */
var favRestoreNativeBefore0142 = favRestoreNative;
favRestoreNative = function favRestoreNative0142() {
    favState.renderSignature0143 = '';
    favStopNativeHydrationWatch0143();
    favSetRenderStatus0143('native');
    const result = favRestoreNativeBefore0142();
    requestAnimationFrame(() => favUpdateScopeHeader0120?.());
    return result;
};

window.addEventListener('resize', () => requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120();
    favApplyExactSearchWidth0135?.();
    if (favState.renderMode0141 === 'bettersearch-local') favScheduleRenderIntegrity0142(80);
}), { passive:true });

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120();
    favApplyExactSearchWidth0135?.();
    if (favEnhancementActive()) favScheduleRenderIntegrity0142(120);
});

/* ------------------------------------------------------------------------- *
 * v0.15.12 atomic local render ownership
 * -------------------------------------------------------------------------
 *
 * Historical renderers treated entering local mode as permission to hide Etsy.
 * That made ownership a sequence of side effects: hide native grid/pager, then
 * discover whether the local result/signature was actually current. The browser
 * capture proved the failure mode: Etsy had already restored useful cards while
 * a stale empty local grid reclaimed visibility.
 *
 * From here on, local rendering is a transaction:
 *   prepare hidden BetterSearch grid + pager -> sign current state -> validate ->
 *   synchronously switch grid/pager/count/status together.
 * Any failed/stale transaction releases to Etsy native content.
 */
favState.renderToken01512 = String(favState.renderToken01512 || '');
favState.renderRequestSignature01512 = String(favState.renderRequestSignature01512 || '');
favState.renderTransactionSequence01512 = Math.max(0, Number(favState.renderTransactionSequence01512) || 0);
favState.renderClaimApproved01512 = false;

function favHashText01512(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function favNormalizedConfigText01512() {
    try { return JSON.stringify(favNormalizeConfig(favCfg)); }
    catch (_) { return JSON.stringify(favCfg || {}); }
}

function favCurrentMetadataCapabilities01512() {
    try {
        return Array.from(favMetadataRequirements0141?.(favCfg) || [], String).sort();
    } catch (_) {
        return [];
    }
}

function favMetadataCoverageCurrent01512() {
    const coverage = favState.metadataCoverage0141 || null;
    const datasetKey = favDatasetKey();
    const required = favCurrentMetadataCapabilities01512();
    const covered = Array.from(coverage?.capabilities || [], String).sort();
    return Boolean(
        coverage
        && String(coverage.datasetKey || '') === String(datasetKey)
        && Number(coverage.pending) <= 0
        && JSON.stringify(covered) === JSON.stringify(required)
    );
}

function favNativeViewFingerprint01512(nativeGrid = favNativeMainGrid0141?.()) {
    if (!nativeGrid?.isConnected) return 'missing';
    const ids = Array.from(nativeGrid.children || [])
        .map((node) => String(favListingIdFromNode(node) || ''))
        .filter(Boolean);
    const view = typeof favViewKey0137 === 'function' ? favViewKey0137() : '';
    return favHashText01512(`${view}|${ids.join(',')}`);
}

function favRecordRevision01512(record) {
    let metadataAt = 0;
    for (const meta of Object.values(record?.metadataMeta0141 || {})) {
        metadataAt = Math.max(metadataAt, Number(meta?.observedAt) || 0);
    }
    return [
        record?.id || '',
        Number(record?.order) || 0,
        Number(record?.indexObservedAt) || 0,
        Number(record?.deepMetadata?.scannedAt) || 0,
        metadataAt,
    ].join(':');
}

function favRecordsRevision01512(records = favState.records) {
    return favHashText01512(Array.from(records || [], favRecordRevision01512).join('|'));
}

function favSnapshotRevision01512() {
    const scope = favState.cacheScope0137 || {};
    return [
        scope.snapshotGeneration || '',
        Number(scope.snapshotCommittedAt) || 0,
        Number(scope.lastCompleteSyncAt) || 0,
        Number(scope.lastObservedAt) || 0,
    ].join(':');
}

function favRenderRequestSignature01512() {
    const destination = typeof favMetadataDestination0141 === 'function'
        ? favMetadataDestination0141()?.contextKey || ''
        : '';
    return [
        favDatasetKey(),
        favState.loadKey || '',
        favState.nativeQueryGeneration01511 || 0,
        favSnapshotRevision01512(),
        favHashText01512(favNormalizedConfigText01512()),
        destination,
        favCurrentMetadataCapabilities01512().join(','),
    ].join('|');
}

/* Keep the historical public signature API useful for diagnostics/count code,
 * but make it include every request-side generation that can invalidate a local
 * render before the DOM transaction is committed. */
favRequestedRenderSignature0143 = function favRequestedRenderSignature01512() {
    return favRenderRequestSignature01512();
};

function favRenderTransactionToken01512(nativeGrid = favNativeMainGrid0141?.()) {
    const filtered = Array.isArray(favState.filtered) ? favState.filtered : [];
    const pageSize = Math.max(1, Number(favState.pageSize) || 20);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(favState.localPage) || 1));
    const coverage = favState.metadataCoverage0141 || {};
    return [
        favRenderRequestSignature01512(),
        favMetadataCoverageCurrent01512() ? 'metadata:ready' : 'metadata:stale',
        Number(coverage.unresolved) || 0,
        favRecordsRevision01512(),
        favNativeViewFingerprint01512(nativeGrid),
        favHashText01512(filtered.map((record) => String(record?.id || '')).join(',')),
        filtered.length,
        pageSize,
        page,
        pages,
    ].join('|');
}

function favStagedPaginationReady01512(pages) {
    const totalPages = Math.max(1, Number(pages) || 1);
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (totalPages <= 1) return !pager;
    return Boolean(
        pager?.isConnected
        && pager.dataset.ebsfPaginationPresentation === 'etsy-native'
        && pager.dataset.ebsfLocalPageCount === String(totalPages)
        && pager.dataset.ebsfLocalCurrentPage === String(favState.localPage)
        && pager.hidden === true
        && pager.inert === true
        && pager.getAttribute('aria-hidden') === 'true'
        && pager.hasAttribute('data-ebsf-local-staged')
    );
}

var favApplyLocalVisualOwnershipBefore01512 = favApplyLocalVisualOwnership0150;
favApplyLocalVisualOwnership0150 = function favApplyLocalVisualOwnership01512() {
    /* Entering local mode is no longer sufficient authority. Only the atomic
     * commit/verified repair boundary may suppress Etsy-owned content. */
    if (favState.renderClaimApproved01512 !== true) return false;
    return favApplyLocalVisualOwnershipBefore01512();
};

var favRenderPaginationBefore01512 = favRenderPagination;
favRenderPagination = function favRenderPagination01512(pages) {
    if (favState.renderMode0141 !== 'bettersearch-staged') {
        return favRenderPaginationBefore01512(pages);
    }

    const localGrid = favState.localGrid0141;
    if (!localGrid?.isConnected) return false;
    const previousMode = favState.renderMode0141;
    try {
        /* Module 95's builder is still the sole pager presentation owner. Give
         * it its expected local-mode input while the visual-ownership guard above
         * prevents native suppression, then hide/inert the prepared local pager. */
        favState.renderMode0141 = 'bettersearch-local';
        favRenderPaginationBefore01512(pages);
    } finally {
        favState.renderMode0141 = previousMode;
    }

    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (pager) {
        pager.hidden = true;
        pager.inert = true;
        pager.setAttribute('aria-hidden', 'true');
        pager.setAttribute('data-ebsf-local-staged', '1');
    }
    return favStagedPaginationReady01512(pages);
};

function favAbortStagedRender01512(status = 'native-fallback') {
    favState.renderToken01512 = '';
    favState.renderRequestSignature01512 = '';
    favState.renderClaimApproved01512 = false;
    const result = favRestoreNative();
    favSetRenderStatus0143(status);
    return result;
}

function favCommitStagedRender01512(token, pages, nativeGrid) {
    if (!token || token !== favRenderTransactionToken01512(nativeGrid)) return false;
    if (!favMetadataCoverageCurrent01512()) return false;
    if (!favStagedPaginationReady01512(pages)) return false;
    const localGrid = favState.localGrid0141;
    if (!nativeGrid?.isConnected || !localGrid?.isConnected) return false;
    if (localGrid.hidden !== true || localGrid.inert !== true || !localGrid.hasAttribute('data-ebsf-local-staged')) return false;

    favState.renderClaimApproved01512 = true;
    try {
        /* All visual writes happen in one synchronous JS turn: browsers cannot
         * paint or deliver MutationObserver callbacks halfway through the switch. */
        favState.renderMode0141 = 'bettersearch-local';
        if (!favApplyLocalVisualOwnership0150()) return false;
        localGrid.inert = false;
        localGrid.removeAttribute('aria-hidden');
        localGrid.removeAttribute('data-ebsf-local-staged');
        const pager = document.querySelector('[data-ebsf-local-pagination]');
        if (pager) {
            pager.hidden = false;
            pager.inert = false;
            pager.removeAttribute('aria-hidden');
            pager.removeAttribute('data-ebsf-local-staged');
        }
        favState.rendered = true;
        favState.renderToken01512 = token;
        favState.renderRequestSignature01512 = favRenderRequestSignature01512();
        favState.renderSignature0143 = favState.renderRequestSignature01512;
        document.body?.classList.add('ebsf-results-active');
        favSetRenderStatus0143('bettersearch-local');
        favUpdateScopeHeader0120?.();
        return true;
    } finally {
        favState.renderClaimApproved01512 = false;
    }
}

/* Final renderer: prepare BetterSearch-owned nodes while Etsy remains visible,
 * validate a signed transaction, then claim both grid and pager together. */
favRenderCurrent = function favRenderCurrent01512() {
    const nativeGrid = favNativeMainGrid0141?.();
    if (!nativeGrid?.isConnected) return false;
    if (!favEnhancementActive() || !favState.loadComplete || favState.loadKey !== favDatasetKey()) {
        favAbortStagedRender01512('native-fallback');
        return false;
    }
    if (!favMetadataCoverageCurrent01512()) {
        favAbortStagedRender01512(Number(favState.metadataCoverage0141?.pending) > 0 ? 'metadata-pending' : 'native-fallback');
        return false;
    }

    favCaptureNativeGrid();
    const matched = favFilteredRecords();
    favState.filtered = matched;
    const pageSize = Math.max(1, Number(favState.pageSize) || 20);
    const pages = Math.max(1, Math.ceil(matched.length / pageSize));
    favState.localPage = Math.min(pages, Math.max(1, Number(favState.localPage) || 1));
    const start = (favState.localPage - 1) * pageSize;
    const page = matched.slice(start, start + pageSize);
    const localGrid = favEnsureLocalGrid0141(nativeGrid);
    const fragment = document.createDocumentFragment();
    if (!page.length) {
        const empty = document.createElement('li');
        empty.className = 'ebsf-empty';
        empty.textContent = 'No favorites match these filters.';
        fragment.append(empty);
    } else {
        for (const record of page) fragment.append(favNodeForRecord(record));
    }

    favState.rendering = true;
    try {
        localGrid.hidden = true;
        localGrid.inert = true;
        localGrid.setAttribute('aria-hidden', 'true');
        localGrid.setAttribute('data-ebsf-local-staged', '1');
        localGrid.replaceChildren(fragment);
        favState.renderMode0141 = 'bettersearch-staged';
        favState.rendered = false;
        document.body?.classList.remove('ebsf-results-active');

        if (!favRenderPagination(pages)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }

        const token = favRenderTransactionToken01512(nativeGrid);
        /* Re-read all generation-bearing state after staging. A stale async
         * reapply cannot claim merely because it managed to build DOM nodes. */
        if (token !== favRenderTransactionToken01512(nativeGrid)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }
        if (!favCommitStagedRender01512(token, pages, nativeGrid)) {
            favAbortStagedRender01512('native-fallback');
            return false;
        }
        return true;
    } catch (error) {
        favAbortStagedRender01512('error');
        console.warn('[Etsy BetterSearch] Local Favorites render transaction failed; restored Etsy results.', error);
        return false;
    } finally {
        queueMicrotask(() => { favState.rendering = false; });
    }
};

favLocalGridAuthoritative0142 = function favLocalGridAuthoritative01512() {
    if (!favLocalGridMounted0143()) return false;
    if (!favState.renderToken01512) return false;
    if (favState.renderRequestSignature01512 !== favRenderRequestSignature01512()) return false;
    return favState.renderToken01512 === favRenderTransactionToken01512();
};

/* Integrity repair is proof-first. Never hide native content merely because a
 * local grid exists. If the token is stale, release immediately and let the
 * authoritative catalogue/metadata pipeline rebuild a new transaction. */
favRepairLocalOwnership0142 = function favRepairLocalOwnership01512(datasetKey) {
    if (!favRenderIntegrityReady0142(datasetKey)) {
        if (favState.renderMode0141 !== 'native') favAbortStagedRender01512('native-fallback');
        return;
    }

    if (favLocalGridAuthoritative0142()) {
        favState.renderClaimApproved01512 = true;
        try {
            if (!favApplyLocalVisualOwnership0150()) {
                favAbortStagedRender01512('native-fallback');
                return;
            }
        } finally {
            favState.renderClaimApproved01512 = false;
        }
        favUpdateScopeHeader0120?.();
        favEnsurePermanentRail0142();
        favWatchNativeHydration0143();
        return;
    }

    if (favState.renderMode0141 !== 'native' || favState.localGrid0141?.isConnected) {
        favAbortStagedRender01512('native-fallback');
    }
    void Promise.resolve(favReapply()).catch((error) => {
        console.debug?.('[EBSF] local Favorites render repair deferred', error);
    });
};

/* A changed request must never leave the previous local result visible while
 * asynchronous catalogue/metadata work catches up. Same-request refreshes may
 * keep their already-authoritative local result until the new transaction is
 * prepared. */
var favReapplyBefore01512 = favReapply;
favReapply = async function favReapply01512(...args) {
    const requestSignature = favRenderRequestSignature01512();
    favState.renderTransactionSequence01512 += 1;
    if (
        favState.renderMode0141 === 'bettersearch-local'
        && favState.renderRequestSignature01512
        && favState.renderRequestSignature01512 !== requestSignature
    ) {
        favAbortStagedRender01512('loading');
    }
    return favReapplyBefore01512(...args);
};

var favRestoreNativeBefore01512 = favRestoreNative;
favRestoreNative = function favRestoreNative01512() {
    favState.renderToken01512 = '';
    favState.renderRequestSignature01512 = '';
    favState.renderClaimApproved01512 = false;
    const local = favState.localGrid0141;
    if (local?.isConnected) {
        local.removeAttribute('data-ebsf-local-staged');
        local.inert = false;
    }
    const pager = document.querySelector('[data-ebsf-local-pagination]');
    if (pager) {
        pager.removeAttribute('data-ebsf-local-staged');
        pager.inert = false;
    }
    return favRestoreNativeBefore01512();
};