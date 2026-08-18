# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal without replacing Etsy's normal search bar, filters, sorting, or listing-card UI.

It adds a compact **Strict title** control beside Etsy's **Show filters** button and a **Keep filters** toggle. Strict title scans Etsy's search-result pages in the background, keeps only listings whose titles really match your search, and repacks them into Etsy's normal results grid.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Strict title

Turn on **Strict title** from the same row as Etsy's normal filter chips.

The script scans all result pages Etsy exposes for the current search and native filter state, then only shows matching listing titles. It keeps Etsy's existing cards and grid styling instead of replacing the whole search page.

Open the small arrow beside **Strict title** to choose:

* **All words** — every word in the search must appear as a real word in the listing title, in any order.
* **Exact phrase** — the normalized phrase must appear in the title in the same order.
* **Comma-separated alternatives** — searches such as `disco elysium, outer wilds` are treated as `disco elysium OR outer wilds`. Each alternative is searched separately with the same Etsy filters, then the results are merged and deduplicated.

Matching is case-insensitive and normalizes punctuation, repeated spacing, Unicode accents, hyphens, slashes, and similar separators. For example, `Outer Wilds`, `OUTER WILDS`, and `Outer-Wilds` can match each other.

## Keep filters

**Keep filters** remembers Etsy's native search/filter URL state and carries it into the next search you submit through Etsy's normal header search bar.

This is intended for things such as price, item format, shop location, shipping options, sorting, and other native Etsy filters. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.


## Notes

Strict title works by requesting Etsy search-result pages in the background with low concurrency, parsing the normal listing cards, and filtering their full title text locally. It does not use the Etsy API and does not attempt to bypass Etsy verification or rate limiting.

Etsy can change its page structure at any time, so selectors may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.
