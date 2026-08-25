'use strict';

/* v0.11.0 Favorites layout preferences/settings integration and styles. */

/* ---------- Preferences UI ---------- */

var favOpenSettingsModalBefore0110 = favOpenSettingsModal;
favOpenSettingsModal = function favOpenSettingsModal0110(event) {
    favOpenSettingsModalBefore0110(event);
    const layer = favState.settingsModal;
    const panel = layer?.querySelector?.('[data-ebsf-settings-panel="preferences"]');
    const card = panel?.querySelector?.('.ebsf-settings-card');
    if (!card) return;

    const legacy = card.querySelector('[data-ebsf-hide-unavailable]')?.closest('label');
    const availability = document.createElement('label');
    availability.className = 'ebsf-settings-select-row ebsf-availability-mode-row';
    availability.innerHTML = `<span><strong>Hide unavailable catalogue filters</strong><small>Choose whether availability is based on the full current Favorites scope or only the items remaining after your active filters.</small></span>
        <select data-ebsf-filter-availability-mode>
            <option value="disabled">Disabled</option>
            <option value="catalogue">Current catalogue</option>
            <option value="filtered">Current filtered items</option>
        </select>`;
    availability.querySelector('select').value = favAvailabilityMode0110();
    if (legacy) legacy.replaceWith(availability); else card.append(availability);

    const layoutRow = document.createElement('div');
    layoutRow.className = 'ebsf-settings-control ebsf-settings-layout-launch';
    layoutRow.innerHTML = `<div><strong>Filter &amp; sort layout</strong><small>Choose which filter sections, filter options, and sort modes are shown, then drag them into your preferred order.</small></div><button type="button" class="ebs-button is-quiet" data-ebsf-open-layout-editor>Customize…</button>`;
    card.append(layoutRow);

    availability.querySelector('select').addEventListener('change', (changeEvent) => {
        favUiPrefs.filterAvailabilityMode = changeEvent.target.value;
        favUiPrefs.hideUnavailableCatalogFilters = changeEvent.target.value !== 'disabled';
        favSaveUiPrefs();
        if (favState.filterOpen && favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
        if (changeEvent.target.value !== 'disabled') {
            void favLoadAll(false).then(() => favEnsureExtraInfo()).finally(() => {
                if (favState.filterOpen && favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
            });
        }
    });
    layoutRow.querySelector('[data-ebsf-open-layout-editor]').addEventListener('click', () => favOpenLayoutEditor0110('filters'));
};

/* The runtime creates the first Favorites toolbar before this late patch loads,
 * so its Settings button still owns the old function object. Capture the click
 * and route it to the final settings implementation. Future toolbar instances
 * work through the same path, avoiding duplicate handlers. */
document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-ebsf-settings]');
    if (!button || !isFavoritesPage()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    favOpenSettingsModal({ currentTarget:button });
}, true);

/* ---------- Initial live DOM upgrade ---------- */
if (isFavoritesPage()) {
    favEnsureVisibleActiveSort0110();
    requestAnimationFrame(() => {
        favRebuildSortControl0110();
        if (favState.filterOpen && favState.rail) favApplyFilterLayoutAndAvailability0110(favState.rail);
    });
}

GM_addStyle(`
  .ebsf-layout-layer{z-index:2147483600!important}
  .ebsf-layout-modal{width:min(720px,calc(100vw - 28px))!important;max-height:min(88vh,860px)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
  .ebsf-layout-body{min-height:0;overflow:auto;padding:14px 18px;overscroll-behavior:contain;background:#fff}
  .ebsf-layout-group{border-bottom:1px solid #ecebe8}
  .ebsf-layout-row{display:grid;grid-template-columns:22px 24px minmax(0,1fr) 28px auto;align-items:center;gap:8px;min-height:46px;padding:7px 4px;border-radius:9px;user-select:none;background:#fff}
  .ebsf-layout-row.is-child{min-height:40px;margin-left:26px;color:#444}
  .ebsf-layout-row:hover{background:#f7f6f4}
  .ebsf-layout-row.is-dragging{opacity:.45}
  .ebsf-layout-row.is-drag-over{box-shadow:inset 0 2px 0 #222}
  .ebsf-layout-check{width:16px;height:16px;margin:0;accent-color:#222;cursor:pointer}
  .ebsf-layout-drag{font:700 15px/1 monospace;letter-spacing:-5px;color:#888;cursor:grab;transform:rotate(90deg)}
  .ebsf-layout-label{min-width:0;padding:0;border:0;background:transparent!important;text-align:left;color:#222;font:600 13px/1.3 Arial,sans-serif;cursor:pointer}
  .ebsf-layout-row.is-child .ebsf-layout-label{font-weight:400;font-size:12.5px}
  .ebsf-layout-label:disabled{opacity:1;cursor:default}
  .ebsf-layout-disclosure{width:28px;height:28px;padding:5px;border:0;border-radius:50%;background:transparent;color:#555;cursor:pointer}
  .ebsf-layout-disclosure[aria-expanded="true"] .ebsf-chevron{transform:rotate(180deg)}
  .ebsf-layout-move-buttons{display:flex;gap:2px}
  .ebsf-layout-move-buttons button{width:26px;height:26px;border:0;border-radius:7px;background:transparent;color:#666;cursor:pointer}
  .ebsf-layout-move-buttons button:hover{background:#ece9e5;color:#111}
  .ebsf-layout-children[hidden]{display:none!important}
  .ebsf-layout-actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid #dedede;background:#fafaf8}
  .ebsf-layout-actions[hidden]{display:none!important}
  .ebsf-settings-layout-launch{margin-top:2px;padding-top:14px!important;border-top:1px solid #e5e5e1}
  .ebsf-settings-layout-launch>div{display:grid;gap:3px}
  .ebsf-settings-layout-launch small{color:#666;line-height:1.45}
  .ebsf-layout-context{position:fixed;z-index:2147483640;width:190px;padding:6px;border:1px solid #d6d3cf;border-radius:10px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.2)}
  .ebsf-layout-context button{display:block;width:100%;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:#222;text-align:left;font:400 12.5px/1.3 Arial,sans-serif;cursor:pointer}
  .ebsf-layout-context button:hover{background:#ece9e5}
  @media(max-width:620px){
    .ebsf-layout-modal{width:calc(100vw - 12px)!important;max-height:94vh!important}
    .ebsf-layout-body{padding-inline:10px}
    .ebsf-layout-row{grid-template-columns:20px 20px minmax(0,1fr) 28px auto;gap:6px}
    .ebsf-layout-row.is-child{margin-left:14px}
  }
`);
