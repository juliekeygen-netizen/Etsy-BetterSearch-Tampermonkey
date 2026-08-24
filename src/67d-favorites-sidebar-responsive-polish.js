'use strict';

/* v0.7.8 Favorites UI polish.
 *
 * Goals:
 * - make the Favorites filter rail visually/structurally closer to Etsy's own rail
 * - keep disclosure sections open while a filter re-applies/re-renders the rail
 * - replace the awkward Strict/Multi checkbox/select UI with the marketplace-style split pills
 * - prevent narrow-sidebar controls from overflowing/clipping
 * - keep Favorites search + Filter + Sort visible and on one row at narrower desktop/tablet widths
 */

favState.openSections = favState.openSections instanceof Set ? favState.openSections : new Set();
favState.strictSettingsOpen = favState.strictSettingsOpen === true;

function favSectionKeyV078(title) {
    return String(title || 'section')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
}

function favSectionChevronV078() {
    return '<span class="ebsf-native-chevron etsy-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.293 10A.707.707 0 0 1 15.793 11.207L12.53 14.47A.75.75 0 0 1 11.47 14.47L8.207 11.207A.707.707 0 0 1 8.707 10z"></path></svg></span>';
}

/* Preserve disclosure state across favRefreshRail() replacements. Search is
 * intentionally closed the first time instead of being forced open. */
favSection = function favSectionNativeV078(title, body) {
    const key = favSectionKeyV078(title);
    const details = document.createElement('details');
    details.className = 'ebsf-section';
    details.dataset.ebsfSection = key;
    details.open = favState.openSections.has(key);

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="ebsf-section-title">${String(title)}</span>${favSectionChevronV078()}`;

    const inner = document.createElement('div');
    inner.className = 'ebsf-section-body';
    inner.append(body);
    details.append(summary, inner);

    details.addEventListener('toggle', () => {
        if (details.open) favState.openSections.add(key);
        else {
            favState.openSections.delete(key);
            if (key === 'search') favState.strictSettingsOpen = false;
        }
    });
    return details;
};

function favSetStrictModeV078(mode) {
    favCfg.strictMode = mode === 'all' ? 'all' : 'phrase';
    favSaveConfig();
    favState.localPage = 1;
    return favReapply();
}

function favBuildStrictSettingsV078() {
    const panel = document.createElement('div');
    panel.className = 'ebsf-strict-settings';

    const make = (value, labelText) => {
        const label = document.createElement('label');
        label.className = 'ebsf-radio-line';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'ebsf-strict-mode';
        input.value = value;
        input.checked = favCfg.strictMode === value;
        input.addEventListener('change', async () => {
            if (!input.checked) return;
            await favSetStrictModeV078(value);
        });
        label.append(input, document.createTextNode(labelText));
        return label;
    };

    panel.append(
        make('phrase', 'Exact phrase'),
        make('all', 'All words')
    );
    return panel;
}

function favBuildSearchModesV078() {
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-search-mode-stack';

    const strict = document.createElement('span');
    strict.className = `ebs-split ebsf-search-split${favCfg.strict ? ' ebs-active' : ''}`;
    const strictMain = document.createElement('button');
    strictMain.type = 'button';
    strictMain.className = 'ebs-main';
    strictMain.textContent = 'Strict title';
    strictMain.setAttribute('aria-pressed', String(favCfg.strict));
    strictMain.addEventListener('click', async () => {
        favCfg.strict = !favCfg.strict;
        if (favCfg.strict) favCfg.multi = false;
        favSaveConfig();
        favState.localPage = 1;
        await favReapply();
    });

    const strictCaret = document.createElement('button');
    strictCaret.type = 'button';
    strictCaret.className = 'ebs-caret';
    strictCaret.textContent = '▾';
    strictCaret.setAttribute('aria-label', 'Strict title settings');
    strictCaret.setAttribute('aria-expanded', String(favState.strictSettingsOpen));
    strictCaret.addEventListener('click', () => {
        favState.strictSettingsOpen = !favState.strictSettingsOpen;
        favRefreshRail();
    });
    strict.append(strictMain, strictCaret);

    const multi = document.createElement('span');
    multi.className = `ebs-split ebsf-search-split${favCfg.multi ? ' ebs-active' : ''}`;
    const multiMain = document.createElement('button');
    multiMain.type = 'button';
    multiMain.className = 'ebs-main';
    multiMain.textContent = 'Multi-search';
    multiMain.setAttribute('aria-pressed', String(favCfg.multi));
    multiMain.addEventListener('click', async () => {
        favCfg.multi = !favCfg.multi;
        if (favCfg.multi) favCfg.strict = false;
        favSaveConfig();
        favState.localPage = 1;
        await favReapply();
    });

    const multiCaret = document.createElement('button');
    multiCaret.type = 'button';
    multiCaret.className = 'ebs-caret';
    multiCaret.textContent = '▾';
    multiCaret.setAttribute('aria-label', 'Multi-search rules');
    multiCaret.setAttribute('aria-haspopup', 'dialog');
    multiCaret.setAttribute('aria-expanded', 'false');
    multiCaret.addEventListener('click', favOpenMultiModal);
    multi.append(multiMain, multiCaret);

    wrap.append(strict, multi);
    if (favState.strictSettingsOpen) wrap.append(favBuildStrictSettingsV078());
    return wrap;
}

var favBuildFilterRailBaseV078 = favBuildFilterRail;
favBuildFilterRail = function favBuildFilterRailPolishedV078() {
    const rail = favBuildFilterRailBaseV078();
    rail.classList.add('ebsf-rail-v078');

    /* "Filters" itself is now a hide/toggle target, matching the user's
     * expectation that the rail title can close the rail. */
    const strong = rail.querySelector('.ebsf-rail-header strong');
    if (strong) {
        const hide = document.createElement('button');
        hide.type = 'button';
        hide.className = 'ebsf-filter-heading';
        hide.textContent = 'Filters';
        hide.setAttribute('aria-label', 'Hide filters');
        hide.addEventListener('click', favCloseFilters);
        strong.replaceWith(hide);
    }

    /* Replace the original checkbox/select/Configure layout completely. */
    const search = rail.querySelector('[data-ebsf-section="search"] .ebsf-section-body');
    if (search) search.replaceChildren(favBuildSearchModesV078());

    return rail;
};

/* After every rebuild, keep the current disclosure state authoritative. */
var favRefreshRailBaseV078 = favRefreshRail;
favRefreshRail = function favRefreshRailRememberingV078() {
    return favRefreshRailBaseV078();
};

/* v0.7.7 fixed collection search detection, but its narrow-layout fallback put
 * Filter/Sort above the search. Override that behavior: keep one horizontal row
 * and let the native search field be the flexible/shrinking element. */
GM_addStyle(`
.ebsf-rail-v078,
.ebsf-rail-v078 *,
.ebsf-rail-v078 *::before,
.ebsf-rail-v078 *::after {
    box-sizing: border-box;
}
.ebsf-rail-v078 {
    width: 100%;
    min-width: 0;
    overflow-x: hidden;
    color: #222;
}
.ebsf-rail-v078 .ebsf-rail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 54px;
    padding: 8px 8px 10px;
    border-bottom: 1px solid #dedede;
    font-size: 16px;
}
.ebsf-filter-heading {
    appearance: none;
    margin: 0;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: #222;
    font: inherit;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
}
.ebsf-filter-heading:hover,
.ebsf-filter-heading:focus-visible {
    text-decoration: underline;
}
.ebsf-rail-v078 .ebsf-section {
    width: 100%;
    min-width: 0;
    padding: 0;
    border-bottom: 1px solid #dedede;
}
.ebsf-rail-v078 .ebsf-section > summary {
    display: grid;
    grid-template-columns: minmax(0,1fr) 18px;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 48px;
    margin: 0;
    padding: 13px 8px;
    list-style: none;
    color: #222;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
    cursor: pointer;
}
.ebsf-rail-v078 .ebsf-section > summary::-webkit-details-marker { display: none; }
.ebsf-rail-v078 .ebsf-section-title { min-width: 0; }
.ebsf-native-chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    justify-self: end;
    transition: transform .12s ease;
}
.ebsf-native-chevron svg { display:block; width:18px; height:18px; }
.ebsf-section[open] > summary .ebsf-native-chevron { transform: rotate(180deg); }
.ebsf-rail-v078 .ebsf-section-body {
    display: grid;
    gap: 11px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding: 0 8px 15px;
    overflow: hidden;
}
.ebsf-rail-v078 .ebsf-section-body > *,
.ebsf-rail-v078 .ebsf-section-body > * > * {
    min-width: 0;
    max-width: 100%;
}
.ebsf-rail-v078 .wt-input,
.ebsf-rail-v078 .wt-select,
.ebsf-rail-v078 select,
.ebsf-rail-v078 input[type="number"] {
    width: 100%!important;
    min-width: 0!important;
    max-width: 100%!important;
}
.ebsf-rail-v078 .ebsf-two-col {
    display: grid;
    grid-template-columns: minmax(0,1fr)!important;
    gap: 8px;
    width: 100%;
}
.ebsf-rail-v078 .ebsf-field {
    display: grid;
    gap: 6px;
    width: 100%;
    min-width: 0;
}
.ebsf-rail-v078 .ebsf-check-line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    min-width: 0;
    line-height: 1.35;
}
.ebsf-rail-v078 .ebsf-check-line input[type="checkbox"],
.ebsf-rail-v078 .ebsf-radio-line input[type="radio"] {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: #222;
}
.ebsf-search-mode-stack {
    display: grid;
    gap: 8px;
    width: 100%;
    min-width: 0;
}
.ebsf-search-split {
    display: flex!important;
    width: 100%;
    min-width: 0;
    max-width: 100%;
}
.ebsf-search-split .ebs-main {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
}
.ebsf-search-split .ebs-caret {
    flex: 0 0 30px;
}
.ebsf-strict-settings {
    display: grid;
    gap: 4px;
    width: 100%;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid #deded8;
    border-radius: 10px;
    background: #fff;
}
.ebsf-radio-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    width: 100%;
    cursor: pointer;
}

/* Undo the old Favorites-only narrow sidebar assumptions. */
.favorites-landing-phase3-header-search-container .wt-input-btn-group {
    min-width: 0!important;
}

@media (max-width: 899px) {
    /* Etsy hides the entire Favorites profile header below its lg breakpoint.
     * Keep the search portion available while suppressing the bulky profile block. */
    .favorites-landing-phase3-header {
        display: flex!important;
        flex-direction: column!important;
        align-items: stretch!important;
        width: 100%!important;
    }
    .favorites-landing-phase3-header > .favorites-landing-phase3-right-side-header-container {
        display: none!important;
    }
    .favorites-landing-phase3-header-search-container {
        display: block!important;
        width: 100%!important;
        max-width: none!important;
        min-width: 0!important;
        margin-left: 0!important;
    }
    .favorites-landing-phase3-header-search-container > .wt-display-flex-md,
    .favorites-landing-phase3-header-search-container > .wt-display-flex-xs {
        display: flex!important;
        width: 100%!important;
        min-width: 0!important;
        flex-wrap: nowrap!important;
    }
    .ebsf-native-search-anchor {
        display: flex!important;
        flex-direction: row!important;
        align-items: center!important;
        gap: 8px!important;
        width: 100%!important;
        min-width: 0!important;
    }
    .ebsf-native-search-anchor > form {
        order: 2!important;
        flex: 1 1 120px!important;
        width: auto!important;
        min-width: 0!important;
        max-width: none!important;
    }
    .ebsf-search-left-controls {
        position: static!important;
        order: 1!important;
        right: auto!important;
        top: auto!important;
        transform: none!important;
        display: flex!important;
        align-items: center!important;
        justify-content: flex-start!important;
        flex: 0 0 auto!important;
        width: auto!important;
        min-width: 0!important;
        gap: 6px!important;
        white-space: nowrap!important;
    }
    .ebsf-search-left-controls .ebsf-toolbar,
    .ebsf-search-left-controls .ebsf-sort {
        flex: 0 0 auto!important;
    }
    .ebsf-search-left-controls .ebsf-filter-button,
    .ebsf-search-left-controls .ebsf-sort > .wt-menu__trigger {
        min-width: 0!important;
        white-space: nowrap!important;
    }
}

@media (max-width: 640px) {
    .ebsf-native-search-anchor { gap: 5px!important; }
    .ebsf-search-left-controls { gap: 3px!important; }
    .ebsf-search-left-controls .ebsf-filter-button,
    .ebsf-search-left-controls .ebsf-sort > .wt-menu__trigger {
        padding-left: 7px!important;
        padding-right: 7px!important;
        font-size: 12px!important;
    }
}
`);

/* Rebuild an already-open rail with the polished controls, and re-run toolbar
 * placement so a page loaded directly at a narrow width gets the new layout. */
if (isFavoritesPage()) {
    if (favState.filterOpen) favRefreshRail();
    favEnsureToolbar();
}
