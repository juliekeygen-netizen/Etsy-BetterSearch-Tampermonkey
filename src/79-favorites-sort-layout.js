'use strict';

/* v0.11.0 Favorites sort visibility, layout editor and quick context actions. */

/* ---------- Sort visibility/order ---------- */
function favVisibleSortDefinitions0110() {
    const byKey = new Map(FAV_SORT_DEFINITIONS.map((definition) => [definition.key, definition]));
    const hidden = new Set(favUiPrefs.sortMenuHidden || []);
    const order = favUiPrefs.sortMenuOrder || FAV_SORT_DEFINITIONS.map((entry) => entry.key);
    let definitions = order.map((key) => byKey.get(key)).filter(Boolean).filter((definition) => !hidden.has(definition.key));
    if (!definitions.length && FAV_SORT_DEFINITIONS.length) definitions = [FAV_SORT_DEFINITIONS[0]];
    return definitions;
}

favCreateSort = function favCreateSort0110() {
    const root = document.createElement('div');
    root.className = 'wt-menu wt-menu--use-animation ebsf-sort';
    root.dataset.ebsfSort = '';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'wt-btn wt-btn--transparent wt-menu__trigger wt-btn--small';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span data-ebsf-sort-label></span>${favChevronMarkup()}`;

    const menu = document.createElement('div');
    menu.className = 'wt-menu__body wt-menu__body--pinned ebsf-sort-menu ebsf-sort-menu-096';
    menu.dataset.ebsfSortMenuPortal = '';
    menu.hidden = true;
    const options = document.createElement('div');
    options.className = 'wt-options ebsf-sort-options';
    options.setAttribute('role', 'menu');
    menu.append(options);

    for (const definition of favVisibleSortDefinitions0110()) {
        const row = document.createElement('div');
        row.className = 'ebsf-sort-row';
        row.dataset.sortRow = definition.key;

        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'wt-options__item wt-text-body-small ebsf-sort-choice';
        choice.dataset.sort = definition.key;
        choice.setAttribute('role', 'menuitemradio');
        choice.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            favState.sortRoot = root;
            favState.sortMenu = menu;
            favCfg.sort = definition.key;
            favCfg.sortReversed = false;
            favSaveConfig();
            favState.localPage = 1;
            favUpdateSortUi();
            favCloseSortMenu();
            await favReapply();
        });
        row.append(choice);

        const reverse = document.createElement('button');
        reverse.type = 'button';
        reverse.className = 'ebsf-sort-reverse';
        reverse.dataset.reverseSort = definition.key;
        reverse.setAttribute('aria-label', `Reverse ${definition.normal} sorting`);
        reverse.title = 'Reverse this sort';
        reverse.innerHTML = favReverseSortIconMarkup();
        reverse.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            favState.sortRoot = root;
            favState.sortMenu = menu;
            const alreadyActive = favCfg.sort === definition.key;
            favCfg.sort = definition.key;
            favCfg.sortReversed = alreadyActive ? !favCfg.sortReversed : true;
            favSaveConfig();
            favState.localPage = 1;
            favUpdateSortUi();
            await favReapply();
        });
        row.append(reverse);
        options.append(row);
    }

    root.__ebsfSortMenu = menu;
    document.body.append(menu);
    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        favState.sortRoot = root;
        favState.sortMenu = menu;
        if (menu.hidden) favOpenSortMenu(root);
        else favCloseSortMenu();
    });
    menu.addEventListener('pointerdown', (event) => event.stopPropagation());
    menu.addEventListener('click', (event) => event.stopPropagation());
    root.append(trigger);
    return root;
};

favMeasureSortTrigger = function favMeasureSortTrigger0110(root) {
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    if (!trigger) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext?.('2d');
    if (!context) return;
    context.font = getComputedStyle(trigger).font;
    const labels = favVisibleSortDefinitions0110().flatMap((entry) => [entry.normal, entry.reversed].filter(Boolean));
    const longest = Math.max(...labels.map((label) => context.measureText(label).width), 0);
    const width = Math.ceil(Math.min(330, Math.max(190, longest + 68)));
    root.style.setProperty('--ebsf-sort-trigger-width', `${width}px`);
};

function favEnsureVisibleActiveSort0110() {
    const visible = favVisibleSortDefinitions0110();
    if (visible.some((entry) => entry.key === favCfg.sort)) return false;
    favCfg.sort = visible[0]?.key || 'etsy';
    favCfg.sortReversed = false;
    favSaveConfig();
    return true;
}

function favRebuildSortControl0110() {
    const oldRoot = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    if (!oldRoot?.isConnected) return;
    const oldMenu = oldRoot.__ebsfSortMenu || favState.sortMenu;
    if (oldMenu?.isConnected) oldMenu.remove();
    const next = favCreateSort();
    oldRoot.replaceWith(next);
    favState.sortRoot = next;
    favState.sortMenu = next.__ebsfSortMenu || null;
    favUpdateSortUi();
    requestAnimationFrame(() => favRepairToolbarLayout?.());
}
