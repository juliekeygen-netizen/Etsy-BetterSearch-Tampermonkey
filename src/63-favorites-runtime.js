'use strict';

/* v0.14.0 native/local ownership notes:
 * - dataset identity remains owner + Favorite scope + effective dataset query;
 * - Etsy keeps ownership of its live product UL and card nodes;
 * - BetterSearch local filtering/sorting renders into a separate sibling UL;
 * - native mode is restored by revealing Etsy's untouched grid, never by
 *   reparenting/replacing Preact-owned children.
 */
favState.lastDatasetKey0137 = favState.lastDatasetKey0137 || '';
favState.lastViewKey0137 = favState.lastViewKey0137 || '';
favState.wasFavoritesPage0137 = favState.wasFavoritesPage0137 === true;
favState.nativeCaptureViewKey0137 = favState.nativeCaptureViewKey0137 || '';
favState.localGrid0141 = favState.localGrid0141 || null;
favState.renderMode0141 = favState.renderMode0141 || 'native';
favState.syncDelay0137 = Math.max(0, Number(favState.syncDelay0137) || 0);
favState.observeDelay0137 = Math.max(0, Number(favState.observeDelay0137) || 0);

function favRequestedRoutePage0137() {
    try {
        const page = Number.parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
        return Number.isFinite(page) && page > 0 ? page : 1;
    } catch (_) {
        return 1;
    }
}

function favViewKey0137() {
    return `${favScopeKey()}|page:${favRequestedRoutePage0137()}`;
}

function favNativeMainGrid0141(root = document) {
    const grids = Array.from(root.querySelectorAll?.('.phase3-listing-cards-section ul.implicit-comparison-listing-card-row, .phase3-listing-cards-section ul[role="list"]') || []);
    return grids.find((grid) => !grid.hasAttribute('data-ebsf-local-grid')) || null;
}

function favNativeCardMap0141(root = document) {
    const map = new Map();
    const grid = favNativeMainGrid0141(root);
    if (!grid) return map;
    for (const node of Array.from(grid.children)) {
        const idValue = favListingIdFromNode(node);
        if (idValue) map.set(idValue, node);
    }
    return map;
}

function favCaptureNativeGrid() {
    const grid=favNativeMainGrid0141(); if(!grid) return;
    if(favState.nativeGrid===grid && favState.nativeCaptured && favState.nativeCaptureViewKey0137===favViewKey0137()) return;
    favState.nativeGrid=grid;
    favState.nativeOrder=Array.from(grid.children);
    favState.nativeNodes=favNativeCardMap0141(document);
    favState.nativeCaptured=true;
    favState.nativeCaptureViewKey0137=favViewKey0137();
}

function favRemoveLocalGrid0141() {
    if (favState.localGrid0141?.isConnected) favState.localGrid0141.remove();
    favState.localGrid0141 = null;
}

function favRestoreNative() {
    favRemoveLocalGrid0141();
    if (favState.nativeGrid?.isConnected) {
        favState.nativeGrid.hidden = false;
        favState.nativeGrid.removeAttribute('aria-hidden');
        favState.nativeGrid.removeAttribute('data-ebsf-native-hidden');
    }
    favState.countNode?.remove();
    favState.countNode=null;
    favState.rendered=false;
    favState.renderMode0141='native';
    favState.filtered=[];
    document.body?.classList.remove('ebsf-results-active');
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
    const image = record.imageUrl
        ? `<img loading="lazy" class="wt-image wt-rounded-02 wt-image--cover" src="${safe(record.imageUrl)}" alt="${safe(record.title)}">`
        : '<div class="wt-image wt-rounded-02 ebsf-fallback-image" aria-hidden="true"></div>';
    li.innerHTML = `
        <div data-clg-id="WtCard" class="wt-card wt-width-full wt-height-full wt-display-flex-xs wt-card--transparent">
            <a data-clg-id="WtCardLink" href="${safe(record.url)}" target="_blank" rel="noreferrer" class="wt-card__action-link wt-width-full"><span class="wt-screen-reader-only">${safe(record.title)}</span></a>
            <div class="wt-card__inner wt-flex-grow-xs-1 wt-display-flex-xs wt-flex-direction-column-xs">
                <div class="wt-position-relative wt-display-block">
                    ${image}
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

function favPrepareOwnedCard0141(node, record) {
    node.removeAttribute?.('id');
    node.querySelectorAll?.('[id]').forEach((child) => child.removeAttribute('id'));
    node.dataset.ebsfId=record.id;
    node.dataset.ebsfUrl=record.url;
    node.dataset.ebsListingId=record.id;
    node.dataset.ebsListingUrl=record.url;
    node.dataset.ebsfTransplanted='1';
    node.dataset.ebsfOwnedCard='1';
    for(const img of node.querySelectorAll?.('img') || []){img.loading='lazy';img.removeAttribute('fetchpriority');}
    for(const video of node.querySelectorAll?.('video') || []){video.preload='none';video.autoplay=false;}
    return node;
}

function favNodeForRecord(record) {
    const live=favState.nativeNodes.get(record.id);
    if(live) return favPrepareOwnedCard0141(live.cloneNode(true), record);
    let node=null;
    if(record.html){const t=document.createElement('template');t.innerHTML=record.html.trim();node=t.content.firstElementChild;}
    if(!node)node=favFallbackNode(record);
    return favPrepareOwnedCard0141(node, record);
}

function favEnsureLocalGrid0141(nativeGrid) {
    let grid=favState.localGrid0141;
    if(grid?.isConnected && grid.previousElementSibling===nativeGrid)return grid;
    favRemoveLocalGrid0141();
    grid=document.createElement('ul');
    grid.className=String(nativeGrid.className || '');
    const role=nativeGrid.getAttribute('role');
    if(role)grid.setAttribute('role',role);
    grid.setAttribute('data-ebsf-local-grid','1');
    grid.setAttribute('data-ebsf-owned','1');
    nativeGrid.insertAdjacentElement('afterend',grid);
    favState.localGrid0141=grid;
    return grid;
}

function favRenderCount(totalShown) {
    const section=document.querySelector('.phase3-listing-cards-section'); if(!section)return;
    if(!favState.countNode){const node=document.createElement('div');node.className='ebsf-result-count wt-text-body-small';section.prepend(node);favState.countNode=node;}
    const base=favState.total||favState.records.length;
    const unresolved=Math.max(0,Number(favState.metadataCoverage0141?.unresolved)||0);
    const text=`${base} favorites · ${totalShown} shown${unresolved ? ` · ${unresolved} metadata values unknown` : ''}`;
    if(favState.countNode.textContent!==text)favState.countNode.textContent=text;
}

function favRenderPagination(totalPages) {
    /* Etsy owns its native pager. Local pagination remains a later dedicated
     * architecture phase; this release never mutates or reuses the Etsy pager. */
}

function favRenderCurrent() {
    const nativeGrid=favNativeMainGrid0141(); if(!nativeGrid)return;
    favCaptureNativeGrid();
    const matched=favFilteredRecords();
    favState.filtered=matched;
    const pages=Math.max(1,Math.ceil(matched.length/favState.pageSize));
    favState.localPage=Math.min(Math.max(1,favState.localPage),pages);
    const start=(favState.localPage-1)*favState.pageSize;
    const page=matched.slice(start,start+favState.pageSize);
    const localGrid=favEnsureLocalGrid0141(nativeGrid);
    const frag=document.createDocumentFragment();
    if(!page.length){const li=document.createElement('li');li.className='ebsf-empty';li.textContent='No favorites match these filters.';frag.append(li);}else for(const item of page)frag.append(favNodeForRecord(item));
    favState.rendering=true;
    localGrid.replaceChildren(frag);
    nativeGrid.hidden=true;
    nativeGrid.setAttribute('aria-hidden','true');
    nativeGrid.setAttribute('data-ebsf-native-hidden','1');
    favState.rendered=true;
    favState.renderMode0141='bettersearch-local';
    document.body.classList.add('ebsf-results-active');
    favRenderCount(matched.length);
    favRenderPagination(pages);
    queueMicrotask(()=>{favState.rendering=false;});
}

async function favReapply(force=false) {
    if(!isFavoritesPage())return;
    const requestKey=favDatasetKey();
    favEnsureToolbar();
    if(!favEnhancementActive()){favRestoreNative();return;}

    /* No global sync wait: only the requested dataset can deduplicate this load. */
    await favLoadAll(force);
    if(!isFavoritesPage()||requestKey!==favDatasetKey())return;

    const coverage=await favMetadataEnsureCurrentRequirements0141();
    if(!isFavoritesPage()||requestKey!==favDatasetKey())return;
    favState.metadataCoverage0141=coverage;
    if(coverage.pending>0){
        /* Required deep data is actively being resolved. Keep Etsy's useful
         * native cards visible instead of presenting unknown as final false. */
        favRestoreNative();
        favState.metadataCoverage0141=coverage;
        return;
    }
    favRenderCurrent();
}

function favRefreshAfterBackgroundSync0137(requestKey) {
    if(!isFavoritesPage()||requestKey!==favDatasetKey())return;
    if(favEnhancementActive()&&favState.loadKey===requestKey&&favState.loadComplete)void favReapply();
    if(favState.filterOpen&&favState.rail?.isConnected)favRefreshRail();
    favUpdateScopeHeader0120?.();
}

async function favRefreshRouteData(){
    if(!isFavoritesPage())return;
    const requestKey=favDatasetKey();
    await favPrimeDatasetFromCache0137?.();
    if(!isFavoritesPage()||requestKey!==favDatasetKey())return;
    if(favEnhancementActive())await favReapply();
    if(!isFavoritesPage()||requestKey!==favDatasetKey())return;
    void Promise.resolve(favMaybeAutoSync(false))
        .then(()=>favRefreshAfterBackgroundSync0137(requestKey))
        .catch((error)=>console.warn('[Etsy BetterSearch] Background Favorites refresh failed:',error));
}

function favRemoveLocalFavorite(idValue) {
    const idString=String(idValue||'');if(!idString||!favState.recordsById.has(idString))return false;
    favState.recordsById.delete(idString);
    favState.records=favState.records.filter((item)=>item.id!==idString);
    favState.total=Math.max(0,(Number(favState.total)||favState.records.length+1)-1);
    favIndexMarkUnfavorite(idString).catch(()=>{});
    return true;
}

function favNativeActionForOwnedCard0141(card, target) {
    const native=favState.nativeNodes.get(String(card?.dataset?.ebsfId || ''));
    if(!native?.isConnected)return null;
    const favorite=favoriteButtonFromEvent(target);
    if(favorite){
        const nativeFavorite=Array.from(native.querySelectorAll('button,[role="button"]')).find((button)=>favoriteButtonFromEvent(button)===button);
        return nativeFavorite ? { type:'favorite', button:nativeFavorite } : null;
    }
    const button=target?.closest?.('button');
    if(button&&/(add to cart|multiple options|select options)/i.test(button.textContent||'')){
        const wanted=String(button.textContent||'').trim();
        const nativeButton=Array.from(native.querySelectorAll('button')).find((candidate)=>String(candidate.textContent||'').trim()===wanted)
            || Array.from(native.querySelectorAll('button')).find((candidate)=>/(add to cart|multiple options|select options)/i.test(candidate.textContent||''));
        return nativeButton ? { type:'button', button:nativeButton } : null;
    }
    return null;
}

function favHandleTransplantedClick(event) {
    const card=event.target?.closest?.('[data-ebsf-owned-card="1"]');if(!card)return;
    const favorite=favoriteButtonFromEvent(event.target);
    if(favorite){
        event.preventDefault();event.stopImmediatePropagation();
        const nativeAction=favNativeActionForOwnedCard0141(card,event.target);
        if(nativeAction?.button){
            setFavoriteWorking(favorite,true);
            nativeAction.button.click();
            setTimeout(()=>{
                const stillFavorited=isFavoritedButton(nativeAction.button);
                setFavoriteWorking(favorite,false);
                setFavoriteVisual(favorite,stillFavorited);
                if(!stillFavorited){favRemoveLocalFavorite(card.dataset.ebsfId);favRenderCurrent();}
            },900);
            return;
        }
        bridgeFavorite(card,favorite).then(()=>{if(!isFavoritedButton(favorite)){favRemoveLocalFavorite(card.dataset.ebsfId);favRenderCurrent();}});
        return;
    }
    const button=event.target?.closest?.('button');
    if(button&&/(add to cart|multiple options|select options)/i.test(button.textContent||'')){
        event.preventDefault();event.stopImmediatePropagation();
        const nativeAction=favNativeActionForOwnedCard0141(card,event.target);
        if(nativeAction?.button){nativeAction.button.click();return;}
        const url=card.dataset.ebsfUrl;if(url)window.open(url,'_blank','noopener');
    }
}
document.addEventListener('click',favHandleTransplantedClick,true);
document.addEventListener('click',(event)=>{if(!isFavoritesPage())return;const card=event.target?.closest?.('.favorites-landing-listing-card-container:not([data-ebsf-owned-card="1"])');if(!card)return;const button=favoriteButtonFromEvent(event.target);if(!button||!isFavoritedButton(button))return;const idValue=card.dataset.ebsfId||favListingIdFromNode(card);if(!idValue)return;setTimeout(()=>{const current=card.querySelector('button[aria-label*="Favorite" i],button[data-accessible-btn-fave],[data-favorite-button]')||button;if(card.isConnected&&isFavoritedButton(current))return;const removed=document.body.classList.contains('ebsf-results-active')&&favRemoveLocalFavorite(idValue);if(!removed)favIndexMarkUnfavorite(idValue).catch(()=>{});if(removed)favRenderCurrent();},900);},false);

function favBindNativeSearch(){const form=favSearchInput()?.closest('form');if(!form||form.dataset.ebsfBound)return;form.dataset.ebsfBound='1';form.addEventListener('submit',()=>{favRestoreNative();setTimeout(()=>favScheduleSync(0),450);setTimeout(()=>favScheduleSync(0),1100);});}

function favResetForDatasetChange0137() {
    const reopen=favState.filterOpen;
    if(reopen)favCloseFilters();
    favState.controller?.abort();
    favRestoreNative();
    favState.loadKey='';favState.loadPromise=null;favState.loadComplete=false;favState.records=[];favState.recordsById=new Map();favState.total=0;favState.extraPromise=null;favState.extraKey='';favState.extraReady=false;favState.groupQueryResolved=false;favState.localPage=favRequestedRoutePage0137();favState.nativeGrid=null;favState.nativeOrder=[];favState.nativeNodes=new Map();favState.nativeCaptured=false;favState.nativeCaptureViewKey0137='';favState.openSectionsInitialized=false;favState.openSections=new Set();favState.metadataCoverage0141=null;
    favState.cacheKey0137='';favState.cachePromise0137=null;favState.cacheScope0137=null;favState.cachePresentationReady0137=false;favState.loadSource0137='';
    favCaptureNativeGrid();favEnsureToolbar();favBindNativeSearch();favIndexObserveCurrentPage().catch(()=>{});favSyncHandleRouteChange();void favRefreshRouteData();if(reopen)requestAnimationFrame(()=>{if(isFavoritesPage()&&!favState.filterOpen)favOpenFilters();});
}

function favResetForNativeChange() {
    return favResetForDatasetChange0137();
}

function favClearNativeViewCapture0137() {
    favState.nativeGrid=null;
    favState.nativeOrder=[];
    favState.nativeNodes=new Map();
    favState.nativeCaptured=false;
    favState.nativeCaptureViewKey0137='';
}

function favGridContainsFreshNativePage0137(grid) {
    if(!grid)return false;
    if(grid!==favState.nativeGrid||!favState.nativeCaptured)return true;
    if(favState.nativeCaptureViewKey0137!==favViewKey0137())return true;
    const current=Array.from(grid.children).map((node)=>favListingIdFromNode(node)).filter(Boolean).join(',');
    const captured=Array.from(favState.nativeOrder||[]).map((node)=>favListingIdFromNode(node)).filter(Boolean).join(',');
    return current!==captured;
}

function favMaybeCaptureSettledNativePage0137() {
    if(!isFavoritesPage()||favState.rendering)return false;
    const grid=favNativeMainGrid0141();
    if(!grid||!favGridContainsFreshNativePage0137(grid))return false;
    const viewKey=favViewKey0137();
    favState.nativeGrid=grid;
    favState.nativeOrder=Array.from(grid.children);
    favState.nativeNodes=favNativeCardMap0141(document);
    favState.nativeCaptured=true;
    favState.nativeCaptureViewKey0137=viewKey;
    return true;
}

function favRefreshForViewChange0137() {
    const requestKey=favDatasetKey();
    favSyncHandleRouteChange();
    favEnsureToolbar();
    favBindNativeSearch();
    favState.nativeCaptureViewKey0137='';
    favScheduleCurrentPageObservation(350);

    if(!favEnhancementActive()){
        favRestoreNative();
        favClearNativeViewCapture0137();
        if(favState.filterOpen&&favState.rail?.isConnected)favRefreshRail();
        return;
    }

    if(favState.loadKey===requestKey&&favState.loadComplete){
        requestAnimationFrame(()=>{
            if(!isFavoritesPage()||favDatasetKey()!==requestKey)return;
            void favReapply();
            favUpdateScopeHeader0120?.();
        });
        return;
    }
    void favRefreshRouteData();
}

function favRefreshAfterReentry0137() {
    if(!isFavoritesPage())return;
    favState.wasFavoritesPage0137=true;
    favState.lastHref=location.href;
    favState.lastScopeKey=favScopeKey();
    favState.lastDatasetKey0137=favDatasetKey();
    favState.lastViewKey0137=favViewKey0137();
    favClearNativeViewCapture0137();
    favCaptureNativeGrid();
    favEnsureToolbar();
    favBindNativeSearch();
    favIndexObserveCurrentPage().catch(()=>{});
    favSyncHandleRouteChange();
    void favRefreshRouteData();
}

function favScheduleSync(delay=250){
    const wait=Math.max(0,Number(delay)||0);
    /* Keep the existing debounce for equal-priority lifecycle noise, but never
     * let a generic 250 ms body mutation postpone an already queued explicit
     * 0/80 ms route/search signal. A more urgent request may still pre-empt a
     * slower pending one. */
    if(favState.syncTimer&&favState.syncDelay0137<wait)return favState.syncTimer;
    clearTimeout(favState.syncTimer);
    favState.syncDelay0137=wait;
    favState.syncTimer=setTimeout(()=>{
        favState.syncTimer=0;
        favState.syncDelay0137=0;
        if(!isFavoritesPage()){
            favState.wasFavoritesPage0137=false;
            favState.nativeCaptureViewKey0137='';
            favRestoreNative();
            favCloseFilters();favHideSyncProgress();return;
        }
        const reentered=!favState.wasFavoritesPage0137;
        const href=location.href;
        const scopeKey=favScopeKey();
        const datasetKey=favDatasetKey();
        const viewKey=favViewKey0137();
        const datasetChanged=Boolean(favState.lastDatasetKey0137)&&favState.lastDatasetKey0137!==datasetKey;
        const viewChanged=Boolean(favState.lastViewKey0137)&&favState.lastViewKey0137!==viewKey;

        favState.wasFavoritesPage0137=true;
        favState.lastHref=href;
        favState.lastScopeKey=scopeKey;
        favState.lastDatasetKey0137=datasetKey;
        favState.lastViewKey0137=viewKey;

        if(reentered){favRefreshAfterReentry0137();return;}
        if(datasetChanged){favResetForDatasetChange0137();return;}
        if(viewChanged){favRefreshForViewChange0137();return;}
        favEnsureToolbar();favBindNativeSearch();
    },wait);
    return favState.syncTimer;
}

function favScheduleCurrentPageObservation(delay=1000){
    const wait=Math.max(0,Number(delay)||0);
    /* Preserve urgent 0/350 ms native-query/view observations. Repeated generic
     * 1000 ms mutations still debounce normally, but cannot push an already
     * scheduled higher-priority observation farther into the future. */
    if(favState.observeTimer&&favState.observeDelay0137<wait)return favState.observeTimer;
    clearTimeout(favState.observeTimer);
    favState.observeDelay0137=wait;
    favState.observeTimer=setTimeout(()=>{
        favState.observeTimer=0;
        favState.observeDelay0137=0;
        if(!isFavoritesPage()||favState.rendering)return;
        const recaptured=favMaybeCaptureSettledNativePage0137();
        favIndexObserveCurrentPage().catch(()=>{});
        if(recaptured&&favEnhancementActive()&&favState.loadKey===favDatasetKey()&&favState.loadComplete){
            requestAnimationFrame(()=>{if(isFavoritesPage()&&favEnhancementActive())void favReapply();});
        }
    },wait);
    return favState.observeTimer;
}

var FAV_RUNTIME_OWNED_SURFACE0137 = [
    '[data-ebsf-owned]',
    '[data-ebsf-owned-card="1"]',
    '[data-ebsf-local-grid]',
    '[data-ebsf-local-pagination]',
    '[data-ebsf-rail-slot]',
    '[data-ebsf-rail]',
    '[data-ebsf-all-header]',
    '[data-ebsf-toolbar-row]',
    '[data-ebsf-collection-strip]',
    '[data-ebsf-scope-count]',
    '.ebsf-result-count',
].join(',');
var FAV_RUNTIME_CRITICAL_REMOVAL0137 = '[data-ebsf-local-grid],[data-ebsf-local-pagination],[data-ebsf-rail-slot]';

function favRuntimeMutationElement0137(node){
    if(!node)return null;
    return node.nodeType===1?node:node.parentElement||null;
}

function favRuntimeOwnedSurface0137(node){
    const element=favRuntimeMutationElement0137(node);
    if(!element)return false;
    return Boolean(element.matches?.(FAV_RUNTIME_OWNED_SURFACE0137)||element.closest?.(FAV_RUNTIME_OWNED_SURFACE0137));
}

function favRuntimeCriticalRemoval0137(node){
    const element=favRuntimeMutationElement0137(node);
    if(!element)return false;
    return Boolean(element.matches?.(FAV_RUNTIME_CRITICAL_REMOVAL0137)||element.querySelector?.(FAV_RUNTIME_CRITICAL_REMOVAL0137));
}

function favRuntimeMutationNeedsLifecycle0137(record){
    if(!record||record.type!=='childList')return true;
    const removed=Array.from(record.removedNodes||[]);
    /* If Etsy/another actor removes a committed local grid/pager or rail portal,
     * keep the lifecycle signal so final ownership/shell repair can fail safe. */
    if(removed.some(favRuntimeCriticalRemoval0137))return true;
    if(favRuntimeOwnedSurface0137(record.target))return false;
    const changed=[...Array.from(record.addedNodes||[]),...removed];
    if(changed.length&&changed.every(favRuntimeOwnedSurface0137))return false;
    return true;
}

function favRuntimeHandleMutations0137(records){
    if(favState.rendering)return false;
    if(!Array.from(records||[]).some(favRuntimeMutationNeedsLifecycle0137))return false;
    favScheduleSync();
    favScheduleCurrentPageObservation();
    return true;
}

function favStartRuntime() {
    if(!favState.runtimeObserverBound0121){
        favState.observer?.disconnect();
        favState.observer=new MutationObserver(favRuntimeHandleMutations0137);
        favState.observer.observe(document.body,{childList:true,subtree:true});
        window.addEventListener('popstate',()=>favScheduleSync(80));window.addEventListener('pageshow',(event)=>{if(event.persisted)favScheduleSync(0);});favState.runtimeObserverBound0121=true;
    }
    if(!isFavoritesPage()){favState.wasFavoritesPage0137=false;return;}
    favState.wasFavoritesPage0137=true;
    favState.lastHref=location.href;favState.lastScopeKey=favScopeKey();favState.lastDatasetKey0137=favDatasetKey();favState.lastViewKey0137=favViewKey0137();
    favCaptureNativeGrid();favEnsureToolbar();favBindNativeSearch();favIndexObserveCurrentPage().then(()=>favDeepMaybeAutoScan()).catch(()=>{});void favRefreshRouteData();
}

/* Started by the final Favorites shell module after all late filter/layout
 * overrides are installed. */
