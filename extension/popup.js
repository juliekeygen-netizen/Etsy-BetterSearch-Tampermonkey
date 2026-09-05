const ebsPopupApi = globalThis.browser ?? globalThis.chrome;
const EBS_POPUP_NAMESPACE = 'etsy-bettersearch';

const ui = {
  enabled:document.querySelector('#enabled'),
  interval:document.querySelector('#interval'),
  catalogue:document.querySelector('#catalogue'),
  deepMetadata:document.querySelector('#deep-metadata'),
  statusPill:document.querySelector('#status-pill'),
  lastRun:document.querySelector('#last-run'),
  nextRun:document.querySelector('#next-run'),
  catalogueState:document.querySelector('#catalogue-state'),
  deepState:document.querySelector('#deep-state'),
  syncNow:document.querySelector('#sync-now'),
  deepNow:document.querySelector('#deep-now'),
  feedback:document.querySelector('#feedback'),
  migrationNote:document.querySelector('#migration-note'),
};

function ebsPopupMessage(message) {
  const payload = { namespace:EBS_POPUP_NAMESPACE, ...message };
  if (globalThis.browser?.runtime?.sendMessage) return globalThis.browser.runtime.sendMessage(payload);
  return new Promise((resolve, reject) => {
    globalThis.chrome.runtime.sendMessage(payload, (response) => {
      const error = globalThis.chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function ebsPopupTime(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return '—';
  const delta = timestamp - Date.now();
  const abs = Math.abs(delta);
  if (abs < 45000) return delta >= 0 ? 'soon' : 'just now';
  if (abs < 3600000) return `${Math.round(abs / 60000)} min ${delta >= 0 ? 'from now' : 'ago'}`;
  if (abs < 86400000) return `${Math.round(abs / 3600000)} h ${delta >= 0 ? 'from now' : 'ago'}`;
  return new Date(timestamp).toLocaleString([], { dateStyle:'short', timeStyle:'short' });
}

function ebsPopupStateLabel(value) {
  const text = String(value || 'idle').replaceAll('_', ' ').replaceAll('-', ' ');
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ebsPopupSetFeedback(text = '', error = false) {
  ui.feedback.textContent = text;
  ui.feedback.classList.toggle('error', error);
}

function ebsPopupApply(state) {
  const settings = state?.settings || {};
  const status = state?.status || {};
  ui.enabled.checked = settings.enabled !== false;
  ui.interval.value = String(settings.intervalMinutes || 60);
  ui.catalogue.checked = settings.catalogue !== false;
  ui.deepMetadata.checked = settings.deepMetadata !== false;
  ui.lastRun.textContent = ebsPopupTime(status.lastCompletedAt || status.lastDelegatedAt || status.lastWakeAt);
  ui.nextRun.textContent = settings.enabled === false ? 'Disabled' : ebsPopupTime(status.nextRunAt);
  ui.catalogueState.textContent = ebsPopupStateLabel(status.catalogueState?.status || 'idle');
  ui.deepState.textContent = ebsPopupStateLabel(status.deepState?.status || 'idle');

  const phase = String(status.phase || 'idle');
  ui.statusPill.textContent = settings.enabled === false ? 'Disabled' : ebsPopupStateLabel(phase);
  const noTabScanner = state?.capabilities?.noTabScanner === true;
  ui.migrationNote.hidden = noTabScanner;
}

async function ebsPopupRefresh() {
  try {
    const state = await ebsPopupMessage({ type:'maintenance-get-state' });
    if (!state?.ok) throw new Error(state?.error || 'Could not read extension maintenance state.');
    ebsPopupApply(state);
  } catch (error) {
    ebsPopupSetFeedback(String(error?.message || error), true);
    ui.statusPill.textContent = 'Unavailable';
  }
}

async function ebsPopupSave() {
  ebsPopupSetFeedback('Saving…');
  try {
    const state = await ebsPopupMessage({
      type:'maintenance-set-settings',
      settings:{
        enabled:ui.enabled.checked,
        intervalMinutes:Number(ui.interval.value) || 60,
        catalogue:ui.catalogue.checked,
        deepMetadata:ui.deepMetadata.checked,
      },
    });
    if (!state?.ok) throw new Error(state?.error || 'Could not save settings.');
    ebsPopupApply(state);
    ebsPopupSetFeedback('Saved.');
  } catch (error) {
    ebsPopupSetFeedback(String(error?.message || error), true);
  }
}

async function ebsPopupRun(kind) {
  const button = kind === 'deep' ? ui.deepNow : ui.syncNow;
  button.disabled = true;
  ebsPopupSetFeedback(kind === 'deep' ? 'Starting metadata scan…' : 'Starting Favorites sync…');
  try {
    const result = await ebsPopupMessage({
      type:'maintenance-run-now',
      reason:kind === 'deep' ? 'manual-deep' : 'manual-catalogue',
      catalogue:kind === 'catalogue',
      deepMetadata:kind === 'deep',
    });
    if (!result?.accepted) {
      throw new Error('No eligible Etsy Favorites tab is open yet. Background-owned no-tab scanning is the next migration phase.');
    }
    ebsPopupSetFeedback(kind === 'deep' ? 'Metadata scan started.' : 'Favorites sync started.');
    await ebsPopupRefresh();
  } catch (error) {
    ebsPopupSetFeedback(String(error?.message || error), true);
  } finally {
    button.disabled = false;
  }
}

for (const control of [ui.enabled, ui.interval, ui.catalogue, ui.deepMetadata]) {
  control.addEventListener('change', () => { void ebsPopupSave(); });
}
ui.syncNow.addEventListener('click', () => { void ebsPopupRun('catalogue'); });
ui.deepNow.addEventListener('click', () => { void ebsPopupRun('deep'); });

void ebsPopupRefresh();
