'use strict';

var SORT_COVERAGE_KEY = 'etsy-bettersearch.sortCoverage';

var ETSY_SORT_MODES = Object.freeze([
  Object.freeze({ key: 'most_relevant', label: 'Most relevant', order: 'most_relevant' }),
  Object.freeze({ key: 'top_reviews', label: 'Top reviews', order: 'top_customer_reviews' }),
  Object.freeze({ key: 'newest', label: 'Newest', order: 'most_recent' }),
  Object.freeze({ key: 'price_low', label: 'Price: low to high', order: 'lowest_price' }),
  Object.freeze({ key: 'price_high', label: 'Price: high to low', order: 'highest_price' }),
]);

var EBS_SORT_AUTO_PRIORITY = Object.freeze([
  'most_relevant',
  'top_reviews',
  'newest',
  'price_low',
  'price_high',
]);

function ebsReadStoredObject(key, fallback = {}) {
  const stored = GM_getValue(key, fallback);
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored;
  if (typeof stored === 'string') {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return fallback;
}

function ebsNormalizeSortCoverage(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const valid = new Set(ETSY_SORT_MODES.map((mode) => mode.key));
  const enabled = Array.isArray(source.enabled)
    ? Array.from(new Set(source.enabled.map(String).filter((key) => valid.has(key))))
    : [];
  const displayPriority = source.displayPriority === 'auto' || valid.has(source.displayPriority)
    ? source.displayPriority
    : 'auto';
  return { enabled, displayPriority };
}

var sortCoverageCfg = ebsNormalizeSortCoverage(ebsReadStoredObject(SORT_COVERAGE_KEY, {}));

function ebsSaveSortCoverage(value) {
  sortCoverageCfg = ebsNormalizeSortCoverage(value);
  GM_setValue(SORT_COVERAGE_KEY, sortCoverageCfg);
}

function ebsSortMode(key) {
  return ETSY_SORT_MODES.find((mode) => mode.key === key) || null;
}

function ebsCurrentEtsySortOrder() {
  return new URL(location.href).searchParams.get('order') || 'most_relevant';
}

function ebsCurrentEtsySortKey() {
  const order = ebsCurrentEtsySortOrder();
  return ETSY_SORT_MODES.find((mode) => mode.order === order)?.key || 'most_relevant';
}

function ebsSortCoverageEnabled(config = sortCoverageCfg) {
  return ebsNormalizeSortCoverage(config).enabled.length > 0;
}

function ebsSortDisplayOrderKeys(config = sortCoverageCfg) {
  const normalized = ebsNormalizeSortCoverage(config);
  const enabled = new Set(normalized.enabled);
  if (!enabled.size) return [];

  const auto = EBS_SORT_AUTO_PRIORITY.filter((key) => enabled.has(key));
  const preferred = normalized.displayPriority !== 'auto' && enabled.has(normalized.displayPriority)
    ? normalized.displayPriority
    : auto[0];
  if (!preferred) return auto;
  return [preferred, ...auto.filter((key) => key !== preferred)];
}

function ebsActiveSortVariants(config = sortCoverageCfg) {
  const normalized = ebsNormalizeSortCoverage(config);
  if (!normalized.enabled.length) {
    return [{
      key: '__current__',
      label: `Current Etsy sort`,
      order: null,
      priority: 0,
      current: true,
    }];
  }

  return ebsSortDisplayOrderKeys(normalized)
    .map((key, priority) => {
      const mode = ebsSortMode(key);
      return mode ? { ...mode, priority, current: false } : null;
    })
    .filter(Boolean);
}

function ebsSortCoverageSignature(config = sortCoverageCfg) {
  const normalized = ebsNormalizeSortCoverage(config);
  return `${normalized.enabled.slice().sort().join(',')}|${normalized.displayPriority}`;
}

function ebsSortRankForCandidate(candidate) {
  if (!ebsSortCoverageEnabled()) return null;
  const priorities = ebsSortDisplayOrderKeys();
  const ranks = candidate?.sortRanks && typeof candidate.sortRanks === 'object' ? candidate.sortRanks : {};
  for (let priority = 0; priority < priorities.length; priority += 1) {
    const rank = ranks[priorities[priority]];
    if (!rank) continue;
    return {
      priority,
      page: Math.max(1, Number(rank.page) || 1),
      index: Math.max(0, Number(rank.index) || 0),
      groupIndex: Math.max(0, Number(rank.groupIndex) || 0),
    };
  }
  return null;
}

var ebsCompareCandidatesBeforeSortCoverage = compareCandidates;
compareCandidates = function compareCandidatesWithSortCoverage(a, b) {
  if (!ebsSortCoverageEnabled()) return ebsCompareCandidatesBeforeSortCoverage(a, b);
  const ar = ebsSortRankForCandidate(a);
  const br = ebsSortRankForCandidate(b);
  if (ar && br) {
    if (ar.priority !== br.priority) return ar.priority - br.priority;
    if (ar.page !== br.page) return ar.page - br.page;
    if (ar.index !== br.index) return ar.index - br.index;
    if (ar.groupIndex !== br.groupIndex) return ar.groupIndex - br.groupIndex;
  } else if (ar) return -1;
  else if (br) return 1;
  return ebsCompareCandidatesBeforeSortCoverage(a, b);
};

var ebsSignatureBeforeSortCoverage = signature;
signature = function signatureWithSortCoverage() {
  return `${ebsSignatureBeforeSortCoverage()}|sortCoverage:${ebsSortCoverageSignature()}`;
};
