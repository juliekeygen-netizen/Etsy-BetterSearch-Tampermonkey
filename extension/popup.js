const ebsPopupApi = globalThis.browser ?? globalThis.chrome;
const EBS_POPUP_NAMESPACE = 'etsy-bettersearch';

const ui = {
  enabled:document.querySelector('#enabled'),
  interval:document.querySelector('#interval'),
  catalogue:document.querySelector('#catalogue'),
  deepMetadata:document.querySelector('#deep-metadata'),
  statusPill:document.querySelector('#status-pill'),
  profileState:document.querySelector('#profile-state'),
  indexedState:document.querySelector('#indexed-state'),
  coverageState:document.querySelector('#coverage-state'),
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
  const profile = state?.profile || {};
  const stats = state?.stats || null;
  ui.enabled.checked = settings.enabled !== false;
  ui.interval.value = String(settings.intervalMinutes || 60);
  ui.catalogue.checked = settings.catalogue !== false;
  ui.deepMetadata.checked = settings.deepMetadata !== false;
  ui.profileState.textContent = profile.initialized
    ? (profile.login ? `@${profile.login}` : 'Initialized')
    : 'Not initialized';
  ui.indexedState.textContent = stats
    ? `${Math.max(0, Number(stats.activeFavorites) || 0)} active · ${Math.max(0, Number(stats.indexedFavorites) || 0)} stored`
    : '—';
  ui.coverageState.textContent = stats
    ? `${Math.max(0, Number(stats.deepMetadataFavorites) || 0)} / ${Math.max(0, Number(stats.activeFavorites) || 0)}`
    : '—';
  ui.lastRun.textContent = ebsPopupTime(status.lastCompletedAt || status.lastDelegatedAt || status.lastWakeAt);
  ui.nextRun.textContent = settings.enabled === false ? 'Disabled' : ebsPopupTime(status.nextRunAt);
  ui.catalogueState.textContent = ebsPopupStateLabel(status.catalogueState?.status || state?.catalog?.status || 'idle');
  ui.deepState.textContent = ebsPopupStateLabel(status.deepState?.status || 'idle');

  const phase = String(status.phase || 'idle');
  ui.statusPill.textContent = settings.enabled === false ? 'Disabled' : ebsPopupStateLabel(phase);
  ui.migrationNote.hidden = profile.initialized === true;
  ui.syncNow.title = profile.initialized ? 'Run the background Favorites catalogue worker now.' : 'Open your own Etsy Favorites once to initialize background maintenance.';
  ui.deepNow.title = profile.initialized ? 'Run the background metadata worker now.' : 'Open your own Etsy Favorites once to initialize background maintenance.';
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

function ebsPopupRunFeedback(kind, result) {
  const label = kind === 'deep' ? 'Metadata scan' : 'Favorites sync';
  if (result?.delegated && result?.initializationFallback) return `${label} started in the open Favorites page while background maintenance initializes.`;
  if (result?.background && result?.needsContinuation) return `${label} ran in the background and will continue automatically.`;
  if (result?.background) return `${label} completed its background work.`;
  return `${label} started.`;
}

async function ebsPopupRun(kind) {
  const button = kind === 'deep' ? ui.deepNow : ui.syncNow;
  button.disabled = true;
  ebsPopupSetFeedback(kind === 'deep' ? 'Running background metadata scan…' : 'Running background Favorites sync…');
  try {
    const result = await ebsPopupMessage({
      type:'maintenance-run-now',
      reason:kind === 'deep' ? 'manual-deep' : 'manual-catalogue',
      catalogue:kind === 'catalogue',
      deepMetadata:kind === 'deep',
    });
    if (!result?.accepted) {
      if (result?.reason === 'profile-not-registered') {
        throw new Error('Open your own Etsy Favorites once to initialize background maintenance for this account.');
      }
      throw new Error(result?.error || `Could not run ${kind === 'deep' ? 'metadata scan' : 'Favorites sync'} in the background.`);
    }
    ebsPopupSetFeedback(ebsPopupRunFeedback(kind, result));
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