'use strict';

/* v0.14.1 logged-in smoke-test fixes.
 *
 * The first real v0.14 browser/HAR pass exposed integration gaps between the
 * new native/local render ownership and the older late Favorites shell chain.
 * Keep this layer deliberately bounded to those ownership seams:
 *
 * 1. install the permanent desktop rail as soon as its native sidebar host is
 *    available, even when the content branch has not settled yet;
 * 2. make the header's “shown” count follow the grid that is actually visible;
 * 3. reassert v0.14's explicit no-local-pagination boundary after module 95;
 * 4. verify the BetterSearch local grid survives a late Etsy reconciliation.
 *
 * This does not add server-side filter delegation, a new pagination model, or
 * broad lifecycle consolidation. Those remain separate architecture phases.
 */
favState.renderIntegrityTimer0142 = Number(favState.renderIntegrityTimer0142) || 0;

function favLocalGridAuthoritative0142() {
    const local = favState.localGrid0141;
    const nativeGrid = favState.nativeGrid?.isConnected
        ? favState.nativeGrid
        : favNativeMainGrid0141?.();
    return Boolean(
        favState.renderMode0141 === 'bettersearch-local'
        && local?.isConnected
        && !local.hidden
        && nativeGrid?.isConnected
        && nativeGrid.hidden === true
        && nativeGrid.hasAttribute?.('data-ebsf-native-hidden')
    );
}

/* A BetterSearch option can be active while v0.14 intentionally keeps Etsy's
 * native grid visible (for example while deep metadata is pending), or while a
 * dataset/view transition is settling. In those states favRestoreNative()
 * clears favState.filtered. Counting that empty array produced the observed
 * “N favorites · 0 shown” even though native cards were plainly visible. */
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

/* Module 95 predates v0.14 and reintroduced a 20-item local slice tied to
 * Etsy's native pager after module 86 had intentionally disabled local
 * pagination. That contradicts v0.14's release boundary and can make a global
 * sort/filter appear to have no effect on the currently selected native page.
 * Until the dedicated local-pagination phase exists, render the complete local
 * match set exactly as v0.14 intended and leave Etsy's pager DOM untouched. */
favRenderCurrent = function favRenderCurrent0142() {
    favState.localPage = 1;
    favState.localPageRouteKey0129 = '';
    favState.pageSize = Math.max(1, favState.records.length || 1);
    return favRenderCurrentBefore0122();
};

favRenderPagination = function favRenderPagination0142() {
    document.body?.classList.remove('ebsf-local-single-page0129');
};

function favEnsurePermanentRail0142() {
    if (!isFavoritesPage() || !favDesktopShell0120()) return false;
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (!sidebar) return false;
    if (!sidebar.querySelector(':scope > [data-ebsf-rail]')) favInstallPermanentRail0120();
    const rail = sidebar.querySelector(':scope > [data-ebsf-rail]');
    if (!rail) return false;
    favState.sidebar = sidebar;
    favState.rail = rail;
    favState.filterOpen = true;
    sidebar.classList.add('ebsf-sidebar-active', 'ebsf-sidebar-permanent');
    favPolishFilterButton?.();
    return true;
}

/* The old shell installer required BOTH the sidebar and a resolved content
 * sibling before it even attempted to mount the rail. Etsy can hydrate those
 * branches independently. Collections happened to settle in the favorable
 * order in the smoke HAR, while All sometimes did not. Rail ownership only
 * depends on the sidebar itself, so claim it before the old content gate. */
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

function favRenderIntegrityReady0142(datasetKey) {
    if (!isFavoritesPage() || datasetKey !== favDatasetKey()) return false;
    if (!favEnhancementActive()) return false;
    if (!favState.loadComplete || favState.loadKey !== datasetKey) return false;
    if (Number(favState.metadataCoverage0141?.pending) > 0) return false;
    return Boolean(favNativeMainGrid0141?.());
}

function favScheduleRenderIntegrity0142(delay = 0, datasetKey = favDatasetKey()) {
    clearTimeout(favState.renderIntegrityTimer0142);
    favState.renderIntegrityTimer0142 = setTimeout(() => {
        favState.renderIntegrityTimer0142 = 0;
        if (!favRenderIntegrityReady0142(datasetKey)) return;
        if (!favLocalGridAuthoritative0142()) favRenderCurrent();
        favUpdateScopeHeader0120?.();
        favEnsurePermanentRail0142();
    }, Math.max(0, Number(delay) || 0));
}

/* Reapply already owns catalogue + metadata readiness. The postcondition here
 * is intentionally tiny: once it says the current enhancement is ready, make
 * sure the local grid really exists and is the visible owner. A second delayed
 * check catches Etsy reconciling the component island immediately afterward. */
var favReapplyBefore0142 = favReapply;
favReapply = async function favReapply0142(...args) {
    const datasetKey = favDatasetKey();
    const result = await favReapplyBefore0142(...args);
    if (datasetKey === favDatasetKey()) {
        favScheduleRenderIntegrity0142(0, datasetKey);
        setTimeout(() => {
            if (datasetKey === favDatasetKey()) favScheduleRenderIntegrity0142(120, datasetKey);
        }, 40);
    }
    return result;
};

/* The existing body observer funnels native DOM churn through favScheduleSync.
 * Reuse that lifecycle signal instead of adding another broad MutationObserver:
 * if Etsy removes/replaces our sibling local grid during reconciliation, the
 * next scheduled sync also performs a cheap local-ownership integrity check. */
var favScheduleSyncBefore0142 = favScheduleSync;
favScheduleSync = function favScheduleSync0142(delay = 100) {
    const result = favScheduleSyncBefore0142(delay);
    if (favState.renderMode0141 === 'bettersearch-local') {
        favScheduleRenderIntegrity0142(Math.max(80, Number(delay) || 0));
    }
    return result;
};

/* Native-mode transitions must immediately stop reporting the stale local
 * match count. The next frame sees the post-reset dataset/props state. */
var favRestoreNativeBefore0142 = favRestoreNative;
favRestoreNative = function favRestoreNative0142() {
    const result = favRestoreNativeBefore0142();
    requestAnimationFrame(() => favUpdateScopeHeader0120?.());
    return result;
};

window.addEventListener('resize', () => requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120();
    if (favState.renderMode0141 === 'bettersearch-local') favScheduleRenderIntegrity0142(80);
}), { passive:true });

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120();
    if (favEnhancementActive()) favScheduleRenderIntegrity0142(120);
});
