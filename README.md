# Etsy BetterSearch

A Tampermonkey userscript that makes Etsy search more literal and more useful while keeping Etsy's native filters, sorting, and listing-card UI.

It adds compact **Keep filters**, **Strict title**, and **Multi-search** controls beside Etsy's **Show filters** button.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [Etsy BetterSearch userscript](https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js).
3. Confirm the installation and refresh Etsy.

## Keep filters

**Keep filters** remembers Etsy's native search/filter URL state and carries it into the next search you submit through Etsy's normal search bar.

This is intended for price, item format, shop location, shipping options, sorting, and Etsy's other native filters. Temporary navigation, tracking, pagination, and old-query parameters are not carried forward.

## Strict title

**Strict title** is for normal/single Etsy searches. It scans all result pages Etsy exposes and only shows listings whose titles genuinely match the search.

Open the arrow beside **Strict title** to choose:

- **Exact phrase** — the normalized phrase must appear in the title in the same order. This is the default.
- **All words** — every search word must appear as a real word in the title, but the order may differ.

Matching is case-insensitive and normalizes punctuation, spacing, accents, hyphens, slashes, and similar separators.

Strict title and Multi-search keep independent states. Turning one off does not disable the other.

## Rule-based Multi-search

Click the **Multi-search** arrow to open the full rule editor. Its layout is based on the Advanced Filter editor from the Rule34Video Media Filter project, adapted to Etsy's light UI and responsive layout.

Each row contains:

- drag handle and enable checkbox
- **AND / OR** logic
- **Field** — currently `Title`
- **Match / Exclude**
- **Contains / Equals / Starts with / Ends with**
- text value
- dynamic text options
- `...` menu for Move up, Move down, Duplicate, and Delete

Use **+ Add rule** to add another row. Changes are drafts until **Apply** is pressed; **Cancel** discards them.

### OR = separate Etsy searches

```text
OR  | Title | Match | Contains | Subahibi
OR  | Title | Match | Contains | Saya no uta
OR  | Title | Match | Contains | Persona
```

BetterSearch scans those as three independent Etsy searches, merges their listing cards, and removes duplicates.

### AND = shared Match rule

An AND Match rule is added to every OR search, and its row position controls where the shared text appears.

```text
OR   Subahibi
OR   Saya no uta
OR   Persona
AND  Charm
```

produces:

```text
subahibi charm
saya no uta charm
persona charm
```

Move `AND Charm` above the OR rows and the generated searches become `charm subahibi`, `charm saya no uta`, and `charm persona`.

If there are only AND Match rows, they form one combined Etsy search.

### Exclude rules

Exclude rules are global final-result filters and use AND logic.

```text
OR   | Match   | Contains | Persona
OR   | Match   | Contains | Subahibi
AND  | Exclude | Contains | Sticker
```

The first two queries are searched independently, then any merged listing whose title matches `Sticker` is removed.

### Text options

`Contains` supports:

- **Case sensitive**
- **Exact word / phrase**
- **Any word**

Other operators expose **Case sensitive** where applicable.

The collapsed **Search preview** at the bottom of the modal shows the exact generated Etsy searches and active exclusions before you Apply.

### Saved Multi-search state

Applied rows, row order, enabled states, operators, options, and values are stored by Tampermonkey and survive refreshes/browser restarts.

Normal Single-search and Multi-search also keep separate saved states. Turning Multi-search off restores the last normal query; turning it back on restores the Multi-search setup.

Older comma-based Multi-search and leading/trailing `[shared term]` syntax are migrated into rule rows when no saved rule configuration exists yet.

While Multi-search is enabled, submitting text through Etsy's normal search bar remains a quick way to replace the OR search rows; shared AND and Exclude rules are kept.

## Scanning and recovery

BetterSearch requests Etsy result pages in the background with low concurrency, parses only Etsy's actual main search-results region, and ignores personalized sections such as **Recommended for you** and **Because you viewed**.

Failed pages retry automatically with backoff. If necessary, the complete scan retries a few times before finally showing `scan incomplete`.

The result grid is rebuilt densely with no empty card gaps. Native pagination is hidden while BetterSearch is displaying its combined result set.

## Favorite hearts on combined results

Cards that already existed on the current native Etsy page are reused as their original DOM nodes, preserving Etsy's native event handlers including the favorite heart.

Cards imported from background-scanned result pages cannot carry Etsy's original JavaScript listeners with their HTML. BetterSearch handles their favorite button separately by using Etsy's native listing-page favorite control in the background, rather than hard-coding an internal favorite API request.

## UI and mobile layout

The toolbar stays compact:

```text
Show filters | Keep filters | Strict title ▾ | Multi-search ▾ | Etsy filters...
```

Rightmost Etsy recommendation chips are hidden as needed so these controls remain inside the normal toolbar width. Active Etsy filters are not intentionally removed.

The Multi-search editor uses a wide row layout on desktop and switches to a stacked rule-card layout on phones, with one predictable scrolling area and a wrapping footer.

## Project structure

`etsy-bettersearch.user.js` is the install/update entry point. The implementation is split into ordered `src/` modules loaded with Tampermonkey `@require` so the larger rule editor remains maintainable.

## Notes

BetterSearch does not use the Etsy API. It can only scan the finite result pages Etsy makes available for each search and cannot find listings Etsy never returns as candidates.

The script does not attempt to bypass Etsy verification or rate limiting.

Etsy can change its page structure at any time, so selectors may occasionally need updating.

This project is unofficial and is not affiliated with Etsy.
