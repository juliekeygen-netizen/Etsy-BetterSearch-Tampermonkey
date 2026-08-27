'use strict';

/* v0.12.1 Favorites revamp stability guard.
 *
 * The v0.12 shell is intentionally layered over older Favorites modules. This
 * final module prevents those older geometry/lifecycle helpers from fighting
 * the permanent desktop shell and makes the shell self-healing when Etsy soft
 * rerenders its React-owned Favorites DOM.
 */

favState.shellInstalling0123 = false;
favState.shellRepairFrame0123 = 0;

function favShellSignature0123() {
    const scope=favScope();
    return JSON.stringify({
        type:scope.type,
        id:scope.id,
        collections:favCollections0120().map(({id,slug,name,url})=>[id,slug,name,url]),
    });
}

function favCollectionStripIntact0123(node, signature=favShellSignature0123()) {
    if(!node?.matches?.('nav[data-ebsf-collection-strip]'))return false;
    if(node.dataset.ebsfCollectionSignature!==signature)return false;
    const fixed=node.querySelector(':scope > .ebsf-collection-fixed');
    const scroll=node.querySelector(':scope > .ebsf-collection-scroll');
    if(!fixed||!scroll)return false;
    if(!fixed.querySelector(':scope > .ebsf-all-pill'))return false;
    if(!fixed.querySelector(':scope > .ebsf-collection-add'))return false;
    /* A WtPagination action group inside our fixed slot is a corruption
     * signature seen during Etsy soft rerenders. Never accept it merely because
     * the data signature still matches. */
    if(fixed.querySelector('.wt-action-group__item-container,[data-clg-id="WtPagination"]'))return false;
    return true;
}

favInstallCollectionStrip0120 = function favInstallCollectionStrip0123(content) {
    if(!content)return;
    const signature=favShellSignature0123();
    let current=content.querySelector(':scope > [data-ebsf-collection-strip]')
        || document.querySelector('[data-ebsf-collection-strip]');
    if(!favCollectionStripIntact0123(current,signature)){
        const replacement=favBuildCollectionStrip0120();
        replacement.dataset.ebsfCollectionSignature=signature;
        if(current?.isConnected)current.replaceWith(replacement);
        current=replacement;
    }
    if(current.parentElement!==content||content.firstElementChild!==current)content.prepend(current);
    favState.collectionStrip0120=current;
};

/* Keep the All header in exactly one place. The previous implementation called
 * strip.after(header) on every shell pass even when it was already correct;
 * that produces a childList mutation and can feed the shell observer forever. */
favEnsureAllHeader0120 = function favEnsureAllHeader0123(content) {
    if(favScope().type!=='items'){favReleaseAllHeader0121(content);return null;}
    let header=content?.querySelector?.(':scope > [data-ebsf-all-header]')
        || document.querySelector('[data-ebsf-all-header]');
    if(!header){
        header=document.createElement('section');
        header.className='ebsf-scope-header';
        header.dataset.ebsfAllHeader='';
        header.innerHTML='<div class="ebsf-scope-copy"><h2 class="wt-text-title-large">All</h2><p data-ebsf-scope-meta><b>Private collection</b><span class="wt-pr-xs-1 wt-pl-xs-1">|</span><span data-ebsf-scope-count></span></p></div><div class="ebsf-scope-controls"></div>';
    }

    const strip=content?.querySelector?.(':scope > [data-ebsf-collection-strip]');
    if(strip){
        if(header.parentElement!==content||strip.nextElementSibling!==header)strip.after(header);
    }else if(content&&(header.parentElement!==content||content.firstElementChild!==header)){
        content.prepend(header);
    }

    const toolbar=document.querySelector('[data-ebsf-toolbar-row]');
    if(toolbar&&!header.querySelector('[data-ebsf-toolbar-row]')){
        if(!toolbar.closest('[data-ebsf-all-header]')){
            const parent=toolbar.parentNode;
            if(parent?.isConnected)favState.toolbarOrigin0121={parent,next:toolbar.nextSibling};
        }
        header.querySelector('.ebsf-scope-controls')?.append(toolbar);
    }
    favState.scopeHeader0120=header;
    return header;
};

/* v0.9.6/v0.10 preserved Etsy's old search width by writing an inline negative
 * margin and fixed widths. That geometry is incompatible with the v0.12
 * two-column/stacked shell and survives CSS because it is inline !important.
 * The final shell lets its own responsive CSS own geometry instead. */
favRepairToolbarLayout = function favRepairToolbarLayout0123() {
    const anchor=favSearchAnchor();
    if(!anchor)return;
    const row=anchor.searchSlot?.closest?.('[data-ebsf-toolbar-row]');
    if(!row)return;

    row.classList.remove('ebsf-toolbar-preserve-search','ebsf-toolbar-compact');
    for(const property of ['width','max-width','margin-left','transform','flex'])row.style.removeProperty(property);
    for(const property of ['flex','width','max-width'])anchor.searchSlot.style.removeProperty(property);
    if(typeof favToolbarGeometrySnapshots010!=='undefined')favToolbarGeometrySnapshots010.delete(row);
};

function favCategoryBindingEnabled0123(bindingKey) {
    return !bindingKey.startsWith('category:')||favVisibleBindingCount0120(bindingKey)>0;
}

var favBindingAvailableBefore0123=favBindingAvailable0120;
favBindingAvailable0120=function favBindingAvailable0123(bindingKey){
    if(bindingKey.startsWith('category:')&&!favCategoryBindingEnabled0123(bindingKey))return false;
    return favBindingAvailableBefore0123(bindingKey);
};

/* The legacy category builder is still reachable from older event handlers.
 * Make it obey layout-v2 visibility too so a hidden editor category cannot
 * reappear through a legacy redraw path. */
favBuildCategory=function favBuildCategory0123(){
    const wrap=document.createElement('div');wrap.className='ebsf-native-group ebsf-category-list';
    const all=document.createElement('button');all.type='button';all.className='ebsf-native-link';all.dataset.ebsfAllCategories='';all.textContent='All categories';all.classList.toggle('is-selected',!favCfg.filters.category);all.setAttribute('aria-pressed',String(!favCfg.filters.category));
    all.addEventListener('click',()=>{favCfg.filters.category='';favSaveAndApply(true);favReplaceSectionBody('category',favBuildCategory);});wrap.append(all);
    for(const [value,label] of FAV_NATIVE_CATEGORIES_){
        const bindingKey=`category:${value}`;
        if(!favCategoryBindingEnabled0123(bindingKey)||!favBindingAvailable0120(bindingKey))continue;
        const button=document.createElement('button');button.type='button';button.className='ebsf-native-link';button.textContent=label;button.dataset.ebsfBinding=bindingKey;button.classList.toggle('is-selected',favCfg.filters.category===value);button.setAttribute('aria-pressed',String(favCfg.filters.category===value));
        button.addEventListener('click',()=>{favCfg.filters.category=value;favSaveAndApply(true);favReplaceSectionBody('category',favBuildCategory);});wrap.append(button);
    }
    return wrap;
};

function favRefreshDrawerVisibility0123() {
    const rail=favState.rail;if(!rail?.isConnected)return;
    for(const section of rail.querySelectorAll('[data-ebsf-drawer-instance]')){
        const drawer=favFindDrawer0120(section.dataset.ebsfDrawerInstance);
        if(!drawer){section.hidden=true;continue;}
        if(drawer.hidden){section.hidden=true;continue;}
        if(favAvailabilityMode0110()==='disabled'){section.hidden=false;continue;}
        const options=Array.from(section.querySelectorAll('[data-ebsf-option-instance]'));
        section.hidden=options.length>0&&!options.some((option)=>!option.hidden);
    }
}

var favRefreshFacetAvailabilityBefore0123=favRefreshFacetAvailability0120;
favRefreshFacetAvailability0120=function favRefreshFacetAvailability0123(){
    const result=favRefreshFacetAvailabilityBefore0123();
    favRefreshDrawerVisibility0123();
    return result;
};

function favOwnedShellNode0123(node) {
    if(node?.nodeType!==1)return false;
    return Boolean(node.matches?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]')
        ||node.closest?.('[data-ebsf-collection-strip],[data-ebsf-all-header],[data-ebsf-rail],[data-ebsf-results-loading],[data-ebsf-sort-menu-portal]'));
}

function favNativeShellNode0123(node) {
    if(node?.nodeType!==1||favOwnedShellNode0123(node))return false;
    const selector='[data-testid="sidebar"],.phase3-listing-cards-section,.favorites-landing-phase3-header,#collections-landing-right-side-header-container,nav[data-clg-id="WtPagination"][aria-label="Favorite Items Page Results"]';
    return Boolean(node.matches?.(selector)||node.querySelector?.(selector));
}

function favScheduleShellRepair0123() {
    if(favState.shellRepairFrame0123)return;
    favState.shellRepairFrame0123=requestAnimationFrame(()=>{
        favState.shellRepairFrame0123=0;
        if(!isFavoritesPage())return;
        favInstallPageShell0120();
        favRepairToolbarLayout();
    });
}

/* Replace the first v0.12 observer. It watched BetterSearch's own strip/header
 * nodes, so an idempotence bug could make BetterSearch respond to itself every
 * animation frame. Only native Etsy structural mutations are shell triggers. */
favState.shellObserver0120?.disconnect?.();
favState.shellObserver0120=new MutationObserver((records)=>{
    const relevant=records.some((record)=>{
        if(favOwnedShellNode0123(record.target))return false;
        const changed=[...Array.from(record.addedNodes||[]),...Array.from(record.removedNodes||[])];
        if(changed.some(favNativeShellNode0123))return true;
        const nativeTarget=record.target?.nodeType===1&&record.target.matches?.('[data-testid="sidebar"],.favorites-landing-phase3-header,#collections-landing-right-side-header-container');
        return Boolean(nativeTarget&&changed.some((node)=>node.nodeType===1&&!favOwnedShellNode0123(node)));
    });
    if(relevant)favScheduleShellRepair0123();
});
favState.shellObserver0120.observe(document.body,{childList:true,subtree:true});

var favInstallPageShellBefore0123=favInstallPageShell0120;
favInstallPageShell0120=function favInstallPageShell0123(){
    if(favState.shellInstalling0123)return;
    favState.shellInstalling0123=true;
    try{
        const result=favInstallPageShellBefore0123();
        favRepairToolbarLayout();
        favRefreshDrawerVisibility0123();
        return result;
    }finally{
        favState.shellInstalling0123=false;
    }
};

window.addEventListener('resize',()=>requestAnimationFrame(()=>{
    favRepairToolbarLayout();
    if(isFavoritesPage())favInstallPageShell0120();
}),{passive:true});

GM_addStyle(`
  /* Final v0.12 shell owns toolbar geometry; never let the legacy negative
   * margin/fixed-width compensation leak into this layout. */
  @media(min-width:900px){
    .ebsf-scope-header .ebsf-scope-controls{
      min-width:0!important;
      width:100%!important;
      max-width:100%!important;
    }
    .ebsf-scope-header .ebsf-scope-controls .ebsf-toolbar-row{
      min-width:0!important;
      width:100%!important;
      max-width:100%!important;
      margin-left:0!important;
      transform:none!important;
      display:flex!important;
      flex-wrap:nowrap!important;
    }
    .ebsf-scope-header .ebsf-search-left-controls{
      flex:0 0 auto!important;
      min-width:0!important;
    }
    .ebsf-scope-header .ebsf-native-search-slot{
      min-width:150px!important;
      width:auto!important;
      max-width:380px!important;
      flex:1 1 260px!important;
    }
  }
  @media(min-width:900px) and (max-width:1320px){
    .ebsf-scope-header{
      grid-template-columns:minmax(0,1fr)!important;
      align-items:start!important;
      gap:10px!important;
    }
    .ebsf-scope-controls{
      grid-column:1!important;
      justify-self:stretch!important;
    }
  }
`);

/* The runtime starts in module 86 before this final guard is evaluated, so
 * normalize any shell that was already mounted during initial hydration. */
requestAnimationFrame(()=>{
    if(!isFavoritesPage())return;
    favRepairToolbarLayout();
    favInstallPageShell0120();
    favScheduleFacetAvailability0121();
});
