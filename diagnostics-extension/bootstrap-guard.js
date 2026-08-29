'use strict';

// Runs before the document-start recorder and control layers. Two independent
// safety rules live here because both must be in force before later scripts run:
//
// 1. A reload arm is never permission to start recording. The background must
//    confirm a live chrome.debugger target first.
// 2. Diagnostics-owned panel MutationObservers must not be able to create an
//    endless microtask feedback loop by observing attributes that syncUi writes
//    back with the same value. That loop can starve Etsy's parser/main thread and
//    leave its JavaScript requests visibly Pending while the page stays blank.
(() => {
  const ARM_KEY = 'ebsf-diagnostics:armed:v1';
  const PANEL_ID = '__etsy_bettersearch_diagnostics__';

  function parse(value) {
    try { return JSON.parse(value || 'null'); }
    catch (_) { return null; }
  }

  const current = parse(sessionStorage.getItem(ARM_KEY));
  if (current?.sessionId) {
    globalThis.__EBSF_DIAG_CONSUMED_ARM__ = {
      sessionId: String(current.sessionId),
      startedAt: Number(current.startedAt || 0)
    };
  }

  // content.js follows immediately after this file and still contains a legacy
  // readArmedSession() fast path. Remove the key synchronously so only get_state
  // plus debugger-target verification can authorize the heavy recorder.
  try { sessionStorage.removeItem(ARM_KEY); } catch (_) {}
  globalThis.__EBSF_DIAG_BACKGROUND_CONFIRMATION_REQUIRED__ = true;

  const NativeMutationObserver = globalThis.MutationObserver;
  if (typeof NativeMutationObserver !== 'function') return;

  function isNoopAttributeMutation(record) {
    if (record?.type !== 'attributes' || !record.attributeName) return false;
    const target = record.target;
    if (!(target instanceof Element)) return false;
    return record.oldValue === target.getAttribute(record.attributeName);
  }

  class DiagnosticsMutationObserver {
    constructor(callback) {
      if (typeof callback !== 'function') throw new TypeError('MutationObserver callback must be a function.');
      this.callback = callback;
      this.guardPanelAttributes = false;
      this.inner = new NativeMutationObserver((records) => {
        const deliver = this.guardPanelAttributes
          ? records.filter((record) => !isNoopAttributeMutation(record))
          : records;
        if (deliver.length) this.callback(deliver, this);
      });
    }

    observe(target, options = {}) {
      this.guardPanelAttributes = Boolean(
        options?.attributes &&
        target instanceof Element &&
        target.id === PANEL_ID
      );
      const guardedOptions = this.guardPanelAttributes
        ? { ...options, attributeOldValue: true }
        : options;
      return this.inner.observe(target, guardedOptions);
    }

    disconnect() {
      return this.inner.disconnect();
    }

    takeRecords() {
      const records = this.inner.takeRecords();
      return this.guardPanelAttributes
        ? records.filter((record) => !isNoopAttributeMutation(record))
        : records;
    }
  }

  globalThis.MutationObserver = DiagnosticsMutationObserver;
  globalThis.__EBSF_DIAG_PANEL_OBSERVER_GUARD__ = true;
})();
