'use strict';

/* v0.11.0 Favorites filter layout application and dynamic catalogue visibility. */

function favApplyOptionOrder0110(sectionKey, units) {
    const order = favUiPrefs.filterOptionOrder?.[sectionKey] || favDefaultOptionOrder0110(sectionKey);
    const orderIndex = new Map(order.map((key, index) => [key, index]));
    const byParent = new Map();
    for (const unit of units) {
        if (!unit.parent) continue;
        if (!byParent.has(unit.parent)) byParent.set(unit.parent, []);
        byParent.get(unit.parent).push(unit);
    }
    for (const [parent, group] of byParent) {
        group.sort((a, b) => (orderIndex.get(a.key) ?? 999) - (orderIndex.get(b.key) ?? 999));
        for (const unit of group) for (const element of unit.elements) parent.append(element);
    }
}

function favApplyFilterLayoutAndAvailability0110(rail = favState.rail) {
    if (!rail?.isConnected && rail !== favState.rail) return rail;
    const mode = favAvailabilityMode0110();
    const records = favAvailabilityRecords0110();
    const caps = favAvailabilityCaps0110(records);
    const hiddenSections = new Set(favUiPrefs.filterSectionHidden || []);
    const sectionOrder = favUiPrefs.filterSectionOrder || FAV_FILTER_SECTION_ORDER_DEFAULT0110;
    const sections = new Map(Array.from(rail.querySelectorAll('[data-ebsf-section]')).map((node) => [node.dataset.ebsfSection, node]));

    const header = rail.querySelector('.ebsf-rail-header');
    if (header) {
        const ordered = sectionOrder.map((key) => sections.get(key)).filter(Boolean);
        for (const [key, node] of sections) if (!FAV_FILTER_SECTION_KEYS0110.has(key)) ordered.push(node);
        header.after(...ordered);
    }

    for (const [sectionKey, section] of sections) {
        section.hidden = false;
        if (hiddenSections.has(sectionKey)) {
            section.hidden = true;
            continue;
        }

        const units = favOptionUnits0110(sectionKey, section);
        favApplyOptionOrder0110(sectionKey, units);
        const userHidden = new Set(favUiPrefs.filterOptionHidden?.[sectionKey] || []);
        let visibleUnits = 0;
        for (const unit of units) {
            const hardHidden = unit.key === 'has-video';
            const unavailable = mode !== 'disabled' && !favOptionAvailable0110(sectionKey, unit.key, caps, records);
            const hidden = hardHidden || userHidden.has(unit.key) || unavailable;
            for (const element of unit.elements) element.hidden = hidden;
            if (!hidden) visibleUnits += 1;
        }

        if (units.length && visibleUnits === 0) section.hidden = true;
        if (sectionKey === 'category') {
            const all = section.querySelector('.ebsf-native-link:not([data-ebsf-option-key])');
            if (all) all.hidden = false;
        }
    }
    return rail;
}

/* Replace the destructive v0.10.1 pruner. Hiding rather than removing nodes is
 * important for the dynamic "current filtered items" mode: controls can return
 * instantly as the result set changes without rebuilding the entire rail. */
favPruneUnavailableCatalogueFilters0101 = function favPruneUnavailableCatalogueFilters0110(rail) {
    return favApplyFilterLayoutAndAvailability0110(rail);
};

function favVisibleCategoryDefinitions0110() {
    const order = favUiPrefs.filterOptionOrder?.category || favDefaultOptionOrder0110('category');
    const hidden = new Set(favUiPrefs.filterOptionHidden?.category || []);
    const byKey = new Map(FAV_NATIVE_CATEGORIES_.map((entry) => [entry[0], entry]));
    let definitions = order.map((key) => byKey.get(key)).filter(Boolean).filter(([key]) => !hidden.has(key));
    const mode = favAvailabilityMode0110();
    if (mode !== 'disabled' && favDeepVisibilityReady0110()) {
        const records = favAvailabilityRecords0110();
        const active = String(favCfg.filters.category || '');
        definitions = definitions.filter(([key]) => key === active || records.some((record) => favCategoryMatch(record.deepMetadata?.category, key)));
    }
    return definitions;
}

favBuildCategory = function favBuildCategory0110() {
    const active = String(favCfg.filters.category || '');
    const definitions = favVisibleCategoryDefinitions0110();
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-group ebsf-category-list';

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'ebsf-native-link';
    all.textContent = 'All categories';
    all.classList.toggle('is-selected', !active);
    all.addEventListener('click', () => {
        favCfg.filters.category = '';
        favSaveAndApply(true);
        favReplaceSectionBody('category', favBuildCategory);
    });
    wrap.append(all);

    const shown = favState.categoryExpanded ? definitions : definitions.slice(0, 5);
    for (const [value, label] of shown) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ebsf-native-link';
        button.dataset.ebsfOptionKey = value;
        button.textContent = label;
        button.classList.toggle('is-selected', active === value);
        button.addEventListener('click', () => {
            favCfg.filters.category = value;
            favSaveAndApply(true);
            favReplaceSectionBody('category', favBuildCategory);
        });
        wrap.append(button);
    }

    if (definitions.length > 5) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'ebsf-native-show-more';
        more.textContent = favState.categoryExpanded ? 'Show less' : 'Show more';
        more.addEventListener('click', () => {
            favState.categoryExpanded = !favState.categoryExpanded;
            favReplaceSectionBody('category', favBuildCategory);
        });
        wrap.append(more);
    }
    return wrap;
};

favBuildShipTo = function favBuildShipTo0110() {
    const filters = favCfg.filters;
    const selected = String(filters.shipTo || 'ZZ').toUpperCase();
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-group';
    let options = favCountryOptions(true);
    if (favAvailabilityMode0110() !== 'disabled' && favDeepVisibilityReady0110()) {
        const allowed = favCatalogueShipToCodes0101(favAvailabilityRecords0110());
        options = favFilterCountryOptions0101(options, allowed, selected);
    }
    wrap.append(favSelect(selected, options, (value) => {
        filters.shipTo = value === 'ZZ' ? '' : value;
        favSaveAndApply(true);
    }));
    return wrap;
};

/* Refresh dynamic availability after filter changes without forcing a rail
 * rebuild. This preserves open drawers, focus and the native-feeling animation. */
var favSaveAndApplyBefore0110 = favSaveAndApply;
favSaveAndApply = function favSaveAndApply0110(reapply = true) {
    const result = favSaveAndApplyBefore0110(reapply);
    Promise.resolve(result).finally(() => {
        if (favState.filterOpen && favState.rail) requestAnimationFrame(() => favApplyFilterLayoutAndAvailability0110(favState.rail));
    });
    return result;
};

var favReapplyBefore0110 = favReapply;
favReapply = async function favReapply0110(...args) {
    const result = await favReapplyBefore0110(...args);
    if (favState.filterOpen && favState.rail) requestAnimationFrame(() => favApplyFilterLayoutAndAvailability0110(favState.rail));
    return result;
};
