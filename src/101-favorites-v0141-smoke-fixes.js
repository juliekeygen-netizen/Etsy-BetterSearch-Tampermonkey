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
