'use strict';

/* v0.12.6 native-boundary cleanup.
 *
 * Two root causes are fixed here rather than adding more recovery behavior:
 *  1. The custom collection selector used a <nav> in the same React-owned area
 *     as Etsy's native WtPagination <nav>. During soft reconciliation Etsy could
 *     reuse the custom node for pagination, which is why earlier layers needed
 *     increasingly invasive pager salvage/move/restore code. The selector is
 *     now a <div role="navigation">, and BetterSearch no longer touches Etsy's
 *     pagination at all.
 *  2. At narrow widths the injected header can be a direct child of an Etsy CSS
 *     grid. width:100% only filled the grid cell it was auto-placed into, not the
 *     whole results area. Explicitly span the parent grid, reserve enough width
 *     for the complete sort label, then give Search all remaining width.
 */

function favPlainPrimaryClick0128(event) {
    return event.button === 0
        && !event.metaKey
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey;
}

function favBindCollectionLink0128(link) {
    link.addEventListener('click', (event) => {
        if (!favPlainPrimaryClick0128(event)) return;
        if (link.getAttribute('aria-current') === 'page') {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (!link.href) return;
        event.preventDefault();
        event.stopPropagation();
        location.assign(link.href);
    });
}

function favBuildCollectionStrip0128() {
    const strip = document.createElement('div');
    strip.className = 'ebsf-collection-strip';
    strip.dataset.ebsfCollectionStrip = '';
    strip.setAttribute('role', 'navigation');
    strip.setAttribute('aria-label', 'Favorite collections');

    const fixed = document.createElement('div');
    fixed.className = 'ebsf-collection-fixed';
    const scope = favScope();
    const nativeAll = favNativeItemsLink0120();

    const all = document.createElement('a');
    all.className = 'ebsf-collection-pill ebsf-all-pill';
    all.href = nativeAll?.getAttribute('href')
        || `/people/${encodeURIComponent(favProfileLogin())}?tab=items&ref=phase3_fl`;
    all.innerHTML = `${nativeAll?.querySelector('.etsy-icon')?.outerHTML || ''}<span>All</span>`;
    if (scope.type === 'items') {
        all.classList.add('is-active');
        all.setAttribute('aria-current', 'page');
    }
    favBindCollectionLink0128(all);
    fixed.append(all);

    const nativeCreate = favNativeCreateButton0120();
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'ebsf-collection-add';
    add.setAttribute('aria-label', 'Create new collection');
    add.innerHTML = nativeCreate?.querySelector('.etsy-icon')?.outerHTML || '<span aria-hidden="true">+</span>';
    add.disabled = !nativeCreate;
    add.addEventListener('click', () => {
        favWatchCollectionCreation0120();
        nativeCreate?.click();
    });
    fixed.append(add);
    strip.append(fixed);

    const scroller = document.createElement('div');
    scroller.className = 'ebsf-collection-scroll';
    scroller.tabIndex = 0;
    scroller.setAttribute('aria-label', 'Collections. Drag or use arrow keys to scroll.');

    for (const collection of favCollections0120()) {
        const link = document.createElement('a');
        link.className = 'ebsf-collection-pill';
        link.href = collection.url;
        link.textContent = collection.name;
        link.dataset.collectionSlug = collection.slug;
        if (scope.type === 'collection' && scope.id === collection.slug) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'page');
        }
        favBindCollectionLink0128(link);
        scroller.append(link);
    }

    strip.append(scroller);
    favBindCollectionScroller0120(scroller);
    favApplyNativeControlTheme0120(strip);
    return strip;
}

favBuildCollectionStrip0120 = favBuildCollectionStrip0128;

function favCollectionStripIntact0128(node, signature) {
    if (!node?.matches?.('[data-ebsf-collection-strip]')) return false;
    if (node.tagName !== 'DIV') return false;
    if (node.dataset.ebsfCollectionSignature !== signature) return false;
    const fixed = node.querySelector(':scope > .ebsf-collection-fixed');
    const scroller = node.querySelector(':scope > .ebsf-collection-scroll');
    if (!fixed || !scroller) return false;
    if (!fixed.querySelector(':scope > .ebsf-all-pill')) return false;
    if (!fixed.querySelector(':scope > .ebsf-collection-add')) return false;
    return scroller.dataset.ebsfScrollerRevision === '4';
}

/* Final collection installer. It deliberately has no pagination detection,
 * salvage, movement or restoration logic. Etsy owns its pager from here on. */
favInstallCollectionStrip0120 = function favInstallCollectionStrip0128(content) {
    if (!content) return;
    const signature = favShellSignature0123();
    const nativeCreate = favNativeCreateButton0120() || null;
    const previousCreate = favState.collectionCreateSource0127 || null;
    let current = content.querySelector(':scope > [data-ebsf-collection-strip]')
        || document.querySelector('[data-ebsf-collection-strip]');

    const createChanged = previousCreate !== nativeCreate;
    if (!favCollectionStripIntact0128(current, signature) || createChanged) {
        current?.__ebsfScrollerCleanup0126?.();
        const replacement = favBuildCollectionStrip0128();
        replacement.dataset.ebsfCollectionSignature = signature;
        if (current?.isConnected) current.replaceWith(replacement);
        current = replacement;
    }

    if (current.parentElement !== content || content.firstElementChild !== current) {
        content.prepend(current);
    }
    favState.collectionCreateSource0127 = nativeCreate;
    favState.collectionStrip0120 = current;
    favApplyNativeControlTheme0120(current);
};

/* Remove the pagination compatibility stack from the live behavior. These are
 * intentionally no-ops: no custom pager, no saved pager, no moving native nav,
 * and no recovery copy of Etsy's WtPagination DOM. */
favProtectNativePagination0126 = function favProtectNativePagination0128() {};
favRestorePagination0122 = function favRestorePagination0128() {
    favState.nativePagination0120 = null;
};
favRenderPagination = function favRenderPagination0128() {};

function favMutationElement0128(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement || null;
}

function favOwnedShellNode0128(node) {
    const element = favMutationElement0128(node);
    return Boolean(element?.matches?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]')
        || element?.closest?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]'));
}

function favShellMutationRelevant0128(record) {
    const target = favMutationElement0128(record.target);
    const changed = [...Array.from(record.addedNodes || []), ...Array.from(record.removedNodes || [])]
        .map(favMutationElement0128)
        .filter(Boolean);

    if (target?.closest?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]')) {
        return false;
    }

    if (target?.closest?.('[data-testid="sidebar"]')) {
        return changed.some((node) => !favOwnedShellNode0128(node));
    }

    const structural = '[data-testid="sidebar"],.phase3-listing-cards-section,.favorites-landing-phase3-header,#collections-landing-right-side-header-container';
    return changed.some((node) => node.matches?.(structural) || node.querySelector?.(structural));
}

/* The previous final observer also reacted to pagination mutations. Replace it
 * with a shell-only observer so product/pager churn cannot trigger pager repair
 * or another full shell pass merely because Etsy updated page controls. */
favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120 = new MutationObserver((records) => {
    if (records.some(favShellMutationRelevant0128)) favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body, { childList:true, subtree:true });

function favSyncNarrowSortWidth0128() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    const row = root?.closest?.('[data-ebsf-toolbar-row]');
    if (!root || !row) return;
    favMeasureSortTrigger?.(root);
    const measured = root.style.getPropertyValue('--ebsf-sort-trigger-width').trim();
    if (measured) row.style.setProperty('--ebsf-narrow-sort-width', measured);
}

GM_addStyle(`
  @media(max-width:760px){
    /* The Favorites content wrapper can itself be an Etsy grid. Span every
     * parent column; width:100% alone only filled the auto-assigned first cell. */
    [data-ebsf-collection-strip],
    .ebsf-scope-header{
      grid-column:1 / -1!important;
      justify-self:stretch!important;
      align-self:stretch!important;
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
    .ebsf-scope-header .ebsf-search-left-controls{
      display:contents!important;
    }
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
    .ebsf-scope-header .ebsf-filter-button [data-ebsf-filter-label]{
      display:none!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favSyncNarrowSortWidth0128), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favSyncNarrowSortWidth0128)).catch?.(() => {});

/* Release the runtime only now, after the native boundary and final responsive
 * geometry are installed. All previously queued shell RAFs resolve through the
 * final bindings above rather than constructing an intermediate old shell. */
favReleaseRuntime0128();
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120();
    favSyncNarrowSortWidth0128();
});
