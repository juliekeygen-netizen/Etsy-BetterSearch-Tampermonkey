# Browser extension builds

Etsy BetterSearch now builds from the same shared `src/` modules for Chrome and Firefox. The Tampermonkey userscript remains supported and is not replaced by these builds.

## Build locally

Requires Node.js 20+.

```bash
npm run check
npm test
npm run build
```

Generated output:

```text
dist/chrome/
dist/firefox/
```

## Load in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select `dist/chrome`.

## Load in Firefox

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**.
4. Select `dist/firefox/manifest.json`.

For normal downloadable builds, use the GitHub Actions artifacts or tagged GitHub releases produced by the repository workflows.

## Current conversion status

The extension build runs the same BetterSearch feature modules as Tampermonkey through a small compatibility adapter backed by extension storage. The shared content runtime includes the versioned Favorites IndexedDB index, authoritative cheap-data synchronization, and the persistent deep-listing queue with retries, automatic population, and native-search-footprint progress. Queue data survives browser restarts and resumes when an Etsy Favorites page is active; the extension service worker remains a minimal shell for now.

See:

- `docs/EXTENSION_ARCHITECTURE.md` for the platform design.
- `docs/ROADMAP.md` for the phased Favorites index/deep-scanner plan.
