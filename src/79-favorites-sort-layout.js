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

/* v0.15.26 behavior gate: body-level Sort portals must have an explicit root
 * owner. Etsy can replace the toolbar root without going through
 * favRebuildSortControl0110(); before this fence the detached root's portal
 * stayed under document.body and later Sort openings only hid/tagged it as an
 * orphan. Repeated soft-route/root replacement could therefore accumulate
 * hidden portal DOM for the lifetime of the document.
 *
 * Keep this beside module 79, the final Sort-control creator, rather than
 * introducing another route/lifecycle observer. Pruning happens at the natural
 * Sort lifecycle boundaries (create/open/close/rebuild), and only portals whose
 * owner is detached or already declared orphaned are disposed. */
function favSortPortalOwner01526(menu) {
    if (!menu) return null;
    if (menu.__ebsfSortRoot01526) return menu.__ebsfSortRoot01526;
    return Array.from(document.querySelectorAll('[data-ebsf-sort]'))
        .find((root) => root?.__ebsfSortMenu === menu) || null;
}

function favBindSortPortal01526(root, menu) {
    if (!root || !menu) return menu || null;
    root.__ebsfSortMenu = menu;
    menu.__ebsfSortRoot01526 = root;
    menu.removeAttribute?.('data-ebsf-orphaned');
    return menu;
}

function favDisposeSortPortal01526(menu) {
    if (!menu) return false;
    const owner = favSortPortalOwner01526(menu);
    const ownerConnected = owner?.isConnected === true;

    menu.remove?.();

    if (!ownerConnected) {
        if (owner?.__ebsfSortMenu === menu) owner.__ebsfSortMenu = null;
        if (menu.__ebsfSortRoot01526 === owner) menu.__ebsfSortRoot01526 = null;
        if (favState.sortRoot === owner) favState.sortRoot = null;
    }
    if (favState.sortMenu === menu) favState.sortMenu = null;
    return true;
}

function favPruneSortPortals01526(keepMenu = null) {
    for (const portal of Array.from(document.querySelectorAll('[data-ebsf-sort-menu-portal]'))) {
        if (!portal || portal === keepMenu) continue;
        const owner = favSortPortalOwner01526(portal);
        const orphaned = portal.dataset?.ebsfOrphaned === '1';
        if (orphaned || owner?.isConnected !== true) favDisposeSortPortal01526(portal);
    }
    return keepMenu;
}

function favScheduleSortPortalPrune01526(keepMenu = null) {
    requestAnimationFrame(() => favPruneSortPortals01526(keepMenu));
}

favCreateSort = function favCreateSort0110() {
    /* Dispose portals whose old toolbar/root is already gone before adding the
     * new controller. A second prune is scheduled because explicit rebuilds
     * create the next root immediately before replaceWith() disconnects the old
     * one in the same task. */
    favPruneSortPortals01526();

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

    favBindSortPortal01526(root, menu);
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
    favScheduleSortPortalPrune01526(menu);
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
    if (oldMenu?.isConnected) favDisposeSortPortal01526(oldMenu);
    const next = favCreateSort();
    oldRoot.replaceWith(next);
    favState.sortRoot = next;
    favState.sortMenu = next.__ebsfSortMenu || null;
    favPruneSortPortals01526(favState.sortMenu);
    favUpdateSortUi();
    requestAnimationFrame(() => favRepairToolbarLayout?.());
}

/* Module 69 remains the positioning/visibility owner. Add lifetime fencing
 * around its final open/close behavior rather than reimplementing that menu
 * logic here. */
var favOpenSortMenuBefore01526 = favOpenSortMenu;
favOpenSortMenu = function favOpenSortMenu01526(root = favState.sortRoot) {
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (root && menu) favBindSortPortal01526(root, menu);
    favPruneSortPortals01526(menu);
    const result = favOpenSortMenuBefore01526(root);
    favScheduleSortPortalPrune01526(menu);
    return result;
};

var favCloseSortMenuBefore01526 = favCloseSortMenu;
favCloseSortMenu = function favCloseSortMenu01526() {
    const root = favState.sortRoot;
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    const result = favCloseSortMenuBefore01526();
    if (menu && root?.isConnected !== true) favDisposeSortPortal01526(menu);
    else favScheduleSortPortalPrune01526(menu || null);
    return result;
};

/* Cover a pre-existing Sort control in case an earlier runtime path mounted it
 * before this module finished installing. This is idempotent and does not create
 * any observer or timer of its own. */
{
    const existingRoot = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    const existingMenu = existingRoot?.__ebsfSortMenu || favState.sortMenu;
    if (existingRoot && existingMenu) favBindSortPortal01526(existingRoot, existingMenu);
    favPruneSortPortals01526(existingMenu || null);
}
