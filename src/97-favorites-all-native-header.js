'use strict';

/* v0.12.10 literal native-header parity for the All Favorites scope.
 *
 * Collection pages are already the visual source of truth. Do not approximate
 * them with another custom All-only layout: build the All header with the same
 * Etsy container ids, utility classes, title anatomy, metadata row, parent host
 * and toolbar host used by the real collection page. The only intentional
 * differences are the title text (All), private metadata, and the absence of
 * edit/add buttons.
 */

/* The collection-page Sort control is already correct; it only needs a very
 * small width trim. Keep measuring the longest possible label and reserve just
 * enough room for native padding + chevron. */
favSortTriggerWidth = function favSortTriggerWidth0132(measure) {
    const labels = FAV_SORT_DEFINITIONS.flatMap((entry) => entry.reversible ? [entry.normal, entry.reversed] : [entry.normal]);
    return Math.ceil(Math.max(...labels.map((label) => measure(label)), 0) + 32);
};

function favBuildAllNativeCollectionHeader0132() {
    const header = document.createElement('section');
    header.id = 'collections-landing-phase-3-header-container';
    header.className = 'wt-display-flex-xs wt-justify-content-space-between wt-flex-direction-row-lg wt-flex-direction-column-xs';
    header.dataset.ebsfAllHeader = '';
    header.dataset.ebsfNativeCollectionMirror = '1';

    const left = document.createElement('div');
    left.id = 'collections-landing-left-side-header-container';
    left.className = 'wt-display-flex-xs wt-align-items-center';

    const leftContent = document.createElement('div');
    leftContent.id = 'collections-landing-left-side-header-content';
    leftContent.className = 'wt-display-flex-xs wt-flex-direction-column-xs wt-flex-gap-xs-1';

    const titleContainer = document.createElement('div');
    titleContainer.id = 'collections-landing-left-side-header-title-container';
    titleContainer.className = 'wt-display-flex-xs wt-align-items-center wt-flex-gap-xs-2';

    const title = document.createElement('h2');
    title.id = 'collections-landing-left-side-header-title';
    title.className = 'wt-text-title-large';
    const titleText = document.createElement('span');
    titleText.dataset.testId = 'unsanitize';
    titleText.textContent = 'All';
    title.append(titleText);
    titleContainer.append(title);

    const metaContainer = document.createElement('div');
    metaContainer.className = 'wt-display-flex-xs';
    const meta = document.createElement('p');
    meta.dataset.ebsfScopeMeta = '';

    const privacy = document.createElement('b');
    if (typeof favPrivateIconMarkup0131 === 'function') {
        const iconHolder = document.createElement('span');
        iconHolder.innerHTML = favPrivateIconMarkup0131();
        if (iconHolder.firstElementChild) privacy.append(iconHolder.firstElementChild);
    }
    privacy.append(document.createTextNode(' Private collection'));

    const divider = document.createElement('span');
    divider.className = 'wt-pr-xs-1 wt-pl-xs-1';
    divider.textContent = '|';

    const count = document.createElement('span');
    count.dataset.ebsfScopeCount = '';

    meta.append(privacy, divider, count);
    metaContainer.append(meta);
    leftContent.append(titleContainer, metaContainer);
    left.append(leftContent);

    const right = document.createElement('div');
    right.id = 'collections-landing-right-side-header-container';
    const controls = document.createElement('div');
    controls.className = 'wt-display-flex-md wt-flex-grow-xs-1 wt-align-items-center wt-width-full wt-align-self-flex-end';
    controls.dataset.ebsfAllControls = '';
    right.append(controls);

    header.append(left, right);
    return header;
}

function favAllHeaderIsNativeCollectionMirror0132(header) {
    return Boolean(
        header?.matches?.('[data-ebsf-all-header][data-ebsf-native-collection-mirror="1"]')
        && header.id === 'collections-landing-phase-3-header-container'
        && header.querySelector(':scope > #collections-landing-left-side-header-container')
        && header.querySelector('#collections-landing-left-side-header-content')
        && header.querySelector('#collections-landing-left-side-header-title-container')
        && header.querySelector('#collections-landing-left-side-header-title.wt-text-title-large')
        && header.querySelector('[data-ebsf-scope-meta]')
        && header.querySelector(':scope > #collections-landing-right-side-header-container > [data-ebsf-all-controls]')
    );
}

/* Replace the old custom .ebsf-scope-header implementation completely. The
 * native collection header lives INSIDE .phase3-listing-cards-section, not as a
 * sibling between the collection strip and listing section. That parent
 * difference was one of the remaining reasons All still had different spacing
 * even when its inner classes looked similar. */
favEnsureAllHeader0120 = function favEnsureAllHeader0132(content) {
    if (favScope().type !== 'items') {
        favReleaseAllHeader0121(content);
        return null;
    }

    content = content || favFavoritesContentColumn0120?.();
    if (!content) return null;

    const listingHost = content.querySelector('.phase3-listing-cards-section') || content;
    let header = document.querySelector('[data-ebsf-all-header]');
    let toolbar = header?.querySelector?.('[data-ebsf-toolbar-row]') || document.querySelector('[data-ebsf-toolbar-row]');

    if (!favAllHeaderIsNativeCollectionMirror0132(header)) {
        /* If an older All header already owns the toolbar, detach the live node
         * before replacing the old shell so we preserve all bound controls. */
        const oldHeader = header;
        if (toolbar && oldHeader?.contains(toolbar)) toolbar.remove();

        const replacement = favBuildAllNativeCollectionHeader0132();
        if (oldHeader?.isConnected) oldHeader.replaceWith(replacement);
        header = replacement;
    }

    /* Match real collection DOM placement exactly: the header is the first
     * structural child of the listing section. The custom collection strip
     * remains immediately above that section in the outer content branch. */
    if (header.parentElement !== listingHost || listingHost.firstElementChild !== header) {
        listingHost.prepend(header);
    }

    const controls = header.querySelector('[data-ebsf-all-controls]');
    if (toolbar && controls && toolbar.parentElement !== controls) {
        if (!header.contains(toolbar) && !favState.toolbarOrigin0121?.parent?.isConnected && toolbar.parentNode) {
            favState.toolbarOrigin0121 = { parent:toolbar.parentNode, next:toolbar.nextSibling };
        }
        controls.append(toolbar);
    }

    favState.scopeHeader0120 = header;
    favApplyScopeMetaDensity0131?.();
    return header;
};

function favRefreshAllNativeCollectionParity0132() {
    if (!isFavoritesPage()) return;

    const sidebar = document.querySelector('[data-testid="sidebar"]');
    const content = favFavoritesContentColumn0120?.(sidebar);
    if (favScope().type === 'items' && content) favEnsureAllHeader0120(content);

    favClearFinalToolbarGeometry0131?.();
    favSyncNarrowSortWidth0128?.();
    favApplyScopeMetaDensity0131?.();
    favApplyCollectionMetaDensity0126?.();
}

/* Module 96's All-only selectors used .ebsf-scope-header/.ebsf-scope-copy/
 * .ebsf-scope-controls. The literal mirror intentionally has none of those
 * classes, so only the same generic/id rules that already make collection pages
 * look correct apply here. The only final geometry change is the slight Sort
 * width reduction requested for both scopes. */
GM_addStyle(`
  .ebsf-toolbar-row{
    grid-template-columns:var(--ebsf-narrow-sort-width,188px) 40px minmax(0,1fr)!important;
  }
  @media(max-width:760px){
    .ebsf-toolbar-row{
      grid-template-columns:max-content var(--ebsf-narrow-sort-width,188px) 40px minmax(0,1fr)!important;
    }
  }
  @media(max-width:520px){
    .ebsf-toolbar-row{
      grid-template-columns:40px clamp(156px,31vw,190px) 40px minmax(0,1fr)!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshAllNativeCollectionParity0132), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshAllNativeCollectionParity0132)).catch?.(() => {});

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120?.();
    favRefreshAllNativeCollectionParity0132();
});
