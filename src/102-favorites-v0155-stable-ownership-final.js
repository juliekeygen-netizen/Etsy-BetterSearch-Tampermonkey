'use strict';

/* v0.15.5 final integration boundary.
 *
 * Module 101 predates the body-level rail portal and still verifies rail health
 * by looking for a direct child of Etsy's hydrated sidebar. It also applies a
 * broad deep-metadata fail-open wrapper to category availability. Finalize both
 * concepts here after every historical shell/smoke wrapper is loaded.
 */

favRestoreNativeSidebarAfterRailFailure0143 = function favRestoreNativeSidebarAfterRailFailure0155(sidebar) {
    favReleasePermanentRail0155();
    sidebar?.classList.remove('ebsf-native-sidebar-suppressed', 'ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    if (sidebar?.matches?.('[data-testid="sidebar"]')) {
        favState.sidebar = sidebar;
        favState.nativeSource0120 = sidebar;
    }
    favState.rail = null;
    favState.filterOpen = false;
};

favEnsurePermanentRail0142 = function favEnsurePermanentRail0155() {
    if (!isFavoritesPage() || !favDesktopShell0120()) return false;
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (!sidebar) return false;
    try {
        const rail = favInstallPermanentRail0120();
        const slot = rail?.closest?.('[data-ebsf-rail-slot]');
        if (!rail?.isConnected || !slot || slot.parentElement !== document.body) {
            throw new Error('BetterSearch Favorites rail portal did not mount outside Etsy ownership.');
        }
        favState.sidebar = sidebar;
        favState.nativeSource0120 = sidebar;
        favState.rail = rail;
        favState.railSlot0155 = slot;
        favState.filterOpen = true;
        favPolishFilterButton?.();
        favScheduleRailPortalGeometry0155?.();
        return true;
    } catch (error) {
        favRestoreNativeSidebarAfterRailFailure0143(sidebar);
        console.warn('[Etsy BetterSearch] Filter rail install failed; restored Etsy sidebar visibility.', error);
        return false;
    }
};

/* Category presence is independently knowable from category metadata. Do not
 * let unrelated/global deep-completion state turn a proven-empty category back
 * into “available”. The active binding remains visible so it can be cleared. */
var favBindingAvailableBefore0155 = favBindingAvailable0120;
favBindingAvailable0120 = function favBindingAvailable0155(bindingKey) {
    if (!bindingKey.startsWith('category:')) return favBindingAvailableBefore0155(bindingKey);
    if (favAvailabilityMode0110() === 'disabled' || favBindingActive0120(bindingKey)) return true;
    if (typeof favVisibleBindingCount0120 === 'function' && favVisibleBindingCount0120(bindingKey) <= 0) return false;
    const records = favRecordsForBinding0120(bindingKey);
    return records.some((record) => favCategoryMatch(record?.deepMetadata?.category, bindingKey.slice(9)));
};

function favMutationElement0155(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement || null;
}

function favNodeContainsNativeSidebarControl0155(node) {
    const element = favMutationElement0155(node);
    if (!element) return false;
    const selector = 'a[href*="tab=items"],[data-testid="add-collection-button"],nav[aria-label="Shops"],a[href*="tab=shops"]';
    return Boolean(element.matches?.(selector) || element.querySelector?.(selector));
}

function favShellMutationRelevant0155(record) {
    const target = favMutationElement0155(record.target);
    const added = Array.from(record.addedNodes || []).map(favMutationElement0155).filter(Boolean);
    const removed = Array.from(record.removedNodes || []).map(favMutationElement0155).filter(Boolean);
    const changed = [...added, ...removed];

    if (target?.closest?.('[data-ebsf-rail-slot]')) return false;

    /* If an outside actor removes our body-level portal while desktop Favorites
     * is still active, recreate it. Internal rail-child mutations never arrive
     * here because they are caught by the portal target guard above. */
    if (favDesktopShell0120() && isFavoritesPage() && removed.some((node) =>
        node.matches?.('[data-ebsf-rail-slot]') || node.querySelector?.('[data-ebsf-rail-slot]')
    )) return true;

    /* Keep one body-level shell observer as the structural lifecycle owner.
     * v0.15.7 used a second body-wide observer only to notice Etsy's zero-result
     * recommendation module. Treat both of Etsy's known module identities as a
     * normal native structural change so the final shell pass can schedule the
     * offset without another observer watching the same subtree. */
    const structural = '[data-testid="sidebar"],.phase3-listing-cards-section,.favorites-landing-phase3-header,#collections-landing-right-side-header-container,#favorites_similar_listings,[data-favorites-similar-listings]';
    if (changed.some((node) => node.matches?.(structural) || node.querySelector?.(structural))) return true;

    /* Do not run a full shell repair for every native sidebar text/wrapper
     * mutation. Only changes that can alter the native controls BetterSearch
     * reads for All/Create/Shops need a shell pass; ResizeObserver owns geometry. */
    if (target?.closest?.('[data-testid="sidebar"]')) {
        return changed.some(favNodeContainsNativeSidebarControl0155);
    }
    return false;
}

favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120 = new MutationObserver((records) => {
    if (records.some(favShellMutationRelevant0155)) favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body, { childList:true, subtree:true });

/* Reconcile once through the final bindings. This does not create a new rail
 * generation when the portal/rail are already healthy. */
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    if (favDesktopShell0120()) favEnsurePermanentRail0142();
    favInstallPageShell0120();
});
