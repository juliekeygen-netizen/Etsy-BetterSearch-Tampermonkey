'use strict';

/* v0.12.2 Favorites responsive-shell hardening.
 *
 * This pass intentionally stays scoped to page-shell behavior:
 *  - keep the desktop filter rail mounted through Etsy soft rerenders;
 *  - let the All/header toolbar stay inside the content column as the viewport
 *    changes instead of relying on fixed search widths;
 *  - make the collection strip a bounded horizontal scroller;
 *  - distinguish collection dragging from ordinary clicks, and make active
 *    collection links a no-op instead of reloading the same route.
 */

var FAV_DESKTOP_SHELL_MIN_WIDTH0124 = 760;
favDesktopShell0120 = function favDesktopShell0124() {
    return innerWidth >= FAV_DESKTOP_SHELL_MIN_WIDTH0124;
};
favState.shellDesktop0120 = favDesktopShell0120();

function favPlainPrimaryClick0124(event) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

favBindCollectionScroller0120 = function favBindCollectionScroller0124(scroller) {
    scroller.dataset.ebsfScrollerRevision = '2';
    let pointerId = null;
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let suppressClick = false;
    const dragThreshold = 8;

    scroller.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startLeft = scroller.scrollLeft;
        dragging = false;
        suppressClick = false;
    });

    scroller.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        const delta = event.clientX - startX;
        if (!dragging && Math.abs(delta) >= dragThreshold) {
            dragging = true;
            suppressClick = true;
            scroller.setPointerCapture?.(pointerId);
            scroller.classList.add('is-dragging');
        }
        if (!dragging) return;
        scroller.scrollLeft = startLeft - delta;
        event.preventDefault();
    });

    const finish = (event) => {
        if (pointerId !== event.pointerId) return;
        if (dragging) scroller.releasePointerCapture?.(pointerId);
        pointerId = null;
        dragging = false;
        scroller.classList.remove('is-dragging');
    };
    scroller.addEventListener('pointerup', finish);
    scroller.addEventListener('pointercancel', finish);

    scroller.addEventListener('click', (event) => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick = false;
    }, true);

    scroller.addEventListener('wheel', (event) => {
        if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        scroller.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive:false });

    scroller.addEventListener('keydown', (event) => {
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
};

var favBuildCollectionStripBefore0124 = favBuildCollectionStrip0120;
favBuildCollectionStrip0120 = function favBuildCollectionStrip0124() {
    const strip = favBuildCollectionStripBefore0124();
    for (const link of strip.querySelectorAll('a.ebsf-collection-pill')) {
        link.addEventListener('click', (event) => {
            if (!favPlainPrimaryClick0124(event)) return;
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
    return strip;
};

/* Existing v0.12.1 strips were built before the revised drag/click binder was
 * installed. Replace such a strip once so it gets the new event behavior. */
var favInstallCollectionStripBefore0124 = favInstallCollectionStrip0120;
favInstallCollectionStrip0120 = function favInstallCollectionStrip0124(content) {
    const current = content?.querySelector?.(':scope > [data-ebsf-collection-strip]')
        || document.querySelector('[data-ebsf-collection-strip]');
    const scroller = current?.querySelector?.(':scope > .ebsf-collection-scroll');
    if (current && scroller?.dataset.ebsfScrollerRevision !== '2') current.remove();
    return favInstallCollectionStripBefore0124(content);
};

function favElementFromMutationNode0124(node) {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
}

function favMutationTouchesShell0124(record) {
    const target = favElementFromMutationNode0124(record.target);
    const changed = [...Array.from(record.addedNodes || []), ...Array.from(record.removedNodes || [])]
        .map(favElementFromMutationNode0124)
        .filter(Boolean);

    /* Ignore BetterSearch changing children inside its own mounted UI. */
    if (target?.closest?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]')) {
        return false;
    }

    /* Etsy often rerenders a wrapper *inside* the existing sidebar instead of
     * replacing the sidebar element itself. The v0.12.1 observer only watched
     * the sidebar node, so native “View all” content could come back while our
     * rail disappeared. Any non-owned child mutation anywhere in the sidebar,
     * or removal of the rail itself, needs one idempotent shell repair. */
    if (target?.closest?.('[data-testid="sidebar"]')) {
        return changed.some((node) => node.matches?.('[data-ebsf-rail]') || !favOwnedShellNode0123(node));
    }

    if (changed.some((node) => favNativeShellNode0123(node))) return true;
    if (changed.some((node) => node.matches?.('[data-ebsf-rail]') && !node.isConnected)) return true;

    return false;
}

favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120 = new MutationObserver((records) => {
    if (records.some(favMutationTouchesShell0124)) favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body, { childList:true, subtree:true });

/* A product-grid render is the lifecycle boundary where the disappearing-rail
 * report occurred. Reassert the shell after the render completes as a second,
 * cheap safety net. favInstallPageShell0120 is now idempotent. */
var favRenderCurrentBefore0124 = favRenderCurrent;
favRenderCurrent = function favRenderCurrent0124() {
    const result = favRenderCurrentBefore0124();
    requestAnimationFrame(() => {
        if (isFavoritesPage()) favInstallPageShell0120();
    });
    return result;
};

GM_addStyle(`
  .ebsf-collection-strip{
    box-sizing:border-box!important;
    max-width:100%!important;
    min-width:0!important;
    overflow:hidden!important;
  }
  .ebsf-collection-fixed{
    min-width:max-content!important;
  }
  .ebsf-collection-scroll{
    flex:1 1 0!important;
    width:0!important;
    max-width:100%!important;
    min-width:0!important;
  }
  .ebsf-scope-header,
  .ebsf-scope-controls,
  .ebsf-scope-controls .ebsf-toolbar-row,
  .ebsf-scope-controls .ebsf-native-search-slot,
  .ebsf-scope-controls .ebsf-native-search-slot>form,
  .ebsf-scope-controls .ebsf-native-search-slot>.wt-input-btn-group{
    box-sizing:border-box!important;
    min-width:0!important;
  }

  @media(min-width:760px){
    [data-testid="sidebar"].ebsf-sidebar-permanent{
      display:block!important;
    }
    .ebsf-filter-button[aria-hidden="true"]{
      display:none!important;
    }
    .ebsf-scope-header{
      display:grid!important;
      grid-template-columns:minmax(145px,max-content) minmax(0,1fr)!important;
      column-gap:clamp(12px,1.6vw,28px)!important;
      row-gap:8px!important;
      align-items:end!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-copy{
      min-width:0!important;
      max-width:320px!important;
    }
    .ebsf-scope-controls{
      grid-column:2!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      justify-self:stretch!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:flex!important;
      align-items:center!important;
      flex-wrap:nowrap!important;
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
      gap:clamp(6px,.65vw,10px)!important;
      margin-left:0!important;
      transform:none!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      display:flex!important;
      align-items:center!important;
      flex:0 1 auto!important;
      min-width:0!important;
      max-width:min(280px,42%)!important;
      gap:clamp(6px,.65vw,10px)!important;
    }
    .ebsf-scope-header .ebsf-sort{
      flex:1 1 170px!important;
      width:auto!important;
      min-width:96px!important;
      max-width:220px!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      padding-inline:clamp(9px,1vw,14px)!important;
      overflow:hidden!important;
    }
    .ebsf-scope-header .ebsf-sort>button [data-ebsf-sort-label]{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    .ebsf-scope-header .ebsf-settings-button{
      flex:0 0 40px!important;
      width:40px!important;
      min-width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      flex:1 1 260px!important;
      width:auto!important;
      min-width:96px!important;
      max-width:none!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot>form,
    .ebsf-scope-header .ebsf-native-search-slot>.wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot form,
    .ebsf-scope-header .ebsf-native-search-slot .wt-input-btn-group{
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }

  @media(max-width:759px){
    [data-testid="sidebar"].ebsf-sidebar-permanent{
      display:none!important;
    }
    .ebsf-scope-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr)!important;
      gap:10px!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-controls{
      grid-column:1!important;
      width:100%!important;
      max-width:100%!important;
      justify-self:stretch!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:flex!important;
      flex-wrap:wrap!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      transform:none!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      display:flex!important;
      flex:1 1 100%!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-header .ebsf-sort{
      flex:1 1 calc(100% - 48px)!important;
      width:auto!important;
      min-width:0!important;
      max-width:none!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-header .ebsf-settings-button{
      flex:0 0 40px!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      flex:1 1 100%!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
    }
  }

  @media(max-width:520px){
    .ebsf-collection-pill{
      min-height:34px!important;
      padding-inline:10px!important;
    }
    .ebsf-collection-add{
      width:34px!important;
      min-height:34px!important;
    }
  }
`);

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    /* Force one rebuild if the strip was created by v0.12.1 before this module
     * loaded, then reassert the permanent rail with the new breakpoint. */
    favInstallPageShell0120();
    favRepairToolbarLayout();
});
