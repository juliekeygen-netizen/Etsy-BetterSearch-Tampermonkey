# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal without replacing Etsy's normal search bar, filters, sorting, or listing-card UI.

It adds compact **Strict title**, **Keep filters**, and **Multi-search** controls beside Etsy's **Show filters** button. Strict title scans Etsy's search-result pages in the background, keeps only listings whose titles really match your search, and repacks them into Etsy's normal results grid.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Strict title

Turn on **Strict title** from the same row as Etsy's normal filter chips.

The script scans all result pages Etsy exposes for the current search and native filter state, then only shows matching listing titles. It keeps Etsy's existing cards and grid styling instead of replacing the whole search page.

Open the small arrow beside **Strict title** to choose:

* **Exact phrase** — the normalized phrase must appear in the title in the same order. This is the default.
* **All words** — every word in the search must appear as a real word in the listing title, in any order.

Matching is case-insensitive and normalizes punctuation, repeated spacing, Unicode accents, hyphens, slashes, and similar separators. For example, `Outer Wilds`, `OUTER WILDS`, and `Outer-Wilds` can match each other.

While scanning, Etsy's normal result text changes to something like `398 results · scanning…`. When finished it becomes `398 results · 37 strict matches`.

## Multi-search

Turn on **Multi-search** to use commas as separate Etsy searches.

For example:

```text
subahibi, saya no uta, higurashi, persona
```

is treated as four independent searches rather than one giant Etsy query. BetterSearch scans each query with the same native Etsy filters, applies the selected strict-title rule to each one, merges the matches, and removes duplicate listings.

Results from the different searches are interleaved by their Etsy result position so a very large search such as `persona` does not completely bury results from a smaller search.

Multi-search automatically enables Strict title because the merged result set depends on strict title matching. Turning Strict title off also turns Multi-search off.

When Multi-search is active, the result text uses the number of searches instead of Etsy's mostly meaningless result count for the comma-filled query, for example:

```text
4 searches · 111 strict matches
```

The full comma-separated query remains in Etsy's normal search bar and URL, so refreshing or using browser back/forward does not forget what you searched for. BetterSearch rebuilds the result set automatically after a full page refresh rather than permanently storing potentially stale Etsy cards.

## Automatic scan recovery

Search pages occasionally fail to load in the background because of a temporary network error, navigation during a scan, or Etsy returning an incomplete response.

BetterSearch retries failed pages automatically with short backoff delays. If a scan is still incomplete after the per-page retries, it automatically retries the complete scan a few times instead of immediately leaving you with `scan incomplete`.

It also handles browser back/forward cache restores by discarding stale in-memory scan state and starting the current search again.

If Etsy repeatedly blocks or fails the requests after all automatic retries, BetterSearch eventually stops retrying rather than hammering Etsy forever and shows `scan incomplete`.

## Keep filters

**Keep filters** remembers Etsy's native search/filter URL state and carries it into the next search you submit through Etsy's normal header search bar.

This is intended for things such as price, item format, shop location, shipping options, sorting, and other native Etsy filters. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.

The remembered filter state and all BetterSearch settings survive refreshes and browser restarts until you change the toggles again.

## UI

The script is deliberately small visually:

* **Strict title**, **Keep filters**, and **Multi-search** sit directly after Etsy's **Show filters** control.
* The rightmost Etsy recommendation chips are hidden as needed so the added controls stay inside the normal toolbar width.
* Active Etsy filters are not intentionally removed.
* Etsy's native result count and sort control stay in place.
* Native pagination is hidden only while Strict title is showing the combined strict results.

## Notes

Strict title works by requesting Etsy search-result pages in the background with low concurrency, parsing the normal listing cards, and filtering their full title text locally. Multi-search does the same thing for each comma-separated query before merging and deduplicating the matches.

Etsy currently exposes a finite set of search-result pages to the browser, so BetterSearch can only scan the pages Etsy actually makes available for each query. It cannot find listings that Etsy never returns as candidates.

The script does not use the Etsy API and does not attempt to bypass Etsy verification or rate limiting.

Etsy can change its page structure at any time, so selectors may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.