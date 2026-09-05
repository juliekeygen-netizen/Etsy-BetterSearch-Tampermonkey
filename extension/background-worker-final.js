// Final extension-worker handoff corrections. Kept separate from the worker body
// so this ownership rule is visually isolated and regression-testable.

const ebsWorkerMergeRawListingBeforeHandoffFinal = ebsWorkerMergeRawListing;
ebsWorkerMergeRawListing = function ebsWorkerMergeRawListingHandoffFinal(existing, incoming) {
  // Import time is NOT Favorites observation time. Using Date.now() here would
  // let a stale page replica reactivate a scope that a newer background
  // catalogue generation already removed. Only positive Favorites observations
  // carried by the row are allowed to participate in membership conflict rules.
  const observedAt = Math.max(
    0,
    Number(incoming?.lastSeenFavoriteAt) || 0,
    Number(incoming?.lastCardRefreshAt) || 0,
    ...Object.values(incoming?.favoriteScopes || {}).map((membership) => Number(membership?.lastSeenAt) || 0),
  );
  const merged = ebsWorkerMergeMembershipListing(existing, incoming, observedAt);
  const incomingDeep = Number(incoming?.lastDeepScanAt) || 0;
  const existingDeep = Number(existing?.lastDeepScanAt) || 0;
  const deepSource = incomingDeep >= existingDeep ? incoming : existing;
  merged.lastDeepScanAt = Math.max(incomingDeep, existingDeep);
  merged.deepParserVersion = String(deepSource?.deepParserVersion || merged.deepParserVersion || '');
  merged.shippingOriginParserVersion = String(deepSource?.shippingOriginParserVersion || merged.shippingOriginParserVersion || '');
  const incomingAvailabilityAt = Number(incoming?.availabilityObservedAt) || 0;
  const existingAvailabilityAt = Number(existing?.availabilityObservedAt) || 0;
  const availabilitySource = incomingAvailabilityAt >= existingAvailabilityAt ? incoming : existing;
  if (availabilitySource?.availabilityState) {
    merged.availabilityState = availabilitySource.availabilityState;
    merged.availabilityObservedAt = Math.max(incomingAvailabilityAt, existingAvailabilityAt);
  }
  const firstSeen = [existing?.firstSeenAt, incoming?.firstSeenAt].map(Number).filter((value) => value > 0);
  merged.firstSeenAt = firstSeen.length ? Math.min(...firstSeen) : observedAt;
  return merged;
};