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

function mainResultsGrid(root = document) {
    return root.querySelector('[data-search-results] [data-search-results-region] [data-results-grid-container]')
        || root.querySelector('[data-search-results-region] [data-results-grid-container]')
        || null;
}

function liveResultsGrid() {
    const native = mainResultsGrid(document);
    if (native) return native;
    const existing = document.querySelector('[data-ebs-results-grid-host]');
    if (existing) return existing.querySelector('[data-ebs-results-grid]');
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

function listingIdFromNode(node) {
    const card = node?.querySelector?.('[data-listing-card-v2][data-listing-id], [data-palette-listing-id], [data-listing-id]');
    return card?.getAttribute('data-listing-id') || card?.getAttribute('data-palette-listing-id') || '';
}

function titleFromNode(node) {
    const titleEl = node?.querySelector?.('.v2-listing-card__title');
    return titleEl?.getAttribute('title') || titleEl?.textContent?.trim()
        || node?.querySelector?.('[data-listing-link][aria-label]')?.getAttribute('aria-label')
        || node?.querySelector?.('[data-listing-card-listing-image][alt]')?.getAttribute('alt')
        || '';
}

function listingUrlFromNode(node) {
    const anchor = node?.querySelector?.('a[href*="/listing/"]');
    if (!anchor?.href) return '';
    try {
        const url = new URL(anchor.href, location.origin);
        url.hash = '';
        return url.href;
    } catch (_) {
        return anchor.href;
    }
}

function captureLiveNativeNodes() {
    const grid = mainResultsGrid(document);
    const map = new Map();
    if (!grid) return map;
    for (const node of Array.from(grid.children)) {
        if (!node.matches?.('li')) continue;
        const idValue = listingIdFromNode(node);
        if (idValue) map.set(idValue, node);
    }
    return map;
}

function cardData(doc, groupIndex, page, branchId = null) {
    const grid = mainResultsGrid(doc);
    if (!grid) return [];
    const out = [];
    Array.from(grid.children).forEach((li, index) => {
        if (!li.matches?.('li')) return;
        const idValue = listingIdFromNode(li);
        const title = titleFromNode(li);
        if (!idValue || !title) return;
        out.push({
            id: idValue,
            title,
            url: listingUrlFromNode(li),
            html: li.outerHTML,
            groupIndex,
            page,
            index,
            branchIds: branchId ? new Set([branchId]) : new Set(),
        });
    });
    return out;
}

function mergeCandidate(map, candidate) {
    const old = map.get(candidate.id);
    if (!old) {
        map.set(candidate.id, candidate);
        return;
    }
    for (const branchId of candidate.branchIds || []) old.branchIds.add(branchId);
    if (compareCandidates(candidate, old) < 0) {
        const ids = old.branchIds;
        Object.assign(old, candidate);
        old.branchIds = ids;
    }
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
    const current = (info.textContent || '').replace(/\s+/g, ' ').trim();
    if (!info.querySelector('.ebs-result-text')) {
        const match = current.match(/(\d[\d.,\s]*\+?)\s*(results|items)/i);
        if (match) info.dataset.ebsBase = `${match[1].replace(/\s+/g, '')} ${match[2].toLowerCase()}`;
    }
    return info.dataset.ebsBase || 'Results';
}

function showStatus(status = null) {
    const info = document.querySelector('[data-result-info]');
    if (!info) return;
    const base = baseResultText();
    let text = base;
    if (cfg.multi) {
        const count = status?.searchCount ?? compileMultiPlan().searches.length;
        const label = `${count} ${count === 1 ? 'search' : 'searches'}`;
        if (status?.phase === 'done') text = `${label} · ${status.matches || 0} matches`;
        else if (status?.phase === 'error') text = `${label} · ${status.matches || 0} matches · scan incomplete`;
        else if (status?.phase === 'retrying') text = `${label} · retrying…${status.matches ? ` ${status.matches} matches` : ''}`;
        else text = `${label} · scanning…${status?.matches ? ` ${status.matches} matches` : ''}`;
    } else if (cfg.strict) {
        if (status?.phase === 'done') text = `${base} · ${status.matches || 0} strict matches`;
        else if (status?.phase === 'error') text = `${base} · ${status.matches || 0} strict matches · scan incomplete`;
        else if (status?.phase === 'retrying') text = `${base} · retrying…${status.matches ? ` ${status.matches} matches` : ''}`;
        else text = `${base} · scanning…${status?.matches ? ` ${status.matches} matches` : ''}`;
    }
    if (info.querySelector('.ebs-result-text')?.textContent === text && info.children.length === 1) return;
    const span = document.createElement('span');
    span.className = 'wt-text-caption wt-text-link-no-underline ebs-result-text';
    span.textContent = text;
    info.replaceChildren(span);
}

function ensureScanPanel() {
    let panel = document.querySelector('[data-ebs-scan-panel]');
    if (panel) return panel;

    const grid = mainResultsGrid(document);
    const searchGroup = document.querySelector('.search-listings-group');
    const noResults = document.querySelector('[data-no-results]');
    const host = grid?.parentElement || searchGroup || noResults?.parentElement;
    if (!host) return null;

    panel = document.createElement('div');
    panel.className = 'ebs-scan-panel';
    panel.dataset.ebsScanPanel = '';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
        <span class="ebs-scan-spinner" aria-hidden="true"></span>
        <span class="ebs-scan-copy">
            <strong data-ebs-scan-title>Scanning Etsy results…</strong>
            <span data-ebs-scan-detail>Preparing search…</span>
        </span>`;

    if (grid?.parentElement === host) host.insertBefore(panel, grid);
    else if (searchGroup) searchGroup.prepend(panel);
    else noResults.insertAdjacentElement('afterend', panel);
    return panel;
}

function updateScanPanel(status = {}) {
    const panel = ensureScanPanel();
    if (!panel) return;
    document.body?.classList.add('ebs-scan-active');

    const title = panel.querySelector('[data-ebs-scan-title]');
    const detail = panel.querySelector('[data-ebs-scan-detail]');
    if (title) title.textContent = status.phase === 'retrying' ? 'Retrying Etsy scan…' : 'Scanning Etsy results…';

    const searchCount = Math.max(1, Number(status.searchCount) || 1);
    const readySearches = Math.max(0, Number(status.readySearches) || 0);
    const completedPages = Math.max(0, Number(status.completedPages) || 0);
    const totalPages = Math.max(0, Number(status.totalPages) || 0);
    const matches = Math.max(0, Number(status.matches) || 0);

    let progress;
    if (readySearches < searchCount) {
        progress = searchCount > 1
            ? `Preparing searches ${readySearches} / ${searchCount}`
            : 'Preparing search';
        if (completedPages) progress += ` · ${completedPages} ${completedPages === 1 ? 'page' : 'pages'} checked`;
    } else if (totalPages > 0) {
        progress = `Scanning pages ${Math.min(completedPages, totalPages)} / ${totalPages}`;
    } else {
        progress = 'Scanning result pages';
    }
    progress += ` · ${matches} ${matches === 1 ? 'match' : 'matches'} found`;
    if (detail) detail.textContent = progress;
}

function clearScanPanel() {
    document.querySelector('[data-ebs-scan-panel]')?.remove();
    document.body?.classList.remove('ebs-scan-active');
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
    clearScanPanel();
}

function invalidateCache() {
    state.cacheReady = false;
    state.cacheSig = '';
    state.candidates = [];
    state.renderSig = '';
}

function restoreNative() {
    clearScanPanel();
    const grid = state.nativeGrid;
    if (state.rendered && grid?.isConnected) {
        if (grid.hasAttribute('data-ebs-results-grid')) grid.closest('[data-ebs-results-grid-host]')?.remove();
        else if (state.nativeOrder.length) grid.replaceChildren(...state.nativeOrder);
        else grid.innerHTML = state.nativeHTML;
    }
    document.querySelector('[data-ebs-results-grid-host]')?.remove();
    state.rendered = false;
    state.renderSig = '';
    state.nativeGrid = null;
    state.nativeHTML = '';
    state.nativeNodes = new Map();
    state.nativeOrder = [];
    document.body?.classList.remove('ebs-results-active');
}

function nodeFromCandidate(item) {
    const live = state.nativeNodes.get(item.id);
    if (live) {
        live.removeAttribute('data-ebs-transplanted');
        live.setAttribute('data-ebs-listing-id', item.id);
        return live;
    }
    const template = document.createElement('template');
    template.innerHTML = item.html.trim();
    const node = template.content.firstElementChild;
    if (!node) return null;
    node.setAttribute('data-ebs-transplanted', '1');
    node.setAttribute('data-ebs-listing-id', item.id);
    if (item.url) node.setAttribute('data-ebs-listing-url', item.url);
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

function renderResults(sig, phase = 'done') {
    if (!(cfg.multi || cfg.strict) || signature() !== sig) return;
    clearScanPanel();
    const grid = liveResultsGrid();
    if (!grid) return scheduleSync(180);
    if (!state.rendered || state.nativeGrid !== grid) {
        state.nativeGrid = grid;
        state.nativeHTML = grid.hasAttribute('data-ebs-results-grid') ? '' : grid.innerHTML;
        state.nativeOrder = grid.hasAttribute('data-ebs-results-grid') ? [] : Array.from(grid.children);
        state.nativeNodes = captureLiveNativeNodes();
    }
    const matched = matchedCandidates();
    const fragment = document.createDocumentFragment();
    if (matched.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'ebs-empty';
        empty.textContent = phase === 'done' ? 'No listing titles matched these rules.' : 'No matching titles have been found yet.';
        fragment.append(empty);
    } else {
        for (const item of matched) {
            const node = nodeFromCandidate(item);
            if (node) fragment.append(node);
        }
    }
    grid.replaceChildren(fragment);
    document.body?.classList.add('ebs-results-active');
    state.rendered = true;
    state.renderSig = sig;
    const searchCount = cfg.multi ? compileMultiPlan().searches.length : 1;
    state.status = { phase, matches: matched.length, searchCount };
    showStatus(state.status);
    scheduleFit();
}

function scheduleAutoRetry(sig) {
    if (state.retrySig !== sig) {
        state.retrySig = sig;
        state.retryCount = 0;
    }
    state.retryCount += 1;
    if (state.retryCount > 3) {
        clearTimeout(state.retryTimer);
        state.retryTimer = 0;
        clearScanPanel();
        renderResults(sig, 'error');
        return;
    }
    const delays = [2500, 6500, 15000];
    const delay = delays[state.retryCount - 1] || 15000;
    const searchCount = cfg.multi ? compileMultiPlan().searches.length : 1;
    state.status = {
        ...state.status,
        phase: 'retrying',
        searchCount,
        matches: state.status?.matches || 0,
    };
    showStatus(state.status);
    updateScanPanel(state.status);
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => {
        state.retryTimer = 0;
        if (!(cfg.multi || cfg.strict) || !isSearchPage() || signature() !== sig) return;
        invalidateCache();
        scan();
    }, delay);
}
