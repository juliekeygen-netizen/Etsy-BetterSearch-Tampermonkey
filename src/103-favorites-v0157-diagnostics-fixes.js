'use strict';

/* v0.15.7 diagnostics-driven browser corrections.
 *
 * The 2026-08-30 recordings proved three remaining mismatches after the stable
 * rail ownership work:
 *   1. Ships-from availability could advertise a country with zero matching
 *      Favorites because unknown origin metadata was treated as available.
 *   2. Etsy's zero-result "Discover similar items" module can start beneath the
 *      body-level permanent rail, because Etsy does not reserve space for an
 *      overlay it does not own.
 *   3. Medium desktop headers could allocate ~74% of the complete header to the
 *      right toolbar without accounting for the collection title/edit controls;
 *      the stacked 761-899px track also kept the historical 50% Search cap.
 *
 * Keep these fixes at the final integration boundary so historical availability
 * and header layers cannot reintroduce the diagnosed behavior.
 */

var FAV_TOOLBAR_MIN_SEARCH0157 = 160;
var FAV_TOOLBAR_TITLE_GAP0157 = 16;
var favSimilarListingsFrame0157 = 0;

function favShippingCodesAvailable0157(bindingKey, codesInput, currentCountry = '') {
    const codes = codesInput instanceof Set ? codesInput : new Set(codesInput || []);
    if (bindingKey.startsWith('ships-origin:')) return codes.has(bindingKey.slice(13).toUpperCase());
    if (bindingKey === 'ships-europe') return [...codes].some((code) => FAV_EUROPE_COUNTRY_CODES0101.has(String(code).toUpperCase()));
    if (bindingKey === 'ships-eu') return [...codes].some((code) => FAV_EU_COUNTRY_CODES0120.has(String(code).toUpperCase()));
    if (bindingKey === 'ships-local') {
        const country = String(currentCountry || '').trim().toUpperCase();
        return Boolean(country && codes.has(country));
    }
    return true;
}

function favToolbarPlan0157({ viewportWidth, headerWidth, leftWidth, sortWidth }) {
    const width = Math.max(0, Number(headerWidth) || 0);
    const left = Math.max(0, Number(leftWidth) || 0);
    const sort = Math.max(0, Number(sortWidth) || 180);
    const reserved = sort + FAV_SETTINGS_WIDTH0135 + FAV_TOOLBAR_GAP_TOTAL0135;
    if (!width || Number(viewportWidth) < 900) {
        return { stacked:true, reserved, searchWidth:0, toolbarWidth:0, available:width };
    }

    const available = Math.max(0, width - left - FAV_TOOLBAR_TITLE_GAP0157);
    if (available < reserved + FAV_TOOLBAR_MIN_SEARCH0157) {
        return { stacked:true, reserved, searchWidth:0, toolbarWidth:0, available };
    }

    const desiredSearch = width * FAV_EXACT_SEARCH_RATIO0135;
    const toolbarCap = width * FAV_EXACT_TOOLBAR_MAX_RATIO0135;
    const searchWidth = Math.max(0, Math.min(
        desiredSearch,
        toolbarCap - reserved,
        available - reserved,
    ));
    if (searchWidth < FAV_TOOLBAR_MIN_SEARCH0157) {
        return { stacked:true, reserved, searchWidth:0, toolbarWidth:0, available };
    }
    return { stacked:false, reserved, searchWidth, toolbarWidth:reserved + searchWidth, available };
}

function favStyleSet0157(node, property, value, priority = 'important') {
    if (!node) return false;
    const text = String(value ?? '');
    const current = node.style.getPropertyValue(property);
    const currentPriority = node.style.getPropertyPriority(property);
    if (current === text && currentPriority === priority) return false;
    node.style.setProperty(property, text, priority);
    return true;
}

function favStyleRemove0157(node, property) {
    if (!node?.style?.getPropertyValue(property)) return false;
    node.style.removeProperty(property);
    return true;
}

/* Ships-from options require the same positive evidence as the filter that will
 * run after selection. Unknown origin remains unknown, not a promise that every
 * country might match. Keep an active option visible so the user can clear it. */
var favBindingAvailableBefore0157 = favBindingAvailable0120;
favBindingAvailable0120 = function favBindingAvailable0157(bindingKey) {
    const shippingEvidence = bindingKey.startsWith('ships-origin:')
        || bindingKey === 'ships-europe'
        || bindingKey === 'ships-eu'
        || bindingKey === 'ships-local';
    if (!shippingEvidence) return favBindingAvailableBefore0157(bindingKey);
    if (favAvailabilityMode0110() === 'disabled' || favBindingActive0120(bindingKey)) return true;

    const records = favRecordsForBinding0120(bindingKey);
    favState.facetCapabilityCache0121 = favState.facetCapabilityCache0121 || new WeakMap();
    let caps = favState.facetCapabilityCache0121.get(records);
    if (!caps) {
        caps = favCatalogueCapabilities0101(records);
        favState.facetCapabilityCache0121.set(records, caps);
    }
    return favShippingCodesAvailable0157(bindingKey, caps.shipsFromCodes, favCurrentCountry0120?.());
};

function favSimilarListingsModule0157() {
    return document.getElementById('favorites_similar_listings');
}

function favClearSimilarListingsOffset0157(module = favSimilarListingsModule0157()) {
    if (!module || module.dataset.ebsfRailOffset0157 !== '1') return;
    favStyleRemove0157(module, 'padding-left');
    favStyleRemove0157(module, 'box-sizing');
    delete module.dataset.ebsfRailOffset0157;
}

function favApplySimilarListingsOffset0157() {
    const module = favSimilarListingsModule0157();
    if (!module) return;
    if (!isFavoritesPage() || !favDesktopShell0120() || !document.querySelector('[data-ebsf-rail-slot]')) {
        favClearSimilarListingsOffset0157(module);
        return;
    }

    /* Measure the native module without our previous padding, then shift only
     * its inner content. The Etsy node stays in its original parent/ownership. */
    favClearSimilarListingsOffset0157(module);
    const content = favFavoritesContentColumn0120?.();
    const target = content?.querySelector?.('.phase3-listing-cards-section') || content;
    if (!target) return;
    const moduleRect = module.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!moduleRect.width || !targetRect.width) return;
    const offset = Math.max(0, Math.round((targetRect.left - moduleRect.left) * 100) / 100);
    if (offset < 1) return;

    favStyleSet0157(module, 'padding-left', `${offset}px`);
    favStyleSet0157(module, 'box-sizing', 'border-box');
    module.dataset.ebsfRailOffset0157 = '1';
}

function favScheduleSimilarListingsOffset0157() {
    if (favSimilarListingsFrame0157) cancelAnimationFrame(favSimilarListingsFrame0157);
    favSimilarListingsFrame0157 = requestAnimationFrame(() => {
        favSimilarListingsFrame0157 = 0;
        favApplySimilarListingsOffset0157();
    });
}

function favNodeTouchesSimilarListings0157(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement || null;
    return Boolean(element && (
        element.matches?.('#favorites_similar_listings,[data-favorites-similar-listings]')
        || element.querySelector?.('#favorites_similar_listings,[data-favorites-similar-listings]')
    ));
}

var favSimilarListingsObserver0157 = new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some(favNodeTouchesSimilarListings0157))) {
        favScheduleSimilarListingsOffset0157();
    }
});
favSimilarListingsObserver0157.observe(document.body, { childList:true, subtree:true });

function favSetDynamicToolbarStack0157(header, enabled) {
    if (!header) return;
    header.classList.toggle('ebsf-toolbar-stack0157', Boolean(enabled));
}

function favOwnedToolbarTranslate0157(right) {
    if (!right || right.dataset.ebsfExactXOwns !== '1') return 0;
    const match = String(right.style.getPropertyValue('transform') || '').match(/translateX\((-?[\d.]+)px\)/);
    return match ? Number(match[1]) || 0 : 0;
}

function favAlignToolbarX0157(header, right) {
    if (!header || !right || innerWidth < 900 || header.classList.contains('ebsf-toolbar-stack0157')) {
        favClearCollectionToolbarX0136(right);
        return;
    }
    const target = favCollectionToolbarTarget0136(header);
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    if (!targetRect.width || !rightRect.width) return;

    /* The current rect includes our transform. Subtract it mathematically rather
     * than clearing/reapplying the style just to measure, avoiding visible/no-op
     * geometry churn on every reconciliation. */
    const currentShift = favOwnedToolbarTranslate0157(right);
    const baseRight = rightRect.right - currentShift;
    const desired = Math.round((targetRect.right - baseRight) * 100) / 100;
    if (!Number.isFinite(desired)) return;
    if (Math.abs(desired) < 0.01) {
        favClearCollectionToolbarX0136(right);
        return;
    }
    const css = `translateX(${desired}px)`;
    if (right.dataset.ebsfExactXOwns === '1' && right.style.getPropertyValue('transform') === css) return;
    favStyleSet0157(right, 'transform', css);
    right.dataset.ebsfExactXOwns = '1';
}

/* Final toolbar owner. Desktop width is constrained by the actual intrinsic
 * title/control width, not only a percentage of the complete header. If the
 * minimum useful Search control cannot coexist with the title, stack early.
 * 761-899px is already stacked by the responsive shell and uses a 1fr Search
 * track via the CSS below. */
favApplyExactSearchWidth0135 = function favApplyExactSearchWidth0157() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    const row = root?.closest?.('[data-ebsf-toolbar-row]') || document.querySelector('[data-ebsf-toolbar-row]');
    const header = row?.closest?.('#collections-landing-phase-3-header-container')
        || document.querySelector('#collections-landing-phase-3-header-container');
    const right = header?.querySelector(':scope > #collections-landing-right-side-header-container');
    const left = header?.querySelector(':scope > #collections-landing-left-side-header-container');
    if (!root || !row || !header || !right) return;

    favMeasureSortTrigger?.(root);
    const measured = root.style.getPropertyValue('--ebsf-sort-trigger-width').trim();
    const sortWidth = Number.parseFloat(measured) || 180;
    if (measured) {
        document.documentElement.style.setProperty('--ebsf-shared-sort-width0134', measured);
        row.style.setProperty('--ebsf-narrow-sort-width', measured);
    }

    const headerWidth = header.getBoundingClientRect().width;
    if (!headerWidth) return;

    if (innerWidth < 900) {
        favSetDynamicToolbarStack0157(header, false);
        favClearExactDesktopToolbarWidth0135(right);
        favClearCollectionToolbarX0136(right);
        row.style.removeProperty('--ebsf-shared-search-width0134');
        return;
    }

    const leftRectWidth = left?.getBoundingClientRect?.().width || 0;
    const leftWidth = Math.max(leftRectWidth, Number(left?.scrollWidth) || 0);
    const plan = favToolbarPlan0157({ viewportWidth:innerWidth, headerWidth, leftWidth, sortWidth });
    if (plan.stacked) {
        favSetDynamicToolbarStack0157(header, true);
        favClearExactDesktopToolbarWidth0135(right);
        favClearCollectionToolbarX0136(right);
        row.style.removeProperty('--ebsf-shared-search-width0134');
        return;
    }

    favSetDynamicToolbarStack0157(header, false);
    const searchCss = `${Math.round(plan.searchWidth * 100) / 100}px`;
    const toolbarCss = `${Math.round(plan.toolbarWidth * 100) / 100}px`;
    if (row.style.getPropertyValue('--ebsf-shared-search-width0134') !== searchCss) {
        row.style.setProperty('--ebsf-shared-search-width0134', searchCss);
    }
    favStyleSet0157(right, 'flex', `0 0 ${toolbarCss}`);
    favStyleSet0157(right, 'width', toolbarCss);
    favStyleSet0157(right, 'max-width', toolbarCss);
    favStyleSet0157(right, 'min-width', toolbarCss);
    right.dataset.ebsfExactToolbarOwns = '1';
    favAlignToolbarX0157(header, right);
};

var favInstallPageShellBefore0157 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0157() {
    const result = favInstallPageShellBefore0157?.();
    favScheduleExactToolbar0136?.();
    favScheduleSimilarListingsOffset0157();
    return result;
};

GM_addStyle(`
  /* In the normal tablet/narrow-desktop stack, Search owns the complete
   * flexible remainder after Sort + Settings instead of retaining the old 50%
   * cap that left a visible empty strip at the left of the toolbar. */
  @media (min-width:761px) and (max-width:899px){
    .ebsf-toolbar-row{
      grid-template-columns:var(--ebsf-shared-sort-width0134,180px) 40px minmax(0,1fr)!important;
      justify-content:stretch!important;
    }
  }

  /* Actual geometry can require stacking before Etsy's fixed 899px breakpoint.
   * This class is driven by title + toolbar fit, so long collection names and
   * zoom levels cannot collide with Sort/Settings/Search. */
  #collections-landing-phase-3-header-container.ebsf-toolbar-stack0157{
    flex-direction:column!important;
    align-items:stretch!important;
    gap:10px!important;
  }
  #collections-landing-phase-3-header-container.ebsf-toolbar-stack0157
  > #collections-landing-left-side-header-container,
  #collections-landing-phase-3-header-container.ebsf-toolbar-stack0157
  > #collections-landing-right-side-header-container{
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
  }
  #collections-landing-phase-3-header-container.ebsf-toolbar-stack0157 .ebsf-toolbar-row{
    grid-template-columns:var(--ebsf-shared-sort-width0134,180px) 40px minmax(0,1fr)!important;
    justify-content:stretch!important;
    width:100%!important;
    max-width:100%!important;
  }
`);

window.addEventListener('resize', favScheduleSimilarListingsOffset0157, { passive:true });
requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favApplyExactSearchWidth0135();
    favScheduleSimilarListingsOffset0157();
});
