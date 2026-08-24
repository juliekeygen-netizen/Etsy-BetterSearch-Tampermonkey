'use strict';

/* Favorites sort + settings polish.
 * Loaded after the base Favorites UI/style modules and before the runtime.
 * Keeps the main implementation small while overriding only behavior that
 * needs a richer portal menu and user preferences.
 */

var FAV_UI_PREFS_STORAGE_KEY = 'etsy-bettersearch.favorites.ui-prefs.v1';
var FAV_AUTO_SYNC_HOURS = [1, 3, 6, 12, 24];

function favNormalizeUiPrefs(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const hours = Number(source.autoSyncIntervalHours);
    return {
        autoOpenActiveSections: source.autoOpenActiveSections !== false,
        autoSyncIntervalHours: FAV_AUTO_SYNC_HOURS.includes(hours) ? hours : 12,
    };
}

var favUiPrefs = favNormalizeUiPrefs(GM_getValue(FAV_UI_PREFS_STORAGE_KEY, {}));

function favSaveUiPrefs() {
    favUiPrefs = favNormalizeUiPrefs(favUiPrefs);
    GM_setValue(FAV_UI_PREFS_STORAGE_KEY, favUiPrefs);
}

/* Allow Etsy's native order to be reversed just like every other sort. */
FAV_SORT_DEFINITIONS = FAV_SORT_DEFINITIONS.map((entry) => entry.key === 'etsy'
    ? { ...entry, reversed:'Etsy order reversed', reversible:true }
    : entry);

var favBaseNormalizeSort = favNormalizeSort;
favNormalizeSort = function favNormalizeSortWithEtsyReverse(source = {}) {
    const normalized = favBaseNormalizeSort(source);
    if (normalized.sort === 'etsy') normalized.sortReversed = source.sortReversed === true;
    return normalized;
};

var favBaseSortRecords = favSortRecords;
favSortRecords = function favSortRecordsWithEtsyReverse(items) {
    if (favCfg.sort !== 'etsy') return favBaseSortRecords(items);
    const direction = favCfg.sortReversed === true ? -1 : 1;
    return items.slice().sort((a, b) => (a.order - b.order) * direction);
};

/* Use the user-selected sync freshness instead of a hard-coded 12 hours. */
var favBaseSyncIsDue = favSyncIsDue;
favSyncIsDue = function favSyncIsDueWithPreference(scopeRecord, now = Date.now(), staleMs) {
    const preferredMs = favUiPrefs.autoSyncIntervalHours * 60 * 60 * 1000;
    return favBaseSyncIsDue(scopeRecord, now, staleMs == null ? preferredMs : staleMs);
};

/* Drawer auto-open is a preference. Manual disclosure stays session-only. */
favInitializeOpenSections = function favInitializeOpenSectionsWithPreference() {
    if (favState.openSectionsInitialized) return favState.openSections;
    favState.openSections = favUiPrefs.autoOpenActiveSections
        ? new Set(favActiveSectionKeys(favCfg))
        : new Set(favState.manualOpenSections || []);
    favState.openSectionsInitialized = true;
    return favState.openSections;
};

favPrepareOpenSectionsForRail = function favPrepareOpenSectionsForRailWithPreference() {
    favInitializeOpenSections();
    favState.openSections = favUiPrefs.autoOpenActiveSections
        ? new Set([...(favState.manualOpenSections || []), ...favActiveSectionKeys(favCfg)])
        : new Set(favState.manualOpenSections || []);
    return favState.openSections;
};

var favBaseOpenFilters = favOpenFilters;
favOpenFilters = function favOpenFiltersWithActivePreference() {
    favPrepareOpenSectionsForRail();
    return favBaseOpenFilters();
};

/* Sort menu: body portal, full-row selection/hover, no redundant checkmark. */
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
    menu.className = 'wt-menu__body wt-menu__body--pinned ebsf-sort-menu';
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
        choice.textContent = definition.normal;
        choice.addEventListener('click', async () => {
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
            event.stopPropagation();
            const wasActive = favCfg.sort === definition.key;
            favCfg.sort = definition.key;
            favCfg.sortReversed = wasActive ? !favCfg.sortReversed : true;
            favSaveConfig();
            favState.localPage = 1;
            favUpdateSortUi();
            await favReapply();
        });
        row.append(reverse);
        options.append(row);
    }

    trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.hidden ? favOpenSortMenu() : favCloseSortMenu();
    });
    root.append(trigger, menu);
    return root;
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
    const width = Math.ceil(Math.min(320, Math.max(190, longest + 68)));
    root.style.setProperty('--ebsf-sort-trigger-width', `${width}px`);
}

function favSortMenuNode() {
    return favState.sortMenu
        || favState.sortRoot?.querySelector('.ebsf-sort-menu')
        || document.querySelector('[data-ebsf-sort-menu-portal]');
}

function favPositionSortMenu() {
    const root = favState.sortRoot;
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    const menu = favSortMenuNode();
    if (!root || !trigger || !menu || menu.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    menu.style.width = `${width}px`;
    menu.style.minWidth = `${width}px`;
    menu.style.maxWidth = `${Math.max(0, innerWidth - 16)}px`;
    const menuHeight = menu.getBoundingClientRect().height;
    let top = rect.bottom + 6;
    if (top + menuHeight > innerHeight - 8 && rect.top - menuHeight - 6 >= 8) top = rect.top - menuHeight - 6;
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
}

function favUpdateSortUi() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    if (!root) return;
    favMeasureSortTrigger(root);
    const label = root.querySelector('[data-ebsf-sort-label]');
    if (label) label.textContent = favSortLabel(favCfg.sort, favCfg.sortReversed);
    const menu = favSortMenuNode();
    const scope = menu || root;
    scope.querySelectorAll?.('[data-sort]').forEach((button) => {
        const selected = button.dataset.sort === favCfg.sort;
        button.setAttribute('aria-checked', String(selected));
        button.textContent = favSortLabel(button.dataset.sort, selected && favCfg.sortReversed);
        button.closest('.ebsf-sort-row')?.classList.toggle('is-selected', selected);
    });
    scope.querySelectorAll?.('[data-reverse-sort]').forEach((button) => {
        const active = button.dataset.reverseSort === favCfg.sort && favCfg.sortReversed;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (menu && !menu.hidden) requestAnimationFrame(favPositionSortMenu);
}

function favOpenSortMenu() {
    const root = favState.sortRoot;
    if (!root) return;
    const menu = root.querySelector('.ebsf-sort-menu') || favSortMenuNode();
    if (!menu) return;
    favState.sortMenu = menu;
    document.body.append(menu);
    menu.hidden = false;
    root.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded', 'true');
    favUpdateSortUi();
    requestAnimationFrame(favPositionSortMenu);
}

function favCloseSortMenu() {
    const root = favState.sortRoot;
    const menu = favSortMenuNode();
    if (menu) {
        menu.hidden = true;
        menu.style.removeProperty('left');
        menu.style.removeProperty('top');
        menu.style.removeProperty('width');
        menu.style.removeProperty('min-width');
        menu.style.removeProperty('max-width');
        if (root?.isConnected) root.append(menu);
        else menu.remove();
    }
    root?.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded', 'false');
}

window.addEventListener('resize', () => {
    if (!favSortMenuNode()?.hidden) favPositionSortMenu();
}, { passive:true });
window.addEventListener('scroll', () => {
    if (!favSortMenuNode()?.hidden) favPositionSortMenu();
}, { capture:true, passive:true });

/* Favorites Settings: separate Data & sync / Preferences pages. */
function favSettingsTabMarkup() {
    return `<div class="ebsf-settings-tabs" role="tablist" aria-label="Favorites settings pages">
        <button type="button" class="ebsf-settings-tab is-active" role="tab" aria-selected="true" data-ebsf-settings-tab="data">Data &amp; sync</button>
        <button type="button" class="ebsf-settings-tab" role="tab" aria-selected="false" data-ebsf-settings-tab="preferences">Preferences</button>
    </div>`;
}

function favAutoSyncIntervalOptions() {
    return FAV_AUTO_SYNC_HOURS.map((hours) => `<option value="${hours}"${favUiPrefs.autoSyncIntervalHours === hours ? ' selected' : ''}>${hours === 1 ? 'Every hour' : `Every ${hours} hours`}</option>`).join('');
}

function favOpenSettingsModal(event) {
    if (favState.settingsModal) return;
    const layer = document.createElement('div');
    layer.className = 'ebs-modal-layer ebsf-settings-layer';
    layer.innerHTML = `<section class="ebs-modal ebsf-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-settings-title">
        <header class="ebs-modal-header">
            <div><div class="ebsf-settings-kicker">BETTERSEARCH</div><h2 class="ebs-modal-title" id="ebsf-settings-title">FAVORITES SETTINGS</h2></div>
            <button type="button" class="ebsf-modal-close" data-ebsf-settings-close aria-label="Close settings">×</button>
        </header>
        ${favSettingsTabMarkup()}
        <div class="ebs-modal-editor ebsf-settings-editor">
            <div class="ebsf-settings-body">
                <div class="ebsf-settings-panel" data-ebsf-settings-panel="data">
                    <section class="ebsf-settings-card">
                        <div class="ebsf-settings-heading"><h3>Favorites data</h3><p>Fast local data collected from Etsy Favorites, cards, and supported Favorites endpoints.</p></div>
                        <dl class="ebsf-settings-summary">
                            <div><dt>Favorites</dt><dd data-ebsf-status="active">…</dd></div>
                            <div><dt>Shops</dt><dd data-ebsf-status="shops">…</dd></div>
                            <div><dt>Sync state</dt><dd data-ebsf-status="sync">${favSettingsSyncLabel()}</dd></div>
                            <div><dt>Last full sync</dt><dd data-ebsf-status="last">…</dd></div>
                        </dl>
                    </section>
                    <section class="ebsf-settings-card">
                        <div class="ebsf-settings-heading"><h3>Sync &amp; updates</h3><p>Refresh Favorites data and authoritative All Items membership without opening listing pages.</p></div>
                        <div class="ebsf-settings-control ebsf-settings-control-main">
                            <div><strong>Synchronize now</strong><small>Refresh cheap Favorites metadata now.</small></div>
                            <div class="ebsf-settings-actions"><button type="button" class="ebs-button is-primary" data-ebsf-sync-now>Sync favorites now</button><button type="button" class="ebs-button is-quiet" data-ebsf-sync-cancel hidden>Cancel sync</button></div>
                        </div>
                        <p class="ebsf-settings-error" data-ebsf-sync-error hidden></p>
                        <label class="ebsf-settings-toggle ebsf-settings-rowline"><span><strong>Auto-sync favorites</strong><small>Automatically refresh stale Favorites data when you visit Favorites.</small></span><input type="checkbox" data-ebsf-auto-sync ${favCfg.autoSync ? 'checked' : ''}></label>
                        <label class="ebsf-settings-select-row"><span><strong>Auto-sync interval</strong><small>How old the last complete sync may be before BetterSearch refreshes it.</small></span><select data-ebsf-auto-sync-interval ${favCfg.autoSync ? '' : 'disabled'}>${favAutoSyncIntervalOptions()}</select></label>
                    </section>
                    <section class="ebsf-settings-card ebsf-deep-section">
                        <div class="ebsf-settings-heading"><h3>Deep listing metadata</h3><p>Future listing-page scanning for metadata Etsy does not expose through Favorites data.</p></div>
                        <dl class="ebsf-deep-status">
                            <div><dt>Status</dt><dd>Not enabled</dd></div>
                            <div><dt>Metadata coverage</dt><dd data-ebsf-status="coverage">—</dd></div>
                            <div><dt>Last deep update</dt><dd>Never</dd></div>
                        </dl>
                        <div class="ebsf-deep-actions">
                            <button type="button" class="ebs-button is-quiet" disabled title="Available in a future deep-scanner phase">Scan missing metadata</button>
                            <button type="button" class="ebs-button is-quiet" disabled title="Available in a future deep-scanner phase">Update all metadata</button>
                        </div>
                    </section>
                </div>
                <div class="ebsf-settings-panel" data-ebsf-settings-panel="preferences" hidden>
                    <section class="ebsf-settings-card">
                        <div class="ebsf-settings-heading"><h3>Filter behavior</h3><p>Control how the Favorites filter rail behaves when it is shown.</p></div>
                        <label class="ebsf-settings-toggle ebsf-settings-rowline"><span><strong>Auto-open active filter sections</strong><small>When you show Filters, automatically expand every section containing a changed or enabled filter.</small></span><input type="checkbox" data-ebsf-auto-open-active ${favUiPrefs.autoOpenActiveSections ? 'checked' : ''}></label>
                    </section>
                </div>
            </div>
        </div>
        <footer class="ebs-modal-footer"><button type="button" class="ebs-button is-primary" data-ebsf-settings-done>Done</button></footer>
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

    layer.querySelectorAll('[data-ebsf-settings-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.ebsfSettingsTab)));
    layer.querySelectorAll('[data-ebsf-settings-close],[data-ebsf-settings-done]').forEach((button) => button.addEventListener('click', favCloseSettingsModal));
    layer.addEventListener('pointerdown', (pointerEvent) => { if (pointerEvent.target === layer) favCloseSettingsModal(); });
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
    layer.querySelector('[data-ebsf-sync-now]').addEventListener('click', () => void favSyncScope(favSyncAllItemsScope(), { independent:true }));
    layer.querySelector('[data-ebsf-sync-cancel]').addEventListener('click', () => favCancelSync('settings'));

    favUpdateSettingsSyncState();
    void favRefreshSettingsStatus();
    requestAnimationFrame(() => layer.querySelector('[data-ebsf-settings-close]')?.focus({ preventScroll:true }));
}

GM_addStyle(`
  .ebsf-sort{z-index:1000}
  .ebsf-sort-menu{position:fixed!important;z-index:2147483000!important;right:auto!important;bottom:auto!important;min-width:0!important;overflow:hidden;border-radius:10px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18)}
  .ebsf-sort-options{padding:0!important}
  .ebsf-sort-row{display:grid!important;grid-template-columns:minmax(0,1fr) 38px!important;align-items:stretch!important;min-height:42px;background:#fff;transition:background .08s ease}
  .ebsf-sort-row:hover,.ebsf-sort-row:focus-within,.ebsf-sort-row.is-selected{background:#ece9e5!important}
  .ebsf-sort-choice{display:flex!important;align-items:center!important;width:100%!important;min-width:0!important;height:100%!important;margin:0!important;padding:10px 8px 10px 14px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#222!important;text-align:left!important;box-shadow:none!important;cursor:pointer}
  .ebsf-sort-choice:hover,.ebsf-sort-choice:focus,.ebsf-sort-choice:active,.ebsf-sort-choice[aria-checked="true"]{background:transparent!important}
  .ebsf-sort-choice::before,.ebsf-sort-choice::after,.ebsf-sort-row .wt-options__item--selected::before,.ebsf-sort-row .wt-options__item--selected::after{display:none!important;content:none!important}
  .ebsf-sort-reverse{align-self:stretch!important;width:38px!important;height:auto!important;margin:0!important;border-radius:0!important;background:transparent!important;color:#555}
  .ebsf-sort-reverse:hover,.ebsf-sort-reverse.is-active{background:transparent!important;color:#111}
  .ebsf-sort-reverse:focus-visible{outline:2px solid #222;outline-offset:-4px}

  .ebsf-settings-tabs{display:flex;gap:4px;padding:0 22px;border-bottom:1px solid #dedede;background:#fff}
  .ebsf-settings-tab{appearance:none;position:relative;padding:13px 12px 11px;border:0;background:transparent;color:#666;font:600 12px/1.2 Arial,sans-serif;cursor:pointer}
  .ebsf-settings-tab.is-active{color:#222}
  .ebsf-settings-tab.is-active::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:2px;background:#222}
  .ebsf-settings-editor{min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain!important}
  .ebsf-settings-body{gap:0!important}
  .ebsf-settings-panel{display:grid;gap:14px}
  .ebsf-settings-panel[hidden]{display:none!important}
  .ebsf-settings-card{display:grid;gap:14px;padding:16px;border:1px solid #dedede;border-radius:14px;background:#fafaf8}
  .ebsf-settings-card .ebsf-settings-summary>div,.ebsf-settings-card .ebsf-deep-status>div{background:#fff}
  .ebsf-settings-card+.ebsf-settings-card{margin-top:0!important;padding-top:16px!important;border-top:1px solid #dedede!important}
  .ebsf-settings-control-main{background:#fff}
  .ebsf-settings-rowline{padding:12px 2px 0!important;border-top:1px solid #e5e5e1}
  .ebsf-settings-select-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,190px);gap:18px;align-items:center;padding:12px 2px 0;border-top:1px solid #e5e5e1}
  .ebsf-settings-select-row>span{display:grid;gap:3px}
  .ebsf-settings-select-row strong{font-size:12px}
  .ebsf-settings-select-row small{color:#666;line-height:1.45}
  .ebsf-settings-select-row select{width:100%;min-height:36px;padding:0 10px;border:1px solid #999;border-radius:8px;background:#fff;color:#222}
  .ebsf-deep-section{padding:16px!important;border:1px solid #dedede!important;background:#fafaf8!important}
  .ebsf-deep-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding-top:2px}
  .ebsf-deep-actions .ebs-button{width:100%;justify-content:center}
  @media(max-width:620px){
    .ebsf-settings-tabs{padding-inline:10px}
    .ebsf-settings-select-row{grid-template-columns:1fr;gap:8px}
    .ebsf-deep-actions{grid-template-columns:1fr}
  }
`);
