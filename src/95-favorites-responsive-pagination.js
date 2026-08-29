'use strict';

/* v0.15.0 local-result pagination + visual ownership.
 *
 * Etsy's WtPagination belongs only to Etsy's native grid. BetterSearch global
 * filters/sorts operate on the complete catalogue, so they need a separate page
 * identity and (when >20 matches exist) a separate pager. Never map Etsy page 2
 * to BetterSearch page 2 and never move/rebuild Etsy's React-owned pager.
 *
 * The base v0.14 renderer already slices favState.filtered by pageSize/localPage.
 * This module owns only:
 *   - the fixed 20-item local page size;
 *   - reset-to-page-1 when the dataset/filter/sort request changes;
 *   - a BetterSearch-owned pager for local results >20;
 *   - strong, reversible visual suppression of Etsy's native grid/pager while
 *     local mode is authoritative.
 */
var FAV_LOCAL_PAGE_SIZE0150 = 20;
favState.localResultKey0150 = String(favState.localResultKey0150 || '');
favState.localPagination0150 = favState.localPagination0150 || null;
favState.localPage = Math.max(1, Number(favState.localPage) || 1);
favState.pageSize = FAV_LOCAL_PAGE_SIZE0150;

/* Legacy page-route helpers stay callable for old modules/tests, but they now
 * describe Etsy's native view only. They must never mutate the local result page. */
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
    /* Compatibility no-op. Native page identity and local result page identity
     * are intentionally independent as of v0.15.0. */
    favState.localPageRouteKey0129 = favPageRouteKey0129();
    return favState.localPage;
}

document.body?.classList.remove('ebsf-local-single-page0129');

function favLocalResultRequestKey0150() {
    let config = '';
    try { config = JSON.stringify(favNormalizeConfig(favCfg)); }
    catch (_) { config = JSON.stringify(favCfg || {}); }
    return `${favDatasetKey()}|${config}`;
}

function favEnsureLocalPageContext0150() {
    const key = favLocalResultRequestKey0150();
    if (favState.localResultKey0150 !== key) {
        favState.localResultKey0150 = key;
        favState.localPage = 1;
    }
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0150;
    return key;
}

/* Reset the local page before the authoritative catalogue/metadata reapply path
 * runs. Page-only local navigation bypasses reapply and calls favRenderCurrent()
 * directly, so it does not accidentally reset itself to page 1. */
var favReapplyBefore0150 = favReapply;
favReapply = async function favReapply0150(...args) {
    favEnsureLocalPageContext0150();
    return favReapplyBefore0150(...args);
};

function favNativePagers0150() {
    return Array.from(document.querySelectorAll('nav[aria-label="Favorite Items Page Results"]'))
        .filter((pager) => pager?.isConnected && !pager.matches('[data-ebsf-local-pagination]'));
}

function favStoreNativePagerState0150(pager) {
    if (!pager || pager.hasAttribute('data-ebsf-native-pager-hidden')) return;
    pager.dataset.ebsfNativePagerPrevHidden = pager.hidden ? '1' : '0';
    pager.dataset.ebsfNativePagerPrevInert = pager.inert ? '1' : '0';
    const ariaHidden = pager.getAttribute('aria-hidden');
    pager.dataset.ebsfNativePagerPrevAria = ariaHidden == null ? '__missing__' : ariaHidden;
}

function favHideNativePagers0150() {
    for (const pager of favNativePagers0150()) {
        favStoreNativePagerState0150(pager);
        pager.hidden = true;
        pager.inert = true;
        pager.setAttribute('aria-hidden', 'true');
        pager.setAttribute('data-ebsf-native-pager-hidden', '1');
    }
}

function favRestoreNativePagers0150() {
    for (const pager of document.querySelectorAll('nav[data-ebsf-native-pager-hidden]')) {
        const previousHidden = pager.dataset.ebsfNativePagerPrevHidden === '1';
        const previousInert = pager.dataset.ebsfNativePagerPrevInert === '1';
        const previousAria = pager.dataset.ebsfNativePagerPrevAria;
        pager.hidden = previousHidden;
        pager.inert = previousInert;
        if (!previousAria || previousAria === '__missing__') pager.removeAttribute('aria-hidden');
        else pager.setAttribute('aria-hidden', previousAria);
        pager.removeAttribute('data-ebsf-native-pager-hidden');
        delete pager.dataset.ebsfNativePagerPrevHidden;
        delete pager.dataset.ebsfNativePagerPrevInert;
        delete pager.dataset.ebsfNativePagerPrevAria;
    }
}

function favRemoveLocalPagination0150() {
    const remembered = favState.localPagination0150;
    if (remembered?.isConnected) remembered.remove();
    for (const pager of document.querySelectorAll('[data-ebsf-local-pagination]')) {
        if (pager !== remembered) pager.remove();
    }
    favState.localPagination0150 = null;
}

function favVisualDisplayNone0150(node) {
    if (!node?.isConnected) return false;
    try { return getComputedStyle(node).display === 'none'; }
    catch (_) { return node.hidden === true; }
}

function favApplyLocalVisualOwnership0150() {
    if (favState.renderMode0141 !== 'bettersearch-local') return false;
    const nativeGrid = favNativeMainGrid0141?.() || (favState.nativeGrid?.isConnected ? favState.nativeGrid : null);
    const localGrid = favState.localGrid0141;
    if (!nativeGrid?.isConnected || !localGrid?.isConnected) return false;

    nativeGrid.hidden = true;
    nativeGrid.setAttribute('aria-hidden', 'true');
    nativeGrid.setAttribute('data-ebsf-native-hidden', '1');
    localGrid.hidden = false;
    localGrid.removeAttribute('aria-hidden');
    favHideNativePagers0150();
    return true;
}

function favLocalPageItems0150(current, total) {
    const pages = Math.max(1, Number(total) || 1);
    const page = Math.min(pages, Math.max(1, Number(current) || 1));
    if (pages <= 7) return Array.from({ length:pages }, (_, index) => index + 1);
    const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
    const values = Array.from(keep).filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
    const out = [];
    for (const value of values) {
        const previous = out[out.length - 1];
        if (typeof previous === 'number' && value - previous > 1) out.push('ellipsis');
        out.push(value);
    }
    return out;
}

function favLocalPageButton0150(label, page, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ebsf-local-page-button';
    button.textContent = String(label);
    button.dataset.ebsfLocalPage = String(page);
    if (options.label) button.setAttribute('aria-label', options.label);
    if (options.current) {
        button.classList.add('is-current');
        button.setAttribute('aria-current', 'page');
    }
    if (options.disabled) button.disabled = true;
    return button;
}

function favEnsureLocalPagination0150(localGrid) {
    let pager = favState.localPagination0150;
    if (!pager?.isConnected) {
        pager = document.querySelector('[data-ebsf-local-pagination]');
    }
    if (!pager) {
        pager = document.createElement('nav');
        pager.className = 'ebsf-local-pagination';
        pager.dataset.ebsfLocalPagination = '1';
        pager.setAttribute('aria-label', 'BetterSearch filtered favorites pages');
    }
    if (pager.parentElement !== localGrid.parentElement || pager.previousElementSibling !== localGrid) {
        localGrid.after(pager);
    }
    favState.localPagination0150 = pager;
    return pager;
}

function favGoToLocalPage0150(page) {
    if (favState.renderMode0141 !== 'bettersearch-local') return false;
    const matched = Array.isArray(favState.filtered) ? favState.filtered : [];
    const pages = Math.max(1, Math.ceil(matched.length / FAV_LOCAL_PAGE_SIZE0150));
    const target = Math.min(pages, Math.max(1, Number(page) || 1));
    if (target === favState.localPage) return false;
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0150;
    favState.localPage = target;
    favRenderCurrent();
    requestAnimationFrame(() => {
        document.querySelector('.phase3-listing-cards-section')?.scrollIntoView?.({ block:'start' });
    });
    return true;
}

/* Module 94 deliberately makes favRenderPagination a no-op for native mode.
 * Local mode now owns a distinct pager without touching Etsy's pager DOM. */
favRenderPagination = function favRenderPagination0150(pages) {
    const localGrid = favState.localGrid0141;
    if (favState.renderMode0141 !== 'bettersearch-local' || !localGrid?.isConnected) {
        favRemoveLocalPagination0150();
        favRestoreNativePagers0150();
        return;
    }

    favApplyLocalVisualOwnership0150();
    const totalPages = Math.max(1, Number(pages) || 1);
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0150;
    favState.localPage = Math.min(totalPages, Math.max(1, Number(favState.localPage) || 1));

    if (totalPages <= 1) {
        favRemoveLocalPagination0150();
        return;
    }

    const pager = favEnsureLocalPagination0150(localGrid);
    const fragment = document.createDocumentFragment();
    fragment.append(favLocalPageButton0150('‹', favState.localPage - 1, {
        label:'Previous BetterSearch results page',
        disabled:favState.localPage <= 1,
    }));

    for (const item of favLocalPageItems0150(favState.localPage, totalPages)) {
        if (item === 'ellipsis') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'ebsf-local-page-ellipsis';
            ellipsis.textContent = '…';
            ellipsis.setAttribute('aria-hidden', 'true');
            fragment.append(ellipsis);
            continue;
        }
        fragment.append(favLocalPageButton0150(item, item, { current:item === favState.localPage }));
    }

    fragment.append(favLocalPageButton0150('›', favState.localPage + 1, {
        label:'Next BetterSearch results page',
        disabled:favState.localPage >= totalPages,
    }));
    pager.replaceChildren(fragment);
    pager.dataset.ebsfLocalPageCount = String(totalPages);
    pager.dataset.ebsfLocalCurrentPage = String(favState.localPage);
};

document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-ebsf-local-pagination] button[data-ebsf-local-page]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    favGoToLocalPage0150(button.dataset.ebsfLocalPage);
}, true);

function favLocalPaginationOwnershipHealthy0150() {
    if (favState.renderMode0141 !== 'bettersearch-local') return !document.querySelector('[data-ebsf-local-pagination]');
    const nativeGrid = favNativeMainGrid0141?.() || (favState.nativeGrid?.isConnected ? favState.nativeGrid : null);
    const localGrid = favState.localGrid0141;
    if (!nativeGrid?.isConnected || !localGrid?.isConnected) return false;
    if (!nativeGrid.hasAttribute('data-ebsf-native-hidden') || !favVisualDisplayNone0150(nativeGrid)) return false;
    if (favVisualDisplayNone0150(localGrid)) return false;
    if (favNativePagers0150().some((pager) => !pager.hasAttribute('data-ebsf-native-pager-hidden') || !favVisualDisplayNone0150(pager))) return false;

    const matches = Array.isArray(favState.filtered) ? favState.filtered.length : 0;
    const pages = Math.max(1, Math.ceil(matches / FAV_LOCAL_PAGE_SIZE0150));
    const localPager = document.querySelector('[data-ebsf-local-pagination]');
    if (pages <= 1) return !localPager;
    return Boolean(
        localPager?.isConnected
        && localPager.dataset.ebsfLocalPageCount === String(pages)
        && localPager.dataset.ebsfLocalCurrentPage === String(favState.localPage)
    );
}

var favRestoreNativeBefore0150 = favRestoreNative;
favRestoreNative = function favRestoreNative0150() {
    favRemoveLocalPagination0150();
    favRestoreNativePagers0150();
    return favRestoreNativeBefore0150();
};

GM_addStyle(`
  /* Etsy's utility classes may set display with !important. Local ownership is
   * therefore enforced by an equally explicit BetterSearch-owned marker, not
   * by the HTML hidden attribute alone. */
  [data-ebsf-native-hidden="1"]{
    display:none!important;
  }
  nav[data-ebsf-native-pager-hidden="1"]{
    display:none!important;
  }
  .ebsf-local-pagination{
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:6px!important;
    width:100%!important;
    margin:24px 0 8px!important;
    padding:0!important;
  }
  .ebsf-local-page-button{
    appearance:none!important;
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-width:36px!important;
    height:36px!important;
    padding:0 10px!important;
    border:1px solid transparent!important;
    border-radius:999px!important;
    background:transparent!important;
    color:#222!important;
    font:600 13px/1 Arial,sans-serif!important;
    cursor:pointer!important;
  }
  .ebsf-local-page-button:hover:not(:disabled),
  .ebsf-local-page-button:focus-visible{
    background:#ece9e5!important;
  }
  .ebsf-local-page-button.is-current{
    border-color:#222!important;
    background:#fff!important;
  }
  .ebsf-local-page-button:disabled{
    opacity:.35!important;
    cursor:default!important;
  }
  .ebsf-local-page-ellipsis{
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-width:22px!important;
    height:36px!important;
    color:#666!important;
  }
`);
