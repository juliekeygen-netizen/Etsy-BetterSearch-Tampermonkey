'use strict';

/* v0.9.7 Favorites UI hotfix.
 * Loaded after the v0.9.6 repair module and before the Favorites runtime.
 * Fixes the sort portal being opened off-screen by older !important Etsy/menu
 * positioning rules, preserves the sort trigger outline on hover, removes the
 * forced empty height from Favorites Settings, and clarifies coverage labels.
 */

function favPositionSortMenu(root = favState.sortRoot) {
    const trigger = root?.querySelector('[aria-haspopup="menu"]');
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!root || !trigger || !menu || menu.hidden) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.ceil(rect.width);

    /* These MUST be inline !important because the earlier native-style menu
     * rules also use !important (notably top/left). A normal inline assignment
     * loses that cascade battle and leaves the opened menu below the viewport.
     */
    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('width', `${width}px`, 'important');
    menu.style.setProperty('min-width', `${width}px`, 'important');
    menu.style.setProperty('max-width', `${Math.max(0, innerWidth - 16)}px`, 'important');

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
}

function favOpenSortMenu(root = favState.sortRoot) {
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (!root || !menu) return;

    favState.sortRoot = root;
    favState.sortMenu = menu;
    menu.removeAttribute('data-ebsf-orphaned');

    document.querySelectorAll('[data-ebsf-sort-menu-portal]').forEach((other) => {
        if (other !== menu) {
            other.hidden = true;
            other.dataset.ebsfOrphaned = '1';
        }
    });

    if (menu.parentElement !== document.body) document.body.append(menu);
    menu.hidden = false;
    menu.style.setProperty('display', 'block', 'important');
    menu.style.setProperty('visibility', 'visible', 'important');
    menu.style.setProperty('opacity', '1', 'important');
    menu.style.setProperty('pointer-events', 'auto', 'important');
    menu.style.setProperty('z-index', '2147483647', 'important');

    const trigger = root.querySelector('[aria-haspopup="menu"]');
    trigger?.setAttribute('aria-expanded', 'true');
    favUpdateSortUi();
    requestAnimationFrame(() => favPositionSortMenu(root));
}

function favCloseSortMenu() {
    const root = favState.sortRoot;
    const menu = root?.__ebsfSortMenu || favState.sortMenu;
    if (menu) {
        menu.hidden = true;
        for (const prop of [
            'display', 'visibility', 'opacity', 'pointer-events', 'z-index',
            'position', 'left', 'top', 'right', 'bottom', 'width', 'min-width', 'max-width'
        ]) menu.style.removeProperty(prop);
    }
    root?.querySelector('[aria-haspopup="menu"]')?.setAttribute('aria-expanded', 'false');
}

/* Keep the existing stats calculation, only make the compact coverage value
 * self-explanatory inside its cell. */
var favRefreshSettingsStatusBefore097 = favRefreshSettingsStatus;
favRefreshSettingsStatus = async function favRefreshSettingsStatus097() {
    await favRefreshSettingsStatusBefore097();
    const layer = favState.settingsModal;
    const node = layer?.querySelector('[data-ebsf-status="favoritesCoverage"]');
    if (!node) return;
    const text = String(node.textContent || '').trim();
    if (!text || text === 'Unavailable' || /^Favs:/i.test(text)) return;
    const parts = text.split(/\s*&\s*/);
    if (parts.length === 2) node.textContent = `Favs: ${parts[0]} & Shops: ${parts[1]}`;
};

GM_addStyle(`
  /* The sort pill keeps the same visible outline in every interaction state. */
  .ebsf-sort>button,
  .ebsf-sort>button:hover,
  .ebsf-sort>button:focus,
  .ebsf-sort>button:focus-visible,
  .ebsf-sort>button:active,
  .ebsf-sort>button[aria-expanded="true"]{
    border:1px solid #222!important;
    background:#fff!important;
    box-shadow:none!important;
    outline-offset:2px;
  }

  /* Explicitly counter Etsy/wt-menu hidden/animation state when our body-level
   * portal is open. Position is still calculated by favPositionSortMenu(). */
  .ebsf-sort-menu-096:not([hidden]){
    display:block!important;
    visibility:visible!important;
    opacity:1!important;
    pointer-events:auto!important;
    z-index:2147483647!important;
  }

  /* Let Favorites Settings size to its content instead of reserving a fixed
   * 900px-tall panel. It still gets an internal scrollbar on short viewports. */
  .ebsf-settings-modal-096{
    height:auto!important;
    min-height:0!important;
    max-height:min(900px,calc(100vh - 28px))!important;
  }
  .ebsf-settings-modal-096 .ebsf-settings-editor{
    flex:0 1 auto!important;
    height:auto!important;
    min-height:0!important;
    max-height:calc(100vh - 176px)!important;
    overflow-y:auto!important;
    overscroll-behavior:contain!important;
  }

  @media(max-width:620px){
    .ebsf-settings-modal-096{
      height:auto!important;
      max-height:calc(100vh - 12px)!important;
    }
    .ebsf-settings-modal-096 .ebsf-settings-editor{
      max-height:calc(100vh - 154px)!important;
    }
  }
`);
