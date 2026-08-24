// ==UserScript==
// @name         Etsy BetterSearch
// @namespace    https://github.com/juliekeygen-netizen
// @version      0.7.9
// @description  Adds strict title matching, rule-based multi-search, configurable scanning, persistent Etsy filters, and advanced Favorites filtering/sorting while keeping Etsy's native UI.
// @homepageURL  https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey
// @supportURL   https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/issues
// @author       juliekeygen-netizen
// @match        https://www.etsy.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/00-state.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/10-rules.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/15-scan-settings.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/16-sort-coverage.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/20-results.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/25-scan-favorite.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/27-scan-engine-settings.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/27-sort-coverage-engine.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/28-background-tab.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/29-scan-metrics.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/30-style.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/35-scan-settings-style.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/36-readable-modal-style.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/40-toolbar.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/45-scan-settings-ui.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/46-sort-coverage-ui.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/50-modal-runtime.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/55-mode-background.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/60-favorites-state.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/61-favorites-data.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/62-favorites-ui.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/65-favorites-style.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/62a-favorites-runtime-gate.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/63-favorites-runtime.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/64-favorites-fixes.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/66-favorites-audit-fixes.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/67-favorites-audit-polish.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/67b-favorites-network-hardening.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/67c-favorites-search-controls.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/67d-favorites-sidebar-responsive-polish.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/67e-favorites-native-filter-parity.js?v=0.7.9
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/68-favorites-runtime-ready.js?v=0.7.9
// @downloadURL  https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @updateURL    https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @noframes
// ==/UserScript==

// Implementation is loaded through the @require modules above.