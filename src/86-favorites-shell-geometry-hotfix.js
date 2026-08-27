'use strict';

/* v0.12.1 Favorites shell geometry hotfix.
 *
 * The first v0.12 shell mounted the collection strip beside the toolbar in
 * Etsy's native search host. On All that host lives in the profile header; on
 * collection pages it lives inside the header's right column. The older
 * preserve-search compatibility layer could then apply a large negative left
 * margin. Own the new shell geometry explicitly instead: selector row first,
 * collection-style title/meta + toolbar row second, listings third.
 */

function favShellContent0121(){
    return document.querySelector('.phase3-listing-cards-section');
}

function favShellNormalizeToolbar0121(row=document.querySelector('[data-ebsf-toolbar-row]')){
    if(!row)return;
    row.classList.remove('ebsf-toolbar-preserve-search','ebsf-toolbar-compact');
    for(const property of ['width','max-width','margin-left','transform','flex'])row.style.removeProperty(property);
    const searchSlot=row.querySelector('.ebsf-native-search-slot')||favSearchAnchor()?.searchSlot;
    if(searchSlot){
        for(const property of ['flex','width','max-width','transform'])searchSlot.style.removeProperty(property);
    }
}

function favShellAllHeader0121(content=favShellContent0121()){
    if(!content)return null;
    let header=content.querySelector(':scope > [data-ebsf-all-header]');
    if(header)return header;
    header=document.createElement('section');
    header.className='ebsf-shell-content-header ebsf-shell-all-header';
    header.dataset.ebsfAllHeader='';
    header.innerHTML=`
        <div class="ebsf-shell-all-left wt-display-flex-xs wt-align-items-center">
            <div class="wt-display-flex-xs wt-flex-direction-column-xs wt-flex-gap-xs-1">
                <div class="wt-display-flex-xs wt-align-items-center wt-flex-gap-xs-2">
                    <h2 class="wt-text-title-large">All</h2>
                </div>
                <p class="wt-text-body-small ebsf-shell-meta">
                    <b>Private collection</b><span class="wt-pr-xs-1 wt-pl-xs-1">|</span><span data-ebsf-shell-count></span>
                </p>
            </div>
        </div>
        <div class="ebsf-shell-all-controls" data-ebsf-shell-controls></div>`;
    return header;
}

function favShellCurrentCollection0121(){
    const scope=favScope();
    return scope.type==='collection'
        ? favShellCollections0120().find((entry)=>entry.slug===scope.id)||null
        : null;
}

function favShellCountValues0121(shownValue){
    const props=favProps(),scope=favScope(),current=favShellCurrentCollection0121();
    const propsTotal=Math.max(0,Number(props?.totalListings)||0);
    const stateTotal=Math.max(0,Number(favState.total)||0);
    const collectionTotal=Math.max(0,Number(current?.count)||0);
    const total=scope.type==='collection'
        ? Math.max(stateTotal,propsTotal,collectionTotal)
        : Math.max(stateTotal,propsTotal,Array.isArray(favState.records)?favState.records.length:0);
    let shown=Number(shownValue);
    if(!Number.isFinite(shown)){
        shown=favState.rendered&&Array.isArray(favState.filtered)?favState.filtered.length:total;
    }
    return {
        total:Math.max(0,Math.round(total||0)),
        shown:Math.max(0,Math.round(shown||0)),
    };
}

function favShellUpdateMetadata0121(shownValue){
    const {total,shown}=favShellCountValues0121(shownValue);
    const scope=favScope();
    if(scope.type==='items'){
        const count=document.querySelector('[data-ebsf-all-header] [data-ebsf-shell-count]');
        if(count)count.textContent=`${total} favorites · ${shown} shown`;
        return;
    }

    const header=document.querySelector('#collections-landing-phase-3-header-container');
    const content=header?.querySelector('#collections-landing-left-side-header-content');
    if(!content)return;
    let meta=content.querySelector(':scope > p');
    if(!meta){
        meta=document.createElement('p');
        meta.className='wt-text-body-small ebsf-shell-meta';
        const current=favShellCurrentCollection0121();
        const visibility=current?.privacy==='private'?'Private':'Public';
        meta.innerHTML=`<b>${visibility} collection</b><span class="wt-pr-xs-1 wt-pl-xs-1">|</span>`;
        content.append(meta);
    }
    const separator=Array.from(meta.children).find((node)=>node.tagName==='SPAN'&&String(node.textContent||'').trim()==='|');
    if(separator){
        while(separator.nextSibling)separator.parentNode.removeChild(separator.nextSibling);
        meta.append(document.createTextNode(`${total} favorites · ${shown} shown`));
        return;
    }
    const current=favShellCurrentCollection0121();
    const visibility=current?.privacy==='private'?'Private':'Public';
    meta.textContent=`${visibility} collection | ${total} favorites · ${shown} shown`;
}

function favShellEnsureContentHeader0121(){
    const content=favShellContent0121();
    const toolbar=document.querySelector('[data-ebsf-toolbar-row]');
    if(!content||!toolbar)return null;

    const scope=favScope();
    let header=null;
    if(scope.type==='collection'){
        content.querySelector(':scope > [data-ebsf-all-header]')?.remove();
        header=content.querySelector(':scope > #collections-landing-phase-3-header-container')
            ||document.querySelector('#collections-landing-phase-3-header-container');
        const right=header?.querySelector('#collections-landing-right-side-header-container');
        if(header&&right&&!right.contains(toolbar))right.append(toolbar);
        header?.classList.add('ebsf-shell-content-header');
    }else{
        header=favShellAllHeader0121(content);
        if(header&&!header.isConnected)content.prepend(header);
        const right=header?.querySelector('[data-ebsf-shell-controls]');
        if(right&&!right.contains(toolbar))right.append(toolbar);
    }

    favShellNormalizeToolbar0121(toolbar);
    favShellSampleStyle0120(content);
    favShellUpdateMetadata0121();
    return header;
}

/* Replace v0.12's toolbar-relative insertion. The selector belongs to the
 * listing content column and is a sibling immediately before the whole title /
 * toolbar header, never a child/sibling of the right-side toolbar itself.
 */
favShellEnsureStrip0120=function favShellEnsureStrip0121(force=false,header=favShellEnsureContentHeader0121()){
    const content=favShellContent0121();
    if(!content)return;
    const scope=favScope();
    const key=[scope.type,scope.id,...favShellCollections0120().map((c)=>`${c.slug}:${c.count}:${c.name}`)].join('|');
    let strip=document.querySelector('[data-ebsf-collection-strip]');
    const correctParent=strip?.parentElement===content;
    const correctOrder=header?strip?.nextElementSibling===header:true;
    if(!force&&strip?.isConnected&&favShellStripKey0120===key&&correctParent&&correctOrder){
        favShellSampleStyle0120(content);
        return;
    }
    strip?.remove();
    strip=favShellBuildStrip0120();
    if(header&&header.parentElement===content)content.insertBefore(strip,header);
    else content.prepend(strip);
    favShellStripKey0120=key;
};

function favShellDiscardLegacyCount0121(){
    document.querySelectorAll('.ebsf-result-count').forEach((node)=>node.remove());
    favState.countNode=null;
}

favRenderCount=function favRenderCount0121(totalShown){
    favShellDiscardLegacyCount0121();
    favShellUpdateMetadata0121(totalShown);
};

/* v0.9.6/v0.10 preserve-search geometry is no longer valid on the permanent
 * shell. It can produce inline values such as margin-left:-401px. Keep it for
 * mobile/legacy layouts, but desktop Favorites always uses normal grid space.
 */
var favRepairToolbarLayoutBefore0121=favRepairToolbarLayout;
favRepairToolbarLayout=function favRepairToolbarLayout0121(){
    if(favShellDesktop0120()&&isFavoritesPage()){
        favShellNormalizeToolbar0121();
        return;
    }
    return favRepairToolbarLayoutBefore0121();
};

/* Re-own the v0.12 apply pass so All gets a collection-style content header
 * before the collection strip is positioned. */
favShellApply0120=function favShellApply0121(force=false){
    if(!isFavoritesPage()){
        document.querySelector('[data-ebsf-collection-strip]')?.remove();
        document.body?.classList.remove('ebsf-shell-v0121');
        return;
    }
    document.body?.classList.add('ebsf-shell-v0121');
    favEnsureToolbar();
    favShellDiscardLegacyCount0121();
    const header=favShellEnsureContentHeader0121();
    favShellEnsureStrip0120(force,header);
    favShellRemoveWhatsNew0120();
    if(favShellDesktop0120())favShellEnsureDesktopRail0120();else favShellRestoreMobile0120();
    favShellFilterButton0120();
    favShellNormalizeToolbar0121();
    favShellUpdateMetadata0121();
};

GM_addStyle(`
.ebsf-shell-v0121 .phase3-listing-cards-section{min-width:0!important;max-width:100%!important}
.ebsf-shell-v0121 .ebsf-collection-strip{display:flex!important;width:100%!important;max-width:100%!important;min-width:0!important;overflow:hidden!important;box-sizing:border-box;margin:0 0 16px!important}
.ebsf-shell-v0121 .ebsf-collection-fixed{flex:0 0 auto!important}
.ebsf-shell-v0121 .ebsf-collection-scroll{flex:1 1 auto!important;min-width:0!important;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important}
.ebsf-shell-v0121 .ebsf-toolbar-row{width:100%!important;max-width:100%!important;margin-left:0!important;transform:none!important;box-sizing:border-box!important}
.ebsf-shell-v0121 .ebsf-native-search-slot{flex:1 1 auto!important;width:auto!important;max-width:100%!important;min-width:0!important}
.ebsf-shell-v0121 .ebsf-shell-content-header{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
.ebsf-shell-v0121 .ebsf-shell-all-left h2,.ebsf-shell-v0121 .ebsf-shell-all-left p{margin:0}
.ebsf-shell-v0121 .ebsf-shell-meta{margin:0}
@media(min-width:900px){
    .ebsf-shell-v0121 .phase3-listing-cards-section>#collections-landing-phase-3-header-container,
    .ebsf-shell-v0121 .phase3-listing-cards-section>[data-ebsf-all-header]{
        display:grid!important;
        grid-template-columns:minmax(180px,max-content) minmax(0,1fr)!important;
        align-items:end!important;
        column-gap:24px!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        margin:0 0 16px!important;
    }
    .ebsf-shell-v0121 #collections-landing-left-side-header-container,
    .ebsf-shell-v0121 #collections-landing-right-side-header-container,
    .ebsf-shell-v0121 [data-ebsf-shell-controls]{min-width:0!important;max-width:100%!important}
    .ebsf-shell-v0121 #collections-landing-right-side-header-container,
    .ebsf-shell-v0121 [data-ebsf-shell-controls]{width:100%!important}
    .ebsf-shell-v0121 .favorites-landing-phase3-header-search-container:empty{display:none!important}
}
@media(max-width:899px){
    .ebsf-shell-v0121 [data-ebsf-all-header]{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important}
    .ebsf-shell-v0121 [data-ebsf-shell-controls]{width:100%!important}
}
`);

favShellSchedule0120(true);
