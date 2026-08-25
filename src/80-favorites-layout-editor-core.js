'use strict';

/* v0.11.0 Favorites filter/sort layout editor core. */

/* ---------- Layout editor ---------- */

favState.layoutModal = null;
favState.layoutContextMenu = null;
favState.layoutDrag = null;

function favCloseLayoutContext0110() {
    favState.layoutContextMenu?.remove();
    favState.layoutContextMenu = null;
}

function favMoveKey0110(list, key, beforeKey) {
    const out = list.filter((value) => value !== key);
    const index = beforeKey ? out.indexOf(beforeKey) : -1;
    if (index >= 0) out.splice(index, 0, key);
    else out.push(key);
    return out;
}

function favSetSectionHidden0110(sectionKey, hidden) {
    const set = new Set(favUiPrefs.filterSectionHidden || []);
    if (hidden) set.add(sectionKey); else set.delete(sectionKey);
    favUiPrefs.filterSectionHidden = Array.from(set);
    favSaveUiPrefs();
    if (favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
}

function favSetOptionHidden0110(sectionKey, optionKey, hidden) {
    const current = favUiPrefs.filterOptionHidden || {};
    const set = new Set(current[sectionKey] || []);
    if (hidden) set.add(optionKey); else set.delete(optionKey);
    favUiPrefs.filterOptionHidden = { ...current, [sectionKey]:Array.from(set) };
    favSaveUiPrefs();
    if (favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
}

function favSetSortHidden0110(sortKey, hidden) {
    const set = new Set(favUiPrefs.sortMenuHidden || []);
    if (hidden) set.add(sortKey); else set.delete(sortKey);
    const defaults = FAV_SORT_DEFINITIONS.map((entry) => entry.key);
    favUiPrefs.sortMenuHidden = favHiddenValid0110(Array.from(set), defaults, true);
    favSaveUiPrefs();
    const changed = favEnsureVisibleActiveSort0110();
    favRebuildSortControl0110();
    if (changed) void favReapply();
}

function favLayoutRow0110({ key, label, checked, level = 0, expandable = false, open = false, kind, parentKey = '' }) {
    const row = document.createElement('div');
    row.className = `ebsf-layout-row${level ? ' is-child' : ''}`;
    row.dataset.layoutKey = key;
    row.dataset.layoutKind = kind;
    if (parentKey) row.dataset.layoutParent = parentKey;
    row.draggable = true;

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = checked;
    check.className = 'ebsf-layout-check';
    check.setAttribute('aria-label', `${checked ? 'Hide' : 'Show'} ${label}`);

    const drag = document.createElement('span');
    drag.className = 'ebsf-layout-drag';
    drag.setAttribute('aria-hidden', 'true');
    drag.textContent = '⋮⋮';

    const text = document.createElement('button');
    text.type = 'button';
    text.className = 'ebsf-layout-label';
    text.textContent = label;
    if (!expandable) text.disabled = true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ebsf-layout-disclosure';
    toggle.hidden = !expandable;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = favChevronMarkup();

    const move = document.createElement('span');
    move.className = 'ebsf-layout-move-buttons';
    move.innerHTML = '<button type="button" data-layout-up aria-label="Move up">↑</button><button type="button" data-layout-down aria-label="Move down">↓</button>';
    row.append(check, drag, text, toggle, move);
    return row;
}

function favBuildFilterLayoutPanel0110(container) {
    const expanded = new Set(favState.layoutExpandedSections || []);
    const sectionHidden = new Set(favUiPrefs.filterSectionHidden || []);
    const sectionOrder = favUiPrefs.filterSectionOrder || FAV_FILTER_SECTION_ORDER_DEFAULT0110;
    const byKey = new Map(FAV_FILTER_LAYOUT0110.map((entry) => [entry.key, entry]));

    for (const sectionKey of sectionOrder) {
        const definition = byKey.get(sectionKey);
        if (!definition) continue;
        const group = document.createElement('div');
        group.className = 'ebsf-layout-group';
        group.dataset.layoutGroup = sectionKey;
        const isOpen = expanded.has(sectionKey);
        const root = favLayoutRow0110({ key:sectionKey, label:definition.label, checked:!sectionHidden.has(sectionKey), expandable:definition.options.length > 0, open:isOpen, kind:'section' });
        group.append(root);

        const children = document.createElement('div');
        children.className = 'ebsf-layout-children';
        children.hidden = !isOpen;
        children.dataset.layoutChildren = sectionKey;
        const optionHidden = new Set(favUiPrefs.filterOptionHidden?.[sectionKey] || []);
        const optionOrder = favUiPrefs.filterOptionOrder?.[sectionKey] || definition.options.map(([key]) => key);
        const optionMap = new Map(definition.options);
        for (const optionKey of optionOrder) {
            const label = optionMap.get(optionKey);
            if (!label) continue;
            children.append(favLayoutRow0110({ key:optionKey, label, checked:!optionHidden.has(optionKey), level:1, kind:'option', parentKey:sectionKey }));
        }
        group.append(children);
        container.append(group);
    }
}

function favBuildSortLayoutPanel0110(container) {
    const hidden = new Set(favUiPrefs.sortMenuHidden || []);
    const byKey = new Map(FAV_SORT_DEFINITIONS.map((entry) => [entry.key, entry]));
    for (const sortKey of favUiPrefs.sortMenuOrder || FAV_SORT_DEFINITIONS.map((entry) => entry.key)) {
        const definition = byKey.get(sortKey);
        if (!definition) continue;
        container.append(favLayoutRow0110({ key:sortKey, label:definition.normal, checked:!hidden.has(sortKey), kind:'sort' }));
    }
}

function favRenderLayoutEditor0110(activeTab = 'filters') {
    const layer = favState.layoutModal;
    if (!layer) return;
    layer.querySelectorAll('[data-ebsf-layout-tab]').forEach((button) => {
        const active = button.dataset.ebsfLayoutTab === activeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    const list = layer.querySelector('[data-ebsf-layout-list]');
    list.replaceChildren();
    if (activeTab === 'sort') favBuildSortLayoutPanel0110(list);
    else favBuildFilterLayoutPanel0110(list);
    layer.dataset.activeTab = activeTab;
    const filterActions = layer.querySelector('[data-ebsf-filter-layout-actions]');
    const sortActions = layer.querySelector('[data-ebsf-sort-layout-actions]');
    if (filterActions) filterActions.hidden = activeTab !== 'filters';
    if (sortActions) sortActions.hidden = activeTab !== 'sort';
}

function favCloseLayoutEditor0110() {
    const layer = favState.layoutModal;
    if (!layer) return;
    const parentSettingsOpen = Boolean(favState.settingsModal?.isConnected);
    layer.remove();
    favState.layoutModal = null;
    favState.layoutDrag = null;
    if (!parentSettingsOpen) unlockPageScroll();
}

function favLayoutMoveSibling0110(row, direction) {
    const kind = row.dataset.layoutKind;
    const key = row.dataset.layoutKey;
    if (kind === 'section') {
        const list = favUiPrefs.filterSectionOrder.slice();
        const index = list.indexOf(key);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        favUiPrefs.filterSectionOrder = list;
    } else if (kind === 'option') {
        const parentKey = row.dataset.layoutParent;
        const list = (favUiPrefs.filterOptionOrder[parentKey] || favDefaultOptionOrder0110(parentKey)).slice();
        const index = list.indexOf(key);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        favUiPrefs.filterOptionOrder = { ...favUiPrefs.filterOptionOrder, [parentKey]:list };
    } else if (kind === 'sort') {
        const list = favUiPrefs.sortMenuOrder.slice();
        const index = list.indexOf(key);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        favUiPrefs.sortMenuOrder = list;
    }
    favSaveUiPrefs();
    favAfterLayoutChange0110(kind);
    favRenderLayoutEditor0110(favState.layoutModal?.dataset.activeTab || 'filters');
}

function favAfterLayoutChange0110(kind) {
    if (kind === 'sort') {
        favEnsureVisibleActiveSort0110();
        favRebuildSortControl0110();
        return;
    }
    if (favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
}
