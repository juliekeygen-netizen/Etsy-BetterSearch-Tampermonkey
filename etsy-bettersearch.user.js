// ==UserScript==
// @name         Etsy BetterSearch
// @namespace    https://github.com/juliekeygen-netizen
// @version      0.5.2
// @description  Adds strict title matching, rule-based multi-search, configurable scanning, and persistent Etsy filters while keeping Etsy's native search UI.
// @homepageURL  https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey
// @supportURL   https://github.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/issues
// @author       juliekeygen-netizen
// @match        https://www.etsy.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/00-state.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/10-rules.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/15-scan-settings.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/20-results.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/25-scan-favorite.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/27-scan-engine-settings.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/30-style.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/35-scan-settings-style.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/36-readable-modal-style.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/40-toolbar.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/45-scan-settings-ui.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/50-modal-runtime.js?v=0.5.2
// @require      https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/src/55-mode-background.js?v=0.5.2
// @downloadURL  https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @updateURL    https://raw.githubusercontent.com/juliekeygen-netizen/Etsy-BetterSearch-Tampermonkey/main/etsy-bettersearch.user.js
// @noframes
// ==/UserScript==

// Implementation is loaded through the @require modules above.
