function createSelect(value, options, ariaLabel, onChange, disabled = false) {
    const select = document.createElement('select');
    select.className = 'ebs-select';
    select.setAttribute('aria-label', ariaLabel);
    select.disabled = disabled;
    for (const [key, label] of options) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = label;
        option.selected = key === value;
        select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function createInput(value, placeholder, ariaLabel, onInput) {
    const input = document.createElement('input');
    input.className = 'ebs-input';
    input.type = 'text';
    input.value = value ?? '';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('input', () => onInput(input.value));
    return input;
}

function createCheck(checked, ariaLabel, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'ebs-check-wrap';
    const input = document.createElement('input');
    input.className = 'ebs-check';
    input.type = 'checkbox';
    input.checked = checked === true;
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('change', () => onChange(input.checked));
    wrap.append(input);
    return wrap;
}

function createButton(text, className = 'ebs-button') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    return button;
}

function updateButtons() {
    const root = document.querySelector('#ebs-controls');
    if (!root) return;
    root.querySelector('[data-ebs-keep]')?.classList.toggle('ebs-active', cfg.keep);
    root.querySelector('[data-ebs-strict-split]')?.classList.toggle('ebs-active', cfg.strict);
    root.querySelector('[data-ebs-multi-split]')?.classList.toggle('ebs-active', cfg.multi);
    const keep = root.querySelector('[data-ebs-keep]');
    const strict = root.querySelector('[data-ebs-strict]');
    const multi = root.querySelector('[data-ebs-multi]');
    if (keep) { keep.textContent = cfg.keep ? '✓ Keep filters' : 'Keep filters'; keep.setAttribute('aria-pressed', String(cfg.keep)); }
    if (strict) { strict.textContent = cfg.strict ? '✓ Strict title' : 'Strict title'; strict.setAttribute('aria-pressed', String(cfg.strict)); }
    if (multi) { multi.textContent = cfg.multi ? '✓ Multi-search' : 'Multi-search'; multi.setAttribute('aria-pressed', String(cfg.multi)); }
}

function ensureUI() {
    const list = document.querySelector('[data-search-pathways-ul]');
    if (!list || !isSearchPage()) return;
    let root = list.querySelector('#ebs-controls');
    if (!root) {
        root = document.createElement('li');
        root.id = 'ebs-controls';
        root.className = 'wt-action-group__item';
        root.innerHTML = `
            <button type="button" class="ebs-pill" data-ebs-keep aria-pressed="false">Keep filters</button>
            <span class="ebs-split" data-ebs-strict-split>
                <button type="button" class="ebs-main" data-ebs-strict aria-pressed="false">Strict title</button>
                <button type="button" class="ebs-caret" data-ebs-strict-settings aria-label="Strict title settings" aria-expanded="false">▾</button>
            </span>
            <span class="ebs-split" data-ebs-multi-split>
                <button type="button" class="ebs-main" data-ebs-multi aria-pressed="false">Multi-search</button>
                <button type="button" class="ebs-caret" data-ebs-multi-settings aria-label="Multi-search rules" aria-expanded="false">▾</button>
            </span>`;
        const showFilters = list.querySelector('.sticky-filters-button-lg');
        if (showFilters) showFilters.insertAdjacentElement('afterend', root);
        else list.prepend(root);

        root.querySelector('[data-ebs-keep]').addEventListener('click', () => {
            save('keep', !cfg.keep);
            if (cfg.keep) saveFilters(filterEntries(new URL(location.href)));
            updateButtons();
            scheduleFit();
        });
        root.querySelector('[data-ebs-strict]').addEventListener('click', () => {
            save('strict', !cfg.strict);
            updateButtons();
            if (!cfg.multi) {
                stopScan();
                if (cfg.strict) reapply();
                else { restoreNative(); showStatus(null); }
            }
            scheduleFit();
        });
        root.querySelector('[data-ebs-strict-settings]').addEventListener('click', (event) => {
            event.stopPropagation();
            toggleStrictPopup(event.currentTarget);
        });
        root.querySelector('[data-ebs-multi]').addEventListener('click', () => switchSearchMode(!cfg.multi));
        root.querySelector('[data-ebs-multi-settings]').addEventListener('click', (event) => {
            event.stopPropagation();
            ensureRulesSeeded();
            event.currentTarget.setAttribute('aria-expanded', 'true');
            openMultiModal();
        });
    }
    updateButtons();
    observeToolbar();
    scheduleFit();
}

function makeStrictPopup() {
    const popup = document.createElement('div');
    popup.className = 'ebs-strict-popup';
    popup.hidden = true;
    popup.innerHTML = `
        <div class="ebs-popup-title">Title matching</div>
        <label class="ebs-option"><input type="radio" name="ebs-mode" value="phrase"><span>Exact phrase</span></label>
        <label class="ebs-option"><input type="radio" name="ebs-mode" value="all"><span>All words</span></label>
        <p class="ebs-popup-note">Used for normal Etsy searches. Multi-search uses its own title rules.</p>`;
    popup.addEventListener('change', (event) => {
        const target = event.target;
        if (!target.matches('input[name="ebs-mode"]')) return;
        save('mode', target.value === 'all' ? 'all' : 'phrase');
        // Exact phrase / All words only changes local filtering, so reuse the
        // candidate pages already scanned for this query whenever possible.
        if (!cfg.multi) reapply();
    });
    document.body.append(popup);
    return popup;
}

function positionStrictPopup() {
    if (!state.strictPopup || state.strictPopup.hidden || !state.strictPopupAnchor?.isConnected) return;
    const anchor = state.strictPopupAnchor.getBoundingClientRect();
    const box = state.strictPopup.getBoundingClientRect();
    const pad = 8;
    let left = Math.max(pad, Math.min(anchor.right - box.width, innerWidth - box.width - pad));
    let top = anchor.bottom + 8;
    if (top + box.height > innerHeight - pad) top = anchor.top - box.height - 8;
    state.strictPopup.style.left = `${Math.round(left)}px`;
    state.strictPopup.style.top = `${Math.round(Math.max(pad, top))}px`;
}

function toggleStrictPopup(anchor) {
    if (!state.strictPopup) state.strictPopup = makeStrictPopup();
    const open = state.strictPopup.hidden || state.strictPopupAnchor !== anchor;
    state.strictPopupAnchor?.setAttribute('aria-expanded', 'false');
    state.strictPopupAnchor = anchor;
    state.strictPopup.hidden = !open;
    anchor.setAttribute('aria-expanded', String(open));
    if (open) {
        const radio = state.strictPopup.querySelector(`input[name="ebs-mode"][value="${cfg.mode}"]`);
        if (radio) radio.checked = true;
        requestAnimationFrame(positionStrictPopup);
    }
}

function closeStrictPopup() {
    if (!state.strictPopup || state.strictPopup.hidden) return;
    state.strictPopup.hidden = true;
    state.strictPopupAnchor?.setAttribute('aria-expanded', 'false');
    state.strictPopupAnchor = null;
}

function recommendationWrappers() {
    return Array.from(document.querySelectorAll('[data-pathways-api-spec] button[data-clg-id="WtSelectableChip"]'))
        .map((button) => button.parentElement || button);
}

function fitRecommendations() {
    const inner = document.querySelector('[data-search-pathways-inner]');
    if (!inner || !document.querySelector('#ebs-controls')) return;
    const wrappers = recommendationWrappers();
    for (const wrapper of wrappers) wrapper.style.removeProperty('display');
    requestAnimationFrame(() => {
        for (let i = wrappers.length - 1; i >= 0 && inner.scrollWidth > inner.clientWidth + 2; i -= 1) wrappers[i].style.display = 'none';
    });
}

function scheduleFit() {
    clearTimeout(state.fitTimer);
    state.fitTimer = setTimeout(fitRecommendations, 80);
}

function observeToolbar() {
    const inner = document.querySelector('[data-search-pathways-inner]');
    if (!inner || state.observedInner === inner) return;
    state.resizeObserver?.disconnect();
    state.resizeObserver = new ResizeObserver(scheduleFit);
    state.resizeObserver.observe(inner);
    state.observedInner = inner;
}

function lockPageScroll() {
    if (state.scrollLock) return;
    const html = document.documentElement;
    const body = document.body;
    const x = window.scrollX || 0;
    const y = window.scrollY || 0;
    const viewportWidth = window.innerWidth || html.clientWidth;
    const scrollbarWidth = Math.max(0, viewportWidth - html.clientWidth);
    const paddingRight = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
    state.scrollLock = {
        x, y,
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.right = '0';
    body.style.width = 'auto';
    if (scrollbarWidth) body.style.paddingRight = `${paddingRight + scrollbarWidth}px`;
}

function unlockPageScroll() {
    const saved = state.scrollLock;
    if (!saved) return;
    state.scrollLock = null;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = saved.htmlOverflow;
    body.style.overflow = saved.bodyOverflow;
    body.style.position = saved.position;
    body.style.top = saved.top;
    body.style.left = saved.left;
    body.style.right = saved.right;
    body.style.width = saved.width;
    body.style.paddingRight = saved.paddingRight;
    window.scrollTo(saved.x, saved.y);
}

function modalCounts(rules) {
    const total = rules.length;
    const enabled = rules.filter((rule) => rule.enabled).length;
    return { total, enabled };
}

function previewPlan(rules) {
    const plan = compileMultiPlan(rules);
    const lines = [];
    if (plan.searches.length) {
        plan.searches.forEach((search, index) => lines.push(`${index + 1}. ${search.query}`));
    } else lines.push('No enabled Match rules.');
    if (plan.exclude.length) {
        lines.push('', 'Exclude:');
        for (const rule of plan.exclude) lines.push(`- Title ${operatorLabel(rule.operator).toLowerCase()} "${ruleValue(rule)}"`);
    }
    return { plan, lines };
}

function operatorLabel(operator) {
    return TEXT_OPERATORS.find(([key]) => key === operator)?.[1] || operator;
}

function validateRules(rules) {
    const errors = new Map();
    for (const rule of rules) {
        if (rule.enabled && !ruleValue(rule)) errors.set(rule.id, 'Enter text for this enabled rule.');
    }
    const effectiveMatches = rules.filter((rule) => rule.enabled && rule.polarity === 'match' && ruleValue(rule));
    if (!effectiveMatches.length && rules[0]) errors.set(rules[0].id, 'Multi-search needs at least one enabled Match rule.');
    return errors;
}

function normalizeRuleConnectors(rules) {
    for (const rule of rules) if (rule.polarity === 'exclude') rule.logic = 'and';
    return rules;
}
