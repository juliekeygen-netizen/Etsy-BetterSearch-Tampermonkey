// Final page/background replica fencing for extension delivery.

const ebsContentMergeRawListingBeforeHandoffFinal = ebsContentMergeRawListing;
ebsContentMergeRawListing = function ebsContentMergeRawListingHandoffFinal(existing, incoming) {
  // Import time is not proof that a Favorite was observed at that time. Preserve
  // newer exact-scope removals by feeding the merge only timestamps that came
  // from the incoming Favorites observation itself.
  const observedAt = Math.max(
    0,
    Number(incoming?.lastSeenFavoriteAt) || 0,
    Number(incoming?.lastCardRefreshAt) || 0,
    ...Object.values(incoming?.favoriteScopes || {}).map((membership) => Number(membership?.lastSeenAt) || 0),
  );
  const merged = favIndexMergeListing(existing, incoming, observedAt);
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

const ebsContentImportBackgroundIfNeededBeforeGenerationFence = ebsContentImportBackgroundIfNeeded;
ebsContentImportBackgroundIfNeeded = async function ebsContentImportBackgroundIfNeededGenerationFence(force = false) {
  const before = await ebsContentMessage({ type:'maintenance-get-state' });
  if (!before?.ok) return false;
  if (ebsContentBackgroundActive(before)) {
    ebsContentCancelPageMaintenanceForBackground();
    ebsContentScheduleBackgroundPull(1500);
    return false;
  }
  const beforeAt = Math.max(0, Number(before?.migration?.lastBackgroundMutationAt) || 0);
  const pageImportedAt = Math.max(0, Number(before?.migration?.lastPageImportAt) || 0);
  if (!force && (!beforeAt || beforeAt <= pageImportedAt)) return false;
  if (ebsContentPageBusy()) {
    ebsContentScheduleBackgroundPull(1200);
    return false;
  }

  await ebsContentPullBackgroundSnapshot();

  // The export is chunked by store, so a scheduled worker can theoretically
  // wake between chunks. Do not expose or acknowledge that mixed read. A newer
  // mutation timestamp (or an active worker) means retry against a stable
  // generation; per-row merges are monotonic, so the temporary DB writes are
  // harmless and are completed by the next pull before UI refresh.
  const after = await ebsContentMessage({ type:'maintenance-get-state' });
  const afterAt = Math.max(0, Number(after?.migration?.lastBackgroundMutationAt) || 0);
  if (!after?.ok || ebsContentBackgroundActive(after) || afterAt !== beforeAt) {
    ebsContentScheduleBackgroundPull(1200);
    return false;
  }

  await ebsContentRefreshFromImportedIndex();
  const marked = await ebsContentMessage({
    type:'maintenance-page-import-complete',
    owner:after.profile?.owner || before.profile?.owner || '',
    throughAt:beforeAt,
  });
  if (marked?.ok === false) throw new Error(marked.error || 'Could not record background-to-page Favorites handoff.');
  return true;
};