'use strict';

/* v0.12.9 final Favorites header / responsive correction.
 *
 * This is the final shell boundary. Keep paging owned by Etsy, make the All
 * header structurally match Etsy's collection header, permanently disable the
 * obsolete compact metadata writers, and make Search consume the remaining
 * width without allowing legacy toolbar geometry to escape the content column.
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

/* Keep the v0.12.7 20-result local page. */
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

/* The previous trigger added 54px after the longest label. The real trigger
 * needs materially less trailing allowance: enough for its padding + chevron,
 * but not the large empty block visible in the screenshots. */
favSortTriggerWidth = function favSortTriggerWidth0131(measure) {
    const labels = FAV_SORT_DEFINITIONS.flatMap((entry) => entry.reversible ? [entry.normal, entry.reversed] : [entry.normal]);
    return Math.ceil(Math.max(...labels.map((label) => measure(label)), 0) + 40);
};

function favPrivateIconMarkup0131() {
    return '<span class="wt-icon--smallest wt-nudge-b-1 etsy-icon ebsf-scope-privacy-icon" data-ebsf-scope-privacy-icon aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3h.75A1.75 1.75 0 0 1 19 11.75v8.5A1.75 1.75 0 0 1 17.25 22H6.75A1.75 1.75 0 0 1 5 20.25v-8.5A1.75 1.75 0 0 1 6.75 10zm2 0h5V7a2.5 2.5 0 0 0-5 0z"></path></svg></span>';
}

function favNormalizeAllHeader0131(header) {
    if (!header?.isConnected) return header;

    header.classList.remove('ebsf-scope-meta-compact');
    header.classList.add(
        'wt-display-flex-xs',
        'wt-justify-content-space-between',
        'wt-flex-direction-row-lg',
        'wt-flex-direction-column-xs'
    );

    const copy = header.querySelector('.ebsf-scope-copy');
    const title = copy?.querySelector(':scope > h2, :scope > [data-ebsf-all-title-row] h2');
    const meta = copy?.querySelector('[data-ebsf-scope-meta]');
    const controls = header.querySelector('.ebsf-scope-controls');
    if (!copy || !title || !meta || !controls) return header;

    copy.classList.add('wt-display-flex-xs', 'wt-flex-direction-column-xs', 'wt-flex-gap-xs-1');

    let titleRow = copy.querySelector(':scope > [data-ebsf-all-title-row]');
    if (!titleRow) {
        titleRow = document.createElement('div');
        titleRow.dataset.ebsfAllTitleRow = '';
        titleRow.className = 'wt-display-flex-xs wt-align-items-center wt-flex-gap-xs-2';
        copy.insertBefore(titleRow, title);
        titleRow.append(title);
    }
    title.classList.add('wt-text-title-large');

    let metaRow = copy.querySelector(':scope > [data-ebsf-all-meta-row]');
    if (!metaRow) {
        metaRow = document.createElement('div');
        metaRow.dataset.ebsfAllMetaRow = '';
        metaRow.className = 'wt-display-flex-xs';
        copy.insertBefore(metaRow, meta);
        metaRow.append(meta);
    }

    controls.classList.add(
        'wt-display-flex-md',
        'wt-flex-grow-xs-1',
        'wt-align-items-center',
        'wt-width-full',
        'wt-align-self-flex-end'
    );

    return header;
}

function favSetPrivateLabel0131(strong) {
    if (!strong) return;
    let icon = strong.querySelector('[data-ebsf-scope-privacy-icon]');
    if (!icon) {
        const holder = document.createElement('span');
        holder.innerHTML = favPrivateIconMarkup0131();
        icon = holder.firstElementChild;
        strong.prepend(icon);
    }
    for (const node of Array.from(strong.childNodes)) {
        if (node !== icon) node.remove();
    }
    strong.append(document.createTextNode(' Private collection'));
}

/* Full metadata is now invariant. There is no compact state at any width.
 * IMPORTANT: module 90 registered callbacks against the 0125 function name,
 * while module 91 registered callbacks against 0126. Rebind BOTH names so an
 * older resize/font/header callback cannot restore "Private | 62 · 62". */
function favApplyScopeMetaDensity0131() {
    const header = favNormalizeAllHeader0131(document.querySelector('[data-ebsf-all-header]'));
    if (!header?.isConnected) return;
    header.classList.remove('ebsf-scope-meta-compact');

    const meta = header.querySelector('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector('b');
    const count = meta?.querySelector('[data-ebsf-scope-count]');
    if (!meta || !privacy || !count) return;

    const { total, shown } = favScopeCounts0120();
    favSetPrivateLabel0131(privacy);
    count.textContent = `${total} favorites · ${shown} shown`;
}

favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0131;
favApplyScopeMetaDensity0126 = favApplyScopeMetaDensity0131;

favApplyCollectionMetaDensity0126 = function favApplyCollectionMetaDensity0131() {
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
};

/* Upgrade All's generated shell to use the same native structure/classes as
 * Etsy's real collection header instead of a separate custom grid. */
var favEnsureAllHeaderBefore0131 = favEnsureAllHeader0120;
favEnsureAllHeader0120 = function favEnsureAllHeader0131(content) {
    const header = favEnsureAllHeaderBefore0131(content);
    if (header) {
        favNormalizeAllHeader0131(header);
        favApplyScopeMetaDensity0131();
    }
    return header;
};

function favMarkContentColumn0131() {
    const content = favFavoritesContentColumn0120?.();
    if (!content) return;
    content.classList.add('ebsf-content-column0131');
}

/* Old toolbar modules measured the native search row and wrote !important
 * width/margin-left/flex values inline. The supplied page capture still shows
 * examples such as width:850px and margin-left:-401px. Strip every obsolete
 * geometry value before final CSS is applied so the row can actually respond
 * to its current parent width. */
function favClearFinalToolbarGeometry0131() {
    favClearLegacyToolbarGeometry0126?.();

    const row = document.querySelector('[data-ebsf-toolbar-row]');
    const controls = row?.querySelector(':scope > [data-ebsf-search-left-controls]');
    const sort = controls?.querySelector('[data-ebsf-sort]');
    const settings = controls?.querySelector('[data-ebsf-settings]');
    const filter = controls?.querySelector('.ebsf-filter-button');
    const searchSlot = row?.querySelector(':scope > .ebsf-native-search-slot');

    row?.classList.remove('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact');
    for (const property of ['width','max-width','min-width','margin-left','margin-right','transform','flex','flex-basis']) {
        row?.style.removeProperty(property);
    }
    for (const node of [controls, sort, settings, filter, searchSlot]) {
        for (const property of ['width','max-width','min-width','margin-left','margin-right','transform','flex','flex-basis']) {
            node?.style.removeProperty(property);
        }
    }
    for (const node of searchSlot?.querySelectorAll?.('form,.wt-input-btn-group,input') || []) {
        for (const property of ['width','max-width','min-width','margin-left','margin-right','transform','flex','flex-basis']) {
            node.style.removeProperty(property);
        }
    }
}

var favRepairToolbarLayoutBefore0131 = favRepairToolbarLayout;
favRepairToolbarLayout = function favRepairToolbarLayout0131() {
    const result = favRepairToolbarLayoutBefore0131();
    favClearFinalToolbarGeometry0131();
    return result;
};

function favRefreshFinalResponsiveState0131() {
    favMarkContentColumn0131();
    favClearFinalToolbarGeometry0131();
    favSyncNarrowSortWidth0128?.();
    favNormalizeAllHeader0131(document.querySelector('[data-ebsf-all-header]'));
    favApplyScopeMetaDensity0131();
    favApplyCollectionMetaDensity0126?.();
}

GM_addStyle(`
  body.ebsf-local-single-page0129 nav[aria-label="Favorite Items Page Results"],
  body.ebsf-local-single-page0129 nav[data-clg-id="WtPagination"][aria-label*="Favorite" i]{
    display:none!important;
  }

  /* The main Favorites content is allowed to shrink next to the permanent
   * 761px+ filter rail. Without min-width:0 a long toolbar can enlarge the
   * content branch and physically move Search beyond the right margin. */
  .ebsf-content-column0131,
  .ebsf-content-column0131 .phase3-listing-cards-section{
    box-sizing:border-box!important;
    flex:1 1 0%!important;
    width:auto!important;
    max-width:100%!important;
    min-width:0!important;
  }

  [data-ebsf-collection-strip],
  #collections-landing-phase-3-header-container,
  .ebsf-scope-header,
  #collections-landing-right-side-header-container,
  #collections-landing-right-side-header-container>div,
  .ebsf-scope-controls,
  .ebsf-toolbar-row,
  .ebsf-native-search-slot,
  .ebsf-native-search-slot>form,
  .ebsf-native-search-slot>.wt-input-btn-group,
  .ebsf-native-search-slot form,
  .ebsf-native-search-slot .wt-input-btn-group,
  .ebsf-native-search-slot input{
    box-sizing:border-box!important;
    min-width:0!important;
  }

  /* All now uses the same collection header anatomy instead of the previous
   * custom two-row grid. Etsy's native title class supplies the typography. */
  .ebsf-scope-header{
    display:flex!important;
    justify-content:space-between!important;
    flex-direction:row!important;
    align-items:center!important;
    gap:16px!important;
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
  }
  .ebsf-scope-header .ebsf-scope-copy{
    display:flex!important;
    flex-direction:column!important;
    flex:0 0 auto!important;
    gap:4px!important;
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
  }
  .ebsf-scope-header [data-ebsf-all-title-row]{
    display:flex!important;
    align-items:center!important;
    gap:8px!important;
  }
  .ebsf-scope-header .ebsf-scope-copy h2{
    margin:0!important;
    white-space:nowrap!important;
  }
  .ebsf-scope-header [data-ebsf-all-meta-row]{
    display:flex!important;
  }
  .ebsf-scope-header [data-ebsf-scope-meta]{
    display:flex!important;
    align-items:center!important;
    gap:0!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    white-space:nowrap!important;
    overflow:visible!important;
    text-overflow:clip!important;
  }
  .ebsf-scope-header [data-ebsf-scope-meta] b{
    display:inline-flex!important;
    align-items:center!important;
    white-space:nowrap!important;
  }
  .ebsf-scope-privacy-icon,
  [data-test-id="collections-landing-right-side-header"] b>.etsy-icon,
  [data-testid="collections-landing-right-side-header"] b>.etsy-icon{
    display:inline-flex!important;
    align-items:center!important;
    position:relative!important;
    top:-1px!important;
    margin-right:3px!important;
    vertical-align:middle!important;
  }
  .ebsf-scope-privacy-icon svg{
    width:12px!important;
    height:12px!important;
  }

  /* Real collection header: the left native title remains native, while the
   * right toolbar is the flexible region. This removes the historic 380px
   * Search cap and prevents the header from growing wider than its container. */
  #collections-landing-phase-3-header-container{
    box-sizing:border-box!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
  }
  #collections-landing-left-side-header-container{
    flex:0 0 auto!important;
    min-width:0!important;
  }
  #collections-landing-right-side-header-container{
    box-sizing:border-box!important;
    flex:1 1 0%!important;
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
  }
  #collections-landing-right-side-header-container>div{
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
  }

  .ebsf-scope-controls{
    flex:1 1 0%!important;
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
    margin:0!important;
  }

  /* Sort and Settings reserve only what they need. Search alone absorbs all
   * remaining width and therefore grows/shrinks continuously with the window. */
  .ebsf-toolbar-row{
    display:grid!important;
    grid-template-columns:var(--ebsf-narrow-sort-width,196px) 40px minmax(0,1fr)!important;
    align-items:center!important;
    justify-content:stretch!important;
    gap:6px!important;
    box-sizing:border-box!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    margin:0!important;
    transform:none!important;
    overflow:visible!important;
  }
  .ebsf-toolbar-row .ebsf-search-left-controls{
    display:contents!important;
  }
  .ebsf-toolbar-row .ebsf-filter-button[aria-hidden="true"]{
    display:none!important;
  }
  .ebsf-toolbar-row .ebsf-sort{
    grid-column:1!important;
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    margin:0!important;
  }
  .ebsf-toolbar-row .ebsf-sort>button{
    box-sizing:border-box!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    padding-inline:10px!important;
    white-space:nowrap!important;
    overflow:hidden!important;
  }
  .ebsf-toolbar-row .ebsf-sort [data-ebsf-sort-label]{
    min-width:0!important;
    white-space:nowrap!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
  }
  .ebsf-toolbar-row .ebsf-settings-button{
    grid-column:2!important;
    box-sizing:border-box!important;
    width:40px!important;
    min-width:40px!important;
    max-width:40px!important;
    margin:0!important;
  }
  .ebsf-toolbar-row .ebsf-native-search-slot{
    grid-column:3!important;
    justify-self:stretch!important;
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    margin:0!important;
    flex:none!important;
  }
  .ebsf-toolbar-row .ebsf-native-search-slot>form,
  .ebsf-toolbar-row .ebsf-native-search-slot>.wt-input-btn-group,
  .ebsf-toolbar-row .ebsf-native-search-slot form,
  .ebsf-toolbar-row .ebsf-native-search-slot .wt-input-btn-group,
  .ebsf-toolbar-row .ebsf-native-search-slot input{
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
  }

  /* Etsy switches the collection header from row to column below its large
   * breakpoint. Mirror that exact geometry for All, and make the real
   * collection toolbar consume the full row beneath title/meta as well. */
  @media(max-width:899px){
    .ebsf-scope-header{
      flex-direction:column!important;
      align-items:stretch!important;
      gap:10px!important;
    }
    .ebsf-scope-header .ebsf-scope-copy,
    .ebsf-scope-controls,
    #collections-landing-right-side-header-container,
    #collections-landing-right-side-header-container>div{
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    #collections-landing-right-side-header-container{
      flex:0 1 auto!important;
      margin-left:0!important;
    }
  }

  /* The permanent rail actually starts at 761px. Only widths at/below 760 use
   * the mobile/tablet Filters opener. The previous 899px rule incorrectly
   * treated rail-visible intermediate widths as mobile. */
  @media(max-width:760px){
    [data-ebsf-collection-strip],
    .ebsf-scope-header,
    #collections-landing-phase-3-header-container{
      box-sizing:border-box!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    .ebsf-toolbar-row{
      grid-template-columns:max-content var(--ebsf-narrow-sort-width,196px) 40px minmax(0,1fr)!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button{
      display:inline-flex!important;
      grid-column:1!important;
      width:max-content!important;
      min-width:0!important;
      max-width:112px!important;
      margin:0!important;
    }
    .ebsf-toolbar-row .ebsf-sort{grid-column:2!important}
    .ebsf-toolbar-row .ebsf-settings-button{grid-column:3!important}
    .ebsf-toolbar-row .ebsf-native-search-slot{grid-column:4!important}
  }

  @media(max-width:520px){
    .ebsf-toolbar-row{
      grid-template-columns:40px clamp(156px,31vw,190px) 40px minmax(0,1fr)!important;
      gap:5px!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button{
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button [data-ebsf-filter-label]{
      display:none!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshFinalResponsiveState0131), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshFinalResponsiveState0131)).catch?.(() => {});

requestAnimationFrame(() => {
    if (!isFavoritesPage()) {
        favMarkFinalRuntimeReady0130?.();
        return;
    }
    favRefreshFinalResponsiveState0131();
    favMarkFinalRuntimeReady0130?.();
});
