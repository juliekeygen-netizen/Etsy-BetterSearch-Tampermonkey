'use strict';

/* v0.11.0 Favorites layout editor interactions and context menu. */

function favOpenLayoutEditor0110(tab = 'filters') {
    favCloseLayoutContext0110();
    if (favState.layoutModal) {
        favRenderLayoutEditor0110(tab);
        return;
    }
    const layer = document.createElement('div');
    layer.className = 'ebs-modal-layer ebsf-layout-layer';
    layer.innerHTML = `<section class="ebs-modal ebsf-layout-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-layout-title">
        <header class="ebs-modal-header">
            <div><div class="ebsf-settings-kicker">BETTERSEARCH</div><h2 class="ebs-modal-title" id="ebsf-layout-title">CUSTOMIZE FAVORITES CONTROLS</h2></div>
            <button type="button" class="ebsf-modal-close" data-ebsf-layout-close aria-label="Close layout editor">×</button>
        </header>
        <div class="ebsf-settings-tabs" role="tablist" aria-label="Layout editor pages">
            <button type="button" class="ebsf-settings-tab" data-ebsf-layout-tab="filters" role="tab">Filter catalogue</button>
            <button type="button" class="ebsf-settings-tab" data-ebsf-layout-tab="sort" role="tab">Sort menu</button>
        </div>
        <div class="ebsf-layout-body" data-ebsf-layout-list></div>
        <div class="ebsf-layout-actions" data-ebsf-filter-layout-actions>
            <button type="button" class="ebs-button is-quiet" data-ebsf-reset-sections>Reset sections</button>
            <button type="button" class="ebs-button is-quiet" data-ebsf-reset-options>Reset options</button>
        </div>
        <div class="ebsf-layout-actions" data-ebsf-sort-layout-actions hidden>
            <button type="button" class="ebs-button is-quiet" data-ebsf-reset-sort>Reset sort menu</button>
        </div>
        <footer class="ebs-modal-footer"><button type="button" class="ebs-button is-primary" data-ebsf-layout-done>Done</button></footer>
    </section>`;
    document.body.append(layer);
    favState.layoutModal = layer;
    favState.layoutExpandedSections = favState.layoutExpandedSections || new Set();
    if (!favState.settingsModal?.isConnected) lockPageScroll();

    layer.querySelectorAll('[data-ebsf-layout-close],[data-ebsf-layout-done]').forEach((button) => button.addEventListener('click', favCloseLayoutEditor0110));
    layer.querySelectorAll('[data-ebsf-layout-tab]').forEach((button) => button.addEventListener('click', () => favRenderLayoutEditor0110(button.dataset.ebsfLayoutTab)));
    layer.addEventListener('pointerdown', (event) => { if (event.target === layer) favCloseLayoutEditor0110(); });
    layer.addEventListener('keydown', (event) => favTrapModalFocus(event, layer));

    layer.addEventListener('click', (event) => {
        const row = event.target.closest('.ebsf-layout-row');
        if (!row) return;
        if (event.target.matches('[data-layout-up]')) { favLayoutMoveSibling0110(row, -1); return; }
        if (event.target.matches('[data-layout-down]')) { favLayoutMoveSibling0110(row, 1); return; }
        const checkbox = event.target.closest('.ebsf-layout-check');
        if (checkbox) {
            const hidden = !checkbox.checked;
            if (row.dataset.layoutKind === 'section') favSetSectionHidden0110(row.dataset.layoutKey, hidden);
            else if (row.dataset.layoutKind === 'option') favSetOptionHidden0110(row.dataset.layoutParent, row.dataset.layoutKey, hidden);
            else favSetSortHidden0110(row.dataset.layoutKey, hidden);
            /* Normalization guarantees at least one sort remains visible.
             * Re-render so a last-visible sort checkbox cannot look disabled
             * when it was automatically kept on. */
            favRenderLayoutEditor0110(layer.dataset.activeTab || 'filters');
            return;
        }
        if (row.dataset.layoutKind === 'section' && (event.target.closest('.ebsf-layout-label') || event.target.closest('.ebsf-layout-disclosure'))) {
            const key = row.dataset.layoutKey;
            const expanded = favState.layoutExpandedSections;
            if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
            favRenderLayoutEditor0110(layer.dataset.activeTab || 'filters');
        }
    });

    layer.addEventListener('dragstart', (event) => {
        const row = event.target.closest('.ebsf-layout-row');
        if (!row) return;
        favState.layoutDrag = { kind:row.dataset.layoutKind, key:row.dataset.layoutKey, parent:row.dataset.layoutParent || '' };
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', row.dataset.layoutKey); } catch (_) {}
        row.classList.add('is-dragging');
    });
    layer.addEventListener('dragend', (event) => {
        event.target.closest('.ebsf-layout-row')?.classList.remove('is-dragging');
        favState.layoutDrag = null;
        layer.querySelectorAll('.is-drag-over').forEach((node) => node.classList.remove('is-drag-over'));
    });
    layer.addEventListener('dragover', (event) => {
        const target = event.target.closest('.ebsf-layout-row');
        const drag = favState.layoutDrag;
        if (!target || !drag) return;
        if (target.dataset.layoutKind !== drag.kind) return;
        if (drag.kind === 'option' && target.dataset.layoutParent !== drag.parent) return;
        event.preventDefault();
        target.classList.add('is-drag-over');
    });
    layer.addEventListener('dragleave', (event) => event.target.closest('.ebsf-layout-row')?.classList.remove('is-drag-over'));
    layer.addEventListener('drop', (event) => {
        const target = event.target.closest('.ebsf-layout-row');
        const drag = favState.layoutDrag;
        if (!target || !drag || target.dataset.layoutKind !== drag.kind) return;
        if (drag.kind === 'option' && target.dataset.layoutParent !== drag.parent) return;
        event.preventDefault();
        const beforeKey = target.dataset.layoutKey;
        if (beforeKey === drag.key) return;
        if (drag.kind === 'section') favUiPrefs.filterSectionOrder = favMoveKey0110(favUiPrefs.filterSectionOrder, drag.key, beforeKey);
        else if (drag.kind === 'option') {
            const current = favUiPrefs.filterOptionOrder[drag.parent] || favDefaultOptionOrder0110(drag.parent);
            favUiPrefs.filterOptionOrder = { ...favUiPrefs.filterOptionOrder, [drag.parent]:favMoveKey0110(current, drag.key, beforeKey) };
        } else favUiPrefs.sortMenuOrder = favMoveKey0110(favUiPrefs.sortMenuOrder, drag.key, beforeKey);
        favSaveUiPrefs();
        favAfterLayoutChange0110(drag.kind);
        favRenderLayoutEditor0110(layer.dataset.activeTab || 'filters');
    });

    layer.querySelector('[data-ebsf-reset-sections]').addEventListener('click', () => {
        favUiPrefs.filterSectionOrder = FAV_FILTER_SECTION_ORDER_DEFAULT0110.slice();
        favUiPrefs.filterSectionHidden = [];
        favSaveUiPrefs();
        favAfterLayoutChange0110('section');
        favRenderLayoutEditor0110('filters');
    });
    layer.querySelector('[data-ebsf-reset-options]').addEventListener('click', () => {
        favUiPrefs.filterOptionOrder = favNormalizeOptionOrders0110({});
        favUiPrefs.filterOptionHidden = favNormalizeOptionHidden0110({});
        favSaveUiPrefs();
        favAfterLayoutChange0110('option');
        favRenderLayoutEditor0110('filters');
    });
    layer.querySelector('[data-ebsf-reset-sort]').addEventListener('click', () => {
        favUiPrefs.sortMenuOrder = FAV_SORT_DEFINITIONS.map((entry) => entry.key);
        favUiPrefs.sortMenuHidden = [];
        favSaveUiPrefs();
        favEnsureVisibleActiveSort0110();
        favRebuildSortControl0110();
        favRenderLayoutEditor0110('sort');
    });

    favRenderLayoutEditor0110(tab);
    requestAnimationFrame(() => layer.querySelector('[data-ebsf-layout-close]')?.focus({ preventScroll:true }));
}

function favOpenLayoutContext0110(event, target) {
    favCloseLayoutContext0110();
    const menu = document.createElement('div');
    menu.className = 'ebsf-layout-context';
    menu.setAttribute('role', 'menu');
    const { type, sectionKey, optionKey, sortKey } = target;
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.setAttribute('role', 'menuitem');
    hide.textContent = 'Hide';
    hide.addEventListener('click', () => {
        if (type === 'section') favSetSectionHidden0110(sectionKey, true);
        else if (type === 'option') favSetOptionHidden0110(sectionKey, optionKey, true);
        else if (type === 'sort') favSetSortHidden0110(sortKey, true);
        favCloseLayoutContext0110();
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.setAttribute('role', 'menuitem');
    edit.textContent = type === 'sort' ? 'Edit sort menu…' : 'Edit filter layout…';
    edit.addEventListener('click', () => favOpenLayoutEditor0110(type === 'sort' ? 'sort' : 'filters'));
    menu.append(hide, edit);
    document.body.append(menu);
    favState.layoutContextMenu = menu;
    const width = 190;
    menu.style.left = `${Math.min(innerWidth - width - 8, Math.max(8, event.clientX))}px`;
    menu.style.top = `${Math.min(innerHeight - 90, Math.max(8, event.clientY))}px`;
}

document.addEventListener('contextmenu', (event) => {
    const sortRow = event.target.closest?.('.ebsf-sort-row[data-sort-row]');
    if (sortRow) {
        event.preventDefault();
        favOpenLayoutContext0110(event, { type:'sort', sortKey:sortRow.dataset.sortRow });
        return;
    }
    const section = event.target.closest?.('[data-ebsf-section]');
    if (!section) return;
    const option = event.target.closest?.('[data-ebsf-option-key]');
    event.preventDefault();
    if (option) favOpenLayoutContext0110(event, { type:'option', sectionKey:section.dataset.ebsfSection, optionKey:option.dataset.ebsfOptionKey });
    else favOpenLayoutContext0110(event, { type:'section', sectionKey:section.dataset.ebsfSection });
});

document.addEventListener('pointerdown', (event) => {
    if (!favState.layoutContextMenu) return;
    if (favState.layoutContextMenu.contains(event.target)) return;
    favCloseLayoutContext0110();
}, true);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') favCloseLayoutContext0110();
});
