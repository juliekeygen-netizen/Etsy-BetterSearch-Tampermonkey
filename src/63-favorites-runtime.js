'use strict';

function favCaptureNativeGrid() {
    const grid=favMainGrid(); if(!grid) return;
    if(favState.nativeGrid===grid && favState.nativeCaptured) return;
    if(favState.rendered && favState.nativeGrid===grid) return;
    favState.nativeGrid=grid; favState.nativeOrder=Array.from(grid.children); favState.nativeNodes=favCardMap(document); favState.nativeCaptured=true; favState.rendered=false;
}

function favRestoreNative() {
    if(favState.rendered && favState.nativeGrid?.isConnected && favState.nativeOrder.length){favState.rendering=true;favState.nativeGrid.replaceChildren(...favState.nativeOrder);queueMicrotask(()=>{favState.rendering=false;});}
    favState.countNode?.remove(); favState.countNode=null; favState.rendered=false; favState.filtered=[];document.body?.classList.remove('ebsf-results-active');
}

function favFallbackNode(record) {
    const li = document.createElement('li');
    li.className = 'favorites-landing-listing-card-container wt-mb-xs-2 favorites-landing-listing-card-container__ungrouped ebsf-fallback-card';
    const safe = (value) => String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const ratingText = Number.isFinite(record.rating) ? `${record.rating.toFixed(1)} ★${Number.isFinite(record.reviews) ? ` (${Math.round(record.reviews)})` : ''}` : '';
    const sale = record.discountPercent > 0 ? ` <span class="ebsf-old-price">${safe(record.originalPriceFormatted)}</span> <span>(${record.discountPercent}% off)</span>` : '';
    const urgency = record.urgency ? `<span class="wt-badge wt-badge--statusInformational wt-badge--small ebsf-urgency">${safe(record.urgency)}</span>` : '';
    const shipping = record.hasFreeShipping ? 'FREE shipping' : (record.shippingFormatted ? `Shipping: ${safe(record.shippingFormatted)}` : '');
    const action = record.hasVariations ? 'Multiple options' : 'Add to cart';
    li.innerHTML = `
        <div data-clg-id="WtCard" class="wt-card wt-width-full wt-height-full wt-display-flex-xs wt-card--transparent">
            <a data-clg-id="WtCardLink" href="${safe(record.url)}" target="_blank" rel="noreferrer" class="wt-card__action-link wt-width-full"><span class="wt-screen-reader-only">${safe(record.title)}</span></a>
            <div class="wt-card__inner wt-flex-grow-xs-1 wt-display-flex-xs wt-flex-direction-column-xs">
                <div class="wt-position-relative wt-display-block">
                    <img loading="lazy" class="wt-image wt-rounded-02 wt-image--cover" src="${safe(record.imageUrl)}" alt="${safe(record.title)}">
                    ${urgency}
                    <button type="button" aria-label="Remove from favorites" aria-pressed="true" class="wt-btn wt-btn--icon wt-btn--small ebsf-heart"><span class="etsy-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.54 4Q19.195 4 20.437 4.76A5.05 5.05 0 0 1 22.338 6.82Q23 8.122 23 9.73C23 10.945 22.735 12 22.214 12.9A8.1 8.1 0 0 1 20.288 15.164C19.528 15.772 18.326 16.5 17 17.35 15.443 18.339 13.576 19.607 12.456 20.905A.614.614 0 0 1 11.545 20.905C10.435 19.615 8.605 18.37 7 17.35 5.674 16.499 4.472 15.772 3.712 15.164A8.1 8.1 0 0 1 1.786 12.901C1.265 12.001 1 10.945 1 9.73Q1.001 8.122 1.661 6.82A5.05 5.05 0 0 1 3.563 4.76Q4.802 4 6.46 4C9.16 4 10.75 5.5 12 7 13.25 5.5 14.745 4 17.54 4"></path></svg></span></button>
                </div>
                <p class="wt-text-caption wt-text-truncate ebsf-card-title">${safe(record.title)}</p>
                ${ratingText ? `<p class="wt-text-caption">${safe(ratingText)}${record.shopName ? ` By ${safe(record.shopName)}` : ''}</p>` : (record.shopName ? `<p class="wt-text-caption">By ${safe(record.shopName)}</p>` : '')}
                <p class="wt-text-title-small ebsf-card-price">${safe(record.priceFormatted)}${sale}</p>
                ${shipping ? `<p class="wt-text-caption wt-text-gray">${shipping}</p>` : ''}
                ${record.estimatedDelivery ? `<p class="wt-text-caption wt-text-gray">Est. delivery: ${safe(record.estimatedDelivery)}</p>` : ''}
                <div class="ebsf-card-actions"><button type="button" class="wt-btn wt-btn--transparent wt-btn--small">${action}</button></div>
            </div>
        </div>`;
    return li;
}

function favNodeForRecord(record) {
    const live=favState.nativeNodes.get(record.id); if(live){live.dataset.ebsfId=record.id;live.dataset.ebsfUrl=record.url;delete live.dataset.ebsfTransplanted;return live;}
    let node=null;if(record.html){const t=document.createElement('template');t.innerHTML=record.html.trim();node=t.content.firstElementChild;} if(!node)node=favFallbackNode(record);
    node.dataset.ebsfId=record.id;node.dataset.ebsfUrl=record.url;node.dataset.ebsListingId=record.id;node.dataset.ebsListingUrl=record.url;node.dataset.ebsfTransplanted='1';for(const img of node.querySelectorAll('img')){img.loading='lazy';img.removeAttribute('fetchpriority');}for(const video of node.querySelectorAll('video')){video.preload='none';video.autoplay=false;}return node;
}

function favRenderCount(totalShown) {
    const section=document.querySelector('.phase3-listing-cards-section'); if(!section)return;
    if(!favState.countNode){const node=document.createElement('div');node.className='ebsf-result-count wt-text-body-small';section.prepend(node);favState.countNode=node;}
    const base=favState.total||favState.records.length; favState.countNode.textContent=`${base} favorites · ${totalShown} shown`;
}

function favRenderPagination(totalPages) {
    /* Installed by the final Favorites page-shell module, which reuses Etsy's
     * WtPagination structure and preserves the native pager position. */
}

function favRenderCurrent() {
    const grid=favMainGrid(); if(!grid)return;
    favCaptureNativeGrid(); const matched=favFilteredRecords();favState.filtered=matched;const pages=Math.max(1,Math.ceil(matched.length/favState.pageSize));favState.localPage=Math.min(Math.max(1,favState.localPage),pages);const start=(favState.localPage-1)*favState.pageSize;const page=matched.slice(start,start+favState.pageSize);const frag=document.createDocumentFragment();
    if(!page.length){const li=document.createElement('li');li.className='ebsf-empty';li.textContent='No favorites match these filters.';frag.append(li);}else for(const item of page)frag.append(favNodeForRecord(item));
    favState.rendering=true;grid.replaceChildren(frag);favState.rendered=true;document.body.classList.add('ebsf-results-active');favRenderCount(matched.length);favRenderPagination(pages);queueMicrotask(()=>{favState.rendering=false;});
}

async function favReapply(force=false) {
    if(!isFavoritesPage())return;
    const requestKey=favDatasetKey();
    favEnsureToolbar();
    if(!favEnhancementActive()){favRestoreNative();return;}
    if(favSyncState.status==='running'){const sameScope=favSyncCurrentScope().scopeKey===favSyncState.scopeKey;await favSyncState.promise;if(!isFavoritesPage()||requestKey!==favDatasetKey())return;if(sameScope)force=false;}
    await favLoadAll(force);if(!isFavoritesPage()||requestKey!==favDatasetKey())return;
    if(favNeedsExtraInfo()&&!favState.extraReady){await favEnsureExtraInfo();if(!isFavoritesPage()||requestKey!==favDatasetKey())return;}
    favRenderCurrent();
}

async function favRefreshRouteData(){if(favEnhancementActive())await favReapply();await favMaybeAutoSync(false);}

function favRemoveLocalFavorite(idValue) {
    const idString=String(idValue||'');if(!idString||!favState.recordsById.has(idString))return false;
    favState.recordsById.delete(idString);favState.records=favState.records.filter((item)=>item.id!==idString);favState.nativeNodes.delete(idString);favState.nativeOrder=favState.nativeOrder.filter((node)=>favListingIdFromNode(node)!==idString);favState.total=Math.max(0,(Number(favState.total)||favState.records.length+1)-1);favIndexMarkUnfavorite(idString).catch(()=>{});return true;
}

function favHandleTransplantedClick(event) {
    const card=event.target?.closest?.('[data-ebsf-transplanted="1"]');if(!card)return;
    const favorite=favoriteButtonFromEvent(event.target);if(favorite){event.preventDefault();event.stopImmediatePropagation();bridgeFavorite(card,favorite).then(()=>{if(!isFavoritedButton(favorite)){favRemoveLocalFavorite(card.dataset.ebsfId);favRenderCurrent();}});return;}
    const button=event.target?.closest?.('button');if(button&&/(add to cart|multiple options|select options)/i.test(button.textContent||'')){event.preventDefault();event.stopImmediatePropagation();const url=card.dataset.ebsfUrl;if(url)window.open(url,'_blank','noopener');}
}
document.addEventListener('click',favHandleTransplantedClick,true);
document.addEventListener('click',(event)=>{if(!isFavoritesPage())return;const card=event.target?.closest?.('.favorites-landing-listing-card-container:not([data-ebsf-transplanted="1"])');if(!card)return;const button=favoriteButtonFromEvent(event.target);if(!button||!isFavoritedButton(button))return;const idValue=card.dataset.ebsfId||favListingIdFromNode(card);if(!idValue)return;setTimeout(()=>{const current=card.querySelector('button[aria-label*="Favorite" i],button[data-accessible-btn-fave],[data-favorite-button]')||button;if(card.isConnected&&isFavoritedButton(current))return;const removed=document.body.classList.contains('ebsf-results-active')&&favRemoveLocalFavorite(idValue);if(!removed)favIndexMarkUnfavorite(idValue).catch(()=>{});if(removed)favRenderCurrent();},900);},false);

function favBindNativeSearch(){const form=favSearchInput()?.closest('form');if(!form||form.dataset.ebsfBound)return;form.dataset.ebsfBound='1';form.addEventListener('submit',()=>{favRestoreNative();setTimeout(()=>favScheduleSync(0),450);setTimeout(()=>favScheduleSync(0),1100);});}

function favResetForNativeChange() {
    const reopen=favState.filterOpen;if(reopen)favCloseFilters();favState.controller?.abort();favRestoreNative();favState.loadKey='';favState.loadPromise=null;favState.loadComplete=false;favState.records=[];favState.recordsById=new Map();favState.total=0;favState.extraPromise=null;favState.extraKey='';favState.extraReady=false;favState.groupQueryResolved=false;favState.localPage=1;favState.nativeGrid=null;favState.nativeOrder=[];favState.nativeNodes=new Map();favState.nativeCaptured=false;favState.openSectionsInitialized=false;favState.openSections=new Set();favCaptureNativeGrid();favEnsureToolbar();favBindNativeSearch();favIndexObserveCurrentPage().catch(()=>{});favSyncHandleRouteChange();void favRefreshRouteData();if(reopen)requestAnimationFrame(()=>{if(isFavoritesPage()&&!favState.filterOpen)favOpenFilters();});
}

function favScheduleSync(delay=250){clearTimeout(favState.syncTimer);favState.syncTimer=setTimeout(()=>{if(!isFavoritesPage()){favCloseFilters();favHideSyncProgress();return;}const key=favScopeKey();if(favState.lastHref!==location.href||favState.lastScopeKey!==key){favState.lastHref=location.href;favState.lastScopeKey=key;favResetForNativeChange();}else{favEnsureToolbar();favBindNativeSearch();}},delay);}

function favScheduleCurrentPageObservation(){clearTimeout(favState.observeTimer);favState.observeTimer=setTimeout(()=>{if(isFavoritesPage()&&!favState.rendering)favIndexObserveCurrentPage().catch(()=>{});},1000);}

function favStartRuntime() {
    if(!favState.runtimeObserverBound0121){
        favState.observer?.disconnect();favState.observer=new MutationObserver(()=>{if(!favState.rendering){favScheduleSync();favScheduleCurrentPageObservation();}});favState.observer.observe(document.body,{childList:true,subtree:true});
        window.addEventListener('popstate',()=>favScheduleSync(80));window.addEventListener('pageshow',(event)=>{if(event.persisted)favScheduleSync(0);});favState.runtimeObserverBound0121=true;
    }
    if(!isFavoritesPage())return;favState.lastHref=location.href;favState.lastScopeKey=favScopeKey();favCaptureNativeGrid();favEnsureToolbar();favBindNativeSearch();favIndexObserveCurrentPage().then(()=>favDeepMaybeAutoScan()).catch(()=>{});void favRefreshRouteData();
}

/* Started by the final Favorites shell module after all late filter/layout
 * overrides are installed. Starting here exposed a short-lived legacy rail
 * and editor during initial page hydration. */
