// This file is inserted at the top of the generated extension content script.
// It intentionally provides the small synchronous GM_* surface the existing
// shared BetterSearch modules expect, backed by browser.storage.local.

const ebsExtApi = globalThis.browser?.storage?.local ? globalThis.browser : globalThis.chrome;
if (!ebsExtApi?.storage?.local) {
  throw new Error('Etsy BetterSearch: browser.storage.local is unavailable.');
}

const ebsExtStore = new Map();

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

for (const [key, value] of Object.entries(await ebsExtStorageGetAll())) {
  ebsExtStore.set(key, value);
}

/* Keep the synchronous mirror fresh in every content-script instance. This is
 * especially important for queue pause/resume state: Cancel in one Etsy tab
 * must be visible to a worker that currently owns the queue in another tab. */
ebsExtApi.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName && areaName !== 'local') return;
  for (const [key, change] of Object.entries(changes || {})) {
    if (Object.prototype.hasOwnProperty.call(change, 'newValue')) ebsExtStore.set(key, change.newValue);
    else ebsExtStore.delete(key);
  }
});

function GM_getValue(key, fallback) {
  return ebsExtStore.has(key) ? ebsExtStore.get(key) : fallback;
}

function GM_setValue(key, value) {
  ebsExtStore.set(key, value);
  void ebsExtStorageSet({ [key]: value }).catch((error) => {
    console.error('Etsy BetterSearch: failed to persist extension setting', key, error);
  });
}

function GM_addStyle(cssText) {
  const style = document.createElement('style');
  style.dataset.etsyBettersearch = 'extension-style';
  style.textContent = String(cssText || '');
  (document.head || document.documentElement).appendChild(style);
  return style;
}
