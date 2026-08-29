# Etsy BetterSearch Diagnostics v0.2.3

This release hardens the diagnostic recorder after live testing exposed two lifecycle failures.

## Fixed

- A stale `ebsf-diagnostics:armed:v1` entry can no longer resurrect the heavy document-start DOM recorder forever after a failed export, debugger cancel, extension reload, or stale background session.
- Reload arming is freshness-stamped and one-shot. Invalid/old arms are removed before `content.js` runs.
- `get_state` now verifies that Chrome still reports a debugger attached before telling the content layer to resume an active recording. A stale active session is downgraded to a recoverable stopped session instead.
- Chrome debugger Cancel clears the reload arm before the existing retained auto-export path runs, so a following refresh cannot restart the old scan.
- The collapsed launcher shell now exactly matches the existing 42x42 `+` control instead of using a 44x44 outer shell around it.
- Auto-export outcome waiting was extended to 60 seconds for larger retained recordings. Failure/interruption still retains the stopped data for retry.

## Chrome debugger banner

Chrome owns the visible debugging infobar while `chrome.debugger` is attached. The extension cannot suppress that browser security UI. Pressing its Cancel control is handled as an unexpected debugger detach and the stopped recording remains exportable; the page-side auto-export path is requested when the Etsy tab is still available.

## Safety contract

Merely enabling Etsy BetterSearch Diagnostics must not start the heavy DOM recorder. Heavy DOM/network recording only starts for a confirmed active session or a fresh one-shot Record & Reload arm.
