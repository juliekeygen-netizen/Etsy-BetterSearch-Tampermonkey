'use strict';

/* v0.15.7 final Favorites filter-state boundary.
 *
 * Two UI-state bugs share the same root cause: historical filter controls had
 * more than one idea of what "active" meant. The v2 drawer auto-open path
 * treated Ships from -> Anywhere as active even though it is the neutral/default
 * value, while Strict/Multi built their dark split-button state once and the
 * generic binding sync never removed that class when the mode was switched off.
 *
 * Keep one final semantic owner here. A binding is active only when it changes
 * the result set away from the normalized default. Drawer auto-open uses that
 * same definition, and every duplicate visual instance is re-synchronized from
 * current favCfg after a change.
 */

function favFilterValuePresent0157(value) {
    return String(value ?? '').trim().length > 0;
}

function favBindingMeaningfullyActive0157(bindingKey, config = favCfg) {
    const key = String(bindingKey || '');
    const source = config && typeof config === 'object' ? config : {};
    const filters = source.filters && typeof source.filters === 'object' ? source.filters : {};

    if (key === 'strict-title') return source.strict === true;
    if (key === 'multi-search') return source.multi === true;

    if (key.startsWith('category:')) {
        const wanted = key.slice(9);
        return Boolean(wanted) && String(filters.category || '') === wanted;
    }

    const shipsFrom = String(filters.shipsFrom || 'anywhere').toLowerCase();
    if (key.startsWith('ships-origin:')) {
        const wanted = key.slice(13).toUpperCase();
        return Boolean(wanted)
            && shipsFrom === 'country'
            && String(filters.shipsFromCountry || '').trim().toUpperCase() === wanted;
    }
    /* Anywhere is the baseline: accepting every origin is not an active filter. */
    if (key === 'ships-anywhere') return false;
    /* Country mode is not meaningful until an actual country has been chosen. */
    if (key === 'ships-country') return shipsFrom === 'country' && favFilterValuePresent0157(filters.shipsFromCountry);
    if (key === 'ships-europe') return shipsFrom === 'europe';
    if (key === 'ships-eu') return shipsFrom === 'eu';
    if (key === 'ships-local') return shipsFrom === 'local';

    if (key === 'price-range') return favFilterValuePresent0157(filters.minPrice) || favFilterValuePresent0157(filters.maxPrice);
    if (key === 'etsys-picks') return filters.etsysPick === true;
    if (key === 'star-seller') return filters.starSeller === true;
    if (key === 'available-only') return filters.availableOnly === true;
    if (key === 'on-sale') return filters.onSale === true;
    if (key === 'free-shipping') return filters.freeShipping === true;
    if (key === 'customizable') return filters.personalizable === true;
    if (key === 'has-variations') return filters.hasVariations === true;
    if (key === 'gift-wrap') return filters.giftWrap === true;
    if (key === 'physical') return filters.itemFormat === 'physical';
    if (key === 'digital') return filters.itemFormat === 'digital';
    if (key === 'vintage') return filters.vintage === true;
    if (key === 'shop') return favFilterValuePresent0157(filters.shop);
    if (key === 'low-stock') return filters.lowStock === true;
    if (key === 'min-carts') return favFilterValuePresent0157(filters.minCarts);
    if (key === 'min-rating') return favFilterValuePresent0157(filters.minRating);
    if (key === 'min-reviews') return favFilterValuePresent0157(filters.minReviews);
    if (key === 'max-shipping') return favFilterValuePresent0157(filters.maxShipping);
    if (key === 'returns') return filters.returns === true;
    if (key === 'exchanges') return filters.exchanges === true;
    return false;
}

function favDrawerShouldOpen0157(drawer, config = favCfg, autoOpen = favUiPrefs?.autoOpenActiveSections === true, manualOpen = false) {
    if (manualOpen) return true;
    if (!autoOpen || !drawer || drawer.hidden === true) return false;
    return (Array.isArray(drawer.optionInstances) ? drawer.optionInstances : []).some((option) =>
        option?.hidden !== true && favBindingMeaningfullyActive0157(option?.bindingKey, config)
    );
}

/* Replace the historical binding-state predicate so availability, active
 * styling, clearing and drawer disclosure all consume exactly the same truth. */
favBindingActive0120 = function favBindingActive0157(bindingKey, config = favCfg) {
    return favBindingMeaningfullyActive0157(bindingKey, config);
};

function favToggleClass0157(node, className, enabled) {
    if (!node?.classList) return;
    const wanted = Boolean(enabled);
    if (node.classList.contains(className) !== wanted) node.classList.toggle(className, wanted);
}

function favSetAttribute0157(node, name, value) {
    if (!node?.getAttribute || !node?.setAttribute) return;
    const text = String(value);
    if (node.getAttribute(name) !== text) node.setAttribute(name, text);
}

function favSyncOneBindingRoot0157(root, active) {
    favToggleClass0157(root, 'is-active', active);
    for (const input of root.querySelectorAll?.('input[type="checkbox"],input[type="radio"]') || []) {
        if (input.checked !== active) input.checked = active;
    }
    for (const button of root.querySelectorAll?.('[aria-pressed]') || []) {
        favSetAttribute0157(button, 'aria-pressed', active);
        favToggleClass0157(button, 'is-selected', active);
    }
    /* Strict/Multi use this extra split class for their dark active surface. */
    for (const split of root.querySelectorAll?.('.ebsf-search-split') || []) {
        favToggleClass0157(split, 'ebs-active', active);
    }
}

favSyncBindingControls0120 = function favSyncBindingControls0157(bindingKey) {
    const key = String(bindingKey || '');
    const active = favBindingActive0120(key);
    for (const root of document.querySelectorAll('[data-ebsf-binding]')) {
        if (root.dataset.ebsfBinding === key) favSyncOneBindingRoot0157(root, active);
    }

    /* Category behaves like a radio group and historical callers use the
     * synthetic "category:" key to request a whole-group refresh. */
    if (key.startsWith('category:') || key === 'category:') {
        for (const root of document.querySelectorAll('[data-ebsf-binding^="category:"]')) {
            favSyncOneBindingRoot0157(root, favBindingActive0120(root.dataset.ebsfBinding));
        }
        const allSelected = !String(favCfg.filters?.category || '');
        for (const button of document.querySelectorAll('[data-ebsf-all-categories]')) {
            favToggleClass0157(button, 'is-selected', allSelected);
            favSetAttribute0157(button, 'aria-pressed', allSelected);
        }
    }
};

function favComputedOpenSections0157() {
    const next = new Set(favState.manualOpenSections || []);
    if (favUiPrefs.autoOpenActiveSections === true) {
        for (const drawer of favFilterLayout0120()) {
            if (favDrawerShouldOpen0157(drawer, favCfg, true, false)) next.add(drawer.instanceId);
        }
    }
    return next;
}

/* v2 drawers use generated instance IDs, so compute disclosure from the current
 * layout rather than legacy section-name keys. Turning auto-open off preserves
 * only sections the user manually opened during this session. */
favInitializeOpenSections = function favInitializeOpenSections0157() {
    if (favState.openSectionsInitialized) return favState.openSections;
    favState.openSections = favComputedOpenSections0157();
    favState.openSectionsInitialized = true;
    return favState.openSections;
};

favPrepareOpenSectionsForRail = function favPrepareOpenSectionsForRail0157() {
    favState.openSections = favComputedOpenSections0157();
    favState.openSectionsInitialized = true;
    return favState.openSections;
};

/* Module 85 historically re-added every active drawer during construction,
 * bypassing the preference. Let it build normally, then reassert the final
 * disclosure truth on both state and the newly-created section. */
var favBuildDrawerBefore0157 = favBuildDrawer0120;
favBuildDrawer0120 = function favBuildDrawer0157(drawer) {
    const id = String(drawer?.instanceId || '');
    const manualOpen = Boolean(id && favState.manualOpenSections?.has(id));
    const shouldOpen = favDrawerShouldOpen0157(
        drawer,
        favCfg,
        favUiPrefs.autoOpenActiveSections === true,
        manualOpen,
    );
    if (id) {
        if (shouldOpen) favState.openSections.add(id);
        else favState.openSections.delete(id);
    }

    const section = favBuildDrawerBefore0157(drawer);
    if (!id || !section) return section;

    /* The historical builder may have re-added the drawer before favNativeSection
     * read state. Make the rendered disclosure match the canonical result. */
    if (shouldOpen) favState.openSections.add(id);
    else favState.openSections.delete(id);
    const trigger = section.querySelector?.('.ebsf-native-section-trigger');
    const body = section.querySelector?.('.ebsf-section-body');
    favSetAttribute0157(trigger, 'aria-expanded', shouldOpen);
    favSetAttribute0157(body, 'aria-hidden', !shouldOpen);
    if (body && body.hidden !== !shouldOpen) body.hidden = !shouldOpen;
    return section;
};
