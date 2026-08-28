'use strict';

/* v0.12.11 literal native-header parity for the All Favorites scope.
 *
 * Collection pages are the visual source of truth. The All header uses the same
 * Etsy container ids, utility classes, title anatomy, metadata row, parent host
 * and toolbar host. Because the real collection title row also contains edit +
 * add icon buttons, All keeps invisible, non-interactive geometry twins for
 * those controls so its title/metadata/toolbar dimensions remain identical.
 */

/* Keep the complete longest Sort label, but remove the last bit of dead space
 * that remained after v0.12.10. Search still owns all remaining width. */
favSortTriggerWidth = function favSortTriggerWidth0133(measure) {
    const labels = FAV_SORT_DEFINITIONS.flatMap((entry) => entry.reversible ? [entry.normal, entry.reversed] : [entry.normal]);
    return Math.ceil(Math.max(...labels.map((label) => measure(label)), 0) + 24);
};

function favAllTitleSpacerButton0133(kind) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.clgId = 'WtButton';
    button.dataset.ebsfAllTitleSpacer = kind;
    button.className = 'wt-btn wt-btn--tertiary wt-btn--small wt-btn--icon';
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');

    const icon = document.createElement('span');
    icon.className = 'wt-icon--smaller-xs etsy-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = kind === 'add'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false"><path d="M12.696 2.5A1 1 0 0 1 13.694 3.553L13.32 10.68 20.447 10.306A1 1 0 0 1 21.5 11.304V12.696A1 1 0 0 1 20.447 13.694L13.32 13.32 13.694 20.447A1 1 0 0 1 12.696 21.5H11.304A1 1 0 0 1 10.306 20.447L10.68 13.32 3.553 13.694A1 1 0 0 1 2.5 12.696V11.304A1 1 0 0 1 3.553 10.306L10.68 10.68 10.306 3.553A1 1 0 0 1 11.304 2.5z"></path></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false"><path d="M3.2 16.8 15.9 4.1a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L7.2 20.8 2 22z"></path></svg>';
    button.append(icon);
    return button;
}

function favBuildAllNativeCollectionHeader0133() {
    const header = document.createElement('section');
    header.id = 'collections-landing-phase-3-header-container';
    header.className = 'wt-display-flex-xs wt-justify-content-space-between wt-flex-direction-row-lg wt-flex-direction-column-xs';
    header.dataset.ebsfAllHeader = '';
    header.dataset.ebsfNativeCollectionMirror = '2';

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

    /* Native collection markup is: title, <div><edit button></div>, add button.
     * Keep that exact box tree while hiding the two controls visually and from
     * interaction/accessibility. visibility:hidden preserves their native size. */
    const editSpacerWrapper = document.createElement('div');
    editSpacerWrapper.dataset.ebsfAllTitleSpacerWrapper = 'edit';
    editSpacerWrapper.append(favAllTitleSpacerButton0133('edit'));
    const addSpacer = favAllTitleSpacerButton0133('add');
    titleContainer.append(title, editSpacerWrapper, addSpacer);

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

function favAllHeaderIsNativeCollectionMirror0133(header) {
    const spacers = header?.querySelectorAll?.('#collections-landing-left-side-header-title-container [data-ebsf-all-title-spacer]');
    return Boolean(
        header?.matches?.('[data-ebsf-all-header][data-ebsf-native-collection-mirror="2"]')
        && header.id === 'collections-landing-phase-3-header-container'
        && header.querySelector(':scope > #collections-landing-left-side-header-container')
        && header.querySelector('#collections-landing-left-side-header-content')
        && header.querySelector('#collections-landing-left-side-header-title-container')
        && header.querySelector('#collections-landing-left-side-header-title.wt-text-title-large')
        && spacers?.length === 2
        && header.querySelector('[data-ebsf-all-title-spacer-wrapper="edit"] > [data-ebsf-all-title-spacer="edit"]')
        && header.querySelector('#collections-landing-left-side-header-title-container > [data-ebsf-all-title-spacer="add"]')
        && header.querySelector('[data-ebsf-scope-meta]')
        && header.querySelector(':scope > #collections-landing-right-side-header-container > [data-ebsf-all-controls]')
    );
}

favEnsureAllHeader0120 = function favEnsureAllHeader0133(content) {
    if (favScope().type !== 'items') {
        favReleaseAllHeader0121(content);
        return null;
    }

    content = content || favFavoritesContentColumn0120?.();
    if (!content) return null;

    const listingHost = content.querySelector('.phase3-listing-cards-section') || content;
    let header = document.querySelector('[data-ebsf-all-header]');
    let toolbar = header?.querySelector?.('[data-ebsf-toolbar-row]') || document.querySelector('[data-ebsf-toolbar-row]');

    if (!favAllHeaderIsNativeCollectionMirror0133(header)) {
        const oldHeader = header;
        if (toolbar && oldHeader?.contains(toolbar)) toolbar.remove();

        const replacement = favBuildAllNativeCollectionHeader0133();
        if (oldHeader?.isConnected) oldHeader.replaceWith(replacement);
        header = replacement;
    }

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

function favRefreshAllNativeCollectionParity0133() {
    if (!isFavoritesPage()) return;

    const sidebar = document.querySelector('[data-testid="sidebar"]');
    const content = favFavoritesContentColumn0120?.(sidebar);
    if (favScope().type === 'items' && content) favEnsureAllHeader0120(content);

    favClearFinalToolbarGeometry0131?.();
    favSyncNarrowSortWidth0128?.();
    favApplyScopeMetaDensity0131?.();
    favApplyCollectionMetaDensity0126?.();
}

GM_addStyle(`
  /* Geometry-only twins of the native collection edit/+ buttons. They occupy
   * the same title-row boxes but can never be seen, focused or clicked. */
  [data-ebsf-all-title-spacer],
  [data-ebsf-all-title-spacer] *{
    visibility:hidden!important;
    pointer-events:none!important;
    user-select:none!important;
  }

  .ebsf-toolbar-row{
    grid-template-columns:var(--ebsf-narrow-sort-width,180px) 40px minmax(0,1fr)!important;
  }
  @media(max-width:760px){
    .ebsf-toolbar-row{
      grid-template-columns:max-content var(--ebsf-narrow-sort-width,180px) 40px minmax(0,1fr)!important;
    }
  }
  @media(max-width:520px){
    .ebsf-toolbar-row{
      grid-template-columns:40px clamp(152px,30vw,182px) 40px minmax(0,1fr)!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshAllNativeCollectionParity0133), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshAllNativeCollectionParity0133)).catch?.(() => {});

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120?.();
    favRefreshAllNativeCollectionParity0133();
});
