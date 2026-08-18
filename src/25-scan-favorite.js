async function scan() {
    if (!(cfg.multi || cfg.strict) || !isSearchPage()) return;
    if (cfg.multi) ensureRulesSeeded();
    const sig = signature();
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
    state.status = { phase: 'scanning', matches: 0, searchCount: searches.length };
    showStatus(state.status);

    const map = new Map();
    const firstJobs = searches.map((search, groupIndex) => ({
        part: search.query,
        branchId: search.branchRuleId,
        groupIndex,
        total: 0,
    }));

    const progress = (phase = 'scanning') => {
        if (myId !== state.scanId) return;
        state.candidates = Array.from(map.values()).sort(compareCandidates);
        const matches = matchedCandidates().length;
        state.status = { phase, matches, searchCount: searches.length };
        showStatus(state.status);
    };

    try {
        const firstResult = await runJobs(firstJobs, 2, async (job) => {
            const doc = await fetchDoc(scanUrl(job.part, 1), controller.signal);
            job.total = parseTotalPages(doc);
            for (const item of cardData(doc, job.groupIndex, 1, job.branchId)) mergeCandidate(map, item);
            progress();
        }, controller.signal, () => progress('retrying'));

        const queue = [];
        for (const job of firstJobs) {
            if (!job.total) continue;
            for (let page = 2; page <= job.total; page += 1) queue.push({ ...job, page });
        }
        const pageResult = await runJobs(queue, 2, async (job) => {
            const doc = await fetchDoc(scanUrl(job.part, job.page), controller.signal);
            for (const item of cardData(doc, job.groupIndex, job.page, job.branchId)) mergeCandidate(map, item);
            progress();
        }, controller.signal, () => progress('retrying'));

        if (myId !== state.scanId || controller.signal.aborted) return;
        const incomplete = firstResult.pending.length > 0 || pageResult.pending.length > 0;
        state.scanningSig = '';
        state.cacheSig = sig;
        state.candidates = Array.from(map.values()).sort(compareCandidates);
        state.cacheReady = !incomplete;
        if (incomplete) scheduleAutoRetry(sig);
        else {
            clearAutoRetry(true);
            renderResults(sig, 'done');
        }
    } catch (error) {
        if (error?.name === 'AbortError' || myId !== state.scanId) return;
        console.warn('[Etsy BetterSearch] Scan failed:', error);
        state.scanningSig = '';
        state.cacheSig = sig;
        state.candidates = Array.from(map.values()).sort(compareCandidates);
        state.cacheReady = false;
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
