'use strict';

var FAV_SORTS = [
    ['etsy','Etsy order'], ['priceAsc','Price: low to high'], ['priceDesc','Price: high to low'],
    ['ratingDesc','Rating: high to low'], ['reviewsDesc','Most reviews'], ['discountDesc','Discount: high to low'],
    ['titleAsc','Title: A to Z'], ['titleDesc','Title: Z to A'], ['shopAsc','Shop: A to Z'],
    ['shippingAsc','Shipping: low to high'], ['cartsDesc','Most carts'], ['lowStock','Low stock first'],
];

function favFilterIcon() {
    return `<span class="wt-icon--smaller-xs etsy-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 15A3 3 0 1 1 4.275 19.25H2.5A.5.5 0 0 1 2 18.75V17.25A.5.5 0 0 1 2.5 16.75H4.275A3 3 0 0 1 7 15M21.5 16.75A.5.5 0 0 1 22 17.25V18.75A.5.5 0 0 1 21.5 19.25H11.668A.263.263 0 0 1 11.415 18.938 5.2 5.2 0 0 0 11.415 17.062.262.262 0 0 1 11.668 16.75zM17 9A3 3 0 0 1 19.725 10.75H21.5A.5.5 0 0 1 22 11.25V12.75A.5.5 0 0 1 21.5 13.25H19.725A2.998 2.998 0 0 1 14 12 3 3 0 0 1 17 9M12.303 10.75C12.456 10.75 12.573 10.887 12.556 11.04A8.3 8.3 0 0 0 12.556 12.96C12.574 13.114 12.456 13.25 12.303 13.25H2.5A.5.5 0 0 1 2 12.75V11.25A.5.5 0 0 1 2.5 10.75zM7 3A3 3 0 1 1 4.275 7.25H2.5A.5.5 0 0 1 2 6.75V5.25A.5.5 0 0 1 2.5 4.75H4.275A3 3 0 0 1 7 3M21.5 4.75A.5.5 0 0 1 22 5.25V6.75A.5.5 0 0 1 21.5 7.25H11.668A.263.263 0 0 1 11.415 6.938 5.2 5.2 0 0 0 11.415 5.062.262.262 0 0 1 11.668 4.75z"></path></svg></span>`;
}

function favEnsureToolbar() {
    if (!isFavoritesPage()) return;
    const row = document.querySelector('.favorites-landing-phase3-header-search-container .wt-display-flex-md, .favorites-landing-phase3-header-search-container .wt-display-flex-xs');
    const inputGroup = row?.querySelector('.wt-input-btn-group');
    if (!row || !inputGroup) return;
    let toolbar = row.querySelector('[data-ebsf-toolbar]');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'ebsf-toolbar';
        toolbar.dataset.ebsfToolbar = '';
        toolbar.innerHTML = `<button type="button" class="wt-btn wt-btn--transparent wt-justify-content-center wt-btn--small ebsf-filter-button" aria-expanded="false">${favFilterIcon()}<span data-ebsf-filter-label>Show filters</span></button>`;
        row.insertBefore(toolbar, inputGroup);
        favState.toolbar = toolbar;
        favState.filterButton = toolbar.querySelector('.ebsf-filter-button');
        favState.filterButton.addEventListener('click', favToggleFilters);
    }
    favEnsureSortMenu(row, inputGroup);
}

function favEnsureSortMenu(row, inputGroup) {
    let root = row.querySelector('[data-ebsf-sort]');
    if (root) { favState.sortRoot = root; favUpdateSortLabel(); return; }
    root = document.createElement('div');
    root.className = 'wt-menu wt-menu--use-animation ebsf-sort';
    root.dataset.ebsfSort = '';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'wt-btn wt-btn--transparent wt-menu__trigger wt-btn--small';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="wt-menu__trigger__label" data-ebsf-sort-label></span><span class="wt-menu__trigger__caret wt-icon--smaller etsy-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15.293 10A.707.707 0 0 1 15.793 11.207L12.53 14.47A.75.75 0 0 1 11.47 14.47L8.207 11.207A.707.707 0 0 1 8.707 10z"></path></svg></span>`;
    const body = document.createElement('div');
    body.className = 'wt-menu__body wt-menu__body--pinned ebsf-sort-menu';
    body.hidden = true;
    body.innerHTML = '<div class="wt-menu__body__main"><div role="menu" class="wt-options"></div></div>';
    const options = body.querySelector('.wt-options');
    for (const [key,label] of FAV_SORTS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wt-options__item wt-text-body-small wt-options__item--checkable';
        button.dataset.sort = key;
        button.setAttribute('role','menuitemradio');
        button.textContent = label;
        button.addEventListener('click', async () => {
            favCfg.sort = key; favSaveConfig(); favCloseSortMenu(); favUpdateSortLabel(); await favReapply();
        });
        options.append(button);
    }
    root.append(trigger, body);
    row.insertBefore(root, inputGroup.nextSibling);
    favState.sortRoot = root;
    favState.sortMenu = body;
    trigger.addEventListener('click', (event) => { event.stopPropagation(); body.hidden ? favOpenSortMenu() : favCloseSortMenu(); });
    favUpdateSortLabel();
}

function favUpdateSortLabel() {
    const root = favState.sortRoot || document.querySelector('[data-ebsf-sort]');
    if (!root) return;
    const label = FAV_SORTS.find(([key]) => key === favCfg.sort)?.[1] || 'Etsy order';
    const span = root.querySelector('[data-ebsf-sort-label]');
    if (span) span.textContent = label;
    root.querySelectorAll('[data-sort]').forEach((button) => {
        const selected = button.dataset.sort === favCfg.sort;
        button.classList.toggle('wt-options__item--selected', selected);
        button.setAttribute('aria-checked', String(selected));
    });
}

function favOpenSortMenu() {
    const root = favState.sortRoot; const menu = root?.querySelector('.ebsf-sort-menu'); if (!root || !menu) return;
    menu.hidden = false; root.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded','true');
}
function favCloseSortMenu() { const root=favState.sortRoot; const menu=root?.querySelector('.ebsf-sort-menu'); if(menu) menu.hidden=true; root?.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded','false'); }

document.addEventListener('click', (event) => { if (favState.sortRoot && !favState.sortRoot.contains(event.target)) favCloseSortMenu(); });

function favFilterControlLabel(text, input) {
    const label = document.createElement('label'); label.className='ebsf-check-line'; label.append(input, document.createTextNode(text)); return label;
}
function favCheckbox(key, text) {
    const input=document.createElement('input'); input.type='checkbox'; input.checked=favCfg.filters[key]===true;
    input.addEventListener('change', async()=>{ favCfg.filters[key]=input.checked; favSaveConfig(); await favReapply(); });
    return favFilterControlLabel(text,input);
}
function favNumberInput(key, placeholder='') {
    const input=document.createElement('input'); input.type='number'; input.step='any'; input.className='wt-input wt-input--small ebsf-number'; input.placeholder=placeholder; input.value=favCfg.filters[key]||'';
    input.addEventListener('change', async()=>{ favCfg.filters[key]=input.value; favSaveConfig(); await favReapply(); }); return input;
}
function favSection(title, body, open=false) {
    const details=document.createElement('details'); details.className='ebsf-section'; details.open=open;
    const summary=document.createElement('summary'); summary.innerHTML=`<span>${title}</span><span class="ebsf-chevron">⌄</span>`;
    const inner=document.createElement('div'); inner.className='ebsf-section-body'; inner.append(body); details.append(summary,inner); return details;
}

function favBuildFilterRail() {
    const rail=document.createElement('div'); rail.className='ebsf-rail'; rail.dataset.ebsfRail='';
    const header=document.createElement('div'); header.className='ebsf-rail-header'; header.innerHTML='<strong>Filters</strong>';
    const reset=document.createElement('button'); reset.type='button'; reset.className='wt-btn wt-btn--transparent wt-btn--small'; reset.textContent='Reset';
    reset.addEventListener('click', async()=>{ const keepRules=favCfg.multiRules; favCfg=favDefaultConfig(); favCfg.multiRules=keepRules; favSaveConfig(); favCloseFilters(); await favReapply(true); });
    header.append(reset); rail.append(header);

    const search=document.createElement('div');
    const strict=document.createElement('input'); strict.type='checkbox'; strict.checked=favCfg.strict;
    strict.addEventListener('change', async()=>{ favSetSearchMode('strict',strict.checked); favSaveConfig(); await favReapply(); });
    search.append(favFilterControlLabel('Strict title',strict));
    const mode=document.createElement('select'); mode.className='wt-select wt-input wt-input--small'; mode.innerHTML='<option value="phrase">Exact phrase</option><option value="all">All words</option>'; mode.value=favCfg.strictMode;
    mode.addEventListener('change', async()=>{ favCfg.strictMode=mode.value==='all'?'all':'phrase'; favSaveConfig(); await favReapply(); });
    search.append(mode);
    const multiRow=document.createElement('div'); multiRow.className='ebsf-multi-row';
    const multi=document.createElement('input'); multi.type='checkbox'; multi.checked=favCfg.multi;
    multi.addEventListener('change', async()=>{ favSetSearchMode('multi',multi.checked); favSaveConfig(); await favReapply(); });
    const configure=document.createElement('button'); configure.type='button'; configure.className='wt-btn wt-btn--transparent wt-btn--small'; configure.textContent='Configure…'; configure.addEventListener('click',favOpenMultiModal);
    multiRow.append(favFilterControlLabel('Multi-search',multi),configure); search.append(multiRow);
    const note=document.createElement('p'); note.className='wt-text-caption wt-text-gray'; note.textContent='Strict title uses the native “Search your favorites” text. Multi-search uses its own Title rules.'; search.append(note);
    rail.append(favSection('Search',search,true));

    const price=document.createElement('div');
    const priceGrid=document.createElement('div'); priceGrid.className='ebsf-two-col'; priceGrid.append(favNumberInput('minPrice','Min €'),favNumberInput('maxPrice','Max €')); price.append(priceGrid);
    const discountWrap=document.createElement('label'); discountWrap.className='ebsf-field'; discountWrap.append(document.createTextNode('Minimum discount %'),favNumberInput('minDiscount','0')); price.append(discountWrap);
    rail.append(favSection('Price',price));

    const availability=document.createElement('div'); availability.append(favCheckbox('availableOnly','Available only'),favCheckbox('onSale','On sale'),favCheckbox('freeShipping','Free shipping'));
    rail.append(favSection('Availability',availability));

    const format=document.createElement('div'); const formatSelect=document.createElement('select'); formatSelect.className='wt-select wt-input wt-input--small'; formatSelect.innerHTML='<option value="all">All items</option><option value="physical">Physical only</option><option value="digital">Digital only</option>'; formatSelect.value=favCfg.filters.itemFormat;
    formatSelect.addEventListener('change',async()=>{favCfg.filters.itemFormat=formatSelect.value;favSaveConfig();await favReapply();}); format.append(formatSelect);
    rail.append(favSection('Item format',format));

    const rating=document.createElement('div'); const ratingGrid=document.createElement('div'); ratingGrid.className='ebsf-two-col'; ratingGrid.append(favNumberInput('minRating','Min rating'),favNumberInput('minReviews','Min reviews')); rating.append(ratingGrid);
    rail.append(favSection('Rating & reviews',rating));

    const seller=document.createElement('div'); seller.append(favCheckbox('starSeller','Star Seller only'));
    const shop=document.createElement('select'); shop.className='wt-select wt-input wt-input--small ebsf-shop-select'; shop.innerHTML='<option value="">Any shop</option>'; const shops=[...new Set(favState.records.map(x=>x.shopName).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); for(const name of shops){const o=document.createElement('option');o.value=name;o.textContent=name;shop.append(o);} shop.value=favCfg.filters.shop;
    shop.addEventListener('change',async()=>{favCfg.filters.shop=shop.value;favSaveConfig();await favReapply();}); seller.append(shop);
    rail.append(favSection('Seller',seller));

    const features=document.createElement('div'); features.append(favCheckbox('bestSeller','Best Seller'),favCheckbox('personalizable','Personalizable'),favCheckbox('hasVariations','Has variations'),favCheckbox('hasVideo','Has video'));
    rail.append(favSection('Listing features',features));

    const popularity=document.createElement('div'); popularity.append(favCheckbox('lowStock','Etsy reports low stock'));
    const carts=document.createElement('label'); carts.className='ebsf-field'; carts.append(document.createTextNode('At least X carts (when Etsy reports it)'),favNumberInput('minCarts','e.g. 5')); popularity.append(carts);
    rail.append(favSection('Popularity & stock',popularity));

    const delivery=document.createElement('div'); const shipping=document.createElement('label'); shipping.className='ebsf-field'; shipping.append(document.createTextNode('Maximum shipping cost'),favNumberInput('maxShipping','€')); delivery.append(shipping,favCheckbox('returns','Returns accepted'),favCheckbox('exchanges','Exchanges accepted'));
    rail.append(favSection('Delivery',delivery));
    return rail;
}

function favRefreshRail() {
    if (!favState.filterOpen) return;
    const replacement=favBuildFilterRail();
    if (favState.rail?.isConnected) favState.rail.replaceWith(replacement);
    else if (favState.overlay?.isConnected) favState.overlay.querySelector('[data-ebsf-overlay-body]')?.replaceChildren(replacement);
    favState.rail=replacement;
}

function favToggleFilters() { favState.filterOpen ? favCloseFilters() : favOpenFilters(); }
function favOpenFilters() {
    favState.filterOpen=true; favState.filterButton?.setAttribute('aria-expanded','true'); const label=favState.filterButton?.querySelector('[data-ebsf-filter-label]'); if(label) label.textContent='Hide filters';
    if (innerWidth >= 900) {
        const sidebar=document.querySelector('[data-testid="sidebar"]'); if(!sidebar) return;
        favState.sidebar=sidebar; favState.sidebarNodes=Array.from(sidebar.childNodes); sidebar.classList.add('ebsf-sidebar-active'); const rail=favBuildFilterRail(); favState.rail=rail; sidebar.replaceChildren(rail);
    } else favOpenFilterOverlay();
}
function favCloseFilters() {
    favState.filterOpen=false; favState.filterButton?.setAttribute('aria-expanded','false'); const label=favState.filterButton?.querySelector('[data-ebsf-filter-label]'); if(label) label.textContent='Show filters';
    if(favState.sidebar?.isConnected && favState.sidebarNodes) favState.sidebar.replaceChildren(...favState.sidebarNodes);
    favState.sidebar?.classList?.remove('ebsf-sidebar-active');
    favState.sidebar=null; favState.sidebarNodes=null; favState.rail=null; favState.overlay?.remove(); favState.overlay=null;
}
function favOpenFilterOverlay() {
    const layer=document.createElement('div'); layer.className='ebsf-overlay'; layer.innerHTML='<section class="ebsf-overlay-panel" role="dialog" aria-modal="true" aria-label="Favorites filters"><header><button type="button" class="wt-btn wt-btn--transparent wt-btn--icon" data-close aria-label="Close">✕</button><h2>Filters</h2></header><div data-ebsf-overlay-body class="ebsf-overlay-body"></div><footer><button type="button" class="wt-btn wt-btn--primary wt-width-full" data-show>Show results</button></footer></section>';
    document.body.append(layer); favState.overlay=layer; const rail=favBuildFilterRail(); favState.rail=rail; layer.querySelector('[data-ebsf-overlay-body]').append(rail); layer.querySelector('[data-close]').addEventListener('click',favCloseFilters); layer.querySelector('[data-show]').addEventListener('click',favCloseFilters);
}

function favCloseRuleMenu(){favState.ruleMenu?.remove();favState.ruleMenu=null;}
function favMoveRule(idValue,dir){const r=favState.ruleDraft;const i=r.findIndex(x=>x.id===idValue);const t=i+(dir==='up'?-1:1);if(i<0||t<0||t>=r.length)return;const [x]=r.splice(i,1);r.splice(t,0,x);favRenderRuleModal();}
function favOpenRuleMenu(rule,button){favCloseRuleMenu();const menu=document.createElement('div');menu.className='ebs-row-menu';for(const [key,label] of [['up','Move up'],['down','Move down'],['duplicate','Duplicate rule'],['delete','Delete rule']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=(key==='up'&&favState.ruleDraft[0]?.id===rule.id)||(key==='down'&&favState.ruleDraft.at(-1)?.id===rule.id)||(key==='delete'&&favState.ruleDraft.length<=1);b.addEventListener('click',()=>{if(key==='up'||key==='down')return favMoveRule(rule.id,key);const i=favState.ruleDraft.findIndex(x=>x.id===rule.id);if(key==='duplicate'){const c=clone(rule);c.id=id('fav-rule');favState.ruleDraft.splice(i+1,0,c);}else if(key==='delete')favState.ruleDraft.splice(i,1);favCloseRuleMenu();favRenderRuleModal();});menu.append(b);}document.body.append(menu);const box=button.getBoundingClientRect();menu.style.left=`${Math.min(innerWidth-menu.offsetWidth-8,box.right-menu.offsetWidth)}px`;menu.style.top=`${Math.min(innerHeight-menu.offsetHeight-8,box.bottom+5)}px`;favState.ruleMenu=menu;}

function favRuleRow(rule) {
    const row=document.createElement('article');row.className='ebs-rule';row.dataset.ruleId=rule.id;
    const primary=document.createElement('div');primary.className='ebs-rule-primary';
    const drag=document.createElement('button');drag.type='button';drag.className='ebs-drag';drag.textContent='⠿';drag.draggable=true;drag.addEventListener('dragstart',()=>{favState.ruleDragId=rule.id;});
    primary.append(drag);
    const enabled=document.createElement('input');enabled.type='checkbox';enabled.className='ebs-check';enabled.checked=rule.enabled;enabled.addEventListener('change',()=>{rule.enabled=enabled.checked;});primary.append(enabled);
    primary.append(createSelect(rule.logic,rule.polarity==='exclude'?[['and','AND']]:LOGIC_OPTIONS,'Logic',(v)=>{rule.logic=v;favRenderRuleModal();},rule.polarity==='exclude'));
    primary.append(createSelect('title',FIELD_OPTIONS,'Field',()=>{}));
    primary.append(createSelect(rule.polarity,POLARITY_OPTIONS,'Match or exclude',(v)=>{rule.polarity=v; if(v==='exclude')rule.logic='and';favRenderRuleModal();}));
    primary.append(createSelect(rule.operator,TEXT_OPERATORS,'Condition',(v)=>{rule.operator=v;if(v!=='contains'){rule.options.wholeWord=false;rule.options.matchAnyWord=false;}favRenderRuleModal();}));
    primary.append(createInput(rule.value,'Text','Rule text',(v)=>{rule.value=v;}));
    const menu=document.createElement('button');menu.type='button';menu.className='ebs-menu-toggle';menu.textContent='...';menu.addEventListener('click',()=>favOpenRuleMenu(rule,menu));primary.append(menu);row.append(primary);
    const secondary=document.createElement('div');secondary.className='ebs-rule-secondary';const options=document.createElement('div');options.className='ebs-text-options';const defs=rule.operator==='contains'?[['caseSensitive','Case sensitive'],['wholeWord','Exact word / phrase'],['matchAnyWord','Any word']]:[['caseSensitive','Case sensitive']];for(const [key,labelText] of defs){const label=document.createElement('label');label.className='ebs-check-label';const c=document.createElement('input');c.type='checkbox';c.className='ebs-check';c.checked=rule.options?.[key]===true;c.addEventListener('change',()=>{rule.options={...rule.options,[key]:c.checked};});label.append(c,document.createTextNode(labelText));options.append(label);}secondary.append(options);row.append(secondary);
    row.addEventListener('dragover',(e)=>e.preventDefault());row.addEventListener('drop',(e)=>{e.preventDefault();const from=favState.ruleDraft.findIndex(x=>x.id===favState.ruleDragId);const to=favState.ruleDraft.findIndex(x=>x.id===rule.id);if(from<0||to<0||from===to)return;const [m]=favState.ruleDraft.splice(from,1);favState.ruleDraft.splice(to,0,m);favState.ruleDragId='';favRenderRuleModal();});
    return row;
}

function favOpenMultiModal(){if(favState.ruleModal)return;favState.ruleDraft=clone(favCfg.multiRules.length?favCfg.multiRules:[defaultRule('or','')]);const layer=document.createElement('div');layer.className='ebs-modal-layer';layer.innerHTML='<section class="ebs-modal" role="dialog" aria-modal="true"><header class="ebs-modal-header"><h2 class="ebs-modal-title">FAVORITES MULTI-SEARCH</h2><div class="ebs-modal-meta" data-count></div></header><div class="ebs-modal-editor"><div class="ebs-modal-body" data-body></div></div><footer class="ebs-modal-footer"><span class="ebs-draft-note">Draft changes are not applied until Apply.</span><button type="button" class="ebs-button is-quiet" data-cancel>Cancel</button><button type="button" class="ebs-button is-primary" data-apply>Apply</button></footer></section>';document.body.append(layer);favState.ruleModal=layer;layer.querySelector('[data-cancel]').addEventListener('click',favCloseMultiModal);layer.querySelector('[data-apply]').addEventListener('click',favApplyMultiModal);favRenderRuleModal();}
function favCloseMultiModal(){favCloseRuleMenu();favState.ruleModal?.remove();favState.ruleModal=null;favState.ruleDraft=null;}
function favRenderRuleModal(){const layer=favState.ruleModal;if(!layer)return;const body=layer.querySelector('[data-body]');body.replaceChildren();const headings=document.createElement('div');headings.className='ebs-columns';for(const [cls,text] of [['logic','LOGIC'],['field','FIELD'],['polarity','MATCH / EXCLUDE'],['condition','OPTIONS']]){const s=document.createElement('span');s.className=`is-${cls}`;s.textContent=text;headings.append(s);}body.append(headings);favState.ruleDraft.forEach(r=>body.append(favRuleRow(r)));const actions=document.createElement('div');actions.className='ebs-actions';const add=document.createElement('button');add.type='button';add.className='ebs-button';add.textContent='+ Add rule';add.addEventListener('click',()=>{favState.ruleDraft.push(defaultRule('or',''));favRenderRuleModal();});actions.append(add);body.append(actions);const details=document.createElement('details');details.className='ebs-preview';const summary=document.createElement('summary');const plan=compileMultiPlan(favState.ruleDraft);summary.textContent=`Search preview · ${plan.searches.length} ${plan.searches.length===1?'search':'searches'} · ${plan.shared.length} shared ${plan.shared.length===1?'rule':'rules'}`;const pre=document.createElement('pre');pre.textContent=plan.searches.map((s,i)=>`${i+1}. ${s.query}`).join('\n') || 'No enabled Match rules.';details.append(summary,pre);body.append(details);layer.querySelector('[data-count]').textContent=`${favState.ruleDraft.length} rules · ${favState.ruleDraft.filter(r=>r.enabled).length} enabled`;}
async function favApplyMultiModal(){const rules=normalizeRules(favState.ruleDraft);if(!rules.some(r=>r.enabled&&r.polarity==='match'&&ruleValue(r))){alert('Multi-search needs at least one enabled Match rule.');return;}favCfg.multiRules=rules;favCfg.multi=true;favCfg.strict=false;favSaveConfig();favCloseMultiModal();if(typeof favReplaceSectionBodyV079==='function')favReplaceSectionBodyV079('search',favBuildSearchV079);await favReapply(true);}
