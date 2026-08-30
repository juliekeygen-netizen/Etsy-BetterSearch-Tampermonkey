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
 *  - BetterSearch owns a sibling rail slot outside that hydrated subtree;
 *  - the native sidebar is only visually suppressed on desktop;
 *  - shell repairs reuse the same rail root instead of replacing it.
 */

favState.railSlot0155 = favState.railSlot0155 || null;

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

/* The sibling slot must never be mistaken for the results/content column on a
 * fallback layout where the normal listing-branch lookup is unavailable. */
favFavoritesContentColumn0120 = function favFavoritesContentColumn0155(sidebar = favNativeSidebar0155()) {
    const parent = sidebar?.parentElement;
    if (!parent) return null;
    const listing = document.querySelector('.phase3-listing-cards-section');
    if (listing && parent.contains(listing)) {
        let branch = listing;
        while (branch.parentElement && branch.parentElement !== parent) branch = branch.parentElement;
        if (branch.parentElement === parent && branch !== sidebar && !branch.matches?.('[data-ebsf-rail-slot]')) return branch;
    }
    return Array.from(parent.children).find((child) =>
        child !== sidebar
        && !child.matches?.('[data-testid="sidebar"],[data-ebsf-rail-slot]')
    ) || null;
};

function favRailSlotClassName0155(sidebar) {
    const native = Array.from(sidebar?.classList || []).filter((name) => !name.startsWith('ebsf-'));
    return [...native, 'ebsf-rail-slot', 'ebsf-sidebar-permanent'].join(' ');
}

function favSyncRailSlotGeometry0155(slot, sidebar) {
    if (!slot || !sidebar) return;
    slot.className = favRailSlotClassName0155(sidebar);
    const width = sidebar.getBoundingClientRect?.().width;
    if (Number.isFinite(width) && width > 0) {
        slot.style.setProperty('--ebsf-native-sidebar-width', `${width}px`);
    }
}

function favEnsureRailSlot0155(sidebar = favNativeSidebar0155()) {
    if (!sidebar?.parentElement) return null;
    const parent = sidebar.parentElement;
    let slot = favState.railSlot0155?.isConnected ? favState.railSlot0155 : null;
    if (slot?.parentElement !== parent) {
        slot?.remove();
        slot = null;
    }
    if (!slot) slot = parent.querySelector(':scope > [data-ebsf-rail-slot]');
    if (!slot) {
        slot = document.createElement('div');
        slot.dataset.ebsfRailSlot = '';
        slot.setAttribute('aria-label', 'BetterSearch Favorites filters');
        parent.insertBefore(slot, sidebar);
    } else if (slot.nextSibling !== sidebar) {
        parent.insertBefore(slot, sidebar);
    }

    for (const duplicate of parent.querySelectorAll(':scope > [data-ebsf-rail-slot]')) {
        if (duplicate !== slot) duplicate.remove();
    }

    favSyncRailSlotGeometry0155(slot, sidebar);
    favState.railSlot0155 = slot;
    favState.sidebar = sidebar;
    favState.nativeSource0120 = sidebar;
    sidebar.classList.add('ebsf-native-sidebar-suppressed');
    sidebar.classList.remove('ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    return slot;
}

function favReleasePermanentRail0155({ removeRail = true } = {}) {
    const sidebar = favNativeSidebar0155();
    sidebar?.classList.remove('ebsf-native-sidebar-suppressed', 'ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    const slot = favState.railSlot0155?.isConnected
        ? favState.railSlot0155
        : document.querySelector('[data-ebsf-rail-slot]');
    if (removeRail) slot?.remove();
    else slot?.classList.remove('ebsf-sidebar-permanent');
    if (removeRail) {
        favState.railSlot0155 = null;
        if (favState.rail?.closest?.('[data-ebsf-rail-slot]')) favState.rail = null;
    }
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
    document.querySelectorAll('[data-ebsf-rail]').forEach((node) => {
        if (!node.closest?.('[data-ebsf-filter-overlay]')) node.remove();
    });
    favState.nativeSource0120 = null;
    favState.collectionStrip0120 = null;
    favState.rail = null;
    favState.sidebar = null;
    favState.filterOpen = false;
};

GM_addStyle(`
  /* The hydrated Etsy sidebar remains intact but does not occupy a second
   * desktop column while the BetterSearch sibling slot is active. */
  [data-testid="sidebar"].ebsf-native-sidebar-suppressed{
    display:none!important;
  }
  [data-ebsf-rail-slot]{
    box-sizing:border-box!important;
    min-width:min(var(--ebsf-native-sidebar-width,220px),100%)!important;
    width:var(--ebsf-native-sidebar-width,220px)!important;
    max-width:var(--ebsf-native-sidebar-width,260px)!important;
    flex:0 0 var(--ebsf-native-sidebar-width,220px)!important;
    overflow:visible!important;
  }
  [data-ebsf-rail-slot] > [data-ebsf-rail]{
    display:block!important;
    width:100%!important;
    max-width:100%!important;
    box-sizing:border-box!important;
  }
  @media(max-width:760px){
    [data-ebsf-rail-slot]{display:none!important}
    [data-testid="sidebar"].ebsf-native-sidebar-suppressed{display:block!important}
  }
`);
