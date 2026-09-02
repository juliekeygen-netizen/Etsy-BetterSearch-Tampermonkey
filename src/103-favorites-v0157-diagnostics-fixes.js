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
 *
 * v0.15.14 also makes this final integration boundary the semantic owner of
 * persistent Favorites header/progress writes. Historical module 86 rebuilt
 * Etsy collection metadata with replaceChildren() on every shell pass and
 * module 91 then removed/recreated the privacy text node. Because that metadata
 * lives in Etsy's native header, those no-op child-list writes could wake the
 * runtime lifecycle observer again. Final reconciliation below preserves native
 * nodes and changes only values whose semantic content actually changed.
 */

var FAV_TOOLBAR_MIN_SEARCH0157 = 160;
var FAV_TOOLBAR_TITLE_GAP0157 = 16;
// The title area varies by Favorites route. On desktop, choose one canonical
// toolbar geometry or stack; do not shrink the search slot per route.
var FAV_TOOLBAR_STABLE_MAX_RATIO01526 = 0.68;
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
    const toolbarCap = width * FAV_TOOLBAR_STABLE_MAX_RATIO01526;
    const searchWidth = Math.max(0, Math.min(
        desiredSearch,
        toolbarCap - reserved,
    ));
    if (searchWidth < FAV_TOOLBAR_MIN_SEARCH0157) {
        return { stacked:true, reserved, searchWidth:0, toolbarWidth:0, available };
    }
    const toolbarWidth = reserved + searchWidth;
    if (available < toolbarWidth) {
        return { stacked:true, reserved, searchWidth:0, toolbarWidth:0, available };
    }
    return { stacked:false, reserved, searchWidth, toolbarWidth, available };
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

function favStyleSetValue01514(node, property, value, priority = '') {
    if (!node?.style) return false;
    const text = String(value ?? '');
    if (
        node.style.getPropertyValue(property) === text
        && node.style.getPropertyPriority(property) === priority
    ) return false;
    node.style.setProperty(property, text, priority);
    return true;
}

function favSetElementText01514(node, value) {
    if (!node) return false;
    const text = String(value ?? '');
    if (node.textContent === text) return false;
    node.textContent = text;
    return true;
}

function favSetStrongLabel01514(strong, label) {
    if (!strong) return false;
    const expected = strong.childElementCount ? ` ${String(label ?? '')}` : String(label ?? '');
    const textNodes = Array.from(strong.childNodes || []).filter((node) => node.nodeType === 3);
    let changed = false;
    let primary = textNodes[0] || null;
    if (!primary) {
        primary = document.createTextNode(expected);
        strong.append(primary);
        changed = true;
    } else if (primary.nodeValue !== expected) {
        primary.nodeValue = expected;
        changed = true;
    }
    for (const extra of textNodes.slice(1)) {
        extra.remove();
        changed = true;
    }
    return changed;
}

/* Final privacy-label writers preserve Etsy/native child elements and the
 * existing text node. A repeated reconcile with the same label performs zero
 * child-list writes. */
favSetStrongLabel0126 = favSetStrongLabel01514;
favSetPrivateLabel0131 = function favSetPrivateLabel01514(strong) {
    if (!strong) return false;
    let changed = false;
    let icon = strong.querySelector?.('[data-ebsf-scope-privacy-icon]') || null;
    if (!icon && typeof favPrivateIconMarkup0131 === 'function') {
        const holder = document.createElement('span');
        holder.innerHTML = favPrivateIconMarkup0131();
        icon = holder.firstElementChild;
        if (icon) {
            strong.prepend(icon);
            changed = true;
        }
    }
    return favSetStrongLabel01514(strong, 'Private collection') || changed;
};

favApplyScopeMetaDensity0131 = function favApplyScopeMetaDensity01514() {
    const header = document.querySelector('[data-ebsf-all-header]');
    if (!header?.isConnected) return;
    if (header.classList.contains('ebsf-scope-meta-compact')) header.classList.remove('ebsf-scope-meta-compact');

    const meta = header.querySelector('[data-ebsf-scope-meta]');
    const privacy = meta?.querySelector('b');
    const count = meta?.querySelector('[data-ebsf-scope-count]');
    if (!meta || !privacy || !count) return;

    const { total, shown } = favScopeCounts0120();
    favSetPrivateLabel0131(privacy);
    favSetElementText01514(count, `${total} favorites · ${shown} shown`);
};
favApplyScopeMetaDensity0125 = favApplyScopeMetaDensity0131;
favApplyScopeMetaDensity0126 = favApplyScopeMetaDensity0131;

favApplyCollectionMetaDensity0126 = function favApplyCollectionMetaDensity01514() {
    if (favScope().type === 'items') return;
    const meta = document.querySelector('[data-test-id="collections-landing-right-side-header"],[data-testid="collections-landing-right-side-header"]');
    const strong = meta?.querySelector('b');
    if (!meta || !strong) return;

    const privacy = /private/i.test(strong.textContent || '') ? 'Private' : 'Public';
    const { total, shown } = favScopeCounts0120();
    favSetStrongLabel01514(strong, `${privacy} collection`);

    const countText = `${total} favorites · ${shown} shown`;
    let countNode = Array.from(meta.childNodes || []).find((node) => node.nodeType === 3 && /\d/.test(node.nodeValue || ''));
    if (!countNode) {
        countNode = document.createTextNode(countText);
        meta.append(countNode);
    } else if (countNode.nodeValue !== countText) {
        countNode.nodeValue = countText;
    }
};

/* Do not call the historical module-86 updater here: its collection branch uses
 * meta.replaceChildren(), which destroys Etsy's native metadata subtree even
 * when the displayed values are unchanged. */
favUpdateScopeHeader0120 = function favUpdateScopeHeader01514() {
    if (favScope().type === 'items') favApplyScopeMetaDensity0131();
    else favApplyCollectionMetaDensity0126();

    if (favState.countNode?.isConnected) favState.countNode.remove();
    favState.countNode = null;
    document.querySelectorAll('.ebsf-result-count').forEach((node) => node.remove());
};

/* The progress node belongs to BetterSearch, but it is still a hot writer. Keep
 * the established node/ARIA semantics while avoiding same-text replacement. */
var favProgressBefore01514 = favProgress;
favProgress = function favProgress01514(text) {
    const node = favState.progressNode;
    if (!node) return favProgressBefore01514(text);
    favSetElementText01514(node, text);
    if (!favPositionProgress0134(node)) requestAnimationFrame(() => favPositionProgress0134(node));
};

favPositionProgress0134 = function favPositionProgress01514(node = favState.progressNode) {
    if (!node) return false;
    const header = document.querySelector('#collections-landing-phase-3-header-container');
    const meta = favProgressMeta0134(header);
    if (!header || !meta) return false;

    if (!node.classList.contains('ebsf-progress-inline0134')) node.classList.add('ebsf-progress-inline0134');
    if (!Object.prototype.hasOwnProperty.call(node.dataset, 'ebsfProgressInline')) node.dataset.ebsfProgressInline = '';
    if (node.parentElement !== header) header.append(node);

    const headerRect = header.getBoundingClientRect();
    const metaRect = meta.getBoundingClientRect();
    if (!headerRect.width || !metaRect.height) return true;
    favStyleSetValue01514(node, '--ebsf-progress-top0134', `${Math.max(0, metaRect.top - headerRect.top)}px`);
    favStyleSetValue01514(node, '--ebsf-progress-height0134', `${Math.max(16, metaRect.height)}px`);
    return true;
};

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
    /* Etsy has used both identities in live/diagnostic markup. The original
     * v0.15.7 observer recognized both, but the actual offset writer only looked
     * up the id and silently skipped a data-attribute-only module. */
    return document.querySelector('#favorites_similar_listings,[data-favorites-similar-listings]');
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

    /* Padding changes only the module's inner content box; its border-box left
     * edge is stable. Measure in place so a repeated shell/resize pass never has
     * to clear then reapply the same offset. Etsy keeps full ownership of the
     * node and its descendants. */
    const content = favFavoritesContentColumn0120?.();
    const target = content?.querySelector?.('.phase3-listing-cards-section') || content;
    if (!target) {
        favClearSimilarListingsOffset0157(module);
        return;
    }
    const moduleRect = module.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!moduleRect.width || !targetRect.width) {
        favClearSimilarListingsOffset0157(module);
        return;
    }
    const offset = Math.max(0, Math.round((targetRect.left - moduleRect.left) * 100) / 100);
    if (offset < 1) {
        favClearSimilarListingsOffset0157(module);
        return;
    }

    favStyleSet0157(module, 'padding-left', `${offset}px`);
    favStyleSet0157(module, 'box-sizing', 'border-box');
    if (module.dataset.ebsfRailOffset0157 !== '1') module.dataset.ebsfRailOffset0157 = '1';
}

function favScheduleSimilarListingsOffset0157() {
    if (favSimilarListingsFrame0157) cancelAnimationFrame(favSimilarListingsFrame0157);
    favSimilarListingsFrame0157 = requestAnimationFrame(() => {
        favSimilarListingsFrame0157 = 0;
        favApplySimilarListingsOffset0157();
    });
}

function favSetDynamicToolbarStack0157(header, enabled) {
    if (!header) return;
    const wanted = Boolean(enabled);
    if (header.classList.contains('ebsf-toolbar-stack0157') !== wanted) {
        header.classList.toggle('ebsf-toolbar-stack0157', wanted);
    }
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
    if (right.dataset.ebsfExactXOwns !== '1') right.dataset.ebsfExactXOwns = '1';
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
        favStyleSetValue01514(document.documentElement, '--ebsf-shared-sort-width0134', measured);
        favStyleSetValue01514(row, '--ebsf-narrow-sort-width', measured);
    }

    const headerWidth = header.getBoundingClientRect().width;
    if (!headerWidth) return;

    if (innerWidth < 900) {
        favSetDynamicToolbarStack0157(header, false);
        favClearExactDesktopToolbarWidth0135(right);
        favClearCollectionToolbarX0136(right);
        favStyleRemove0157(row, '--ebsf-shared-search-width0134');
        return;
    }

    const leftRectWidth = left?.getBoundingClientRect?.().width || 0;
    const leftWidth = Math.max(leftRectWidth, Number(left?.scrollWidth) || 0);
    const plan = favToolbarPlan0157({ viewportWidth:innerWidth, headerWidth, leftWidth, sortWidth });
    if (plan.stacked) {
        favSetDynamicToolbarStack0157(header, true);
        favClearExactDesktopToolbarWidth0135(right);
        favClearCollectionToolbarX0136(right);
        favStyleRemove0157(row, '--ebsf-shared-search-width0134');
        return;
    }

    favSetDynamicToolbarStack0157(header, false);
    const searchCss = `${Math.round(plan.searchWidth * 100) / 100}px`;
    const toolbarCss = `${Math.round(plan.toolbarWidth * 100) / 100}px`;
    favStyleSetValue01514(row, '--ebsf-shared-search-width0134', searchCss);
    favStyleSet0157(right, 'flex', `0 0 ${toolbarCss}`);
    favStyleSet0157(right, 'width', toolbarCss);
    favStyleSet0157(right, 'max-width', toolbarCss);
    favStyleSet0157(right, 'min-width', toolbarCss);
    if (right.dataset.ebsfExactToolbarOwns !== '1') right.dataset.ebsfExactToolbarOwns = '1';
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
