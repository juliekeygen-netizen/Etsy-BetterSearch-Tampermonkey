# Etsy BetterSearch Diagnostics v0.2.4

This release fixes the startup failure that could leave Etsy on a blank/white page merely because the Diagnostics extension was enabled, and makes Chrome's own debugger-banner Cancel action a deliberate Stop + Export trigger.

## Root causes

### 1. A reload arm could start the heavy recorder before debugger confirmation

v0.2.3 added freshness checks around `ebsf-diagnostics:armed:v1`, but `content.js` still consumed that arm synchronously at `document_start` and could immediately install the page-wide DOM MutationObserver before the background had verified that Chrome still had the debugger attached.

The same active document could then write the arm again while synchronizing background state, undermining the intended one-shot lifecycle. A stale/recovered state could therefore keep bringing the heavy recorder back during Etsy startup.

### 2. A failed Cancel auto-export could retry heavyweight ZIP work on later Etsy loads

v0.2.3 retained a stopped recording after Chrome debugger Cancel, which is correct, but `autoExportPending` was also used to automatically retry ZIP construction when a later Etsy document loaded. A large or interrupted export could therefore make simply opening Etsy expensive again.

## v0.2.4 startup contract

A new Etsy document is passive until the background proves there is a live recording.

- `bootstrap-guard.js` synchronously consumes/removes any reload arm before `content.js` executes.
- The arm is no longer authority to start the DOM recorder.
- `content.js` can start the heavy recorder only after `get_state` returns a recording session.
- The existing background session-health layer verifies `chrome.debugger.getTargets()` before returning that active session.
- Merely enabling Diagnostics, refreshing Etsy, or carrying stale sessionStorage state must not install the whole-document recording MutationObserver.

`Record & Reload` still works: the debugger is attached first, the page reloads, the new document asks the background for state, the background confirms the live debugger, and only then does DOM recording begin.

## Chrome debugger banner Cancel

Chrome owns the banner shown while `chrome.debugger` is attached. Its Cancel action cannot be renamed or replaced by the extension, but Chrome reports that action through `chrome.debugger.onDetach` with detach reason `canceled_by_user`.

v0.2.4 treats that specific reason as an explicit user request to stop and export:

1. mark the recording stopped/recoverable;
2. close the page transport/reload arm;
3. trigger the existing retained Stop/Export workflow immediately;
4. request the diagnostic ZIP download;
5. retain the stopped data even after the download request so export can be retried if Chrome blocks or loses it.

Other detach reasons, such as the target closing, remain recovery events rather than automatic export requests.

An intentional Stop from the Diagnostics panel remains distinct because its stopped state is persisted before `chrome.debugger.detach()` is called.

## Failed/interrupted export behavior

If the immediate banner-Cancel export cannot finish, the stopped recording remains available, but later Etsy navigations stay passive.

- No automatic ZIP rebuild merely because Etsy was opened or refreshed.
- The panel surfaces the retained recording.
- **Export ZIP** is the explicit retry path.

This keeps data recovery without turning an old failed export into a repeated page-load performance problem.
