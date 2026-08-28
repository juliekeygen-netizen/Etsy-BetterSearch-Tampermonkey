'use strict';

/* v0.12.7 final responsive/paging correction.
 *
 * This layer fixes the remaining two responsive gaps without rebuilding Etsy's
 * native controls:
 *  - 761-899px previously fell between the old <=760 narrow rules and Etsy's
 *    <=899 sidebar-hidden layout, leaving Search capped well before the right
 *    edge. 900-1200px still inherited legacy flex/min-width locks that could
 *    make Search overlap Settings while the permanent rail was visible.
 *  - v0.12.0 deliberately expanded the local page size to every hydrated
 *    record so removing the old custom pager could not strand results. Now that
 *    Etsy's native pager is left structurally untouched, restore the intended
 *    20 results per local page and derive the local page from Etsy's page URL.
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

/* Bypass the v0.12.0 "show every hydrated record" compatibility wrapper and
 * call the original renderer directly with Etsy's normal 20-item page size.
 * Local filter interactions can still reset favState.localPage to 1 because the
 * URL-derived page is only re-read when Etsy's route actually changes. */
favRenderCurrent = function favRenderCurrent0129() {
    favSyncLocalPageFromRoute0129();
    favState.pageSize = FAV_LOCAL_PAGE_SIZE0129;
    return favRenderCurrentBefore0122();
};

/* Keep Etsy's pager DOM completely native. BetterSearch only suppresses the
 * whole native control when the current filtered result set fits on one local
 * page; it never creates, moves, clones, or rewrites pager children. */
favRenderPagination = function favRenderPagination0129(totalPages) {
    document.body?.classList.toggle('ebsf-local-single-page0129', Number(totalPages) <= 1);
};

var favRestorePaginationBefore0129 = favRestorePagination0122;
favRestorePagination0122 = function favRestorePagination0129() {
    document.body?.classList.remove('ebsf-local-single-page0129');
    return favRestorePaginationBefore0129();
};

function favInlineMetaFits0129(node) {
    if (!node?.isConnected) return false;
    const previous = node.style.whiteSpace;
    node.style.whiteSpace = 'nowrap';
    const needed = node.scrollWidth;
    const ownWidth = node.getBoundingClientRect().width;
    const parentWidth = node.parentElement?.getBoundingClientRect?.().width || ownWidth;
    const available = Math.min(ownWidth || parentWidth, parentWidth || ownWidth);
    if (previous) node.style.whiteSpace = previous;
    else node.style.removeProperty('white-space');
    return available > 0 && needed <= available + 1;
}

/* Density is based on whether the complete native-style sentence actually fits,
 * not a hard-coded viewport/header threshold. */
favApplyScopeMetaDensity0126 = function favApplyScopeMetaDensity0129() {
    const header = document.querySelector('[data-ebsf-all-header]');
    if (!header?.isConnected) return;
    const meta = header.querySelector('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector('b');
    const count = meta?.querySelector('[data-ebsf-scope-count]');
    if (!meta || !privacy || !count) return;

    const { total, shown } = favScopeCounts0120();
    privacy.textContent = 'Private collection';
    count.textContent = `${total} favorites · ${shown} shown`;
    const compact = !favInlineMetaFits0129(meta);
    header.classList.toggle('ebsf-scope-meta-compact', compact);
    if (compact) {
        privacy.textContent = 'Private';
        count.textContent = `${total} · ${shown}`;
    }
};

favApplyCollectionMetaDensity0126 = function favApplyCollectionMetaDensity0129() {
    if (favScope().type === 'items') return;
    const meta = document.querySelector('[data-test-id="collections-landing-right-side-header"],[data-testid="collections-landing-right-side-header"]');
    const strong = meta?.querySelector('b');
    if (!meta || !strong) return;

    const privacy = /private/i.test(strong.textContent || '') ? 'Private' : 'Public';
    const { total, shown } = favScopeCounts0120();
    let countNode = Array.from(meta.childNodes).find((node) => node.nodeType === 3 && /\d/.test(node.nodeValue || ''));
    if (!countNode) {
        countNode = document.createTextNode('');
        meta.append(countNode);
    }

    favSetStrongLabel0126(strong, `${privacy} collection`);
    countNode.nodeValue = `${total} favorites · ${shown} shown`;
    const compact = !favInlineMetaFits0129(meta);
    if (compact) {
        favSetStrongLabel0126(strong, privacy);
        countNode.nodeValue = `${total} · ${shown}`;
    }
};

function favRefreshFinalResponsiveState0129() {
    favSyncNarrowSortWidth0128?.();
    favApplyScopeMetaDensity0126?.();
    favApplyCollectionMetaDensity0126?.();
}

GM_addStyle(`
  /* One native pager only. Hide the complete Etsy control when the filtered
   * result set needs a single 20-item page; never alter its internal layout. */
  body.ebsf-local-single-page0129 nav[aria-label="Favorite Items Page Results"],
  body.ebsf-local-single-page0129 nav[data-clg-id="WtPagination"][aria-label*="Favorite" i]{
    display:none!important;
  }

  /* Etsy hides the permanent rail below 900px. Cover the entire matching range
   * instead of stopping final toolbar geometry at 760px. */
  @media(max-width:899px){
    [data-ebsf-collection-strip],
    .ebsf-scope-header{
      grid-column:1 / -1!important;
      justify-self:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
    }
    .ebsf-scope-controls{
      grid-column:1 / -1!important;
      justify-self:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:grid!important;
      grid-template-columns:max-content var(--ebsf-narrow-sort-width,220px) 40px minmax(0,1fr)!important;
      align-items:center!important;
      justify-content:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
      transform:none!important;
      gap:6px!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{display:contents!important}
    .ebsf-scope-header .ebsf-filter-button{
      grid-column:1!important;
      width:max-content!important;
      min-width:0!important;
      max-width:112px!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-sort{
      grid-column:2!important;
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    .ebsf-scope-header .ebsf-settings-button{
      grid-column:3!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      grid-column:4!important;
      justify-self:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
      flex:none!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot>form,
    .ebsf-scope-header .ebsf-native-search-slot>.wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot form,
    .ebsf-scope-header .ebsf-native-search-slot .wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot input{
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }

  /* Tight desktop: the sidebar is still visible. Reserve Sort and Settings
   * first, then let Search consume exactly the remaining content-column width.
   * This removes the legacy min-width collision that caused Search to overlap
   * the gear icon immediately before the rail disappears. */
  @media(min-width:900px) and (max-width:1200px){
    .ebsf-scope-header{
      grid-template-columns:minmax(0,1fr)!important;
      gap:10px!important;
      width:100%!important;
      min-width:0!important;
    }
    .ebsf-scope-controls{
      grid-column:1 / -1!important;
      justify-self:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:grid!important;
      grid-template-columns:var(--ebsf-narrow-sort-width,220px) 40px minmax(0,1fr)!important;
      align-items:center!important;
      justify-content:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin:0!important;
      transform:none!important;
      gap:6px!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{display:contents!important}
    .ebsf-scope-header .ebsf-filter-button[aria-hidden="true"]{display:none!important}
    .ebsf-scope-header .ebsf-sort{
      grid-column:1!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      white-space:nowrap!important;
    }
    .ebsf-scope-header .ebsf-settings-button{
      grid-column:2!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      margin:0!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      grid-column:3!important;
      justify-self:stretch!important;
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      margin:0!important;
      flex:none!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot>form,
    .ebsf-scope-header .ebsf-native-search-slot>.wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot form,
    .ebsf-scope-header .ebsf-native-search-slot .wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot input{
      box-sizing:border-box!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }

  @media(max-width:520px){
    .ebsf-scope-controls .ebsf-toolbar-row{
      grid-template-columns:40px clamp(132px,35vw,170px) 40px minmax(0,1fr)!important;
      gap:5px!important;
    }
    .ebsf-scope-header .ebsf-filter-button{
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-scope-header .ebsf-filter-button [data-ebsf-filter-label]{display:none!important}
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshFinalResponsiveState0129), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshFinalResponsiveState0129)).catch?.(() => {});
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favRefreshFinalResponsiveState0129();
    if (favEnhancementActive()) favRenderCurrent();
});
