'use strict';

function ebsRetryDelay(profile, round, errors = [], wholeScan = false) {
  const sets = wholeScan
    ? { fast: [1200, 3000, 7000], normal: [2500, 6500, 15000], patient: [5000, 12000, 30000] }
    : { fast: [500, 1200, 2500], normal: [700, 1800, 4000], patient: [1500, 4000, 8000] };
  const values = sets[profile] || sets.normal;
  const index = Math.max(0, round - 1);
  const base = index < values.length ? values[index] : Math.round(values[values.length - 1] * Math.pow(1.45, index - values.length + 1));
  const hinted = Math.max(0, ...errors.map((entry) => Number(entry?.error?.retryAfterMs) || 0));
  return Math.max(base, hinted);
}

runJobs = async function runJobsWithSettings(items, concurrency, worker, signal, onRetry, options = {}) {
  let pending = items.slice();
  let lastErrors = [];
  const retries = scanInt(options.pageRetries, 2, 0);
  const adaptive = options.adaptiveSlowdown !== false;
  const baseSpacing = scanInt(options.spacingMs, 0, 0);
  let currentConcurrency = Math.max(1, scanInt(concurrency, 1, 1));
  let spacing = baseSpacing;
  let lastStartAt = 0;
  let startGate = Promise.resolve();

  const waitForRequestSlot = async () => {
    if (spacing <= 0) return;
    let release;
    const previous = startGate;
    startGate = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, lastStartAt + spacing - Date.now());
      if (wait) await sleep(wait, signal);
      lastStartAt = Date.now();
    } finally {
      release();
    }
  };

  for (let round = 0; round <= retries && pending.length; round += 1) {
    if (options.shouldStop?.()) return { pending: [], errors: lastErrors, stopped: true };
    if (round > 0) {
      onRetry?.();
      await sleep(ebsRetryDelay(options.retryProfile, round, lastErrors, false), signal);
    }

    let cursor = 0;
    const failed = [];
    let stopped = false;
    const runners = Array.from({ length: Math.min(currentConcurrency, pending.length) }, async () => {
      while (cursor < pending.length) {
        if (options.shouldStop?.()) { stopped = true; return; }
        const item = pending[cursor++];
        try {
          await waitForRequestSlot();
          await worker(item);
        } catch (error) {
          if (error?.name === 'AbortError' || signal.aborted) throw error;
          failed.push({ item, error });
        }
      }
    });
    await Promise.all(runners);
    if (stopped || options.shouldStop?.()) return { pending: [], errors: failed, stopped: true };

    lastErrors = failed;
    pending = failed.map((entry) => entry.item);
    if (pending.length && adaptive) {
      currentConcurrency = Math.max(1, currentConcurrency - 1);
      spacing = Math.max(spacing, baseSpacing + round * 100);
    }
  }
  return { pending, errors: lastErrors, stopped: false };
};

var ebsBaseShowStatus = showStatus;
showStatus = function showStatusWithCoverage(status = null) {
  ebsBaseShowStatus(status);
  const limited = status?.coverageLimited === true || (state.coverageLimited === true && (status?.phase === 'done' || status?.phase === 'error'));
  if (!limited) return;
  const span = document.querySelector('[data-result-info] .ebs-result-text');
  if (span && !/limited scan/i.test(span.textContent || '')) span.textContent += ' · limited scan';
};

scheduleAutoRetry = function scheduleAutoRetryWithSettings(sig) {
  const settings = activeScanSettings();
  if (state.retrySig !== sig) {
    state.retrySig = sig;
    state.retryCount = 0;
  }
  state.retryCount += 1;
  if (state.retryCount > settings.scanRetries) {
    clearTimeout(state.retryTimer);
    state.retryTimer = 0;
    state.status = { ...(state.status || {}), phase: 'error', coverageLimited: state.coverageLimited === true };
    renderResults(sig, 'error');
    showStatus(state.status);
    return;
  }

  const delay = ebsRetryDelay(settings.retryProfile, state.retryCount, [], true);
  state.status = { ...(state.status || {}), phase: 'retrying', coverageLimited: state.coverageLimited === true };
  if (settings.showPartial) {
    renderResults(sig, 'retrying');
    showStatus(state.status);
  } else {
    showStatus(state.status);
    updateScanPanel(state.status);
  }

  clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(() => {
    state.retryTimer = 0;
    if (!(cfg.multi || cfg.strict) || !isSearchPage() || signature() !== sig) return;
    invalidateCache();
    scan();
  }, delay);
};

scan = async function scanWithSettings() {
  if (!(cfg.multi || cfg.strict) || !isSearchPage()) return;
  if (cfg.multi) ensureRulesSeeded();
  const sig = signature();
  const settings = activeScanSettings();

  if (state.scanningSig === sig) return showStatus(state.status);
  if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
  if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, 'done');
  if (state.rendered) restoreNative();

  const plan = cfg.multi ? compileMultiPlan() : null;
  const searches = cfg.multi ? plan.searches : [{ id: 'single', query: query(), branchRuleId: null }];
  if (!searches.length || searches.every((entry) => !entry.query)) {
    state.candidates = [];
    state.cacheReady = true;
    state.cacheSig = sig;
    state.coverageLimited = false;
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
  state.coverageLimited = false;

  const map = new Map();
  let completedPages = 0;
  let totalPages = 0;
  let readySearches = 0;
  let limitedByPages = false;
  let limitedByStop = false;
  let progressTimer = 0;
  let lastProgressAt = 0;
  let pendingPhase = 'scanning';
  let matchCountDirty = true;
  let matchCountCache = 0;

  const countMatches = () => {
    if (!matchCountDirty) return matchCountCache;
    let count = 0;
    if (cfg.multi) {
      for (const item of map.values()) if (multiCandidateMatches(item, plan)) count += 1;
    } else {
      for (const item of map.values()) if (strictMatchesTitle(item.title)) count += 1;
    }
    matchCountCache = count;
    matchCountDirty = false;
    return count;
  };

  const shouldStop = () => settings.stopAfter > 0 && countMatches() >= settings.stopAfter;
  const commonJobOptions = {
    pageRetries: settings.pageRetries,
    spacingMs: settings.spacingMs,
    retryProfile: settings.retryProfile,
    adaptiveSlowdown: settings.adaptiveSlowdown,
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
      coverageLimited: limitedByPages || limitedByStop,
    };
    state.status = status;
    if (settings.showPartial && map.size) {
      state.candidates = Array.from(map.values()).sort(compareCandidates);
      renderResults(sig, 'scanning');
      state.status = status;
      showStatus(status);
    } else {
      showStatus(status);
      updateScanPanel(status);
    }
  };

  const progress = (phase = 'scanning', force = false) => {
    if (myId !== state.scanId || controller.signal.aborted) return;
    pendingPhase = phase;
    const elapsed = performance.now() - lastProgressAt;
    if (force || elapsed >= 140) {
      clearTimeout(progressTimer);
      progressTimer = 0;
      publishProgress();
      return;
    }
    if (!progressTimer) {
      progressTimer = setTimeout(() => {
        progressTimer = 0;
        publishProgress();
      }, Math.max(20, 140 - elapsed));
    }
  };

  state.status = { phase: 'scanning', matches: 0, searchCount: searches.length, readySearches: 0, completedPages: 0, totalPages: 0, coverageLimited: false };
  showStatus(state.status);
  updateScanPanel(state.status);

  const firstJobs = searches.map((search, groupIndex) => ({ part: search.query, branchId: search.branchRuleId, groupIndex, total: 0, sourceTotal: 0 }));
  const limitPages = (job, sourceTotal) => {
    job.sourceTotal = sourceTotal;
    job.total = settings.maxPages > 0 ? Math.min(sourceTotal, settings.maxPages) : sourceTotal;
    if (job.total < sourceTotal) limitedByPages = true;
    totalPages += job.total;
  };

  try {
    const currentUrl = new URL(location.href);
    const currentPage = Math.max(1, Number(currentUrl.searchParams.get('page')) || 1);
    const canReuseLivePage = settings.reuseCurrentPage
      && searches.length === 1
      && normalize(searches[0].query) === normalize(query())
      && Boolean(mainResultsGrid(document))
      && (settings.maxPages <= 0 || currentPage <= settings.maxPages);

    let firstResult;
    if (canReuseLivePage) {
      const job = firstJobs[0];
      limitPages(job, parseTotalPages(document));
      readySearches = 1;
      completedPages = 1;
      for (const item of cardData(document, job.groupIndex, currentPage, job.branchId)) mergeCandidate(map, item);
      matchCountDirty = true;
      progress('scanning', true);
      firstResult = { pending: [], errors: [], stopped: false };
    } else {
      firstResult = await runJobs(firstJobs, settings.concurrency, async (job) => {
        const doc = await fetchDoc(scanUrl(job.part, 1), controller.signal);
        limitPages(job, parseTotalPages(doc));
        readySearches += 1;
        completedPages += 1;
        for (const item of cardData(doc, job.groupIndex, 1, job.branchId)) mergeCandidate(map, item);
        matchCountDirty = true;
        progress();
      }, controller.signal, () => progress('retrying', true), commonJobOptions);
    }

    const queue = [];
    if (settings.scanOrder === 'searchBySearch') {
      for (const job of firstJobs) {
        for (let page = 1; page <= job.total; page += 1) {
          if (!canReuseLivePage && page === 1) continue;
          if (canReuseLivePage && job.groupIndex === 0 && page === currentPage) continue;
          queue.push({ ...job, page });
        }
      }
    } else {
      const maxPages = Math.max(0, ...firstJobs.map((job) => job.total || 0));
      for (let page = 1; page <= maxPages; page += 1) {
        for (const job of firstJobs) {
          if (!job.total || page > job.total) continue;
          if (!canReuseLivePage && page === 1) continue;
          if (canReuseLivePage && job.groupIndex === 0 && page === currentPage) continue;
          queue.push({ ...job, page });
        }
      }
    }

    const pageResult = await runJobs(queue, settings.concurrency, async (job) => {
      const doc = await fetchDoc(scanUrl(job.part, job.page), controller.signal);
      for (const item of cardData(doc, job.groupIndex, job.page, job.branchId)) mergeCandidate(map, item);
      completedPages += 1;
      matchCountDirty = true;
      progress();
    }, controller.signal, () => progress('retrying', true), { ...commonJobOptions, shouldStop });

    limitedByStop = pageResult.stopped === true || shouldStop();
    clearTimeout(progressTimer);
    progressTimer = 0;
    if (myId !== state.scanId || controller.signal.aborted) return;

    const incomplete = firstResult.pending.length > 0 || pageResult.pending.length > 0;
    state.scanningSig = '';
    state.cacheSig = sig;
    state.candidates = Array.from(map.values()).sort(compareCandidates);
    state.cacheReady = !incomplete;
    state.coverageLimited = limitedByPages || limitedByStop;
    state.status = {
      phase: incomplete ? 'retrying' : 'done',
      matches: matchedCandidates().length,
      searchCount: searches.length,
      readySearches,
      completedPages,
      totalPages,
      coverageLimited: state.coverageLimited,
    };

    if (incomplete) scheduleAutoRetry(sig);
    else {
      clearAutoRetry(true);
      renderResults(sig, 'done');
      showStatus(state.status);
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
    state.coverageLimited = limitedByPages || limitedByStop;
    state.status = {
      phase: 'retrying',
      matches: matchedCandidates().length,
      searchCount: searches.length,
      readySearches,
      completedPages,
      totalPages,
      coverageLimited: state.coverageLimited,
    };
    scheduleAutoRetry(sig);
  }
};
