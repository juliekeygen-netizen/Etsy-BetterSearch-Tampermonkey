'use strict';

/* v0.10.2 catalogue-aware category fix.
 * Build the category body from the full observed catalogue before applying the
 * five-row collapsed presentation. The first v0.10.1 pass pruned only the rows
 * currently rendered, so a catalogue whose only matching category was below the
 * first five could incorrectly hide the entire Category section.
 */

function favBuildCategory() {
    const active = String(favCfg.filters.category || '');
    let definitions = FAV_NATIVE_CATEGORIES_;

    if (favUiPrefs.hideUnavailableCatalogFilters && favCatalogueDeepComplete0101()) {
        definitions = FAV_NATIVE_CATEGORIES_.filter(([value]) =>
            value === active || favState.records.some((record) => favCategoryMatch(record.deepMetadata?.category, value))
        );
    }

    const wrap = document.createElement('div');
    wrap.className = 'ebsf-native-group ebsf-category-list';

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'ebsf-native-link';
    all.textContent = 'All categories';
    all.classList.toggle('is-selected', !active);
    all.addEventListener('click', () => {
        favCfg.filters.category = '';
        favSaveAndApply(true);
        favReplaceSectionBody('category', favBuildCategory);
    });
    wrap.append(all);

    const shown = favState.categoryExpanded ? definitions : definitions.slice(0, 5);
    for (const [value, label] of shown) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ebsf-native-link';
        button.textContent = label;
        button.classList.toggle('is-selected', active === value);
        button.addEventListener('click', () => {
            favCfg.filters.category = value;
            favSaveAndApply(true);
            favReplaceSectionBody('category', favBuildCategory);
        });
        wrap.append(button);
    }

    if (definitions.length > 5) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'ebsf-native-show-more';
        more.textContent = favState.categoryExpanded ? 'Show less' : 'Show more';
        more.addEventListener('click', () => {
            favState.categoryExpanded = !favState.categoryExpanded;
            favReplaceSectionBody('category', favBuildCategory);
        });
        wrap.append(more);
    }

    return wrap;
}

/* Keep ETA near the front so it remains visible even in narrower native search
 * fields; done/total already communicates how much work remains. */
var favDeepProgressModelBefore0102 = favDeepProgressModel;
favDeepProgressModel = function favDeepProgressModel0102(state = favDeepState) {
    const model = favDeepProgressModelBefore0102(state);
    const completed = Math.max(0, Number(state.completed) || 0);
    const failed = Math.max(0, Number(state.failed) || 0);
    const done = completed + failed;
    const total = Math.max(0, Number(state.total) || 0);
    if (!total) return model;

    const rate = Math.max(0, Number(state.ratePerSecond) || 0);
    const eta = favDeepEtaText0101(state.estimatedRemainingMs);
    const parts = [`${done}/${total}`];
    if (eta) parts.push(eta);
    if (rate > 0) parts.push(`${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)}/s`);
    if (failed) parts.push(`${failed} failed`);
    return { ...model, detail:parts.join(' · ') };
};
