'use strict';

/* v0.13.0 native Favorites page-state adapter.
 *
 * Etsy's Favorites pager is React-owned button state, not reliably URL-owned
 * navigation. In the captured native markup the current page is expressed by
 * aria-current / wt-is-selected on a numeric WtButton, while Previous/Next are
 * buttons too. Reading only ?page= therefore leaves BetterSearch stuck on page
 * 1 even after Etsy has selected page 2 or 3.
 *
 * This adapter observes Etsy's pager state without preventing clicks, moving
 * nodes, recreating pagination, or changing its visual structure. It feeds the
 * selected native page into the existing view/local-page identity so page
 * changes reuse the already-loaded catalogue instead of re-downloading it.
 */
var FAV_NATIVE_PAGE_INTENT_TTL0139 = 1800;
favState.nativePageIntent0139 = Math.max(0, Number(favState.nativePageIntent0139) || 0);
favState.nativePageIntentAt0139 = Math.max(0, Number(favState.nativePageIntentAt0139) || 0);

function favPositivePage0139(value) {
    const page = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(page) && page > 0 ? page : 0;
}

function favNativePager0139() {
    const pagers = Array.from(document.querySelectorAll('nav[aria-label="Favorite Items Page Results"]'));
    return pagers.find((pager) => pager.isConnected && pager.getClientRects().length > 0)
        || pagers.find((pager) => pager.isConnected)
        || null;
}

function favNativeSelectedPage0139() {
    const pager = favNativePager0139();
    if (!pager) return 0;
    const selected = pager.querySelector(
        'button[aria-current="true"], button[aria-current="page"], button.wt-is-selected, [data-clg-id="WtButton"][aria-current="true"], [data-clg-id="WtButton"].wt-is-selected'
    );
    return favPositivePage0139(selected?.textContent);
}

function favUrlPage0139() {
    try {
        return favPositivePage0139(new URL(location.href).searchParams.get('page'));
    } catch (_) {
        return 0;
    }
}

function favSetNativePageIntent0139(page) {
    const target = favPositivePage0139(page);
    if (!target) return 0;
    favState.nativePageIntent0139 = target;
    favState.nativePageIntentAt0139 = Date.now();
    return target;
}

function favFreshNativePageIntent0139() {
    const target = favPositivePage0139(favState.nativePageIntent0139);
    if (!target) return 0;
    if (Date.now() - favState.nativePageIntentAt0139 > FAV_NATIVE_PAGE_INTENT_TTL0139) {
        favState.nativePageIntent0139 = 0;
        favState.nativePageIntentAt0139 = 0;
        return 0;
    }
    const selected = favNativeSelectedPage0139();
    if (selected === target) {
        favState.nativePageIntent0139 = 0;
        favState.nativePageIntentAt0139 = 0;
        return selected;
    }
    return target;
}

function favCurrentFavoritePage0139() {
    return favFreshNativePageIntent0139()
        || favNativeSelectedPage0139()
        || favUrlPage0139()
        || 1;
}

/* Runtime view identity now follows the page Etsy actually selected. URL page
 * remains a fallback for direct/history navigation that exposes one. */
favRequestedRoutePage0137 = function favRequestedRoutePage0139() {
    return favCurrentFavoritePage0139();
};

favViewKey0137 = function favViewKey0139() {
    return `${favScopeKey()}|page:${favCurrentFavoritePage0139()}`;
};

/* Module 95's 20-item renderer calls these names dynamically, so rebinding the
 * helpers is enough to make its local slice follow native WtPagination state. */
favPageRouteKey0129 = function favPageRouteKey0139() {
    try {
        const url = new URL(location.href);
        return `${url.pathname}|${url.searchParams.get('tab') || ''}|${url.searchParams.get('collectionId') || ''}|page:${favCurrentFavoritePage0139()}|${url.searchParams.get('search_query') || url.searchParams.get('q') || ''}`;
    } catch (_) {
        return `${location.href}|page:${favCurrentFavoritePage0139()}`;
    }
};

favRequestedPage0129 = function favRequestedPage0139() {
    return favCurrentFavoritePage0139();
};

/* Ensure the first render after this final adapter is loaded re-evaluates the
 * page with native state instead of retaining module 95's URL-only route key. */
favState.localPageRouteKey0129 = '';

function favPagerButtonTargetPage0139(button) {
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return 0;
    const direct = favPositivePage0139(button.textContent);
    if (direct) return direct;

    const label = String(
        button.querySelector('.wt-screen-reader-only')?.textContent
        || button.getAttribute('aria-label')
        || ''
    ).trim().toLowerCase();
    const current = favNativeSelectedPage0139() || favPositivePage0139(favState.localPage) || favUrlPage0139() || 1;
    if (label === 'next') return current + 1;
    if (label === 'previous') return Math.max(1, current - 1);
    return 0;
}

function favScheduleNativePageReconcile0139() {
    for (const delay of [0, 80, 220, 500]) {
        setTimeout(() => {
            if (!isFavoritesPage()) return;
            favState.localPageRouteKey0129 = '';
            favScheduleSync(0);
            if (delay >= 220) favScheduleCurrentPageObservation(300);
        }, delay);
    }
}

/* Capture intent before Etsy's own click handler, but never cancel or replace
 * Etsy's action. The short-lived intent bridges the small interval before React
 * moves aria-current to the newly selected page. */
document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('nav[aria-label="Favorite Items Page Results"] button');
    if (!button) return;
    const target = favPagerButtonTargetPage0139(button);
    if (!target) return;
    favSetNativePageIntent0139(target);
    favState.localPage = target;
    favState.localPageRouteKey0129 = '';
    favScheduleNativePageReconcile0139();
}, true);

/* History navigation can expose ?page= even when the current native button is
 * still stale for a moment. Seed the same transient intent before the runtime's
 * own popstate listener classifies the view change. */
window.addEventListener('popstate', () => {
    const page = favUrlPage0139();
    if (!page) return;
    favSetNativePageIntent0139(page);
    favState.localPageRouteKey0129 = '';
});
