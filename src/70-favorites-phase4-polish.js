'use strict';

/* v0.10.0 Phase 4 UI stability patch.
 *
 * Opening/closing the Favorites filter rail must not make the toolbar breathe:
 * Filter, Sort, Settings and the native search keep the same widths and viewport
 * position until the route or viewport width genuinely changes.
 */

var favToolbarGeometrySnapshots010 = new WeakMap();
var favFilterWidthCache010 = new WeakMap();

function favStableToolbarRouteKey010(anchor) {
    const placeholder = anchor?.input?.getAttribute?.('placeholder') || '';
    return `${location.pathname}|${placeholder}`;
}

function favLockFilterButtonWidth010(button = favState.filterButton) {
    if (!button?.isConnected) return 0;
    let width = favFilterWidthCache010.get(button);
    const label = button.querySelector('[data-ebsf-filter-label]');

    if (!width && label) {
        const current = label.textContent;
        const oldWidth = button.style.getPropertyValue('width');
        const oldMin = button.style.getPropertyValue('min-width');
        const oldMax = button.style.getPropertyValue('max-width');
        const oldFlex = button.style.getPropertyValue('flex');

        button.style.removeProperty('width');
        button.style.removeProperty('min-width');
        button.style.removeProperty('max-width');
        button.style.removeProperty('flex');

        label.textContent = 'Show filters';
        const showWidth = button.getBoundingClientRect().width;
        label.textContent = 'Hide filters';
        const hideWidth = button.getBoundingClientRect().width;
        label.textContent = current;

        width = Math.ceil(Math.max(showWidth, hideWidth));
        if (!width) {
            if (oldWidth) button.style.setProperty('width', oldWidth);
            if (oldMin) button.style.setProperty('min-width', oldMin);
            if (oldMax) button.style.setProperty('max-width', oldMax);
            if (oldFlex) button.style.setProperty('flex', oldFlex);
            return 0;
        }
        favFilterWidthCache010.set(button, width);
    }

    if (width) {
        button.style.setProperty('width', `${width}px`, 'important');
        button.style.setProperty('min-width', `${width}px`, 'important');
        button.style.setProperty('max-width', `${width}px`, 'important');
        button.style.setProperty('flex', `0 0 ${width}px`, 'important');
    }
    return width || 0;
}

function favToolbarStyleSnapshot010(row, searchSlot, anchor) {
    const take = (node, property) => node.style.getPropertyValue(property);
    const takePriority = (node, property) => node.style.getPropertyPriority(property);
    const properties = ['width', 'max-width', 'margin-left', 'flex', 'transform'];
    const searchProperties = ['flex', 'width', 'max-width'];
    const rowStyle = Object.fromEntries(properties.map((property) => [
        property,
        [take(row, property), takePriority(row, property)],
    ]));
    const searchStyle = Object.fromEntries(searchProperties.map((property) => [
        property,
        [take(searchSlot, property), takePriority(searchSlot, property)],
    ]));

    const rect = row.getBoundingClientRect();
    return {
        row,
        searchSlot,
        viewportWidth: Math.round(innerWidth),
        routeKey: favStableToolbarRouteKey010(anchor),
        left: rect.left,
        width: rect.width,
        rowStyle,
        searchStyle,
        preserveSearch: row.classList.contains('ebsf-toolbar-preserve-search'),
        compact: row.classList.contains('ebsf-toolbar-compact'),
    };
}

function favApplyStyleMap010(node, map) {
    for (const [property, [value, priority]] of Object.entries(map || {})) {
        if (value) node.style.setProperty(property, value, priority || '');
        else node.style.removeProperty(property);
    }
}

function favApplyToolbarSnapshot010(snapshot) {
    const { row, searchSlot } = snapshot;
    if (!row?.isConnected || !searchSlot?.isConnected) return;

    row.classList.toggle('ebsf-toolbar-preserve-search', snapshot.preserveSearch);
    row.classList.toggle('ebsf-toolbar-compact', snapshot.compact);

    /* Never compound the compensation transform from an earlier pass. */
    row.style.removeProperty('transform');
    favApplyStyleMap010(row, snapshot.rowStyle);
    row.style.removeProperty('transform');
    favApplyStyleMap010(searchSlot, snapshot.searchStyle);

    /* The sidebar swap can make Etsy's surrounding container move by a few
     * pixels. Compensate only that external movement; widths stay untouched.
     */
    const current = row.getBoundingClientRect();
    const delta = snapshot.left - current.left;
    if (Math.abs(delta) >= 0.5) {
        row.style.setProperty('transform', `translateX(${delta.toFixed(2)}px)`, 'important');
    }
}

var favRepairToolbarLayoutBefore010 = favRepairToolbarLayout;
favRepairToolbarLayout = function favRepairToolbarLayout010() {
    const anchor = favSearchAnchor();
    if (!anchor) return;

    const row = anchor.searchSlot.closest?.('[data-ebsf-toolbar-row]');
    const controls = row?.querySelector?.(':scope > [data-ebsf-search-left-controls]');
    if (!row || !controls) return;

    favLockFilterButtonWidth010(controls.querySelector('.ebsf-filter-button'));

    const routeKey = favStableToolbarRouteKey010(anchor);
    const viewportWidth = Math.round(innerWidth);
    let snapshot = favToolbarGeometrySnapshots010.get(row);
    const invalid =
        !snapshot
        || snapshot.searchSlot !== anchor.searchSlot
        || snapshot.viewportWidth !== viewportWidth
        || snapshot.routeKey !== routeKey;

    if (invalid) {
        /* Let the established native-width algorithm calculate exactly once for
         * this route + viewport, then freeze that result across rail toggles.
         */
        favRepairToolbarLayoutBefore010();
        favLockFilterButtonWidth010(controls.querySelector('.ebsf-filter-button'));
        snapshot = favToolbarStyleSnapshot010(row, anchor.searchSlot, anchor);
        favToolbarGeometrySnapshots010.set(row, snapshot);
        return;
    }

    favApplyToolbarSnapshot010(snapshot);
};

var favPolishFilterButtonBefore010 = favPolishFilterButton;
favPolishFilterButton = function favPolishFilterButton010() {
    favPolishFilterButtonBefore010();
    favLockFilterButtonWidth010(favState.filterButton);
    requestAnimationFrame(() => favRepairToolbarLayout());
};

/* If fonts finish loading after the first layout, one controlled recapture is
 * safer than letting Show/Hide toggles continuously remeasure the row.
 */
document.fonts?.ready?.then?.(() => {
    const anchor = favSearchAnchor();
    const row = anchor?.searchSlot?.closest?.('[data-ebsf-toolbar-row]');
    if (!row) return;
    favToolbarGeometrySnapshots010.delete(row);
    favFilterWidthCache010.delete(favState.filterButton);
    requestAnimationFrame(() => favRepairToolbarLayout());
}).catch?.(() => {});

GM_addStyle(`
  .ebsf-filter-button{
    box-sizing:border-box!important;
  }
  .ebsf-toolbar-row{
    will-change:auto!important;
  }
`);
