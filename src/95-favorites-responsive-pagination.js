'use strict';

/* v0.15.1 local-result pagination + native visual parity.
 *
 * Etsy's real WtPagination remains React-owned and is never repurposed as the
 * state owner for BetterSearch's globally filtered/sorted result pages. Local
 * page identity therefore stays independent, but the visible local pager is
 * rendered from Etsy's live WtPagination DOM/classes/templates so Favorites
 * always keeps Etsy's native pagination presentation instead of a bespoke
 * BetterSearch pager design.
 *
 * The base v0.14 renderer already slices favState.filtered by pageSize/localPage.
 * This module owns only:
 *   - the fixed 20-item local page size;
 *   - reset-to-page-1 when the dataset/filter/sort request changes;
 *   - a BetterSearch-owned local page state for results >20;
 *   - an Etsy-native WtPagination presentation for that local state;
 *   - strong, reversible visual suppression of Etsy's React-owned grid/pager
 *     while local mode is authoritative.
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

function favNativePagerTemplate0151() {
    return favNativePagers0150()[0] || null;
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

function favNativePagerButtonTemplate0151(kind) {
    const native = favNativePagerTemplate0151();
    if (!native) return null;
    const buttons = Array.from(native.querySelectorAll('.wt-action-group__item-container button'));
    if (kind === 'number') {
        return buttons.find((button) => /^\s*\d+\s*$/.test(button.textContent || '')) || null;
    }
    const wanted = kind === 'previous' ? 'previous' : 'next';
    return buttons.find((button) => {
        const label = String(button.querySelector('.wt-screen-reader-only')?.textContent || button.getAttribute('aria-label') || '').trim().toLowerCase();
        return label === wanted;
    }) || (kind === 'previous' ? buttons.find((button) => button.classList.contains('wt-btn--icon')) : buttons.slice().reverse().find((button) => button.classList.contains('wt-btn--icon'))) || null;
}

function favNativeArrowMarkup0151(kind) {
    const previousPath = 'M9.413 5.285A.5.5 0 0 1 10.12 5.285L10.228 5.393A.5.5 0 0 1 10.332 5.95L8.15 10.857 19.933 10.072A1 1 0 0 1 21 11.07V12.932A1 1 0 0 1 19.933 13.93L8.15 13.143 10.332 18.05A.5.5 0 0 1 10.228 18.607L10.118 18.717A.5.5 0 0 1 9.41 18.718L3.266 12.572A.75.75 0 0 1 3.047 12.041V11.96C3.047 11.764 3.126 11.572 3.267 11.432z';
    const nextPath = 'M14.587 5.285A.5.5 0 0 0 13.88 5.285L13.772 5.393A.5.5 0 0 0 13.668 5.95L15.85 10.857 4.067 10.072A1 1 0 0 0 3 11.07V12.932A1 1 0 0 0 4.067 13.93L15.85 13.143 13.67 18.05A.5.5 0 0 0 13.772 18.607L13.882 18.717A.5.5 0 0 0 14.59 18.718L20.734 12.572A.75.75 0 0 0 20.953 12.041V11.96A.75.75 0 0 0 20.733 11.432z';
    const label = kind === 'previous' ? 'Previous' : 'Next';
    const path = kind === 'previous' ? previousPath : nextPath;
    return `<span class="wt-screen-reader-only">${label}</span><span class="etsy-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg></span>`;
}

function favNativeLocalPageControl0151(kind, page, options = {}) {
    const container = document.createElement('div');
    container.className = 'wt-action-group__item-container';

    const template = favNativePagerButtonTemplate0151(kind === 'number' ? 'number' : kind);
    const button = template?.cloneNode(true) || document.createElement('button');
    button.type = 'button';
    button.classList.add('wt-btn', 'wt-action-group__item');
    button.classList.remove('wt-is-selected', 'wt-is-disabled');
    button.removeAttribute('aria-current');
    button.removeAttribute('aria-disabled');
    button.removeAttribute('disabled');
    button.disabled = false;
    button.dataset.ebsfLocalPage = String(page);
    if (!button.getAttribute('data-clg-id')) button.setAttribute('data-clg-id', 'WtButton');

    if (kind === 'number') {
        button.classList.remove('wt-btn--icon');
        button.textContent = String(options.label ?? page);
    } else {
        button.classList.add('wt-btn--icon');
        if (!template) button.innerHTML = favNativeArrowMarkup0151(kind);
        const sr = button.querySelector('.wt-screen-reader-only');
        if (sr) sr.textContent = kind === 'previous' ? 'Previous' : 'Next';
    }

    if (options.current) {
        button.classList.add('wt-is-selected');
        button.setAttribute('aria-current', 'true');
    }
    if (options.disabled) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.classList.add('wt-is-disabled');
    }
    container.append(button);
    return container;
}

function favNativeLocalEllipsis0151() {
    const container = document.createElement('div');
    container.className = 'wt-action-group__item-container';
    const span = document.createElement('span');
    span.className = 'wt-action-group__item';
    span.textContent = '…';
    span.setAttribute('aria-hidden', 'true');
    container.append(span);
    return container;
}

function favBuildNativePaginationShell0151() {
    const native = favNativePagerTemplate0151();
    const pager = native?.cloneNode(false) || document.createElement('nav');
    pager.removeAttribute('hidden');
    pager.hidden = false;
    pager.inert = false;
    pager.removeAttribute('aria-hidden');
    pager.removeAttribute('data-ebsf-native-pager-hidden');
    delete pager.dataset.ebsfNativePagerPrevHidden;
    delete pager.dataset.ebsfNativePagerPrevInert;
    delete pager.dataset.ebsfNativePagerPrevAria;
    pager.dataset.ebsfLocalPagination = '1';
    pager.dataset.ebsfPaginationPresentation = 'etsy-native';
    pager.setAttribute('data-clg-id', native?.getAttribute('data-clg-id') || 'WtPagination');
    pager.setAttribute('aria-label', native?.getAttribute('aria-label') || 'Favorite Items Page Results');

    const nativeGroup = native?.querySelector('.wt-action-group');
    const group = nativeGroup?.cloneNode(false) || document.createElement('div');
    if (!nativeGroup) group.className = 'wt-action-group wt-list-inline wt-body-max-width wt-mt-xs-1 wt-mb-xs-10';
    group.replaceChildren();
    pager.replaceChildren(group);
    return pager;
}

function favEnsureLocalPagination0150(localGrid) {
    let pager = favState.localPagination0150;
    if (!pager?.isConnected) pager = document.querySelector('[data-ebsf-local-pagination]');
    if (pager && pager.dataset.ebsfPaginationPresentation !== 'etsy-native') {
        pager.remove();
        pager = null;
    }
    if (!pager) pager = favBuildNativePaginationShell0151();
    if (pager.parentElement !== localGrid.parentElement || pager.previousElementSibling !== localGrid) localGrid.after(pager);
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

/* Local page state remains BetterSearch-owned, but the visible control uses Etsy's
 * WtPagination presentation. The hidden native React pager itself is untouched. */
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
    const group = pager.querySelector('.wt-action-group') || pager;
    const fragment = document.createDocumentFragment();
    fragment.append(favNativeLocalPageControl0151('previous', favState.localPage - 1, {
        disabled:favState.localPage <= 1,
    }));

    for (const item of favLocalPageItems0150(favState.localPage, totalPages)) {
        if (item === 'ellipsis') {
            fragment.append(favNativeLocalEllipsis0151());
            continue;
        }
        fragment.append(favNativeLocalPageControl0151('number', item, {
            label:item,
            current:item === favState.localPage,
        }));
    }

    fragment.append(favNativeLocalPageControl0151('next', favState.localPage + 1, {
        disabled:favState.localPage >= totalPages,
    }));
    group.replaceChildren(fragment);
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
        && localPager.dataset.ebsfPaginationPresentation === 'etsy-native'
        && localPager.getAttribute('data-clg-id') === 'WtPagination'
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
   * by the HTML hidden attribute alone. The visible local pager itself relies
   * entirely on Etsy's WtPagination/WtButton classes and native layout CSS. */
  [data-ebsf-native-hidden="1"]{
    display:none!important;
  }
  nav[data-ebsf-native-pager-hidden="1"]{
    display:none!important;
  }
`);
