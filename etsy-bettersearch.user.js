// ==UserScript==
// @name         Etsy BetterSearch
// @namespace    https://github.com/juliekeygen-netizen
// @version      0.3.0
// @description  Adds strict title matching, multi-search, and persistent Etsy filters while keeping Etsy's native search UI.
// @homepageURL  https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey
// @supportURL   https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/issues
// @author       juliekeygen-netizen
// @match        https://www.etsy.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @downloadURL  https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @updateURL    https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const KEY = {
        strict: 'etsy-bettersearch.strict',
        mode: 'etsy-bettersearch.mode',
        multi: 'etsy-bettersearch.multi',
        legacyComma: 'etsy-bettersearch.comma',
        keep: 'etsy-bettersearch.keepFilters',
        filters: 'etsy-bettersearch.savedFilters',
        singleQuery: 'etsy-bettersearch.singleQuery',
        multiQuery: 'etsy-bettersearch.multiQuery',
    };

    const storedMode = GM_getValue(KEY.mode, null);
    const storedMulti = GM_getValue(KEY.multi, GM_getValue(KEY.legacyComma, false));

    const cfg = {
        strict: Boolean(GM_getValue(KEY.strict, false)),
        // Exact phrase is the default for fresh installs. Existing explicit choices are preserved.
        mode: storedMode === 'all' ? 'all' : 'phrase',
        multi: Boolean(storedMulti),
        keep: Boolean(GM_getValue(KEY.keep, false)),
        filters: readSavedFilters(),
        singleQuery: String(GM_getValue(KEY.singleQuery, '') || ''),
        multiQuery: String(GM_getValue(KEY.multiQuery, '') || ''),
    };

    // Navigation/tracking/query-state parameters that should not be remembered as filters.
    const TEMP_PARAMS = new Set([
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

    const state = {
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
        renderSig: '',
        status: null,
        popup: null,
        popupAnchor: null,
        popupType: '',
        resizeObserver: null,
        observedInner: null,
        retryTimer: 0,
        retrySig: '',
        retryCount: 0,
        switchingMode: false,
    };

    GM_addStyle(`
        #ebs-controls {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex: 0 0 auto;
            height: 100%;
            margin-right: 6px;
            white-space: nowrap;
        }
        #ebs-controls button { font-family: inherit; }

        .ebs-split {
            display: inline-flex;
            height: 36px;
            overflow: hidden;
            border-radius: 999px;
            background: #f5f5f1;
            color: #222;
        }
        .ebs-split.ebs-active { background: #222; color: #fff; }

        .ebs-main, .ebs-caret, .ebs-pill {
            appearance: none;
            min-height: 36px;
            margin: 0;
            border: 0;
            font-size: 13px;
            font-weight: 500;
            line-height: 1;
            white-space: nowrap;
            cursor: pointer;
        }
        .ebs-main {
            padding: 0 10px 0 12px;
            background: transparent;
            color: inherit;
        }
        .ebs-caret {
            width: 30px;
            padding: 0;
            border-left: 1px solid rgba(34,34,34,.14);
            background: transparent;
            color: inherit;
        }
        .ebs-split.ebs-active .ebs-caret {
            border-left-color: rgba(255,255,255,.28);
        }
        .ebs-pill {
            padding: 0 12px;
            border-radius: 999px;
            background: #f5f5f1;
            color: #222;
        }
        .ebs-pill.ebs-active { background: #222; color: #fff; }

        .ebs-main:hover, .ebs-caret:hover, .ebs-pill:hover { filter: brightness(.96); }

        .ebs-popup {
            position: fixed;
            z-index: 100000;
            width: 236px;
            box-sizing: border-box;
            padding: 14px;
            border: 1px solid rgba(34,34,34,.14);
            border-radius: 12px;
            background: #fff;
            color: #222;
            box-shadow: 0 6px 24px rgba(34,34,34,.16);
            font: 14px/1.35 inherit;
        }
        .ebs-popup-title {
            margin: 0 0 9px;
            font-weight: 600;
        }
        .ebs-option {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 30px;
            cursor: pointer;
            user-select: none;
        }
        .ebs-option input {
            width: 16px;
            height: 16px;
            margin: 0;
            accent-color: #222;
        }
        .ebs-guide {
            margin: 0;
            color: #595959;
            font-size: 13px;
            line-height: 1.45;
        }
        .ebs-guide + .ebs-guide { margin-top: 10px; }
        .ebs-example {
            display: block;
            margin-top: 4px;
            padding: 6px 8px;
            border-radius: 6px;
            background: #f5f5f1;
            color: #222;
            font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        .ebs-result-text { white-space: nowrap; }
        .ebs-empty {
            width: 100% !important;
            max-width: none !important;
            flex-basis: 100% !important;
            padding: 30px 0 40px !important;
            text-align: center;
            color: #595959;
            list-style: none;
        }

        body.ebs-results-active [data-appears-component-name="search_pagination"],
        body.ebs-results-active [data-no-results] {
            display: none !important;
        }

        @media (max-width: 899px) {
            #ebs-controls { gap: 4px; margin-right: 4px; }
            .ebs-main, .ebs-caret, .ebs-pill { font-size: 12px; }
            .ebs-main, .ebs-pill { padding-left: 9px; padding-right: 9px; }
        }
    `);

    function readSavedFilters() {
        const value = GM_getValue(KEY.filters, []);
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
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

    // Multi-search supports optional shared modifiers only at the very beginning/end:
    // [charm] subahibi, saya no uta  -> charm subahibi / charm saya no uta
    // subahibi, saya no uta [charm]  -> subahibi charm / saya no uta charm
    // Multiple leading/trailing [] blocks are also supported.
    function parseMulti(raw) {
        let text = String(raw || '').trim();
        const prefix = [];
        const suffix = [];

        while (text) {
            const match = text.match(/^\s*\[([^\[\]]+)\]\s*/u);
            if (!match) break;
            const value = match[1].trim();
            if (value) prefix.push(value);
            text = text.slice(match[0].length).trimStart();
        }

        while (text) {
            const match = text.match(/\s*\[([^\[\]]+)\]\s*$/u);
            if (!match) break;
            const value = match[1].trim();
            if (value) suffix.unshift(value);
            text = text.slice(0, text.length - match[0].length).trimEnd();
        }

        const seen = new Set();
        const groups = [];
        for (const part of text.split(',')) {
            const base = part.trim();
            if (!base) continue;
            const expanded = [...prefix, base, ...suffix].join(' ').replace(/\s+/g, ' ').trim();
            const key = normalize(expanded);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            groups.push(expanded);
        }

        return { groups, prefix, suffix, baseText: text };
    }

    function groups(raw) {
        if (!cfg.multi) {
            const trimmed = String(raw || '').trim();
            return trimmed ? [trimmed] : [];
        }
        return parseMulti(raw).groups;
    }

    function matchesTitle(title, queryGroups) {
        if (!cfg.strict) return true;

        const titleNorm = normalize(title);
        if (!titleNorm) return false;
        const tokenSet = cfg.mode === 'all' ? new Set(titleNorm.split(' ').filter(Boolean)) : null;

        return queryGroups.some((part) => {
            const partNorm = normalize(part);
            if (!partNorm) return false;
            if (cfg.mode === 'phrase') return ` ${titleNorm} `.includes(` ${partNorm} `);
            const words = partNorm.split(' ').filter(Boolean);
            return words.length > 0 && words.every((word) => tokenSet.has(word));
        });
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

    function modeSwitchFilters() {
        const current = filterEntries(new URL(location.href));
        if (current.length) return current;
        return cfg.keep ? cfg.filters : current;
    }

    function switchSearchMode(nextMulti) {
        if (cfg.multi === nextMulti) return;

        const current = query();
        if (current) {
            if (cfg.multi) save('multiQuery', current);
            else save('singleQuery', current);
        }

        save('multi', nextMulti);
        updateButtons();
        closePopup();
        stopScan();
        invalidateCache();
        restoreNative();

        let target = nextMulti ? cfg.multiQuery : cfg.singleQuery;
        if (!target) {
            target = current;
            if (target) {
                if (nextMulti) save('multiQuery', target);
                else save('singleQuery', target);
            }
        }

        if (!target || !isSearchPage()) {
            scheduleSync(50);
            return;
        }

        const desired = searchUrl(target, modeSwitchFilters());
        if (desired.href === location.href) {
            scheduleSync(50);
            return;
        }

        state.switchingMode = true;
        location.assign(desired.href);
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

    function signature(raw, queryGroups) {
        return `${location.pathname}|${cfg.multi ? 'multi' : 'single'}|${queryGroups.join('\u241E')}|${filterSignature(filterEntries(new URL(location.href)))}`;
    }

    function parseTotalPages(doc) {
        let total = 1;
        for (const script of doc.querySelectorAll('script')) {
            const text = script.textContent || '';
            if (!text.includes('initial_total_pages')) continue;
            const match = text.match(/"initial_total_pages"\s*:\s*(\d+)/);
            if (match) total = Math.max(total, Number(match[1]) || 1);
        }
        for (const link of doc.querySelectorAll('[data-search-pagination] a[href*="page="], .search-pagination a[href*="page="]')) {
            try {
                const page = Number(new URL(link.href, location.origin).searchParams.get('page'));
                if (Number.isFinite(page)) total = Math.max(total, page);
            } catch (_) {}
        }
        return total;
    }

    // Only accept Etsy's real main search-result grid; recommendation modules can also contain cards.
    function mainResultsGrid(root = document) {
        return root.querySelector('[data-search-results] [data-search-results-region] [data-results-grid-container]')
            || root.querySelector('[data-search-results-region] [data-results-grid-container]')
            || null;
    }

    // Multi-search can produce zero results as one native Etsy query while independent searches match.
    // In that case create a temporary grid in the actual search area, never in a recommendation module.
    function liveResultsGrid() {
        const native = mainResultsGrid(document);
        if (native) return native;

        const existingHost = document.querySelector('[data-ebs-results-grid-host]');
        if (existingHost) return existingHost.querySelector('[data-ebs-results-grid]');

        const searchGroup = document.querySelector('.search-listings-group');
        const noResults = document.querySelector('[data-no-results]');
        if (!searchGroup && !noResults?.parentElement) return null;

        const host = document.createElement('div');
        host.setAttribute('data-ebs-results-grid-host', '');
        host.className = 'wt-grid__item-xs-12 wt-pr-xs-1 wt-pl-xs-1 wt-pl-md-3 wt-pr-md-3';

        const grid = document.createElement('ul');
        grid.setAttribute('data-results-grid-container', '');
        grid.setAttribute('data-ebs-results-grid', '');
        grid.className = 'wt-grid wt-grid--block wt-pl-xs-0 tab-reorder-container';
        host.append(grid);

        if (searchGroup) searchGroup.prepend(host);
        else noResults.insertAdjacentElement('afterend', host);
        return grid;
    }

    function cardData(doc, groupIndex, page) {
        const grid = mainResultsGrid(doc);
        if (!grid) return [];
        const out = [];

        Array.from(grid.children).forEach((li, index) => {
            if (!li.matches?.('li')) return;
            const card = li.querySelector('[data-listing-card-v2][data-listing-id], [data-palette-listing-id], [data-listing-id]');
            const id = card?.getAttribute('data-listing-id') || card?.getAttribute('data-palette-listing-id');
            const titleEl = li.querySelector('.v2-listing-card__title');
            const title = titleEl?.getAttribute('title') || titleEl?.textContent?.trim()
                || li.querySelector('[data-listing-link][aria-label]')?.getAttribute('aria-label')
                || li.querySelector('[data-listing-card-listing-image][alt]')?.getAttribute('alt')
                || '';
            if (!id || !title) return;
            out.push({ id, title, html: li.outerHTML, groupIndex, page, index });
        });
        return out;
    }

    function compare(a, b, groupCount) {
        // Interleave comparable Etsy ranks so one large multi-search query does not bury smaller ones.
        if (a.page !== b.page) return a.page - b.page;
        if (groupCount > 1) {
            if (a.index !== b.index) return a.index - b.index;
            return a.groupIndex - b.groupIndex;
        }
        return a.index - b.index;
    }

    function mergeCandidate(map, candidate, groupCount) {
        const old = map.get(candidate.id);
        if (!old || compare(candidate, old, groupCount) < 0) map.set(candidate.id, candidate);
    }

    function sleep(ms, signal) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, ms);
            if (!signal) return;
            const abort = () => {
                clearTimeout(timer);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
        });
    }

    async function fetchDoc(url, signal) {
        const response = await fetch(url, {
            credentials: 'include',
            signal,
            headers: { Accept: 'text/html,application/xhtml+xml' },
        });

        if (!response.ok) {
            const error = new Error(`Etsy returned HTTP ${response.status}`);
            const retryAfter = Number(response.headers.get('Retry-After'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
            throw error;
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const grid = mainResultsGrid(doc);

        if (/captcha|robot check|verify you are human/i.test(html) && !grid) {
            const error = new Error('Etsy returned a verification page');
            error.retryAfterMs = 5000;
            throw error;
        }

        if (!grid && !/no results|0 results/i.test(doc.body?.textContent || '')) {
            throw new Error('Etsy main search results were missing from the response');
        }
        return doc;
    }

    async function runJobs(items, concurrency, worker, signal, onRetry) {
        let pending = items.slice();
        let lastErrors = [];

        // Initial attempt + two automatic retry rounds for failed pages.
        for (let round = 0; round < 3 && pending.length; round += 1) {
            if (round > 0) {
                const hintedWait = Math.max(0, ...lastErrors.map((entry) => entry.error?.retryAfterMs || 0));
                const wait = Math.max(round === 1 ? 700 : 1800, hintedWait);
                onRetry?.();
                await sleep(Math.min(wait, 8000), signal);
            }

            let cursor = 0;
            const failed = [];
            const runners = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
                while (cursor < pending.length) {
                    const item = pending[cursor++];
                    try {
                        await worker(item);
                    } catch (error) {
                        if (error?.name === 'AbortError' || signal.aborted) throw error;
                        failed.push({ item, error });
                    }
                }
            });

            await Promise.all(runners);
            lastErrors = failed;
            pending = failed.map((entry) => entry.item);
        }

        return { pending, errors: lastErrors };
    }

    function baseResultText() {
        const info = document.querySelector('[data-result-info]');
        if (!info) return 'Results';

        // If Etsy replaced the content itself, refresh our cached native count.
        if (!info.querySelector('.ebs-result-text')) {
            const text = (info.textContent || '').replace(/\s+/g, ' ').trim();
            const match = text.match(/(\d[\d.,\s]*\+?)\s*(results|items)/i);
            if (match) info.dataset.ebsBase = `${match[1].replace(/\s+/g, '')} ${match[2].toLowerCase()}`;
        }

        return info.dataset.ebsBase || 'Results';
    }

    function displayedCandidates(queryGroups) {
        return state.candidates
            .filter((item) => matchesTitle(item.title, queryGroups))
            .sort((a, b) => compare(a, b, queryGroups.length));
    }

    function statusCountLabel(status) {
        const count = status?.matches || 0;
        if (cfg.strict) return `${count} strict matches`;
        return `${count} results`;
    }

    function showStatus(status = null) {
        const info = document.querySelector('[data-result-info]');
        if (!info) return;

        const base = baseResultText();
        const groupCount = status?.groupCount || groups(query()).length || 1;
        const sourceLabel = cfg.multi
            ? `${groupCount} ${groupCount === 1 ? 'search' : 'searches'}`
            : base;
        let text = base;

        if (cfg.strict || cfg.multi) {
            if (status?.phase === 'done') {
                text = `${sourceLabel} · ${statusCountLabel(status)}`;
            } else if (status?.phase === 'error') {
                text = `${sourceLabel} · ${statusCountLabel(status)} · scan incomplete`;
            } else if (status?.phase === 'retrying') {
                text = `${sourceLabel} · retrying…`;
                if ((status?.matches || 0) > 0) text += ` ${statusCountLabel(status)}`;
            } else {
                text = `${sourceLabel} · scanning…`;
                if ((status?.matches || 0) > 0) text += ` ${statusCountLabel(status)}`;
            }
        }

        if (info.querySelector('.ebs-result-text')?.textContent === text && info.children.length === 1) return;
        const span = document.createElement('span');
        span.className = 'wt-text-caption wt-text-link-no-underline ebs-result-text';
        span.textContent = text;
        info.replaceChildren(span);
    }

    function abortActiveScan() {
        state.scanId += 1;
        state.controller?.abort();
        state.controller = null;
        state.scanningSig = '';
    }

    function clearAutoRetry(resetCount = true) {
        clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        if (resetCount) {
            state.retrySig = '';
            state.retryCount = 0;
        }
    }

    function stopScan() {
        abortActiveScan();
        clearAutoRetry(true);
    }

    function invalidateCache() {
        state.cacheReady = false;
        state.cacheSig = '';
        state.candidates = [];
        state.renderSig = '';
    }

    function restoreNative() {
        const grid = state.nativeGrid;
        if (state.rendered && grid?.isConnected) {
            if (grid.hasAttribute('data-ebs-results-grid')) {
                grid.closest('[data-ebs-results-grid-host]')?.remove();
            } else {
                grid.innerHTML = state.nativeHTML;
            }
        }

        document.querySelector('[data-ebs-results-grid-host]')?.remove();
        state.rendered = false;
        state.renderSig = '';
        state.nativeGrid = null;
        state.nativeHTML = '';
        document.body?.classList.remove('ebs-results-active');
    }

    function nodeFromHTML(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        const node = template.content.firstElementChild;
        if (!node) return null;

        for (const image of node.querySelectorAll('img')) {
            image.loading = 'lazy';
            image.removeAttribute('fetchpriority');
        }
        for (const video of node.querySelectorAll('video')) {
            video.preload = 'none';
            video.autoplay = false;
        }
        return node;
    }

    function renderResults(sig, queryGroups, phase = 'done') {
        if (!(cfg.strict || cfg.multi) || signature(query(), queryGroups) !== sig) return;
        const grid = liveResultsGrid();
        if (!grid) return scheduleSync(180);

        if (!state.rendered || state.nativeGrid !== grid) {
            state.nativeGrid = grid;
            state.nativeHTML = grid.hasAttribute('data-ebs-results-grid') ? '' : grid.innerHTML;
        }

        const displayed = displayedCandidates(queryGroups);
        const fragment = document.createDocumentFragment();

        if (displayed.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ebs-empty';
            if (phase !== 'done') {
                empty.textContent = 'No matching results have been found yet.';
            } else if (cfg.strict) {
                empty.textContent = 'No listing titles matched this search.';
            } else {
                empty.textContent = 'No results were found across the Multi-search queries.';
            }
            fragment.append(empty);
        } else {
            for (const item of displayed) {
                const node = nodeFromHTML(item.html);
                if (node) fragment.append(node);
            }
        }

        grid.replaceChildren(fragment);
        document.body?.classList.add('ebs-results-active');
        state.rendered = true;
        state.renderSig = sig;
        state.status = {
            phase,
            matches: displayed.length,
            groupCount: queryGroups.length,
        };
        showStatus(state.status);
        scheduleFit();
    }

    function scheduleAutoRetry(sig, queryGroups) {
        if (state.retrySig !== sig) {
            state.retrySig = sig;
            state.retryCount = 0;
        }
        state.retryCount += 1;

        // Three full-scan retries after per-page retries. Then stop rather than hammer Etsy.
        if (state.retryCount > 3) {
            clearTimeout(state.retryTimer);
            state.retryTimer = 0;
            renderResults(sig, queryGroups, 'error');
            return;
        }

        const delays = [2500, 6500, 15000];
        const delay = delays[state.retryCount - 1] || 15000;
        renderResults(sig, queryGroups, 'retrying');
        clearTimeout(state.retryTimer);

        state.retryTimer = setTimeout(() => {
            state.retryTimer = 0;
            if (!(cfg.strict || cfg.multi) || !isSearchPage()) return;
            const raw = query();
            const currentGroups = groups(raw);
            if (signature(raw, currentGroups) !== sig) return;
            invalidateCache();
            scan();
        }, delay);
    }

    async function scan() {
        if (!(cfg.strict || cfg.multi) || !isSearchPage()) return;
        const raw = query();
        if (!raw) return;
        const queryGroups = groups(raw);
        if (!queryGroups.length) return;
        const sig = signature(raw, queryGroups);

        if (state.scanningSig === sig) return showStatus(state.status);
        if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
        if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, queryGroups, 'done');

        if (state.retrySig !== sig) {
            clearAutoRetry(true);
            state.retrySig = sig;
        } else {
            clearTimeout(state.retryTimer);
            state.retryTimer = 0;
        }

        abortActiveScan();
        const myId = state.scanId;
        const controller = new AbortController();
        state.controller = controller;
        state.scanningSig = sig;
        state.status = { phase: 'scanning', matches: 0, groupCount: queryGroups.length };
        showStatus(state.status);

        const map = new Map();
        const firstJobs = queryGroups.map((part, groupIndex) => ({ part, groupIndex, total: 0 }));

        const progress = (phase = 'scanning') => {
            if (myId !== state.scanId) return;
            const count = Array.from(map.values()).filter((item) => matchesTitle(item.title, queryGroups)).length;
            state.status = { phase, matches: count, groupCount: queryGroups.length };
            showStatus(state.status);
        };

        try {
            const firstResult = await runJobs(firstJobs, 2, async (job) => {
                const doc = await fetchDoc(scanUrl(job.part, 1), controller.signal);
                job.total = parseTotalPages(doc);
                for (const item of cardData(doc, job.groupIndex, 1)) {
                    mergeCandidate(map, item, queryGroups.length);
                }
                progress();
            }, controller.signal, () => progress('retrying'));

            const queue = [];
            for (const job of firstJobs) {
                if (!job.total) continue;
                for (let page = 2; page <= job.total; page += 1) {
                    queue.push({ ...job, page });
                }
            }

            const pageResult = await runJobs(queue, 2, async (job) => {
                const doc = await fetchDoc(scanUrl(job.part, job.page), controller.signal);
                for (const item of cardData(doc, job.groupIndex, job.page)) {
                    mergeCandidate(map, item, queryGroups.length);
                }
                progress();
            }, controller.signal, () => progress('retrying'));

            if (myId !== state.scanId || controller.signal.aborted) return;

            const incomplete = firstResult.pending.length > 0 || pageResult.pending.length > 0;
            state.scanningSig = '';
            state.cacheSig = sig;
            state.candidates = Array.from(map.values()).sort((a, b) => compare(a, b, queryGroups.length));
            state.cacheReady = !incomplete;

            if (incomplete) {
                console.warn('[Etsy BetterSearch] Some Etsy result pages still failed after retries. Retrying the scan automatically.');
                scheduleAutoRetry(sig, queryGroups);
            } else {
                clearAutoRetry(true);
                renderResults(sig, queryGroups, 'done');
            }
        } catch (error) {
            if (error?.name === 'AbortError' || myId !== state.scanId) return;
            console.warn('[Etsy BetterSearch] Scan failed:', error);
            state.scanningSig = '';
            state.cacheSig = sig;
            state.candidates = Array.from(map.values()).sort((a, b) => compare(a, b, queryGroups.length));
            state.cacheReady = false;
            scheduleAutoRetry(sig, queryGroups);
        }
    }

    function reapply() {
        if (!(cfg.strict || cfg.multi) || !isSearchPage()) {
            restoreNative();
            return showStatus(null);
        }

        const raw = query();
        const queryGroups = groups(raw);
        const sig = signature(raw, queryGroups);
        if (state.cacheReady && state.cacheSig === sig) renderResults(sig, queryGroups, 'done');
        else scan();
    }

    function updateButtons() {
        const root = document.querySelector('#ebs-controls');
        if (!root) return;

        const keep = root.querySelector('[data-ebs-keep]');
        const strictSplit = root.querySelector('[data-ebs-strict-split]');
        const strict = root.querySelector('[data-ebs-strict]');
        const multiSplit = root.querySelector('[data-ebs-multi-split]');
        const multi = root.querySelector('[data-ebs-multi]');

        keep?.classList.toggle('ebs-active', cfg.keep);
        strictSplit?.classList.toggle('ebs-active', cfg.strict);
        multiSplit?.classList.toggle('ebs-active', cfg.multi);

        if (keep) {
            keep.setAttribute('aria-pressed', String(cfg.keep));
            keep.textContent = cfg.keep ? '✓ Keep filters' : 'Keep filters';
        }
        if (strict) {
            strict.setAttribute('aria-pressed', String(cfg.strict));
            strict.textContent = cfg.strict ? '✓ Strict title' : 'Strict title';
        }
        if (multi) {
            multi.setAttribute('aria-pressed', String(cfg.multi));
            multi.textContent = cfg.multi ? '✓ Multi-search' : 'Multi-search';
        }
    }

    function ensureUI() {
        const list = document.querySelector('[data-search-pathways-ul]');
        if (!list || !isSearchPage()) return;
        let root = list.querySelector('#ebs-controls');

        if (!root) {
            root = document.createElement('li');
            root.id = 'ebs-controls';
            root.className = 'wt-action-group__item';
            root.innerHTML = `
                <button type="button" class="ebs-pill" data-ebs-keep aria-pressed="false">Keep filters</button>

                <span class="ebs-split" data-ebs-strict-split>
                    <button type="button" class="ebs-main" data-ebs-strict aria-pressed="false">Strict title</button>
                    <button type="button" class="ebs-caret" data-ebs-strict-settings aria-label="Strict title settings" aria-expanded="false">▾</button>
                </span>

                <span class="ebs-split" data-ebs-multi-split>
                    <button type="button" class="ebs-main" data-ebs-multi aria-pressed="false">Multi-search</button>
                    <button type="button" class="ebs-caret" data-ebs-multi-help aria-label="Multi-search help" aria-expanded="false">▾</button>
                </span>
            `;

            const showFilters = list.querySelector('.sticky-filters-button-lg');
            if (showFilters) showFilters.insertAdjacentElement('afterend', root);
            else list.prepend(root);

            root.querySelector('[data-ebs-keep]').addEventListener('click', () => {
                save('keep', !cfg.keep);
                if (cfg.keep) saveFilters(filterEntries(new URL(location.href)));
                updateButtons();
                scheduleFit();
            });

            root.querySelector('[data-ebs-strict]').addEventListener('click', () => {
                save('strict', !cfg.strict);
                updateButtons();

                // Strict title and Multi-search are independent. If Multi-search is still active,
                // re-render/re-scan the merged results rather than disabling Multi-search.
                if (cfg.strict || cfg.multi) reapply();
                else {
                    stopScan();
                    restoreNative();
                    showStatus(null);
                }
                scheduleFit();
            });

            root.querySelector('[data-ebs-strict-settings]').addEventListener('click', (event) => {
                event.stopPropagation();
                togglePopup(event.currentTarget, 'strict');
            });

            root.querySelector('[data-ebs-multi]').addEventListener('click', () => {
                switchSearchMode(!cfg.multi);
                scheduleFit();
            });

            root.querySelector('[data-ebs-multi-help]').addEventListener('click', (event) => {
                event.stopPropagation();
                togglePopup(event.currentTarget, 'multi');
            });
        }

        updateButtons();
        observeToolbar();
        scheduleFit();
    }

    function makePopup(type) {
        const popup = document.createElement('div');
        popup.className = 'ebs-popup';
        popup.hidden = true;

        if (type === 'strict') {
            popup.innerHTML = `
                <div class="ebs-popup-title">Title matching</div>
                <label class="ebs-option"><input type="radio" name="ebs-mode" value="phrase"><span>Exact phrase</span></label>
                <label class="ebs-option"><input type="radio" name="ebs-mode" value="all"><span>All words</span></label>
            `;
            popup.addEventListener('change', (event) => {
                const target = event.target;
                if (!target.matches('input[name="ebs-mode"]')) return;
                save('mode', target.value === 'all' ? 'all' : 'phrase');
                reapply();
            });
        } else {
            popup.innerHTML = `
                <div class="ebs-popup-title">Multi-search</div>
                <p class="ebs-guide">
                    Separate independent Etsy searches with commas.
                    <span class="ebs-example">subahibi, saya no uta, persona</span>
                </p>
                <p class="ebs-guide">
                    Put a shared term in <strong>[brackets]</strong> at the start or end to add it to every search.
                    <span class="ebs-example">[charm] subahibi, saya no uta, persona</span>
                    <span class="ebs-example">subahibi, saya no uta, persona [charm]</span>
                </p>
                <p class="ebs-guide">
                    Start brackets put the shared term before each search; end brackets put it after each search.
                </p>
            `;
        }

        document.body.append(popup);
        return popup;
    }

    function syncPopup() {
        if (!state.popup || state.popupType !== 'strict') return;
        const radio = state.popup.querySelector(`input[name="ebs-mode"][value="${cfg.mode}"]`);
        if (radio) radio.checked = true;
    }

    function positionPopup() {
        if (!state.popup || state.popup.hidden || !state.popupAnchor?.isConnected) return;
        const anchor = state.popupAnchor.getBoundingClientRect();
        const box = state.popup.getBoundingClientRect();
        const pad = 8;

        let left = anchor.right - box.width;
        left = Math.max(pad, Math.min(left, innerWidth - box.width - pad));

        let top = anchor.bottom + 8;
        if (top + box.height > innerHeight - pad) top = anchor.top - box.height - 8;

        state.popup.style.left = `${Math.round(left)}px`;
        state.popup.style.top = `${Math.round(Math.max(pad, top))}px`;
    }

    function togglePopup(anchor, type) {
        const isSameOpen = state.popup && !state.popup.hidden && state.popupType === type && state.popupAnchor === anchor;
        closePopup();
        if (isSameOpen) return;

        state.popup = makePopup(type);
        state.popupType = type;
        state.popupAnchor = anchor;
        state.popup.hidden = false;
        anchor.setAttribute('aria-expanded', 'true');

        syncPopup();
        requestAnimationFrame(positionPopup);
    }

    function closePopup() {
        if (!state.popup) return;
        state.popupAnchor?.setAttribute('aria-expanded', 'false');
        state.popup.remove();
        state.popup = null;
        state.popupAnchor = null;
        state.popupType = '';
    }

    function recommendationWrappers() {
        return Array.from(document.querySelectorAll('[data-pathways-api-spec] button[data-clg-id="WtSelectableChip"]'))
            .map((button) => button.parentElement || button);
    }

    function fitRecommendations() {
        const inner = document.querySelector('[data-search-pathways-inner]');
        if (!inner || !document.querySelector('#ebs-controls')) return;

        const wrappers = recommendationWrappers();
        for (const wrapper of wrappers) wrapper.style.removeProperty('display');

        requestAnimationFrame(() => {
            for (let i = wrappers.length - 1; i >= 0 && inner.scrollWidth > inner.clientWidth + 2; i -= 1) {
                wrappers[i].style.display = 'none';
            }
        });
    }

    function scheduleFit() {
        clearTimeout(state.fitTimer);
        state.fitTimer = setTimeout(fitRecommendations, 80);
    }

    function observeToolbar() {
        const inner = document.querySelector('[data-search-pathways-inner]');
        if (!inner || state.observedInner === inner) return;

        state.resizeObserver?.disconnect();
        state.resizeObserver = new ResizeObserver(scheduleFit);
        state.resizeObserver.observe(inner);
        state.observedInner = inner;
    }

    function scheduleSync(delay = 180) {
        clearTimeout(state.timer);
        state.timer = setTimeout(sync, delay);
    }

    function sync() {
        const urlChanged = location.href !== state.lastUrl;
        state.lastUrl = location.href;

        if (!isSearchPage()) {
            stopScan();
            closePopup();
            document.body?.classList.remove('ebs-results-active');
            return;
        }

        if (maybeRestoreFilters()) return;
        captureFilters();
        seedQueryState();

        // When Etsy/navigation changes the actual query, remember it for the currently active mode.
        if (urlChanged && !state.switchingMode) saveActiveQuery();
        state.switchingMode = false;

        ensureUI();

        if (!(cfg.strict || cfg.multi)) {
            restoreNative();
            showStatus(null);
            return;
        }

        const raw = query();
        if (!raw) return;
        const queryGroups = groups(raw);
        if (!queryGroups.length) {
            restoreNative();
            showStatus(null);
            return;
        }

        const sig = signature(raw, queryGroups);
        if (state.rendered && state.renderSig === sig) return showStatus(state.status);
        if (state.scanningSig === sig) return showStatus(state.status);
        if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
        if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, queryGroups, 'done');
        scan();
    }

    document.addEventListener('submit', (event) => {
        const form = event.target?.closest?.('#gnav-search');
        if (!form) return;

        const input = form.querySelector('#global-enhancements-search-query, [data-search-input], input[name="search_query"]');
        const q = input?.value?.trim();
        if (!q) return;

        // Always remember the query in the currently active Single/Multi slot.
        saveActiveQuery(q);

        if (!cfg.keep) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(searchUrl(q, cfg.filters).href);
    }, true);

    document.addEventListener('click', (event) => {
        if (state.popup && !state.popup.contains(event.target) && !state.popupAnchor?.contains(event.target)) {
            closePopup();
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closePopup();
    });

    window.addEventListener('resize', () => {
        positionPopup();
        scheduleFit();
    }, { passive: true });

    window.addEventListener('scroll', positionPopup, { passive: true, capture: true });
    window.addEventListener('popstate', () => scheduleSync(50));

    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        abortActiveScan();
        clearAutoRetry(true);
        invalidateCache();
        state.rendered = false;
        state.nativeGrid = null;
        state.nativeHTML = '';
        document.querySelector('[data-ebs-results-grid-host]')?.remove();
        scheduleSync(50);
    });

    window.addEventListener('pagehide', () => abortActiveScan());

    // Etsy replaces search fragments without full page loads. Debounce so our own rendering
    // does not create a scan loop.
    new MutationObserver(() => scheduleSync(220)).observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Catch Etsy SPA URL changes even when they do not emit popstate.
    for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        history[method] = function (...args) {
            const result = original.apply(this, args);
            scheduleSync(50);
            return result;
        };
    }

    setInterval(() => {
        if (location.href !== state.lastUrl) scheduleSync(50);
    }, 700);

    seedQueryState();
    sync();
})();