'use strict';

/* Favorites filter rail.
 *
 * The Favorites rail intentionally uses Etsy's filter-rail structure/classes
 * where practical, with local fallbacks for pages that do not load marketplace
 * filter CSS. Controls backed by cheap Favorites metadata remain live. Future
 * deep-metadata controls preserve their saved values but are visibly unavailable.
 */
favState.categoryExpanded = favState.categoryExpanded === true;
favState.infoPopover = null;
favState.infoAnchor = null;

function favSaveAndApply(reapply = true) {
    favSaveConfig();
    favState.localPage = 1;
    return reapply ? favReapply() : Promise.resolve();
}
function favReplaceSectionBody(key, builder) {
    const section = favState.rail?.querySelector?.(`[data-ebsf-section="${key}"]`);
    const body = section?.querySelector?.('.ebsf-section-body');
    if (!body) return;
    body.replaceChildren(builder());
}

function favAnimateSection(content, opening) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || typeof content.animate !== 'function') {
        content.hidden = !opening;
        return;
    }
    content.getAnimations().forEach((animation) => animation.cancel());
    if (opening) content.hidden = false;
    const height = content.scrollHeight;
    content.style.setProperty('overflow', 'hidden', 'important');
    const animation = content.animate(
        opening
            ? [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }]
            : [{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 150, easing: 'ease-out' }
    );
    animation.onfinish = () => { content.hidden = !opening; content.style.height = ''; content.style.opacity = ''; content.style.removeProperty('overflow'); };
}

var favSectionCounter = 0;
function favNativeSection(title, body, key) {
    favInitializeOpenSections();
    const sectionKey = key || normalize(title).replace(/\s+/g, '-');
    const open = favState.openSections.has(sectionKey);
    const root = document.createElement('div');
    root.className = 'ebsf-section';
    root.dataset.ebsfSection = sectionKey;

    const id = `ebsf-filter-section-${++favSectionCounter}`;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ebsf-native-section-trigger';
    trigger.setAttribute('aria-controls', id);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.innerHTML = `<span class="wt-flex-xs-auto wt-width-full ebsf-native-section-title"></span>${favChevronMarkup()}`;
    trigger.querySelector('.ebsf-native-section-title').textContent = title;

    const content = document.createElement('div');
    content.id = id;
    content.className = 'wt-content-toggle__body ebsf-section-body';
    content.hidden = !open;
    content.setAttribute('aria-hidden', String(!open));
    content.append(body);

    trigger.addEventListener('click', () => {
        const next = trigger.getAttribute('aria-expanded') !== 'true';
        trigger.setAttribute('aria-expanded', String(next));
        content.setAttribute('aria-hidden', String(!next));
        favAnimateSection(content, next);
        if (next) {
            favState.openSections.add(sectionKey);
            favState.manualOpenSections.add(sectionKey);
        } else {
            favState.openSections.delete(sectionKey);
            favState.manualOpenSections.delete(sectionKey);
        }
    });
    root.append(trigger, content);
    return root;
}

function favCheckbox({ checked = false, label, onChange, disabled = false, title = '' }) {
    const row = document.createElement('label');
    row.className = 'ebsf-native-choice ebsf-native-checkbox-row';
    if (title) row.title = title;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled;
    input.className = 'ebsf-native-checkbox';
    input.addEventListener('change', () => onChange?.(input.checked));
    const text = document.createElement('span');
    text.className = 'ebsf-native-choice-label';
    text.textContent = label;
    row.append(input, text);
    return { row, input, text };
}

function favRadio({ name, value, checked = false, label, onChange, title = '', disabled = false }) {
    const row = document.createElement('label');
    row.className = 'ebsf-native-choice ebsf-native-radio-row';
    if (title) row.title = title;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.disabled = disabled;
    input.className = 'ebsf-native-radio';
    input.addEventListener('change', () => { if (input.checked) onChange?.(value); });
    const text = document.createElement('span');
    text.className = 'ebsf-native-choice-label';
    text.textContent = label;
    row.append(input, text);
    return { row, input, text };
}

function favSelect(value, options, onChange, className = '', disabled = false) {
    const select = document.createElement('select');
    select.className = `wt-select wt-input wt-input--small ebsf-native-select ${className}`.trim();
    for (const option of options) {
        if (option.group) {
            const group = document.createElement('optgroup');
            group.label = option.group;
            for (const child of option.options || []) {
                const el = document.createElement('option');
                el.value = child.value;
                el.textContent = child.label;
                group.append(el);
            }
            select.append(group);
        } else {
            const el = document.createElement('option');
            el.value = option.value;
            el.textContent = option.label;
            select.append(el);
        }
    }
    select.value = value;
    select.disabled = disabled;
    select.addEventListener('change', () => onChange?.(select.value));
    return select;
}

function favDeepMetadataNote() {
    const note = document.createElement('p');
    note.className = 'ebsf-metadata-pending';
    note.textContent = 'Requires listing metadata';
    return note;
}

function favNumber(value, placeholder, onChange, prefix = '') {
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-number-wrap';
    if (prefix) {
        const p = document.createElement('span');
        p.className = 'ebsf-native-number-prefix';
        p.textContent = prefix;
        wrap.append(p);
    }
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.className = 'wt-input wt-input--small ebsf-native-number';
    input.placeholder = placeholder;
    input.value = value || '';
    input.addEventListener('change', () => onChange?.(input.value));
    wrap.append(input);
    return { wrap, input };
}

function favCurrencySymbol() {
    const currency = String(document.body?.dataset?.currency || 'EUR').toUpperCase();
    try {
        const part = new Intl.NumberFormat(document.documentElement.lang || 'en', {
            style: 'currency', currency, currencyDisplay: 'narrowSymbol',
        }).formatToParts(0).find((entry) => entry.type === 'currency');
        return part?.value || currency;
    } catch (_) {
        return currency;
    }
}

function favCloseInfo() {
    favState.infoPopover?.remove();
    if (favState.infoAnchor) favState.infoAnchor.setAttribute('aria-expanded', 'false');
    favState.infoPopover = null;
    favState.infoAnchor = null;
}

function favOpenInfo(anchor, title, text) {
    if (favState.infoAnchor === anchor && favState.infoPopover) { favCloseInfo(); return; }
    favCloseInfo();
    const pop = document.createElement('div');
    pop.className = 'ebsf-native-info-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    const h = document.createElement('strong'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = text;
    pop.append(h, p);
    document.body.append(pop);
    anchor.setAttribute('aria-expanded', 'true');
    favState.infoPopover = pop;
    favState.infoAnchor = anchor;
    const r = anchor.getBoundingClientRect();
    const width = Math.min(270, Math.max(220, innerWidth - 24));
    pop.style.width = `${width}px`;
    let left = Math.min(innerWidth - width - 12, Math.max(12, r.left - 8));
    let top = r.bottom + 7;
    const ph = pop.getBoundingClientRect().height;
    if (top + ph > innerHeight - 12) top = Math.max(12, r.top - ph - 7);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
}

document.addEventListener('click', (event) => {
    if (!favState.infoPopover) return;
    if (favState.infoPopover.contains(event.target) || favState.infoAnchor?.contains(event.target)) return;
    favCloseInfo();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') favCloseInfo(); });

function favInfoButton(title, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ebsf-native-help';
    button.textContent = '?';
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        favOpenInfo(button, title, text);
    });
    return button;
}

function favBuildSearch() {
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-search-mode-stack ebsf-native-group';

    const strict = document.createElement('span');
    strict.className = `ebs-split ebsf-search-split${favCfg.strict ? ' ebs-active' : ''}`;
    const strictMain = document.createElement('button');
    strictMain.type = 'button'; strictMain.className = 'ebs-main'; strictMain.textContent = 'Strict title';
    strictMain.setAttribute('aria-pressed', String(favCfg.strict));
    strictMain.addEventListener('click', () => {
        favSetSearchMode('strict', !favCfg.strict);
        strict.classList.toggle('ebs-active', favCfg.strict);
        strictMain.setAttribute('aria-pressed', String(favCfg.strict));
        multi.classList.remove('ebs-active');
        multiMain.setAttribute('aria-pressed', 'false');
        favSaveAndApply(true);
    });
    const strictCaret = document.createElement('button');
    strictCaret.type = 'button'; strictCaret.className = 'ebs-caret'; strictCaret.textContent = '▾';
    strictCaret.setAttribute('aria-label', 'Strict title settings');
    strictCaret.setAttribute('aria-expanded', String(favState.strictSettingsOpen));
    strictCaret.addEventListener('click', () => {
        favState.strictSettingsOpen = !favState.strictSettingsOpen;
        favReplaceSectionBody('search', favBuildSearch);
    });
    strict.append(strictMain, strictCaret);
    wrap.append(strict);

    if (favState.strictSettingsOpen) {
        const panel = document.createElement('div');
        panel.className = 'ebsf-strict-settings';
        panel.append(
            favRadio({ name:'ebsf-strict-mode-favorites', value:'phrase', checked:favCfg.strictMode === 'phrase', label:'Exact phrase', onChange:() => { favCfg.strictMode='phrase'; favSaveAndApply(true); } }).row,
            favRadio({ name:'ebsf-strict-mode-favorites', value:'all', checked:favCfg.strictMode === 'all', label:'All words', onChange:() => { favCfg.strictMode='all'; favSaveAndApply(true); } }).row,
        );
        wrap.append(panel);
    }

    const multi = document.createElement('span');
    multi.className = `ebs-split ebsf-search-split${favCfg.multi ? ' ebs-active' : ''}`;
    const multiMain = document.createElement('button');
    multiMain.type = 'button'; multiMain.className = 'ebs-main'; multiMain.textContent = 'Multi-search';
    multiMain.setAttribute('aria-pressed', String(favCfg.multi));
    multiMain.addEventListener('click', () => {
        favSetSearchMode('multi', !favCfg.multi);
        multi.classList.toggle('ebs-active', favCfg.multi);
        multiMain.setAttribute('aria-pressed', String(favCfg.multi));
        strict.classList.remove('ebs-active');
        strictMain.setAttribute('aria-pressed', 'false');
        favSaveAndApply(true);
    });
    const multiCaret = document.createElement('button');
    multiCaret.type = 'button'; multiCaret.className = 'ebs-caret'; multiCaret.textContent = '▾';
    multiCaret.setAttribute('aria-label', 'Multi-search rules'); multiCaret.setAttribute('aria-haspopup', 'dialog');
    multiCaret.addEventListener('click', favOpenMultiModal);
    multi.append(multiMain, multiCaret);
    wrap.append(multi);
    return wrap;
}

var FAV_NATIVE_CATEGORIES_ = [
    ['accessories','Accessories'], ['art-and-collectibles','Art & Collectibles'], ['bags-and-purses','Bags & Purses'],
    ['bath-and-beauty','Bath & Beauty'], ['books-movies-and-music','Books, Movies & Music'], ['clothing','Clothing'],
    ['craft-supplies-and-tools','Craft Supplies & Tools'], ['electronics-and-accessories','Electronics & Accessories'],
    ['gifts','Gifts'], ['home-and-living','Home & Living'], ['jewelry','Jewelry'], ['paper-and-party-supplies','Paper & Party Supplies'],
    ['pet-supplies','Pet Supplies'], ['shoes','Shoes'], ['toys-and-games','Toys & Games'], ['weddings','Weddings'],
];

function favBuildCategory() {
    const wrap = document.createElement('div'); wrap.className = 'ebsf-native-group ebsf-category-list';
    const all = document.createElement('button'); all.type='button'; all.className='ebsf-native-link'; all.textContent='All categories';
    all.classList.toggle('is-selected', !favCfg.filters.category);
    all.addEventListener('click', () => { favCfg.filters.category=''; favSaveAndApply(true); favReplaceSectionBody('category', favBuildCategory); });
    wrap.append(all);
    const shown = favState.categoryExpanded ? FAV_NATIVE_CATEGORIES_ : FAV_NATIVE_CATEGORIES_.slice(0,5);
    for (const [value,label] of shown) {
        const b=document.createElement('button'); b.type='button'; b.className='ebsf-native-link'; b.textContent=label;
        b.classList.toggle('is-selected', favCfg.filters.category===value);
        b.addEventListener('click', () => { favCfg.filters.category=value; favSaveAndApply(true); favReplaceSectionBody('category', favBuildCategory); });
        wrap.append(b);
    }
    const more=document.createElement('button'); more.type='button'; more.className='ebsf-native-show-more'; more.textContent=favState.categoryExpanded?'Show less':'Show more';
    more.addEventListener('click', () => { favState.categoryExpanded=!favState.categoryExpanded; favReplaceSectionBody('category', favBuildCategory); });
    wrap.append(more);
    return wrap;
}

function favBuildSpecialOffers() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    wrap.append(
        favCheckbox({checked:favCfg.filters.freeShipping,label:'Free shipping',onChange:(v)=>{favCfg.filters.freeShipping=v;favSaveAndApply(true);}}).row,
        favCheckbox({checked:favCfg.filters.onSale,label:'On sale',onChange:(v)=>{favCfg.filters.onSale=v;favSaveAndApply(true);}}).row,
    );
    return wrap;
}

function favBuildItemFormat() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const set=(value)=>{favCfg.filters.itemFormat=value;favSaveAndApply(true);};
    wrap.append(
        favRadio({name:'ebsf-item-format-favorites',value:'all',checked:favCfg.filters.itemFormat==='all',label:'All items',onChange:set}).row,
        favRadio({name:'ebsf-item-format-favorites',value:'physical',checked:favCfg.filters.itemFormat==='physical',label:'Exclude digital downloads',onChange:set}).row,
        favRadio({name:'ebsf-item-format-favorites',value:'digital',checked:favCfg.filters.itemFormat==='digital',label:'Digital downloads only',onChange:set}).row,
    );
    return wrap;
}

function favBuildEtsyBest() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const picks=favCheckbox({checked:favCfg.filters.etsysPick,label:"Etsy's Picks",onChange:(v)=>{favCfg.filters.etsysPick=v;favSaveAndApply(true);}});
    const picksRow=document.createElement('div');picksRow.className='ebsf-native-help-row';picksRow.append(picks.row,favInfoButton("About Etsy's Picks","Etsy’s Picks are hand selected by our style experts to highlight items from shops that have shown quality, reliability and style."));
    const star=favCheckbox({checked:favCfg.filters.starSeller,label:'Star Seller',onChange:(v)=>{favCfg.filters.starSeller=v;favSaveAndApply(true);}});
    const starRow=document.createElement('div');starRow.className='ebsf-native-help-row';starRow.append(star.row,favInfoButton('About Star Seller','Star Sellers have an outstanding track record for providing a great customer experience—they consistently earned 5-star reviews, shipped orders on time, and replied quickly to messages.'));
    wrap.append(picksRow,starRow);return wrap;
}

var FAV_COUNTRY_CODES_ = 'AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BE BZ BJ BM BT BO BA BW BV BR IO VG BN BG BF BI KH CM CA CV KY CF TD CL CN CX CC CO KM CG CK CR HR CW CY CZ DK DJ DM DO EC EG SV GQ ER EE ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IQ IE IM IL IT JM JP JE JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MK MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NC NZ NI NE NG NU NF MP NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RW SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS KR SS ES LK SD SR SJ SZ SE CH TW TJ TZ TH NL TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY VI UZ VU VE VN WF EH YE ZM ZW'.split(' ');
function favCountryName(code) {
    try { return new Intl.DisplayNames([document.documentElement.lang || 'en'], {type:'region'}).of(code) || code; } catch (_) { return code; }
}
function favCountryOptions(includeAny=true) {
    const common=['AU','CA','FR','DE','GR','IN','IE','IT','JP','NZ','PL','PT','ES','SE','NL','GB','US'];
    const options=[]; if(includeAny)options.push({value:'ZZ',label:'Any country'});
    options.push({group:'————————',options:common.map(code=>({value:code,label:favCountryName(code)}))});
    options.push({group:'————————',options:FAV_COUNTRY_CODES_.map(code=>({value:code,label:favCountryName(code)})).sort((a,b)=>a.label.localeCompare(b.label))});
    return options;
}

function favBuildShipsFrom() {
    const f=favCfg.filters, wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const country=String(favProps()?.countryIsoCode||'').toUpperCase();
    const localLabel=favCountryName(country);
    const set=()=>{};
    wrap.append(
        favRadio({name:'ebsf-ships-from-favorites',value:'anywhere',checked:f.shipsFrom==='anywhere',label:'Anywhere',disabled:true,onChange:set}).row,
        favRadio({name:'ebsf-ships-from-favorites',value:'europe',checked:f.shipsFrom==='europe',label:'Europe',disabled:true,onChange:set}).row,
        favRadio({name:'ebsf-ships-from-favorites',value:'local',checked:f.shipsFrom==='local',label:localLabel,disabled:true,onChange:set}).row,
        favRadio({name:'ebsf-ships-from-favorites',value:'country',checked:f.shipsFrom==='country',label:'Another country',disabled:true,onChange:set}).row,
    );
    if(f.shipsFrom==='country'){
        const select=favSelect(f.shipsFromCountry||country,favCountryOptions(false),()=>{},'',true);wrap.append(select);
    }
    wrap.append(favDeepMetadataNote());
    return wrap;
}

function favBuildReady(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(
    favCheckbox({checked:f.ready1Day,label:'1 day',disabled:true}).row,
    favCheckbox({checked:f.ready3Days,label:'1–3 days',disabled:true}).row,favDeepMetadataNote());return wrap;}

function favPriceSliderMax(){const values=favState.records.map(x=>x.price).filter(Number.isFinite);const seen=values.length?Math.max(...values):40;const base=Math.max(40,seen);const step=base<=100?10:base<=500?25:50;return Math.ceil(base/step)*step;}
function favSetPriceBound(key,value){
    const f=favCfg.filters;
    const parsed=value===''?Number.NaN:Number(value);
    f[key]=Number.isFinite(parsed)?String(Math.max(0,parsed)):'';
    const min=Number(f.minPrice),max=Number(f.maxPrice);
    if(f.minPrice&&f.maxPrice&&min>max){if(key==='minPrice')f.maxPrice=f.minPrice;else f.minPrice=f.maxPrice;}
    return favSaveAndApply(true);
}
function favBuildPrice(){
    const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group ebsf-price-group';
    const note=document.createElement('p');note.className='ebsf-native-caption';note.textContent='Before shipping and taxes and other fees';wrap.append(note);
    const max=favPriceSliderMax(),step=max<=100?5:max<=500?10:25;
    let minValue=Number(f.minPrice);if(!Number.isFinite(minValue)||minValue<0)minValue=0;
    let maxValue=Number(f.maxPrice);if(!Number.isFinite(maxValue)||maxValue<=0)maxValue=max;
    minValue=Math.min(minValue,maxValue);maxValue=Math.max(maxValue,minValue);
    const sliders=document.createElement('div');sliders.className='ebsf-price-slider';
    const low=document.createElement('input');low.type='range';low.min='0';low.max=String(max);low.step=String(step);low.value=String(Math.min(max,minValue));low.className='ebsf-price-range ebsf-price-range-low';
    const high=document.createElement('input');high.type='range';high.min='0';high.max=String(max);high.step=String(step);high.value=String(Math.min(max,maxValue));high.className='ebsf-price-range ebsf-price-range-high';
    const track=document.createElement('div');track.className='ebsf-price-track';sliders.append(track,low,high);wrap.append(sliders);
    const inputs=document.createElement('div');inputs.className='ebsf-native-price-inputs';
    const currency=favCurrencySymbol();
    let applyNumberBounds=()=>{};
    const minBox=favNumber(f.minPrice,'0',(value)=>{favSetPriceBound('minPrice',value);applyNumberBounds();},currency);
    const maxBox=favNumber(f.maxPrice,`${max} +`,(value)=>{favSetPriceBound('maxPrice',value);applyNumberBounds();},currency);inputs.append(minBox.wrap,maxBox.wrap);wrap.append(inputs);
    const sync=()=>{let a=Number(low.value),b=Number(high.value);if(a>b){if(document.activeElement===low)low.value=String(b);else high.value=String(a);a=Number(low.value);b=Number(high.value);}sliders.style.setProperty('--low',`${a/max*100}%`);sliders.style.setProperty('--high',`${b/max*100}%`);minBox.input.value=a>0?String(a):'';maxBox.input.value=b<max?String(b):'';};
    let frame=0;const applySliders=()=>{sync();f.minPrice=Number(low.value)>0?low.value:'';f.maxPrice=Number(high.value)<max?high.value:'';cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>favSaveAndApply(true));};
    low.addEventListener('input',applySliders);high.addEventListener('input',applySliders);
    applyNumberBounds=()=>{let nextMin=Number(f.minPrice);if(!Number.isFinite(nextMin)||nextMin<0)nextMin=0;let nextMax=Number(f.maxPrice);if(!Number.isFinite(nextMax)||nextMax<=0)nextMax=max;low.value=String(Math.min(max,nextMin));high.value=String(Math.min(max,nextMax));sync();};sync();
    const unknown=favState.records.filter((record)=>!Number.isFinite(record.price)).length;
    if(unknown){const warning=document.createElement('p');warning.className='ebsf-native-caption';warning.textContent=`${unknown} favorite${unknown===1?' has':'s have'} an unknown price and cannot be evaluated by this filter.`;wrap.append(warning);}
    return wrap;
}

function favBuildItemType(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(favCheckbox({checked:f.vintage,label:'Vintage',onChange:(v)=>{f.vintage=v;favSaveAndApply(true);}}).row);return wrap;}
function favBuildOrdering(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(
    favCheckbox({checked:false,label:'Accepts Etsy gift cards',disabled:true,title:'Etsy does not currently expose reliable gift-card metadata for favorite listings.'}).row,
    favCheckbox({checked:f.giftWrap,label:'Can be gift-wrapped',onChange:(v)=>{f.giftWrap=v;favSaveAndApply(true);}}).row,
    favCheckbox({checked:f.personalizable,label:'Customizable',onChange:(v)=>{f.personalizable=v;favSaveAndApply(true);}}).row);
    const note=document.createElement('p');note.className='ebsf-metadata-pending';note.textContent='Gift-card acceptance is not available from reliable Etsy metadata.';wrap.append(note);return wrap;}
function favBuildShipTo(){const wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(favUnavailableMetadataNote0101?.('Destination filtering was removed because Etsy does not expose universal delivery coverage.')||favDeepMetadataNote());return wrap;}

function favBuildExtras(){
    const f=favCfg.filters, sections=[];
    const availability=document.createElement('div');availability.className='ebsf-native-group';
    availability.append(favCheckbox({checked:f.availableOnly,label:'Available only',onChange:(v)=>{f.availableOnly=v;favSaveAndApply(true);}}).row);
    const discount=document.createElement('label');discount.className='ebsf-native-field';discount.append(document.createTextNode('Minimum discount %'),favNumber(f.minDiscount,'0',(v)=>{f.minDiscount=v;favSaveAndApply(true);}).wrap);availability.append(discount);sections.push(favNativeSection('Availability & discount',availability,'availability'));

    const rating=document.createElement('div');rating.className='ebsf-native-group';const rg=document.createElement('div');rg.className='ebsf-native-two-col';rg.append(favNumber(f.minRating,'Min rating',(v)=>{f.minRating=v;favSaveAndApply(true);}).wrap,favNumber(f.minReviews,'Min reviews',(v)=>{f.minReviews=v;favSaveAndApply(true);}).wrap);rating.append(rg);sections.push(favNativeSection('Rating & reviews',rating,'rating-and-reviews'));

    const seller=document.createElement('div');seller.className='ebsf-native-group';const shops=[...new Set(favState.records.map(x=>x.shopName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));seller.append(favSelect(f.shop,[{value:'',label:'Any shop'},...shops.map(x=>({value:x,label:x}))],(v)=>{f.shop=v;favSaveAndApply(true);}));sections.push(favNativeSection('Seller',seller,'seller'));

    const features=document.createElement('div');features.className='ebsf-native-group';features.append(
        favCheckbox({checked:f.bestSeller,label:'Best Seller',onChange:(v)=>{f.bestSeller=v;favSaveAndApply(true);}}).row,
        favCheckbox({checked:f.hasVariations,label:'Has variations',onChange:(v)=>{f.hasVariations=v;favSaveAndApply(true);}}).row);sections.push(favNativeSection('Listing features',features,'listing-features'));

    const popularity=document.createElement('div');popularity.className='ebsf-native-group';popularity.append(favCheckbox({checked:f.lowStock,label:'Etsy reports low stock',onChange:(v)=>{f.lowStock=v;favSaveAndApply(true);}}).row);const carts=document.createElement('label');carts.className='ebsf-native-field';carts.append(document.createTextNode('At least X carts (when Etsy reports it)'),favNumber(f.minCarts,'e.g. 5',(v)=>{f.minCarts=v;favSaveAndApply(true);}).wrap);popularity.append(carts);sections.push(favNativeSection('Popularity & stock',popularity,'popularity-and-stock'));

    const delivery=document.createElement('div');delivery.className='ebsf-native-group';const shipping=document.createElement('label');shipping.className='ebsf-native-field';shipping.append(document.createTextNode('Maximum shipping cost'),favNumber(f.maxShipping,'0',(v)=>{f.maxShipping=v;favSaveAndApply(true);},favCurrencySymbol()).wrap);delivery.append(shipping,favCheckbox({checked:f.returns,label:'Returns accepted',onChange:(v)=>{f.returns=v;favSaveAndApply(true);}}).row,favCheckbox({checked:f.exchanges,label:'Exchanges accepted',onChange:(v)=>{f.exchanges=v;favSaveAndApply(true);}}).row);sections.push(favNativeSection('Delivery',delivery,'delivery'));
    return sections;
}

function favBuildFilterRail() {
    favCloseInfo();
    favPrepareOpenSectionsForRail();
    const rail=document.createElement('div');rail.className='ebsf-rail';rail.dataset.ebsfRail='';
    const header=document.createElement('div');header.className='ebsf-rail-header ebsf-native-rail-header';
    const heading=document.createElement('button');heading.type='button';heading.className='ebsf-filter-heading ebsf-native-filter-heading';heading.textContent='Filters';heading.setAttribute('aria-label','Hide filters');heading.addEventListener('click',favCloseFilters);
    const reset=document.createElement('button');reset.type='button';reset.className='ebsf-native-reset';reset.textContent='Reset';
    reset.addEventListener('click',async()=>{const keepRules=favCfg.multiRules,keepAutoSync=favCfg.autoSync;favCfg=favDefaultConfig();favCfg.multiRules=keepRules;favCfg.autoSync=keepAutoSync;favState.strictSettingsOpen=false;favState.manualOpenSections.clear();favSaveConfig();favRefreshRail();await favReapply();});
    header.append(heading,reset);rail.append(header);

    rail.append(
        favNativeSection('Search',favBuildSearch(),'search'),
        favNativeSection('Category',favBuildCategory(),'category'),
        favNativeSection('Special offers',favBuildSpecialOffers(),'special-offers'),
        favNativeSection('Item format',favBuildItemFormat(),'item-format'),
        favNativeSection("Etsy's best",favBuildEtsyBest(),'etsys-best'),
        favNativeSection('Ships from',favBuildShipsFrom(),'ships-from'),
        favNativeSection('Ready to ship in',favBuildReady(),'ready-to-ship-in'),
        favNativeSection('Price',favBuildPrice(),'price'),
        favNativeSection('Item type',favBuildItemType(),'item-type'),
        favNativeSection('Ordering options',favBuildOrdering(),'ordering-options'),
        favNativeSection('Ship to',favBuildShipTo(),'ship-to'),
        ...favBuildExtras(),
    );
    return rail;
}
