'use strict';

/* v0.15.7 final Favorites state-semantics boundary.
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
 *
 * v0.15.11 extends this final semantics layer to Favorites counts. Current,
 * query-aligned Etsy page evidence is distinct from BetterSearch's committed
 * dataset/cache size, and an authoritative Etsy zero is distinct from unknown.
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

/* ------------------------------------------------------------------------- *
 * v0.15.11 count authority
 * ------------------------------------------------------------------------- */

function favNormalizeCountQuery01511(value) {
    if (typeof normalize === 'function') return normalize(value);
    return String(value || '').trim().toLowerCase();
}

/* favProps() deliberately derives totalListings from weaker fallbacks for older
 * Etsy payloads. Count authority must know whether Etsy actually supplied a
 * total/count field, so inspect the current props payload without synthesizing a
 * total from the first page's listings array. */
function favRawCountProps01511(root = document) {
    for (const script of root?.querySelectorAll?.('script[type="text/props"]') || []) {
        const text = script.textContent || '';
        if (!text.includes('"profileOwnerUserId"')) continue;
        try {
            const data = JSON.parse(text);
            if (!data || !data.profileOwnerUserId) continue;
            return data;
        } catch (_) {}
    }
    return null;
}

function favEtsyCountEvidence01511(scope = typeof favCatalogCurrentDescriptor0141 === 'function' ? favCatalogCurrentDescriptor0141() : null, root = document) {
    if (!scope) return { known:false, value:0, source:'unknown', authoritative:false };
    if (typeof favCatalogIsCurrent0141 === 'function' && !favCatalogIsCurrent0141(scope)) {
        return { known:false, value:0, source:'unknown', authoritative:false };
    }

    const props = favRawCountProps01511(root);
    if (!props) return { known:false, value:0, source:'unknown', authoritative:false };
    const liveQuery = String(props.query || '').trim();
    if (favNormalizeCountQuery01511(scope.query) !== favNormalizeCountQuery01511(liveQuery)) {
        return { known:false, value:0, source:'query-mismatch', authoritative:false };
    }

    for (const field of ['totalListings', 'itemCount']) {
        if (!Object.prototype.hasOwnProperty.call(props, field)) continue;
        const value = Number(props[field]);
        if (!Number.isFinite(value) || value < 0) continue;
        return {
            known:true,
            value:Math.max(0, Math.trunc(value)),
            source:`etsy-props.${field}`,
            authoritative:true,
        };
    }
    return { known:false, value:0, source:'unknown', authoritative:false };
}

function favDatasetCountEvidence01511() {
    const currentKey = typeof favDatasetKey === 'function' ? favDatasetKey() : '';
    const loadKey = String(favState.loadKey || '');
    const total = Number(favState.total);
    if (favState.loadComplete === true && (!currentKey || loadKey === currentKey) && Number.isFinite(total) && total >= 0) {
        return {
            known:true,
            value:Math.max(0, Math.trunc(total)),
            source:favState.loadSource0137 === 'cache' ? 'committed-cache' : 'bettersearch-dataset',
            authoritative:false,
        };
    }
    const records = Array.isArray(favState.records) ? favState.records : [];
    return { known:true, value:records.length, source:'records', authoritative:false };
}

favScopeCounts0120 = function favScopeCounts01511() {
    const scope = typeof favCatalogCurrentDescriptor0141 === 'function'
        ? favCatalogCurrentDescriptor0141()
        : null;
    const etsy = favEtsyCountEvidence01511(scope);
    const fallback = favDatasetCountEvidence01511();
    const evidence = etsy.known ? etsy : fallback;
    const total = evidence.value;
    const shown = favEnhancementActive() && Array.isArray(favState.filtered)
        ? favState.filtered.length
        : total;
    favState.scopeCountAuthority01511 = {
        total,
        source:evidence.source,
        authoritative:evidence.authoritative === true,
        etsyKnown:etsy.known === true,
    };
    return {
        total,
        shown,
        totalSource:evidence.source,
        totalAuthoritative:evidence.authoritative === true,
    };
};

/* Keep the crawler's historical numeric API for compatibility, but preserve a
 * separate known bit. In particular, current Etsy total=0 is a real value and
 * must not collapse into the old "unknown == 0" sentinel. */
favCatalogExpectedTotal0141 = function favCatalogExpectedTotal01511(scope) {
    const evidence = favEtsyCountEvidence01511(scope);
    return evidence.known ? evidence.value : 0;
};

var favCatalogPublishBefore01511 = favCatalogPublish0141;
favCatalogPublish0141 = function favCatalogPublish01511(scope, patch = {}) {
    const next = { ...patch };
    if (Object.prototype.hasOwnProperty.call(next, 'expectedTotal')) {
        const evidence = favEtsyCountEvidence01511(scope);
        const expected = Number(next.expectedTotal);
        next.expectedTotalKnown = Boolean(
            evidence.known
            && Number.isFinite(expected)
            && Math.max(0, Math.trunc(expected)) === evidence.value
        );
        if (next.expectedTotalKnown) next.expectedTotalSource = evidence.source;
    }
    return favCatalogPublishBefore01511(scope, next);
};

favCatalogProgressText0141 = function favCatalogProgressText01511(state) {
    const processed = Math.max(0, Number(state?.processed) || 0);
    const expected = Math.max(0, Number(state?.expectedTotal) || 0);
    if (state?.expectedTotalKnown === true) {
        return `Loading favorites… ${Math.min(processed, expected)} / ${expected}`;
    }
    return `Loading favorites… ${processed} loaded`;
};

/* v0.15.6's snapshot validator historically checked expectedTotal > 0 because
 * zero also meant "unknown". The final writer can now enforce known zero before
 * delegating to the existing immutable/atomic snapshot writer. Positive known
 * totals continue to be checked by that existing boundary as well. */
var favIndexObserveRecordsNowBefore01511 = favIndexObserveRecordsNow;
favIndexObserveRecordsNow = async function favIndexObserveRecordsNow01511(records, options = {}) {
    if (options.complete === true) {
        const scope = options.scope || (typeof favIndexCurrentScope === 'function' ? favIndexCurrentScope() : null);
        const key = scope && typeof favCatalogKey0141 === 'function' ? favCatalogKey0141(scope) : '';
        const state = key && typeof favCatalogStates0141 !== 'undefined' ? favCatalogStates0141.get(key) : null;
        if (state?.expectedTotalKnown === true) {
            const expected = Math.max(0, Number(state.expectedTotal) || 0);
            const observedIds = new Set(
                Array.from(records || [], (record) => String(record?.id || record?.listingId || '')).filter(Boolean)
            );
            if (observedIds.size !== expected) {
                throw new Error(`Favorites complete snapshot count mismatch (${observedIds.size} crawled, ${expected} expected).`);
            }
        }
    }
    return favIndexObserveRecordsNowBefore01511(records, options);
};
