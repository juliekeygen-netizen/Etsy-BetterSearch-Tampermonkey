'use strict';

/* v0.12.9 exact Favorites header / responsive parity.
 *
 * This is the final UI boundary after pagination compatibility. It makes the
 * generated All header use the same structural model as Etsy's collection
 * header, makes full privacy/count wording invariant at every width, removes
 * stale measured toolbar geometry, and lets Search own the flexible remainder.
 */

/* The previous Sort trigger reserved more trailing space than the native
 * control needs. Keep the complete longest label while removing dead width. */
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

    /* Remove the direct-child icon shape created by the previous v0.12.8
     * layer. v0.12.9 keeps the single icon inside the strong privacy label,
     * matching the native collection metadata structure. */
    meta.querySelectorAll(':scope > [data-ebsf-scope-privacy-icon]').forEach((node) => node.remove());

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

/* Full All metadata is invariant. Module 90 registered callbacks against the
 * 0125 name and module 91 registered callbacks against 0126. Rebind BOTH
 * historical names so resize/font/header callbacks can never restore the old
 * compact "Private | N · M" state. */
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

/* Upgrade the generated All shell to the same structural utility classes used
 * by Etsy's real collection header rather than maintaining a separate grid. */
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

/* Older toolbar layers measured the native row and wrote inline width,
 * negative margin and flex geometry. Clear those values on every final repair
 * so the row always responds to its current parent width. */
function favClearFinalToolbarGeometry0131() {
    favClearLegacyToolbarGeometry0126?.();

    const row = document.querySelector('[data-ebsf-toolbar-row]');
    const controls = row?.querySelector(':scope > [data-ebsf-search-left-controls]');
    const sort = controls?.querySelector('[data-ebsf-sort]');
    const settings = controls?.querySelector('[data-ebsf-settings]');
    const filter = controls?.querySelector('.ebsf-filter-button');
    const searchSlot = row?.querySelector(':scope > .ebsf-native-search-slot');
    const properties = ['width','max-width','min-width','margin-left','margin-right','transform','flex','flex-basis'];

    row?.classList.remove('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact');
    for (const property of properties) row?.style.removeProperty(property);
    for (const node of [controls, sort, settings, filter, searchSlot]) {
        for (const property of properties) node?.style.removeProperty(property);
    }
    for (const node of searchSlot?.querySelectorAll?.('form,.wt-input-btn-group,input') || []) {
        for (const property of properties) node.style.removeProperty(property);
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
  /* The main Favorites branch must be able to shrink beside the permanent
   * rail. Otherwise a long toolbar can enlarge the content column and push the
   * Search field outside the right page margin. */
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

  /* All uses the collection header anatomy and lets Etsy's native title class
   * own typography. */
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

  /* Real collection header: title stays native on the left and the toolbar is
   * the flexible region on the right. */
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
   * remaining width, so it grows and shrinks continuously with the viewport. */
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
  .ebsf-toolbar-row .ebsf-filter-button[aria-hidden="true"],
  .ebsf-toolbar-row .ebsf-filter-button[hidden]{
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

  /* Etsy stacks the collection header below its large breakpoint. All follows
   * the same title/meta/toolbar arrangement. */
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

  /* The permanent filter rail begins at 761px. At 760px and below the mobile
   * Filters opener participates in the toolbar; above it the rail is permanent. */
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
    .ebsf-toolbar-row .ebsf-filter-button:not([aria-hidden="true"]):not([hidden]){
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
    .ebsf-toolbar-row .ebsf-filter-button:not([aria-hidden="true"]):not([hidden]){
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

/* Module 85a defers runtime startup until the true final UI boundary is ready.
 * Module 94's release request therefore remains pending through pagination and
 * is fulfilled only after this exact-parity layer has installed. */
requestAnimationFrame(() => {
    if (isFavoritesPage()) favRefreshFinalResponsiveState0131();
    favMarkFinalRuntimeReady0130?.();
});
