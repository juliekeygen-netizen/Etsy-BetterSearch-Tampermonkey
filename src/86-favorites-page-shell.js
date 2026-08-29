'use strict';

/* v0.12.0 Favorites page shell: permanent desktop rail, collection strip,
 * collection-style All header, truthful counts, non-destructive loading state
 * and native Etsy pagination styling.
 */

favState.nativeSource0120 = favState.nativeSource0120 || null;
favState.collectionStrip0120 = null;
favState.scopeHeader0120 = null;
favState.loadingPlaceholder0120 = null;
favState.collectionModel0120 = favState.collectionModel0120 || null;
favState.nativePagination0120 = favState.nativePagination0120 || null;
favState.shellDesktop0120 = innerWidth >= 900;
favState.toolbarOrigin0121 = favState.toolbarOrigin0121 || null;

function favDesktopShell0120() { return innerWidth >= 900; }

function favFavoritesContentColumn0120(sidebar = document.querySelector('[data-testid="sidebar"]')) {
    const parent=sidebar?.parentElement;if(!parent)return null;
    const listing=document.querySelector('.phase3-listing-cards-section');
    if(listing&&parent.contains(listing)){let branch=listing;while(branch.parentElement&&branch.parentElement!==parent)branch=branch.parentElement;if(branch.parentElement===parent&&branch!==sidebar)return branch;}
    return Array.from(parent.children).find((child)=>child!==sidebar&&!child.matches?.('[data-testid="sidebar"]'))||null;
}

function favCaptureNativeSource0120(sidebar) {
    let source=sidebar.querySelector(':scope > .ebsf-native-favorites-source');
    if(!source){source=document.createElement('div');source.className='ebsf-native-favorites-source';source.hidden=true;source.inert=true;sidebar.prepend(source);}
    /* Etsy may append a fresh native nav after BetterSearch has already
     * captured the original one. Recapture every stray child on every shell
     * pass instead of returning early, otherwise Items/Collections/Shops can
     * reappear above and below the permanent rail. */
    const children=Array.from(sidebar.childNodes).filter((node)=>node!==source&&!node.matches?.('[data-ebsf-rail]'));
    if(children.length)source.append(...children);
    source.hidden=true;source.inert=true;favState.nativeSource0120=source;return source;
}

function favNativeItemsLink0120() {
    return favState.nativeSource0120?.querySelector('a[href*="tab=items"]')||document.querySelector('a.sidebar__link[href*="tab=items"]');
}

function favNativeCreateButton0120() {
    return favState.nativeSource0120?.querySelector('[data-testid="add-collection-button"]')||document.querySelector('[data-testid="add-collection-button"]');
}

function favCollections0120() {
    const current=Array.isArray(favProps()?.collectionsTabs)?favProps().collectionsTabs:null;
    if(current)favState.collectionModel0120=current;
    return (Array.isArray(current)?current:(favState.collectionModel0120||[]))
        .filter((entry)=>entry?.__type==='collection'&&entry.url&&entry.name)
        .map((entry)=>({id:String(entry.id||''),slug:String(entry.slug||''),name:String(entry.name||''),url:String(entry.url||''),privacyLevel:String(entry.privacyLevel||'')}));
}

function favApplyNativeControlTheme0120(root) {
    const input=favSearchInput();if(!root||!input)return;
    const style=getComputedStyle(input);const border=getComputedStyle(input.closest('.wt-input-btn-group')||input);
    root.style.setProperty('--ebsf-control-bg',style.backgroundColor||'transparent');
    root.style.setProperty('--ebsf-control-color',style.color||'currentColor');
    root.style.setProperty('--ebsf-control-border',border.borderColor||style.borderColor||'currentColor');
    root.style.setProperty('--ebsf-control-font',style.fontFamily||'inherit');
    root.style.setProperty('--ebsf-control-size',style.fontSize||'13px');
}

function favCollectionSignature0120(collections=favCollections0120()) {
    return JSON.stringify(collections.map(({id,slug,name,url})=>[id,slug,name,url]));
}

async function favRefreshCollectionModel0120() {
    try{
        const response=await fetch(location.href,{credentials:'include',headers:{Accept:'text/html,application/xhtml+xml'}});
        if(!response.ok)return false;
        const doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const props=favProps(doc);if(!Array.isArray(props?.collectionsTabs))return false;
        const before=favCollectionSignature0120();favState.collectionModel0120=props.collectionsTabs;
        if(before!==favCollectionSignature0120()){const sidebar=document.querySelector('[data-testid="sidebar"]');const content=favFavoritesContentColumn0120(sidebar);if(content)favInstallCollectionStrip0120(content);return true;}
    }catch(error){console.warn('[Etsy BetterSearch] Could not refresh the collection selector:',error);}
    return false;
}

function favWatchCollectionCreation0120() {
    let sawDialog=false;const observer=new MutationObserver(()=>{const dialog=document.querySelector('[role="dialog"]');if(dialog)sawDialog=true;if(sawDialog&&!dialog){observer.disconnect();void favRefreshCollectionModel0120();}});
    observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),120000);
}

function favBindCollectionScroller0120(scroller) {
    let pointerId=null,startX=0,startLeft=0,moved=false;
    scroller.addEventListener('pointerdown',(event)=>{if(event.button!==0)return;pointerId=event.pointerId;startX=event.clientX;startLeft=scroller.scrollLeft;moved=false;scroller.setPointerCapture?.(pointerId);scroller.classList.add('is-dragging');});
    scroller.addEventListener('pointermove',(event)=>{if(pointerId!==event.pointerId)return;const delta=event.clientX-startX;if(Math.abs(delta)>4)moved=true;scroller.scrollLeft=startLeft-delta;});
    const finish=(event)=>{if(pointerId!==event.pointerId)return;scroller.releasePointerCapture?.(pointerId);pointerId=null;scroller.classList.remove('is-dragging');};
    scroller.addEventListener('pointerup',finish);scroller.addEventListener('pointercancel',finish);
    scroller.addEventListener('click',(event)=>{if(moved){event.preventDefault();event.stopImmediatePropagation();moved=false;}},true);
    scroller.addEventListener('wheel',(event)=>{if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){scroller.scrollLeft+=event.deltaY;event.preventDefault();}},{passive:false});
    scroller.addEventListener('keydown',(event)=>{const step=Math.max(100,scroller.clientWidth*.35);if(event.key==='ArrowLeft'){scroller.scrollBy({left:-step,behavior:'smooth'});event.preventDefault();}else if(event.key==='ArrowRight'){scroller.scrollBy({left:step,behavior:'smooth'});event.preventDefault();}else if(event.key==='Home'){scroller.scrollTo({left:0,behavior:'smooth'});event.preventDefault();}else if(event.key==='End'){scroller.scrollTo({left:scroller.scrollWidth,behavior:'smooth'});event.preventDefault();}});
}

function favBuildCollectionStrip0120() {
    const strip=document.createElement('nav');strip.className='ebsf-collection-strip';strip.dataset.ebsfCollectionStrip='';strip.setAttribute('aria-label','Favorite collections');
    const fixed=document.createElement('div');fixed.className='ebsf-collection-fixed';const scope=favScope();
    const nativeAll=favNativeItemsLink0120();const all=document.createElement('a');all.className='ebsf-collection-pill ebsf-all-pill';all.href=nativeAll?.getAttribute('href')||`/people/${encodeURIComponent(favProfileLogin())}?tab=items&ref=phase3_fl`;
    all.innerHTML=`${nativeAll?.querySelector('.etsy-icon')?.outerHTML||''}<span>All</span>`;if(scope.type==='items'){all.classList.add('is-active');all.setAttribute('aria-current','page');}fixed.append(all);
    const nativeCreate=favNativeCreateButton0120();const add=document.createElement('button');add.type='button';add.className='ebsf-collection-add';add.setAttribute('aria-label','Create new collection');add.innerHTML=nativeCreate?.querySelector('.etsy-icon')?.outerHTML||'<span aria-hidden="true">+</span>';add.disabled=!nativeCreate;add.addEventListener('click',()=>{favWatchCollectionCreation0120();nativeCreate?.click();});fixed.append(add);strip.append(fixed);
    const scroller=document.createElement('div');scroller.className='ebsf-collection-scroll';scroller.tabIndex=0;scroller.setAttribute('aria-label','Collections. Drag or use arrow keys to scroll.');
    for(const collection of favCollections0120()){
        const link=document.createElement('a');link.className='ebsf-collection-pill';link.href=collection.url;link.textContent=collection.name;link.dataset.collectionSlug=collection.slug;
        if(scope.type==='collection'&&scope.id===collection.slug){link.classList.add('is-active');link.setAttribute('aria-current','page');}scroller.append(link);
    }
    strip.append(scroller);favBindCollectionScroller0120(scroller);favApplyNativeControlTheme0120(strip);return strip;
}

function favRemoveWhatsNew0120(content) {
    if(favScope().type!=='items')return;
    content?.querySelectorAll('.expanded-updates-module-header').forEach((heading)=>heading.closest('section')?.remove());
    for(const heading of content?.querySelectorAll?.('h2,h3,h4')||[]){if(String(heading.textContent||'').trim()==="What's new")heading.closest('section,[data-module],.wt-grid')?.remove();}
}

function favEnsureAllHeader0120(content) {
    if(favScope().type!=='items'){favReleaseAllHeader0121(content);return null;}
    let header=document.querySelector('[data-ebsf-all-header]');if(!header){header=document.createElement('section');header.className='ebsf-scope-header';header.dataset.ebsfAllHeader='';header.innerHTML='<div class="ebsf-scope-copy"><h2 class="wt-text-title-large">All</h2><p data-ebsf-scope-meta><b>Private collection</b><span class="wt-pr-xs-1 wt-pl-xs-1">|</span><span data-ebsf-scope-count></span></p></div><div class="ebsf-scope-controls"></div>';}
    const strip=content.querySelector(':scope > [data-ebsf-collection-strip]');if(strip)strip.after(header);else content.prepend(header);
    const toolbar=document.querySelector('[data-ebsf-toolbar-row]');if(toolbar&&!header.querySelector('[data-ebsf-toolbar-row]')){if(toolbar.parentNode!==header&&!toolbar.closest('[data-ebsf-all-header]'))favState.toolbarOrigin0121={parent:toolbar.parentNode,next:toolbar.nextSibling};header.querySelector('.ebsf-scope-controls').append(toolbar);}favState.scopeHeader0120=header;return header;
}

function favReleaseAllHeader0121(content=null) {
    const header=document.querySelector('[data-ebsf-all-header]');if(!header)return;
    const toolbar=header.querySelector('[data-ebsf-toolbar-row]');
    if(toolbar){const origin=favState.toolbarOrigin0121;if(origin?.parent?.isConnected)origin.parent.insertBefore(toolbar,origin.next?.parentNode===origin.parent?origin.next:null);else{const target=content||favFavoritesContentColumn0120();const listing=target?.querySelector?.('.phase3-listing-cards-section');if(target)target.insertBefore(toolbar,listing||null);}}
    header.remove();favState.scopeHeader0120=null;favState.toolbarOrigin0121=null;
}

function favTeardownPageShell0121() {
    favReleaseAllHeader0121();
    document.querySelectorAll('[data-ebsf-collection-strip]').forEach((node)=>node.remove());
    const source=favState.nativeSource0120;const sidebar=source?.parentElement;
    if(source&&sidebar){source.hidden=false;source.inert=false;for(const child of Array.from(source.childNodes))sidebar.insertBefore(child,source);source.remove();}
    document.querySelectorAll('[data-ebsf-rail]').forEach((node)=>node.remove());
    sidebar?.classList.remove('ebsf-sidebar-active','ebsf-sidebar-permanent');
    favState.nativeSource0120=null;favState.collectionStrip0120=null;favState.rail=null;favState.sidebar=null;favState.filterOpen=false;
}

function favScopeCounts0120() {
    const props=favProps();const total=Math.max(0,Number(favState.total)||Number(props?.totalListings)||Number(props?.itemCount)||favState.records.length||0);
    const shown=favEnhancementActive()&&Array.isArray(favState.filtered)?favState.filtered.length:total;return{total,shown};
}

function favUpdateScopeHeader0120() {
    const {total,shown}=favScopeCounts0120();const unresolved=Math.max(0,Number(favState.metadataCoverage0141?.unresolved)||0);const count=`${total} favorites · ${shown} shown${unresolved?` · ${unresolved} metadata values unknown`:''}`;
    if(favScope().type==='items'){
        const header=document.querySelector('[data-ebsf-all-header]');const node=header?.querySelector('[data-ebsf-scope-count]');if(node)node.textContent=count;
    }else{
        const meta=document.querySelector('[data-test-id="collections-landing-right-side-header"],[data-testid="collections-landing-right-side-header"]');if(meta){const props=favProps();const privacy=String(props?.privacyLevel||props?.collection?.privacy_level||'public').toLowerCase()==='private'?'Private collection':'Public collection';meta.replaceChildren();const strong=document.createElement('b');const nativeIcon=document.querySelector('[data-testid="collection-privacy-icon"] .etsy-icon')||null;if(nativeIcon)strong.append(nativeIcon.cloneNode(true),document.createTextNode(` ${privacy}`));else strong.textContent=privacy;const divider=document.createElement('span');divider.className='wt-pr-xs-1 wt-pl-xs-1';divider.textContent='|';meta.append(strong,divider,document.createTextNode(count));}
    }
    favState.countNode?.remove();favState.countNode=null;document.querySelectorAll('.ebsf-result-count').forEach((node)=>node.remove());
}

function favInstallCollectionStrip0120(content) {
    const old=document.querySelector('[data-ebsf-collection-strip]');
    const scope=favScope();
    const signature=JSON.stringify({type:scope.type,id:scope.id,collections:favCollections0120().map(({id,slug,name,url})=>[id,slug,name,url])});
    let next=old;if(old?.dataset.ebsfCollectionSignature!==signature){next=favBuildCollectionStrip0120();next.dataset.ebsfCollectionSignature=signature;if(old)old.replaceWith(next);}
    if(!next){next=favBuildCollectionStrip0120();next.dataset.ebsfCollectionSignature=signature;}
    /* Reassert ownership and order even when the data signature is unchanged.
     * Etsy can move preserved nodes beneath the grid during soft rerenders. */
    if(next.parentElement!==content||content.firstElementChild!==next)content.prepend(next);favState.collectionStrip0120=next;
}

function favInstallPermanentRail0120() {
    if(!isFavoritesPage()||!favDesktopShell0120())return;
    const sidebar=document.querySelector('[data-testid="sidebar"]');if(!sidebar)return;favState.sidebar=sidebar;favCaptureNativeSource0120(sidebar);
    let rail=sidebar.querySelector(':scope > [data-ebsf-rail]');if(!rail){rail=favBuildFilterRail();sidebar.append(rail);}favState.rail=rail;favState.filterOpen=true;sidebar.classList.add('ebsf-sidebar-active','ebsf-sidebar-permanent');
}

function favInstallPageShell0120() {
    if(favMaybeRedirectGeneratedGroup0122())return;if(!isFavoritesPage())return;const sidebar=document.querySelector('[data-testid="sidebar"]');const content=favFavoritesContentColumn0120(sidebar);if(!sidebar||!content)return;
    favApplyNativeControlTheme0120(content);if(favDesktopShell0120())favInstallPermanentRail0120();favInstallCollectionStrip0120(content);favRemoveWhatsNew0120(content);favEnsureAllHeader0120(content);favUpdateScopeHeader0120();favPolishFilterButton();if(favSyncState?.status!=='running'&&favDeepState?.status!=='running'&&document.querySelector('[data-ebsf-sync-progress]'))favHideSyncProgress();
}

var favEnsureToolbarBefore0120=favEnsureToolbar;
favEnsureToolbar=function favEnsureToolbar0120(){const result=favEnsureToolbarBefore0120();requestAnimationFrame(favInstallPageShell0120);return result;};

var favOpenFiltersMobile0120=favOpenFilters;
var favCloseFiltersMobile0120=favCloseFilters;
favOpenFilters=function favOpenFilters0120(){if(favDesktopShell0120()){favInstallPermanentRail0120();favPolishFilterButton();if(!favState.loadComplete)void favLoadAll(false).then(()=>{favUpdateScopeHeader0120();if(favState.rail)favRefreshRail();});return;}return favOpenFiltersMobile0120();};
favCloseFilters=function favCloseFilters0120(){if(favDesktopShell0120()&&isFavoritesPage()){favState.filterOpen=true;favPolishFilterButton();return;}if(favDesktopShell0120()){favTeardownPageShell0121();return;}return favCloseFiltersMobile0120();};
favToggleFilters=function favToggleFilters0120(){if(favDesktopShell0120())return;return favState.filterOpen?favCloseFilters():favOpenFilters();};

favPolishFilterButton=function favPolishFilterButton0120(){const button=favState.filterButton;if(!button)return;const desktop=favDesktopShell0120();button.hidden=desktop;button.disabled=desktop;button.setAttribute('aria-hidden',String(desktop));button.setAttribute('aria-label',favState.filterOpen?'Hide filters':'Filters');button.setAttribute('aria-expanded',String(!desktop&&favState.filterOpen));const label=button.querySelector('[data-ebsf-filter-label]');if(label)label.textContent=favState.filterOpen?'Hide filters':'Filters';};

var favRefreshRailBefore0120=favRefreshRail;
favRefreshRail=function favRefreshRail0120(){if(favDesktopShell0120()){
    const sidebar=document.querySelector('[data-testid="sidebar"]');if(!sidebar)return;favCaptureNativeSource0120(sidebar);const replacement=favBuildFilterRail();const old=sidebar.querySelector(':scope > [data-ebsf-rail]');if(old)old.replaceWith(replacement);else sidebar.append(replacement);sidebar.classList.add('ebsf-sidebar-active','ebsf-sidebar-permanent');favState.rail=replacement;favState.filterOpen=true;return;
}return favRefreshRailBefore0120();};

function favRestorePagination0122(){const saved=favState.nativePagination0120;if(saved?.nav?.isConnected){if(saved.generated)saved.nav.remove();else{saved.nav.replaceChildren(...saved.children);saved.nav.hidden=saved.hidden;delete saved.nav.dataset.ebsfNativePagination;if(saved.parent?.isConnected)saved.parent.insertBefore(saved.nav,saved.next?.parentNode===saved.parent?saved.next:null);}}for(const entry of saved?.others||[])if(entry.pager?.isConnected)entry.pager.hidden=entry.hidden;favState.nativePagination0120=null;for(const nav of document.querySelectorAll('nav[data-ebsf-native-pagination]')){if(nav.getAttribute('aria-label')==='Favorite Items Page Results')nav.remove();else delete nav.dataset.ebsfNativePagination;}}

/* Result pagination is no longer a page-shell responsibility. Etsy owns its
 * native pager in native mode; module 95 owns BetterSearch-local pagination. */

favRenderCount=function favRenderCount0120(){favUpdateScopeHeader0120();};

/* v0.14.0: catalogue refresh progress belongs in the established progress UI.
 * Never replace Etsy's hydrated product children with a temporary Loading row. */
function favShowResultsLoading0120() {favState.loadingPlaceholder0120=null;}
function favHideResultsLoading0120() {favState.loadingPlaceholder0120=null;}

var favRestoreNativeBefore0120=favRestoreNative;
favRestoreNative=function favRestoreNative0120(){const result=favRestoreNativeBefore0120();favRestorePagination0122();return result;};

var favLoadAllBefore0120=favLoadAll;
favLoadAll=function favLoadAll0120(force=false){const requestKey=favDatasetKey();const result=favLoadAllBefore0120(force);return Promise.resolve(result).then((records)=>{if(requestKey!==favDatasetKey())return records;favHideResultsLoading0120();if(!favEnhancementActive())favRestoreNative();favUpdateScopeHeader0120();return records;},(error)=>{if(requestKey!==favDatasetKey())throw error;favHideResultsLoading0120();favRestoreNative();throw error;});};

var favReapplyBefore0120=favReapply;
/* Keep the historical helper callable, but route it through the v0.14.0 base
 * reapply path so every local render evaluates metadata requirements first. */
function favScheduleLocalRender0121(force=false) {return favReapplyBefore0120(force);}
favReapply=async function favReapply0120(force=false){return favReapplyBefore0120(force);};

window.addEventListener('resize',()=>{const desktop=favDesktopShell0120();if(desktop!==favState.shellDesktop0120){favState.shellDesktop0120=desktop;if(desktop&&favState.overlay)favCloseFiltersMobile0120();else if(!desktop)favState.filterOpen=false;}favPolishFilterButton();favInstallPageShell0120();},{passive:true});
/* The base runtime intentionally debounces heavy route work. Shell capture is
 * cheap and must happen in the next frame so freshly rendered native sidebar
 * children never linger for the debounce interval. */
if(!favState.shellObserver0120){let shellFrame=0;favState.shellObserver0120=new MutationObserver((records)=>{const shellNode=(node)=>node?.nodeType===1&&(node.matches?.('[data-testid="sidebar"],.phase3-listing-cards-section,.favorites-landing-phase3-header,[data-ebsf-collection-strip],[data-ebsf-all-header]')||node.querySelector?.('[data-testid="sidebar"],.phase3-listing-cards-section,.favorites-landing-phase3-header'));const relevant=records.some((record)=>record.target?.matches?.('[data-testid="sidebar"]')||Array.from(record.addedNodes||[]).some(shellNode)||Array.from(record.removedNodes||[]).some(shellNode));if(!relevant||shellFrame)return;shellFrame=requestAnimationFrame(()=>{shellFrame=0;if(isFavoritesPage())favInstallPageShell0120();});});favState.shellObserver0120.observe(document.body,{childList:true,subtree:true});}
if(!favState.runtimeStarted0120){favState.runtimeStarted0120=true;favStartRuntime();}
requestAnimationFrame(()=>{favInstallPageShell0120();if(isFavoritesPage()&&!favState.loadComplete)void favLoadAll(false).then(()=>favUpdateScopeHeader0120());});