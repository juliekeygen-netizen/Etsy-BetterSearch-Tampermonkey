'use strict';

/* v0.15.5 stable Favorites rail ownership.
 *
 * Diagnostics proved Etsy/Preact can reconcile directly into BetterSearch's
 * rail when that rail is a child of Etsy's hydrated sidebar. The old shell also
 * moved Etsy-owned sidebar children into a BetterSearch wrapper, crossing the
 * ownership boundary in both directions.
 *
 * This layer installs before the final shell/stability modules and before the
 * deferred Favorites runtime is released. From this point onward:
 *  - Etsy keeps its native sidebar subtree structurally untouched;
 *  - BetterSearch owns a body-level portal outside Etsy's component tree;
 *  - the native sidebar remains in layout and is only visually suppressed;
 *  - the portal tracks the native sidebar's real viewport rectangle;
 *  - shell repairs reuse the same rail root instead of replacing it.
 */

favState.railSlot0155 = favState.railSlot0155 || null;
favState.railGeometryFrame0155 = Number(favState.railGeometryFrame0155) || 0;
favState.railResizeObserver0155 = favState.railResizeObserver0155 || null;

function favNativeSidebar0155() {
    const current = favState.sidebar;
    if (current?.isConnected && current.matches?.('[data-testid="sidebar"]')) return current;
    return document.querySelector('[data-testid="sidebar"]');
}

/* Keep the historical function name because collection/shop helpers already
 * call it, but make capture read-only. Never append, prepend, replace, remove,
 * hide, inert, or otherwise reparent Etsy-owned children here. */
favCaptureNativeSource0120 = function favCaptureNativeSource0155(sidebar = favNativeSidebar0155()) {
    if (!sidebar?.matches?.('[data-testid="sidebar"]')) return null;
    favState.sidebar = sidebar;
    favState.nativeSource0120 = sidebar;
    return sidebar;
};

favFavoritesContentColumn0120 = function favFavoritesContentColumn0155(sidebar = favNativeSidebar0155()) {
    const parent = sidebar?.parentElement;
    if (!parent) return null;
    const listing = document.querySelector('.phase3-listing-cards-section');
    if (listing && parent.contains(listing)) {
        let branch = listing;
        while (branch.parentElement && branch.parentElement !== parent) branch = branch.parentElement;
        if (branch.parentElement === parent && branch !== sidebar) return branch;
    }
    return Array.from(parent.children).find((child) =>
        child !== sidebar && !child.matches?.('[data-testid="sidebar"]')
    ) || null;
};

function favSyncRailPortalGeometry0155() {
    favState.railGeometryFrame0155 = 0;
    const slot = favState.railSlot0155;
    const sidebar = favNativeSidebar0155();
    if (!slot?.isConnected || !sidebar?.isConnected || !favDesktopShell0120() || !isFavoritesPage()) return;
    const rect = sidebar.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0) return;
    slot.style.left = `${rect.left}px`;
    slot.style.top = `${rect.top}px`;
    slot.style.width = `${rect.width}px`;
    slot.style.maxWidth = `${rect.width}px`;
    slot.style.setProperty('--ebsf-native-sidebar-width', `${rect.width}px`);
}

function favScheduleRailPortalGeometry0155() {
    if (favState.railGeometryFrame0155) return;
    favState.railGeometryFrame0155 = requestAnimationFrame(favSyncRailPortalGeometry0155);
}

function favObserveRailAnchor0155(sidebar) {
    if (favState.railResizeObserver0155?.__ebsfTarget === sidebar) return;
    favState.railResizeObserver0155?.disconnect?.();
    favState.railResizeObserver0155 = null;
    if (typeof ResizeObserver !== 'function' || !sidebar) return;
    const observer = new ResizeObserver(() => favScheduleRailPortalGeometry0155());
    observer.__ebsfTarget = sidebar;
    observer.observe(sidebar);
    favState.railResizeObserver0155 = observer;
}

function favEnsureRailSlot0155(sidebar = favNativeSidebar0155()) {
    if (!sidebar?.isConnected || !document.body) return null;
    let slot = favState.railSlot0155?.isConnected ? favState.railSlot0155 : null;
    if (!slot) slot = document.body.querySelector(':scope > [data-ebsf-rail-slot]');
    if (!slot) {
        slot = document.createElement('aside');
        slot.className = 'ebsf-rail-slot ebsf-sidebar-permanent';
        slot.dataset.ebsfRailSlot = '';
        slot.setAttribute('aria-label', 'BetterSearch Favorites filters');
        document.body.append(slot);
    }
    for (const duplicate of document.body.querySelectorAll(':scope > [data-ebsf-rail-slot]')) {
        if (duplicate !== slot) duplicate.remove();
    }

    favState.railSlot0155 = slot;
    favState.sidebar = sidebar;
    favState.nativeSource0120 = sidebar;
    sidebar.classList.add('ebsf-native-sidebar-suppressed');
    sidebar.classList.remove('ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    favObserveRailAnchor0155(sidebar);
    favScheduleRailPortalGeometry0155();
    return slot;
}

function favReleasePermanentRail0155() {
    const sidebar = favNativeSidebar0155();
    sidebar?.classList.remove('ebsf-native-sidebar-suppressed', 'ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    if (favState.railGeometryFrame0155) cancelAnimationFrame(favState.railGeometryFrame0155);
    favState.railGeometryFrame0155 = 0;
    favState.railResizeObserver0155?.disconnect?.();
    favState.railResizeObserver0155 = null;
    const slot = favState.railSlot0155?.isConnected
        ? favState.railSlot0155
        : document.querySelector('[data-ebsf-rail-slot]');
    slot?.remove();
    favState.railSlot0155 = null;
    if (favState.rail?.closest?.('[data-ebsf-rail-slot]')) favState.rail = null;
}

favInstallPermanentRail0120 = function favInstallPermanentRail0155() {
    if (!isFavoritesPage() || !favDesktopShell0120()) return null;
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (!sidebar) return null;
    favCaptureNativeSource0120(sidebar);
    const slot = favEnsureRailSlot0155(sidebar);
    if (!slot) return null;

    let rail = slot.querySelector(':scope > [data-ebsf-rail]');
    if (!rail) {
        rail = favBuildFilterRail();
        slot.append(rail);
    }
    favState.rail = rail;
    favState.filterOpen = true;
    favScheduleRailPortalGeometry0155();
    return rail;
};

/* Preserve the permanent rail root identity. Some controls legitimately need a
 * rebuilt body (layout edits, strict settings, etc.), but that does not require
 * replacing the shell-owned root node or creating a new rail generation. */
var favRefreshRailBefore0155 = favRefreshRail;
favRefreshRail = function favRefreshRail0155() {
    if (!favDesktopShell0120()) return favRefreshRailBefore0155();
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (!sidebar || !isFavoritesPage()) return;
    const slot = favEnsureRailSlot0155(sidebar);
    if (!slot) return;

    let rail = slot.querySelector(':scope > [data-ebsf-rail]');
    const replacement = favBuildFilterRail();
    if (!rail) {
        rail = replacement;
        slot.append(rail);
    } else {
        rail.className = replacement.className;
        rail.dataset.ebsfRail = '';
        rail.replaceChildren(...Array.from(replacement.childNodes));
    }
    favState.rail = rail;
    favState.filterOpen = true;
    favScheduleRailPortalGeometry0155();
    return rail;
};

var favInstallPageShellBefore0155 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0155(...args) {
    if (!isFavoritesPage() || !favDesktopShell0120()) favReleasePermanentRail0155();
    const result = favInstallPageShellBefore0155(...args);
    if (isFavoritesPage() && favDesktopShell0120()) favInstallPermanentRail0120();
    return result;
};

/* Teardown no longer has any native-child restoration phase because BetterSearch
 * never took ownership of those nodes. */
favTeardownPageShell0121 = function favTeardownPageShell0155() {
    favReleaseAllHeader0121();
    document.querySelectorAll('[data-ebsf-collection-strip]').forEach((node) => node.remove());
    favReleasePermanentRail0155();
    document.querySelectorAll('[data-ebsf-rail]').forEach((node) => node.remove());
    favState.nativeSource0120 = null;
    favState.collectionStrip0120 = null;
    favState.rail = null;
    favState.sidebar = null;
    favState.filterOpen = false;
};

window.addEventListener('scroll', favScheduleRailPortalGeometry0155, { passive:true });
window.addEventListener('resize', favScheduleRailPortalGeometry0155, { passive:true });

GM_addStyle(`
  /* Keep Etsy's hydrated sidebar in its original layout position so its parent
   * geometry never changes. Only its pixels/interactions are suppressed. */
  [data-testid="sidebar"].ebsf-native-sidebar-suppressed{
    visibility:hidden!important;
    pointer-events:none!important;
  }
  [data-ebsf-rail-slot]{
    position:fixed!important;
    z-index:20!important;
    box-sizing:border-box!important;
    margin:0!important;
    padding:0!important;
    overflow:visible!important;
    pointer-events:auto!important;
  }
  [data-ebsf-rail-slot] > [data-ebsf-rail]{
    display:block!important;
    width:100%!important;
    max-width:100%!important;
    box-sizing:border-box!important;
  }
  @media(max-width:760px){
    [data-ebsf-rail-slot]{display:none!important}
    [data-testid="sidebar"].ebsf-native-sidebar-suppressed{
      visibility:visible!important;
      pointer-events:auto!important;
    }
  }
`);
