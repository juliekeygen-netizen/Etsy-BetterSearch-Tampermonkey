'use strict';

/* v0.12.0 Favorites shell foundation. Keeps the Phase 5 data/queue stack intact
 * and changes only the Favorites page shell/navigation. */
var FAV_SHELL_DESKTOP_MIN0120 = 900;
var favShellTimer0120 = 0;
var favShellStripKey0120 = '';
var favShellDrag0120 = null;

function favShellDesktop0120(){ return innerWidth >= FAV_SHELL_DESKTOP_MIN0120; }
function favShellCollections0120(props=favProps()){
    return (Array.isArray(props?.collectionsTabs)?props.collectionsTabs:[])
        .filter((entry)=>entry?.__type==='collection')
        .map((entry)=>({slug:String(entry.slug||''),url:String(entry.url||''),name:String(entry.name||entry.slug||'Collection'),count:Number(entry.listingsCount)||0}))
        .filter((entry)=>entry.slug&&entry.url);
}
function favShellSource0120(sidebar=document.querySelector('[data-testid="sidebar"]')){
    return sidebar?.querySelector(':scope > [data-ebsf-native-sidebar-source]')||null;
}
function favShellQuery0120(selector){ return favShellSource0120()?.querySelector(selector)||document.querySelector(selector); }
function favShellCaptureSidebar0120(sidebar){
    let source=favShellSource0120(sidebar); if(source)return source;
    source=document.createElement('div');source.dataset.ebsfNativeSidebarSource='';source.hidden=true;source.inert=true;source.setAttribute('aria-hidden','true');
    source.append(...Array.from(sidebar.childNodes).filter((node)=>!(node.nodeType===1&&node.matches?.('[data-ebsf-shell-rail]'))));
    sidebar.append(source);return source;
}
function favShellNativeHref0120(tab){
    const native=favShellQuery0120(`a[href*="tab=${tab}"]`);if(native?.href)return native.href;
    const login=favProfileLogin();return login?new URL(`/people/${encodeURIComponent(login)}?tab=${tab}&ref=phase3_fl`,location.origin).href:'';
}
function favShellIcon0120(selector){const icon=favShellQuery0120(selector)?.querySelector('.etsy-icon');return icon?.cloneNode(true)||null;}
function favShellPill0120(label,href='',active=false,icon=null){
    const node=href?document.createElement('a'):document.createElement('button');if(href)node.href=href;else node.type='button';
    node.className='ebsf-collection-pill';if(active){node.classList.add('is-active');node.setAttribute('aria-current','page');}
    if(icon)node.append(icon);const span=document.createElement('span');span.textContent=label;node.append(span);return node;
}
function favShellInvokeCreate0120(){
    const source=favShellSource0120(),button=favShellQuery0120('[data-testid="add-collection-button"]');if(!button)return;
    const inert=source?.inert===true;if(source&&inert)source.inert=false;try{button.click();}finally{if(source&&inert)queueMicrotask(()=>{source.inert=true;});}
}
function favShellSampleStyle0120(root){
    const input=favSearchInput();if(!input)return;const shell=input.closest('.wt-input-btn-group')||input.closest('form')||input,s=getComputedStyle(shell),i=getComputedStyle(input);
    root.style.setProperty('--ebsf-shell-bg',s.backgroundColor||i.backgroundColor||'#fff');root.style.setProperty('--ebsf-shell-color',i.color||s.color||'#222');
    root.style.setProperty('--ebsf-shell-border',s.borderColor||i.borderColor||'#8d8d8d');root.style.setProperty('--ebsf-shell-font',i.fontFamily||s.fontFamily||'sans-serif');root.style.setProperty('--ebsf-shell-size',i.fontSize||'13px');
}
function favShellBuildStrip0120(){
    const props=favProps(),scope=favScope(),root=document.createElement('nav');root.className='ebsf-collection-strip';root.dataset.ebsfCollectionStrip='';root.setAttribute('aria-label','Favorites collections');
    const fixed=document.createElement('div');fixed.className='ebsf-collection-fixed';
    fixed.append(favShellPill0120('All',favShellNativeHref0120('items')||location.href,scope.type==='items',favShellIcon0120('a[href*="tab=items"]')));
    const nativeCreate=favShellQuery0120('[data-testid="add-collection-button"]'),createIcon=nativeCreate?.querySelector('.etsy-icon')?.cloneNode(true)||null;
    const plus=favShellPill0120(createIcon?'':'+','',false,createIcon);plus.classList.add('ebsf-collection-plus');plus.setAttribute('aria-label','Create new collection');plus.addEventListener('click',favShellInvokeCreate0120);fixed.append(plus);
    const viewport=document.createElement('div');viewport.className='ebsf-collection-scroll';viewport.tabIndex=0;viewport.setAttribute('aria-label','Saved collections');
    const track=document.createElement('div');track.className='ebsf-collection-track';
    for(const collection of favShellCollections0120(props)){const pill=favShellPill0120(collection.name,collection.url,scope.type==='collection'&&scope.id===collection.slug);pill.dataset.collectionSlug=collection.slug;pill.title=`${collection.name} · ${collection.count} favorites`;track.append(pill);}
    viewport.append(track);root.append(fixed,viewport);
    let moved=false;viewport.addEventListener('pointerdown',(event)=>{if(event.button!==0||event.pointerType==='touch')return;favShellDrag0120={id:event.pointerId,x:event.clientX,left:viewport.scrollLeft};moved=false;viewport.setPointerCapture?.(event.pointerId);viewport.classList.add('is-dragging');});
    viewport.addEventListener('pointermove',(event)=>{if(favShellDrag0120?.id!==event.pointerId)return;const dx=event.clientX-favShellDrag0120.x;if(Math.abs(dx)>4)moved=true;viewport.scrollLeft=favShellDrag0120.left-dx;});
    const end=(event)=>{if(favShellDrag0120?.id!==event.pointerId)return;favShellDrag0120=null;viewport.classList.remove('is-dragging');};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
    viewport.addEventListener('click',(event)=>{if(!moved)return;event.preventDefault();event.stopPropagation();moved=false;},true);
    viewport.addEventListener('wheel',(event)=>{if(Math.abs(event.deltaY)<=Math.abs(event.deltaX)||viewport.scrollWidth<=viewport.clientWidth)return;viewport.scrollLeft+=event.deltaY;event.preventDefault();},{passive:false});
    viewport.addEventListener('keydown',(event)=>{const n=Math.max(120,Math.round(viewport.clientWidth*.65));if(event.key==='ArrowRight')viewport.scrollBy({left:n,behavior:'smooth'});else if(event.key==='ArrowLeft')viewport.scrollBy({left:-n,behavior:'smooth'});else if(event.key==='Home')viewport.scrollTo({left:0,behavior:'smooth'});else if(event.key==='End')viewport.scrollTo({left:viewport.scrollWidth,behavior:'smooth'});else return;event.preventDefault();});
    favShellSampleStyle0120(root);return root;
}
function favShellEnsureStrip0120(force=false){
    const toolbar=document.querySelector('[data-ebsf-toolbar-row]');if(!toolbar?.parentElement)return;
    const scope=favScope(),key=[scope.type,scope.id,...favShellCollections0120().map((c)=>`${c.slug}:${c.count}:${c.name}`)].join('|');let strip=document.querySelector('[data-ebsf-collection-strip]');
    if(!force&&strip?.isConnected&&favShellStripKey0120===key&&strip.nextElementSibling===toolbar){favShellSampleStyle0120(strip);return;}
    strip?.remove();strip=favShellBuildStrip0120();toolbar.before(strip);favShellStripKey0120=key;
}
function favShellRemoveWhatsNew0120(){if(favScope().type!=='items')return;document.querySelectorAll('.expanded-updates-module-header').forEach((heading)=>{if(/^what[’']?s new$/i.test(String(heading.textContent||'').trim()))heading.closest('section')?.setAttribute('hidden','');});}
function favShellDecorateRail0120(rail){
    if(!rail)return;rail.dataset.ebsfShellRail='';const heading=rail.querySelector('.ebsf-filter-heading');if(heading?.tagName==='BUTTON'){const div=document.createElement('div');div.className=heading.className;div.textContent=heading.textContent||'Filters';div.setAttribute('role','heading');div.setAttribute('aria-level','2');heading.replaceWith(div);}
    const href=favShellNativeHref0120('shops'),old=rail.querySelector('[data-ebsf-shell-shops]');if(old&&href&&old.href===href)return;old?.remove();if(!href)return;
    const link=document.createElement('a');link.href=href;link.className='ebsf-shell-shops';link.dataset.ebsfShellShops='';const icon=favShellIcon0120('a[href*="tab=shops"]');if(icon)link.append(icon);const text=document.createElement('span');text.textContent='Shops';link.append(text);rail.append(link);
}
function favShellEnsureDesktopRail0120(){
    if(!isFavoritesPage()||!favShellDesktop0120())return;const sidebar=document.querySelector('[data-testid="sidebar"]');if(!sidebar)return;const source=favShellCaptureSidebar0120(sidebar);let rail=sidebar.querySelector(':scope > [data-ebsf-shell-rail]');
    if(!rail){favPrepareOpenSectionsForRail?.();rail=favBuildFilterRail();favShellDecorateRail0120(rail);sidebar.insertBefore(rail,source);}else favShellDecorateRail0120(rail);
    sidebar.classList.add('ebsf-sidebar-active','ebsf-shell-sidebar');favState.sidebar=sidebar;favState.sidebarNodes=Array.from(source.childNodes);favState.rail=rail;favState.filterOpen=true;
}
function favShellRestoreMobile0120(){
    const sidebar=document.querySelector('[data-testid="sidebar"]'),source=favShellSource0120(sidebar);if(!sidebar||!source)return;sidebar.querySelector(':scope > [data-ebsf-shell-rail]')?.remove();const nodes=Array.from(source.childNodes);source.replaceWith(...nodes);sidebar.classList.remove('ebsf-sidebar-active','ebsf-shell-sidebar');favState.sidebar=null;favState.sidebarNodes=null;favState.rail=null;favState.filterOpen=Boolean(favState.overlay);
}
function favShellFilterButton0120(){const button=favState.filterButton||document.querySelector('.ebsf-filter-button');if(!button)return;const desktop=favShellDesktop0120();button.hidden=desktop;button.disabled=desktop;button.setAttribute('aria-hidden',String(desktop));if(desktop)button.tabIndex=-1;else button.removeAttribute('tabindex');}
function favShellApply0120(force=false){
    if(!isFavoritesPage()){document.querySelector('[data-ebsf-collection-strip]')?.remove();return;}favEnsureToolbar();favShellEnsureStrip0120(force);favShellRemoveWhatsNew0120();if(favShellDesktop0120())favShellEnsureDesktopRail0120();else favShellRestoreMobile0120();favShellFilterButton0120();
}
function favShellSchedule0120(force=false){clearTimeout(favShellTimer0120);favShellTimer0120=setTimeout(()=>favShellApply0120(force),40);}

var favOpenFiltersBefore0120=favOpenFilters;favOpenFilters=function favOpenFilters0120(){if(favShellDesktop0120()){favShellEnsureDesktopRail0120();favShellFilterButton0120();return;}return favOpenFiltersBefore0120();};
var favCloseFiltersBefore0120=favCloseFilters;favCloseFilters=function favCloseFilters0120(){if(favShellDesktop0120()&&isFavoritesPage()){favShellEnsureDesktopRail0120();favShellFilterButton0120();return;}return favCloseFiltersBefore0120();};
favToggleFilters=function favToggleFilters0120(){if(favShellDesktop0120())return favShellEnsureDesktopRail0120();return favState.filterOpen?favCloseFilters():favOpenFilters();};
var favRefreshRailBefore0120=favRefreshRail;favRefreshRail=function favRefreshRail0120(){const out=favRefreshRailBefore0120();if(favShellDesktop0120()){favShellDecorateRail0120(favState.rail);favShellFilterButton0120();}return out;};

GM_addStyle(`
.ebsf-collection-strip{--ebsf-shell-bg:#fff;--ebsf-shell-color:#222;--ebsf-shell-border:#8d8d8d;--ebsf-shell-font:Arial,sans-serif;--ebsf-shell-size:13px;display:flex;align-items:center;gap:8px;width:100%;min-width:0;margin:0 0 10px;font-family:var(--ebsf-shell-font);font-size:var(--ebsf-shell-size);color:var(--ebsf-shell-color)}
.ebsf-collection-fixed{display:flex;gap:8px;flex:0 0 auto}.ebsf-collection-scroll{min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain;touch-action:pan-x;cursor:grab}.ebsf-collection-scroll::-webkit-scrollbar{display:none}.ebsf-collection-scroll.is-dragging{cursor:grabbing;user-select:none}.ebsf-collection-track{display:flex;gap:8px;width:max-content;min-width:100%}
.ebsf-collection-pill{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 14px;border:1px solid var(--ebsf-shell-border);border-radius:999px;background:var(--ebsf-shell-bg);color:var(--ebsf-shell-color);font:600 var(--ebsf-shell-size)/1 var(--ebsf-shell-font);text-decoration:none;white-space:nowrap;cursor:pointer}.ebsf-collection-pill.is-active{box-shadow:inset 0 0 0 1px var(--ebsf-shell-color)}.ebsf-collection-pill .etsy-icon,.ebsf-shell-shops .etsy-icon{display:inline-flex;width:18px;height:18px}.ebsf-collection-pill svg,.ebsf-shell-shops svg{width:18px;height:18px}.ebsf-collection-plus{width:40px;padding:0}.ebsf-shell-shops{display:flex;align-items:center;gap:8px;margin-top:14px;padding:11px 0;border-top:1px solid #dedede;color:inherit;text-decoration:none;font-weight:600}
[data-ebsf-native-sidebar-source][hidden]{display:none!important}.ebsf-shell-sidebar>.ebsf-rail{display:block!important}@media(min-width:900px){.ebsf-filter-button{display:none!important}.ebsf-shell-sidebar{overflow:visible!important}}@media(max-width:899px){.ebsf-collection-pill{min-height:36px;padding:0 12px}.ebsf-collection-plus{width:36px;padding:0}}
`);

var favShellObserver0120=new MutationObserver(()=>favShellSchedule0120(false));if(document.body)favShellObserver0120.observe(document.body,{childList:true,subtree:true});
window.addEventListener('resize',()=>favShellSchedule0120(false),{passive:true});window.addEventListener('popstate',()=>favShellSchedule0120(true));window.addEventListener('pageshow',()=>favShellSchedule0120(true));document.addEventListener('ebsf:favorites-sync-state',()=>favShellSchedule0120(true));favShellSchedule0120(true);
