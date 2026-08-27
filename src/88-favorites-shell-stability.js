'use strict';

/* v0.12.3 Favorites shell stabilization.
 *
 * Own the permanent desktop rail outside Etsy's React-managed sidebar, make
 * collection navigation deterministic, delegate collection creation to Etsy's
 * real control, use a known native Shops row, and suppress toolbar sync copy
 * that no longer belongs in the permanent shell.
 */
var FAV_SHELL_STABLE_VERSION0123 = '0.12.3';
var favShellStableObserver0123 = null;
var favShellStableTimer0123 = 0;

function favShellNativeSidebar0123() {
    return document.querySelector('[data-testid="sidebar"]:not([data-ebsf-shell-rail-host])');
}

function favShellRailHost0123(create = false) {
    let host = document.querySelector('[data-ebsf-shell-rail-host]');
    if (host || !create) return host;
    const sidebar = favShellNativeSidebar0123();
    const parent = sidebar?.parentElement;
    if (!sidebar || !parent) return null;

    host = document.createElement('aside');
    host.dataset.ebsfShellRailHost = '';
    host.className = `${sidebar.className || ''} ebsf-shell-rail-host`.trim();
    host.removeAttribute('data-testid');
    host.removeAttribute('aria-label');
    parent.insertBefore(host, sidebar);
    return host;
}

function favShellHideNativeSidebar0123() {
    const sidebar = favShellNativeSidebar0123();
    if (!sidebar) return null;
    sidebar.dataset.ebsfNativeSidebarHidden = '';
    sidebar.setAttribute('aria-hidden', 'true');
    return sidebar;
}

function favShellRestoreNativeSidebar0123() {
    const sidebar = favShellNativeSidebar0123();
    if (!sidebar) return;
    delete sidebar.dataset.ebsfNativeSidebarHidden;
    sidebar.removeAttribute('aria-hidden');
    const source = sidebar.querySelector(':scope > [data-ebsf-native-sidebar-source]');
    if (source) {
        const nodes = Array.from(source.childNodes);
        source.replaceWith(...nodes);
    }
}

function favShellExactShopsIcon0123() {
    const icon = document.createElement('span');
    icon.className = 'wt-pr-xs-1 wt-mt-xs-1 etsy-icon';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C15.115 2 17.589 2.32 19.148 2.6 20.288 2.802 21.122 3.728 21.312 4.87L21.95 8.699A3.7 3.7 0 0 1 20.99 11.841Q21 11.886 21 11.934V21.501A.5.5 0 0 1 20.5 22H15.5A.5.5 0 0 1 15 21.5V17A3 3 0 0 0 9 17V21.5A.5.5 0 0 1 8.5 22H3.5A.5.5 0 0 1 3 21.5V11.934Q3 11.886 3.008 11.841A3.68 3.68 0 0 1 2.05 8.698L2.688 4.871C2.878 3.729 3.712 2.803 4.852 2.599 6.412 2.321 8.885 2 12 2M8 4.19C6.87 4.297 5.928 4.438 5.204 4.567 4.98 4.608 4.727 4.805 4.66 5.2L4.023 9.027A2 2 0 0 0 4.006 9.167L4 9.307C4 10.24 4.758 11 5.694 11H6C8 11 8 9 8 9zM16 9S16 11 18 11H18.306A1.694 1.694 0 0 0 19.977 9.027L19.34 5.2C19.274 4.805 19.02 4.608 18.797 4.568A35 35 0 0 0 16 4.19zM12 4Q10.945 4 10 4.047V9S10 11 12 11 14 9 14 9V4.046Q13.556 4.025 13.087 4.013z"></path></svg>';
    return icon;
}

function favShellExactItemsIcon0123() {
    const icon = document.createElement('span');
    icon.className = 'etsy-icon ebsf-shell-native-icon';
    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.555 13C21.801 13 22.001 13.199 22.001 13.444V21.056A.447.447 0 0 1 21.555 21.5H13.945A.444.444 0 0 1 13.501 21.056V13.444A.444.444 0 0 1 13.945 13zM6.317 7.75A.5.5 0 0 1 7.183 7.75L11.73 15.625A.5.5 0 0 1 11.297 16.375H2.204A.5.5 0 0 1 1.77 15.625zM14.75 2A4.75 4.75 0 1 1 14.75 11.5 4.75 4.75 0 0 1 14.75 2"></path></svg>';
    return icon;
}

function favShellShopsLink0123() {
    const href = favShellNativeHref0120('shops');
    if (!href) return null;
    const link = document.createElement('a');
    link.href = href;
    link.className = 'sidebar__link wt-text-body-small wt-display-flex-xs wt-justify-content-space-between wt-align-items-center wt-width-full wt-p-xs-1 wt-pl-xs-2 wt-mb-xs-1 ebsf-shell-shops';
    link.dataset.ebsfShellShops = '';
    const outer = document.createElement('span');
    const inner = document.createElement('span');
    inner.className = 'wt-display-flex-xs wt-align-items-center wt-text-title-small';
    inner.append(favShellExactShopsIcon0123(), document.createTextNode('Shops'));
    outer.append(inner);
    link.append(outer);
    link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.href = link.href;
    }, true);
    return link;
}

function favShellDecorateStableRail0123(rail) {
    if (!rail) return rail;
    rail.dataset.ebsfShellRail = '';
    rail.dataset.ebsfStableRail = '';

    const heading = rail.querySelector('.ebsf-filter-heading');
    if (heading?.tagName === 'BUTTON') {
        const replacement = document.createElement('div');
        replacement.className = heading.className;
        replacement.textContent = heading.textContent || 'Filters';
        replacement.setAttribute('role', 'heading');
        replacement.setAttribute('aria-level', '2');
        heading.replaceWith(replacement);
    }

    rail.querySelectorAll('[data-ebsf-shell-shops], .ebsf-shell-shops').forEach((node) => node.remove());
    rail.querySelector('[data-ebsf-shell-shops-divider]')?.remove();
    const shops = favShellShopsLink0123();
    if (shops) {
        const divider = document.createElement('div');
        divider.dataset.ebsfShellShopsDivider = '';
        divider.className = 'ebsf-shell-shops-divider';
        rail.append(divider, shops);
    }
    return rail;
}

function favShellBuildStableRail0123() {
    favPrepareOpenSectionsForRail?.();
    return favShellDecorateStableRail0123(favBuildFilterRail());
}

function favShellEnsureStableRail0123(rebuild = false) {
    if (!isFavoritesPage() || !favShellDesktop0120()) return null;
    const sidebar = favShellHideNativeSidebar0123();
    const host = favShellRailHost0123(true);
    if (!sidebar || !host) return null;

    let rail = host.querySelector(':scope > [data-ebsf-shell-rail]');
    if (!rail || rebuild) {
        const next = favShellBuildStableRail0123();
        if (rail) rail.replaceWith(next);
        else host.replaceChildren(next);
        rail = next;
    } else {
        favShellDecorateStableRail0123(rail);
    }

    host.hidden = false;
    host.removeAttribute('aria-hidden');
    favState.sidebar = host;
    favState.sidebarNodes = [];
    favState.rail = rail;
    favState.filterOpen = true;
    return rail;
}

function favShellRemoveStableRail0123() {
    const host = favShellRailHost0123(false);
    host?.remove();
    favShellRestoreNativeSidebar0123();
    if (favState.sidebar === host) favState.sidebar = null;
    if (favState.rail?.closest?.('[data-ebsf-shell-rail-host]')) favState.rail = null;
}

/* Desktop filters are permanently owned by our host. Never call the legacy
 * sidebar swap on desktop, because Etsy may replace that subtree at any time. */
favShellEnsureDesktopRail0120 = function favShellEnsureDesktopRail0123() {
    return favShellEnsureStableRail0123(false);
};

var favRefreshRailBefore0123 = favRefreshRail;
favRefreshRail = function favRefreshRail0123() {
    if (isFavoritesPage() && favShellDesktop0120()) return favShellEnsureStableRail0123(true);
    return favRefreshRailBefore0123();
};

var favOpenFiltersBefore0123 = favOpenFilters;
favOpenFilters = function favOpenFilters0123() {
    if (isFavoritesPage() && favShellDesktop0120()) return favShellEnsureStableRail0123(false);
    return favOpenFiltersBefore0123();
};

var favCloseFiltersBefore0123 = favCloseFilters;
favCloseFilters = function favCloseFilters0123() {
    if (isFavoritesPage() && favShellDesktop0120()) return favShellEnsureStableRail0123(false);
    return favCloseFiltersBefore0123();
};

favToggleFilters = function favToggleFilters0123() {
    if (isFavoritesPage() && favShellDesktop0120()) return favShellEnsureStableRail0123(false);
    return favState.filterOpen ? favCloseFilters() : favOpenFilters();
};

var favShellRestoreMobileBefore0123 = favShellRestoreMobile0120;
favShellRestoreMobile0120 = function favShellRestoreMobile0123() {
    favShellRemoveStableRail0123();
    return favShellRestoreMobileBefore0123();
};

function favShellNativeCreateButton0123() {
    return Array.from(document.querySelectorAll('[data-testid="add-collection-button"], button[aria-label="Create new collection"]'))
        .find((button) => !button.closest('[data-ebsf-collection-strip], [data-ebsf-shell-rail-host]')) || null;
}

function favShellTemporarilyEnableAncestors0123(node) {
    const changed = [];
    for (let current = node; current && current !== document.body; current = current.parentElement) {
        const state = {
            node: current,
            hidden: current.hidden === true,
            inert: 'inert' in current ? current.inert === true : false,
            ariaHidden: current.getAttribute?.('aria-hidden'),
        };
        if (state.hidden || state.inert || state.ariaHidden === 'true') {
            changed.push(state);
            if (state.hidden) current.hidden = false;
            if ('inert' in current && state.inert) current.inert = false;
            if (state.ariaHidden === 'true') current.removeAttribute('aria-hidden');
        }
    }
    return () => {
        for (const state of changed.reverse()) {
            if (state.hidden) state.node.hidden = true;
            if ('inert' in state.node && state.inert) state.node.inert = true;
            if (state.ariaHidden === 'true') state.node.setAttribute('aria-hidden', 'true');
        }
    };
}

favShellInvokeCreate0120 = function favShellInvokeCreate0123() {
    const button = favShellNativeCreateButton0123();
    if (!button) {
        favShellSchedule0120(true);
        return false;
    }
    const restore = favShellTemporarilyEnableAncestors0123(button);
    try {
        button.click();
    } finally {
        queueMicrotask(restore);
    }
    return true;
};

function favShellCollectionHref0123(collection) {
    try { return new URL(String(collection?.url || ''), location.origin).href; }
    catch (_) { return String(collection?.url || ''); }
}

function favShellMakePill0123(label, href, active, icon) {
    const link = document.createElement('a');
    link.href = href;
    link.className = 'ebsf-collection-pill';
    link.dataset.ebsfCollectionNav = '';
    if (active) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
    }
    if (icon) link.append(icon);
    const text = document.createElement('span');
    text.textContent = label;
    link.append(text);
    return link;
}

/* Rebuild the selector rather than inheriting the earlier event wiring. The
 * capture-phase handler runs before Etsy document handlers and only suppresses
 * clicks when an actual drag occurred. */
favShellBuildStrip0120 = function favShellBuildStrip0123() {
    const scope = favScope();
    const root = document.createElement('nav');
    root.className = 'ebsf-collection-strip ebsf-collection-strip-stable';
    root.dataset.ebsfCollectionStrip = '';
    root.setAttribute('aria-label', 'Favorites collections');

    const fixed = document.createElement('div');
    fixed.className = 'ebsf-collection-fixed';
    const home = document.createElement('div');
    home.className = 'ebsf-collection-home-group';
    home.setAttribute('role', 'group');
    home.setAttribute('aria-label', 'All favorites and create collection');

    const allHref = favShellNativeHref0120('items') || location.href;
    const all = favShellMakePill0123('All', allHref, scope.type === 'items', favShellExactItemsIcon0123());
    all.classList.add('ebsf-collection-all');
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'ebsf-collection-pill ebsf-collection-create';
    create.dataset.ebsfCollectionCreate = '';
    create.setAttribute('aria-label', 'Create new collection');
    create.textContent = '+';
    home.append(all, create);
    fixed.append(home);

    const viewport = document.createElement('div');
    viewport.className = 'ebsf-collection-scroll';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Saved collections');
    const track = document.createElement('div');
    track.className = 'ebsf-collection-track';
    for (const collection of favShellCollections0120()) {
        const href = favShellCollectionHref0123(collection);
        if (!href) continue;
        const link = favShellMakePill0123(collection.name, href, scope.type === 'collection' && scope.id === collection.slug, null);
        link.dataset.collectionSlug = collection.slug;
        link.title = `${collection.name} · ${collection.count} favorites`;
        track.append(link);
    }
    viewport.append(track);
    root.append(fixed, viewport);

    let drag = null;
    let suppressClickUntil = 0;
    viewport.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.pointerType === 'touch') return;
        drag = { id:event.pointerId, x:event.clientX, left:viewport.scrollLeft, moved:false };
        viewport.setPointerCapture?.(event.pointerId);
        viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        viewport.scrollLeft = drag.left - dx;
    });
    const endDrag = (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        if (drag.moved) suppressClickUntil = performance.now() + 220;
        drag = null;
        viewport.classList.remove('is-dragging');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || viewport.scrollWidth <= viewport.clientWidth) return;
        viewport.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive:false });
    viewport.addEventListener('keydown', (event) => {
        const amount = Math.max(120, Math.round(viewport.clientWidth * .65));
        if (event.key === 'ArrowRight') viewport.scrollBy({ left:amount, behavior:'smooth' });
        else if (event.key === 'ArrowLeft') viewport.scrollBy({ left:-amount, behavior:'smooth' });
        else if (event.key === 'Home') viewport.scrollTo({ left:0, behavior:'smooth' });
        else if (event.key === 'End') viewport.scrollTo({ left:viewport.scrollWidth, behavior:'smooth' });
        else return;
        event.preventDefault();
    });

    root.addEventListener('click', (event) => {
        const createButton = event.target.closest?.('[data-ebsf-collection-create]');
        if (createButton && root.contains(createButton)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            favShellInvokeCreate0120();
            return;
        }

        const link = event.target.closest?.('a[data-ebsf-collection-nav][href]');
        if (!link || !root.contains(link)) return;
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.href = link.href;
    }, true);

    favShellSampleStyle0120(root);
    return root;
};

function favShellSuppressToolbarProgress0123() {
    document.querySelectorAll('.ebsf-sync-progress, [data-ebsf-sync-progress]').forEach((node) => node.remove());
    document.querySelectorAll('.ebsf-native-search-sync-hidden').forEach((node) => node.classList.remove('ebsf-native-search-sync-hidden'));
}

var favShellApplyBefore0123 = favShellApply0120;
favShellApply0120 = function favShellApply0123(force = false) {
    if (!isFavoritesPage()) {
        favShellRemoveStableRail0123();
        document.body?.classList.remove('ebsf-shell-v0123');
        return favShellApplyBefore0123(force);
    }
    document.body?.classList.add('ebsf-shell-v0123');
    favShellSuppressToolbarProgress0123();
    const result = favShellApplyBefore0123(force);
    if (favShellDesktop0120()) favShellEnsureStableRail0123(false);
    favShellSuppressToolbarProgress0123();
    return result;
};

function favShellStableRepair0123() {
    if (!isFavoritesPage()) return;
    clearTimeout(favShellStableTimer0123);
    favShellStableTimer0123 = setTimeout(() => {
        if (!isFavoritesPage()) return;
        if (favShellDesktop0120()) favShellEnsureStableRail0123(false);
        favShellSuppressToolbarProgress0123();
        const strip = document.querySelector('[data-ebsf-collection-strip]');
        if (!strip?.classList.contains('ebsf-collection-strip-stable')) favShellSchedule0120(true);
    }, 30);
}

if (document.body) {
    favShellStableObserver0123 = new MutationObserver(favShellStableRepair0123);
    favShellStableObserver0123.observe(document.body, { childList:true, subtree:true });
}
document.addEventListener('ebsf:favorites-sync-state', favShellStableRepair0123);
window.addEventListener('resize', favShellStableRepair0123, { passive:true });
window.addEventListener('pageshow', favShellStableRepair0123);
window.addEventListener('popstate', favShellStableRepair0123);

GM_addStyle(`
/* Stable desktop rail owns the old sidebar grid slot; Etsy's React subtree is
   hidden wholesale instead of being selectively hidden child-by-child. */
@media(min-width:900px){
  .ebsf-shell-v0123 [data-testid="sidebar"][data-ebsf-native-sidebar-hidden]{display:none!important}
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host]{display:block!important;position:static!important;top:auto!important;height:auto!important;max-height:none!important;overflow:visible!important;align-self:start!important;min-width:0!important}
  .ebsf-shell-v0123 [data-ebsf-shell-rail-host]>.ebsf-rail{display:block!important;width:100%!important;min-width:0!important;padding-top:0!important}
}
.ebsf-shell-v0123 .ebsf-shell-shops-divider{height:1px;margin:18px 0 10px;background:#dedede}
.ebsf-shell-v0123 .ebsf-shell-shops{margin:0!important;padding:8px 8px!important;border:0!important;border-radius:0!important;gap:0!important;background:transparent!important;font:inherit!important;font-size:inherit!important;font-weight:inherit!important}
.ebsf-shell-v0123 .ebsf-shell-shops>span>.wt-text-title-small{font-weight:600!important}
.ebsf-shell-v0123 .ebsf-shell-shops .etsy-icon{display:inline-flex!important;width:auto!important;height:auto!important;margin-top:4px!important;margin-right:0!important;padding-right:8px!important}
.ebsf-shell-v0123 .ebsf-shell-shops .etsy-icon svg{display:block!important;width:24px!important;height:24px!important}

/* Shell sync/load state must never replace or overlay the collection selector
   or moved Favorites search controls. Progress still remains available in the
   Settings/Data & sync surfaces. */
.ebsf-shell-v0123 .ebsf-sync-progress,
.ebsf-shell-v0123 [data-ebsf-sync-progress]{display:none!important}
.ebsf-shell-v0123 .ebsf-native-search-sync-hidden{visibility:visible!important;opacity:1!important;pointer-events:auto!important}

/* Keep the selector optically centered on its own 40px control line. */
.ebsf-shell-v0123 .ebsf-collection-strip{min-height:40px!important;align-items:center!important}
.ebsf-shell-v0123 .ebsf-collection-fixed,
.ebsf-shell-v0123 .ebsf-collection-home-group,
.ebsf-shell-v0123 .ebsf-collection-track{align-items:center!important}
.ebsf-shell-v0123 .ebsf-collection-pill{height:40px!important;min-height:40px!important;line-height:1!important}
.ebsf-shell-v0123 .ebsf-collection-home-group{height:40px!important}
.ebsf-shell-v0123 .ebsf-collection-home-group .ebsf-collection-pill{height:38px!important;min-height:38px!important}
.ebsf-shell-v0123 .ebsf-collection-all{gap:8px!important}
.ebsf-shell-v0123 .ebsf-collection-create{font-size:20px!important;font-weight:400!important;line-height:1!important}
`);

favShellSchedule0120(true);
