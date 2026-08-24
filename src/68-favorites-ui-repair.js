'use strict';

/* v0.9.6 Favorites UI repair.
 *
 * This module is intentionally loaded after the v0.9.5 sort/settings polish
 * and before the Favorites runtime. It fixes three regressions without
 * disturbing the data/index engine:
 *  - the native Favorites search keeps its original width while our controls
 *    occupy space to its left;
 *  - the sort menu owns a stable body-level portal and always opens from the
 *    trigger that was actually clicked;
 *  - Favorites Settings uses one consistent card language and a taller dialog.
 */

/* ---------- Toolbar geometry ---------- */

function favRepairToolbarLayout() {
    const anchor = favSearchAnchor();
    if (!anchor) return;

    const searchSlot = anchor.searchSlot;
    const row = searchSlot.closest?.('[data-ebsf-toolbar-row]');
    const controls = row?.querySelector?.(':scope > [data-ebsf-search-left-controls]');
    const parent = row?.parentElement;
    if (!row || !controls || !parent) return;

    /* Clear stale values before measuring the native search allocation. */
    row.classList.remove('ebsf-toolbar-preserve-search', 'ebsf-toolbar-compact');
    row.style.removeProperty('margin-left');
    row.style.removeProperty('width');
    row.style.removeProperty('max-width');
    searchSlot.style.removeProperty('flex');
    searchSlot.style.removeProperty('width');
    searchSlot.style.removeProperty('max-width');

    const parentRect = parent.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const nativeWidth = Math.max(0, Math.round(parentRect.width));
    const controlsWidth = Math.max(0, Math.ceil(controlsRect.width));
    const gap = 8;

    if (!nativeWidth || !controlsWidth) return;

    /* On ordinary desktop layouts there is room to the left of Etsy's native
     * search allocation. Extend into that room so the search itself does not
     * surrender any width at all. Its right edge stays exactly where Etsy put it.
     */
    const leftRoom = Math.max(0, parentRect.left - 12);
    const preserveNativeWidth = innerWidth >= 900 && leftRoom >= controlsWidth + gap;

    if (preserveNativeWidth) {
        row.classList.add('ebsf-toolbar-preserve-search');
        row.style.setProperty('width', `${nativeWidth + controlsWidth + gap}px`, 'important');
        row.style.setProperty('max-width', 'none', 'important');
        row.style.setProperty('margin-left', `${-(controlsWidth + gap)}px`, 'important');
        searchSlot.style.setProperty('flex', `0 0 ${nativeWidth}px`, 'important');
        searchSlot.style.setProperty('width', `${nativeWidth}px`, 'important');
        searchSlot.style.setProperty('max-width', `${nativeWidth}px`, 'important');
        return;
    }

    /* Narrow/tablet fallback: keep every control reachable on one row where
     * possible and allow only the native search field to become narrower.
     */
    row.classList.add('ebsf-toolbar-compact');
    row.style.setProperty('width', '100%', 'important');
    row.style.setProperty('max-width', '100%', 'important');
    searchSlot.style.setProperty('flex', '1 1 120px', 'important');
    searchSlot.style.setProperty('width', 'auto', 'important');
    searchSlot.style.setProperty('max-width', '100%', 'important');
}

var favEnsureToolbarBefore096Repair = favEnsureToolbar;
favEnsureToolbar = function favEnsureToolbar096Repair() {
    const result = favEnsureToolbarBefore096Repair();
    requestAnimationFrame(() => {
        favRepairToolbarLayout();
        favUpdateSortUi();
    });
    return result;
};

window.addEventListener('resize', () => requestAnimationFrame(favRepairToolbarLayout), { passive:true });

/* ---------- Sort menu ---------- */

function favCreateSort() {
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

    for (const definition of FAV_SORT_DEFINITIONS) {
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
}

function favSortMenuNode() {
    return favState.sortRoot?.__ebsfSortMenu
        || favState.sortMenu
        || document.querySelector('[data-ebsf-sort-menu-portal]:not([data-ebsf-orphaned])');
}

function favMeasureSortTrigger(root) {
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    if (!trigger) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext?.('2d');
    if (!context) return;
    context.font = getComputedStyle(trigger).font;

    const labels = FAV_SORT_DEFINITIONS.flatMap((entry) => [entry.normal, entry.reversed].filter(Boolean));
    const longest = Math.max(...labels.map((label) => context.measureText(label).width), 0);
    const width = Math.ceil(Math.min(330, Math.max(190, longest + 68)));
    root.style.setProperty('--ebsf-sort-trigger-width', `${width}px`);
}

function favPositionSortMenu(root = favState.sortRoot) {
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!root || !trigger || !menu || menu.hidden) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    menu.style.setProperty('width', `${width}px`, 'important');
    menu.style.setProperty('min-width', `${width}px`, 'important');
    menu.style.setProperty('max-width', `${Math.max(0, innerWidth - 16)}px`, 'important');

    const height = menu.getBoundingClientRect().height;
    let top = rect.bottom + 6;
    if (top + height > innerHeight - 8 && rect.top - height - 6 >= 8) {
        top = rect.top - height - 6;
    }
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

function favUpdateSortUi() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    if (!root) return;

    favState.sortRoot = root;
    const menu = root.__ebsfSortMenu || favState.sortMenu;
    if (menu) favState.sortMenu = menu;

    favMeasureSortTrigger(root);
    const label = root.querySelector('[data-ebsf-sort-label]');
    if (label) label.textContent = favSortLabel(favCfg.sort, favCfg.sortReversed);

    (menu || root).querySelectorAll?.('[data-sort]').forEach((button) => {
        const selected = button.dataset.sort === favCfg.sort;
        button.setAttribute('aria-checked', String(selected));
        button.textContent = favSortLabel(button.dataset.sort, selected && favCfg.sortReversed);
        button.closest('.ebsf-sort-row')?.classList.toggle('is-selected', selected);
    });

    (menu || root).querySelectorAll?.('[data-reverse-sort]').forEach((button) => {
        const active = button.dataset.reverseSort === favCfg.sort && favCfg.sortReversed;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    if (menu && !menu.hidden) requestAnimationFrame(() => favPositionSortMenu(root));
    requestAnimationFrame(favRepairToolbarLayout);
}

function favOpenSortMenu(root = favState.sortRoot) {
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!root || !menu) return;

    favState.sortRoot = root;
    favState.sortMenu = menu;

    document.querySelectorAll('[data-ebsf-sort-menu-portal]').forEach((other) => {
        if (other !== menu) {
            other.hidden = true;
            other.dataset.ebsfOrphaned = '1';
        }
    });

    menu.hidden = false;
    const trigger = root.querySelector('[aria-haspopup="menu"]');
    trigger?.setAttribute('aria-expanded', 'true');
    favUpdateSortUi();
    requestAnimationFrame(() => favPositionSortMenu(root));
}

function favCloseSortMenu() {
    const root = favState.sortRoot;
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (menu) {
        menu.hidden = true;
        menu.style.removeProperty('left');
        menu.style.removeProperty('top');
        menu.style.removeProperty('width');
        menu.style.removeProperty('min-width');
        menu.style.removeProperty('max-width');
    }
    root?.querySelector('[aria-haspopup="menu"]')?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('pointerdown', (event) => {
    const root = favState.sortRoot;
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!menu || menu.hidden) return;
    if (root?.contains(event.target) || menu.contains(event.target)) return;
    favCloseSortMenu();
}, true);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !favSortMenuNode()?.hidden) favCloseSortMenu();
});

window.addEventListener('scroll', () => {
    const menu = favSortMenuNode();
    if (menu && !menu.hidden) favPositionSortMenu();
}, { capture:true, passive:true });

/* ---------- Favorites Settings ---------- */

async function favRefreshSettingsStatus() {
    const layer = favState.settingsModal;
    if (!layer) return;

    try {
        const stats = await favIndexGetStats(favScope().owner);
        if (favState.settingsModal !== layer) return;

        const propsTotal = Math.max(0, Number(favProps()?.totalListings) || 0);
        const scopeTotal = Math.max(0, Number(stats.allItemsScope?.listingIds?.length) || 0);
        const favoriteTotal = Math.max(propsTotal, scopeTotal, Number(stats.activeFavorites) || 0);
        const favoriteKnown = Math.min(favoriteTotal || Number(stats.activeFavorites) || 0, Number(stats.activeFavorites) || 0);
        const shopKnown = Math.max(0, Number(stats.indexedShops) || 0);
        const shopTotal = shopKnown;

        const values = {
            last: favSettingsTime(stats.lastFullSyncAt),
            favoritesCoverage: `${favoriteKnown} / ${favoriteTotal || '—'} & ${shopKnown} / ${shopTotal || '—'}`,
            deepCoverage: `— / ${favoriteTotal || stats.activeFavorites || '—'}`,
        };

        for (const [key, value] of Object.entries(values)) {
            const node = layer.querySelector(`[data-ebsf-status="${key}"]`);
            if (node) node.textContent = String(value);
        }
    } catch (_) {
        for (const key of ['last', 'favoritesCoverage', 'deepCoverage']) {
            const node = layer.querySelector(`[data-ebsf-status="${key}"]`);
            if (node) node.textContent = 'Unavailable';
        }
    }
}

function favOpenSettingsModal(event) {
    if (favState.settingsModal) return;

    const layer = document.createElement('div');
    layer.className = 'ebs-modal-layer ebsf-settings-layer';
    layer.innerHTML = `<section class="ebs-modal ebsf-settings-modal ebsf-settings-modal-096" role="dialog" aria-modal="true" aria-labelledby="ebsf-settings-title">
        <header class="ebs-modal-header">
            <div>
                <div class="ebsf-settings-kicker">BETTERSEARCH</div>
                <h2 class="ebs-modal-title" id="ebsf-settings-title">FAVORITES SETTINGS</h2>
            </div>
            <button type="button" class="ebsf-modal-close" data-ebsf-settings-close aria-label="Close settings">×</button>
        </header>

        ${favSettingsTabMarkup()}

        <div class="ebs-modal-editor ebsf-settings-editor">
            <div class="ebsf-settings-body">
                <div class="ebsf-settings-panel" data-ebsf-settings-panel="data">
                    <section class="ebsf-settings-card ebsf-data-card">
                        <div class="ebsf-settings-heading">
                            <h3>Favorites data</h3>
                            <p>Fast Favorites and shop data collected without opening individual listing pages.</p>
                        </div>
                        <dl class="ebsf-deep-status">
                            <div><dt>Status</dt><dd data-ebsf-status="sync">${favSettingsSyncLabel()}</dd></div>
                            <div><dt>Favorites &amp; shops coverage</dt><dd data-ebsf-status="favoritesCoverage">…</dd></div>
                            <div><dt>Last favorites sync</dt><dd data-ebsf-status="last">…</dd></div>
                        </dl>
                        <div class="ebsf-deep-actions ebsf-single-action">
                            <button type="button" class="ebs-button is-quiet" data-ebsf-sync-now>Sync favorites now</button>
                            <button type="button" class="ebs-button is-quiet" data-ebsf-sync-cancel hidden>Cancel sync</button>
                        </div>
                        <p class="ebsf-settings-error" data-ebsf-sync-error hidden></p>
                    </section>

                    <section class="ebsf-settings-card ebsf-deep-section">
                        <div class="ebsf-settings-heading">
                            <h3>Deep listing metadata</h3>
                            <p>Listing-page scanning for metadata Etsy does not expose through Favorites data.</p>
                        </div>
                        <dl class="ebsf-deep-status">
                            <div><dt>Status</dt><dd>Not enabled</dd></div>
                            <div><dt>Metadata coverage</dt><dd data-ebsf-status="deepCoverage">—</dd></div>
                            <div><dt>Last deep update</dt><dd>Never</dd></div>
                        </dl>
                        <div class="ebsf-deep-actions">
                            <button type="button" class="ebs-button is-quiet" disabled title="Available in a future deep-scanner phase">Scan missing metadata</button>
                            <button type="button" class="ebs-button is-quiet" disabled title="Available in a future deep-scanner phase">Update all metadata</button>
                        </div>
                    </section>

                    <section class="ebsf-settings-card ebsf-auto-sync-card">
                        <div class="ebsf-settings-heading">
                            <h3>Automatic sync</h3>
                            <p>Keep Favorites data fresh automatically when you visit your Favorites.</p>
                        </div>
                        <label class="ebsf-settings-toggle">
                            <span>
                                <strong>Auto-sync favorites</strong>
                                <small>Refresh Favorites data automatically when the last complete sync is old enough.</small>
                            </span>
                            <input type="checkbox" data-ebsf-auto-sync ${favCfg.autoSync ? 'checked' : ''}>
                        </label>
                        <label class="ebsf-settings-select-row">
                            <span>
                                <strong>Auto-sync interval</strong>
                                <small>Choose how old the last complete sync may be before BetterSearch refreshes it.</small>
                            </span>
                            <select data-ebsf-auto-sync-interval ${favCfg.autoSync ? '' : 'disabled'}>${favAutoSyncIntervalOptions()}</select>
                        </label>
                    </section>
                </div>

                <div class="ebsf-settings-panel" data-ebsf-settings-panel="preferences" hidden>
                    <section class="ebsf-settings-card">
                        <div class="ebsf-settings-heading">
                            <h3>Filter behavior</h3>
                            <p>Control how the Favorites filter rail behaves when it is shown.</p>
                        </div>
                        <label class="ebsf-settings-toggle">
                            <span>
                                <strong>Auto-open active filter sections</strong>
                                <small>When you show Filters, expand sections containing a changed or enabled filter.</small>
                            </span>
                            <input type="checkbox" data-ebsf-auto-open-active ${favUiPrefs.autoOpenActiveSections ? 'checked' : ''}>
                        </label>
                    </section>
                </div>
            </div>
        </div>

        <footer class="ebs-modal-footer">
            <button type="button" class="ebs-button is-primary" data-ebsf-settings-done>Done</button>
        </footer>
    </section>`;

    document.body.append(layer);
    favState.settingsModal = layer;
    favState.settingsReturnFocus = event?.currentTarget || document.querySelector('[data-ebsf-settings]');
    favState.settingsReturnFocus?.setAttribute('aria-expanded', 'true');
    lockPageScroll();

    const selectTab = (name) => {
        layer.querySelectorAll('[data-ebsf-settings-tab]').forEach((button) => {
            const active = button.dataset.ebsfSettingsTab === name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        layer.querySelectorAll('[data-ebsf-settings-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.ebsfSettingsPanel !== name;
        });
        layer.querySelector('.ebsf-settings-editor').scrollTop = 0;
    };

    layer.querySelectorAll('[data-ebsf-settings-tab]').forEach((button) => {
        button.addEventListener('click', () => selectTab(button.dataset.ebsfSettingsTab));
    });
    layer.querySelectorAll('[data-ebsf-settings-close],[data-ebsf-settings-done]').forEach((button) => {
        button.addEventListener('click', favCloseSettingsModal);
    });
    layer.addEventListener('pointerdown', (pointerEvent) => {
        if (pointerEvent.target === layer) favCloseSettingsModal();
    });
    layer.addEventListener('keydown', (keyEvent) => favTrapModalFocus(keyEvent, layer));

    const autoSync = layer.querySelector('[data-ebsf-auto-sync]');
    const interval = layer.querySelector('[data-ebsf-auto-sync-interval]');

    autoSync.addEventListener('change', () => {
        favCfg.autoSync = autoSync.checked;
        favSaveConfig();
        interval.disabled = !favCfg.autoSync;
        if (favCfg.autoSync) void favMaybeAutoSync(true);
    });

    interval.addEventListener('change', () => {
        favUiPrefs.autoSyncIntervalHours = Number(interval.value);
        favSaveUiPrefs();
        if (favCfg.autoSync) void favMaybeAutoSync(true);
    });

    layer.querySelector('[data-ebsf-auto-open-active]').addEventListener('change', (changeEvent) => {
        favUiPrefs.autoOpenActiveSections = changeEvent.target.checked;
        favSaveUiPrefs();
    });

    layer.querySelector('[data-ebsf-sync-now]').addEventListener('click', () => {
        void favSyncScope(favSyncAllItemsScope(), { independent:true });
    });
    layer.querySelector('[data-ebsf-sync-cancel]').addEventListener('click', () => favCancelSync('settings'));

    favUpdateSettingsSyncState();
    void favRefreshSettingsStatus();
    requestAnimationFrame(() => layer.querySelector('[data-ebsf-settings-close]')?.focus({ preventScroll:true }));
}

GM_addStyle(`
  /* Keep the native search allocation intact on desktop. */
  .ebsf-toolbar-row.ebsf-toolbar-preserve-search{
    overflow:visible!important;
    flex-wrap:nowrap!important;
  }
  .ebsf-toolbar-row.ebsf-toolbar-preserve-search .ebsf-native-search-slot{
    min-width:0!important;
  }

  /* Narrow fallback: only the native search is allowed to surrender width. */
  .ebsf-toolbar-row.ebsf-toolbar-compact{
    overflow:visible!important;
    flex-wrap:nowrap!important;
  }
  .ebsf-toolbar-row.ebsf-toolbar-compact .ebsf-search-left-controls{
    flex:0 0 auto!important;
  }
  @media (max-width:760px){
    .ebsf-toolbar-row.ebsf-toolbar-compact{gap:6px!important}
    .ebsf-toolbar-row.ebsf-toolbar-compact .ebsf-search-left-controls{gap:6px!important}
    .ebsf-toolbar-row.ebsf-toolbar-compact .ebsf-filter-button{padding-inline:10px!important}
  }

  /* The menu is a body-level portal: never clipped by Etsy card/header stacks. */
  .ebsf-sort-menu-096{
    position:fixed!important;
    z-index:2147483646!important;
    right:auto!important;
    bottom:auto!important;
    overflow:hidden!important;
    padding:0!important;
    border-radius:10px!important;
    background:#fff!important;
    box-shadow:0 6px 24px rgba(0,0,0,.22)!important;
  }
  .ebsf-sort-menu-096[hidden]{display:none!important}
  .ebsf-sort-menu-096 .ebsf-sort-row{
    display:grid!important;
    grid-template-columns:minmax(0,1fr) 40px!important;
    align-items:stretch!important;
    min-height:42px!important;
    background:#fff!important;
  }
  .ebsf-sort-menu-096 .ebsf-sort-row:hover,
  .ebsf-sort-menu-096 .ebsf-sort-row:focus-within,
  .ebsf-sort-menu-096 .ebsf-sort-row.is-selected{
    background:#ece9e5!important;
  }
  .ebsf-sort-menu-096 .ebsf-sort-choice{
    display:flex!important;
    align-items:center!important;
    width:100%!important;
    height:100%!important;
    min-width:0!important;
    margin:0!important;
    padding:10px 8px 10px 14px!important;
    border:0!important;
    border-radius:0!important;
    background:transparent!important;
    color:#222!important;
    text-align:left!important;
    box-shadow:none!important;
    cursor:pointer!important;
  }
  .ebsf-sort-menu-096 .ebsf-sort-choice::before,
  .ebsf-sort-menu-096 .ebsf-sort-choice::after{
    display:none!important;
    content:none!important;
  }
  .ebsf-sort-menu-096 .ebsf-sort-reverse{
    align-self:stretch!important;
    width:40px!important;
    height:auto!important;
    margin:0!important;
    border:0!important;
    border-radius:0!important;
    background:transparent!important;
  }
  .ebsf-sort-menu-096 .ebsf-sort-reverse:hover,
  .ebsf-sort-menu-096 .ebsf-sort-reverse.is-active{
    background:transparent!important;
    color:#111!important;
  }

  /* Taller settings window and one consistent card language. */
  .ebsf-settings-modal-096{
    width:min(660px,calc(100vw - 24px))!important;
    height:min(900px,calc(100vh - 28px))!important;
    max-height:calc(100vh - 28px)!important;
  }
  .ebsf-settings-modal-096 .ebsf-settings-editor{
    flex:1 1 auto!important;
    min-height:0!important;
    overflow-y:auto!important;
  }
  .ebsf-settings-modal-096 .ebsf-settings-body{
    padding:18px 22px 22px!important;
  }
  .ebsf-settings-modal-096 .ebsf-settings-panel{
    gap:14px!important;
  }
  .ebsf-settings-modal-096 .ebsf-settings-card{
    display:grid!important;
    gap:14px!important;
    padding:16px!important;
    border:1px solid #dedede!important;
    border-radius:14px!important;
    background:#fafaf8!important;
  }
  .ebsf-settings-modal-096 .ebsf-deep-status{
    grid-template-columns:repeat(3,minmax(0,1fr))!important;
  }
  .ebsf-settings-modal-096 .ebsf-deep-status>div{
    min-width:0!important;
    background:#fff!important;
  }
  .ebsf-settings-modal-096 .ebsf-deep-status dd{
    overflow-wrap:anywhere;
  }
  .ebsf-settings-modal-096 .ebsf-single-action{
    grid-template-columns:1fr!important;
  }
  .ebsf-settings-modal-096 .ebsf-single-action .ebs-button{
    width:100%!important;
    justify-content:center!important;
  }
  .ebsf-settings-modal-096 .ebsf-auto-sync-card .ebsf-settings-toggle{
    padding:2px 0 12px!important;
    border-bottom:1px solid #e5e5e1;
  }
  .ebsf-settings-modal-096 .ebsf-auto-sync-card .ebsf-settings-select-row{
    padding-top:0!important;
    border-top:0!important;
  }

  @media(max-width:620px){
    .ebsf-settings-modal-096{
      width:calc(100vw - 12px)!important;
      height:calc(100vh - 12px)!important;
      max-height:calc(100vh - 12px)!important;
    }
    .ebsf-settings-modal-096 .ebsf-deep-status{
      grid-template-columns:1fr!important;
    }
  }
`);
