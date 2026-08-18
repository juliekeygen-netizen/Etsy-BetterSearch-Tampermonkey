'use strict';

/*
 * Strict title and Multi-search are intentionally mutually exclusive.
 * Normal Single-search and Multi-search still retain separate saved query states.
 */

function ebsEnableStrictExclusive(nextStrict) {
  const next = nextStrict === true;
  const wasMulti = cfg.multi;
  const current = query();

  if (wasMulti && current) save('multiQuery', current);

  if (next) {
    if (wasMulti) save('multi', false);
    save('strict', true);
  } else {
    save('strict', false);
  }

  updateButtons();
  closeStrictPopup();
  closeMultiModal();
  stopScan();
  invalidateCache();
  restoreNative();
  scheduleFit();

  if (!isSearchPage()) return;

  if (next && wasMulti) {
    const target = cfg.singleQuery || current;
    if (!target) return scheduleSync(50);
    save('singleQuery', target);
    const desired = searchUrl(target, modeSwitchFilters());
    if (desired.href !== location.href) location.assign(desired.href);
    else reapply();
    return;
  }

  if (next) reapply();
  else showStatus(null);
}

/* Intercept the Strict-title main button before its original target handler. */
document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-ebs-strict]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ebsEnableStrictExclusive(!cfg.strict);
}, true);

/* Multi-search activation always turns Strict title off first. */
var ebsSwitchSearchModeBase = switchSearchMode;
switchSearchMode = function switchSearchModeExclusive(nextMulti) {
  if (nextMulti && cfg.strict) save('strict', false);
  return ebsSwitchSearchModeBase(nextMulti);
};

/* Applying the Multi-search editor can enable Multi-search directly. */
var ebsApplyMultiModalBase = applyMultiModal;
applyMultiModal = function applyMultiModalExclusive() {
  if (state.modal && state.modalDraft) {
    const normalized = normalizeRuleConnectors(normalizeRules(state.modalDraft));
    if (validateRules(normalized).size === 0 && cfg.strict) save('strict', false);
  }
  return ebsApplyMultiModalBase();
};

/* Clean up a persisted state from older versions where both could be enabled. */
if (cfg.multi && cfg.strict) {
  save('strict', false);
  updateButtons();
}
