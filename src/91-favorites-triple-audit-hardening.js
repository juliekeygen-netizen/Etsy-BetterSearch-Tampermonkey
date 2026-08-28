'use strict';

/* v0.12.4 triple-audit Favorites hardening.
 *
 * This final layer resolves conflicts between the recovered v0.12 shell and its
 * later responsive wrappers instead of adding another competing layout model.
 * It owns the collection-strip install/bind lifecycle, protects Etsy's native
 * pager from React index reuse, clears stale legacy toolbar geometry, and makes
 * category availability obey the v2 editor plus the selected availability mode.
 */

var FAV_DESKTOP_SHELL_MIN_WIDTH0126 = 761;
favDesktopShell0120 = function favDesktopShell0126() {
    return innerWidth >= FAV_DESKTOP_SHELL_MIN_WIDTH0126;
};
favState.shellDesktop0120 = favDesktopShell0120();

function favRouteIdentity0126() {
    try {
        const url = new URL(location.href);
        return `${url.pathname}|${url.searchParams.get('tab') || ''}|${url.searchParams.get('page') || ''}|${url.searchParams.get('collectionId') || ''}|${favScope().type}|${favScope().id}`;
    } catch (_) {
        return location.href;
    }
}

function favHasPaginationPayload0126(node) {
    return Boolean(node?.querySelector?.('.wt-action-group__item-container,[data-clg-id="WtPagination"]'));
}

function favNativePaginationNodes0126() {
    return Array.from(document.querySelectorAll(
        'nav[aria-label="Favorite Items Page Results"],nav[data-clg-id="WtPagination"][aria-label*="Favorite" i],[data-ebsf-recovered-pagination]'
    ));
}

function favPaginationAnchor0126() {
    const section = document.querySelector('.phase3-listing-cards-section');
    const grid = favMainGrid();
    if (!section || !grid || !section.contains(grid)) return null;
    let anchor = grid;
    while (anchor.parentElement && anchor.parentElement !== section) anchor = anchor.parentElement;
    return anchor.parentElement === section ? { section, anchor, grid } : { section, anchor:grid, grid };
}

function favPlacePaginationBelowGrid0126(nav) {
    if (!nav?.isConnected) return false;
    const place = favPaginationAnchor0126();
    if (!place) return false;
    const alreadyAfter = place.grid !== nav && Boolean(place.grid.compareDocumentPosition(nav) & 4);
    const alreadyInSection = place.section.contains(nav);
    if (alreadyAfter && alreadyInSection && !nav.closest?.('[data-ebsf-collection-strip],[data-ebsf-all-header]')) return false;
    place.anchor.after(nav);
    return true;
}

function favRecoverPaginationFromCorruptStrip0126(strip) {
    if (!strip?.matches?.('nav[data-ebsf-collection-strip]') || !favHasPaginationPayload0126(strip)) return null;

    /* Etsy can reconcile its WtPagination children into our prepended nav. Keep
     * that React-backed node as the native pager instead of throwing its live
     * buttons away when rebuilding the collection selector. */
    strip.__ebsfScrollerCleanup0126?.();
    const fixed = strip.querySelector(':scope > .ebsf-collection-fixed');
    if (fixed && favHasPaginationPayload0126(fixed)) strip.replaceChildren(...Array.from(fixed.childNodes));
    else strip.querySelector(':scope > .ebsf-collection-scroll')?.remove();

    strip.classList.remove('ebsf-collection-strip', 'is-dragging');
    strip.removeAttribute('data-ebsf-collection-strip');
    strip.removeAttribute('data-ebsf-collection-signature');
    strip.removeAttribute('data-ebsf-scroller-revision');
    strip.removeAttribute('style');
    strip.setAttribute('aria-label', 'Favorite Items Page Results');
    strip.removeAttribute('data-ebsf-native-pagination');
    strip.dataset.ebsfRecoveredPagination = '';
    strip.dataset.ebsfRecoveredPaginationRoute = favRouteIdentity0126();
    strip.hidden = false;
    strip.inert = false;
    favState.recoveredPagination0126 = strip;
    favPlacePaginationBelowGrid0126(strip);
    return strip;
}

function favProtectNativePagination0126() {
    const route = favRouteIdentity0126();
    const remembered = favState.recoveredPagination0126;
    if (remembered?.isConnected && remembered.dataset.ebsfRecoveredPaginationRoute !== route) {
        remembered.remove();
        favState.recoveredPagination0126 = null;
    }

    const corrupt = document.querySelector('nav[data-ebsf-collection-strip]');
    if (corrupt && favHasPaginationPayload0126(corrupt)) favRecoverPaginationFromCorruptStrip0126(corrupt);

    for (const nav of favNativePaginationNodes0126()) {
        if (!nav?.isConnected) continue;
        nav.removeAttribute('data-ebsf-native-pagination');
        nav.hidden = false;
        nav.inert = false;
        if (nav.matches('[data-ebsf-recovered-pagination]')) {
            nav.dataset.ebsfRecoveredPaginationRoute = route;
            favState.recoveredPagination0126 = nav;
        }
        favPlacePaginationBelowGrid0126(nav);
    }
}

/* The old v0.12.2 and v0.12.3 installers required mutually exclusive scroller
 * revisions (2 and 3), so every shell pass removed and rebuilt a healthy strip.
 * This is the one final installer: a valid revision-4 strip is left untouched. */
function favBindCollectionScroller0126(scroller) {
    if (!scroller) return;
    const strip = scroller.closest?.('[data-ebsf-collection-strip]') || scroller.parentElement;
    if (!strip) return;

    strip.__ebsfScrollerCleanup0126?.();
    scroller.dataset.ebsfScrollerRevision = '4';
    strip.dataset.ebsfScrollerRevision = '4';

    let pointerId = null;
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let suppressClick = false;
    let suppressTimer = 0;
    const dragThreshold = 8;
    const listeners = [];
    const on = (node, type, handler, options) => {
        node.addEventListener(type, handler, options);
        listeners.push(() => node.removeEventListener(type, handler, options));
    };

    const clearSuppressSoon = () => {
        clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => { suppressClick = false; }, 0);
    };

    const finish = (event, lostCapture = false) => {
        if (pointerId == null || (event?.pointerId != null && pointerId !== event.pointerId)) return;
        const finishedId = pointerId;
        const wasDragging = dragging;
        if (wasDragging && !lostCapture) {
            try {
                if (strip.hasPointerCapture?.(finishedId)) strip.releasePointerCapture(finishedId);
            } catch (_) {}
        }
        pointerId = null;
        dragging = false;
        strip.classList.remove('is-dragging');
        if (wasDragging) clearSuppressSoon();
        else suppressClick = false;
    };

    strip.querySelectorAll('a,button,img').forEach((node) => {
        if ('draggable' in node) node.draggable = false;
    });

    on(strip, 'dragstart', (event) => event.preventDefault());
    on(strip, 'selectstart', (event) => event.preventDefault());
    on(strip, 'pointerdown', (event) => {
        if (event.button !== 0 || event.isPrimary === false || pointerId !== null) return;
        clearTimeout(suppressTimer);
        pointerId = event.pointerId;
        startX = event.clientX;
        startLeft = scroller.scrollLeft;
        dragging = false;
        suppressClick = false;
    });
    on(strip, 'pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        const delta = event.clientX - startX;
        if (!dragging && Math.abs(delta) >= dragThreshold) {
            dragging = true;
            suppressClick = true;
            try { strip.setPointerCapture?.(pointerId); } catch (_) {}
            strip.classList.add('is-dragging');
        }
        if (!dragging) return;
        scroller.scrollLeft = startLeft - delta;
        event.preventDefault();
    });
    on(strip, 'pointerup', (event) => finish(event));
    on(strip, 'pointercancel', (event) => finish(event));
    on(strip, 'lostpointercapture', (event) => finish(event, true));
    on(strip, 'pointerleave', (event) => {
        if (!dragging && pointerId === event.pointerId) finish(event);
    });
    on(strip, 'click', (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
        clearTimeout(suppressTimer);
    }, true);

    on(scroller, 'wheel', (event) => {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const before = scroller.scrollLeft;
        const next = Math.max(0, Math.min(max, before + event.deltaY));
        if (Math.abs(next - before) < 0.5) return;
        scroller.scrollLeft = next;
        event.preventDefault();
    }, { passive:false });

    on(scroller, 'keydown', (event) => {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
        const step = Math.max(100, scroller.clientWidth * .35);
        if (event.key === 'ArrowLeft') {
            scroller.scrollBy({ left:-step, behavior:'smooth' });
            event.preventDefault();
        } else if (event.key === 'ArrowRight') {
            scroller.scrollBy({ left:step, behavior:'smooth' });
            event.preventDefault();
        } else if (event.key === 'Home') {
            scroller.scrollTo({ left:0, behavior:'smooth' });
            event.preventDefault();
        } else if (event.key === 'End') {
            scroller.scrollTo({ left:scroller.scrollWidth, behavior:'smooth' });
            event.preventDefault();
        }
    });

    strip.__ebsfScrollerCleanup0126 = () => {
        clearTimeout(suppressTimer);
        listeners.splice(0).forEach((remove) => remove());
        strip.classList.remove('is-dragging');
        pointerId = null;
        dragging = false;
        suppressClick = false;
        delete strip.__ebsfScrollerCleanup0126;
    };
}

favBindCollectionScroller0120 = favBindCollectionScroller0126;

favInstallCollectionStrip0120 = function favInstallCollectionStrip0126(content) {
    if (!content) return;
    const signature = favShellSignature0123();
    let current = content.querySelector(':scope > nav[data-ebsf-collection-strip]')
        || document.querySelector('nav[data-ebsf-collection-strip]');

    if (current && favHasPaginationPayload0126(current)) {
        favRecoverPaginationFromCorruptStrip0126(current);
        current = null;
    }

    const scroller = current?.querySelector?.(':scope > .ebsf-collection-scroll');
    const valid = favCollectionStripIntact0123(current, signature)
        && scroller?.dataset.ebsfScrollerRevision === '4';
    if (!valid) {
        current?.__ebsfScrollerCleanup0126?.();
        const replacement = favBuildCollectionStrip0120();
        replacement.dataset.ebsfCollectionSignature = signature;
        if (current?.isConnected) current.replaceWith(replacement);
        current = replacement;
    }

    if (current.parentElement !== content || content.firstElementChild !== current) content.prepend(current);
    favState.collectionStrip0120 = current;
};

/* Never let the legacy pagination compatibility cleanup delete a genuine Etsy
 * pager or a pager salvaged from the React/collection-strip collision. */
var favRestorePaginationBefore0126 = favRestorePagination0122;
favRestorePagination0122 = function favRestorePagination0126() {
    const saved = favState.nativePagination0120;
    if (saved?.nav && favHasPaginationPayload0126(saved.nav)) saved.generated = false;
    for (const nav of favNativePaginationNodes0126()) nav.removeAttribute('data-ebsf-native-pagination');
    const result = favRestorePaginationBefore0126();
    favProtectNativePagination0126();
    return result;
};
favRenderPagination = function favRenderPagination0126() {
    favProtectNativePagination0126();
};

function favClearLegacyToolbarGeometry0126() {
    const anchor = favSearchAnchor();
    const row = anchor?.searchSlot?.closest?.('[data-ebsf-toolbar-row]');
    if (!row || !anchor?.searchSlot) return;
    const controls = row.querySelector(':scope > [data-ebsf-search-left-controls]');
    const filter = controls?.querySelector('.ebsf-filter-button');

    row.classList.remove('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact');
    for (const property of ['width','max-width','margin-left','transform','flex']) row.style.removeProperty(property);
    for (const property of ['flex','width','max-width','min-width']) anchor.searchSlot.style.removeProperty(property);
    if (filter) {
        for (const property of ['width','min-width','max-width','flex']) filter.style.removeProperty(property);
        if (typeof favFilterWidthCache010 !== 'undefined') favFilterWidthCache010.delete(filter);
    }
    if (typeof favToolbarGeometrySnapshots010 !== 'undefined') favToolbarGeometrySnapshots010.delete(row);
}

var favRepairToolbarLayoutBefore0126 = favRepairToolbarLayout;
favRepairToolbarLayout = function favRepairToolbarLayout0126() {
    const result = favRepairToolbarLayoutBefore0126();
    favClearLegacyToolbarGeometry0126();
    return result;
};

var favPolishFilterButtonBefore0126 = favPolishFilterButton;
favPolishFilterButton = function favPolishFilterButton0126() {
    const result = favPolishFilterButtonBefore0126();
    favClearLegacyToolbarGeometry0126();
    return result;
};

function favCategoryBindingEnabled0126(bindingKey) {
    return !bindingKey.startsWith('category:') || favVisibleBindingCount0120(bindingKey) > 0;
}

var favBindingAvailableBefore0126 = favBindingAvailable0120;
favBindingAvailable0120 = function favBindingAvailable0126(bindingKey) {
    if (!bindingKey.startsWith('category:')) return favBindingAvailableBefore0126(bindingKey);
    if (!favCategoryBindingEnabled0126(bindingKey)) return false;
    if (favAvailabilityMode0110() === 'disabled' || favBindingActive0120(bindingKey)) return true;
    const records = favRecordsForBinding0120(bindingKey);
    return records.some((record) => favCategoryMatch(record?.deepMetadata?.category, bindingKey.slice(9)));
};

function favSanitizeHiddenCategory0126() {
    const active = String(favCfg.filters?.category || '');
    if (!active || favVisibleBindingCount0120(`category:${active}`) > 0) return false;
    favCfg.filters.category = '';
    favState.localPage = 1;
    favSaveConfig();
    return true;
}

var favRefreshFacetAvailabilityBefore0126 = favRefreshFacetAvailability0120;
favRefreshFacetAvailability0120 = function favRefreshFacetAvailability0126() {
    favSanitizeHiddenCategory0126();
    return favRefreshFacetAvailabilityBefore0126();
};

function favObserveScopeWidth0126() {
    const header = document.querySelector('[data-ebsf-all-header]');
    if (favState.scopeResizeTarget0126 === header) return;
    favState.scopeResizeObserver0126?.disconnect?.();
    favState.scopeResizeTarget0126 = header || null;
    if (!header || typeof ResizeObserver !== 'function') return;
    favState.scopeResizeObserver0126 = new ResizeObserver(() => {
        requestAnimationFrame(() => {
            if (header.isConnected) favApplyScopeMetaDensity0125();
        });
    });
    favState.scopeResizeObserver0126.observe(header);
}

var favInstallPageShellBefore0126 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0126() {
    favProtectNativePagination0126();
    const result = favInstallPageShellBefore0126();
    favProtectNativePagination0126();
    favClearLegacyToolbarGeometry0126();
    favApplyScopeMetaDensity0125();
    favObserveScopeWidth0126();
    return result;
};

/* The earlier observer deliberately ignored mutations inside BetterSearch-owned
 * nodes. That also ignored Etsy injecting WtPagination into the collection nav.
 * Detect that corruption before the shell repair frame can discard the pager. */
favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120 = new MutationObserver((records) => {
    let repair = false;
    for (const record of records) {
        const target = favElementFromMutationNode0124(record.target);
        const changed = [...Array.from(record.addedNodes || []), ...Array.from(record.removedNodes || [])]
            .map(favElementFromMutationNode0124)
            .filter(Boolean);

        const strip = target?.closest?.('[data-ebsf-collection-strip]');
        if ((strip && favHasPaginationPayload0126(strip))
            || changed.some((node) => favHasPaginationPayload0126(node)
                || node.matches?.('nav[aria-label="Favorite Items Page Results"],nav[data-clg-id="WtPagination"]'))) {
            favProtectNativePagination0126();
            repair = true;
            continue;
        }

        if (strip && !favCollectionStripIntact0123(strip)) {
            repair = true;
            continue;
        }
        if (target?.closest?.('[data-testid="sidebar"]')) {
            if (changed.some((node) => node.matches?.('[data-ebsf-rail]') || !favOwnedShellNode0123(node))) repair = true;
            continue;
        }
        if (favOwnedShellNode0123(target)) continue;
        if (changed.some((node) => favNativeShellNode0123(node))) repair = true;
        if (changed.some((node) => node.matches?.('[data-ebsf-rail]') && !node.isConnected)) repair = true;
    }
    if (repair) favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body, { childList:true, subtree:true });

GM_addStyle(`
  [data-ebsf-collection-strip],
  [data-ebsf-collection-strip] .ebsf-collection-scroll{
    touch-action:pan-y pinch-zoom!important;
  }
  [data-ebsf-collection-strip] .ebsf-collection-scroll{
    overscroll-behavior-inline:contain!important;
  }

  .ebsf-toolbar-row,
  .ebsf-search-left-controls,
  .ebsf-sort,
  .ebsf-sort>button,
  .ebsf-native-search-slot,
  .ebsf-native-search-slot form,
  .ebsf-native-search-slot .wt-input-btn-group,
  .ebsf-native-search-slot input{
    box-sizing:border-box!important;
    min-width:0!important;
  }
  .ebsf-native-search-slot,
  .ebsf-native-search-slot form,
  .ebsf-native-search-slot .wt-input-btn-group,
  .ebsf-native-search-slot input{
    max-width:100%!important;
  }
  .ebsf-native-search-slot input{
    width:100%!important;
  }
  .ebsf-sort>button [data-ebsf-sort-label]{
    min-width:0!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
    white-space:nowrap!important;
  }

  @media(min-width:761px){
    [data-testid="sidebar"].ebsf-sidebar-permanent{display:block!important}
    .ebsf-filter-button[aria-hidden="true"]{display:none!important}
  }

  @media(min-width:761px) and (max-width:1440px){
    .ebsf-toolbar-row .ebsf-search-left-controls{
      flex:0 1 min(220px,42%)!important;
      width:auto!important;
      max-width:42%!important;
      min-width:96px!important;
    }
    .ebsf-toolbar-row .ebsf-sort{
      flex:1 1 90px!important;
      width:auto!important;
      min-width:72px!important;
      max-width:180px!important;
    }
    .ebsf-toolbar-row .ebsf-sort>button{
      width:100%!important;
      max-width:100%!important;
      padding-inline:clamp(8px,.9vw,12px)!important;
    }
    .ebsf-toolbar-row .ebsf-settings-button{
      flex:0 0 40px!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-toolbar-row .ebsf-native-search-slot{
      flex:1 1 150px!important;
      width:auto!important;
      min-width:80px!important;
      max-width:none!important;
    }
  }

  @media(max-width:760px){
    [data-testid="sidebar"].ebsf-sidebar-permanent{display:none!important}
    .ebsf-filter-button[aria-hidden="false"]{display:inline-flex!important}
    .ebsf-scope-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr)!important;
      gap:10px!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-copy{
      display:flex!important;
      align-items:baseline!important;
      flex-wrap:nowrap!important;
      gap:9px!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    .ebsf-scope-copy h2{
      flex:0 0 auto!important;
      margin:0!important;
      white-space:nowrap!important;
    }
    .ebsf-scope-copy [data-ebsf-scope-meta]{
      display:flex!important;
      align-items:baseline!important;
      gap:5px!important;
      min-width:0!important;
      margin:0!important;
      padding-left:9px!important;
      border-left:1px solid currentColor!important;
      white-space:nowrap!important;
      overflow:hidden!important;
    }
    .ebsf-scope-copy [data-ebsf-scope-count]{
      flex:0 1 auto!important;
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    .ebsf-scope-controls{
      grid-column:1!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
      justify-self:stretch!important;
    }
    .ebsf-toolbar-row,
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:flex!important;
      align-items:center!important;
      flex-wrap:nowrap!important;
      gap:6px!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
      margin-left:0!important;
      transform:none!important;
    }
    .ebsf-toolbar-row .ebsf-search-left-controls,
    .ebsf-scope-header .ebsf-search-left-controls{
      display:flex!important;
      align-items:center!important;
      flex:0 1 min(276px,64%)!important;
      width:auto!important;
      max-width:64%!important;
      min-width:0!important;
      gap:6px!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button{
      flex:0 1 auto!important;
      width:auto!important;
      min-width:0!important;
      max-width:108px!important;
      padding-inline:9px!important;
      overflow:hidden!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button [data-ebsf-filter-label]{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    .ebsf-toolbar-row .ebsf-sort{
      flex:1 1 96px!important;
      width:auto!important;
      min-width:62px!important;
      max-width:142px!important;
    }
    .ebsf-toolbar-row .ebsf-sort>button{
      width:100%!important;
      max-width:100%!important;
      padding-inline:8px!important;
      overflow:hidden!important;
    }
    .ebsf-toolbar-row .ebsf-settings-button{
      flex:0 0 40px!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-toolbar-row .ebsf-native-search-slot{
      flex:1 1 112px!important;
      width:auto!important;
      min-width:64px!important;
      max-width:none!important;
    }
  }

  @media(max-width:460px){
    .ebsf-toolbar-row .ebsf-filter-button{
      flex:0 0 40px!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-toolbar-row .ebsf-filter-button [data-ebsf-filter-label]{display:none!important}
    .ebsf-toolbar-row .ebsf-search-left-controls{
      flex-basis:min(198px,58%)!important;
      max-width:58%!important;
    }
    .ebsf-toolbar-row .ebsf-sort{min-width:58px!important;max-width:112px!important}
    .ebsf-toolbar-row .ebsf-native-search-slot{min-width:58px!important}
  }

  @media(max-width:360px){
    .ebsf-toolbar-row{gap:4px!important}
    .ebsf-toolbar-row .ebsf-search-left-controls{gap:4px!important;max-width:60%!important}
    .ebsf-toolbar-row .ebsf-filter-button,
    .ebsf-toolbar-row .ebsf-settings-button{
      flex-basis:36px!important;
      width:36px!important;
      min-width:36px!important;
      max-width:36px!important;
      height:36px!important;
    }
    .ebsf-toolbar-row .ebsf-sort{min-width:52px!important;max-width:96px!important}
    .ebsf-toolbar-row .ebsf-native-search-slot{min-width:52px!important}
  }
`);

favSanitizeHiddenCategory0126();
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favProtectNativePagination0126();
    favClearLegacyToolbarGeometry0126();
    favInstallPageShell0120();
    favScheduleFacetAvailability0121();
});
