'use strict';

/* v0.12.2 Favorites shell UI/functionality correction.
 *
 * Fixes the live regressions found after the first shell rollout without
 * touching the Phase 5 data/index/deep-scan stack:
 *  - native sidebar content can rerender beside the permanent rail;
 *  - collection metadata was duplicated instead of updating Etsy's native row;
 *  - All/+ looked like unrelated pills and inherited odd native icon spacing;
 *  - cloned navigation/create controls were not reliably actionable.
 */

function favShellNativeNode0122(selector) {
    const nodes = Array.from(document.querySelectorAll(selector)).filter((node) =>
        !node.closest('[data-ebsf-shell-rail], [data-ebsf-collection-strip], [data-ebsf-all-header]')
    );
    return nodes.find((node) => !node.closest('[data-ebsf-native-sidebar-source]'))
        || nodes.find((node) => node.closest('[data-ebsf-native-sidebar-source]'))
        || null;
}

favShellQuery0120 = function favShellQuery0122(selector) {
    return favShellNativeNode0122(selector);
};

favShellIcon0120 = function favShellIcon0122(selector) {
    const icon = favShellNativeNode0122(selector)?.querySelector?.('.etsy-icon')?.cloneNode(true) || null;
    if (!icon) return null;
    icon.className = 'etsy-icon ebsf-shell-native-icon';
    icon.removeAttribute('style');
    return icon;
};

function favShellActionHost0122(button) {
    if (!button) return null;
    return button.closest('[data-ebsf-native-sidebar-source]')
        || button.closest('[data-testid="sidebar"] > nav')
        || null;
}

favShellInvokeCreate0120 = function favShellInvokeCreate0122() {
    const button = favShellNativeNode0122('[data-testid="add-collection-button"]')
        || favShellNativeNode0122('button[aria-label="Create new collection"]');
    if (!button) return false;

    const host = favShellActionHost0122(button);
    const wasHidden = Boolean(host?.hidden);
    const hadInert = Boolean(host && 'inert' in host && host.inert);
    if (host) {
        host.dataset.ebsfNativeActionHost = '';
        host.hidden = false;
        if ('inert' in host) host.inert = false;
    }

    try {
        button.click();
    } finally {
        if (host) {
            queueMicrotask(() => {
                if (wasHidden) host.hidden = true;
                if ('inert' in host) host.inert = hadInert;
                delete host.dataset.ebsfNativeActionHost;
            });
        }
    }
    return true;
};

function favShellNavigate0122(link, event) {
    if (!link?.href) return;
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    location.assign(link.href);
}

function favShellWireNavigation0122(root) {
    root?.querySelectorAll?.('a.ebsf-collection-pill[href]').forEach((link) => {
        link.dataset.ebsfCollectionNav = '';
        link.addEventListener('click', (event) => favShellNavigate0122(link, event));
    });
}

var favShellBuildStripBefore0122 = favShellBuildStrip0120;
favShellBuildStrip0120 = function favShellBuildStrip0122() {
    const root = favShellBuildStripBefore0122();
    const fixed = root.querySelector('.ebsf-collection-fixed');
    const all = fixed?.querySelector(':scope > .ebsf-collection-pill:not(.ebsf-collection-plus)');
    const plus = fixed?.querySelector(':scope > .ebsf-collection-plus');

    if (fixed && all && plus) {
        const group = document.createElement('div');
        group.className = 'ebsf-collection-home-group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'All favorites and create collection');
        all.classList.add('ebsf-collection-all');
        plus.classList.add('ebsf-collection-create');
        fixed.insertBefore(group, all);
        group.append(all, plus);
    }

    root.querySelectorAll('.etsy-icon').forEach((icon) => {
        icon.classList.add('ebsf-shell-native-icon');
        icon.classList.remove('wt-pr-xs-1', 'wt-mt-xs-1', 'wt-mr-xs-1', 'wt-ml-xs-1');
    });
    favShellWireNavigation0122(root);
    return root;
};

function favShellCloneNativeShops0122() {
    const native = favShellNativeNode0122('a[href*="tab=shops"]');
    if (!native) return null;
    const link = native.cloneNode(true);
    link.removeAttribute('aria-current');
    link.classList.remove('wt-bg-gray', 'sidebar__link--active');
    link.classList.add('ebsf-shell-shops');
    link.dataset.ebsfShellShops = '';
    link.querySelectorAll('.etsy-icon').forEach((icon) => {
        icon.classList.add('ebsf-shell-native-icon');
        icon.classList.remove('wt-pr-xs-1', 'wt-mt-xs-1', 'wt-mr-xs-1', 'wt-ml-xs-1');
    });
    return link;
}

favShellDecorateRail0120 = function favShellDecorateRail0122(rail) {
    if (!rail) return;
    rail.dataset.ebsfShellRail = '';

    const heading = rail.querySelector('.ebsf-filter-heading');
    if (heading?.tagName === 'BUTTON') {
        const div = document.createElement('div');
        div.className = heading.className;
        div.textContent = heading.textContent || 'Filters';
        div.setAttribute('role', 'heading');
        div.setAttribute('aria-level', '2');
        heading.replaceWith(div);
    }

    rail.querySelectorAll('[data-ebsf-shell-shops]').forEach((node) => node.remove());
    const nativeClone = favShellCloneNativeShops0122();
    if (nativeClone) {
        rail.append(nativeClone);
        return;
    }

    const href = favShellNativeHref0120('shops');
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.className = 'ebsf-shell-shops';
    link.dataset.ebsfShellShops = '';
    const icon = favShellIcon0120('a[href*="tab=shops"]');
    if (icon) link.append(icon);
    const text = document.createElement('span');
    text.textContent = 'Shops';
    link.append(text);
    rail.append(link);
};

var favShellEnsureDesktopRailBefore0122 = favShellEnsureDesktopRail0120;
favShellEnsureDesktopRail0120 = function favShellEnsureDesktopRail0122() {
    const result = favShellEnsureDesktopRailBefore0122();
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    const rail = sidebar?.querySelector(':scope > [data-ebsf-shell-rail]');
    if (sidebar && rail) {
        sidebar.classList.add('ebsf-shell-sidebar');
        favShellDecorateRail0120(rail);
        favState.sidebar = sidebar;
        favState.rail = rail;
        favState.filterOpen = true;
    }
    return result;
};

function favShellNativeCollectionMeta0122() {
    return document.querySelector(
        '#collections-landing-phase-3-header-container p[data-test-id="collections-landing-right-side-header"]'
    );
}

function favShellRemoveDuplicateCollectionMeta0122() {
    const content = document.querySelector('#collections-landing-left-side-header-content');
    if (!content) return;
    content.querySelectorAll('p.ebsf-shell-meta:not([data-test-id="collections-landing-right-side-header"])')
        .forEach((node) => node.remove());
}

function favShellWriteNativeCollectionCount0122(meta, total, shown) {
    if (!meta) return false;
    meta.classList.add('ebsf-shell-native-meta');
    meta.dataset.ebsfShellCount = '';

    let separator = Array.from(meta.children)
        .find((node) => node.tagName === 'SPAN' && String(node.textContent || '').trim() === '|');
    if (!separator) {
        const bold = meta.querySelector(':scope > b');
        if (!bold) return false;
        while (bold.nextSibling) bold.parentNode.removeChild(bold.nextSibling);
        separator = document.createElement('span');
        separator.className = 'wt-pr-xs-1 wt-pl-xs-1';
        separator.textContent = '|';
        meta.append(separator);
    }
    while (separator.nextSibling) separator.parentNode.removeChild(separator.nextSibling);
    meta.append(document.createTextNode(`${total} favorites · ${shown} shown`));
    return true;
}

favShellUpdateMetadata0121 = function favShellUpdateMetadata0122(shownValue) {
    const { total, shown } = favShellCountValues0121(shownValue);
    const scope = favScope();

    if (scope.type === 'items') {
        const count = document.querySelector('[data-ebsf-all-header] [data-ebsf-shell-count]');
        if (count) count.textContent = `${total} favorites · ${shown} shown`;
        return;
    }

    favShellRemoveDuplicateCollectionMeta0122();
    favShellWriteNativeCollectionCount0122(favShellNativeCollectionMeta0122(), total, shown);
};

var favShellEnsureContentHeaderBefore0122 = favShellEnsureContentHeader0121;
favShellEnsureContentHeader0121 = function favShellEnsureContentHeader0122() {
    const header = favShellEnsureContentHeaderBefore0122();
    if (favScope().type === 'collection') {
        favShellRemoveDuplicateCollectionMeta0122();
        const meta = favShellNativeCollectionMeta0122();
        if (meta) meta.classList.add('ebsf-shell-native-meta');
        favShellUpdateMetadata0121();
    }
    return header;
};

GM_addStyle(`
/* Keep Etsy's rerendered native sidebar available as a hidden action source,
   but never let it appear beside the permanent BetterSearch rail. */
@media(min-width:900px){
  .ebsf-shell-v0121 [data-testid="sidebar"].ebsf-shell-sidebar > :not([data-ebsf-shell-rail]):not([data-ebsf-native-sidebar-source]):not([data-ebsf-native-action-host]){display:none!important}
  .ebsf-shell-v0121 [data-testid="sidebar"].ebsf-shell-sidebar > [data-ebsf-shell-rail]{display:block!important;width:100%!important}
  .ebsf-shell-v0121 [data-ebsf-native-sidebar-source][hidden]{display:none!important}
  .ebsf-shell-v0121 [data-ebsf-native-action-host],
  .ebsf-shell-v0121 [data-ebsf-native-sidebar-source][data-ebsf-native-action-host]{display:block!important;position:fixed!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important}
}

/* All + create is one segmented native-style control, not two unrelated pills. */
.ebsf-shell-v0121 .ebsf-collection-fixed{gap:0!important}
.ebsf-shell-v0121 .ebsf-collection-home-group{display:inline-flex;align-items:stretch;flex:0 0 auto;height:40px;overflow:hidden;border:1px solid var(--ebsf-shell-border);border-radius:999px;background:var(--ebsf-shell-bg);color:var(--ebsf-shell-color)}
.ebsf-shell-v0121 .ebsf-collection-home-group .ebsf-collection-pill{min-height:38px!important;height:38px!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:inherit!important;font-family:var(--ebsf-shell-font)!important}
.ebsf-shell-v0121 .ebsf-collection-home-group .ebsf-collection-all{gap:6px!important;padding:0 13px!important}
.ebsf-shell-v0121 .ebsf-collection-home-group .ebsf-collection-all.is-active{background:color-mix(in srgb,var(--ebsf-shell-color) 7%,var(--ebsf-shell-bg))!important}
.ebsf-shell-v0121 .ebsf-collection-home-group .ebsf-collection-create{width:40px!important;padding:0!important;border-left:1px solid var(--ebsf-shell-border)!important}
.ebsf-shell-v0121 .ebsf-collection-home-group .ebsf-collection-pill:hover{background:color-mix(in srgb,var(--ebsf-shell-color) 5%,var(--ebsf-shell-bg))!important}
.ebsf-shell-v0121 .ebsf-shell-native-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 20px!important;width:20px!important;height:20px!important;margin:0!important;padding:0!important}
.ebsf-shell-v0121 .ebsf-shell-native-icon svg{display:block!important;width:20px!important;height:20px!important}
.ebsf-shell-v0121 .ebsf-collection-create .ebsf-shell-native-icon,.ebsf-shell-v0121 .ebsf-collection-create .ebsf-shell-native-icon svg{width:18px!important;height:18px!important;flex-basis:18px!important}

/* Reuse Etsy's actual collection metadata row and vertically center it with
   the 40px sort/settings/search control row. */
.ebsf-shell-v0121 #collections-landing-left-side-header-content p[data-test-id="collections-landing-right-side-header"],
.ebsf-shell-v0121 [data-ebsf-all-header] .ebsf-shell-meta{display:flex!important;align-items:center!important;min-height:40px!important;margin:0!important;line-height:1.35!important}
.ebsf-shell-v0121 #collections-landing-right-side-header-container,
.ebsf-shell-v0121 [data-ebsf-shell-controls]{align-self:end!important;display:flex!important;align-items:center!important}
.ebsf-shell-v0121 .ebsf-toolbar-row{align-items:center!important}

/* Native-style Shops entry at the bottom of the filter rail. */
.ebsf-shell-v0121 .ebsf-shell-shops{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;width:100%!important;margin:16px 0 0!important;padding:12px 0!important;border-top:1px solid #dedede!important;background:transparent!important;color:inherit!important;text-decoration:none!important;font-size:14px!important;font-weight:600!important}
.ebsf-shell-v0121 .ebsf-shell-shops .etsy-icon{margin:0!important;padding:0!important;flex:0 0 20px!important;width:20px!important;height:20px!important}
.ebsf-shell-v0121 .ebsf-shell-shops svg{width:20px!important;height:20px!important}

/* Keep BetterSearch's visible controls in the same visual family as Etsy's
   native Favorites search input. */
.ebsf-shell-v0121 .ebsf-collection-pill,
.ebsf-shell-v0121 .ebsf-sort>button,
.ebsf-shell-v0121 .ebsf-settings-button{
  border-color:var(--ebsf-shell-border)!important;
  background:var(--ebsf-shell-bg)!important;
  color:var(--ebsf-shell-color)!important;
  font-family:var(--ebsf-shell-font)!important;
}
`);

favShellSchedule0120(true);
