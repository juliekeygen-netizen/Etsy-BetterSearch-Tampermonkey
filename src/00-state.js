'use strict';


var KEY = Object.freeze({
    strict: 'etsy-bettersearch.strict',
    mode: 'etsy-bettersearch.mode',
    multi: 'etsy-bettersearch.multi',
    legacyComma: 'etsy-bettersearch.comma',
    keep: 'etsy-bettersearch.keepFilters',
    filters: 'etsy-bettersearch.savedFilters',
    singleQuery: 'etsy-bettersearch.singleQuery',
    multiQuery: 'etsy-bettersearch.multiQuery',
    multiRules: 'etsy-bettersearch.multiRules',
});

var TEXT_OPERATORS = Object.freeze([
    ['contains', 'Contains'],
    ['equals', 'Equals'],
    ['startsWith', 'Starts with'],
    ['endsWith', 'Ends with'],
]);
var LOGIC_OPTIONS = Object.freeze([['and', 'AND'], ['or', 'OR']]);
var POLARITY_OPTIONS = Object.freeze([['match', 'Match'], ['exclude', 'Exclude']]);
var FIELD_OPTIONS = Object.freeze([['title', 'Title']]);

var TEMP_PARAMS = new Set([
    'q', 'search_query', 'page', 'ref', 'page_type', 'promoted', 'sorted', 'explicit',
    'explicit_scope', 'anchor_listing_id', 'entry_point', 'rbl_s', 'redirect_url',
    'vintage_rewrite', 'original_query', 'orig_facet', 'spell_redirect_from_no_results',
    'spell_redirect_from_results', 'spelling_correction_accept_results',
    'spelling_correction_query', 'spell_correction_via_mmx', 'was_spell_corrected_via_mmx',
    'mosv', 'moci', 'mosi', 'guided_search', 'as_prefix', 'result_count',
    'filter_distracting_content', 'delivery_target_date', 'placement', 'redirects',
    'bucket_id', 'user_id', 'exclude_listing_ids', 'referrer', 'is_prefetch',
    'matching_behavior', 'ranking_behavior', 'market_optimization_behavior',
    'application_behavior', 'request_type', 'only_unconditional_free_shipping',
    'log_performance_metrics', 'specs', 'is_webpack5', 'should_request_max_price',
    'blended_ads_offset', 'blended_organic_offset', 'rpq', 'is_merch_library',
    'search_type',
]);

var storedMode = GM_getValue(KEY.mode, null);
var storedMulti = GM_getValue(KEY.multi, GM_getValue(KEY.legacyComma, false));
var cfg = {
    strict: Boolean(GM_getValue(KEY.strict, false)),
    mode: storedMode === 'all' ? 'all' : 'phrase',
    multi: Boolean(storedMulti),
    keep: Boolean(GM_getValue(KEY.keep, false)),
    filters: readArray(KEY.filters),
    singleQuery: String(GM_getValue(KEY.singleQuery, '') || ''),
    multiQuery: String(GM_getValue(KEY.multiQuery, '') || ''),
    multiRules: normalizeRules(readArray(KEY.multiRules)),
};

var state = {
    timer: 0,
    fitTimer: 0,
    lastUrl: location.href,
    scanId: 0,
    controller: null,
    scanningSig: '',
    cacheSig: '',
    candidates: [],
    cacheReady: false,
    rendered: false,
    nativeGrid: null,
    nativeHTML: '',
    nativeNodes: new Map(),
    nativeOrder: [],
    renderSig: '',
    status: null,
    strictPopup: null,
    strictPopupAnchor: null,
    resizeObserver: null,
    observedInner: null,
    retryTimer: 0,
    retrySig: '',
    retryCount: 0,
    modal: null,
    modalDraft: null,
    modalMenu: null,
    modalDrag: null,
    modalPreviewOpen: false,
    scrollLock: null,
    favoriteJobs: new Map(),
};

function id(prefix = 'rule') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readArray(key) {
    const value = GM_getValue(key, []);
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {}
    }
    return [];
}

function save(name, value) {
    cfg[name] = value;
    GM_setValue(KEY[name], value);
}

function saveFilters(entries) {
    cfg.filters = entries;
    GM_setValue(KEY.filters, entries);
}

function defaultRule(logic = 'or', value = '') {
    return {
        id: id(),
        enabled: true,
        logic: logic === 'and' ? 'and' : 'or',
        field: 'title',
        polarity: 'match',
        operator: 'contains',
        value: String(value || ''),
        options: { caseSensitive: false, wholeWord: false, matchAnyWord: false },
    };
}

function normalizeRule(rule, index = 0) {
    const polarity = rule?.polarity === 'exclude' ? 'exclude' : 'match';
    return {
        id: String(rule?.id || id()),
        enabled: rule?.enabled !== false,
        logic: polarity === 'exclude' ? 'and' : rule?.logic === 'and' ? 'and' : 'or',
        field: 'title',
        polarity,
        operator: TEXT_OPERATORS.some(([key]) => key === rule?.operator) ? rule.operator : 'contains',
        value: String(rule?.value ?? ''),
        options: {
            caseSensitive: rule?.options?.caseSensitive === true,
            wholeWord: rule?.options?.wholeWord === true,
            matchAnyWord: rule?.options?.matchAnyWord === true,
        },
        _index: index,
    };
}

function normalizeRules(rules) {
    return (Array.isArray(rules) ? rules : []).map(normalizeRule).map(({ _index, ...rule }) => rule);
}

function parseLegacyMulti(raw) {
    let text = String(raw || '').trim();
    const leading = [];
    const trailing = [];
    while (text) {
        const match = text.match(/^\s*\[([^\[\]]+)\]\s*/u);
        if (!match) break;
        if (match[1].trim()) leading.push(match[1].trim());
        text = text.slice(match[0].length).trimStart();
    }
    while (text) {
        const match = text.match(/\s*\[([^\[\]]+)\]\s*$/u);
        if (!match) break;
        if (match[1].trim()) trailing.unshift(match[1].trim());
        text = text.slice(0, text.length - match[0].length).trimEnd();
    }
    const rules = [
        ...leading.map((value) => defaultRule('and', value)),
        ...text.split(',').map((value) => value.trim()).filter(Boolean).map((value) => defaultRule('or', value)),
        ...trailing.map((value) => defaultRule('and', value)),
    ];
    return rules;
}

function ensureRulesSeeded() {
    if (cfg.multiRules.length) return;
    const legacy = cfg.multiQuery || (cfg.multi ? query() : '');
    const migrated = parseLegacyMulti(legacy);
    cfg.multiRules = migrated.length ? migrated : [defaultRule('or', legacy || query())];
    save('multiRules', cfg.multiRules);
}

function isSearchPage() {
    return /\/search(?:\.php)?\/?$/i.test(location.pathname);
}

function query() {
    const url = new URL(location.href);
    const q = url.searchParams.get('q') || url.searchParams.get('search_query');
    if (q?.trim()) return q.trim();
    return document.querySelector('#global-enhancements-search-query, [data-search-input]')?.value?.trim() || '';
}

function normalize(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .toLocaleLowerCase()
        .replace(/[’‘`´]/g, "'")
        .replace(/[\p{P}\p{S}_]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function filterEntries(url = new URL(location.href)) {
    const out = [];
    for (const [key, value] of url.searchParams.entries()) {
        if (!TEMP_PARAMS.has(key)) out.push([key, value]);
    }
    return out;
}

function filterSignature(entries) {
    return entries
        .map(([k, v]) => [String(k), String(v)])
        .sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

function searchUrl(newQuery, entries = cfg.filters) {
    const form = document.querySelector('#gnav-search');
    const url = new URL(form?.action || location.href, location.origin);
    url.pathname = url.pathname.replace(/search\.php\/?$/i, 'search');
    url.search = '';
    url.hash = '';
    url.searchParams.set('q', newQuery);
    for (const [key, value] of entries) url.searchParams.append(key, value);
    url.searchParams.set('ref', 'search_bar');
    return url;
}

function scanUrl(part, page) {
    const url = new URL(location.href);
    const entries = filterEntries(url);
    url.search = '';
    url.hash = '';
    url.searchParams.set('q', part);
    for (const [key, value] of entries) url.searchParams.append(key, value);
    if (page > 1) url.searchParams.set('page', String(page));
    url.searchParams.set('ref', page > 1 ? 'pagination' : 'search_bar');
    return url.href;
}

function maybeRestoreFilters() {
    if (!cfg.keep || !isSearchPage() || cfg.filters.length === 0) return false;
    const url = new URL(location.href);
    if (url.searchParams.get('ref') !== 'search_bar') return false;
    if (filterEntries(url).length > 0) return false;
    const q = query();
    if (!q) return false;
    const desired = searchUrl(q, cfg.filters);
    if (desired.href === location.href) return false;
    location.replace(desired.href);
    return true;
}

function captureFilters() {
    if (cfg.keep && isSearchPage()) saveFilters(filterEntries(new URL(location.href)));
}

function saveActiveQuery(value = query()) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    if (cfg.multi) save('multiQuery', trimmed);
    else save('singleQuery', trimmed);
}

function seedQueryState() {
    const current = query();
    if (!current) return;
    if (cfg.multi && !cfg.multiQuery) save('multiQuery', current);
    if (!cfg.multi && !cfg.singleQuery) save('singleQuery', current);
}

function ruleValue(rule) {
    return String(rule?.value || '').trim();
}

function enabledRules(rules = cfg.multiRules) {
    return normalizeRules(rules).filter((rule) => rule.enabled && ruleValue(rule));
}

function searchTermsForRule(rule) {
    const value = ruleValue(rule);
    if (!value) return [];
    if (rule.operator === 'contains' && rule.options?.matchAnyWord) {
        const seen = new Set();
        return value.split(/\s+/).map((part) => part.trim()).filter((part) => {
            const key = normalize(part);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    return [value];
}
