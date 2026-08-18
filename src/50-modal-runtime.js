function closeRowMenu() {
    state.modalMenu?.node?.remove();
    state.modalMenu = null;
}

function clearDropIndicators() {
    state.modal?.querySelectorAll('.is-drop-before,.is-drop-after').forEach((node) => node.classList.remove('is-drop-before', 'is-drop-after'));
}

function moveRule(rules, ruleId, direction) {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    const target = index + (direction === 'up' ? -1 : 1);
    if (index < 0 || target < 0 || target >= rules.length) return;
    const [rule] = rules.splice(index, 1);
    rules.splice(target, 0, rule);
}

function duplicateRule(rules, ruleId) {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return;
    const copy = clone(rules[index]);
    copy.id = id();
    rules.splice(index + 1, 0, copy);
}

function openRowMenu(rule, trigger) {
    closeRowMenu();
    const rules = state.modalDraft;
    const index = rules.findIndex((item) => item.id === rule.id);
    const menu = document.createElement('div');
    menu.className = 'ebs-row-menu';
    menu.setAttribute('role', 'menu');
    const actions = [
        ['up', 'Move up', index <= 0],
        ['down', 'Move down', index < 0 || index >= rules.length - 1],
        ['duplicate', 'Duplicate rule', false],
        ['delete', 'Delete rule', rules.length <= 1],
    ];
    for (const [action, label, disabled] of actions) {
        const button = createButton(label, action === 'delete' ? 'is-danger' : '');
        button.className = action === 'delete' ? 'is-danger' : '';
        button.disabled = disabled;
        button.setAttribute('role', 'menuitem');
        button.addEventListener('click', () => {
            if (action === 'up' || action === 'down') moveRule(rules, rule.id, action);
            else if (action === 'duplicate') duplicateRule(rules, rule.id);
            else if (action === 'delete') rules.splice(index, 1);
            normalizeRuleConnectors(rules);
            closeRowMenu();
            redrawMultiModal();
        });
        menu.append(button);
    }
    document.body.append(menu);
    const box = trigger.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.right - menuBox.width, innerWidth - menuBox.width - 8));
    const top = box.bottom + 5 + menuBox.height <= innerHeight - 8 ? box.bottom + 5 : Math.max(8, box.top - menuBox.height - 5);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    state.modalMenu = { node: menu, trigger, id: rule.id };
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function renderRuleRow(rule, index, errors) {
    const row = document.createElement('article');
    row.className = `ebs-rule${errors.has(rule.id) ? ' is-invalid' : ''}`;
    row.dataset.ruleId = rule.id;
    const primary = document.createElement('div');
    primary.className = 'ebs-rule-primary';

    const drag = createButton('⠿', 'ebs-drag');
    drag.className = 'ebs-drag';
    drag.draggable = true;
    drag.setAttribute('aria-label', 'Drag rule to reorder');
    drag.title = 'Drag to reorder';
    drag.addEventListener('dragstart', (event) => {
        state.modalDrag = { id: rule.id };
        event.dataTransfer?.setData('text/plain', rule.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        drag.classList.add('is-dragging');
    });
    drag.addEventListener('dragend', () => {
        drag.classList.remove('is-dragging');
        state.modalDrag = null;
        clearDropIndicators();
    });
    primary.append(drag);

    primary.append(createCheck(rule.enabled, 'Enable rule', (enabled) => {
        rule.enabled = enabled;
        redrawMultiModal({ preserveScroll: true });
    }));

    const logicCell = document.createElement('div');
    logicCell.className = 'ebs-logic';
    const logicOptions = rule.polarity === 'exclude' ? [['and', 'AND']] : LOGIC_OPTIONS;
    logicCell.append(createSelect(rule.polarity === 'exclude' ? 'and' : rule.logic, logicOptions, 'Rule logic', (logic) => {
        rule.logic = logic === 'and' ? 'and' : 'or';
        redrawMultiModal({ preserveScroll: true });
    }, rule.polarity === 'exclude'));
    primary.append(logicCell);

    const fieldCell = document.createElement('div');
    fieldCell.className = 'ebs-field';
    fieldCell.append(createSelect('title', FIELD_OPTIONS, 'Rule field', () => {}, false));
    primary.append(fieldCell);

    const polarityCell = document.createElement('div');
    polarityCell.className = 'ebs-polarity';
    polarityCell.append(createSelect(rule.polarity, POLARITY_OPTIONS, 'Match or exclude', (polarity) => {
        rule.polarity = polarity === 'exclude' ? 'exclude' : 'match';
        if (rule.polarity === 'exclude') rule.logic = 'and';
        redrawMultiModal({ preserveScroll: true });
    }));
    primary.append(polarityCell);

    const conditionCell = document.createElement('div');
    conditionCell.className = 'ebs-condition';
    conditionCell.append(createSelect(rule.operator, TEXT_OPERATORS, 'Title condition', (operator) => {
        rule.operator = TEXT_OPERATORS.some(([key]) => key === operator) ? operator : 'contains';
        if (rule.operator !== 'contains') {
            rule.options.wholeWord = false;
            rule.options.matchAnyWord = false;
        }
        redrawMultiModal({ preserveScroll: true });
    }));
    primary.append(conditionCell);

    const valueCell = document.createElement('div');
    valueCell.className = 'ebs-value';
    valueCell.append(createInput(rule.value, 'Text', 'Title value', (value) => {
        rule.value = value;
        updateModalMetaAndPreview();
    }));
    primary.append(valueCell);

    const menu = createButton('...', 'ebs-menu-toggle');
    menu.className = 'ebs-menu-toggle';
    menu.setAttribute('aria-label', 'Rule actions');
    menu.setAttribute('aria-haspopup', 'menu');
    menu.addEventListener('click', () => openRowMenu(rule, menu));
    primary.append(menu);
    row.append(primary);

    const secondary = document.createElement('div');
    secondary.className = 'ebs-rule-secondary';
    const options = document.createElement('div');
    options.className = 'ebs-text-options';
    const optionDefs = rule.operator === 'contains'
        ? [['caseSensitive', 'Case sensitive'], ['wholeWord', 'Exact word / phrase'], ['matchAnyWord', 'Any word']]
        : [['caseSensitive', 'Case sensitive']];
    for (const [key, label] of optionDefs) {
        const wrapper = document.createElement('label');
        wrapper.className = 'ebs-check-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ebs-check';
        checkbox.checked = rule.options?.[key] === true;
        checkbox.addEventListener('change', () => {
            rule.options = { ...rule.options, [key]: checkbox.checked };
            updateModalMetaAndPreview();
        });
        wrapper.append(checkbox, document.createTextNode(label));
        options.append(wrapper);
    }
    secondary.append(options);
    row.append(secondary);

    if (errors.has(rule.id)) {
        const error = document.createElement('p');
        error.className = 'ebs-rule-error';
        error.textContent = errors.get(rule.id);
        row.append(error);
    }

    row.addEventListener('dragover', (event) => {
        if (!state.modalDrag || state.modalDrag.id === rule.id) return;
        event.preventDefault();
        clearDropIndicators();
        const box = row.getBoundingClientRect();
        row.classList.add(event.clientY > box.top + box.height / 2 ? 'is-drop-after' : 'is-drop-before');
    });
    row.addEventListener('drop', (event) => {
        if (!state.modalDrag || state.modalDrag.id === rule.id) return;
        event.preventDefault();
        const rules = state.modalDraft;
        const from = rules.findIndex((item) => item.id === state.modalDrag.id);
        const target = rules.findIndex((item) => item.id === rule.id);
        if (from < 0 || target < 0) return;
        const after = row.classList.contains('is-drop-after');
        const [moved] = rules.splice(from, 1);
        let nextTarget = rules.findIndex((item) => item.id === rule.id);
        if (after) nextTarget += 1;
        rules.splice(Math.max(0, nextTarget), 0, moved);
        state.modalDrag = null;
        clearDropIndicators();
        redrawMultiModal();
    });
    return row;
}

function updateModalMetaAndPreview() {
    if (!state.modal) return;
    const rules = state.modalDraft || [];
    const counts = modalCounts(rules);
    const countText = state.modal.querySelector('[data-ebs-rule-counts]');
    if (countText) countText.textContent = `${counts.total} ${counts.total === 1 ? 'rule' : 'rules'} · ${counts.enabled} enabled`;
    const preview = previewPlan(rules);
    const summary = state.modal.querySelector('[data-ebs-preview-summary]');
    if (summary) summary.textContent = `Search preview · ${preview.plan.searches.length} ${preview.plan.searches.length === 1 ? 'search' : 'searches'} · ${preview.plan.shared.length} shared ${preview.plan.shared.length === 1 ? 'rule' : 'rules'}`;
    const pre = state.modal.querySelector('[data-ebs-preview-text]');
    if (pre) pre.textContent = preview.lines.join('\n');
}

function redrawMultiModal({ preserveScroll = false, errors = new Map() } = {}) {
    if (!state.modal) return;
    closeRowMenu();
    const body = state.modal.querySelector('[data-ebs-modal-body]');
    if (!body) return;
    const scrollTop = preserveScroll ? body.scrollTop : 0;
    body.replaceChildren();
    const headings = document.createElement('div');
    headings.className = 'ebs-columns';
    for (const [cls, text] of [['logic', 'LOGIC'], ['field', 'FIELD'], ['polarity', 'MATCH / EXCLUDE'], ['condition', 'OPTIONS']]) {
        const span = document.createElement('span');
        span.className = `is-${cls}`;
        span.textContent = text;
        headings.append(span);
    }
    body.append(headings);
    state.modalDraft.forEach((rule, index) => body.append(renderRuleRow(rule, index, errors)));

    const actions = document.createElement('div');
    actions.className = 'ebs-actions';
    const add = createButton('+ Add rule', 'ebs-button');
    add.addEventListener('click', () => {
        state.modalDraft.push(defaultRule(state.modalDraft.some((rule) => rule.polarity === 'match' && rule.logic === 'or') ? 'or' : 'or'));
        redrawMultiModal({ preserveScroll: true });
        requestAnimationFrame(() => {
            body.scrollTop = body.scrollHeight;
            body.querySelector('.ebs-rule:last-of-type .ebs-input')?.focus();
        });
    });
    actions.append(add);
    body.append(actions);

    const details = document.createElement('details');
    details.className = 'ebs-preview';
    details.open = state.modalPreviewOpen;
    details.addEventListener('toggle', () => { state.modalPreviewOpen = details.open; });
    const summary = document.createElement('summary');
    summary.dataset.ebsPreviewSummary = '';
    const pre = document.createElement('pre');
    pre.dataset.ebsPreviewText = '';
    details.append(summary, pre);
    body.append(details);
    updateModalMetaAndPreview();
    if (preserveScroll) body.scrollTop = scrollTop;
}

function openMultiModal() {
    closeStrictPopup();
    if (state.modal) return;
    ensureRulesSeeded();
    state.modalDraft = clone(cfg.multiRules);
    const layer = document.createElement('div');
    layer.className = 'ebs-modal-layer';
    layer.dataset.ebsModalLayer = '';
    layer.innerHTML = `
        <section class="ebs-modal" role="dialog" aria-modal="true" aria-labelledby="ebs-modal-title">
            <header class="ebs-modal-header">
                <h2 class="ebs-modal-title" id="ebs-modal-title">MULTI-SEARCH</h2>
                <div class="ebs-modal-meta"><p data-ebs-rule-counts></p></div>
            </header>
            <div class="ebs-modal-editor">
                <div class="ebs-modal-body" data-ebs-modal-body></div>
            </div>
            <footer class="ebs-modal-footer">
                <span class="ebs-draft-note">Draft changes are not applied until Apply.</span>
                <button type="button" class="ebs-button is-quiet" data-ebs-cancel>Cancel</button>
                <button type="button" class="ebs-button is-primary" data-ebs-apply>Apply</button>
            </footer>
        </section>`;
    document.body.append(layer);
    state.modal = layer;
    lockPageScroll();
    redrawMultiModal();

    layer.querySelector('[data-ebs-cancel]').addEventListener('click', closeMultiModal);
    layer.querySelector('[data-ebs-apply]').addEventListener('click', applyMultiModal);
    layer.addEventListener('pointerdown', (event) => {
        if (event.target === layer) closeMultiModal();
    });
    requestAnimationFrame(() => layer.querySelector('.ebs-rule .ebs-input, [data-ebs-apply]')?.focus({ preventScroll: true }));
}

function closeMultiModal() {
    closeRowMenu();
    state.modal?.remove();
    state.modal = null;
    state.modalDraft = null;
    state.modalDrag = null;
    unlockPageScroll();
    document.querySelector('[data-ebs-multi-settings]')?.setAttribute('aria-expanded', 'false');
}

function applyMultiModal() {
    if (!state.modal || !state.modalDraft) return;
    const normalized = normalizeRuleConnectors(normalizeRules(state.modalDraft));
    const errors = validateRules(normalized);
    if (errors.size) {
        state.modalDraft = normalized;
        redrawMultiModal({ errors });
        const firstId = errors.keys().next().value;
        state.modal.querySelector(`[data-rule-id="${CSS.escape(firstId)}"]`)?.scrollIntoView({ block: 'center' });
        return;
    }
    save('multiRules', normalized);
    const plan = compileMultiPlan(normalized);
    const display = multiDisplayQuery(plan);
    save('multiQuery', display);
    const wasMulti = cfg.multi;
    if (!wasMulti) save('multi', true);
    updateButtons();
    closeMultiModal();
    stopScan();
    invalidateCache();
    restoreNative();

    if (!isSearchPage()) return;
    const desired = searchUrl(display, modeSwitchFilters());
    if (desired.href !== location.href) location.assign(desired.href);
    else reapply();
}

function replaceQuickMultiOrRules(raw) {
    const parts = String(raw || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!parts.length) return false;
    ensureRulesSeeded();
    const rules = clone(cfg.multiRules);
    const firstOrIndex = rules.findIndex((rule) => rule.polarity === 'match' && rule.logic === 'or');
    const kept = rules.filter((rule) => !(rule.polarity === 'match' && rule.logic === 'or'));
    const insertion = firstOrIndex < 0 ? kept.findIndex((rule) => rule.polarity === 'exclude') : Math.min(firstOrIndex, kept.length);
    const newRules = parts.map((value) => defaultRule('or', value));
    const target = insertion < 0 ? kept.length : insertion;
    kept.splice(target, 0, ...newRules);
    save('multiRules', normalizeRuleConnectors(kept));
    save('multiQuery', raw.trim());
    return true;
}

function scheduleSync(delay = 180) {
    clearTimeout(state.timer);
    state.timer = setTimeout(sync, delay);
}

function sync() {
    state.lastUrl = location.href;
    if (!isSearchPage()) {
        stopScan();
        closeStrictPopup();
        closeMultiModal();
        document.body?.classList.remove('ebs-results-active');
        return;
    }
    if (maybeRestoreFilters()) return;
    captureFilters();
    seedQueryState();
    saveActiveQuery();
    if (cfg.multi) ensureRulesSeeded();
    ensureUI();

    if (!(cfg.multi || cfg.strict)) {
        restoreNative();
        showStatus(null);
        return;
    }
    const sig = signature();
    if (state.rendered && state.renderSig !== sig) restoreNative();
    if (state.rendered && state.renderSig === sig) return showStatus(state.status);
    if (state.scanningSig === sig) return showStatus(state.status);
    if (state.retryTimer && state.retrySig === sig) return showStatus(state.status);
    if (state.cacheReady && state.cacheSig === sig) return renderResults(sig, 'done');
    scan();
}

document.addEventListener('submit', (event) => {
    const form = event.target?.closest?.('#gnav-search');
    if (!form) return;
    const input = form.querySelector('#global-enhancements-search-query, [data-search-input], input[name="search_query"]');
    const q = input?.value?.trim();
    if (!q) return;

    if (cfg.multi) {
        event.preventDefault();
        event.stopImmediatePropagation();
        replaceQuickMultiOrRules(q);
        stopScan();
        invalidateCache();
        restoreNative();
        const display = multiDisplayQuery();
        save('multiQuery', display);
        location.assign(searchUrl(display, cfg.keep ? cfg.filters : filterEntries(new URL(location.href))).href);
        return;
    }

    save('singleQuery', q);
    if (cfg.keep) {
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(searchUrl(q, cfg.filters).href);
    }
}, true);

document.addEventListener('click', (event) => {
    if (state.strictPopup && !state.strictPopup.hidden && !state.strictPopup.contains(event.target) && !state.strictPopupAnchor?.contains(event.target)) closeStrictPopup();
    if (state.modalMenu && !state.modalMenu.node.contains(event.target) && !state.modalMenu.trigger.contains(event.target)) closeRowMenu();

    const card = event.target?.closest?.('[data-ebs-transplanted="1"]');
    if (card) {
        const favorite = favoriteButtonFromEvent(event.target);
        if (favorite) {
            event.preventDefault();
            event.stopImmediatePropagation();
            bridgeFavorite(card, favorite);
        }
    }
}, true);

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.modalMenu) { closeRowMenu(); return; }
    if (state.modal) { closeMultiModal(); return; }
    closeStrictPopup();
});

window.addEventListener('resize', () => {
    positionStrictPopup();
    scheduleFit();
}, { passive: true });
window.addEventListener('scroll', positionStrictPopup, { passive: true, capture: true });
window.addEventListener('popstate', () => scheduleSync(50));
window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    abortActiveScan();
    clearAutoRetry(true);
    invalidateCache();
    state.rendered = false;
    state.nativeGrid = null;
    state.nativeHTML = '';
    state.nativeNodes = new Map();
    state.nativeOrder = [];
    document.querySelector('[data-ebs-results-grid-host]')?.remove();
    scheduleSync(50);
});
window.addEventListener('pagehide', () => abortActiveScan());

new MutationObserver(() => scheduleSync(220)).observe(document.body, { childList: true, subtree: true });

for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
        const result = original.apply(this, args);
        scheduleSync(50);
        return result;
    };
}

setInterval(() => {
    if (location.href !== state.lastUrl) scheduleSync(50);
}, 700);

sync();
