'use strict';

/* v0.14.2 native pagination compatibility.
 *
 * v0.12.9 briefly coupled BetterSearch's local renderer to Etsy's native pager
 * by replacing favRenderCurrent() with a 20-item slice. v0.14 explicitly
 * deferred local pagination and module 94 already restored Etsy's pager as a
 * native-only boundary. Keep only the route/page helper names that the native
 * page-state adapter (95a) still rebinds; never replace the renderer or pager.
 *
 * This is important for lifecycle correctness too: module 89 wraps the real
 * renderer with the post-render shell/rail repair. Jumping back to an older
 * saved renderer silently skipped that repair and could leave the sidebar
 * column empty after an Etsy reconciliation.
 */
favState.localPageRouteKey0129 = favState.localPageRouteKey0129 || '';

function favPageRouteKey0129() {
    try {
        const url = new URL(location.href);
        return `${url.pathname}|${url.searchParams.get('tab') || ''}|${url.searchParams.get('collectionId') || ''}|${url.searchParams.get('page') || '1'}|${url.searchParams.get('search_query') || url.searchParams.get('q') || ''}`;
    } catch (_) {
        return location.href;
    }
}

function favRequestedPage0129() {
    try {
        const raw = Number.parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
        return Number.isFinite(raw) && raw > 0 ? raw : 1;
    } catch (_) {
        return 1;
    }
}

function favSyncLocalPageFromRoute0129() {
    const key = favPageRouteKey0129();
    if (favState.localPageRouteKey0129 === key) return;
    favState.localPageRouteKey0129 = key;
    favState.localPage = favRequestedPage0129();
}

/* Defensive cleanup for profiles that previously ran the v0.12.9 rule. The
 * final native-boundary module owns the pager and no current code should add
 * this class again. */
document.body?.classList.remove('ebsf-local-single-page0129');
