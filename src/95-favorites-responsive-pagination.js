'use strict';

/* v0.12.8 final Favorites header/layout correction.
 *
 * The collection-page header is the canonical layout now. All mirrors it:
 * title + toolbar on the first row, full privacy/count metadata on the second.
 * Metadata is never abbreviated. Sort keeps its measured natural width while
 * Search owns the flexible remainder, on both All and real collection pages.
 *
 * The 20-item local page size and Etsy-owned native pager behavior from v0.12.7
 * are preserved unchanged.
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

/* Etsy owns the pager DOM. BetterSearch only hides the whole native control
 * when the current enhanced result set fits on one 20-item page. */
favRenderPagination = function favRenderPagination0129(totalPages) {
    document.body?.classList.toggle('ebsf-local-single-page0129', Number(totalPages) <= 1);
};

var favRestorePaginationBefore0129 = favRestorePagination0122;
favRestorePagination0122 = function favRestorePagination0129() {
    document.body?.classList.remove('ebsf-local-single-page0129');
    return favRestorePaginationBefore0129();
};

function favEnsureAllPrivacyIcon0130(header = document.querySelector('[data-ebsf-all-header]')) {
    const meta = header?.querySelector?.('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector?.('b');
    if (!meta || !privacy) return null;
    let icon = meta.querySelector(':scope > [data-ebsf-scope-privacy-icon]');
    if (!icon) {
        icon = document.createElement('span');
        icon.className = 'ebsf-scope-privacy-icon etsy-icon';
        icon.dataset.ebsfScopePrivacyIcon = '';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3h.75A1.75 1.75 0 0 1 19 11.75v8.5A1.75 1.75 0 0 1 17.25 22H6.75A1.75 1.75 0 0 1 5 20.25v-8.5A1.75 1.75 0 0 1 6.75 10zm2 0h5V7a2.5 2.5 0 0 0-5 0z"></path></svg>';
        meta.insertBefore(icon, privacy);
    }
    return icon;
}

/* The user-facing wording is intentionally stable at every width. Older
 * ResizeObservers may still call this binding, but it can no longer oscillate
 * between long and compact text. */
favApplyScopeMetaDensity0126 = function favApplyScopeMetaDensity0130() {
    const header = document.querySelector('[data-ebsf-all-header]');
    if (!header?.isConnected) return;
    const meta = header.querySelector('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector('b');
    const count = meta?.querySelector('[data-ebsf-scope-count]');
    if (!meta || !privacy || !count) return;

    const { total, shown } = favScopeCounts0120();
    header.classList.remove('ebsf-scope-meta-compact');
    favEnsureAllPrivacyIcon0130(header);
    privacy.textContent = 'Private collection';
    count.textContent = `${total} favorites · ${shown} shown`;
};

favApplyCollectionMetaDensity0126 = function favApplyCollectionMetaDensity0130() {
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

function favMarkCollectionToolbarHost0130() {
    const row = document.querySelector('[data-ebsf-toolbar-row]');
    if (!row) return;
    document.querySelectorAll('.ebsf-collection-toolbar-host0130').forEach((node) => {
        if (node !== row.parentElement) node.classList.remove('ebsf-collection-toolbar-host0130');
    });
    if (favScope().type === 'items') {
        row.parentElement?.classList?.remove('ebsf-collection-toolbar-host0130');
        return;
    }
    row.parentElement?.classList?.add('ebsf-collection-toolbar-host0130');
}

function favRefreshFinalResponsiveState0130() {
    favSyncNarrowSortWidth0128?.();
    favMarkCollectionToolbarHost0130();
    favApplyScopeMetaDensity0126?.();
    favApplyCollectionMetaDensity0126?.();
}

var favEnsureToolbarBefore0130 = favEnsureToolbar;
favEnsureToolbar = function favEnsureToolbar0130() {
    const result = favEnsureToolbarBefore0130();
    requestAnimationFrame(favRefreshFinalResponsiveState0130);
    return result;
};

GM_addStyle(`
  /* One native pager only. Never touch its children or geometry. */
  body.ebsf-local-single-page0129 nav[aria-label="Favorite Items Page Results"],
  body.ebsf-local-single-page0129 nav[data-clg-id="WtPagination"][aria-label*="Favorite" i]{
    display:none!important;
  }

  /* Full metadata is permanent. Keep the native-style row together and align
   * its privacy icon with the text baseline. */
  [data-ebsf-scope-meta],
  [data-test-id="collections-landing-right-side-header"],
  [data-testid="collections-landing-right-side-header"]{
    white-space:nowrap!important;
  }
  [data-ebsf-scope-meta]{
    display:flex!important;
    align-items:center!important;
    gap:0!important;
  }
  .ebsf-scope-privacy-icon,
  [data-test-id="collection-privacy-icon"],
  [data-testid="collection-privacy-icon"],
  [data-test-id="collections-landing-right-side-header"] .etsy-icon,
  [data-testid="collections-landing-right-side-header"] .etsy-icon{
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    vertical-align:middle!important;
    transform:translateY(-1px)!important;
  }
  .ebsf-scope-privacy-icon{
    width:14px!important;
    height:14px!important;
    flex:0 0 14px!important;
    margin-right:4px!important;
  }
  .ebsf-scope-privacy-icon svg{display:block!important;width:14px!important;height:14px!important;fill:currentColor!important}

  /* All now mirrors the real collection header: title on the left, toolbar on
   * the right, and the privacy/count line directly underneath. */
  .ebsf-scope-header{
    display:grid!important;
    grid-template-columns:max-content minmax(0,1fr)!important;
    grid-template-areas:
      "title controls"
      "meta meta"!important;
    column-gap:18px!important;
    row-gap:5px!important;
    align-items:center!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    margin:0 0 14px!important;
  }
  .ebsf-scope-header .ebsf-scope-copy{display:contents!important}
  .ebsf-scope-header .ebsf-scope-copy h2{
    grid-area:title!important;
    align-self:center!important;
    margin:0!important;
    font-size:16px!important;
    line-height:22px!important;
    font-weight:600!important;
  }
  .ebsf-scope-header [data-ebsf-scope-meta]{
    grid-area:meta!important;
    margin:0!important;
    min-height:20px!important;
    line-height:20px!important;
  }
  .ebsf-scope-header .ebsf-scope-controls{
    grid-area:controls!important;
    justify-self:stretch!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    margin:0!important;
  }

  /* Collection pages already have the preferred native title/edit/+ layout.
   * Let their toolbar host consume the unused right-side header space instead
   * of retaining the old 380px search cap. */
  .ebsf-collection-toolbar-host0130{
    flex:1 1 0%!important;
    width:auto!important;
    max-width:none!important;
    min-width:0!important;
    margin-left:auto!important;
  }

  /* One toolbar model for All and collections. Sort has one measured natural
   * width, Settings stays fixed, and Search alone absorbs viewport changes. */
  [data-ebsf-toolbar-row]{
    display:grid!important;
    grid-template-columns:var(--ebsf-narrow-sort-width,210px) 40px minmax(0,1fr)!important;
    align-items:center!important;
    justify-content:stretch!important;
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    margin:0!important;
    margin-left:0!important;
    transform:none!important;
    gap:6px!important;
  }
  [data-ebsf-toolbar-row]>.ebsf-search-left-controls{display:contents!important}
  [data-ebsf-toolbar-row] .ebsf-filter-button[aria-hidden="true"],
  [data-ebsf-toolbar-row] .ebsf-filter-button[hidden]{display:none!important}
  [data-ebsf-toolbar-row] .ebsf-sort{
    grid-column:1!important;
    box-sizing:border-box!important;
    width:var(--ebsf-narrow-sort-width,210px)!important;
    min-width:var(--ebsf-narrow-sort-width,210px)!important;
    max-width:var(--ebsf-narrow-sort-width,210px)!important;
    margin:0!important;
  }
  [data-ebsf-toolbar-row] .ebsf-sort>button{
    box-sizing:border-box!important;
    width:100%!important;
    min-width:100%!important;
    max-width:100%!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
    white-space:nowrap!important;
  }
  [data-ebsf-toolbar-row] .ebsf-settings-button{
    grid-column:2!important;
    width:40px!important;
    min-width:40px!important;
    max-width:40px!important;
    margin:0!important;
  }
  [data-ebsf-toolbar-row] .ebsf-native-search-slot{
    grid-column:3!important;
    justify-self:stretch!important;
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
    flex:none!important;
    margin:0!important;
  }
  [data-ebsf-toolbar-row] .ebsf-native-search-slot>form,
  [data-ebsf-toolbar-row] .ebsf-native-search-slot>.wt-input-btn-group,
  [data-ebsf-toolbar-row] .ebsf-native-search-slot form,
  [data-ebsf-toolbar-row] .ebsf-native-search-slot .wt-input-btn-group,
  [data-ebsf-toolbar-row] .ebsf-native-search-slot input{
    box-sizing:border-box!important;
    width:100%!important;
    max-width:none!important;
    min-width:0!important;
  }

  /* Sidebar-hidden/tablet/mobile layout: keep title, full metadata, and toolbar
   * as three deliberate rows. The toolbar still fills edge-to-edge. */
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
    .ebsf-scope-header{
      grid-template-columns:minmax(0,1fr)!important;
      grid-template-areas:
        "title"
        "meta"
        "controls"!important;
      row-gap:6px!important;
    }
    .ebsf-scope-header .ebsf-scope-controls{
      grid-column:1 / -1!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
    }
    [data-ebsf-toolbar-row]{
      grid-template-columns:max-content var(--ebsf-narrow-sort-width,210px) 40px minmax(0,1fr)!important;
    }
    [data-ebsf-toolbar-row] .ebsf-filter-button:not([aria-hidden="true"]):not([hidden]){
      display:inline-flex!important;
      grid-column:1!important;
      width:max-content!important;
      min-width:0!important;
      max-width:112px!important;
      margin:0!important;
    }
    [data-ebsf-toolbar-row] .ebsf-sort{
      grid-column:2!important;
      width:var(--ebsf-narrow-sort-width,210px)!important;
      min-width:var(--ebsf-narrow-sort-width,210px)!important;
      max-width:var(--ebsf-narrow-sort-width,210px)!important;
    }
    [data-ebsf-toolbar-row] .ebsf-settings-button{grid-column:3!important}
    [data-ebsf-toolbar-row] .ebsf-native-search-slot{grid-column:4!important}
    .ebsf-collection-toolbar-host0130{
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      margin-left:0!important;
    }
  }

  /* Only truly phone-sized widths compress Sort. Filters becomes icon-only and
   * Search still receives every remaining pixel. */
  @media(max-width:520px){
    [data-ebsf-toolbar-row]{
      grid-template-columns:40px clamp(132px,40vw,var(--ebsf-narrow-sort-width,210px)) 40px minmax(72px,1fr)!important;
      gap:5px!important;
    }
    [data-ebsf-toolbar-row] .ebsf-filter-button:not([aria-hidden="true"]):not([hidden]){
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    [data-ebsf-toolbar-row] .ebsf-filter-button [data-ebsf-filter-label]{display:none!important}
    [data-ebsf-toolbar-row] .ebsf-sort{
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshFinalResponsiveState0130), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshFinalResponsiveState0130)).catch?.(() => {});

/* v0.12.8 is the real end of the Favorites override chain. Module 85a gates
 * the release, so module 94's earlier release request stays pending until here. */
favMarkFinalRuntimeReady0130?.();
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120?.();
    favRefreshFinalResponsiveState0130();
    if (favEnhancementActive()) favRenderCurrent();
});
