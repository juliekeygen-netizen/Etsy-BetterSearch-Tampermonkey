async function scan() {
    if (!(cfg.multi || cfg.strict) || !isSearchPage()) return;
    if (cfg.multi) ensureRulesSeeded();
    const sig = signature();
    // Never start a new scan from a grid we reconstructed ourselves. Restore Etsy's
    // original nodes first so native listeners stay native and transplanted cards keep
    // their explicit fallback behavior.
    if (state.rendered && state.renderSig !== sig) restoreNative();
    if (state.scanningSig === sig) return showStatus(state.status);
    if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
    if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, 'done');

    const plan = cfg.multi ? compileMultiPlan() : null;
    const searches = cfg.multi
        ? plan.searches
        : [{ id: 'single', query: query(), branchRuleId: null }];
    if (!searches.length || searches.every((entry) => !entry.query)) {
        state.candidates = [];
        state.cacheReady = true;
        state.cacheSig = sig;
        return renderResults(sig, 'done');
    }

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
    state.nativeNodes = captureLiveNativeNodes();

    const SCAN_CONCURRENCY = 3;
    const map = new Map();
    let completedPages = 0;
    let totalPages = 0;
    let readySearches = 0;
    let progressTimer = 0;
    let lastProgressAt = 0;
    let pendingPhase = 'scanning';

    const countMatches = () => {
        let count = 0;
        if (cfg.multi) {
            for (const item of map.values()) if (multiCandidateMatches(item, plan)) count += 1;
        } else {
            for (const item of map.values()) if (strictMatchesTitle(item.title)) count += 1;
        }
        return count;
    };

    const publishProgress = () => {
        if (myId !== state.scanId || controller.signal.aborted) return;
        lastProgressAt = performance.now();
        const status = {
            phase: pendingPhase,
            matches: countMatches(),
            searchCount: searches.length,
            readySearches,
            completedPages,
            totalPages,
        };
        state.status = status;
        showStatus(status);
        updateScanPanel(status);
    };

    const progress = (phase = 'scanning', force = false) => {
        if (myId !== state.scanId || controller.signal.aborted) return;
        pendingPhase = phase;
        const elapsed = performance.now() - lastProgressAt;
        if (force || elapsed >= 120) {
            clearTimeout(progressTimer);
            progressTimer = 0;
            publishProgress();
            return;
        }
        if (!progressTimer) {
            progressTimer = setTimeout(() => {
                progressTimer = 0;
                publishProgress();
            }, Math.max(20, 120 - elapsed));
        }
    };

    state.status = {
        phase: 'scanning',
        matches: 0,
        searchCount: searches.length,
        readySearches: 0,
        completedPages: 0,
        totalPages: 0,
    };
    showStatus(state.status);
    updateScanPanel(state.status);

    const firstJobs = searches.map((search, groupIndex) => ({
        part: search.query,
        branchId: search.branchRuleId,
        groupIndex,
        total: 0,
    }));

    try {
        const currentUrl = new URL(location.href);
        const currentPage = Math.max(1, Number(currentUrl.searchParams.get('page')) || 1);
        const canReuseLivePage = searches.length === 1
            && normalize(searches[0].query) === normalize(query())
            && Boolean(mainResultsGrid(document));

        let firstResult;
        if (canReuseLivePage) {
            const job = firstJobs[0];
            job.total = parseTotalPages(document);
            totalPages = job.total;
            readySearches = 1;
            completedPages = 1;
            for (const item of cardData(document, job.groupIndex, currentPage, job.branchId)) mergeCandidate(map, item);
            progress('scanning', true);
            firstResult = { pending: [], errors: [] };
        } else {
            firstResult = await runJobs(firstJobs, SCAN_CONCURRENCY, async (job) => {
                const doc = await fetchDoc(scanUrl(job.part, 1), controller.signal);
                job.total = parseTotalPages(doc);
                totalPages += job.total;
                readySearches += 1;
                completedPages += 1;
                for (const item of cardData(doc, job.groupIndex, 1, job.branchId)) mergeCandidate(map, item);
                progress();
            }, controller.signal, () => progress('retrying', true));
        }

        // Round-robin pages from the different searches. This gives useful progressive
        // results across every branch instead of finishing one large query before the next.
        const queue = [];
        const maxPages = Math.max(0, ...firstJobs.map((job) => job.total || 0));
        for (let page = 1; page <= maxPages; page += 1) {
            for (const job of firstJobs) {
                if (!job.total || page > job.total) continue;
                if (!canReuseLivePage && page === 1) continue;
                if (canReuseLivePage && job.groupIndex === 0 && page === currentPage) continue;
                queue.push({ ...job, page });
            }
        }

        const pageResult = await runJobs(queue, SCAN_CONCURRENCY, async (job) => {
            const doc = await fetchDoc(scanUrl(job.part, job.page), controller.signal);
            for (const item of cardData(doc, job.groupIndex, job.page, job.branchId)) mergeCandidate(map, item);
            completedPages += 1;
            progress();
        }, controller.signal, () => progress('retrying', true));

        clearTimeout(progressTimer);
        progressTimer = 0;
        if (myId !== state.scanId || controller.signal.aborted) return;

        const incomplete = firstResult.pending.length > 0 || pageResult.pending.length > 0;
        state.scanningSig = '';
        state.cacheSig = sig;
        state.candidates = Array.from(map.values()).sort(compareCandidates);
        state.cacheReady = !incomplete;
        state.status = {
            phase: incomplete ? 'retrying' : 'done',
            matches: matchedCandidates().length,
            searchCount: searches.length,
            readySearches,
            completedPages,
            totalPages,
        };

        if (incomplete) scheduleAutoRetry(sig);
        else {
            clearAutoRetry(true);
            renderResults(sig, 'done');
        }
    } catch (error) {
        clearTimeout(progressTimer);
        progressTimer = 0;
        if (error?.name === 'AbortError' || myId !== state.scanId) return;
        console.warn('[Etsy BetterSearch] Scan failed:', error);
        state.scanningSig = '';
        state.cacheSig = sig;
        state.candidates = Array.from(map.values()).sort(compareCandidates);
        state.cacheReady = false;
        state.status = {
            phase: 'retrying',
            matches: matchedCandidates().length,
            searchCount: searches.length,
            readySearches,
            completedPages,
            totalPages,
        };
        scheduleAutoRetry(sig);
    }
}

function reapply() {
    if (!(cfg.multi || cfg.strict) || !isSearchPage()) return showStatus(null);
    const sig = signature();
    if (state.cacheReady && state.cacheSig === sig) renderResults(sig, 'done');
    else scan();
}

function favoriteButtonFromEvent(target) {
    const button = target?.closest?.('button, [role="button"]');
    if (!button) return null;
    const text = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
    if (/(add|remove).{0,30}favou?rite|favou?rite this/i.test(text)) return button;
    if (button.matches('[data-favorite-button], [data-listing-card-favorite-button]')) return button;
    return null;
}

function isFavoritedButton(button) {
    const label = `${button?.getAttribute('aria-label') || ''} ${button?.getAttribute('title') || ''}`;
    return button?.getAttribute('aria-pressed') === 'true' || /remove.+favou?rite|favorited|favourited/i.test(label);
}

function setFavoriteWorking(button, working) {
    button?.classList.toggle('ebs-favorite-working', working);
    if (button) button.disabled = Boolean(working);
}

function setFavoriteVisual(button, favorited) {
    if (!button) return;
    button.classList.toggle('ebs-favorited', favorited);
    button.setAttribute('aria-pressed', String(favorited));
    const label = button.getAttribute('aria-label') || '';
    if (/favorite|favourite/i.test(label)) button.setAttribute('aria-label', favorited ? 'Remove from Favorites' : 'Add to Favorites');
}

async function waitForIframeFavorite(frame, desiredFavorited, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        let doc;
        try { doc = frame.contentDocument; } catch (_) { throw new Error('Favorite helper could not access Etsy listing page'); }
        if (doc) {
            const buttons = Array.from(doc.querySelectorAll('button, [role="button"]')).filter((button) => {
                const text = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
                return /(add|remove).{0,30}favou?rite|favou?rite this/i.test(text);
            });
            const favorite = buttons.find((button) => !button.closest('[data-results-grid-container]')) || buttons[0];
            if (favorite) {
                const current = isFavoritedButton(favorite);
                if (current !== desiredFavorited) favorite.click();
                await sleep(900);
                return true;
            }
        }
        await sleep(180);
    }
    throw new Error('Timed out waiting for Etsy favorite control');
}

async function bridgeFavorite(card, button) {
    const listingId = card.getAttribute('data-ebs-listing-id') || listingIdFromNode(card);
    if (!listingId || state.favoriteJobs.has(listingId)) return;
    const url = card.getAttribute('data-ebs-listing-url') || listingUrlFromNode(card);
    if (!url) return;
    const desired = !isFavoritedButton(button);
    setFavoriteWorking(button, true);
    const job = (async () => {
        const frame = document.createElement('iframe');
        frame.className = 'ebs-favorite-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.src = url;
        document.body.append(frame);
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Favorite helper page timed out')), 12000);
                frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
                frame.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Favorite helper page failed')); }, { once: true });
            });
            await waitForIframeFavorite(frame, desired);
            setFavoriteVisual(button, desired);
        } finally {
            frame.remove();
            setFavoriteWorking(button, false);
        }
    })().catch((error) => {
        console.warn('[Etsy BetterSearch] Could not bridge favorite action:', error);
        button.title = 'Could not favorite from this reconstructed card. Open the listing and use Etsy’s heart there.';
    }).finally(() => state.favoriteJobs.delete(listingId));
    state.favoriteJobs.set(listingId, job);
    await job;
}
