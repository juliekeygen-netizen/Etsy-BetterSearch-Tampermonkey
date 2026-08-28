'use strict';

/* v0.12.4 third audit pass.
 *
 * Keep this layer deliberately small: it closes three integration gaps found
 * after the first two hardening passes without reopening the shell lifecycle.
 *  - route identity stays cheap inside mutation-heavy pagination protection;
 *  - the collection selector rebuilds only when Etsy replaces/late-mounts the
 *    native Create collection control captured by its + button closure;
 *  - compact sort triggers still open a readable, viewport-bounded menu.
 */

favRouteIdentity0126 = function favRouteIdentity0127() {
    try {
        const url = new URL(location.href);
        const pathMatch = url.pathname.match(/\/people\/[^/]+\/favorites\/([^/?#]+)/i);
        const collectionId = url.searchParams.get('collectionId') || '';
        const type = pathMatch ? 'collection' : (collectionId ? 'group' : 'items');
        const id = pathMatch ? decodeURIComponent(pathMatch[1]) : collectionId;
        return `${url.pathname}|${url.searchParams.get('tab') || ''}|${url.searchParams.get('page') || ''}|${collectionId}|${type}|${id}`;
    } catch (_) {
        return `${location.pathname}|${location.search}`;
    }
};

var favInstallCollectionStripBefore0127 = favInstallCollectionStrip0120;
favInstallCollectionStrip0120 = function favInstallCollectionStrip0127(content) {
    if (!content) return favInstallCollectionStripBefore0127(content);

    const nativeCreate = favNativeCreateButton0120() || null;
    const previousCreate = favState.collectionCreateSource0127 || null;
    const current = content.querySelector(':scope > nav[data-ebsf-collection-strip]')
        || document.querySelector('nav[data-ebsf-collection-strip]');

    /* favBuildCollectionStrip0120 closes over the native create button. A
     * healthy revision-4 strip therefore still needs one rebuild if Etsy late
     * mounts or replaces that native button; otherwise + can stay disabled or
     * point at a detached React node forever. Never remove a strip that already
     * contains Etsy pagination: the pass-1 installer must get first chance to
     * salvage those live React-backed pager controls. */
    if (current && previousCreate !== nativeCreate && !favHasPaginationPayload0126(current)) {
        current.__ebsfScrollerCleanup0126?.();
        current.remove();
    }

    const result = favInstallCollectionStripBefore0127(content);
    favState.collectionCreateSource0127 = nativeCreate;
    const installed = content.querySelector(':scope > nav[data-ebsf-collection-strip]')
        || document.querySelector('nav[data-ebsf-collection-strip]');
    if (installed) favApplyNativeControlTheme0120(installed);
    return result;
};

favPositionSortMenu = function favPositionSortMenu0127(root = favState.sortRoot) {
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    const menu = root?.__ebsfSortMenu || favState.sortMenu || favSortMenuNode?.();
    if (!root || !trigger || !menu || menu.hidden) return;

    const rect = trigger.getBoundingClientRect();
    const maxWidth = Math.max(0, innerWidth - 16);
    const preferredWidth = Math.max(190, Math.ceil(rect.width));
    const width = Math.min(maxWidth, preferredWidth);

    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('width', `${width}px`, 'important');
    menu.style.setProperty('min-width', `${width}px`, 'important');
    menu.style.setProperty('max-width', `${maxWidth}px`, 'important');

    const menuHeight = menu.getBoundingClientRect().height;
    let top = rect.bottom + 6;
    if (top + menuHeight > innerHeight - 8 && rect.top - menuHeight - 6 >= 8) {
        top = rect.top - menuHeight - 6;
    }
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));

    menu.style.setProperty('left', `${Math.round(left)}px`, 'important');
    menu.style.setProperty('top', `${Math.round(top)}px`, 'important');
    menu.style.setProperty('right', 'auto', 'important');
    menu.style.setProperty('bottom', 'auto', 'important');
};

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    const content = favFavoritesContentColumn0120();
    if (content) favInstallCollectionStrip0120(content);
    if (!favSortMenuNode?.()?.hidden) favPositionSortMenu();
});
