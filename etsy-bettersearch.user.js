// ==UserScript==
// @name         Etsy BetterSearch
// @namespace    https://github.com/juliekeygen-netizen
// @version      0.1.0
// @description  Adds strict title matching and persistent Etsy filters while keeping Etsy's native search UI.
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
        comma: 'etsy-bettersearch.comma',
        keep: 'etsy-bettersearch.keepFilters',
        filters: 'etsy-bettersearch.savedFilters',
    };

    const cfg = {
        strict: Boolean(GM_getValue(KEY.strict, false)),
        mode: GM_getValue(KEY.mode, 'all') === 'phrase' ? 'phrase' : 'all',
        comma: Boolean(GM_getValue(KEY.comma, false)),
        keep: Boolean(GM_getValue(KEY.keep, false)),
        filters: readSavedFilters(),
    };

    const TEMP_PARAMS = new Set([
        'q', 'search_query', 'page', 'ref', 'page_type', 'promoted', 'sorted',
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
        resizeObserver: null,
        observedInner: null,
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
        .ebs-main, .ebs-caret, .ebs-keep {
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
        .ebs-main { padding: 0 10px 0 12px; background: transparent; color: inherit; }
        .ebs-caret {
            width: 30px;
            padding: 0;
            border-left: 1px solid rgba(34,34,34,.14);
            background: transparent;
            color: inherit;
        }
        .ebs-split.ebs-active .ebs-caret { border-left-color: rgba(255,255,255,.28); }
        .ebs-keep {
            padding: 0 12px;
            border-radius: 999px;
            background: #f5f5f1;
            color: #222;
        }
        .ebs-keep.ebs-active { background: #222; color: #fff; }
        .ebs-main:hover, .ebs-caret:hover, .ebs-keep:hover { filter: brightness(.96); }
        .ebs-popup {
            position: fixed;
            z-index: 100000;
            width: 228px;
            box-sizing: border-box;
            padding: 14px;
            border: 1px solid rgba(34,34,34,.14);
            border-radius: 12px;
            background: #fff;
            color: #222;
            box-shadow: 0 6px 24px rgba(34,34,34,.16);
            font: 14px/1.35 inherit;
        }
        .ebs-popup-title { margin: 0 0 9px; font-weight: 600; }
        .ebs-option {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 30px;
            cursor: pointer;
            user-select: none;
        }
        .ebs-option input { width: 16px; height: 16px; margin: 0; accent-color: #222; }
        .ebs-divider { height: 1px; margin: 9px 0; background: rgba(34,34,34,.10); }
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
        body.ebs-strict-active [data-appears-component-name="search_pagination"] {
            display: none !important;
        }
        @media (max-width: 899px) {
            #ebs-controls { gap: 4px; margin-right: 4px; }
            .ebs-main, .ebs-caret, .ebs-keep { font-size: 12px; }
            .ebs-main, .ebs-keep { padding-left: 10px; padding-right: 10px; }
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

    function groups(raw) {
        const values = (cfg.comma ? raw.split(',') : [raw]).map((v) => v.trim()).filter(Boolean);
        return values.length ? values : [raw.trim()].filter(Boolean);
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

    function matchesTitle(title, queryGroups) {
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
        return `${location.pathname}|${queryGroups.join('\u241E')}|${filterSignature(filterEntries(new URL(location.href)))}`;
    }

    function parseTotalPages(doc) {
        let total = 1;
        for (const script of doc.querySelectorAll('script')) {
            const text = script.textContent || '';
            if (!text.includes('initial_total_pages')) continue;
            const m = text.match(/"initial_total_pages"\s*:\s*(\d+)/);
            if (m) total = Math.max(total, Number(m[1]) || 1);
        }
        for (const link of doc.querySelectorAll('[data-search-pagination] a[href*="page="], .search-pagination a[href*="page="]')) {
            try {
                const p = Number(new URL(link.href, location.origin).searchParams.get('page'));
                if (Number.isFinite(p)) total = Math.max(total, p);
            } catch (_) {}
        }
        return total;
    }

    function cardData(doc, groupIndex, page) {
        const grid = doc.querySelector('[data-results-grid-container]');
        if (!grid) return [];
        const out = [];

        Array.from(grid.children).forEach((li, index) => {
            if (!li.matches?.('li')) return;
            const card = li.querySelector('[data-listing-card-v2][data-listing-id], [data-listing-id]');
            const id = card?.getAttribute('data-listing-id');
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

    async function fetchDoc(url, signal) {
        const response = await fetch(url, {
            credentials: 'include',
            signal,
            headers: { Accept: 'text/html,application/xhtml+xml' },
        });
        if (!response.ok) throw new Error(`Etsy returned HTTP ${response.status}`);
        const html = await response.text();
        if (/captcha|robot check|verify you are human/i.test(html) && !html.includes('data-results-grid-container')) {
            throw new Error('Etsy returned a verification page');
        }
        return new DOMParser().parseFromString(html, 'text/html');
    }

    async function pool(items, concurrency, worker) {
        let cursor = 0;
        const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (cursor < items.length) {
                const item = items[cursor++];
                await worker(item);
            }
        });
        await Promise.all(runners);
    }

    function baseResultText() {
        const info = document.querySelector('[data-result-info]');
        if (!info) return 'Results';
        if (info.dataset.ebsBase) return info.dataset.ebsBase;
        const text = (info.textContent || '').replace(/\s+/g, ' ').trim();
        const m = text.match(/(\d[\d.,\s]*\+?)\s*(results|items)/i);
        const base = m ? `${m[1].replace(/\s+/g, '')} ${m[2].toLowerCase()}` : 'Results';
        info.dataset.ebsBase = base;
        return base;
    }

    function showStatus(status = null) {
        const info = document.querySelector('[data-result-info]');
        if (!info) return;
        const base = baseResultText();
        let text = base;

        if (cfg.strict) {
            if (status?.phase === 'done') text = `${base} · ${status.matches || 0} strict matches`;
            else if (status?.phase === 'error') text = `${base} · ${status.matches || 0} strict matches · scan incomplete`;
            else {
                text = `${base} · scanning…`;
                if ((status?.matches || 0) > 0) text += ` ${status.matches} matches`;
            }
        }

        if (info.querySelector('.ebs-result-text')?.textContent === text && info.children.length === 1) return;
        const span = document.createElement('span');
        span.className = 'wt-text-caption wt-text-link-no-underline ebs-result-text';
        span.textContent = text;
        info.replaceChildren(span);
    }

    function stopScan() {
        state.scanId += 1;
        state.controller?.abort();
        state.controller = null;
        state.scanningSig = '';
    }

    function restoreNative() {
        const grid = document.querySelector('[data-results-grid-container]');
        if (state.rendered && grid && state.nativeGrid === grid) grid.innerHTML = state.nativeHTML;
        state.rendered = false;
        state.renderSig = '';
        document.body?.classList.remove('ebs-strict-active');
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

    function renderStrict(sig, queryGroups, incomplete = false) {
        if (!cfg.strict || signature(query(), queryGroups) !== sig) return;
        const grid = document.querySelector('[data-results-grid-container]');
        if (!grid) return scheduleSync(180);

        if (!state.rendered || state.nativeGrid !== grid) {
            state.nativeGrid = grid;
            state.nativeHTML = grid.innerHTML;
        }

        const matched = state.candidates
            .filter((item) => matchesTitle(item.title, queryGroups))
            .sort((a, b) => compare(a, b, queryGroups.length));

        const fragment = document.createDocumentFragment();
        if (matched.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'ebs-empty';
            empty.textContent = 'No listing titles matched this search.';
            fragment.append(empty);
        } else {
            for (const item of matched) {
                const node = nodeFromHTML(item.html);
                if (node) fragment.append(node);
            }
        }

        grid.replaceChildren(fragment);
        document.body?.classList.add('ebs-strict-active');
        state.rendered = true;
        state.renderSig = sig;
        state.status = { phase: incomplete ? 'error' : 'done', matches: matched.length };
        showStatus(state.status);
        scheduleFit();
    }

    async function scan() {
        if (!cfg.strict || !isSearchPage()) return;
        const raw = query();
        if (!raw) return;
        const queryGroups = groups(raw);
        const sig = signature(raw, queryGroups);

        if (state.scanningSig === sig) return showStatus(state.status);
        if (state.cacheReady && state.cacheSig === sig) return renderStrict(sig, queryGroups, false);

        stopScan();
        const myId = state.scanId;
        const controller = new AbortController();
        state.controller = controller;
        state.scanningSig = sig;
        state.status = { phase: 'scanning', matches: 0 };
        showStatus(state.status);

        const map = new Map();
        const first = queryGroups.map((part, groupIndex) => ({ part, groupIndex, total: 1 }));
        let incomplete = false;

        const progress = () => {
            if (myId !== state.scanId) return;
            const matchCount = Array.from(map.values()).filter((item) => matchesTitle(item.title, queryGroups)).length;
            state.status = { phase: 'scanning', matches: matchCount };
            showStatus(state.status);
        };

        try {
            await pool(first, 2, async (job) => {
                const doc = await fetchDoc(scanUrl(job.part, 1), controller.signal);
                job.total = parseTotalPages(doc);
                for (const item of cardData(doc, job.groupIndex, 1)) mergeCandidate(map, item, queryGroups.length);
                progress();
            });

            const queue = [];
            for (const job of first) {
                for (let page = 2; page <= job.total; page += 1) queue.push({ ...job, page });
            }

            await pool(queue, 2, async (job) => {
                const doc = await fetchDoc(scanUrl(job.part, job.page), controller.signal);
                for (const item of cardData(doc, job.groupIndex, job.page)) mergeCandidate(map, item, queryGroups.length);
                progress();
            });
        } catch (error) {
            if (error?.name === 'AbortError' || myId !== state.scanId) return;
            incomplete = true;
            console.warn('[Etsy BetterSearch] Scan stopped early:', error);
        }

        if (myId !== state.scanId || controller.signal.aborted) return;
        state.scanningSig = '';
        state.cacheSig = sig;
        state.candidates = Array.from(map.values()).sort((a, b) => compare(a, b, queryGroups.length));
        state.cacheReady = true;
        renderStrict(sig, queryGroups, incomplete);
    }

    function reapply() {
        if (!cfg.strict || !isSearchPage()) return showStatus(null);
        const raw = query();
        const queryGroups = groups(raw);
        const sig = signature(raw, queryGroups);
        if (state.cacheReady && state.cacheSig === sig) renderStrict(sig, queryGroups, false);
        else scan();
    }

    function updateButtons() {
        const root = document.querySelector('#ebs-controls');
        if (!root) return;
        const split = root.querySelector('[data-ebs-split]');
        const strict = root.querySelector('[data-ebs-strict]');
        const keep = root.querySelector('[data-ebs-keep]');
        split?.classList.toggle('ebs-active', cfg.strict);
        keep?.classList.toggle('ebs-active', cfg.keep);
        if (strict) {
            strict.setAttribute('aria-pressed', String(cfg.strict));
            strict.textContent = cfg.strict ? '✓ Strict title' : 'Strict title';
        }
        if (keep) {
            keep.setAttribute('aria-pressed', String(cfg.keep));
            keep.textContent = cfg.keep ? '✓ Keep filters' : 'Keep filters';
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
                <span class="ebs-split" data-ebs-split>
                    <button type="button" class="ebs-main" data-ebs-strict aria-pressed="false">Strict title</button>
                    <button type="button" class="ebs-caret" data-ebs-settings aria-label="Strict title settings" aria-expanded="false">▾</button>
                </span>
                <button type="button" class="ebs-keep" data-ebs-keep aria-pressed="false">Keep filters</button>
            `;
            const showFilters = list.querySelector('.sticky-filters-button-lg');
            if (showFilters) showFilters.insertAdjacentElement('afterend', root);
            else list.prepend(root);

            root.querySelector('[data-ebs-strict]').addEventListener('click', () => {
                save('strict', !cfg.strict);
                updateButtons();
                if (cfg.strict) reapply();
                else {
                    stopScan();
                    restoreNative();
                    showStatus(null);
                }
                scheduleFit();
            });

            root.querySelector('[data-ebs-settings]').addEventListener('click', (event) => {
                event.stopPropagation();
                togglePopup(event.currentTarget);
            });

            root.querySelector('[data-ebs-keep]').addEventListener('click', () => {
                save('keep', !cfg.keep);
                if (cfg.keep) saveFilters(filterEntries(new URL(location.href)));
                updateButtons();
                scheduleFit();
            });
        }

        updateButtons();
        observeToolbar();
        scheduleFit();
    }

    function makePopup() {
        const popup = document.createElement('div');
        popup.className = 'ebs-popup';
        popup.hidden = true;
        popup.innerHTML = `
            <div class="ebs-popup-title">Title matching</div>
            <label class="ebs-option"><input type="radio" name="ebs-mode" value="all"><span>All words</span></label>
            <label class="ebs-option"><input type="radio" name="ebs-mode" value="phrase"><span>Exact phrase</span></label>
            <div class="ebs-divider"></div>
            <label class="ebs-option"><input type="checkbox" data-ebs-comma><span>Comma-separated alternatives</span></label>
        `;
        document.body.append(popup);

        popup.addEventListener('change', (event) => {
            const target = event.target;
            if (target.matches('input[name="ebs-mode"]')) {
                save('mode', target.value === 'phrase' ? 'phrase' : 'all');
                reapply();
            } else if (target.matches('[data-ebs-comma]')) {
                save('comma', target.checked);
                state.cacheReady = false;
                state.cacheSig = '';
                state.candidates = [];
                reapply();
            }
        });
        return popup;
    }

    function syncPopup() {
        if (!state.popup) return;
        const radio = state.popup.querySelector(`input[name="ebs-mode"][value="${cfg.mode}"]`);
        if (radio) radio.checked = true;
        const comma = state.popup.querySelector('[data-ebs-comma]');
        if (comma) comma.checked = cfg.comma;
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

    function togglePopup(anchor) {
        if (!state.popup) state.popup = makePopup();
        const open = state.popup.hidden || state.popupAnchor !== anchor;
        state.popupAnchor = anchor;
        state.popup.hidden = !open;
        anchor.setAttribute('aria-expanded', String(open));
        if (open) {
            syncPopup();
            requestAnimationFrame(positionPopup);
        }
    }

    function closePopup() {
        if (!state.popup || state.popup.hidden) return;
        state.popup.hidden = true;
        state.popupAnchor?.setAttribute('aria-expanded', 'false');
        state.popupAnchor = null;
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
        state.lastUrl = location.href;
        if (!isSearchPage()) {
            stopScan();
            closePopup();
            document.body?.classList.remove('ebs-strict-active');
            return;
        }

        if (maybeRestoreFilters()) return;
        captureFilters();
        ensureUI();

        if (!cfg.strict) {
            restoreNative();
            showStatus(null);
            return;
        }

        const raw = query();
        if (!raw) return;
        const queryGroups = groups(raw);
        const sig = signature(raw, queryGroups);
        if (state.rendered && state.renderSig === sig) return showStatus(state.status);
        if (state.scanningSig === sig) return showStatus(state.status);
        if (state.cacheReady && state.cacheSig === sig) return renderStrict(sig, queryGroups, false);
        scan();
    }

    document.addEventListener('submit', (event) => {
        if (!cfg.keep) return;
        const form = event.target?.closest?.('#gnav-search');
        if (!form) return;
        const input = form.querySelector('#global-enhancements-search-query, [data-search-input], input[name="search_query"]');
        const q = input?.value?.trim();
        if (!q) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(searchUrl(q, cfg.filters).href);
    }, true);

    document.addEventListener('click', (event) => {
        if (state.popup && !state.popup.hidden && !state.popup.contains(event.target) && !state.popupAnchor?.contains(event.target)) {
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
    window.addEventListener('popstate', () => scheduleSync(100));

    new MutationObserver(() => scheduleSync(220)).observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
        if (location.href !== state.lastUrl) scheduleSync(100);
    }, 700);

    sync();
})();