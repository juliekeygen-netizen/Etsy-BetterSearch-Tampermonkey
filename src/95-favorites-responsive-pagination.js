'use strict';

/* v0.14.3 explicit native/local pagination ownership.
 *
 * Native mode:
 * - Etsy owns its live product grid and Favorite Items Page Results pager.
 *
 * BetterSearch-local mode:
 * - Etsy's grid and pager remain connected/untouched but are visually hidden;
 * - BetterSearch renders at most 20 matching records per local page;
 * - BetterSearch owns a separate local pager only when >20 records match;
 * - local page state never writes Etsy's URL or native pager state.
 */
var FAV_LOCAL_PAGE_SIZE0144 = 20;
favState.localPageRouteKey0129 = favState.localPageRouteKey0129 || '';
favState.localPagingKey0144 = String(favState.localPagingKey0144 || '');
favState.localPagination0144 = favState.localPagination0144 || null;
favState.nativeGridVisibility0144 = favState.nativeGridVisibility0144 instanceof WeakMap ? favState.nativeGridVisibility0144 : new WeakMap();
favState.nativeGridVisibilityNodes0144 = favState.nativeGridVisibilityNodes0144 instanceof Set ? favState.nativeGridVisibilityNodes0144 : new Set();

/* These helpers remain native-view helpers. They must not mutate local result
 * pagination. 95a rebinds them to Etsy's hydrated WtPagination state. */
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
    /* Compatibility name only: native page identity is view state, not local
     * filtered-result pagination. Keep the key fresh without assigning
     * favState.localPage. */
    favState.localPageRouteKey0129 = favPageRouteKey0129();
}

function favLocalPagingKey0144() {
    let config = '';
    try { config = JSON.stringify(favNormalizeConfig(favCfg)); }
    catch (_) { config = JSON.stringify(favCfg || {}); }
    return `${favDatasetKey()}|${config}`;
}

function favPrepareLocalPage0144() {
    const key = favLocalPagingKey0144();
    if (favState.localPagingKey0144 !== key) {
        favState.localPagingKey0144 = key;
        favState.localPage = 1;
    }
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0144;
    const page = Number.parseInt(String(favState.localPage || 1), 10);
    favState.localPage = Number.isFinite(page) && page > 0 ? page : 1;
}

function favRemoveLocalPagination0144() {
    const tracked = favState.localPagination0144;
    if (tracked?.isConnected) tracked.remove();
    document.querySelectorAll('[data-ebsf-local-pagination]').forEach((node) => {
        if (node !== tracked) node.remove();
    });
    favState.localPagination0144 = null;
}

function favPruneStrayLocalGrids0144() {
    const tracked = favState.localGrid0141;
    document.querySelectorAll('[data-ebsf-local-grid]').forEach((grid) => {
        if (grid !== tracked) grid.remove();
    });
}

function favNativeResultGrids0144() {
    return Array.from(document.querySelectorAll(
        '.phase3-listing-cards-section ul.implicit-comparison-listing-card-row, .phase3-listing-cards-section ul[role="list"]'
    )).filter((grid) => !grid.hasAttribute('data-ebsf-local-grid'));
}

function favRememberNativeGridVisibility0144(nativeGrid) {
    if (!nativeGrid || favState.nativeGridVisibility0144.has(nativeGrid)) return;
    favState.nativeGridVisibility0144.set(nativeGrid, {
        hidden:Boolean(nativeGrid.hidden),
        ariaHiddenPresent:nativeGrid.hasAttribute('aria-hidden'),
        ariaHidden:nativeGrid.getAttribute('aria-hidden'),
        markerPresent:nativeGrid.hasAttribute('data-ebsf-native-hidden'),
        marker:nativeGrid.getAttribute('data-ebsf-native-hidden'),
        display:nativeGrid.style.getPropertyValue('display'),
        displayPriority:nativeGrid.style.getPropertyPriority('display'),
    });
    favState.nativeGridVisibilityNodes0144.add(nativeGrid);
}

function favRememberNativeGridVisibilitySet0144() {
    for (const nativeGrid of favNativeResultGrids0144()) favRememberNativeGridVisibility0144(nativeGrid);
}

function favNativeGridSuppressed0144(nativeGrid) {
    if (!nativeGrid?.isConnected) return false;
    if (nativeGrid.style.getPropertyValue('display') === 'none') return true;
    try { return getComputedStyle(nativeGrid).display === 'none'; }
    catch (_) { return false; }
}

function favEnforceLocalGridOwnership0144() {
    if (favState.renderMode0141 !== 'bettersearch-local' || !favState.localGrid0141?.isConnected) return false;
    favPruneStrayLocalGrids0144();
    for (const nativeGrid of favNativeResultGrids0144()) {
        favRememberNativeGridVisibility0144(nativeGrid);
        nativeGrid.hidden = true;
        nativeGrid.setAttribute('aria-hidden', 'true');
        nativeGrid.setAttribute('data-ebsf-native-hidden', '1');
        /* Etsy's wt-display-flex-xs uses display:flex!important. A plain hidden
         * attribute is therefore not a strong enough visual ownership contract. */
        nativeGrid.style.setProperty('display', 'none', 'important');
    }
    favState.localGrid0141.hidden = false;
    favState.localGrid0141.style.removeProperty('display');
    return favNativeResultGrids0144().every((nativeGrid) => favNativeGridSuppressed0144(nativeGrid));
}

function favReleaseNativeGridOwnership0144() {
    for (const nativeGrid of Array.from(favState.nativeGridVisibilityNodes0144)) {
        const previous = favState.nativeGridVisibility0144.get(nativeGrid);
        if (!previous) continue;
        nativeGrid.hidden = previous.hidden;
        if (previous.ariaHiddenPresent) nativeGrid.setAttribute('aria-hidden', previous.ariaHidden ?? '');
        else nativeGrid.removeAttribute('aria-hidden');
        if (previous.markerPresent) nativeGrid.setAttribute('data-ebsf-native-hidden', previous.marker ?? '');
        else nativeGrid.removeAttribute('data-ebsf-native-hidden');
        if (previous.display) nativeGrid.style.setProperty('display', previous.display, previous.displayPriority || '');
        else nativeGrid.style.removeProperty('display');
        favState.nativeGridVisibility0144.delete(nativeGrid);
    }
    favState.nativeGridVisibilityNodes0144.clear();
}

function favLocalPageTokens0144(totalPages, currentPage) {
    const wanted = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 3) for (let page = 2; page <= Math.min(totalPages - 1, 4); page += 1) wanted.add(page);
    if (currentPage >= totalPages - 2) for (let page = Math.max(2, totalPages - 3); page < totalPages; page += 1) wanted.add(page);
    const pages = Array.from(wanted).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
    const tokens = [];
    let previous = 0;
    for (const page of pages) {
        if (previous && page - previous > 1) tokens.push('ellipsis');
        tokens.push(page);
        previous = page;
    }
    return tokens;
}

function favSetLocalPage0144(page, totalPages) {
    const target = Math.min(Math.max(1, Number.parseInt(String(page), 10) || 1), Math.max(1, totalPages));
    if (target === favState.localPage) return false;
    favState.localPage = target;
    void Promise.resolve(favReapply()).then(() => {
        document.querySelector('.phase3-listing-cards-section')?.scrollIntoView?.({ block:'start', behavior:'auto' });
    }).catch((error) => console.debug?.('[EBSF] local Favorites page change deferred', error));
    return true;
}

function favLocalPagerButton0144(label, page, totalPages, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ebsf-local-page-button wt-btn wt-btn--transparent wt-btn--small';
    button.textContent = label;
    button.dataset.ebsfLocalPage = String(page);
    if (options.current) {
        button.classList.add('is-current');
        button.setAttribute('aria-current', 'page');
        button.setAttribute('aria-label', `Page ${page}, current page`);
    } else {
        button.setAttribute('aria-label', options.ariaLabel || `Page ${page}`);
    }
    if (options.disabled) button.disabled = true;
    button.addEventListener('click', () => favSetLocalPage0144(page, totalPages));
    return button;
}

function favRenderPagination0144(totalPages) {
    const pages = Math.max(1, Number.parseInt(String(totalPages), 10) || 1);
    if (favState.renderMode0141 !== 'bettersearch-local' || pages <= 1 || !favState.localGrid0141?.isConnected) {
        favRemoveLocalPagination0144();
        return;
    }

    favState.localPage = Math.min(Math.max(1, favState.localPage), pages);
    let pager = favState.localPagination0144;
    if (!pager?.isConnected || pager.previousElementSibling !== favState.localGrid0141) {
        favRemoveLocalPagination0144();
        pager = document.createElement('div');
        pager.className = 'ebsf-local-pagination';
        pager.dataset.ebsfLocalPagination = '1';
        pager.setAttribute('role', 'navigation');
        /* Deliberately not Etsy's native Favorite Items Page Results label. */
        pager.setAttribute('aria-label', 'BetterSearch filtered favorites pages');
        favState.localGrid0141.insertAdjacentElement('afterend', pager);
        favState.localPagination0144 = pager;
    }

    const fragment = document.createDocumentFragment();
    fragment.append(favLocalPagerButton0144('Previous', favState.localPage - 1, pages, {
        disabled:favState.localPage <= 1,
        ariaLabel:'Previous BetterSearch results page',
    }));

    for (const token of favLocalPageTokens0144(pages, favState.localPage)) {
        if (token === 'ellipsis') {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'ebsf-local-page-ellipsis';
            ellipsis.textContent = '…';
            ellipsis.setAttribute('aria-hidden', 'true');
            fragment.append(ellipsis);
            continue;
        }
        fragment.append(favLocalPagerButton0144(String(token), token, pages, { current:token === favState.localPage }));
    }

    fragment.append(favLocalPagerButton0144('Next', favState.localPage + 1, pages, {
        disabled:favState.localPage >= pages,
        ariaLabel:'Next BetterSearch results page',
    }));
    pager.replaceChildren(fragment);
}

/* Module 86 used to force pageSize=records.length. It no longer owns result
 * paging. This wrapper is the single local-pagination owner and calls the full
 * current renderer chain, preserving module 89's post-render shell repair. */
var favRenderCurrentBefore0144 = favRenderCurrent;
favRenderCurrent = function favRenderCurrent0144() {
    favPrepareLocalPage0144();
    favPruneStrayLocalGrids0144();
    /* Snapshot BEFORE the base renderer adds hidden/aria ownership markers so
     * native mode can restore Etsy's exact pre-local state later. */
    favRememberNativeGridVisibilitySet0144();
    const result = favRenderCurrentBefore0144();
    favEnforceLocalGridOwnership0144();
    return result;
};

favRenderPagination = favRenderPagination0144;

var favRestoreNativeBefore0144 = favRestoreNative;
favRestoreNative = function favRestoreNative0144() {
    favRemoveLocalPagination0144();
    favState.localPagingKey0144 = '';
    favState.localPage = 1;
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0144;
    const result = favRestoreNativeBefore0144();
    /* Base restore makes the primary native grid usable; reapply the exact
     * snapshot afterward so a grid Etsy had intentionally hidden stays hidden. */
    favReleaseNativeGridOwnership0144();
    return result;
};

/* A hard CSS ownership boundary backs up the inline suppression above. Etsy's
 * native grid/pager stay in the DOM, but only one result owner is visible. */
GM_addStyle(`
  .phase3-listing-cards-section [data-ebsf-native-hidden="1"]{
    display:none!important;
  }
  body.ebsf-results-active nav[aria-label="Favorite Items Page Results"]{
    display:none!important;
  }
  .ebsf-local-pagination{
    display:flex;
    align-items:center;
    justify-content:center;
    flex-wrap:wrap;
    gap:6px;
    width:100%;
    box-sizing:border-box;
    padding:18px 0 8px;
  }
  .ebsf-local-page-button{
    min-width:38px!important;
    min-height:38px!important;
    padding:0 12px!important;
    border-radius:999px!important;
  }
  .ebsf-local-page-button.is-current{
    background:#222!important;
    color:#fff!important;
  }
  .ebsf-local-page-button:disabled{
    opacity:.4!important;
    cursor:default!important;
  }
  .ebsf-local-page-ellipsis{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:22px;
    min-height:38px;
    color:#777;
  }
`);

/* Defensive cleanup for profiles that previously ran the v0.12.9 rule. */
document.body?.classList.remove('ebsf-local-single-page0129');
favRemoveLocalPagination0144();