'use strict';

/* v0.12.0 Favorites filter catalogue and layout-schema v2.
 *
 * Filter bindings are independent from their visual drawer. This lets an
 * option be moved or duplicated while every visual instance continues to
 * control one shared value in favCfg.
 */

var FAV_FILTER_LAYOUT_SCHEMA_VERSION0120 = 2;
var FAV_FILTER_LAYOUT_DEFAULTS_REVISION0121 = 2;
var FAV_FILTER_LAYOUT_STORAGE_KEY0122 = 'etsy-bettersearch.favorites.filter-layout.v2';
if (typeof FAV_EU_COUNTRY_CODES0120 === 'undefined') {
    var FAV_EU_COUNTRY_CODES0120 = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
}
var FAV_FILTER_BINDINGS0120 = new Set([
    'strict-title','multi-search', ...FAV_NATIVE_CATEGORIES_.map(([key]) => `category:${key}`),
    'ships-anywhere','ships-europe','ships-eu','ships-local','ships-country','price-range',
    'etsys-picks','star-seller','available-only','on-sale','free-shipping','customizable',
    'has-variations','gift-wrap','physical','digital','vintage','shop','low-stock','min-carts',
    'min-rating','min-reviews','max-shipping','returns','exchanges',
]);

function favBindingSupported0120(bindingKey) {
    return FAV_FILTER_BINDINGS0120.has(bindingKey) || /^ships-origin:[A-Z]{2}$/.test(bindingKey);
}

function favLayoutId0120(prefix = 'layout') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function favCurrentCountry0120() {
    const code=String(favProps()?.countryIsoCode||'').trim().toUpperCase();
    return FAV_COUNTRY_CODES_.includes(code)?code:'';
}

function favLayoutOption0120(bindingKey, label, hidden = false) {
    return { instanceId:favLayoutId0120('option'), bindingKey, label, hidden };
}

function favLayoutDrawer0120(definitionKey, label, options, hidden = false) {
    return { instanceId:favLayoutId0120('drawer'), definitionKey, label, hidden, optionInstances:options };
}

function favDefaultFilterLayout0120() {
    return [
        favLayoutDrawer0120('search','Search',[
            favLayoutOption0120('strict-title','Strict title'),
            favLayoutOption0120('multi-search','Multi-search'),
        ]),
        favLayoutDrawer0120('category','Category',FAV_NATIVE_CATEGORIES_.map(([key,label]) => favLayoutOption0120(`category:${key}`,label))),
        favLayoutDrawer0120('ships-from','Ships from',[
            favLayoutOption0120('ships-anywhere','Anywhere'),
            favLayoutOption0120('ships-europe','Europe'),
            favLayoutOption0120('ships-eu','European Union'),
            favLayoutOption0120('ships-local','Your country'),
            favLayoutOption0120('ships-country','Another country'),
        ]),
        favLayoutDrawer0120('price','Price',[favLayoutOption0120('price-range','Price range')]),
        favLayoutDrawer0120('item-qualities','Item qualities',[
            favLayoutOption0120('etsys-picks',"Etsy's Picks",true),
            favLayoutOption0120('star-seller','Star Seller'),
            favLayoutOption0120('available-only','Available only'),
            favLayoutOption0120('on-sale','On sale'),
            favLayoutOption0120('free-shipping','Free shipping'),
            favLayoutOption0120('customizable','Customizable',true),
            favLayoutOption0120('has-variations','Has variations',true),
            favLayoutOption0120('gift-wrap','Can be gift wrapped',true),
            favLayoutOption0120('physical','Exclude digital downloads'),
            favLayoutOption0120('digital','Digital downloads only'),
        ]),
        favLayoutDrawer0120('item-type','Item type',[favLayoutOption0120('vintage','Vintage')]),
        favLayoutDrawer0120('seller','Seller',[favLayoutOption0120('shop','Shop selector')]),
        favLayoutDrawer0120('popularity-and-stock','Popularity & stock',[
            favLayoutOption0120('low-stock','Etsy reports low stock'),
            favLayoutOption0120('min-carts','Minimum reported carts'),
        ],true),
        favLayoutDrawer0120('rating-and-reviews','Rating & reviews',[
            favLayoutOption0120('min-rating','Minimum rating'),
            favLayoutOption0120('min-reviews','Minimum review count'),
        ],true),
        favLayoutDrawer0120('delivery','Delivery',[
            favLayoutOption0120('max-shipping','Maximum shipping cost'),
            favLayoutOption0120('returns','Returns accepted'),
            favLayoutOption0120('exchanges','Exchanges accepted'),
        ],true),
    ];
}

function favNormalizeFilterLayout0120(value) {
    if (!Array.isArray(value)) return favDefaultFilterLayout0120();
    const ids = new Set();
    const drawers = [];
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') continue;
        let instanceId = String(raw.instanceId || favLayoutId0120('drawer'));
        if (ids.has(instanceId)) instanceId = favLayoutId0120('drawer');
        ids.add(instanceId);
        const options = [];
        for (const candidate of Array.isArray(raw.optionInstances) ? raw.optionInstances : []) {
            const bindingKey = String(candidate?.bindingKey || '');
            if (!favBindingSupported0120(bindingKey)) continue;
            let optionId = String(candidate.instanceId || favLayoutId0120('option'));
            if (ids.has(optionId)) optionId = favLayoutId0120('option');
            ids.add(optionId);
            options.push({
                instanceId:optionId,
                bindingKey,
                label:String(candidate.label || favDefaultBindingLabel0120(bindingKey)).trim().slice(0,80) || favDefaultBindingLabel0120(bindingKey),
                hidden:candidate.hidden === true,
            });
        }
        drawers.push({
            instanceId,
            definitionKey:String(raw.definitionKey || 'custom').slice(0,80),
            label:String(raw.label || 'Filters').trim().slice(0,80) || 'Filters',
            hidden:raw.hidden === true,
            optionInstances:options,
        });
    }
    return drawers.length ? drawers : favDefaultFilterLayout0120();
}

function favDefaultBindingLabel0120(bindingKey) {
    if(bindingKey.startsWith('ships-origin:'))return favCountryName(bindingKey.slice(13))||bindingKey.slice(13);
    for (const drawer of favDefaultFilterLayout0120()) {
        const match = drawer.optionInstances.find((option) => option.bindingKey === bindingKey);
        if (match) return match.label;
    }
    return String(bindingKey || 'Filter');
}

var favNormalizeUiPrefsBefore0120 = favNormalizeUiPrefs;
favNormalizeUiPrefs = function favNormalizeUiPrefs0120(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = favNormalizeUiPrefsBefore0120(source);
    const migrated = Number(source.filterLayoutSchemaVersion) === FAV_FILTER_LAYOUT_SCHEMA_VERSION0120;
    const filterLayout=favNormalizeFilterLayout0120(migrated ? source.filterLayout : null);
    if(migrated&&Number(source.filterLayoutDefaultsRevision)<FAV_FILTER_LAYOUT_DEFAULTS_REVISION0121){
        for(const drawer of filterLayout)for(const option of drawer.optionInstances)if(option.bindingKey==='etsys-picks')option.hidden=true;
    }
    return {
        ...base,
        redirectGeneratedGroups:source.redirectGeneratedGroups !== false,
        filterLayoutSchemaVersion:FAV_FILTER_LAYOUT_SCHEMA_VERSION0120,
        filterLayoutDefaultsRevision:FAV_FILTER_LAYOUT_DEFAULTS_REVISION0121,
        filterLayout,
    };
};

favUiPrefs = favNormalizeUiPrefs(GM_getValue(FAV_UI_PREFS_STORAGE_KEY, favUiPrefs || {}));
const favStoredFilterLayout0122=GM_getValue(FAV_FILTER_LAYOUT_STORAGE_KEY0122,null);
if(Array.isArray(favStoredFilterLayout0122))favUiPrefs.filterLayout=favNormalizeFilterLayout0120(favStoredFilterLayout0122);
favSaveUiPrefs();

function favFilterLayout0120() { return favUiPrefs.filterLayout || (favUiPrefs.filterLayout = favDefaultFilterLayout0120()); }
function favSaveFilterLayout0120() { favUiPrefs.filterLayout = favNormalizeFilterLayout0120(favUiPrefs.filterLayout); GM_setValue(FAV_FILTER_LAYOUT_STORAGE_KEY0122,favUiPrefs.filterLayout);favSaveUiPrefs(); }
function favFindDrawer0120(idValue) { return favFilterLayout0120().find((drawer) => drawer.instanceId === idValue) || null; }
function favFindOption0120(idValue) {
    for (const drawer of favFilterLayout0120()) {
        const option = drawer.optionInstances.find((entry) => entry.instanceId === idValue);
        if (option) return { drawer, option };
    }
    return null;
}

function favBindingActive0120(bindingKey, config = favCfg) {
    const f = config.filters || {};
    if (bindingKey === 'strict-title') return config.strict === true;
    if (bindingKey === 'multi-search') return config.multi === true;
    if (bindingKey.startsWith('category:')) return String(f.category || '') === bindingKey.slice(9);
    if (bindingKey.startsWith('ships-origin:')) return String(f.shipsFrom || '') === 'country' && String(f.shipsFromCountry || '').toUpperCase() === bindingKey.slice(13);
    if (bindingKey.startsWith('ships-')) return String(f.shipsFrom || 'anywhere') === bindingKey.slice(6);
    if (bindingKey === 'price-range') return Boolean(f.minPrice || f.maxPrice);
    if (bindingKey === 'etsys-picks') return f.etsysPick === true;
    if (bindingKey === 'star-seller') return f.starSeller === true;
    if (bindingKey === 'available-only') return f.availableOnly === true;
    if (bindingKey === 'on-sale') return f.onSale === true;
    if (bindingKey === 'free-shipping') return f.freeShipping === true;
    if (bindingKey === 'customizable') return f.personalizable === true;
    if (bindingKey === 'has-variations') return f.hasVariations === true;
    if (bindingKey === 'gift-wrap') return f.giftWrap === true;
    if (bindingKey === 'physical') return f.itemFormat === 'physical';
    if (bindingKey === 'digital') return f.itemFormat === 'digital';
    if (bindingKey === 'vintage') return f.vintage === true;
    if (bindingKey === 'shop') return Boolean(f.shop);
    if (bindingKey === 'low-stock') return f.lowStock === true;
    if (bindingKey === 'min-carts') return Boolean(f.minCarts);
    if (bindingKey === 'min-rating') return Boolean(f.minRating);
    if (bindingKey === 'min-reviews') return Boolean(f.minReviews);
    if (bindingKey === 'max-shipping') return Boolean(f.maxShipping);
    if (bindingKey === 'returns') return f.returns === true;
    if (bindingKey === 'exchanges') return f.exchanges === true;
    return false;
}

function favClearBinding0120(bindingKey) {
    const f = favCfg.filters;
    if (bindingKey === 'strict-title') favCfg.strict = false;
    else if (bindingKey === 'multi-search') favCfg.multi = false;
    else if (bindingKey.startsWith('category:') && f.category === bindingKey.slice(9)) f.category = '';
    else if (bindingKey.startsWith('ships-origin:') && f.shipsFrom === 'country' && String(f.shipsFromCountry||'').toUpperCase() === bindingKey.slice(13)) { f.shipsFrom='anywhere'; f.shipsFromCountry=''; }
    else if (bindingKey.startsWith('ships-') && f.shipsFrom === bindingKey.slice(6)) { f.shipsFrom='anywhere'; f.shipsFromCountry=''; }
    else if (bindingKey === 'price-range') { f.minPrice=''; f.maxPrice=''; }
    else if (bindingKey === 'physical' || bindingKey === 'digital') { if (f.itemFormat === bindingKey) f.itemFormat='all'; }
    else {
        const map = {
            'etsys-picks':'etsysPick','star-seller':'starSeller','available-only':'availableOnly','on-sale':'onSale',
            'free-shipping':'freeShipping','customizable':'personalizable','has-variations':'hasVariations','gift-wrap':'giftWrap',
            vintage:'vintage',shop:'shop','low-stock':'lowStock','min-carts':'minCarts','min-rating':'minRating',
            'min-reviews':'minReviews','max-shipping':'maxShipping',returns:'returns',exchanges:'exchanges',
        };
        if (map[bindingKey]) f[map[bindingKey]] = typeof f[map[bindingKey]] === 'boolean' ? false : '';
    }
}

function favVisibleBindingCount0120(bindingKey, ignoredInstance = '') {
    let count = 0;
    for (const drawer of favFilterLayout0120()) {
        if (drawer.hidden) continue;
        count += drawer.optionInstances.filter((option) => option.bindingKey === bindingKey && !option.hidden && option.instanceId !== ignoredInstance).length;
    }
    return count;
}

/* The defaults-revision migration can hide Etsy's Picks on an existing
 * install. Do not leave a previously active value filtering invisibly. */
if(favBindingActive0120('etsys-picks')&&favVisibleBindingCount0120('etsys-picks')===0){favClearBinding0120('etsys-picks');favSaveConfig();}

function favCommitBinding0120(bindingKey) {
    favSaveConfig();
    favState.localPage = 1;
    favSyncBindingControls0120(bindingKey);
    const result = favReapply();
    Promise.resolve(result).finally(()=>favScheduleFacetAvailability0121());
    return result;
}

function favSyncBindingControls0120(bindingKey) {
    const active = favBindingActive0120(bindingKey);
    Array.from(document.querySelectorAll('[data-ebsf-binding]')).filter((root)=>root.dataset.ebsfBinding===bindingKey).forEach((root) => {
        root.classList.toggle('is-active', active);
        root.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach((input) => { input.checked = active; });
        root.querySelectorAll('[aria-pressed]').forEach((button) => {button.setAttribute('aria-pressed', String(active));button.classList.toggle('is-selected',active);});
    });
    if(bindingKey.startsWith('category:')||bindingKey==='category:'){
        document.querySelectorAll('[data-ebsf-binding^="category:"]').forEach((root)=>{
            const selected=favBindingActive0120(root.dataset.ebsfBinding);root.classList.toggle('is-active',selected);root.querySelectorAll('[aria-pressed]').forEach((button)=>{button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected);});
        });
        document.querySelectorAll('[data-ebsf-all-categories]').forEach((button)=>{const selected=!favCfg.filters.category;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});
    }
}

function favChoiceOption0120(instance, property) {
    const control = favCheckbox({
        checked:favBindingActive0120(instance.bindingKey),
        label:instance.label,
        onChange:(checked) => { favCfg.filters[property]=checked; favCommitBinding0120(instance.bindingKey); },
    });
    return control.row;
}

function favFormatOption0120(instance, value) {
    const control = favCheckbox({
        checked:favCfg.filters.itemFormat === value,
        label:instance.label,
        onChange:(checked) => {
            favCfg.filters.itemFormat = checked ? value : (favCfg.filters.itemFormat === value ? 'all' : favCfg.filters.itemFormat);
            favCommitBinding0120(instance.bindingKey);
            favSyncBindingControls0120(value === 'digital' ? 'physical' : 'digital');
        },
    });
    return control.row;
}

function favSearchOption0120(instance, mode) {
    const split = document.createElement('span');
    split.className = `ebs-split ebsf-search-split${favBindingActive0120(instance.bindingKey) ? ' ebs-active' : ''}`;
    const main = document.createElement('button');
    main.type='button'; main.className='ebs-main'; main.textContent=instance.label;
    main.setAttribute('aria-pressed',String(favBindingActive0120(instance.bindingKey)));
    main.addEventListener('click',()=>{favSetSearchMode(mode,!favBindingActive0120(instance.bindingKey));favCommitBinding0120(instance.bindingKey);favSyncBindingControls0120(mode==='strict'?'multi-search':'strict-title');});
    const more=document.createElement('button');more.type='button';more.className='ebs-caret';more.textContent='▾';
    if(mode==='strict'){
        more.setAttribute('aria-label','Strict title settings');
        more.addEventListener('click',()=>{favState.strictSettingsOpen=!favState.strictSettingsOpen;favRefreshRail();});
    }else{
        more.setAttribute('aria-label','Multi-search rules');more.setAttribute('aria-haspopup','dialog');more.addEventListener('click',favOpenMultiModal);
    }
    split.append(main,more);
    if(mode==='strict'&&favState.strictSettingsOpen){
        const panel=document.createElement('div');panel.className='ebsf-strict-settings';panel.append(
            favRadio({name:'ebsf-strict-mode-v2',value:'phrase',checked:favCfg.strictMode==='phrase',label:'Exact phrase',onChange:()=>{favCfg.strictMode='phrase';favCommitBinding0120(instance.bindingKey);}}).row,
            favRadio({name:'ebsf-strict-mode-v2',value:'all',checked:favCfg.strictMode==='all',label:'All words',onChange:()=>{favCfg.strictMode='all';favCommitBinding0120(instance.bindingKey);}}).row
        );
        const wrap=document.createElement('div');wrap.append(split,panel);return wrap;
    }
    return split;
}

function favCountrySelect0121(bindingKey='ships-country') {
    const country=favCurrentCountry0120();
    const selected=String(favCfg.filters.shipsFromCountry||country||'').toUpperCase();
    let options=favCountryOptions(false);const availabilityMode=favAvailabilityMode0110();
    if(availabilityMode!=='disabled'){
        const allowed=favCatalogueCapabilities0101(favRecordsForBinding0120(bindingKey)).shipsFromCodes||new Set();
        if(availabilityMode==='filtered'||allowed.size)options=favFilterCountryOptions0101(options,allowed,selected);
    }
    const select=favSelect(selected,options,(value)=>{favCfg.filters.shipsFromCountry=value;favSyncShippingControls0121();favCommitBinding0120(bindingKey);});
    select.dataset.ebsfCountrySelect='';return select;
}

function favSyncShippingControls0121({focusCountry=false}={}) {
    for(const key of ['ships-anywhere','ships-europe','ships-eu','ships-local','ships-country'])favSyncBindingControls0120(key);
    document.querySelectorAll('[data-ebsf-binding^="ships-origin:"]').forEach((root)=>favSyncBindingControls0120(root.dataset.ebsfBinding));
    for(const root of document.querySelectorAll('[data-ebsf-binding="ships-country"]')){
        const wrap=root.firstElementChild;let select=root.querySelector('[data-ebsf-country-select]');
        if(favCfg.filters.shipsFrom==='country'&&!select&&wrap){select=favCountrySelect0121('ships-country');wrap.append(select);if(focusCountry)requestAnimationFrame(()=>select.focus({preventScroll:true}));}
        else if(favCfg.filters.shipsFrom!=='country'&&select)select.remove();
    }
}

function favShipsOption0120(instance, mode) {
    const country = favCurrentCountry0120();
    if (mode === 'local' && !country) return null;
    const labels = { local:favCountryName(country) };
    const wrap=document.createElement('div');
    const radio=favRadio({name:'ebsf-ships-from-v2',value:mode,checked:favCfg.filters.shipsFrom===mode,label:labels[mode]||instance.label,onChange:(value)=>{
        favCfg.filters.shipsFrom=value;if(value!=='country')favCfg.filters.shipsFromCountry='';favSyncShippingControls0121({focusCountry:value==='country'});favCommitBinding0120(instance.bindingKey);
    }});
    wrap.append(radio.row);
    if(mode==='country'&&favCfg.filters.shipsFrom==='country')wrap.append(favCountrySelect0121(instance.bindingKey));
    return wrap;
}

function favSpecificCountryOption0120(instance) {
    const code=instance.bindingKey.slice(13);const control=favCheckbox({checked:favBindingActive0120(instance.bindingKey),label:instance.label,onChange:(checked)=>{
        if(checked){favCfg.filters.shipsFrom='country';favCfg.filters.shipsFromCountry=code;}
        else if(favBindingActive0120(instance.bindingKey)){favCfg.filters.shipsFrom='anywhere';favCfg.filters.shipsFromCountry='';}
        favSyncShippingControls0121();favCommitBinding0120(instance.bindingKey);
    }});return control.row;
}

function favCategoryOption0120(instance) {
    const value=instance.bindingKey.slice(9);const button=document.createElement('button');button.type='button';button.className='ebsf-native-link';button.textContent=instance.label;
    button.classList.toggle('is-selected',favCfg.filters.category===value);button.setAttribute('aria-pressed',String(favCfg.filters.category===value));
    button.addEventListener('click',()=>{favCfg.filters.category=favCfg.filters.category===value?'':value;favSyncBindingControls0120('category:');favCommitBinding0120(instance.bindingKey);});return button;
}

function favNumberOption0120(instance, property, placeholder, prefix = '') {
    const field=document.createElement('label');field.className='ebsf-native-field';field.append(document.createTextNode(instance.label));
    field.append(favNumber(favCfg.filters[property],placeholder,(value)=>{favCfg.filters[property]=value;favCommitBinding0120(instance.bindingKey);},prefix).wrap);return field;
}

function favBuildOption0120(instance) {
    const root=document.createElement('div');root.className='ebsf-v2-option';root.dataset.ebsfOptionInstance=instance.instanceId;root.dataset.ebsfBinding=instance.bindingKey;
    let content=null;const key=instance.bindingKey;
    if(key==='strict-title')content=favSearchOption0120(instance,'strict');
    else if(key==='multi-search')content=favSearchOption0120(instance,'multi');
    else if(key.startsWith('category:'))content=favCategoryOption0120(instance);
    else if(key.startsWith('ships-origin:'))content=favSpecificCountryOption0120(instance);
    else if(key.startsWith('ships-'))content=favShipsOption0120(instance,key.slice(6));
    else if(key==='price-range')content=favBuildPrice();
    else if(key==='etsys-picks')content=favChoiceOption0120(instance,'etsysPick');
    else if(key==='star-seller')content=favChoiceOption0120(instance,'starSeller');
    else if(key==='available-only')content=favChoiceOption0120(instance,'availableOnly');
    else if(key==='on-sale')content=favChoiceOption0120(instance,'onSale');
    else if(key==='free-shipping')content=favChoiceOption0120(instance,'freeShipping');
    else if(key==='customizable')content=favChoiceOption0120(instance,'personalizable');
    else if(key==='has-variations')content=favChoiceOption0120(instance,'hasVariations');
    else if(key==='gift-wrap')content=favChoiceOption0120(instance,'giftWrap');
    else if(key==='physical')content=favFormatOption0120(instance,'physical');
    else if(key==='digital')content=favFormatOption0120(instance,'digital');
    else if(key==='vintage')content=favChoiceOption0120(instance,'vintage');
    else if(key==='shop'){
        const selected=String(favCfg.filters.shop||'');const shops=[...new Set(favRecordsForBinding0120(key).map((record)=>record.shopName).filter(Boolean))];if(selected&&!shops.includes(selected))shops.push(selected);shops.sort((a,b)=>a.localeCompare(b));
        content=favSelect(favCfg.filters.shop,[{value:'',label:'Any shop'},...shops.map((shop)=>({value:shop,label:shop}))],(value)=>{favCfg.filters.shop=value;favCommitBinding0120(key);});
    }else if(key==='low-stock')content=favChoiceOption0120(instance,'lowStock');
    else if(key==='min-carts')content=favNumberOption0120(instance,'minCarts','e.g. 5');
    else if(key==='min-rating')content=favNumberOption0120(instance,'minRating','Min rating');
    else if(key==='min-reviews')content=favNumberOption0120(instance,'minReviews','Min reviews');
    else if(key==='max-shipping')content=favNumberOption0120(instance,'maxShipping','0',favCurrencySymbol());
    else if(key==='returns')content=favChoiceOption0120(instance,'returns');
    else if(key==='exchanges')content=favChoiceOption0120(instance,'exchanges');
    if(!content)return null;root.append(content);return root;
}

function favConfigWithoutBinding0120(bindingKey) {
    const config=favNormalizeConfig(favCfg);const current=favCfg;
    try{
        favCfg=config;
        if(bindingKey.startsWith('category:'))favCfg.filters.category='';
        else if(bindingKey.startsWith('ships-')){favCfg.filters.shipsFrom='anywhere';favCfg.filters.shipsFromCountry='';}
        else if(bindingKey==='physical'||bindingKey==='digital')favCfg.filters.itemFormat='all';
        else favClearBinding0120(bindingKey);
        return favNormalizeConfig(favCfg);
    }finally{favCfg=current;}
}

function favRecordsForBinding0120(bindingKey) {
    if(favAvailabilityMode0110()!=='filtered')return favState.records;
    favState.facetAvailabilityCache0120=favState.facetAvailabilityCache0120||new Map();
    const config=favConfigWithoutBinding0120(bindingKey);const cacheKey=JSON.stringify(config);
    if(favState.facetAvailabilityCache0120.has(cacheKey))return favState.facetAvailabilityCache0120.get(cacheKey);
    const current=favCfg;
    try{favCfg=config;const records=favFilteredRecords();favState.facetAvailabilityCache0120.set(cacheKey,records);return records;}finally{favCfg=current;}
}

function favBindingAvailable0120(bindingKey) {
    if(favAvailabilityMode0110()==='disabled'||favBindingActive0120(bindingKey))return true;
    const records=favRecordsForBinding0120(bindingKey);
    if(bindingKey==='strict-title'||bindingKey==='multi-search')return true;
    if(bindingKey.startsWith('category:')){
        /* Unknown category metadata is not evidence that every category is
         * available. Only positively matching records keep a category in the
         * live rail; the editor still retains every configured category. */
        return records.some((record)=>favCategoryMatch(record.deepMetadata?.category,bindingKey.slice(9)));
    }
    if(bindingKey==='ships-anywhere'||bindingKey==='ships-country')return true;
    favState.facetCapabilityCache0121=favState.facetCapabilityCache0121||new WeakMap();
    let caps=favState.facetCapabilityCache0121.get(records);if(!caps){caps=favCatalogueCapabilities0101(records);favState.facetCapabilityCache0121.set(records,caps);}
    if(bindingKey.startsWith('ships-origin:'))return !caps.shipsFromCodes?.size||caps.shipsFromCodes.has(bindingKey.slice(13));
    if(bindingKey==='ships-europe')return !caps.shipsFromCodes?.size||[...caps.shipsFromCodes].some((code)=>FAV_EUROPE_COUNTRY_CODES0101.has(code));
    if(bindingKey==='ships-eu')return !caps.shipsFromCodes?.size||[...caps.shipsFromCodes].some((code)=>FAV_EU_COUNTRY_CODES0120.has(code));
    if(bindingKey==='ships-local'){const country=favCurrentCountry0120();return Boolean(country)&&(!caps.shipsFromCodes?.size||caps.shipsFromCodes.has(country));}
    const map={
        'price-range':'price','etsys-picks':'etsysPick','star-seller':'starSeller','available-only':'soldOut','on-sale':'onSale',
        'free-shipping':'freeShipping','customizable':'personalizable','has-variations':'variations','gift-wrap':'giftWrap',
        physical:'physical',digital:'digital',vintage:'vintage',shop:'shops','low-stock':'lowStock','min-carts':'carts',
        'min-rating':'rating','min-reviews':'reviews','max-shipping':'shipping',returns:'returns',exchanges:'exchanges',
    };
    const value=caps[map[bindingKey]];return value instanceof Set?value.size>0:Boolean(value)||(!favDeepVisibilityReady0110()&&['etsys-picks','gift-wrap','vintage'].includes(bindingKey));
}

function favReplaceSelectChoices0120(select,options,value) {
    const replacement=favSelect(value,options,()=>{});select.replaceChildren(...Array.from(replacement.childNodes));select.value=value;
}

function favRefreshFacetAvailability0120() {
    if(!favState.rail?.isConnected)return;favState.facetAvailabilityCache0120=new Map();favState.facetCapabilityCache0121=new WeakMap();
    for(const root of favState.rail.querySelectorAll('[data-ebsf-option-instance]')){
        const found=favFindOption0120(root.dataset.ebsfOptionInstance);if(!found)continue;
        root.hidden=found.option.hidden||!favBindingAvailable0120(found.option.bindingKey);
    }
    for(const root of favState.rail.querySelectorAll('[data-ebsf-binding="shop"]')){
        const select=root.querySelector('select');if(!select)continue;const selected=String(favCfg.filters.shop||'');
        const shops=[...new Set(favRecordsForBinding0120('shop').map((record)=>record.shopName).filter(Boolean))];if(selected&&!shops.includes(selected))shops.push(selected);shops.sort((a,b)=>a.localeCompare(b));
        favReplaceSelectChoices0120(select,[{value:'',label:'Any shop'},...shops.map((shop)=>({value:shop,label:shop}))],selected);
    }
    for(const root of favState.rail.querySelectorAll('[data-ebsf-binding="ships-country"]')){
        const select=root.querySelector('select');if(!select)continue;const selected=String(favCfg.filters.shipsFromCountry||favCurrentCountry0120()||'').toUpperCase();let options=favCountryOptions(false);
        if(favAvailabilityMode0110()!=='disabled'){const mode=favAvailabilityMode0110();const allowed=favCatalogueCapabilities0101(favRecordsForBinding0120('ships-country')).shipsFromCodes||new Set();if(mode==='filtered'||allowed.size)options=favFilterCountryOptions0101(options,allowed,selected);}
        favReplaceSelectChoices0120(select,options,selected);
    }
}

function favScheduleFacetAvailability0121() {
    if(favState.facetAvailabilityIdle0121){
        if(typeof cancelIdleCallback==='function')cancelIdleCallback(favState.facetAvailabilityIdle0121);else clearTimeout(favState.facetAvailabilityIdle0121);
    }
    const run=()=>{favState.facetAvailabilityIdle0121=0;favRefreshFacetAvailability0120();};
    favState.facetAvailabilityIdle0121=typeof requestIdleCallback==='function'?requestIdleCallback(run,{timeout:250}):setTimeout(run,50);
}

function favBuildDrawer0120(drawer) {
    const body=document.createElement('div');body.className='ebsf-native-group ebsf-v2-drawer-body';
    if(drawer.optionInstances.some((option)=>favBindingActive0120(option.bindingKey)))favState.openSections.add(drawer.instanceId);
    if(drawer.definitionKey==='category'){
        const all=document.createElement('button');all.type='button';all.className='ebsf-native-link';all.dataset.ebsfAllCategories='';all.textContent='All categories';all.classList.toggle('is-selected',!favCfg.filters.category);all.setAttribute('aria-pressed',String(!favCfg.filters.category));all.addEventListener('click',()=>{favCfg.filters.category='';favSyncBindingControls0120('category:');favCommitBinding0120('category:');});body.append(all);
    }
    for(const instance of drawer.optionInstances){
        if(instance.hidden)continue;
        const option=favBuildOption0120(instance);if(option){option.hidden=!favBindingAvailable0120(instance.bindingKey);body.append(option);}
    }
    const section=favNativeSection(drawer.label,body,drawer.instanceId);section.dataset.ebsfDrawerInstance=drawer.instanceId;section.dataset.ebsfDrawerDefinition=drawer.definitionKey;return section;
}

function favBuildShopsLink0120() {
    const source=favState.nativeSource0120||document;
    const native=source.querySelector?.('nav[aria-label="Shops"] a[href*="tab=shops"]')||document.querySelector('a[href*="tab=shops"]');
    const link=document.createElement('a');link.className='ebsf-shops-link sidebar__link wt-text-body-small';link.href=native?.getAttribute('href')||`/people/${encodeURIComponent(favProfileLogin())}?tab=shops&ref=phase3_fl`;
    link.innerHTML=`${native?.querySelector('.etsy-icon')?.outerHTML||''}<span>Shops</span>`;return link;
}

function favResetFilters0120() {
    const keep={multiRules:favCfg.multiRules,autoSync:favCfg.autoSync,autoScanMissingMetadata:favCfg.autoScanMissingMetadata,sort:favCfg.sort,sortReversed:favCfg.sortReversed};
    favCfg=favDefaultConfig();Object.assign(favCfg,keep);favState.strictSettingsOpen=false;favState.manualOpenSections.clear();favSaveConfig();favState.localPage=1;favRefreshRail();return favReapply();
}

favBuildFilterRail = function favBuildFilterRail0120() {
    favCloseInfo();
    favState.facetAvailabilityCache0120=new Map();favState.facetCapabilityCache0121=new WeakMap();
    const rail=document.createElement('div');rail.className='ebsf-rail ebsf-rail-v2';rail.dataset.ebsfRail='';
    const header=document.createElement('div');header.className='ebsf-rail-header ebsf-native-rail-header';
    const heading=document.createElement('h2');heading.className='ebsf-filter-heading ebsf-native-filter-heading';heading.textContent='Filters';
    const reset=document.createElement('button');reset.type='button';reset.className='ebsf-native-reset';reset.textContent='Reset';reset.addEventListener('click',()=>void favResetFilters0120());
    header.append(heading,reset);rail.append(header);
    for(const drawer of favFilterLayout0120())if(!drawer.hidden)rail.append(favBuildDrawer0120(drawer));
    rail.append(favBuildShopsLink0120());return rail;
};

/* Local filter changes use the already hydrated catalogue immediately. */
favSaveAndApply = function favSaveAndApply0120(reapply = true) {
    favSaveConfig();favState.localPage=1;favState.facetAvailabilityCache0120=new Map();
    if(!reapply)return Promise.resolve();
    if(favState.loadComplete&&favState.loadKey===favDatasetKey()&&(!favNeedsExtraInfo()||favState.extraReady)){
        const done=favScheduleLocalRender0121();done.finally(favScheduleFacetAvailability0121);return done;
    }
    const result=favReapply();Promise.resolve(result).finally(favScheduleFacetAvailability0121);return result;
};

/* ---------- Layout editor and context actions ---------- */

function favAfterLayoutMutation0120({render=true}={}) {
    favSaveFilterLayout0120();
    if(favState.layoutModal?.isConnected)favState.layoutDirty0120=true;
    else if(favState.filterOpen)favRefreshRail();
    if(render)favRenderLayoutEditor0120();
}

function favLayoutTarget0120(type,idValue) {
    return type==='drawer'?favFindDrawer0120(idValue):favFindOption0120(idValue)?.option||null;
}

function favSetLayoutHidden0120(type,idValue,hidden) {
    const target=favLayoutTarget0120(type,idValue);if(!target)return;
    target.hidden=hidden;
    if(hidden&&type==='option'&&favVisibleBindingCount0120(target.bindingKey,target.instanceId)===0)favClearBinding0120(target.bindingKey);
    if(hidden&&type==='drawer')for(const option of target.optionInstances)if(favVisibleBindingCount0120(option.bindingKey,option.instanceId)===0)favClearBinding0120(option.bindingKey);
    favSaveConfig();favAfterLayoutMutation0120();void favReapply();
}

function favConfirmLayoutAction0120({title,message,confirmLabel='Confirm',onConfirm}) {
    const layer=document.createElement('div');layer.className='ebs-modal-layer ebsf-confirm-layer';layer.innerHTML=`<section class="ebs-modal ebsf-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="ebsf-confirm-title" aria-describedby="ebsf-confirm-copy"><header class="ebs-modal-header"><h2 class="ebs-modal-title" id="ebsf-confirm-title"></h2></header><div class="ebsf-confirm-body"><p id="ebsf-confirm-copy"></p></div><footer class="ebs-modal-footer"><button type="button" class="ebs-button is-quiet" data-cancel>Cancel</button><button type="button" class="ebs-button is-primary" data-confirm></button></footer></section>`;
    layer.querySelector('h2').textContent=title;layer.querySelector('p').textContent=message;layer.querySelector('[data-confirm]').textContent=confirmLabel;
    const close=()=>layer.remove();layer.querySelector('[data-cancel]').addEventListener('click',close);layer.querySelector('[data-confirm]').addEventListener('click',()=>{close();onConfirm?.();});layer.addEventListener('pointerdown',(event)=>{if(event.target===layer)close();});layer.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();close();}});document.body.append(layer);requestAnimationFrame(()=>layer.querySelector('[data-cancel]')?.focus({preventScroll:true}));
}

function favDeleteLayoutInstance0120(type,idValue) {
    if(type==='drawer'){
        const drawer=favFindDrawer0120(idValue);if(!drawer)return;
        drawer.hidden=true;for(const bindingKey of new Set(drawer.optionInstances.map((option)=>option.bindingKey)))if(favVisibleBindingCount0120(bindingKey)===0)favClearBinding0120(bindingKey);
        favUiPrefs.filterLayout=favFilterLayout0120().filter((entry)=>entry.instanceId!==idValue);
    }else{
        const found=favFindOption0120(idValue);if(!found)return;
        if(favVisibleBindingCount0120(found.option.bindingKey,found.option.instanceId)===0)favClearBinding0120(found.option.bindingKey);
        found.drawer.optionInstances=found.drawer.optionInstances.filter((entry)=>entry.instanceId!==idValue);
    }
    favSaveConfig();favAfterLayoutMutation0120();void favReapply();
}

function favRequestDeleteLayoutInstance0120(type,idValue) {
    const target=favLayoutTarget0120(type,idValue);if(!target)return;
    favConfirmLayoutAction0120({title:`Delete ${type}?`,message:`Delete “${target.label}” from the filter layout? You can restore it with Reset options or Reset drawers.`,confirmLabel:'Delete',onConfirm:()=>favDeleteLayoutInstance0120(type,idValue)});
}

function favDuplicateLayoutInstance0120(type,idValue) {
    if(type==='drawer'){
        const index=favFilterLayout0120().findIndex((entry)=>entry.instanceId===idValue);if(index<0)return;const source=favFilterLayout0120()[index];
        const copy={...source,instanceId:favLayoutId0120('drawer'),optionInstances:source.optionInstances.map((option)=>({...option,instanceId:favLayoutId0120('option')}))};
        favFilterLayout0120().splice(index+1,0,copy);
    }else{
        const found=favFindOption0120(idValue);if(!found)return;const index=found.drawer.optionInstances.indexOf(found.option);
        found.drawer.optionInstances.splice(index+1,0,{...found.option,instanceId:favLayoutId0120('option')});
    }
    favAfterLayoutMutation0120();
}

function favRenameLayoutInstance0120(type,idValue) {
    const target=type==='drawer'?favFindDrawer0120(idValue):favFindOption0120(idValue)?.option;if(!target)return;
    const returnFocus=document.querySelector(`[data-ebsf-editor-id="${idValue}"], [data-ebsf-${type}-instance="${idValue}"]`);
    const layer=document.createElement('div');layer.className='ebs-modal-layer ebsf-rename-layer';layer.innerHTML=`<section class="ebs-modal ebsf-rename-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-rename-title"><header class="ebs-modal-header"><h2 class="ebs-modal-title" id="ebsf-rename-title">Rename ${type}</h2></header><div class="ebsf-rename-body"><label>Name<input class="wt-input" maxlength="80"></label><p class="ebsf-settings-error" hidden>Name cannot be blank.</p></div><footer class="ebs-modal-footer"><button type="button" class="ebs-button is-quiet" data-cancel>Cancel</button><button type="button" class="ebs-button is-primary" data-save>Save</button></footer></section>`;
    const input=layer.querySelector('input');input.value=target.label;const close=()=>{layer.remove();returnFocus?.focus?.({preventScroll:true});};const save=()=>{const value=input.value.trim();if(!value){layer.querySelector('p').hidden=false;input.focus();return;}target.label=value;close();favAfterLayoutMutation0120();};layer.querySelector('[data-cancel]').addEventListener('click',close);layer.querySelector('[data-save]').addEventListener('click',save);layer.addEventListener('pointerdown',(event)=>{if(event.target===layer)close();});layer.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Enter'&&event.target===input){event.preventDefault();save();}});document.body.append(layer);requestAnimationFrame(()=>{input.focus();input.select();});
}

function favOpenLayoutContext0120(event,type,idValue,inEditor=false) {
    favCloseLayoutContext0110();const menu=document.createElement('div');menu.className='ebsf-layout-context ebsf-layout-context-v2';menu.setAttribute('role','menu');
    const target=type==='sort'?null:favLayoutTarget0120(type,idValue);const actions=[];
    if(!inEditor&&type!=='sort')actions.push(['editor','Open editor']);
    actions.push(['hide',type==='sort'?'Hide':(target?.hidden?'Show':'Hide')]);
    if(type!=='sort')actions.push(['rename','Rename'],['duplicate','Duplicate'],['delete','Delete']);
    for(const [action,label] of actions){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','menuitem');if(action==='delete')button.classList.add('is-danger');button.addEventListener('click',()=>{favCloseLayoutContext0110();if(action==='editor')favOpenLayoutEditor0110('filters');else if(action==='hide'){if(type==='sort'){favSetSortHidden0110(idValue,true);favRenderLayoutEditor0120('sort');}else favSetLayoutHidden0120(type,idValue,!target.hidden);}else if(action==='rename')favRenameLayoutInstance0120(type,idValue);else if(action==='duplicate')favDuplicateLayoutInstance0120(type,idValue);else favRequestDeleteLayoutInstance0120(type,idValue);});menu.append(button);}
    document.body.append(menu);favState.layoutContextMenu=menu;menu.style.left=`${Math.min(innerWidth-205,Math.max(8,event.clientX))}px`;menu.style.top=`${Math.min(innerHeight-Math.max(110,actions.length*38+20),Math.max(8,event.clientY))}px`;
}

function favLayoutEditorRow0120(type,item,drawerId='') {
    const row=document.createElement('div');row.className=`ebsf-layout-row${type==='option'?' is-child':''}`;row.draggable=true;row.dataset.ebsfEditorType=type;row.dataset.ebsfEditorId=item.instanceId;if(drawerId)row.dataset.ebsfEditorDrawer=drawerId;
    const check=document.createElement('input');check.type='checkbox';check.className='ebsf-layout-check';check.checked=!item.hidden;check.setAttribute('aria-label',`${item.hidden?'Show':'Hide'} ${item.label}`);check.addEventListener('change',()=>{if(type==='sort')favSetSortHidden0110(item.instanceId,!check.checked);else favSetLayoutHidden0120(type,item.instanceId,!check.checked);favRenderLayoutEditor0120(type==='sort'?'sort':'filters');});
    const drag=document.createElement('span');drag.className='ebsf-layout-drag';drag.textContent='⋮⋮';drag.setAttribute('aria-hidden','true');
    const label=document.createElement(type==='drawer'?'button':'span');if(type==='drawer')label.type='button';label.className='ebsf-layout-label';label.textContent=item.label;
    if(type==='drawer'){const expanded=favState.layoutExpandedDrawers0120?.has(item.instanceId);label.setAttribute('aria-expanded',String(Boolean(expanded)));const disclosure=document.createElement('span');disclosure.className='ebsf-layout-disclosure';disclosure.innerHTML=favChevronMarkup();label.append(disclosure);}
    const more=document.createElement('button');more.type='button';more.className='ebsf-layout-more';more.textContent='•••';more.setAttribute('aria-label',`Edit ${item.label}`);more.addEventListener('click',(event)=>favOpenLayoutContext0120(event,type,item.instanceId,true));
    row.append(check,drag,label,more);return row;
}

function favRenderLayoutEditor0120(tab=favState.layoutModal?.dataset.activeTab||'filters') {
    const layer=favState.layoutModal;if(!layer?.classList.contains('ebsf-layout-v2-layer'))return;layer.dataset.activeTab=tab;
    layer.querySelectorAll('[data-layout-tab]').forEach((button)=>{const active=button.dataset.layoutTab===tab;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));});
    layer.querySelector('[data-filter-actions]').hidden=tab!=='filters';layer.querySelector('[data-sort-actions]').hidden=tab!=='sort';const body=layer.querySelector('[data-ebsf-layout-list]');body.replaceChildren();
    if(tab==='sort'){
        const hidden=new Set(favUiPrefs.sortMenuHidden||[]);const byKey=new Map(FAV_SORT_DEFINITIONS.map((definition)=>[definition.key,definition]));
        for(const key of favUiPrefs.sortMenuOrder||[]){const definition=byKey.get(key);if(definition)body.append(favLayoutEditorRow0120('sort',{instanceId:key,label:definition.normal,hidden:hidden.has(key)}));}
        return;
    }
    for(const drawer of favFilterLayout0120()){
        const expanded=favState.layoutExpandedDrawers0120.has(drawer.instanceId);const group=document.createElement('div');group.className='ebsf-layout-group';group.dataset.ebsfEditorGroup=drawer.instanceId;group.append(favLayoutEditorRow0120('drawer',drawer));
        const children=document.createElement('div');children.className='ebsf-layout-children';children.hidden=!expanded;for(const option of drawer.optionInstances)children.append(favLayoutEditorRow0120('option',option,drawer.instanceId));
        if(drawer.definitionKey==='ships-from'){const add=document.createElement('button');add.type='button';add.className='ebsf-layout-add-country';add.textContent='+ Add country toggle';add.addEventListener('click',()=>favOpenCountryOptionDialog0120(drawer.instanceId));children.append(add);}
        group.append(children);body.append(group);
    }
}

function favResetDrawers0120() {
    const defaults=favDefaultFilterLayout0120();const currentOptions=favFilterLayout0120().flatMap((drawer)=>drawer.optionInstances);
    const targetByBinding=new Map();for(const drawer of defaults){for(const option of drawer.optionInstances)targetByBinding.set(option.bindingKey,drawer);drawer.optionInstances=[];}
    const shipsDrawer=defaults.find((drawer)=>drawer.definitionKey==='ships-from');for(const option of currentOptions){const target=targetByBinding.get(option.bindingKey)||(option.bindingKey.startsWith('ships-origin:')?shipsDrawer:null);if(target)target.optionInstances.push(option);}
    favUiPrefs.filterLayout=defaults;favAfterLayoutMutation0120();
}

function favResetOptions0120() {
    const defaults=favDefaultFilterLayout0120();const canonical=new Set(defaults.flatMap((drawer)=>drawer.optionInstances.map((option)=>option.bindingKey)));for(const option of favFilterLayout0120().flatMap((drawer)=>drawer.optionInstances))if(!canonical.has(option.bindingKey)&&favBindingActive0120(option.bindingKey))favClearBinding0120(option.bindingKey);favSaveConfig();const layout=favFilterLayout0120();
    for(const drawer of layout)drawer.optionInstances=[];
    for(const source of defaults){let target=layout.find((drawer)=>drawer.definitionKey===source.definitionKey);if(!target){target={...source,instanceId:favLayoutId0120('drawer'),optionInstances:[]};layout.push(target);}target.optionInstances=source.optionInstances;}
    favAfterLayoutMutation0120();
}

function favOpenCountryOptionDialog0120(drawerId) {
    const drawer=favFindDrawer0120(drawerId);if(!drawer)return;const layer=document.createElement('div');layer.className='ebs-modal-layer ebsf-country-option-layer';layer.innerHTML=`<section class="ebs-modal ebsf-country-option-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-country-option-title"><header class="ebs-modal-header"><h2 class="ebs-modal-title" id="ebsf-country-option-title">Add country toggle</h2></header><div class="ebsf-country-option-body"><label>Country</label></div><footer class="ebs-modal-footer"><button type="button" class="ebs-button is-quiet" data-cancel>Cancel</button><button type="button" class="ebs-button is-primary" data-add>Add</button></footer></section>`;
    const options=favCountryOptions(false);const first=options.flatMap((option)=>option.group?(option.options||[]):[option])[0]?.value||'';const select=favSelect(first,options);layer.querySelector('.ebsf-country-option-body').append(select);
    const close=()=>layer.remove();const add=()=>{const code=String(select.value||'').toUpperCase();if(!FAV_COUNTRY_CODES_.includes(code))return;drawer.optionInstances.push(favLayoutOption0120(`ships-origin:${code}`,favCountryName(code)||code));favState.layoutExpandedDrawers0120.add(drawerId);close();favAfterLayoutMutation0120();};layer.querySelector('[data-cancel]').addEventListener('click',close);layer.querySelector('[data-add]').addEventListener('click',add);layer.addEventListener('pointerdown',(event)=>{if(event.target===layer)close();});layer.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Enter'){event.preventDefault();add();}});document.body.append(layer);requestAnimationFrame(()=>select.focus({preventScroll:true}));
}

function favResetSortMenu0120() {
    favUiPrefs.sortMenuOrder=FAV_SORT_DEFINITIONS.map((definition)=>definition.key);favUiPrefs.sortMenuHidden=[];favSaveUiPrefs();favEnsureVisibleActiveSort0110();favRebuildSortControl0110();favRenderLayoutEditor0120('sort');
}

favOpenLayoutEditor0110=function favOpenLayoutEditor0120(tab='filters'){
    if(favState.layoutModal){favRenderLayoutEditor0120(tab);return;}
    const layer=document.createElement('div');layer.className='ebs-modal-layer ebsf-layout-layer ebsf-layout-v2-layer';layer.innerHTML=`<section class="ebs-modal ebsf-layout-modal" role="dialog" aria-modal="true" aria-labelledby="ebsf-layout-title"><header class="ebs-modal-header"><div><div class="ebsf-settings-kicker">BETTERSEARCH</div><h2 class="ebs-modal-title" id="ebsf-layout-title">CUSTOMIZE FAVORITES CONTROLS</h2></div><button type="button" class="ebsf-modal-close" data-close aria-label="Close">×</button></header><div class="ebsf-settings-tabs" role="tablist" aria-label="Favorites control editor pages"><button type="button" class="ebsf-settings-tab" data-layout-tab="filters" role="tab">Filter sidebar</button><button type="button" class="ebsf-settings-tab" data-layout-tab="sort" role="tab">Sort menu</button></div><div class="ebsf-layout-body" data-ebsf-layout-list></div><div class="ebsf-layout-actions" data-filter-actions><button type="button" class="ebs-button is-quiet" data-reset-drawers>Reset drawers</button><button type="button" class="ebs-button is-quiet" data-reset-options>Reset options</button></div><div class="ebsf-layout-actions" data-sort-actions hidden><button type="button" class="ebs-button is-quiet" data-reset-sort>Reset sort menu</button></div><footer class="ebs-modal-footer"><button type="button" class="ebs-button is-primary" data-done>Done</button></footer></section>`;
    document.body.append(layer);favState.layoutModal=layer;favState.layoutExpandedDrawers0120=new Set();favState.layoutDirty0120=false;lockPageScroll();
    const clearDropIndicators=()=>layer.querySelectorAll('.is-drop-before,.is-drop-after,.is-drop-inside').forEach((node)=>node.classList.remove('is-drop-before','is-drop-after','is-drop-inside'));
    const scrollBody=layer.querySelector('[data-ebsf-layout-list]');let autoScrollDirection=0,autoScrollFrame=0;
    const runAutoScroll=()=>{if(!autoScrollDirection){autoScrollFrame=0;return;}scrollBody.scrollTop+=autoScrollDirection*14;autoScrollFrame=requestAnimationFrame(runAutoScroll);};
    const updateAutoScroll=(clientY)=>{const rect=scrollBody.getBoundingClientRect();const edge=Math.min(70,Math.max(36,rect.height*.14));autoScrollDirection=clientY<rect.top+edge?-1:(clientY>rect.bottom-edge?1:0);if(autoScrollDirection&&!autoScrollFrame)autoScrollFrame=requestAnimationFrame(runAutoScroll);if(!autoScrollDirection&&autoScrollFrame){cancelAnimationFrame(autoScrollFrame);autoScrollFrame=0;}};
    const cleanupDrag=()=>{autoScrollDirection=0;if(autoScrollFrame)cancelAnimationFrame(autoScrollFrame);autoScrollFrame=0;clearDropIndicators();layer.querySelectorAll('.is-dragging').forEach((node)=>node.classList.remove('is-dragging'));favState.layoutGhost0120?.remove();favState.layoutGhost0120=null;};
    const close=()=>{cleanupDrag();layer.remove();favState.layoutModal=null;favState.layoutDrag=null;unlockPageScroll();if(favState.layoutDirty0120&&favState.filterOpen)favRefreshRail();favState.layoutDirty0120=false;};
    layer.querySelectorAll('[data-close],[data-done]').forEach((button)=>button.addEventListener('click',close));layer.querySelectorAll('[data-layout-tab]').forEach((button)=>button.addEventListener('click',()=>favRenderLayoutEditor0120(button.dataset.layoutTab)));
    layer.querySelector('[data-reset-drawers]').addEventListener('click',()=>favConfirmLayoutAction0120({title:'Reset drawers?',message:'Restore the default drawer names, order, visibility, and placement? Custom and duplicate drawers will be removed.',confirmLabel:'Reset drawers',onConfirm:favResetDrawers0120}));
    layer.querySelector('[data-reset-options]').addEventListener('click',()=>favConfirmLayoutAction0120({title:'Reset options?',message:'Restore one canonical copy of every filter option with its default name, drawer, order, and visibility?',confirmLabel:'Reset options',onConfirm:favResetOptions0120}));
    layer.querySelector('[data-reset-sort]').addEventListener('click',()=>favConfirmLayoutAction0120({title:'Reset sort menu?',message:'Restore the default sort menu order and make every sort option visible?',confirmLabel:'Reset sort menu',onConfirm:favResetSortMenu0120}));
    layer.addEventListener('pointerdown',(event)=>{if(event.target===layer)close();});layer.addEventListener('keydown',(event)=>favTrapModalFocus(event,layer));
    layer.addEventListener('click',(event)=>{const row=event.target.closest('[data-ebsf-editor-id]');if(!row||row.dataset.ebsfEditorType!=='drawer'||!event.target.closest('.ebsf-layout-label'))return;const idValue=row.dataset.ebsfEditorId;if(favState.layoutExpandedDrawers0120.has(idValue))favState.layoutExpandedDrawers0120.delete(idValue);else favState.layoutExpandedDrawers0120.add(idValue);favRenderLayoutEditor0120('filters');});
    layer.addEventListener('contextmenu',(event)=>{const row=event.target.closest('[data-ebsf-editor-id]');if(!row)return;event.preventDefault();event.stopPropagation();favOpenLayoutContext0120(event,row.dataset.ebsfEditorType,row.dataset.ebsfEditorId,true);});
    layer.addEventListener('dragstart',(event)=>{const row=event.target.closest('[data-ebsf-editor-id]');if(!row)return;favState.layoutDrag={type:row.dataset.ebsfEditorType,id:row.dataset.ebsfEditorId,drawer:row.dataset.ebsfEditorDrawer||''};event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain',row.dataset.ebsfEditorId);}catch(_){}row.classList.add('is-dragging');const ghost=row.cloneNode(true);ghost.classList.add('ebsf-layout-ghost');document.body.append(ghost);favState.layoutGhost0120=ghost;try{event.dataTransfer.setDragImage(ghost,28,20);}catch(_){}});
    layer.addEventListener('dragover',(event)=>{const drag=favState.layoutDrag;if(!drag)return;updateAutoScroll(event.clientY);const row=event.target.closest('[data-ebsf-editor-id]');const group=event.target.closest('[data-ebsf-editor-group]');if(!row&&!group){event.preventDefault();return;}if(drag.type==='drawer'&&row?.dataset.ebsfEditorType!=='drawer')return;if(drag.type==='sort'&&row?.dataset.ebsfEditorType!=='sort')return;event.preventDefault();clearDropIndicators();const rect=row?.getBoundingClientRect();if(drag.type==='option'&&(!row||row.dataset.ebsfEditorType==='drawer'))(group||row?.closest('[data-ebsf-editor-group]'))?.classList.add('is-drop-inside');else if(row&&rect)row.classList.add(event.clientY<rect.top+rect.height/2?'is-drop-before':'is-drop-after');});
    layer.addEventListener('dragend',()=>{cleanupDrag();favState.layoutDrag=null;});
    layer.addEventListener('drop',(event)=>{event.preventDefault();const drag=favState.layoutDrag;if(!drag)return;const row=event.target.closest('[data-ebsf-editor-id]');const group=event.target.closest('[data-ebsf-editor-group]');const after=row?.classList.contains('is-drop-after');
        if(drag.type==='sort'&&row?.dataset.ebsfEditorType==='sort'){const before=row.dataset.ebsfEditorId;let list=(favUiPrefs.sortMenuOrder||[]).filter((key)=>key!==drag.id);let index=list.indexOf(before);if(index<0)index=list.length;else if(after)index++;list.splice(index,0,drag.id);favUiPrefs.sortMenuOrder=list;favSaveUiPrefs();favRebuildSortControl0110();favRenderLayoutEditor0120('sort');}
        else if(drag.type==='drawer'&&row?.dataset.ebsfEditorType==='drawer'){const list=favFilterLayout0120();const from=list.findIndex((entry)=>entry.instanceId===drag.id);const targetId=row.dataset.ebsfEditorId;if(from>=0&&targetId!==drag.id){const [moved]=list.splice(from,1);let index=list.findIndex((entry)=>entry.instanceId===targetId);if(index<0)index=list.length;else if(after)index++;list.splice(index,0,moved);favAfterLayoutMutation0120();}}
        else if(drag.type==='option'){const found=favFindOption0120(drag.id);const targetDrawer=favFindDrawer0120(row?.dataset.ebsfEditorDrawer||group?.dataset.ebsfEditorGroup||row?.dataset.ebsfEditorId);if(found&&targetDrawer){found.drawer.optionInstances=found.drawer.optionInstances.filter((entry)=>entry.instanceId!==drag.id);let index=row?.dataset.ebsfEditorType==='option'?targetDrawer.optionInstances.findIndex((entry)=>entry.instanceId===row.dataset.ebsfEditorId):-1;if(index<0)index=targetDrawer.optionInstances.length;else if(after)index++;targetDrawer.optionInstances.splice(index,0,found.option);favState.layoutExpandedDrawers0120.add(targetDrawer.instanceId);favAfterLayoutMutation0120();}}
        cleanupDrag();favState.layoutDrag=null;
    });
    favRenderLayoutEditor0120(tab);
};

/* ---------- Generated Etsy group routing preference ---------- */

function favAllItemsUrl0122() {
    return `https://www.etsy.com/people/${encodeURIComponent(favProfileLogin())}?ref=hdr-fav&tab=items`;
}

function favIsGeneratedGroupUrl0122(value=location.href) {
    try{const url=new URL(value,location.origin);return /\/people\/[^/]+\/?$/i.test(url.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i,''))&&Boolean(url.searchParams.get('collectionId'));}catch(_){return false;}
}

function favMaybeRedirectGeneratedGroup0122() {
    if(favUiPrefs.redirectGeneratedGroups===false||!favIsGeneratedGroupUrl0122())return false;
    location.replace(favAllItemsUrl0122());return true;
}

document.addEventListener('click',(event)=>{
    if(favUiPrefs.redirectGeneratedGroups===false)return;const link=event.target.closest?.('a[href]');if(!link||!favIsGeneratedGroupUrl0122(link.href))return;
    event.preventDefault();event.stopImmediatePropagation();location.assign(favAllItemsUrl0122());
},true);
queueMicrotask(()=>favMaybeRedirectGeneratedGroup0122());
window.addEventListener('popstate',()=>queueMicrotask(()=>favMaybeRedirectGeneratedGroup0122()));

var favOpenSettingsModalBefore0122=favOpenSettingsModal;
favOpenSettingsModal=function favOpenSettingsModal0122(event){
    favOpenSettingsModalBefore0122(event);const card=favState.settingsModal?.querySelector('[data-ebsf-settings-panel="preferences"] .ebsf-settings-card');if(!card||card.querySelector('[data-ebsf-redirect-generated-groups]'))return;
    const row=document.createElement('label');row.className='ebsf-settings-toggle ebsf-settings-rowline';row.innerHTML=`<span><strong>Redirect Etsy-generated groups to All</strong><small>Open old automatic category URLs, such as collectionId links, in the normal All Favorites page instead.</small></span><input type="checkbox" data-ebsf-redirect-generated-groups ${favUiPrefs.redirectGeneratedGroups!==false?'checked':''}>`;
    card.append(row);row.querySelector('input').addEventListener('change',(changeEvent)=>{favUiPrefs.redirectGeneratedGroups=changeEvent.target.checked;favSaveUiPrefs();if(changeEvent.target.checked)favMaybeRedirectGeneratedGroup0122();});
};

document.addEventListener('contextmenu',(event)=>{
    const option=event.target.closest?.('[data-ebsf-option-instance]');const drawer=event.target.closest?.('[data-ebsf-drawer-instance]');if(!option&&!drawer)return;
    event.preventDefault();event.stopImmediatePropagation();favOpenLayoutContext0120(event,option?'option':'drawer',option?.dataset.ebsfOptionInstance||drawer.dataset.ebsfDrawerInstance,false);
},true);

document.addEventListener('change',(event)=>{if(event.target?.matches?.('[data-ebsf-filter-availability-mode]'))favScheduleFacetAvailability0121();});
