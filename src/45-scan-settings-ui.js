'use strict';

function ebsSettingsIconMarkup() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path></svg>';
}

function ebsSettingsSelect(value, items, ariaLabel, onChange) {
  const select = document.createElement('select');
  select.className = 'ebs-select';
  select.setAttribute('aria-label', ariaLabel);
  for (const [key, label] of items) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    option.selected = key === value;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function ebsSettingsNumber(value, ariaLabel, onInput, unit = '', minimum = 0) {
  const wrap = document.createElement('div');
  wrap.className = 'ebs-setting-number';
  const input = document.createElement('input');
  input.className = 'ebs-input';
  input.type = 'number';
  input.inputMode = 'numeric';
  input.step = '1';
  input.min = String(minimum);
  input.value = String(value ?? 0);
  input.setAttribute('aria-label', ariaLabel);
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(input);
  if (unit) {
    const suffix = document.createElement('span');
    suffix.className = 'ebs-setting-unit';
    suffix.textContent = unit;
    wrap.append(suffix);
  }
  return wrap;
}

function ebsSettingsToggle(checked, labelText, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'ebs-settings-toggle';
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'ebs-check';
  input.checked = checked === true;
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, document.createTextNode(labelText));
  wrap.append(label);
  return wrap;
}

function ebsSettingRow(label, help, control) {
  const row = document.createElement('div');
  row.className = 'ebs-setting-row';
  const copy = document.createElement('div');
  copy.className = 'ebs-setting-copy';
  const title = document.createElement('span');
  title.className = 'ebs-setting-label';
  title.textContent = label;
  const note = document.createElement('span');
  note.className = 'ebs-setting-help';
  note.innerHTML = help;
  copy.append(title, note);
  const controlWrap = document.createElement('div');
  controlWrap.className = 'ebs-setting-control';
  controlWrap.append(control);
  row.append(copy, controlWrap);
  return row;
}

function ebsSettingsSection(title, description, rows, extra = null) {
  const section = document.createElement('section');
  section.className = 'ebs-settings-section';
  const header = document.createElement('header');
  header.className = 'ebs-settings-section-header';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  header.append(heading, text);
  section.append(header, ...rows);
  if (extra) section.append(extra);
  return section;
}

function scanSettingsDraftCustom() {
  if (!scanSettingsUi.draft) return normalizeScanCustom(scanCfg.custom);
  scanSettingsUi.draft.custom = normalizeScanCustom(scanSettingsUi.draft.custom);
  return scanSettingsUi.draft.custom;
}

function redrawScanSettingsModal() {
  const layer = scanSettingsUi.modal;
  const draft = scanSettingsUi.draft;
  if (!layer || !draft) return;
  const body = layer.querySelector('[data-ebs-scan-settings-body]');
  if (!body) return;
  const scrollTop = body.scrollTop;
  body.replaceChildren();

  const intro = document.createElement('div');
  intro.className = 'ebs-settings-intro';
  const kicker = document.createElement('p');
  kicker.className = 'ebs-settings-kicker';
  kicker.textContent = 'Scan preset';
  const presets = document.createElement('div');
  presets.className = 'ebs-preset-grid';
  for (const key of ['safe', 'balanced', 'fast', 'custom']) {
    const info = SCAN_PRESET_INFO[key];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ebs-preset${draft.preset === key ? ' is-active' : ''}`;
    button.textContent = info.label;
    button.setAttribute('aria-pressed', String(draft.preset === key));
    button.addEventListener('click', () => {
      draft.preset = key;
      redrawScanSettingsModal();
    });
    presets.append(button);
  }

  const detail = document.createElement('div');
  detail.className = 'ebs-preset-detail';
  const info = SCAN_PRESET_INFO[draft.preset] || SCAN_PRESET_INFO.balanced;
  const detailTitle = document.createElement('strong');
  detailTitle.textContent = info.label;
  const description = document.createElement('span');
  description.textContent = info.description;
  const summary = document.createElement('span');
  summary.className = 'ebs-preset-summary';
  summary.textContent = draft.preset === 'custom' ? scanSettingsSummary(normalizeScanCustom(draft.custom)) : info.summary;
  detail.append(detailTitle, description, summary);
  intro.append(kicker, presets, detail);
  body.append(intro);

  const meta = layer.querySelector('[data-ebs-scan-preset-meta]');
  if (meta) meta.textContent = `${info.label} preset`;

  if (draft.preset !== 'custom') {
    body.scrollTop = scrollTop;
    return;
  }

  const custom = scanSettingsDraftCustom();
  const customHost = document.createElement('div');
  customHost.className = 'ebs-custom-settings';

  const setCustom = (key, value) => {
    draft.custom = { ...draft.custom, [key]: value };
    const summaryNode = layer.querySelector('.ebs-preset-summary');
    if (summaryNode) summaryNode.textContent = scanSettingsSummary(normalizeScanCustom(draft.custom));
  };

  customHost.append(ebsSettingsSection('PERFORMANCE', 'Controls how quickly background result pages are requested.', [
    ebsSettingRow('Concurrent page requests', '<strong>Recommended max: 6.</strong> Higher values are allowed, but can cause more request failures and may become slower instead of faster.', ebsSettingsNumber(custom.concurrency, 'Concurrent page requests', (value) => setCustom('concurrency', value), '', 1)),
    ebsSettingRow('Request spacing', '<strong>Recommended: 0–500 ms.</strong> 0 is fastest. A small delay can make high-concurrency scans more stable.', ebsSettingsNumber(custom.spacingMs, 'Request spacing in milliseconds', (value) => setCustom('spacingMs', value), 'ms', 0)),
    ebsSettingRow('Scan order', '<strong>Recommended: Round-robin.</strong> It gives every Multi-search branch results early instead of finishing one search first.', ebsSettingsSelect(custom.scanOrder, [['roundRobin', 'Round-robin'], ['searchBySearch', 'Search-by-search']], 'Scan order', (value) => setCustom('scanOrder', value))),
  ]));

  const coverageWarning = document.createElement('p');
  coverageWarning.className = 'ebs-settings-warning';
  coverageWarning.textContent = 'Coverage options can intentionally stop before Etsy’s full result pool has been scanned. BetterSearch marks those results as a limited scan.';
  customHost.append(ebsSettingsSection('COVERAGE', 'Use these when you want speed more than exhaustive results. Use 0 for unlimited/all.', [
    ebsSettingRow('Maximum pages per search', '<strong>0 = all pages.</strong> There is no small enforced maximum; lowering this is one of the biggest ways to make huge searches faster.', ebsSettingsNumber(custom.maxPages, 'Maximum pages per search', (value) => setCustom('maxPages', value), 'pages', 0)),
    ebsSettingRow('Stop after matches', '<strong>0 = all matches.</strong> The scanner stops scheduling new pages after approximately this many matching listings have been found.', ebsSettingsNumber(custom.stopAfter, 'Stop after matching listings', (value) => setCustom('stopAfter', value), 'matches', 0)),
    ebsSettingRow('Show partial matches while scanning', 'Off keeps the clean full-page scanning screen. On lets you browse matches as they arrive, but the grid can move while new cards are added.', ebsSettingsToggle(custom.showPartial, 'Show results progressively', (value) => setCustom('showPartial', value))),
  ], coverageWarning));

  customHost.append(ebsSettingsSection('RECOVERY', 'Controls what happens when an Etsy result-page request fails.', [
    ebsSettingRow('Failed-page retries', '<strong>Recommended max: 3.</strong> Higher values are allowed, but a repeatedly failing page can hold up the scan for much longer.', ebsSettingsNumber(custom.pageRetries, 'Failed page retries', (value) => setCustom('pageRetries', value), 'retries', 0)),
    ebsSettingRow('Whole-scan retries', '<strong>Recommended max: 3.</strong> This retries the complete scan if individual page recovery still leaves it incomplete.', ebsSettingsNumber(custom.scanRetries, 'Whole scan retries', (value) => setCustom('scanRetries', value), 'retries', 0)),
    ebsSettingRow('Retry delay', '<strong>Recommended: Normal.</strong> Fast retries sooner; Patient waits longer before retrying failed requests.', ebsSettingsSelect(custom.retryProfile, [['fast', 'Fast'], ['normal', 'Normal'], ['patient', 'Patient']], 'Retry delay profile', (value) => setCustom('retryProfile', value))),
    ebsSettingRow('Adaptive slowdown', '<strong>Recommended: On.</strong> If a retry round has failures, BetterSearch temporarily reduces concurrency and adds a little spacing for that scan.', ebsSettingsToggle(custom.adaptiveSlowdown, 'Slow down after request errors', (value) => setCustom('adaptiveSlowdown', value))),
  ]));

  customHost.append(ebsSettingsSection('OPTIMIZATIONS', 'Small scanner optimizations that do not intentionally reduce result coverage.', [
    ebsSettingRow('Reuse current Etsy page', '<strong>Recommended: On.</strong> When the visible Etsy page is one of the required searches, BetterSearch reads it directly instead of downloading that page again.', ebsSettingsToggle(custom.reuseCurrentPage, 'Reuse the already-loaded page', (value) => setCustom('reuseCurrentPage', value))),
  ]));

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'ebs-button is-quiet ebs-settings-reset';
  reset.textContent = 'Reset Custom to Balanced values';
  reset.addEventListener('click', () => {
    draft.custom = { ...SCAN_PRESETS.balanced };
    redrawScanSettingsModal();
  });
  customHost.append(reset);
  body.append(customHost);
  body.scrollTop = scrollTop;
}

function openScanSettingsModal() {
  closeStrictPopup();
  if (scanSettingsUi.modal) return;
  scanSettingsUi.draft = { preset: scanCfg.preset, custom: normalizeScanCustom(scanCfg.custom) };
  const layer = document.createElement('div');
  layer.className = 'ebs-modal-layer';
  layer.dataset.ebsScanSettingsLayer = '';
  layer.innerHTML = `
    <section class="ebs-modal ebs-scan-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ebs-scan-settings-title">
      <header class="ebs-modal-header">
        <h2 class="ebs-modal-title" id="ebs-scan-settings-title">SCAN SETTINGS</h2>
        <div class="ebs-modal-meta"><p data-ebs-scan-preset-meta></p></div>
      </header>
      <div class="ebs-modal-editor">
        <div class="ebs-settings-body" data-ebs-scan-settings-body></div>
      </div>
      <footer class="ebs-modal-footer">
        <span class="ebs-draft-note">Draft changes are not applied until Apply.</span>
        <button type="button" class="ebs-button is-quiet" data-ebs-scan-settings-cancel>Cancel</button>
        <button type="button" class="ebs-button is-primary" data-ebs-scan-settings-apply>Apply</button>
      </footer>
    </section>`;
  document.body.append(layer);
  scanSettingsUi.modal = layer;
  lockPageScroll();
  redrawScanSettingsModal();
  document.querySelector('[data-ebs-scan-settings]')?.setAttribute('aria-expanded', 'true');

  layer.querySelector('[data-ebs-scan-settings-cancel]').addEventListener('click', closeScanSettingsModal);
  layer.querySelector('[data-ebs-scan-settings-apply]').addEventListener('click', applyScanSettingsModal);
  layer.addEventListener('pointerdown', (event) => { if (event.target === layer) closeScanSettingsModal(); });
  requestAnimationFrame(() => layer.querySelector('.ebs-preset.is-active, [data-ebs-scan-settings-apply]')?.focus({ preventScroll: true }));
}

function closeScanSettingsModal() {
  scanSettingsUi.modal?.remove();
  scanSettingsUi.modal = null;
  scanSettingsUi.draft = null;
  unlockPageScroll();
  document.querySelector('[data-ebs-scan-settings]')?.setAttribute('aria-expanded', 'false');
}

function applyScanSettingsModal() {
  if (!scanSettingsUi.draft) return;
  const draft = scanSettingsUi.draft;
  saveScanSettings(draft.preset, draft.custom);
  closeScanSettingsModal();
  stopScan();
  invalidateCache();
  restoreNative();
  state.coverageLimited = false;
  if ((cfg.strict || cfg.multi) && isSearchPage()) reapply();
}

function ensureScanSettingsButton() {
  const root = document.querySelector('#ebs-controls');
  if (!root || root.querySelector('[data-ebs-scan-settings]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ebs-gear';
  button.dataset.ebsScanSettings = '';
  button.setAttribute('aria-label', 'Scan settings');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Scan settings';
  button.innerHTML = ebsSettingsIconMarkup();
  button.addEventListener('click', openScanSettingsModal);
  root.append(button);
  scheduleFit();
}

var ebsEnsureUIBeforeScanSettings = ensureUI;
ensureUI = function ensureUIWithScanSettings() {
  ebsEnsureUIBeforeScanSettings();
  ensureScanSettingsButton();
};

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !scanSettingsUi.modal) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeScanSettingsModal();
}, true);
