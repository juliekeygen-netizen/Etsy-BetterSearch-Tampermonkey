# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal and useful while preserving Etsy's normal filters, sorting, and listing-card UI. It also adds advanced filtering, sorting, Strict Title, and Multi-search tools to your Etsy Favorites.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Marketplace search

On normal Etsy search pages BetterSearch adds compact **Keep filters**, **Strict title**, **Multi-search**, and **Scan settings** controls beside Etsy's native **Show filters** button.

### Keep filters

**Keep filters** remembers Etsy's native search/filter URL state and carries it into the next search submitted through Etsy's normal search bar. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.

### Strict title

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

### Rule-based Multi-search

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

Click the **gear icon** to open scanner settings. They affect whichever marketplace enhanced mode is active.

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

With every sort toggle **off**, BetterSearch scans only the sort currently selected in Etsy's native dropdown.

When one or more sort modes are enabled, each Strict-title query or generated Multi-search query is scanned once for every enabled sort mode. BetterSearch merges those candidate pools and removes duplicate listing IDs before applying the title rules.

The **Merged result display order** editor controls how the combined result set is ordered:

- **Auto (recommended)** uses: Most relevant → Top reviews → Newest → Price low to high → Price high to low, using only enabled modes.
- **Custom order** unlocks draggable rows. Small **↑ / ↓** buttons provide the same reordering on touch/mobile devices.
- Custom order is remembered if you temporarily switch back to Auto.

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

## Marketplace scanning

During a normal full scan, BetterSearch temporarily replaces the listing gallery with a dedicated progress screen. Custom mode can instead show matching cards progressively while scanning.

The progress screen reports pages checked and matches found, plus a rolling **average pages/second** and an **estimated time remaining** once enough pages have completed to calculate a useful rate.

```text
Scanning pages 83 / 160 · 513 matches found
Average speed: 2.7 pages/s · Estimated remaining: ~29s
```

The scanner only parses Etsy's main search-result region and ignores personalized sections such as **Recommended for you** and **Because you viewed**.

Results are rebuilt into a dense grid with no gaps. Native pagination is hidden while BetterSearch is displaying the combined result set.

### Background tabs / Alt-Tab behavior

BetterSearch does not cancel an active marketplace scan just because the Etsy tab becomes hidden. First-pass fetches are allowed to continue normally in the background.

If Chrome throttles the hidden tab and requests start failing, BetterSearch pauses retry rounds and whole-scan recovery until the Etsy tab becomes visible again. Hidden time therefore does not burn through the retry budget and immediately turn into `scan incomplete`.

## Favorites filters and sorting

BetterSearch also enhances Etsy's Favorites Items and collection pages while preserving Etsy's own **Search your favorites**, **Search within this collection**, Items/categories, Collections, and Shops navigation.

### Native-style Favorites UI

On desktop the Favorites search row becomes approximately:

```text
[ Show filters ] [ Etsy order ▾ ] [ Search your favorites... ]
```

Named collections use the same control order with Etsy's native **Search within this collection** field. BetterSearch does not consume the search field's normal desktop width: Filter and Sort sit to its left, while the native form remains the flexible search control.

- **Show filters** is styled after Etsy's native search filter button.
- The native Favorites/collection search form stays in place and continues to work normally.
- The sort menu uses Etsy's `wt-menu` / `wt-options` visual language.
- At narrower desktop/tablet widths, the Favorites search area remains visible instead of disappearing with Etsy's large-profile header breakpoint. Filter + Sort stay to the left of the shrinking native search field on one row when space permits.
- Opening Filters temporarily replaces the existing **Items / Collections / Shops** sidebar in the same column, so the Favorites grid does not get pushed sideways. BetterSearch preserves the actual native sidebar DOM nodes and restores them when Filters closes.
- On smaller screens, Filters opens as an Etsy-style full-height overlay instead.

The Favorites filter rail now mirrors Etsy's marketplace filter rail much more closely: native-style accordion rows, matching divider/spacing behavior, compact checkboxes/radios/selects, a dual-thumb price slider with paired price inputs, Etsy-like disclosure chevrons, category/color “Show more” patterns, and small help popovers rather than permanent explanatory copy. Sections remember their open/closed state while filters reapply. Clicking the **Filters** heading itself closes the rail.

The custom **Search** drawer remains at the top. **Strict title** and **Multi-search** use split pills; Strict's caret opens **Exact phrase / All words directly between Strict title and Multi-search**, while Multi-search's caret opens the rule editor.

The real Favorites listing section is handled separately from Etsy recommendation modules such as **Discover similar items**; recommendation cards are never included in the Favorites result pool.

### Favorites filters

The rail includes Etsy's normal filter structure first, then BetterSearch-specific Favorites filters:

- **Search** — Strict Title and rule-based Multi-search
- **Category** — All categories plus Etsy-style category links and Show more
- **Special offers** — Free shipping / On sale
- **Item format** — All items / Exclude digital downloads / Digital downloads only
- **Etsy's best** — Etsy's Picks / Star Seller, with native-style `?` info popovers
- **Ships from** — Anywhere / Europe / current country / Near a city / Another country
- **Ready to ship in** — 1 day / 1–3 days
- **Price** — native-style range slider plus minimum/maximum price inputs
- **Color** — swatch checkboxes with Show more
- **Item type** — Vintage
- **Ordering options** — Accepts Etsy gift cards / Can be gift-wrapped / Customizable
- **Ship to** — country selector
- **Availability & discount** — BetterSearch's available-only and minimum-discount controls
- **Rating & reviews** — minimum rating and minimum review count
- **Seller** — shop selector
- **Listing features** — Best Seller / variations / video
- **Popularity & stock** — low-stock signal and minimum reported cart count
- **Delivery** — maximum shipping cost / returns / exchanges

Filters for which the current Favorites JSON already exposes reliable metadata are wired into local filtering. Native controls whose required metadata is not currently present in the Favorites dataset — for example Category, Etsy's Picks, Ships from, Ready to ship, Color, Vintage, gift-card/gift-wrap, and Ship to — already have their UI/state implemented but are intentionally not used to reject listings yet. This avoids pretending unknown metadata is false; the data wiring can be added later without another UI redesign.

For popularity/stock, BetterSearch only treats a value as known when Etsy actually reports a signal such as **In 6 carts** or **Only 3 left**. A missing urgency signal is not interpreted as zero carts or unlimited stock.

### Favorites Strict Title and Multi-search

Favorites has its own saved Strict Title / Multi-search state, separate from marketplace search.

- **Strict title** applies Exact Phrase or All Words matching to the current native Favorites search text.
- **Multi-search** uses the same Title-rule model as marketplace Multi-search: OR branches, shared AND rules, Match/Exclude, Contains/Equals/Starts with/Ends with, rule reordering, enable/disable, duplicate/delete, and Search Preview.
- Favorites Strict Title and Favorites Multi-search are mutually exclusive.

When Strict Title or Multi-search is active, BetterSearch can load the full current Favorites scope and apply the title rules locally rather than being limited to the 20 cards visible on the current page.

### Favorites sorting

Favorites sorting is local after the current Favorites scope has been loaded, so switching sort modes is immediate:

- **Etsy order**
- **Price: low to high**
- **Price: high to low**
- **Rating: high to low**
- **Most reviews**
- **Discount: high to low**
- **Title: A to Z / Z to A**
- **Shop: A to Z**
- **Shipping: low to high**
- **Most carts**
- **Low stock first**

BetterSearch keeps local Favorites pagination at about Etsy's normal 20-listing page size and shows a small `favorites · shown` counter when local filtering/sorting is active.

### Favorites data and reconstructed cards

Favorites loading uses Etsy's own logged-in Favorites JSON requests and structured page data; it does not use an Etsy Open API key. BetterSearch loads additional shipping/returns/urgency metadata only when a filter or sort needs it.

Cards already present on the current Etsy Favorites page reuse their original DOM nodes so native event handlers survive. Off-page Favorites have to be reconstructed from Etsy's structured data; their heart action uses BetterSearch's same-site favorite bridge. For reconstructed cards, Add to cart / Multiple options opens the listing page when Etsy's original frontend handler is unavailable.

Favorites filter/sort settings and rules persist through Tampermonkey storage. **Reset** clears the active Favorites filters/sort/modes while keeping your saved Multi-search rule definitions available for later reuse.

## Favorite hearts on marketplace results

Cards already present on the current Etsy search page reuse their original DOM nodes so Etsy's native event handlers are preserved. Imported cards from background-scanned pages use a separate same-site helper path for their heart action because their original page JavaScript listeners cannot be copied with HTML alone.

## UI and mobile layout

Marketplace search:

```text
Show filters | Keep filters | Strict title ▾ | Multi-search ▾ | ⚙ | Etsy filters...
```

Rightmost Etsy recommendation chips are hidden as needed so BetterSearch's controls stay inside the normal toolbar width. Active Etsy filters are not intentionally removed.

The Multi-search and Scan settings windows both have responsive phone layouts. Modal and settings text is intentionally larger than the initial versions so helper text and rule controls remain readable without zooming in.

## Project structure

`etsy-bettersearch.user.js` is the Tampermonkey install/update entry point. The implementation is split into ordered modules under `src/` and loaded with `@require`.

Marketplace search and Favorites use separate state/data/rendering paths so a Favorites filter cannot alter the marketplace search configuration accidentally.

## Notes

BetterSearch does not use the Etsy Open API. It operates on Etsy pages and the logged-in Etsy web requests those pages use.

Etsy can change its page structure or internal web endpoints at any time, so selectors/request adapters may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.