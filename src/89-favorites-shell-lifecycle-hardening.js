'use strict';

/* v0.12.4 second-pass lifecycle hardening for the reconstructed Favorites shell. */
var favShellRailHostBefore0124 = favShellRailHost0123;
favShellRailHost0123 = function favShellRailHost0124(create = false) {
    let host = document.querySelector('[data-ebsf-shell-rail-host]');
    const sidebar = favShellNativeSidebar0123();
    const parent = sidebar?.parentElement;

    /* Etsy can replace the Favorites content/grid parent without removing an
       already injected sibling immediately. Never reuse a host from the old
       parent: it would make Filters appear to vanish while Collections/Shops
       from the new native sidebar become visible. */
    if (host && parent && host.parentElement !== parent) {
        if (favState.sidebar === host) favState.sidebar = null;
        if (favState.rail?.closest?.('[data-ebsf-shell-rail-host]') === host) favState.rail = null;
        host.remove();
        host = null;
    }

    host = favShellRailHostBefore0124(create);
    host?.classList.remove('ebsf-sidebar-active', 'ebsf-shell-sidebar');
    return host;
};

var favShellEnsureStableRailBefore0124 = favShellEnsureStableRail0123;
favShellEnsureStableRail0123 = function favShellEnsureStableRail0124(rebuild = false) {
    let rail = favShellEnsureStableRailBefore0124(rebuild);
    if (!rail) return rail;

    /* A stable host is only valid when the actual filter rail survived. If a
       React rerender or an older close/restore path emptied it, rebuild once. */
    if (!rail.querySelector('.ebsf-rail-header') || !rail.querySelector('.ebsf-section')) {
        rail = favShellEnsureStableRailBefore0124(true);
    }
    return rail;
};

favShellRestoreMobile0120 = function favShellRestoreMobile0124() {
    const host = document.querySelector('[data-ebsf-shell-rail-host]');
    host?.remove();
    favShellRestoreNativeSidebar0123();

    const sidebar = favShellNativeSidebar0123();
    if (sidebar) {
        sidebar.classList.remove('ebsf-sidebar-active', 'ebsf-shell-sidebar');
        sidebar.style.removeProperty('display');
        sidebar.style.removeProperty('position');
        sidebar.style.removeProperty('height');
        sidebar.style.removeProperty('max-height');
        sidebar.style.removeProperty('overflow');
        sidebar.removeAttribute('aria-hidden');
        delete sidebar.dataset.ebsfNativeSidebarHidden;
    }

    favState.sidebar = null;
    favState.sidebarNodes = null;
    if (favState.rail?.closest?.('[data-ebsf-shell-rail-host]')) favState.rail = null;
    favState.filterOpen = Boolean(favState.overlay);
};

/* If an older shell pass left a visible native sidebar class behind while the
   stable host exists, strip it on every repair. */
var favShellStableRepairBefore0124 = favShellStableRepair0123;
favShellStableRepair0123 = function favShellStableRepair0124() {
    const sidebar = favShellNativeSidebar0123();
    if (sidebar && favShellDesktop0120() && isFavoritesPage()) {
        sidebar.dataset.ebsfNativeSidebarHidden = '';
        sidebar.setAttribute('aria-hidden', 'true');
    }
    return favShellStableRepairBefore0124();
};

GM_addStyle(`
@media(min-width:900px){
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host].ebsf-sidebar-active,
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host].ebsf-shell-sidebar{position:static!important;height:auto!important;max-height:none!important;overflow:visible!important}
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host] .ebsf-rail-header{display:flex!important}
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host] .ebsf-section{display:block!important}
}
`);

favShellSchedule0120(true);
