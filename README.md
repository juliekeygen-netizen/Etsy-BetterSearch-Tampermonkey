# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal and more useful without replacing Etsy's normal filters, sorting, or listing-card UI.

It adds compact **Keep filters**, **Strict title**, and **Multi-search** controls beside Etsy's **Show filters** button.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Keep filters

**Keep filters** remembers Etsy's current native search/filter URL state and carries it into the next search you submit through Etsy's normal search bar.

This is intended for things such as price, item format, shop location, shipping options, sorting, and other native Etsy filters. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.

The remembered filter state survives refreshes and browser restarts until you turn the option off or change the filters.

## Strict title

**Strict title** scans all result pages Etsy exposes for the current search and only shows listings whose titles genuinely match the search.

Open the small arrow beside **Strict title** to choose:

* **Exact phrase** — the normalized search phrase must appear in the title in the same order. This is the default.
* **All words** — every search word must appear as a real word in the listing title, but the words may appear in a different order.

Matching is case-insensitive and normalizes punctuation, repeated spacing, Unicode accents, hyphens, slashes, and similar separators. For example, `Outer Wilds`, `OUTER WILDS`, and `Outer-Wilds` can match each other.

Strict title is independent from Multi-search. You can use it with a normal Etsy search, with Multi-search, or turn it off while leaving Multi-search enabled.

## Multi-search

**Multi-search** lets one search bar hold multiple independent Etsy searches.

Separate searches with commas:

```text
subahibi, saya no uta, higurashi, persona
```

BetterSearch treats that as four separate Etsy searches, scans each one with the same native Etsy filters, merges the results, and removes duplicate listings.

When Strict title is also enabled, the selected Strict title rule is applied to the merged results. When Strict title is disabled, Multi-search still works and shows the merged Etsy result pool without the extra title requirement.

### Shared terms with `[brackets]`

A term or phrase inside square brackets at the **start** or **end** of a Multi-search is added to every individual search.

Prefix example:

```text
[charm] subahibi, saya no uta, persona
```

becomes:

```text
charm subahibi
charm saya no uta
charm persona
```

Suffix example:

```text
subahibi, saya no uta, persona [charm]
```

becomes:

```text
subahibi charm
saya no uta charm
persona charm
```

The position therefore matters: a leading bracket is put before every individual query and a trailing bracket is put after every query.

Multiple leading or trailing bracket groups are also supported.

Open the small arrow beside **Multi-search** for a short built-in reminder of the comma and bracket syntax.

## Separate Single-search and Multi-search state

Normal Etsy searching and Multi-search keep separate saved query text.

For example, you can have:

```text
Single-search:
saya no uta
```

and:

```text
Multi-search:
subahibi, saya no uta, persona [charm]
```

Turning Multi-search on restores the last Multi-search query. Turning it off restores the last normal Single-search query.

Both are remembered across refreshes and browser restarts.

## Scanning and recovery

BetterSearch requests Etsy result pages in the background with low concurrency, parses only Etsy's actual main search-result grid, and ignores personalized sections such as **Recommended for you** or **Because you viewed**.

Failed pages are retried automatically with short backoff delays. If a scan still cannot finish, BetterSearch retries the complete scan a few times before finally showing `scan incomplete`.

Browser back/forward restores discard stale in-memory scan state and rebuild the current result set.

## UI

The controls are deliberately compact and use the same area as Etsy's native search chips:

```text
Show filters | Keep filters | Strict title ▾ | Multi-search ▾ | Etsy filters...
```

The rightmost Etsy recommendation chips are hidden as needed so BetterSearch's controls stay inside the normal toolbar width. Active Etsy filters are not intentionally removed.

While a scan is running, Etsy's result-info area shows scanning progress. Finished Strict title searches show the strict match count. Multi-search shows the number of independent searches instead of Etsy's misleading result count for the comma-filled combined query.

## Notes

BetterSearch does not use the Etsy API. It can only scan the finite result pages Etsy makes available for each search and cannot find listings Etsy never returns as candidates.

The script does not attempt to bypass Etsy verification or rate limiting.

Etsy can change its page structure at any time, so selectors may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.