// Extension-only bridge loaded after the shared BetterSearch modules.
// It lets the background scheduler/popup ask the existing Etsy-page owner to
// perform work during the database-ownership migration. Tampermonkey never
// loads this file.

const ebsContentApi = globalThis.browser ?? globalThis.chrome;
const EBS_CONTENT_NAMESPACE = 'etsy-bettersearch';

function ebsContentSend(message) {
  if (!ebsContentApi?.runtime?.sendMessage) return;
  try {
    const result = ebsContentApi.runtime.sendMessage({ namespace:EBS_CONTENT_NAMESPACE, ...message });
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {}
}

function ebsContentSerializableState(detail = {}) {
  return {
    status:String(detail.status || 'idle'),
    processed:Math.max(0, Number(detail.processed ?? detail.completed) || 0),
    completed:Math.max(0, Number(detail.completed) || 0),
    failed:Math.max(0, Number(detail.failed) || 0),
    total:Math.max(0, Number(detail.total ?? detail.expectedTotal) || 0),
    pagesProcessed:Math.max(0, Number(detail.pagesProcessed) || 0),
    startedAt:Math.max(0, Number(detail.startedAt) || 0),
    completedAt:Math.max(0, Number(detail.completedAt) || 0),
    error:String(detail.error || ''),
  };
}

document.addEventListener?.('ebsf:favorites-sync-state', (event) => {
  ebsContentSend({ type:'maintenance-page-state', channel:'catalogue', detail:ebsContentSerializableState(event.detail) });
});

document.addEventListener?.('ebsf:favorites-deep-state', (event) => {
  ebsContentSend({ type:'maintenance-page-state', channel:'deep', detail:ebsContentSerializableState(event.detail) });
});

function ebsRunScheduledCatalogue() {
  if (typeof favMaybeAutoSync !== 'function') return Promise.resolve(false);
  return Promise.resolve(favMaybeAutoSync(true));
}

function ebsRunForcedCatalogue() {
  if (typeof favSyncAllItemsScope !== 'function' || typeof favSyncScope !== 'function') return Promise.resolve(false);
  const scope = favSyncAllItemsScope();
  return Promise.resolve(favSyncScope(scope, {
    independent:true,
    reason:'extension-popup',
    applyLive:typeof favCatalogIsCurrent0141 === 'function' ? favCatalogIsCurrent0141(scope) : false,
  })).then(() => true);
}

function ebsRunDeep(force) {
  if (typeof favDeepStart !== 'function') return Promise.resolve(false);
  void Promise.resolve(favDeepStart({ force:force === true })).catch(() => {});
  return Promise.resolve(true);
}

async function ebsHandleMaintenanceRequest(message) {
  if (typeof isFavoritesPage !== 'function' || !isFavoritesPage()) {
    return { accepted:false, reason:'not-favorites-page' };
  }
  if (typeof favIsOwnFavoritesPage === 'function' && !favIsOwnFavoritesPage()) {
    return { accepted:false, reason:'not-own-favorites' };
  }
  if (typeof favFavoritesRuntimeActive01527 !== 'undefined' && favFavoritesRuntimeActive01527 !== true) {
    return { accepted:false, reason:'inactive-runtime-owner' };
  }

  const catalogueRequested = message.catalogue !== false;
  const deepRequested = message.deepMetadata !== false;
  let catalogueStarted = false;
  let deepStarted = false;
  if (catalogueRequested) {
    catalogueStarted = message.force === true
      ? await ebsRunForcedCatalogue()
      : await ebsRunScheduledCatalogue();
  }
  if (deepRequested) {
    deepStarted = await ebsRunDeep(message.force === true && message.reason === 'manual-deep');
  }
  return {
    // `accepted` means this tab is the eligible semantic owner. A scheduled
    // catalogue check that finds nothing due is still a successful handoff.
    accepted:Boolean(catalogueRequested || deepRequested),
    catalogueStarted:Boolean(catalogueStarted),
    deepMetadataStarted:Boolean(deepStarted),
  };
}

if (ebsContentApi?.runtime?.onMessage) {
  ebsContentApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.namespace !== EBS_CONTENT_NAMESPACE) return undefined;
    if (message.type !== 'maintenance-run-current-page') return undefined;
    Promise.resolve(ebsHandleMaintenanceRequest(message)).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ accepted:false, error:String(error?.message || error) }),
    );
    return true;
  });
}
