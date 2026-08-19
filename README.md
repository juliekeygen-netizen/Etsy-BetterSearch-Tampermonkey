# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal and useful while preserving Etsy's normal filters, sorting, and listing-card UI.

It adds compact **Keep filters**, **Strict title**, **Multi-search**, and **Scan settings** controls beside Etsy's **Show filters** button.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Keep filters

**Keep filters** remembers Etsy's native search/filter URL state and carries it into the next search submitted through Etsy's normal search bar. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.

## Strict title

**Strict title** scans the Etsy result pages available for a normal search and only shows listings whose titles genuinely match.

The arrow beside it provides:

- **Exact phrase** — default.
- **All words** — every search word must occur as a real word, but order may differ.

Matching normalizes case, punctuation, spacing, accents, hyphens, slashes, and similar separators. Switching between Exact phrase and All words can reuse the already-downloaded candidate pool when the query and native Etsy filters have not changed.

### Strict title and Multi-search are exclusive

Only one enhanced search mode can be active at a time.

- Enabling **Multi-search** automatically turns **Strict title** off.
- Enabling **Strict title** while Multi-search is active automatically turns Multi-search off and returns to the saved normal/single-search query before running the Strict-title scan.

The normal Single-search and Multi-search query states remain stored separately, so switching modes does not erase the other setup.

## Rule-based Multi-search

Click the **Multi-search** arrow to open the rule editor. Its layout is adapted from the Advanced Filter editor in the Rule34Video Media Filter project.

Each rule has a drag handle, enable checkbox, **AND / OR**, `Title`, **Match / Exclude**, **Contains / Equals / Starts with / Ends with**, a text value, optional text controls, and a `...` menu for moving, duplicating, and deleting rules.

- **OR + Match** creates a separate Etsy search.
- **AND + Match** becomes a shared term included in every OR search. Its row position controls whether the shared term appears before or after the OR term.
- **Exclude** is applied as a final title rejection rule.

Example:

```text
OR   Match    Contains   Subahibi
OR   Match    Contains   Saya no uta
AND  Match    Contains   Charm
AND  Exclude  Contains   Sticker
```

BetterSearch searches `subahibi charm` and `saya no uta charm`, merges/deduplicates the candidates, then removes matching Sticker titles.

`Contains` supports **Case sensitive**, **Exact word / phrase**, and **Any word**. The collapsed **Search preview** shows the generated queries before Apply.

Applied rules, order, enabled states, operators, options, and values persist through Tampermonkey storage.

## Scan settings

Click the **gear icon** to open scanner settings. They affect whichever enhanced mode is active.

The top of the window has four presets:

- **Safe** — 1 concurrent request, 250 ms spacing, patient recovery.
- **Balanced** — 3 concurrent requests, no spacing, normal recovery. Default.
- **Fast** — 5 concurrent requests, no spacing, shorter recovery.
- **Custom** — exposes all scanner controls.

### Sort coverage

**Sort coverage** is always visible in Scan Settings; it is not hidden inside Custom mode.

It can independently enable any combination of Etsy's native sort modes:

- **Most relevant**
- **Top reviews**
- **Newest**
- **Price: low to high**
- **Price: high to low**

With every sort toggle **off**, BetterSearch behaves exactly like the earlier versions: it scans only the sort currently selected in Etsy's native dropdown.

When one or more sort modes are enabled, each Strict-title query or generated Multi-search query is scanned once for every enabled sort mode. BetterSearch then merges those candidate pools and removes duplicate listing IDs before applying the title rules.

For example, three Multi-search queries with **Most relevant**, **Top reviews**, and **Newest** enabled create nine candidate passes in total.

The **Merged result display order** editor controls how the combined result set is ordered:

- **Auto (recommended)** uses: Most relevant → Top reviews → Newest → Price low to high → Price high to low, using only the sort modes that are enabled.
- **Custom order** unlocks a row list of the enabled sort modes. Drag the rows into any order you want. Small **↑ / ↓** buttons provide the same reordering on touch/mobile devices.
- Your Custom order is remembered if you temporarily switch back to Auto.

Listings found by the first display-order sort are shown first in that sort's Etsy order. Listings that only exist in lower-priority sort pools are then added using the remaining order. A listing found in several sorts is displayed only once.

Existing v0.6.0 single-priority settings are migrated into the new Custom-order model, with the previously selected sort placed first.

Enabling more sort modes can materially increase scan time because the scanner has more result pages to fetch. The live page count, average speed, and ETA include those additional sort passes.

Safe, Balanced, and Fast hide the detailed Custom controls. Custom exposes:

### Performance

- **Concurrent page requests**
- **Request spacing**
- **Scan order** — Round-robin / Search-by-search

Helper text shows recommended ranges such as **Recommended max: 6** for concurrency. These are recommendations rather than small hard limits, so higher experimental values are still possible.

### Coverage

- **Maximum pages per search** — `0` = all pages
- **Stop after matches** — `0` = do not stop early
- **Show partial matches while scanning**

Page or match limits can intentionally omit later valid listings. BetterSearch marks those results as a **limited scan**.

### Recovery

- **Failed-page retries**
- **Whole-scan retries**
- **Retry delay** — Fast / Normal / Patient
- **Adaptive slowdown**

Adaptive slowdown temporarily reduces concurrency and adds some spacing during retry rounds after request failures.

### Optimizations

- **Reuse current Etsy page** — reuses the already-loaded result page when possible instead of requesting that page again

The settings window uses the same draft **Cancel / Apply** behavior as Multi-search, and scan settings persist across browser restarts.

## Scanning

During a normal full scan, BetterSearch temporarily replaces the listing gallery with a dedicated progress screen. Custom mode can instead show matching cards progressively while scanning.

The progress screen reports pages checked and matches found, plus a rolling **average pages/second** and an **estimated time remaining** once enough pages have completed to calculate a useful rate. The speed is smoothed over recent page completions so several concurrent requests finishing together do not make it jump wildly. If a retry is happening, ETA is temporarily marked for recalculation. Returning from a heavily throttled background tab also restarts the timing window so stale background timing does not distort the estimate.

Example:

```text
Scanning pages 83 / 160 · 513 matches found
Average speed: 2.7 pages/s · Estimated remaining: ~29s
```

The scanner only parses Etsy's main search-result region and ignores personalized sections such as **Recommended for you** and **Because you viewed**.

Results are rebuilt into a dense grid with no gaps. Native pagination is hidden while BetterSearch is displaying the combined result set.

### Background tabs / Alt-Tab behavior

BetterSearch does not cancel an active scan just because the Etsy tab becomes hidden. First-pass fetches are allowed to continue normally in the background.

If Chrome throttles the hidden tab and requests start failing, BetterSearch pauses retry rounds and whole-scan recovery until the Etsy tab becomes visible again. Hidden time therefore does not burn through the retry budget and immediately turn into `scan incomplete`. Returning to the tab automatically resumes recovery.

A genuine repeated failure while the tab is active can still eventually end as `scan incomplete` after the configured retry limits are exhausted.

## Favorite hearts

Cards already present on the current Etsy page reuse their original DOM nodes so Etsy's native event handlers are preserved. Imported cards from background-scanned pages use a separate same-site helper path for their heart action because their original page JavaScript listeners cannot be copied with HTML alone.

## UI and mobile layout

```text
Show filters | Keep filters | Strict title ▾ | Multi-search ▾ | ⚙ | Etsy filters...
```

Rightmost Etsy recommendation chips are hidden as needed so BetterSearch's controls stay inside the normal toolbar width. Active Etsy filters are not intentionally removed.

The Multi-search and Scan settings windows both have responsive phone layouts. Modal and settings text is intentionally larger than the initial versions so helper text and rule controls remain readable without zooming in.

## Project structure

`etsy-bettersearch.user.js` is the Tampermonkey install/update entry point. The implementation is split into ordered modules under `src/` and loaded with `@require`.

## Notes

BetterSearch does not use the Etsy API. It can only process the result pages Etsy makes available for each search and cannot find listings Etsy never returns as candidates.

Etsy can change its page structure at any time, so selectors may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.
