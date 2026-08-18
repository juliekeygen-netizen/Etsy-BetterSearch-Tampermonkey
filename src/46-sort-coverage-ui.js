'use strict';

function ebsSortCoverageDraft() {
  if (!scanSettingsUi.draft) return ebsNormalizeSortCoverage(sortCoverageCfg);
  if (!scanSettingsUi.draft.sortCoverage) scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(sortCoverageCfg);
  scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(scanSettingsUi.draft.sortCoverage);
  return scanSettingsUi.draft.sortCoverage;
}

function ebsSortCoverageSection() {
  const draft = ebsSortCoverageDraft();
  const enabled = new Set(draft.enabled);
  const section = document.createElement('section');
  section.className = 'ebs-settings-section ebs-sort-coverage-section';

  const header = document.createElement('header');
  header.className = 'ebs-settings-section-header';
  const title = document.createElement('h3');
  title.textContent = 'SORT COVERAGE';
  const description = document.createElement('p');
  description.textContent = 'Optionally scan multiple native Etsy sort modes for every Strict-title or Multi-search query, then merge duplicate listings.';
  header.append(title, description);
  section.append(header);

  const content = document.createElement('div');
  content.className = 'ebs-sort-coverage-content';

  const summary = document.createElement('div');
  summary.className = 'ebs-sort-coverage-summary';
  if (enabled.size === 0) {
    summary.innerHTML = '<strong>Native sort only.</strong> With every option off, BetterSearch behaves like before and scans whichever sort mode is selected in Etsy\'s own dropdown.';
  } else {
    summary.innerHTML = `<strong>${enabled.size} sort ${enabled.size === 1 ? 'mode' : 'modes'} enabled.</strong> Each generated search is scanned once per enabled mode. More modes can find additional candidates, but also increase the number of pages requested.`;
  }
  content.append(summary);

  const grid = document.createElement('div');
  grid.className = 'ebs-sort-toggle-grid';
  for (const mode of ETSY_SORT_MODES) {
    const label = document.createElement('label');
    label.className = `ebs-sort-toggle${enabled.has(mode.key) ? ' is-enabled' : ''}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ebs-check';
    checkbox.checked = enabled.has(mode.key);
    const copy = document.createElement('span');
    copy.textContent = mode.label;
    checkbox.addEventListener('change', () => {
      const next = new Set(ebsSortCoverageDraft().enabled);
      if (checkbox.checked) next.add(mode.key);
      else next.delete(mode.key);
      const current = ebsSortCoverageDraft();
      const priority = current.displayPriority !== 'auto' && !next.has(current.displayPriority) ? 'auto' : current.displayPriority;
      scanSettingsUi.draft.sortCoverage = { enabled: Array.from(next), displayPriority: priority };
      redrawScanSettingsModal();
    });
    label.append(checkbox, copy);
    grid.append(label);
  }
  content.append(grid);

  const displayRow = document.createElement('div');
  displayRow.className = 'ebs-sort-display-row';
  const displayCopy = document.createElement('div');
  displayCopy.className = 'ebs-setting-copy';
  const displayLabel = document.createElement('span');
  displayLabel.className = 'ebs-setting-label';
  displayLabel.textContent = 'Merged result display priority';
  const displayHelp = document.createElement('span');
  displayHelp.className = 'ebs-setting-help';
  displayHelp.innerHTML = enabled.size
    ? '<strong>Auto is recommended.</strong> Auto prioritizes Most relevant, then Top reviews, Newest, low price, and high price among the modes you enabled. Listings unique to lower-priority modes are appended after higher-priority results.'
    : 'Available when sort coverage is enabled. With all modes off, Etsy\'s current native sort controls the result order.';
  displayCopy.append(displayLabel, displayHelp);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'ebs-setting-control';
  const selectOptions = [['auto', 'Auto (recommended)']];
  for (const key of EBS_SORT_AUTO_PRIORITY) {
    if (!enabled.has(key)) continue;
    const mode = ebsSortMode(key);
    if (mode) selectOptions.push([mode.key, mode.label]);
  }
  const selectedPriority = draft.displayPriority !== 'auto' && enabled.has(draft.displayPriority) ? draft.displayPriority : 'auto';
  const select = ebsSettingsSelect(selectedPriority, selectOptions, 'Merged result display priority', (value) => {
    const current = ebsSortCoverageDraft();
    scanSettingsUi.draft.sortCoverage = { ...current, displayPriority: value };
  });
  select.disabled = enabled.size === 0;
  selectWrap.append(select);
  displayRow.append(displayCopy, selectWrap);
  content.append(displayRow);

  const note = document.createElement('p');
  note.className = 'ebs-sort-coverage-note';
  note.textContent = 'Sort coverage changes candidate discovery, not the title rules themselves. The same listing found by several sort modes is kept only once.';
  content.append(note);

  section.append(content);
  return section;
}

var ebsRedrawScanSettingsBeforeSortCoverage = redrawScanSettingsModal;
redrawScanSettingsModal = function redrawScanSettingsWithSortCoverage() {
  ebsRedrawScanSettingsBeforeSortCoverage();
  const layer = scanSettingsUi.modal;
  const body = layer?.querySelector('[data-ebs-scan-settings-body]');
  if (!body || body.querySelector('.ebs-sort-coverage-section')) return;
  const intro = body.querySelector('.ebs-settings-intro');
  const section = ebsSortCoverageSection();
  if (intro) intro.insertAdjacentElement('afterend', section);
  else body.prepend(section);
};

var ebsOpenScanSettingsBeforeSortCoverage = openScanSettingsModal;
openScanSettingsModal = function openScanSettingsWithSortCoverage() {
  ebsOpenScanSettingsBeforeSortCoverage();
  if (!scanSettingsUi.modal || !scanSettingsUi.draft) return;
  scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(sortCoverageCfg);
  redrawScanSettingsModal();
};

var ebsApplyScanSettingsBeforeSortCoverage = applyScanSettingsModal;
applyScanSettingsModal = function applyScanSettingsWithSortCoverage() {
  if (scanSettingsUi.draft?.sortCoverage) ebsSaveSortCoverage(scanSettingsUi.draft.sortCoverage);
  return ebsApplyScanSettingsBeforeSortCoverage();
};

GM_addStyle(`
  .ebs-sort-coverage-section { margin-top:16px; }
  .ebs-sort-coverage-content { display:grid; gap:12px; padding:12px 13px 13px; }
  .ebs-sort-coverage-summary { padding:9px 10px; border:1px solid #e3e2dc; border-radius:8px; background:#faf9f5; color:#666; font-size:11.5px; line-height:1.48; }
  .ebs-sort-coverage-summary strong { color:#333; }
  .ebs-sort-toggle-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  .ebs-sort-toggle { display:flex; align-items:center; gap:8px; min-height:40px; padding:0 10px; border:1px solid #deded8; border-radius:8px; background:#fff; color:#333; font-size:12px; cursor:pointer; }
  .ebs-sort-toggle:hover { border-color:#aaa; background:#faf9f5; }
  .ebs-sort-toggle.is-enabled { border-color:#aaa; background:#f5f4ef; }
  .ebs-sort-toggle .ebs-check { flex:0 0 15px; }
  .ebs-sort-display-row { display:grid; grid-template-columns:minmax(180px,1fr) minmax(180px,240px); gap:14px 24px; align-items:center; padding-top:2px; }
  .ebs-sort-coverage-note { margin:0; color:#7a7a74; font-size:11px; line-height:1.45; }

  @media (max-width:760px) {
    .ebs-sort-toggle-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .ebs-sort-display-row { grid-template-columns:1fr; gap:7px; }
    .ebs-sort-display-row .ebs-setting-control,.ebs-sort-display-row .ebs-select { width:100%; }
  }
  @media (max-width:420px) {
    .ebs-sort-toggle-grid { grid-template-columns:1fr; }
  }
`);
