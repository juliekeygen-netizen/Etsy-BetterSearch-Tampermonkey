// Minimal cross-browser background shell.
// Current BetterSearch behavior still runs in the shared content-script bundle.
// The future Favorites metadata queue/deep scanner will move here in phases.

const ebsBackgroundApi = globalThis.browser ?? globalThis.chrome;

if (ebsBackgroundApi?.runtime?.onInstalled) {
  ebsBackgroundApi.runtime.onInstalled.addListener(() => {
    // Intentionally no migration yet. Tampermonkey and extension storage remain
    // separate until an explicit import/export migration is designed.
  });
}

if (ebsBackgroundApi?.runtime?.onMessage) {
  ebsBackgroundApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.namespace !== 'etsy-bettersearch') return undefined;
    if (message.type === 'ping') {
      sendResponse({ ok: true, context: 'background' });
      return true;
    }
    return undefined;
  });
}
