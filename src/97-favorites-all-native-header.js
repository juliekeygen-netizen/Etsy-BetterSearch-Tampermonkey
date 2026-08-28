'use strict';

/* v0.12.12 literal native-header parity for the All Favorites scope.
 *
 * Collection pages are the visual source of truth. The All header uses the same
 * Etsy container ids, utility classes, title anatomy, metadata row, parent host
 * and toolbar host. Because the real collection title row also contains edit +
 * add icon buttons, All keeps invisible, non-interactive geometry twins for
 * those controls so its title/metadata/toolbar dimensions remain identical.
 *
 * This final parity pass also decouples Search width from collection-title width:
 * Sort has one shared measured width and Search gets one shared responsive width
 * derived from the complete header. Loading progress is removed from document
 * flow and rendered on the metadata baseline at the far right of the header.
 */

var FAV_SHARED_SEARCH_RATIO0134 = 0.5;

/* Keep the complete longest Sort label, but remove the last bit of dead space.
 * Every Favorites scope uses this same measurement through the shared toolbar
 * geometry helper below, so route changes cannot restore a wider stale value. */
favSortTriggerWidth = function favSortTriggerWidth0134(measure) {
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

function favSharedToolbarGeometry0134() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    const row = root?.closest?.('[data-ebsf-toolbar-row]') || document.querySelector('[data-ebsf-toolbar-row]');
    const header = row?.closest?.('#collections-landing-phase-3-header-container')
        || document.querySelector('#collections-landing-phase-3-header-container');
    if (!root || !row || !header) return;

    favMeasureSortTrigger?.(root);
    const measured = root.style.getPropertyValue('--ebsf-sort-trigger-width').trim();
    if (measured) {
        document.documentElement.style.setProperty('--ebsf-shared-sort-width0134', measured);
        row.style.setProperty('--ebsf-narrow-sort-width', measured);
    }

    if (innerWidth <= 760) {
        row.style.removeProperty('--ebsf-shared-search-width0134');
        return;
    }

    const headerWidth = header.getBoundingClientRect().width;
    const rowWidth = row.getBoundingClientRect().width;
    const sortWidth = Number.parseFloat(measured) || 180;
    const availableForSearch = Math.max(0, rowWidth - sortWidth - 40 - 12);
    const sharedSearchWidth = Math.min(headerWidth * FAV_SHARED_SEARCH_RATIO0134, availableForSearch);
    if (sharedSearchWidth > 0) {
        row.style.setProperty('--ebsf-shared-search-width0134', `${Math.round(sharedSearchWidth * 100) / 100}px`);
    }
}

/* Module 94 owns the route/resize hooks for Sort sizing. Rebind its public
 * helper so every later call applies the same measurement and Search target to
 * All and collection pages instead of preserving a scope-specific stale width. */
favSyncNarrowSortWidth0128 = function favSyncNarrowSortWidth0134() {
    favSharedToolbarGeometry0134();
};

function favProgressMeta0134(header) {
    if (!header) return null;
    if (favScope().type === 'items') return header.querySelector('[data-ebsf-scope-meta]');
    return document.querySelector('[data-test-id="collections-landing-right-side-header"],[data-testid="collections-landing-right-side-header"]');
}

function favPositionProgress0134(node = favState.progressNode) {
    if (!node) return false;
    const header = document.querySelector('#collections-landing-phase-3-header-container');
    const meta = favProgressMeta0134(header);
    if (!header || !meta) return false;

    node.classList.add('ebsf-progress-inline0134');
    node.dataset.ebsfProgressInline = '';
    if (node.parentElement !== header) header.append(node);

    const headerRect = header.getBoundingClientRect();
    const metaRect = meta.getBoundingClientRect();
    if (!headerRect.width || !metaRect.height) return true;
    node.style.setProperty('--ebsf-progress-top0134', `${Math.max(0, metaRect.top - headerRect.top)}px`);
    node.style.setProperty('--ebsf-progress-height0134', `${Math.max(16, metaRect.height)}px`);
    return true;
}

/* The original data loader prepended .ebsf-progress to the listing section,
 * which inserted a whole row above the collection title/header. Keep the same
 * status text and aria-live behavior, but mount it absolutely inside the native
 * header on the metadata baseline so it never changes layout height. */
favProgress = function favProgress0134(text) {
    let node = favState.progressNode;
    if (!node) {
        node = document.createElement('div');
        node.className = 'ebsf-progress wt-text-body-small ebsf-progress-inline0134';
        node.dataset.ebsfProgressInline = '';
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
        favState.progressNode = node;
    }
    node.textContent = text;
    if (!favPositionProgress0134(node)) requestAnimationFrame(() => favPositionProgress0134(node));
};

favClearProgress = function favClearProgress0134() {
    favState.progressNode?.remove();
    favState.progressNode = null;
};

function favRefreshAllNativeCollectionParity0134() {
    if (!isFavoritesPage()) return;

    const sidebar = document.querySelector('[data-testid="sidebar"]');
    const content = favFavoritesContentColumn0120?.(sidebar);
    if (favScope().type === 'items' && content) favEnsureAllHeader0120(content);

    favClearFinalToolbarGeometry0131?.();
    favSharedToolbarGeometry0134();
    favApplyScopeMetaDensity0131?.();
    favApplyCollectionMetaDensity0126?.();
    favPositionProgress0134();
}

/* Shell repair runs on soft route changes and Etsy rerenders. Make final toolbar
 * and progress geometry part of that same idempotent repair boundary. */
var favInstallPageShellBefore0134 = favInstallPageShell0120;
favInstallPageShell0120 = function favInstallPageShell0134() {
    const result = favInstallPageShellBefore0134?.();
    requestAnimationFrame(() => {
        if (!isFavoritesPage()) return;
        favSharedToolbarGeometry0134();
        favPositionProgress0134();
    });
    return result;
};

GM_addStyle(`
  /* Geometry-only twins of the native collection edit/+ buttons. They occupy
   * the same title-row boxes but can never be seen, focused or clicked. */
  [data-ebsf-all-title-spacer],
  [data-ebsf-all-title-spacer] *{
    visibility:hidden!important;
    pointer-events:none!important;
    user-select:none!important;
  }

  #collections-landing-phase-3-header-container{
    position:relative!important;
  }
  .ebsf-progress-inline0134{
    position:absolute!important;
    top:var(--ebsf-progress-top0134,auto)!important;
    right:0!important;
    height:var(--ebsf-progress-height0134,18px)!important;
    display:flex!important;
    align-items:center!important;
    justify-content:flex-end!important;
    max-width:46%!important;
    margin:0!important;
    padding:0!important;
    border:0!important;
    background:transparent!important;
    color:#595959!important;
    font-size:12px!important;
    line-height:1.2!important;
    white-space:nowrap!important;
    overflow:hidden!important;
    text-overflow:ellipsis!important;
    pointer-events:none!important;
    z-index:2!important;
  }

  @media(min-width:761px){
    .ebsf-toolbar-row{
      grid-template-columns:var(--ebsf-shared-sort-width0134,180px) 40px minmax(0,var(--ebsf-shared-search-width0134,50%))!important;
      justify-content:end!important;
    }
  }
  @media(max-width:760px){
    .ebsf-toolbar-row{
      grid-template-columns:max-content var(--ebsf-shared-sort-width0134,180px) 40px minmax(0,1fr)!important;
    }
    .ebsf-progress-inline0134{
      max-width:42%!important;
      font-size:11px!important;
    }
  }
  @media(max-width:520px){
    .ebsf-toolbar-row{
      grid-template-columns:40px clamp(152px,30vw,182px) 40px minmax(0,1fr)!important;
    }
  }
`);

window.addEventListener('resize', () => requestAnimationFrame(favRefreshAllNativeCollectionParity0134), { passive:true });
document.fonts?.ready?.then?.(() => requestAnimationFrame(favRefreshAllNativeCollectionParity0134)).catch?.(() => {});

requestAnimationFrame(() => {
    if (!isFavoritesPage()) return;
    favInstallPageShell0120?.();
    /* Runtime may already have emitted the first Loading favorites… update before
     * this final module evaluated. Adopt that existing node into the header. */
    favPositionProgress0134();
    favRefreshAllNativeCollectionParity0134();
});
