'use strict';

/* v0.7.9 Favorites filter-rail parity pass.
 *
 * The Favorites rail intentionally uses Etsy's filter-rail structure/classes
 * where practical, with local fallbacks for pages that do not load marketplace
 * filter CSS. Native-like controls that need listing metadata we do not yet have
 * are persisted as UI-only state; existing supported Favorites filters remain
 * fully wired.
 */

var favDefaultConfigBaseV079 = favDefaultConfig;
favDefaultConfig = function favDefaultConfigV079() {
    const cfg = favDefaultConfigBaseV079();
    Object.assign(cfg.filters, {
        category: '', etsysPick: false,
        shipsFrom: 'anywhere', shipsFromCity: '', shipsFromCountry: '',
        ready1Day: false, ready3Days: false,
        colors: [], vintage: false, giftCards: false, giftWrap: false,
        shipTo: '',
    });
    return cfg;
};

var favNormalizeConfigBaseV079 = favNormalizeConfig;
favNormalizeConfig = function favNormalizeConfigV079(raw) {
    const cfg = favNormalizeConfigBaseV079(raw);
    const f = raw && raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
    Object.assign(cfg.filters, {
        category: String(f.category ?? ''),
        etsysPick: f.etsysPick === true,
        shipsFrom: ['anywhere','europe','local','near','country'].includes(f.shipsFrom) ? f.shipsFrom : 'anywhere',
        shipsFromCity: String(f.shipsFromCity ?? ''),
        shipsFromCountry: String(f.shipsFromCountry ?? ''),
        ready1Day: f.ready1Day === true,
        ready3Days: f.ready3Days === true,
        colors: Array.isArray(f.colors) ? [...new Set(f.colors.map(String).filter(Boolean))] : [],
        vintage: f.vintage === true,
        giftCards: f.giftCards === true,
        giftWrap: f.giftWrap === true,
        shipTo: String(f.shipTo ?? ''),
    });
    return cfg;
};

favCfg = favNormalizeConfig(GM_getValue(FAV_STORAGE_KEY, favCfg));
favState.categoryExpanded = favState.categoryExpanded === true;
favState.colorExpanded = favState.colorExpanded === true;
favState.infoPopover = null;
favState.infoAnchor = null;

function favSaveAndApplyV079(reapply = true) {
    favSaveConfig();
    favState.localPage = 1;
    if (favState.filterOpen) favRefreshRail();
    return reapply ? favReapply() : Promise.resolve();
}

function favSaveUiOnlyV079(refresh = false) {
    favSaveConfig();
    if (refresh && favState.filterOpen) favRefreshRail();
}

var favSectionCounterV079 = 0;
function favNativeSectionV079(title, body, key) {
    const sectionKey = key || favSectionKeyV078(title);
    const open = favState.openSections.has(sectionKey);
    const root = document.createElement('div');
    root.className = 'ebsf-section collapsible-filter-bb';
    root.dataset.ebsfSection = sectionKey;

    const id = `ebsf-filter-section-${++favSectionCounterV079}`;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'wt-btn wt-btn--transparent wt-content-toggle--btn wt-content-toggle--with-icon collapsible-filter-trigger wt-width-full ebsf-native-section-trigger';
    trigger.setAttribute('aria-controls', id);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.innerHTML = `<span class="wt-flex-xs-auto wt-width-full ebsf-native-section-title"></span><span aria-hidden="true" class="wt-content-toggle--btn__icon"></span>`;
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
        content.hidden = !next;
        content.setAttribute('aria-hidden', String(!next));
        if (next) favState.openSections.add(sectionKey);
        else {
            favState.openSections.delete(sectionKey);
            if (sectionKey === 'search') favState.strictSettingsOpen = false;
        }
    });
    root.append(trigger, content);
    return root;
}

function favCheckboxV079({ checked = false, label, onChange, disabled = false, title = '' }) {
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

function favRadioV079({ name, value, checked = false, label, onChange, title = '' }) {
    const row = document.createElement('label');
    row.className = 'ebsf-native-choice ebsf-native-radio-row';
    if (title) row.title = title;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.className = 'ebsf-native-radio';
    input.addEventListener('change', () => { if (input.checked) onChange?.(value); });
    const text = document.createElement('span');
    text.className = 'ebsf-native-choice-label';
    text.textContent = label;
    row.append(input, text);
    return { row, input, text };
}

function favSelectV079(value, options, onChange, className = '') {
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
    select.addEventListener('change', () => onChange?.(select.value));
    return select;
}

function favNumberV079(value, placeholder, onChange, prefix = '') {
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

function favCloseInfoV079() {
    favState.infoPopover?.remove();
    if (favState.infoAnchor) favState.infoAnchor.setAttribute('aria-expanded', 'false');
    favState.infoPopover = null;
    favState.infoAnchor = null;
}

function favOpenInfoV079(anchor, title, text) {
    if (favState.infoAnchor === anchor && favState.infoPopover) { favCloseInfoV079(); return; }
    favCloseInfoV079();
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
    favCloseInfoV079();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') favCloseInfoV079(); });

function favInfoButtonV079(title, text) {
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
        favOpenInfoV079(button, title, text);
    });
    return button;
}

function favBuildSearchV079() {
    const wrap = document.createElement('div');
    wrap.className = 'ebsf-search-mode-stack ebsf-native-group';

    const strict = document.createElement('span');
    strict.className = `ebs-split ebsf-search-split${favCfg.strict ? ' ebs-active' : ''}`;
    const strictMain = document.createElement('button');
    strictMain.type = 'button'; strictMain.className = 'ebs-main'; strictMain.textContent = 'Strict title';
    strictMain.setAttribute('aria-pressed', String(favCfg.strict));
    strictMain.addEventListener('click', () => {
        favCfg.strict = !favCfg.strict;
        if (favCfg.strict) favCfg.multi = false;
        favSaveAndApplyV079(true);
    });
    const strictCaret = document.createElement('button');
    strictCaret.type = 'button'; strictCaret.className = 'ebs-caret'; strictCaret.textContent = '▾';
    strictCaret.setAttribute('aria-label', 'Strict title settings');
    strictCaret.setAttribute('aria-expanded', String(favState.strictSettingsOpen));
    strictCaret.addEventListener('click', () => { favState.strictSettingsOpen = !favState.strictSettingsOpen; favRefreshRail(); });
    strict.append(strictMain, strictCaret);
    wrap.append(strict);

    if (favState.strictSettingsOpen) {
        const panel = document.createElement('div');
        panel.className = 'ebsf-strict-settings';
        panel.append(
            favRadioV079({ name:'ebsf-strict-mode-v079', value:'phrase', checked:favCfg.strictMode === 'phrase', label:'Exact phrase', onChange:() => { favCfg.strictMode='phrase'; favSaveAndApplyV079(true); } }).row,
            favRadioV079({ name:'ebsf-strict-mode-v079', value:'all', checked:favCfg.strictMode === 'all', label:'All words', onChange:() => { favCfg.strictMode='all'; favSaveAndApplyV079(true); } }).row,
        );
        wrap.append(panel);
    }

    const multi = document.createElement('span');
    multi.className = `ebs-split ebsf-search-split${favCfg.multi ? ' ebs-active' : ''}`;
    const multiMain = document.createElement('button');
    multiMain.type = 'button'; multiMain.className = 'ebs-main'; multiMain.textContent = 'Multi-search';
    multiMain.setAttribute('aria-pressed', String(favCfg.multi));
    multiMain.addEventListener('click', () => {
        favCfg.multi = !favCfg.multi;
        if (favCfg.multi) favCfg.strict = false;
        favSaveAndApplyV079(true);
    });
    const multiCaret = document.createElement('button');
    multiCaret.type = 'button'; multiCaret.className = 'ebs-caret'; multiCaret.textContent = '▾';
    multiCaret.setAttribute('aria-label', 'Multi-search rules'); multiCaret.setAttribute('aria-haspopup', 'dialog');
    multiCaret.addEventListener('click', favOpenMultiModal);
    multi.append(multiMain, multiCaret);
    wrap.append(multi);
    return wrap;
}

var FAV_NATIVE_CATEGORIES_V079 = [
    ['accessories','Accessories'], ['art-and-collectibles','Art & Collectibles'], ['bags-and-purses','Bags & Purses'],
    ['bath-and-beauty','Bath & Beauty'], ['books-movies-and-music','Books, Movies & Music'], ['clothing','Clothing'],
    ['craft-supplies-and-tools','Craft Supplies & Tools'], ['electronics-and-accessories','Electronics & Accessories'],
    ['gifts','Gifts'], ['home-and-living','Home & Living'], ['jewelry','Jewelry'], ['paper-and-party-supplies','Paper & Party Supplies'],
    ['pet-supplies','Pet Supplies'], ['shoes','Shoes'], ['toys-and-games','Toys & Games'], ['weddings','Weddings'],
];

function favBuildCategoryV079() {
    const wrap = document.createElement('div'); wrap.className = 'ebsf-native-group ebsf-category-list';
    const all = document.createElement('button'); all.type='button'; all.className='ebsf-native-link'; all.textContent='All categories';
    all.classList.toggle('is-selected', !favCfg.filters.category);
    all.addEventListener('click', () => { favCfg.filters.category=''; favSaveUiOnlyV079(true); });
    wrap.append(all);
    const shown = favState.categoryExpanded ? FAV_NATIVE_CATEGORIES_V079 : FAV_NATIVE_CATEGORIES_V079.slice(0,5);
    for (const [value,label] of shown) {
        const b=document.createElement('button'); b.type='button'; b.className='ebsf-native-link'; b.textContent=label;
        b.classList.toggle('is-selected', favCfg.filters.category===value);
        b.title='Category filtering UI is ready; Favorites category metadata wiring is pending.';
        b.addEventListener('click',()=>{favCfg.filters.category=value;favSaveUiOnlyV079(true);});
        wrap.append(b);
    }
    const more=document.createElement('button'); more.type='button'; more.className='ebsf-native-show-more'; more.textContent=favState.categoryExpanded?'Show less':'Show more';
    more.addEventListener('click',()=>{favState.categoryExpanded=!favState.categoryExpanded;favRefreshRail();}); wrap.append(more);
    return wrap;
}

function favBuildSpecialOffersV079() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    wrap.append(
        favCheckboxV079({checked:favCfg.filters.freeShipping,label:'Free shipping',onChange:(v)=>{favCfg.filters.freeShipping=v;favSaveAndApplyV079(true);}}).row,
        favCheckboxV079({checked:favCfg.filters.onSale,label:'On sale',onChange:(v)=>{favCfg.filters.onSale=v;favSaveAndApplyV079(true);}}).row,
    );
    return wrap;
}

function favBuildItemFormatV079() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const set=(value)=>{favCfg.filters.itemFormat=value;favSaveAndApplyV079(true);};
    wrap.append(
        favRadioV079({name:'ebsf-item-format-v079',value:'all',checked:favCfg.filters.itemFormat==='all',label:'All items',onChange:set}).row,
        favRadioV079({name:'ebsf-item-format-v079',value:'physical',checked:favCfg.filters.itemFormat==='physical',label:'Exclude digital downloads',onChange:set}).row,
        favRadioV079({name:'ebsf-item-format-v079',value:'digital',checked:favCfg.filters.itemFormat==='digital',label:'Digital downloads only',onChange:set}).row,
    );
    return wrap;
}

function favBuildEtsyBestV079() {
    const wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const picks=favCheckboxV079({checked:favCfg.filters.etsysPick,label:"Etsy's Picks",title:'UI ready; Etsy Picks metadata is not yet available in the current Favorites dataset.',onChange:(v)=>{favCfg.filters.etsysPick=v;favSaveUiOnlyV079();}});
    const picksRow=document.createElement('div');picksRow.className='ebsf-native-help-row';picksRow.append(picks.row,favInfoButtonV079("About Etsy's Picks","Etsy’s Picks are hand selected by our style experts to highlight items from shops that have shown quality, reliability and style."));
    const star=favCheckboxV079({checked:favCfg.filters.starSeller,label:'Star Seller',onChange:(v)=>{favCfg.filters.starSeller=v;favSaveAndApplyV079(true);}});
    const starRow=document.createElement('div');starRow.className='ebsf-native-help-row';starRow.append(star.row,favInfoButtonV079('About Star Seller','Star Sellers have an outstanding track record for providing a great customer experience—they consistently earned 5-star reviews, shipped orders on time, and replied quickly to messages.'));
    wrap.append(picksRow,starRow);return wrap;
}

var FAV_COUNTRY_CODES_V079 = 'AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BE BZ BJ BM BT BO BA BW BV BR IO VG BN BG BF BI KH CM CA CV KY CF TD CL CN CX CC CO KM CG CK CR HR CW CY CZ DK DJ DM DO EC EG SV GQ ER EE ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IQ IE IM IL IT JM JP JE JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MK MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NC NZ NI NE NG NU NF MP NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RW SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS KR SS ES LK SD SR SJ SZ SE CH TW TJ TZ TH NL TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY VI UZ VU VE VN WF EH YE ZM ZW'.split(' ');
function favCountryNameV079(code) {
    try { return new Intl.DisplayNames([document.documentElement.lang || 'en'], {type:'region'}).of(code) || code; } catch (_) { return code; }
}
function favCountryOptionsV079(includeAny=true) {
    const common=['AU','CA','FR','DE','GR','IN','IE','IT','JP','NZ','PL','PT','ES','SE','NL','GB','US'];
    const options=[]; if(includeAny)options.push({value:'ZZ',label:'Any country'});
    options.push({group:'————————',options:common.map(code=>({value:code,label:favCountryNameV079(code)}))});
    options.push({group:'————————',options:FAV_COUNTRY_CODES_V079.map(code=>({value:code,label:favCountryNameV079(code)})).sort((a,b)=>a.label.localeCompare(b.label))});
    return options;
}

function favBuildShipsFromV079() {
    const f=favCfg.filters, wrap=document.createElement('div');wrap.className='ebsf-native-group';
    const country=String(favProps()?.countryIsoCode||'FI').toUpperCase();
    const localLabel=favCountryNameV079(country);
    const set=(value)=>{f.shipsFrom=value;favSaveUiOnlyV079(true);};
    wrap.append(
        favRadioV079({name:'ebsf-ships-from-v079',value:'anywhere',checked:f.shipsFrom==='anywhere',label:'Anywhere',onChange:set}).row,
        favRadioV079({name:'ebsf-ships-from-v079',value:'europe',checked:f.shipsFrom==='europe',label:'Europe',onChange:set}).row,
        favRadioV079({name:'ebsf-ships-from-v079',value:'local',checked:f.shipsFrom==='local',label:localLabel,onChange:set}).row,
        favRadioV079({name:'ebsf-ships-from-v079',value:'near',checked:f.shipsFrom==='near',label:'Near a city',onChange:set}).row,
    );
    if(f.shipsFrom==='near'){
        const city=document.createElement('input');city.type='text';city.className='wt-input wt-input--small ebsf-native-select';city.placeholder='City, country';city.value=f.shipsFromCity;
        city.addEventListener('change',()=>{f.shipsFromCity=city.value;favSaveUiOnlyV079();});wrap.append(city);
    }
    wrap.append(favRadioV079({name:'ebsf-ships-from-v079',value:'country',checked:f.shipsFrom==='country',label:'Another country',onChange:set}).row);
    if(f.shipsFrom==='country'){
        const select=favSelectV079(f.shipsFromCountry||country,favCountryOptionsV079(false),(value)=>{f.shipsFromCountry=value;favSaveUiOnlyV079();});wrap.append(select);
    }
    return wrap;
}

function favBuildReadyV079(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(
    favCheckboxV079({checked:f.ready1Day,label:'1 day',onChange:(v)=>{f.ready1Day=v;favSaveUiOnlyV079();}}).row,
    favCheckboxV079({checked:f.ready3Days,label:'1–3 days',onChange:(v)=>{f.ready3Days=v;favSaveUiOnlyV079();}}).row);return wrap;}

function favPriceSliderMaxV079(){const values=favState.records.map(x=>x.price).filter(Number.isFinite);const seen=values.length?Math.max(...values):40;const base=Math.max(40,seen);const step=base<=100?10:base<=500?25:50;return Math.ceil(base/step)*step;}
function favBuildPriceV079(){
    const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group ebsf-price-group';
    const note=document.createElement('p');note.className='ebsf-native-caption';note.textContent='Before shipping and taxes and other fees';wrap.append(note);
    const max=favPriceSliderMaxV079(),step=max<=100?5:max<=500?10:25;
    let minValue=Number(f.minPrice);if(!Number.isFinite(minValue)||minValue<0)minValue=0;
    let maxValue=Number(f.maxPrice);if(!Number.isFinite(maxValue)||maxValue<=0)maxValue=max;
    minValue=Math.min(minValue,maxValue);maxValue=Math.max(maxValue,minValue);
    const sliders=document.createElement('div');sliders.className='ebsf-price-slider';
    const low=document.createElement('input');low.type='range';low.min='0';low.max=String(max);low.step=String(step);low.value=String(Math.min(max,minValue));low.className='ebsf-price-range ebsf-price-range-low';
    const high=document.createElement('input');high.type='range';high.min='0';high.max=String(max);high.step=String(step);high.value=String(Math.min(max,maxValue));high.className='ebsf-price-range ebsf-price-range-high';
    const track=document.createElement('div');track.className='ebsf-price-track';sliders.append(track,low,high);wrap.append(sliders);
    const inputs=document.createElement('div');inputs.className='ebsf-native-price-inputs';
    const minBox=favNumberV079(f.minPrice,'0',(value)=>{f.minPrice=value;favSaveAndApplyV079(true);},'€');
    const maxBox=favNumberV079(f.maxPrice,`${max} +`,(value)=>{f.maxPrice=value;favSaveAndApplyV079(true);},'€');inputs.append(minBox.wrap,maxBox.wrap);wrap.append(inputs);
    const sync=()=>{let a=Number(low.value),b=Number(high.value);if(a>b){if(document.activeElement===low)low.value=String(b);else high.value=String(a);a=Number(low.value);b=Number(high.value);}sliders.style.setProperty('--low',`${a/max*100}%`);sliders.style.setProperty('--high',`${b/max*100}%`);minBox.input.value=a>0?String(a):'';maxBox.input.value=b<max?String(b):'';};
    low.addEventListener('input',sync);high.addEventListener('input',sync);
    low.addEventListener('change',()=>{f.minPrice=Number(low.value)>0?low.value:'';favSaveAndApplyV079(true);});
    high.addEventListener('change',()=>{f.maxPrice=Number(high.value)<max?high.value:'';favSaveAndApplyV079(true);});sync();return wrap;
}

var FAV_COLORS_V079=[
    ['black','Black','linear-gradient(45deg,#6a6a6a 50%,#222 50%)'],['white','White','linear-gradient(45deg,#fff 50%,#f5f5dc 50%)'],['silver','Silver','linear-gradient(45deg,#d3d3d3 50%,#8c8c8c 50%)'],['clear','Clear','linear-gradient(45deg,#fff 50%,#fff 50%)'],['blue','Blue','linear-gradient(45deg,#abe1ff 50%,#4e70f2 50%)'],['red','Red','linear-gradient(45deg,#ff9b9b 50%,#d22f2f 50%)'],['green','Green','linear-gradient(45deg,#aee6b0 50%,#3d8b40 50%)'],['yellow','Yellow','linear-gradient(45deg,#fff4a3 50%,#e0b92f 50%)'],['orange','Orange','linear-gradient(45deg,#ffc58a 50%,#e87c22 50%)'],['pink','Pink','linear-gradient(45deg,#ffd0e2 50%,#df6b9c 50%)'],['purple','Purple','linear-gradient(45deg,#d8b8f5 50%,#7f4ab0 50%)'],['brown','Brown','linear-gradient(45deg,#c7a17a 50%,#765038 50%)'],['beige','Beige','linear-gradient(45deg,#f1e3c5 50%,#d3bd94 50%)'],['gold','Gold','linear-gradient(45deg,#ffe69a 50%,#c99d2c 50%)'],['gray','Gray','linear-gradient(45deg,#d1d1d1 50%,#777 50%)']];
function favBuildColorV079(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';const shown=favState.colorExpanded?FAV_COLORS_V079:FAV_COLORS_V079.slice(0,5);for(const [value,label,bg] of shown){const item=favCheckboxV079({checked:f.colors.includes(value),label,onChange:(checked)=>{const set=new Set(f.colors);checked?set.add(value):set.delete(value);f.colors=[...set];favSaveUiOnlyV079();}});const sw=document.createElement('span');sw.className='ebsf-color-swatch';sw.style.background=bg;item.text.prepend(sw);item.row.title='Color filtering UI is ready; Favorites color metadata wiring is pending.';wrap.append(item.row);}const more=document.createElement('button');more.type='button';more.className='ebsf-native-show-more';more.textContent=favState.colorExpanded?'Show less':'Show more';more.addEventListener('click',()=>{favState.colorExpanded=!favState.colorExpanded;favRefreshRail();});wrap.append(more);return wrap;}

function favBuildItemTypeV079(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(favCheckboxV079({checked:f.vintage,label:'Vintage',title:'UI ready; vintage metadata wiring is pending.',onChange:(v)=>{f.vintage=v;favSaveUiOnlyV079();}}).row);return wrap;}
function favBuildOrderingV079(){const f=favCfg.filters,wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(
    favCheckboxV079({checked:f.giftCards,label:'Accepts Etsy gift cards',title:'UI ready; gift-card metadata wiring is pending.',onChange:(v)=>{f.giftCards=v;favSaveUiOnlyV079();}}).row,
    favCheckboxV079({checked:f.giftWrap,label:'Can be gift-wrapped',title:'UI ready; gift-wrap metadata wiring is pending.',onChange:(v)=>{f.giftWrap=v;favSaveUiOnlyV079();}}).row,
    favCheckboxV079({checked:f.personalizable,label:'Customizable',onChange:(v)=>{f.personalizable=v;favSaveAndApplyV079(true);}}).row);return wrap;}
function favBuildShipToV079(){const f=favCfg.filters,country=String(favProps()?.countryIsoCode||'FI').toUpperCase();const wrap=document.createElement('div');wrap.className='ebsf-native-group';wrap.append(favSelectV079(f.shipTo||country,favCountryOptionsV079(true),(value)=>{f.shipTo=value;favSaveUiOnlyV079();}));return wrap;}

function favBuildExtrasV079(){
    const f=favCfg.filters, sections=[];
    const availability=document.createElement('div');availability.className='ebsf-native-group';
    availability.append(favCheckboxV079({checked:f.availableOnly,label:'Available only',onChange:(v)=>{f.availableOnly=v;favSaveAndApplyV079(true);}}).row);
    const discount=document.createElement('label');discount.className='ebsf-native-field';discount.append(document.createTextNode('Minimum discount %'),favNumberV079(f.minDiscount,'0',(v)=>{f.minDiscount=v;favSaveAndApplyV079(true);}).wrap);availability.append(discount);sections.push(favNativeSectionV079('Availability & discount',availability,'availability'));

    const rating=document.createElement('div');rating.className='ebsf-native-group';const rg=document.createElement('div');rg.className='ebsf-native-two-col';rg.append(favNumberV079(f.minRating,'Min rating',(v)=>{f.minRating=v;favSaveAndApplyV079(true);}).wrap,favNumberV079(f.minReviews,'Min reviews',(v)=>{f.minReviews=v;favSaveAndApplyV079(true);}).wrap);rating.append(rg);sections.push(favNativeSectionV079('Rating & reviews',rating,'rating-and-reviews'));

    const seller=document.createElement('div');seller.className='ebsf-native-group';const shops=[...new Set(favState.records.map(x=>x.shopName).filter(Boolean))].sort((a,b)=>a.localeCompare(b));seller.append(favSelectV079(f.shop,[{value:'',label:'Any shop'},...shops.map(x=>({value:x,label:x}))],(v)=>{f.shop=v;favSaveAndApplyV079(true);}));sections.push(favNativeSectionV079('Seller',seller,'seller'));

    const features=document.createElement('div');features.className='ebsf-native-group';features.append(
        favCheckboxV079({checked:f.bestSeller,label:'Best Seller',onChange:(v)=>{f.bestSeller=v;favSaveAndApplyV079(true);}}).row,
        favCheckboxV079({checked:f.hasVariations,label:'Has variations',onChange:(v)=>{f.hasVariations=v;favSaveAndApplyV079(true);}}).row,
        favCheckboxV079({checked:f.hasVideo,label:'Has video',onChange:(v)=>{f.hasVideo=v;favSaveAndApplyV079(true);}}).row);sections.push(favNativeSectionV079('Listing features',features,'listing-features'));

    const popularity=document.createElement('div');popularity.className='ebsf-native-group';popularity.append(favCheckboxV079({checked:f.lowStock,label:'Etsy reports low stock',onChange:(v)=>{f.lowStock=v;favSaveAndApplyV079(true);}}).row);const carts=document.createElement('label');carts.className='ebsf-native-field';carts.append(document.createTextNode('At least X carts (when Etsy reports it)'),favNumberV079(f.minCarts,'e.g. 5',(v)=>{f.minCarts=v;favSaveAndApplyV079(true);}).wrap);popularity.append(carts);sections.push(favNativeSectionV079('Popularity & stock',popularity,'popularity-and-stock'));

    const delivery=document.createElement('div');delivery.className='ebsf-native-group';const shipping=document.createElement('label');shipping.className='ebsf-native-field';shipping.append(document.createTextNode('Maximum shipping cost'),favNumberV079(f.maxShipping,'0',(v)=>{f.maxShipping=v;favSaveAndApplyV079(true);},'€').wrap);delivery.append(shipping,favCheckboxV079({checked:f.returns,label:'Returns accepted',onChange:(v)=>{f.returns=v;favSaveAndApplyV079(true);}}).row,favCheckboxV079({checked:f.exchanges,label:'Exchanges accepted',onChange:(v)=>{f.exchanges=v;favSaveAndApplyV079(true);}}).row);sections.push(favNativeSectionV079('Delivery',delivery,'delivery'));
    return sections;
}

favBuildFilterRail = function favBuildFilterRailV079() {
    favCloseInfoV079();
    const rail=document.createElement('div');rail.className='ebsf-rail ebsf-rail-v078 ebsf-rail-v079';rail.dataset.ebsfRail='';
    const header=document.createElement('div');header.className='ebsf-rail-header ebsf-native-rail-header';
    const heading=document.createElement('button');heading.type='button';heading.className='ebsf-filter-heading ebsf-native-filter-heading';heading.textContent='Filters';heading.setAttribute('aria-label','Hide filters');heading.addEventListener('click',favCloseFilters);
    const reset=document.createElement('button');reset.type='button';reset.className='ebsf-native-reset';reset.textContent='Reset';
    reset.addEventListener('click',async()=>{const keepRules=favCfg.multiRules;favCfg=favDefaultConfig();favCfg.multiRules=keepRules;favState.strictSettingsOpen=false;favSaveConfig();favRefreshRail();await favReapply(true);});
    header.append(heading,reset);rail.append(header);

    rail.append(
        favNativeSectionV079('Search',favBuildSearchV079(),'search'),
        favNativeSectionV079('Category',favBuildCategoryV079(),'category'),
        favNativeSectionV079('Special offers',favBuildSpecialOffersV079(),'special-offers'),
        favNativeSectionV079('Item format',favBuildItemFormatV079(),'item-format'),
        favNativeSectionV079("Etsy's best",favBuildEtsyBestV079(),'etsys-best'),
        favNativeSectionV079('Ships from',favBuildShipsFromV079(),'ships-from'),
        favNativeSectionV079('Ready to ship in',favBuildReadyV079(),'ready-to-ship-in'),
        favNativeSectionV079('Price',favBuildPriceV079(),'price'),
        favNativeSectionV079('Color',favBuildColorV079(),'color'),
        favNativeSectionV079('Item type',favBuildItemTypeV079(),'item-type'),
        favNativeSectionV079('Ordering options',favBuildOrderingV079(),'ordering-options'),
        favNativeSectionV079('Ship to',favBuildShipToV079(),'ship-to'),
        ...favBuildExtrasV079(),
    );
    return rail;
};

GM_addStyle(`
.ebsf-rail-v079{font-size:13px;line-height:1.35;color:#222;overflow:visible!important}
.ebsf-rail-v079,.ebsf-rail-v079 *{box-sizing:border-box}
.ebsf-rail-v079 .ebsf-native-rail-header{display:flex;align-items:center;justify-content:space-between;min-height:58px;padding:13px 8px 14px!important;border-bottom:1px solid #dedede;font-size:16px}
.ebsf-native-filter-heading{padding:2px 0!important;font-size:16px!important;font-weight:600!important;text-decoration:none!important}
.ebsf-native-reset{appearance:none;border:0;background:transparent;padding:2px 0;color:#222;font:600 12px/1.2 inherit;text-decoration:underline;cursor:pointer}
.ebsf-rail-v079 .ebsf-section{width:100%;padding:0 8px!important;border-bottom:1px solid #dedede}
.ebsf-rail-v079 .ebsf-native-section-trigger{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px;width:100%!important;min-height:44px!important;margin:0!important;padding:11px 0!important;border:0!important;border-radius:10px!important;background:transparent!important;color:#222!important;font:600 12px/1.3 inherit!important;text-align:left!important;box-shadow:none!important}
.ebsf-rail-v079 .ebsf-native-section-trigger:hover{background:rgba(34,34,34,.04)!important}
.ebsf-native-section-title{min-width:0;text-align:left}
.ebsf-rail-v079 .wt-content-toggle--btn__icon{position:relative!important;display:block!important;flex:0 0 12px!important;width:12px!important;height:12px!important;margin:0 1px 0 6px!important;background:none!important;transform:none!important}
.ebsf-rail-v079 .wt-content-toggle--btn__icon::before{content:none!important}
.ebsf-rail-v079 .wt-content-toggle--btn__icon::after{content:"";position:absolute;left:2px;top:2px;width:6px;height:6px;border-right:1.8px solid #222;border-bottom:1.8px solid #222;transform:rotate(45deg);transform-origin:center;transition:transform .12s ease}
.ebsf-rail-v079 .ebsf-native-section-trigger[aria-expanded="true"] .wt-content-toggle--btn__icon::after{transform:rotate(225deg);top:5px}
.ebsf-rail-v079 .ebsf-section-body{display:block!important;width:100%;min-width:0;max-width:100%;padding:0 0 14px!important;overflow:visible!important}
.ebsf-rail-v079 .ebsf-section-body[hidden]{display:none!important}
.ebsf-native-group{display:grid;gap:7px;width:100%;min-width:0}
.ebsf-native-choice{display:flex;align-items:flex-start;gap:8px;width:100%;min-height:22px;margin:0;color:#333;font-size:12px;line-height:1.35;cursor:pointer}
.ebsf-native-choice-label{display:inline-flex;align-items:center;min-width:0;min-height:18px;gap:5px;flex-wrap:wrap}
.ebsf-native-checkbox,.ebsf-native-radio{appearance:none;flex:0 0 18px;width:18px!important;height:18px!important;margin:0!important;border:1px solid #8b8b8b;background:#fff;cursor:pointer}
.ebsf-native-checkbox{border-radius:2px}
.ebsf-native-checkbox:checked{border-color:#222;background:#222 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='m3.5 8 3 3 6-7'/%3E%3C/svg%3E") center/13px no-repeat}
.ebsf-native-radio{border-radius:50%}
.ebsf-native-radio:checked{border-color:#222;background:#222;box-shadow:inset 0 0 0 4px #fff}
.ebsf-native-checkbox:focus-visible,.ebsf-native-radio:focus-visible{outline:2px solid #3b67d9;outline-offset:2px}
.ebsf-native-help-row{display:flex;align-items:flex-start;gap:3px;min-width:0}.ebsf-native-help-row>.ebsf-native-choice{flex:0 1 auto;width:auto}
.ebsf-native-help{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 15px;width:15px;height:15px;margin:1px 0 0;padding:0;border:1.5px solid #555;border-radius:50%;background:transparent;color:#444;font:700 10px/1 Arial,sans-serif;cursor:pointer}
.ebsf-native-info-popover{position:fixed;z-index:100020;padding:12px 14px;border:2px solid #222;border-radius:10px;background:#fff;color:#333;box-shadow:0 4px 18px rgba(0,0,0,.18);font:12px/1.45 Arial,sans-serif}
.ebsf-native-info-popover strong{display:block;margin-bottom:4px;font-size:13px}.ebsf-native-info-popover p{margin:0}
.ebsf-native-link,.ebsf-native-show-more{appearance:none;width:max-content;max-width:100%;padding:0;border:0;background:transparent;font:12px/1.35 inherit;text-align:left;cursor:pointer}
.ebsf-native-link{color:#333}.ebsf-native-link:first-child{color:#2f5ea8}.ebsf-native-link.is-selected{font-weight:600}.ebsf-native-show-more{margin-top:2px;text-decoration:underline;color:#333}
.ebsf-native-select,.ebsf-rail-v079 select,.ebsf-rail-v079 .wt-input{display:block;width:100%!important;min-width:0!important;max-width:100%!important;min-height:36px;border:1px solid #8d8d8d!important;border-radius:6px!important;background:#fff;color:#444;font:12px/1.25 inherit;padding:7px 10px;box-shadow:none!important}
.ebsf-native-number-wrap{position:relative;display:flex;align-items:center;min-width:0}.ebsf-native-number-prefix{position:absolute;left:9px;z-index:1;color:#555;font-size:12px;pointer-events:none}.ebsf-native-number-prefix+.ebsf-native-number{padding-left:22px!important}.ebsf-native-number::-webkit-inner-spin-button{opacity:.4}
.ebsf-native-field{display:grid;gap:5px;width:100%;font-size:11px;line-height:1.25;color:#444}.ebsf-native-two-col{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;width:100%}
.ebsf-search-mode-stack{gap:7px!important}.ebsf-search-split{width:100%!important;max-width:100%;height:36px!important}.ebsf-search-split .ebs-main{flex:1 1 auto;min-width:0;text-align:left}.ebsf-search-split .ebs-caret{flex:0 0 30px}.ebsf-strict-settings{margin:0!important;padding:8px!important;gap:7px!important;border:1px solid #d7d7d2!important;border-radius:9px!important;background:#fff!important}
.ebsf-native-caption{margin:0 0 3px;color:#666;font-size:11px;line-height:1.25}
.ebsf-price-slider{--low:0%;--high:100%;position:relative;height:28px;margin:2px 1px 5px}.ebsf-price-track{position:absolute;left:7px;right:7px;top:13px;height:3px;border-radius:3px;background:linear-gradient(to right,#d7d7d7 0 var(--low),#222 var(--low) var(--high),#d7d7d7 var(--high) 100%)}
.ebsf-price-range{appearance:none;position:absolute;inset:0;width:100%;height:28px;margin:0;background:transparent;pointer-events:none}.ebsf-price-range::-webkit-slider-runnable-track{height:3px;background:transparent}.ebsf-price-range::-webkit-slider-thumb{appearance:none;width:18px;height:18px;margin-top:-7.5px;border:1px solid #c9c9c9;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:auto;cursor:pointer}.ebsf-price-range::-moz-range-track{height:3px;background:transparent}.ebsf-price-range::-moz-range-thumb{width:18px;height:18px;border:1px solid #c9c9c9;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);pointer-events:auto;cursor:pointer}
.ebsf-native-price-inputs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;width:100%}
.ebsf-color-swatch{display:inline-block;flex:0 0 14px;width:14px;height:14px;border:1px solid rgba(34,34,34,.22);border-radius:50%}
.ebsf-category-list{gap:3px}
@media(max-width:899px){.ebsf-overlay .ebsf-rail-v079{padding:0}.ebsf-overlay .ebsf-rail-v079 .ebsf-native-rail-header{display:none!important}}
`);
