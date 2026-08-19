'use strict';

var ebsSortCoverageDragKey = '';

function ebsSortCoverageDraft() {
  if (!scanSettingsUi.draft) return ebsNormalizeSortCoverage(sortCoverageCfg);
  if (!scanSettingsUi.draft.sortCoverage) scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(sortCoverageCfg);
  scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(scanSettingsUi.draft.sortCoverage);
  return scanSettingsUi.draft.sortCoverage;
}

function ebsSetSortCoverageDraft(next) {
  scanSettingsUi.draft.sortCoverage = ebsNormalizeSortCoverage(next);
}

function ebsClearSortDropIndicators(section = document) {
  section.querySelectorAll?.('.ebs-sort-order-row.is-drop-before,.ebs-sort-order-row.is-drop-after')
    .forEach((row) => row.classList.remove('is-drop-before', 'is-drop-after'));
}

function ebsMoveSortOrderKey(key, targetKey, after = false) {
  const current = ebsSortCoverageDraft();
  const order = current.displayOrder.slice();
  const from = order.indexOf(key);
  if (from < 0 || key === targetKey) return;
  order.splice(from, 1);
  let target = order.indexOf(targetKey);
  if (target < 0) return;
  if (after) target += 1;
  order.splice(target, 0, key);
  ebsSetSortCoverageDraft({ ...current, displayOrder: order, displayMode: 'custom' });
}

function ebsMoveSortOrderStep(key, direction) {
  const current = ebsSortCoverageDraft();
  const enabled = new Set(current.enabled);
  const visible = current.displayOrder.filter((item) => enabled.has(item));
  const index = visible.indexOf(key);
  if (index < 0) return;
  if (direction === 'up' && index > 0) ebsMoveSortOrderKey(key, visible[index - 1], false);
  if (direction === 'down' && index < visible.length - 1) ebsMoveSortOrderKey(key, visible[index + 1], true);
}

function ebsSortOrderEditor(enabled, draft) {
  const wrap = document.createElement('div');
  wrap.className = 'ebs-sort-order-editor';

  const heading = document.createElement('div');
  heading.className = 'ebs-sort-order-heading';
  const copy = document.createElement('div');
  copy.className = 'ebs-setting-copy';
  const label = document.createElement('span');
  label.className = 'ebs-setting-label';
  label.textContent = 'Merged result display order';
  const help = document.createElement('span');
  help.className = 'ebs-setting-help';
  help.innerHTML = enabled.size
    ? '<strong>Auto is recommended.</strong> Choose Custom order to drag the enabled sort modes into the exact priority you want. Listings found in an earlier mode are placed before listings that only appear in lower-priority modes.'
    : 'Available when Sort Coverage is enabled. With all sort modes off, Etsy\'s current native sort controls the result order.';
  copy.append(label, help);

  const modeSwitch = document.createElement('div');
  modeSwitch.className = 'ebs-sort-order-mode';
  for (const [key, text] of [['auto', 'Auto'], ['custom', 'Custom order']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ebs-sort-mode-button${draft.displayMode === key ? ' is-active' : ''}`;
    button.textContent = key === 'auto' ? 'Auto (recommended)' : text;
    button.disabled = enabled.size === 0;
    button.setAttribute('aria-pressed', String(draft.displayMode === key));
    button.addEventListener('click', () => {
      const current = ebsSortCoverageDraft();
      ebsSetSortCoverageDraft({ ...current, displayMode: key });
      redrawScanSettingsModal();
    });
    modeSwitch.append(button);
  }
  heading.append(copy, modeSwitch);
  wrap.append(heading);

  if (!enabled.size) return wrap;

  const orderKeys = draft.displayMode === 'custom'
    ? draft.displayOrder.filter((key) => enabled.has(key))
    : EBS_SORT_AUTO_PRIORITY.filter((key) => enabled.has(key));

  const list = document.createElement('div');
  list.className = `ebs-sort-order-list${draft.displayMode === 'custom' ? ' is-custom' : ' is-auto'}`;
  list.setAttribute('aria-label', draft.displayMode === 'custom' ? 'Custom merged result display order' : 'Automatic merged result display order');

  orderKeys.forEach((key, index) => {
    const mode = ebsSortMode(key);
    if (!mode) return;
    const row = document.createElement('div');
    row.className = 'ebs-sort-order-row';
    row.dataset.sortKey = key;
    row.draggable = draft.displayMode === 'custom';

    const handle = document.createElement('span');
    handle.className = 'ebs-sort-order-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');

    const rank = document.createElement('span');
    rank.className = 'ebs-sort-order-rank';
    rank.textContent = String(index + 1);

    const name = document.createElement('span');
    name.className = 'ebs-sort-order-name';
    name.textContent = mode.label;

    const stateLabel = document.createElement('span');
    stateLabel.className = 'ebs-sort-order-state';
    stateLabel.textContent = draft.displayMode === 'auto' ? 'AUTO' : '';

    const actions = document.createElement('span');
    actions.className = 'ebs-sort-order-actions';
    if (draft.displayMode === 'custom') {
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'ebs-sort-order-step';
      up.textContent = '↑';
      up.title = 'Move up';
      up.setAttribute('aria-label', `Move ${mode.label} up`);
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        ebsMoveSortOrderStep(key, 'up');
        redrawScanSettingsModal();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'ebs-sort-order-step';
      down.textContent = '↓';
      down.title = 'Move down';
      down.setAttribute('aria-label', `Move ${mode.label} down`);
      down.disabled = index === orderKeys.length - 1;
      down.addEventListener('click', () => {
        ebsMoveSortOrderStep(key, 'down');
        redrawScanSettingsModal();
      });
      actions.append(up, down);
    }

    row.append(handle, rank, name, stateLabel, actions);

    row.addEventListener('dragstart', (event) => {
      if (draft.displayMode !== 'custom') {
        event.preventDefault();
        return;
      }
      ebsSortCoverageDragKey = key;
      row.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      ebsSortCoverageDragKey = '';
      row.classList.remove('is-dragging');
      ebsClearSortDropIndicators(list);
    });
    row.addEventListener('dragover', (event) => {
      if (draft.displayMode !== 'custom' || !ebsSortCoverageDragKey || ebsSortCoverageDragKey === key) return;
      event.preventDefault();
      ebsClearSortDropIndicators(list);
      const box = row.getBoundingClientRect();
      row.classList.add(event.clientY > box.top + box.height / 2 ? 'is-drop-after' : 'is-drop-before');
    });
    row.addEventListener('drop', (event) => {
      if (draft.displayMode !== 'custom' || !ebsSortCoverageDragKey || ebsSortCoverageDragKey === key) return;
      event.preventDefault();
      const after = row.classList.contains('is-drop-after');
      const dragged = ebsSortCoverageDragKey;
      ebsSortCoverageDragKey = '';
      ebsMoveSortOrderKey(dragged, key, after);
      ebsClearSortDropIndicators(list);
      redrawScanSettingsModal();
    });

    list.append(row);
  });

  wrap.append(list);

  const orderNote = document.createElement('p');
  orderNote.className = 'ebs-sort-order-note';
  orderNote.textContent = draft.displayMode === 'auto'
    ? 'Auto order: Most relevant → Top reviews → Newest → Price low → Price high, using only the sort modes you enabled.'
    : 'Drag the rows to reorder them. The ↑ / ↓ buttons provide the same control on touch devices.';
  wrap.append(orderNote);
  return wrap;
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
      const current = ebsSortCoverageDraft();
      const next = new Set(current.enabled);
      if (checkbox.checked) next.add(mode.key);
      else next.delete(mode.key);
      ebsSetSortCoverageDraft({ ...current, enabled: Array.from(next) });
      redrawScanSettingsModal();
    });
    label.append(checkbox, copy);
    grid.append(label);
  }
  content.append(grid);

  content.append(ebsSortOrderEditor(enabled, draft));

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

  .ebs-sort-order-editor { display:grid; gap:10px; padding-top:2px; }
  .ebs-sort-order-heading { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px 24px; align-items:center; }
  .ebs-sort-order-mode { display:inline-flex; gap:5px; padding:3px; border:1px solid #deded8; border-radius:9px; background:#f7f6f2; }
  .ebs-sort-mode-button { appearance:none; min-height:32px; padding:0 12px; border:0; border-radius:6px; background:transparent; color:#444; font:600 12px/1 inherit; cursor:pointer; }
  .ebs-sort-mode-button:hover:not(:disabled) { background:#ecebe6; }
  .ebs-sort-mode-button.is-active { background:#222; color:#fff; }
  .ebs-sort-mode-button:disabled { opacity:.42; cursor:default; }
  .ebs-sort-order-list { display:grid; gap:6px; }
  .ebs-sort-order-row { position:relative; display:grid; grid-template-columns:24px 28px minmax(0,1fr) auto auto; align-items:center; gap:8px; min-height:42px; padding:0 8px; border:1px solid #deded8; border-radius:8px; background:#fff; color:#333; }
  .ebs-sort-order-list.is-custom .ebs-sort-order-row { cursor:grab; }
  .ebs-sort-order-list.is-custom .ebs-sort-order-row:active,.ebs-sort-order-row.is-dragging { cursor:grabbing; }
  .ebs-sort-order-row.is-dragging { opacity:.48; }
  .ebs-sort-order-row.is-drop-before::before,.ebs-sort-order-row.is-drop-after::after { content:""; position:absolute; left:5px; right:5px; height:2px; border-radius:2px; background:#222; }
  .ebs-sort-order-row.is-drop-before::before { top:-4px; }
  .ebs-sort-order-row.is-drop-after::after { bottom:-4px; }
  .ebs-sort-order-handle { color:#888; font-size:16px; text-align:center; user-select:none; }
  .ebs-sort-order-list.is-auto .ebs-sort-order-handle { opacity:.28; }
  .ebs-sort-order-rank { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:999px; background:#f1f0eb; color:#666; font-size:11px; font-weight:700; }
  .ebs-sort-order-name { min-width:0; font-size:12px; font-weight:600; }
  .ebs-sort-order-state { color:#888; font-size:9px; font-weight:700; letter-spacing:.05em; }
  .ebs-sort-order-actions { display:flex; gap:4px; }
  .ebs-sort-order-step { appearance:none; display:inline-grid; place-items:center; width:30px; height:30px; padding:0; border:1px solid #deded8; border-radius:7px; background:#faf9f5; color:#333; font-size:15px; cursor:pointer; }
  .ebs-sort-order-step:hover:not(:disabled) { border-color:#aaa; background:#efeee9; }
  .ebs-sort-order-step:disabled { opacity:.3; cursor:default; }
  .ebs-sort-order-note,.ebs-sort-coverage-note { margin:0; color:#7a7a74; font-size:11px; line-height:1.45; }

  @media (max-width:760px) {
    .ebs-sort-toggle-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .ebs-sort-order-heading { grid-template-columns:1fr; gap:8px; }
    .ebs-sort-order-mode { width:100%; box-sizing:border-box; }
    .ebs-sort-mode-button { flex:1 1 50%; }
    .ebs-sort-order-row { grid-template-columns:22px 26px minmax(0,1fr) auto; gap:6px; }
    .ebs-sort-order-state { display:none; }
  }
  @media (max-width:420px) {
    .ebs-sort-toggle-grid { grid-template-columns:1fr; }
    .ebs-sort-order-row { padding-left:5px; padding-right:5px; }
    .ebs-sort-order-step { width:28px; }
  }
`);
