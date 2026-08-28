'use strict';

/* v0.12.3 responsive Favorites polish.
 *
 * This pass refines the v0.12.2 shell without reopening pagination/category
 * behavior yet:
 *  - the entire collection strip (including All/+ and pill text) is a drag
 *    surface while ordinary clicks still navigate/activate normally;
 *  - narrow layouts keep scope metadata and all toolbar controls on two compact
 *    horizontal rows instead of expanding sort/search into separate rows;
 *  - medium desktop widths compact scope metadata before the toolbar runs out
 *    of room, preventing settings/search overlap.
 */

function favBindCollectionScroller0125(scroller) {
    if (!scroller) return;
    const strip = scroller.closest?.('[data-ebsf-collection-strip]') || scroller.parentElement;
    if (!strip) return;

    scroller.dataset.ebsfScrollerRevision = '3';
    strip.dataset.ebsfScrollerRevision = '3';

    let pointerId = null;
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let suppressClick = false;
    const dragThreshold = 8;

    strip.querySelectorAll('a,button,img').forEach((node) => {
        if ('draggable' in node) node.draggable = false;
    });

    strip.addEventListener('dragstart', (event) => event.preventDefault());
    strip.addEventListener('selectstart', (event) => event.preventDefault());

    strip.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || pointerId !== null) return;
        pointerId = event.pointerId;
        startX = event.clientX;
        startLeft = scroller.scrollLeft;
        dragging = false;
        suppressClick = false;
    });

    strip.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId) return;
        const delta = event.clientX - startX;
        if (!dragging && Math.abs(delta) >= dragThreshold) {
            dragging = true;
            suppressClick = true;
            strip.setPointerCapture?.(pointerId);
            strip.classList.add('is-dragging');
        }
        if (!dragging) return;
        scroller.scrollLeft = startLeft - delta;
        event.preventDefault();
    });

    const finish = (event) => {
        if (pointerId !== event.pointerId) return;
        if (dragging) strip.releasePointerCapture?.(pointerId);
        pointerId = null;
        dragging = false;
        strip.classList.remove('is-dragging');
    };
    strip.addEventListener('pointerup', finish);
    strip.addEventListener('pointercancel', finish);
    strip.addEventListener('pointerleave', (event) => {
        if (!dragging && pointerId === event.pointerId) finish(event);
    });

    strip.addEventListener('click', (event) => {
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
}

favBindCollectionScroller0120 = favBindCollectionScroller0125;

var favInstallCollectionStripBefore0125 = favInstallCollectionStrip0120;
favInstallCollectionStrip0120 = function favInstallCollectionStrip0125(content) {
    const current = content?.querySelector?.(':scope > [data-ebsf-collection-strip]')
        || document.querySelector('[data-ebsf-collection-strip]');
    const scroller = current?.querySelector?.(':scope > .ebsf-collection-scroll');
    if (current && scroller?.dataset.ebsfScrollerRevision !== '3') current.remove();
    return favInstallCollectionStripBefore0125(content);
};

function favApplyScopeMetaDensity0125() {
    const header = document.querySelector('[data-ebsf-all-header]');
    if (!header?.isConnected) return;
    const meta = header.querySelector('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector('b');
    const count = meta?.querySelector('[data-ebsf-scope-count]');
    if (!meta || !privacy || !count) return;

    const width = header.getBoundingClientRect().width;
    const compact = width > 0 && width < 1100;
    header.classList.toggle('ebsf-scope-meta-compact', compact);

    const { total, shown } = favScopeCounts0120();
    const privacyText = compact ? 'Private' : 'Private collection';
    const countText = compact ? `${total} · ${shown}` : `${total} favorites · ${shown} shown`;
    if (privacy.textContent !== privacyText) privacy.textContent = privacyText;
    if (count.textContent !== countText) count.textContent = countText;
}

var favUpdateScopeHeaderBefore0125 = favUpdateScopeHeader0120;
favUpdateScopeHeader0120 = function favUpdateScopeHeader0125() {
    const result = favUpdateScopeHeaderBefore0125();
    favApplyScopeMetaDensity0125();
    return result;
};

var favEnsureAllHeaderBefore0125 = favEnsureAllHeader0120;
favEnsureAllHeader0120 = function favEnsureAllHeader0125(content) {
    const header = favEnsureAllHeaderBefore0125(content);
    if (header) requestAnimationFrame(favApplyScopeMetaDensity0125);
    return header;
};

window.addEventListener('resize', () => requestAnimationFrame(favApplyScopeMetaDensity0125), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favApplyScopeMetaDensity0125)).catch?.(() => {});

GM_addStyle(`
  [data-ebsf-collection-strip]{
    touch-action:pan-y!important;
  }
  [data-ebsf-collection-strip],
  [data-ebsf-collection-strip] *{
    -webkit-user-select:none!important;
    user-select:none!important;
  }
  [data-ebsf-collection-strip] a,
  [data-ebsf-collection-strip] img{
    -webkit-user-drag:none!important;
  }
  [data-ebsf-collection-strip].is-dragging,
  [data-ebsf-collection-strip].is-dragging *{
    cursor:grabbing!important;
  }

  @media(min-width:760px) and (max-width:1440px){
    .ebsf-scope-header{
      grid-template-columns:minmax(150px,27%) minmax(0,1fr)!important;
      column-gap:clamp(8px,1.1vw,16px)!important;
    }
    .ebsf-scope-copy{
      width:100%!important;
      max-width:none!important;
      min-width:0!important;
    }
    .ebsf-scope-copy [data-ebsf-scope-meta]{
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      flex:0 1 min(220px,42%)!important;
      width:auto!important;
      max-width:42%!important;
      min-width:126px!important;
    }
    .ebsf-scope-header .ebsf-sort{
      flex:1 1 90px!important;
      min-width:76px!important;
      max-width:180px!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      flex:1 1 160px!important;
      min-width:92px!important;
      max-width:none!important;
    }
  }

  @media(max-width:759px){
    .ebsf-scope-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr)!important;
      gap:10px!important;
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
      text-overflow:ellipsis!important;
    }
    .ebsf-scope-copy [data-ebsf-scope-meta] > *{
      flex:0 0 auto!important;
    }
    .ebsf-scope-copy [data-ebsf-scope-count]{
      flex:0 1 auto!important;
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    .ebsf-scope-controls .ebsf-toolbar-row{
      display:flex!important;
      align-items:center!important;
      flex-wrap:nowrap!important;
      gap:6px!important;
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      display:flex!important;
      align-items:center!important;
      flex:0 1 min(276px,64%)!important;
      width:auto!important;
      max-width:64%!important;
      min-width:0!important;
      gap:6px!important;
    }
    .ebsf-scope-header .ebsf-filter-button{
      flex:0 1 auto!important;
      width:auto!important;
      min-width:0!important;
      max-width:112px!important;
      padding-inline:10px!important;
      overflow:hidden!important;
    }
    .ebsf-scope-header .ebsf-filter-button [data-ebsf-filter-label]{
      min-width:0!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    .ebsf-scope-header .ebsf-sort{
      flex:1 1 105px!important;
      width:auto!important;
      min-width:70px!important;
      max-width:150px!important;
    }
    .ebsf-scope-header .ebsf-sort>button{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      padding-inline:9px!important;
      overflow:hidden!important;
    }
    .ebsf-scope-header .ebsf-sort [data-ebsf-sort-label]{
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
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      flex:1 1 120px!important;
      width:auto!important;
      min-width:76px!important;
      max-width:none!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot>form,
    .ebsf-scope-header .ebsf-native-search-slot>.wt-input-btn-group,
    .ebsf-scope-header .ebsf-native-search-slot form,
    .ebsf-scope-header .ebsf-native-search-slot .wt-input-btn-group{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
    }
  }

  @media(max-width:460px){
    .ebsf-scope-header .ebsf-filter-button{
      flex:0 0 40px!important;
      width:40px!important;
      max-width:40px!important;
      padding:0!important;
    }
    .ebsf-scope-header .ebsf-filter-button [data-ebsf-filter-label]{
      display:none!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      flex-basis:min(206px,58%)!important;
      max-width:58%!important;
    }
    .ebsf-scope-header .ebsf-sort{
      min-width:64px!important;
      max-width:120px!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      min-width:68px!important;
    }
  }
`);

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    const content = favFavoritesContentColumn0120();
    if (content) favInstallCollectionStrip0120(content);
    favApplyScopeMetaDensity0125();
    favInstallPageShell0120();
});
