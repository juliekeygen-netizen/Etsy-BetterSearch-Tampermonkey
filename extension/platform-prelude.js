// This file is inserted at the top of the generated extension content script.
// It intentionally provides the small synchronous GM_* surface the existing
// shared BetterSearch modules expect, backed by browser.storage.local.

const ebsExtApi = globalThis.browser?.storage?.local ? globalThis.browser : globalThis.chrome;
if (!ebsExtApi?.storage?.local) {
  throw new Error('Etsy BetterSearch: browser.storage.local is unavailable.');
}

const ebsExtStore = new Map();
const ebsExtValueListeners = new Map();
const ebsExtPendingLocalValues = new Map();
let ebsExtNextValueListenerId = 1;

async function ebsExtStorageGetAll() {
  if (globalThis.browser?.storage?.local) {
    return globalThis.browser.storage.local.get(null);
  }
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.get(null, (items) => {
      const error = globalThis.chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(items || {});
    });
  });
}

function ebsExtStorageSet(values) {
  if (globalThis.browser?.storage?.local) {
    return globalThis.browser.storage.local.set(values);
  }
  return new Promise((resolve, reject) => {
    globalThis.chrome.storage.local.set(values, () => {
      const error = globalThis.chrome.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function ebsExtValueToken(value) {
  if (value === undefined) return 'undefined:';
  try { return `json:${JSON.stringify(value)}`; } catch (_) { return `string:${String(value)}`; }
}

function ebsExtMarkLocalValue(key, value) {
  const token = ebsExtValueToken(value);
  const queue = ebsExtPendingLocalValues.get(key) || [];
  queue.push(token);
  ebsExtPendingLocalValues.set(key, queue);
  return token;
}

function ebsExtConsumeLocalValue(key, value) {
  const queue = ebsExtPendingLocalValues.get(key);
  if (!queue?.length) return false;
  const token = ebsExtValueToken(value);
  const index = queue.indexOf(token);
  if (index < 0) return false;
  queue.splice(index, 1);
  if (!queue.length) ebsExtPendingLocalValues.delete(key);
  return true;
}

function ebsExtDispatchValueChange(key, oldValue, newValue, remote) {
  for (const { key: watchedKey, callback } of ebsExtValueListeners.values()) {
    if (watchedKey !== key) continue;
    try { callback(key, oldValue, newValue, remote); }
    catch (error) { console.error('Etsy BetterSearch: value-change listener failed', key, error); }
  }
}

for (const [key, value] of Object.entries(await ebsExtStorageGetAll())) {
  ebsExtStore.set(key, value);
}

/* Keep the synchronous mirror fresh in every content-script instance. This is
 * especially important for queue pause/resume state: Cancel in one Etsy tab
 * must be visible to a worker that currently owns the queue in another tab.
 * Also mirror Tampermonkey's value-change callback shape so the shared runtime
 * can subscribe to cross-tab config changes in both delivery targets. */
ebsExtApi.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName && areaName !== 'local') return;
  for (const [key, change] of Object.entries(changes || {})) {
    const hasNewValue = Object.prototype.hasOwnProperty.call(change, 'newValue');
    const newValue = hasNewValue ? change.newValue : undefined;
    const remote = !ebsExtConsumeLocalValue(key, newValue);
    if (hasNewValue) ebsExtStore.set(key, newValue);
    else ebsExtStore.delete(key);
    ebsExtDispatchValueChange(key, change?.oldValue, newValue, remote);
  }
});

function GM_getValue(key, fallback) {
  return ebsExtStore.has(key) ? ebsExtStore.get(key) : fallback;
}

function GM_setValue(key, value) {
  ebsExtStore.set(key, value);
  ebsExtMarkLocalValue(key, value);
  void ebsExtStorageSet({ [key]: value }).catch((error) => {
    ebsExtConsumeLocalValue(key, value);
    console.error('Etsy BetterSearch: failed to persist extension setting', key, error);
  });
}

function GM_addValueChangeListener(key, callback) {
  if (typeof callback !== 'function') return 0;
  const id = ebsExtNextValueListenerId++;
  ebsExtValueListeners.set(id, { key:String(key), callback });
  return id;
}

function GM_removeValueChangeListener(id) {
  ebsExtValueListeners.delete(id);
}

function GM_addStyle(cssText) {
  const style = document.createElement('style');
  style.dataset.etsyBettersearch = 'extension-style';
  style.textContent = String(cssText || '');
  (document.head || document.documentElement).appendChild(style);
  return style;
}
