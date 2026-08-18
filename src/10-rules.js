function compileMultiPlan(rules = cfg.multiRules) {
    const all = normalizeRules(rules);
    const enabled = all.filter((rule) => rule.enabled && ruleValue(rule));
    const positive = enabled.filter((rule) => rule.polarity === 'match');
    const exclude = enabled.filter((rule) => rule.polarity === 'exclude');
    const branches = positive.filter((rule) => rule.logic === 'or');
    const shared = positive.filter((rule) => rule.logic === 'and');
    const searches = [];
    const MAX_SEARCHES = 24;

    const expand = (includedRules, branchRuleId) => {
        let variants = [''];
        for (const rule of includedRules) {
            const terms = searchTermsForRule(rule);
            if (!terms.length) continue;
            const next = [];
            for (const prefix of variants) {
                for (const term of terms) {
                    next.push(`${prefix} ${term}`.replace(/\s+/g, ' ').trim());
                    if (next.length >= MAX_SEARCHES) break;
                }
                if (next.length >= MAX_SEARCHES) break;
            }
            variants = next;
            if (!variants.length) break;
        }
        for (const queryText of variants) {
            if (!queryText || searches.length >= MAX_SEARCHES) break;
            searches.push({ id: `${branchRuleId || 'shared'}:${searches.length}`, query: queryText, branchRuleId });
        }
    };

    if (branches.length) {
        for (const branch of branches) {
            const included = positive.filter((rule) => rule.logic === 'and' || rule.id === branch.id);
            expand(included, branch.id);
            if (searches.length >= MAX_SEARCHES) break;
        }
    } else if (shared.length) {
        expand(shared, null);
    }

    const seen = new Set();
    const deduped = searches.filter((item) => {
        const key = normalize(item.query);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return { rules: all, enabled, positive, exclude, branches, shared, searches: deduped };
}

function multiDisplayQuery(plan = compileMultiPlan()) {
    if (plan.branches.length) return plan.branches.map(ruleValue).filter(Boolean).join(', ');
    if (plan.shared.length) return plan.shared.map(ruleValue).filter(Boolean).join(' ');
    return cfg.multiQuery || query() || 'Multi-search';
}

function modeSwitchFilters() {
    const current = filterEntries(new URL(location.href));
    return current.length ? current : (cfg.keep ? cfg.filters : current);
}

function switchSearchMode(nextMulti) {
    if (cfg.multi === nextMulti) return;
    const current = query();
    if (current) {
        if (cfg.multi) save('multiQuery', current);
        else save('singleQuery', current);
    }
    if (nextMulti) ensureRulesSeeded();
    save('multi', nextMulti);
    updateButtons();
    closeStrictPopup();
    closeMultiModal();
    stopScan();
    invalidateCache();
    restoreNative();

    let target;
    if (nextMulti) {
        target = multiDisplayQuery();
        save('multiQuery', target);
    } else {
        target = cfg.singleQuery || current;
        if (target) save('singleQuery', target);
    }
    if (!target || !isSearchPage()) return scheduleSync(50);
    const desired = searchUrl(target, modeSwitchFilters());
    if (desired.href === location.href) return scheduleSync(50);
    location.assign(desired.href);
}

function signature() {
    const filters = filterSignature(filterEntries(new URL(location.href)));
    if (cfg.multi) {
        const rules = JSON.stringify(normalizeRules(cfg.multiRules));
        return `${location.pathname}|multi|${rules}|${filters}`;
    }
    // Exact phrase vs All words changes only local filtering; the downloaded Etsy
    // candidate pool is identical, so keep one cache signature for both modes.
    return `${location.pathname}|single|${query()}|${filters}`;
}

function strictMatchesTitle(title, rawQuery = query()) {
    if (!cfg.strict) return true;
    const titleNorm = normalize(title);
    const queryNorm = normalize(rawQuery);
    if (!titleNorm || !queryNorm) return false;
    if (cfg.mode === 'phrase') return ` ${titleNorm} `.includes(` ${queryNorm} `);
    const tokens = new Set(titleNorm.split(' ').filter(Boolean));
    return queryNorm.split(' ').filter(Boolean).every((word) => tokens.has(word));
}

function exactWordOrPhrase(source, needle) {
    let index = source.indexOf(needle);
    const word = (character) => Boolean(character) && /[\p{L}\p{N}\p{M}_]/u.test(character);
    while (index >= 0) {
        const before = source[index - 1];
        const after = source[index + needle.length];
        if (!word(before) && !word(after)) return true;
        index = source.indexOf(needle, index + Math.max(1, needle.length));
    }
    return false;
}

function ruleMatchesTitle(title, rule) {
    let source = String(title || '');
    let needle = ruleValue(rule);
    if (!source || !needle) return false;
    if (!rule.options?.caseSensitive) {
        source = source.toLocaleLowerCase();
        needle = needle.toLocaleLowerCase();
    }
    const matchOne = (part) => {
        let result;
        if (rule.operator === 'equals') result = source === part;
        else if (rule.operator === 'startsWith') result = source.startsWith(part);
        else if (rule.operator === 'endsWith') result = source.endsWith(part);
        else result = source.includes(part);
        if (!result || !rule.options?.wholeWord || rule.operator !== 'contains') return result;
        return exactWordOrPhrase(source, part);
    };
    if (rule.operator === 'contains' && rule.options?.matchAnyWord) {
        const words = needle.split(/\s+/).filter(Boolean);
        return words.length > 0 && words.some(matchOne);
    }
    return matchOne(needle);
}

function multiCandidateMatches(candidate, plan) {
    for (const rule of plan.shared) {
        if (!ruleMatchesTitle(candidate.title, rule)) return false;
    }
    if (plan.branches.length) {
        const branchIds = candidate.branchIds instanceof Set ? candidate.branchIds : new Set(candidate.branchIds || []);
        let branchPassed = false;
        for (const rule of plan.branches) {
            if (!branchIds.has(rule.id)) continue;
            if (ruleMatchesTitle(candidate.title, rule)) {
                branchPassed = true;
                break;
            }
        }
        if (!branchPassed) return false;
    }
    for (const rule of plan.exclude) {
        if (ruleMatchesTitle(candidate.title, rule)) return false;
    }
    return true;
}

function matchedCandidates() {
    if (cfg.multi) {
        const plan = compileMultiPlan();
        return state.candidates.filter((item) => multiCandidateMatches(item, plan)).sort(compareCandidates);
    }
    return state.candidates.filter((item) => strictMatchesTitle(item.title)).sort(compareCandidates);
}

function compareCandidates(a, b) {
    if (a.page !== b.page) return a.page - b.page;
    if (a.index !== b.index) return a.index - b.index;
    return (a.groupIndex || 0) - (b.groupIndex || 0);
}

