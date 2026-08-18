'use strict';

function ebsScanUrlWithSort(part, page, sortOrder = null) {
  const url = new URL(scanUrl(part, page));
  if (sortOrder) url.searchParams.set('order', sortOrder);
  return url.href;
}

function ebsDecorateSortCandidate(item, job) {
  const sortKey = job.sortKey || '__current__';
  item.sortKey = sortKey;
  item.sortRanks = {
    [sortKey]: {
      page: item.page,
      index: item.index,
      groupIndex: job.groupIndex,
    },
  };
  return item;
}

function ebsMergeSortCandidate(map, candidate) {
  const old = map.get(candidate.id);
  if (!old) {
    map.set(candidate.id, candidate);
    return;
  }

  const replace = compareCandidates(candidate, old) < 0;
  const mergedBranchIds = new Set([...(old.branchIds || []), ...(candidate.branchIds || [])]);
  const mergedSortRanks = { ...(old.sortRanks || {}) };

  for (const [key, rank] of Object.entries(candidate.sortRanks || {})) {
    const previous = mergedSortRanks[key];
    if (!previous
      || Number(rank.page) < Number(previous.page)
      || (Number(rank.page) === Number(previous.page) && Number(rank.index) < Number(previous.index))
      || (Number(rank.page) === Number(previous.page) && Number(rank.index) === Number(previous.index) && Number(rank.groupIndex) < Number(previous.groupIndex))) {
      mergedSortRanks[key] = rank;
    }
  }

  if (replace) {
    candidate.branchIds = mergedBranchIds;
    candidate.sortRanks = mergedSortRanks;
    map.set(candidate.id, candidate);
  } else {
    old.branchIds = mergedBranchIds;
    old.sortRanks = mergedSortRanks;
  }
}

/*
 * Sort-coverage scanner. Each enabled Etsy sort mode becomes another candidate
 * pass for every Strict-title query or generated Multi-search query. All cards
 * are merged by listing ID before the normal title rules are applied.
 */
scan = async function scanWithSortCoverage() {
  if (!(cfg.multi || cfg.strict) || !isSearchPage()) return;
  if (cfg.multi) ensureRulesSeeded();

  const sig = signature();
  const settings = activeScanSettings();
  const plan = cfg.multi ? compileMultiPlan() : null;
  const searches = cfg.multi ? plan.searches : [{ id: 'single', query: query(), branchRuleId: null }];
  const sortVariants = ebsActiveSortVariants();

  if (state.scanningSig === sig) return showStatus(state.status);
  if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
  if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, 'done');
  if (state.rendered) restoreNative();

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

  const readyVariantsBySearch = new Map();
  const markVariantReady = (job) => {
    const count = (readyVariantsBySearch.get(job.groupIndex) || 0) + 1;
    readyVariantsBySearch.set(job.groupIndex, count);
    if (count === sortVariants.length) readySearches += 1;
  };

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
      sortModeCount: sortVariants.length,
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

  state.status = {
    phase: 'scanning',
    matches: 0,
    searchCount: searches.length,
    sortModeCount: sortVariants.length,
    readySearches: 0,
    completedPages: 0,
    totalPages: 0,
    coverageLimited: false,
  };
  showStatus(state.status);
  updateScanPanel(state.status);

  const firstJobs = [];
  searches.forEach((search, groupIndex) => {
    sortVariants.forEach((sort, sortIndex) => {
      firstJobs.push({
        part: search.query,
        branchId: search.branchRuleId,
        groupIndex,
        sortIndex,
        sortKey: sort.key,
        sortOrder: sort.order,
        total: 0,
        sourceTotal: 0,
        firstFetched: false,
        reusedPage: 0,
      });
    });
  });

  const limitPages = (job, sourceTotal) => {
    job.sourceTotal = sourceTotal;
    job.total = settings.maxPages > 0 ? Math.min(sourceTotal, settings.maxPages) : sourceTotal;
    if (job.total < sourceTotal) limitedByPages = true;
    totalPages += job.total;
  };

  const addJobCards = (doc, job, page) => {
    for (const item of cardData(doc, job.groupIndex, page, job.branchId)) {
      ebsMergeSortCandidate(map, ebsDecorateSortCandidate(item, job));
    }
    matchCountDirty = true;
  };

  try {
    const currentUrl = new URL(location.href);
    const currentPage = Math.max(1, Number(currentUrl.searchParams.get('page')) || 1);
    const currentOrder = ebsCurrentEtsySortOrder();

    let reuseJob = null;
    if (settings.reuseCurrentPage && Boolean(mainResultsGrid(document))) {
      reuseJob = firstJobs.find((job) => {
        const queryMatches = normalize(job.part) === normalize(query());
        const sortMatches = job.sortOrder ? job.sortOrder === currentOrder : true;
        const pageAllowed = settings.maxPages <= 0 || currentPage <= settings.maxPages;
        return queryMatches && sortMatches && pageAllowed;
      }) || null;
    }

    if (reuseJob) {
      limitPages(reuseJob, parseTotalPages(document));
      reuseJob.reusedPage = currentPage;
      reuseJob.firstFetched = currentPage === 1;
      completedPages += 1;
      addJobCards(document, reuseJob, currentPage);
      markVariantReady(reuseJob);
      progress('scanning', true);
    }

    const firstFetchJobs = reuseJob ? firstJobs.filter((job) => job !== reuseJob) : firstJobs.slice();
    const firstResult = await runJobs(firstFetchJobs, settings.concurrency, async (job) => {
      const doc = await fetchDoc(ebsScanUrlWithSort(job.part, 1, job.sortOrder), controller.signal);
      limitPages(job, parseTotalPages(doc));
      job.firstFetched = true;
      completedPages += 1;
      addJobCards(doc, job, 1);
      markVariantReady(job);
      progress();
    }, controller.signal, () => progress('retrying', true), commonJobOptions);

    const queue = [];
    if (settings.scanOrder === 'searchBySearch') {
      for (let groupIndex = 0; groupIndex < searches.length; groupIndex += 1) {
        for (const job of firstJobs.filter((entry) => entry.groupIndex === groupIndex)) {
          for (let page = 1; page <= job.total; page += 1) {
            if (job.firstFetched && page === 1) continue;
            if (job.reusedPage && page === job.reusedPage) continue;
            queue.push({ ...job, page });
          }
        }
      }
    } else {
      const maxPages = Math.max(0, ...firstJobs.map((job) => job.total || 0));
      for (let page = 1; page <= maxPages; page += 1) {
        for (const job of firstJobs) {
          if (!job.total || page > job.total) continue;
          if (job.firstFetched && page === 1) continue;
          if (job.reusedPage && page === job.reusedPage) continue;
          queue.push({ ...job, page });
        }
      }
    }

    const pageResult = await runJobs(queue, settings.concurrency, async (job) => {
      const doc = await fetchDoc(ebsScanUrlWithSort(job.part, job.page, job.sortOrder), controller.signal);
      addJobCards(doc, job, job.page);
      completedPages += 1;
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
      sortModeCount: sortVariants.length,
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
    console.warn('[Etsy BetterSearch] Sort-coverage scan failed:', error);
    state.scanningSig = '';
    state.cacheSig = sig;
    state.candidates = Array.from(map.values()).sort(compareCandidates);
    state.cacheReady = false;
    state.coverageLimited = limitedByPages || limitedByStop;
    state.status = {
      phase: 'retrying',
      matches: matchedCandidates().length,
      searchCount: searches.length,
      sortModeCount: sortVariants.length,
      readySearches,
      completedPages,
      totalPages,
      coverageLimited: state.coverageLimited,
    };
    scheduleAutoRetry(sig);
  }
};
