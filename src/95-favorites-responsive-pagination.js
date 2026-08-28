'use strict';

/* v0.12.9 native pagination compatibility.
 *
 * Keep this module deliberately narrow: enhanced Favorites results use a
 * 20-item local page while Etsy continues to own the actual pager DOM. Final
 * header/responsive ownership and runtime release live in module 96.
 */

var FAV_LOCAL_PAGE_SIZE0129 = 20;
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

favRenderCurrent = function favRenderCurrent0129() {
    favSyncLocalPageFromRoute0129();
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0129;
    return favRenderCurrentBefore0122();
};

/* Etsy owns pagination markup. BetterSearch only hides the complete native
 * control when the current filtered result set fits on one local page. */
favRenderPagination = function favRenderPagination0129(totalPages) {
    document.body?.classList.toggle('ebsf-local-single-page0129', Number(totalPages) <= 1);
};

var favRestorePaginationBefore0129 = favRestorePagination0122;
favRestorePagination0122 = function favRestorePagination0129() {
    document.body?.classList.remove('ebsf-local-single-page0129');
    return favRestorePaginationBefore0129();
};

GM_addStyle(`
  body.ebsf-local-single-page0129 nav[aria-label="Favorite Items Page Results"],
  body.ebsf-local-single-page0129 nav[data-clg-id="WtPagination"][aria-label*="Favorite" i]{
    display:none!important;
  }
`);
