BetterSearch AutoPull + Windows Notifications v1.2
======================================================

WHY v1.2
--------
The original monitor could detect a local Git HEAD change, but that alone did not
prove autogitpull itself had pulled it. A manual "git pull" could trigger the old
v1.0 detector too.

v1.2 makes the autogitpull side much more deterministic:

  --single-run
      One real scan cycle, then exit.

  --no-hash-check
      autogitpull attempts the pull operation on EVERY scheduled scan instead of
      relying on its preliminary hash comparison.

  --include-private
      Allows GitHub remotes that require authentication too (including setups
      where the repo is accessed through authenticated Git credentials / SSH).

  --show-skipped
      If autogitpull skips the repository, the reason is visible in the console.

The dangerous options --force-pull / --discard-dirty are NOT enabled.

CONTINUOUS LOOP
---------------
The wrapper owns the recurrence:

    CHECK #1
       |
       v
    autogitpull performs one pull scan
       |
       +--> update -> Windows notification
       |
       v
    countdown
       |
       v
    CHECK #2
       |
       v
    ... forever

IMPORTANT: an UPDATE DETECTED event does NOT stop the monitor.
After the notification it prints:

    Update handled successfully. Monitoring will continue.

Then it starts the normal countdown and the next check.

NORMAL OUTPUT
-------------
When nothing changed you should see something like:

    [14:30:00] CHECK #1 - contacting Git remote...
    ...
    [14:30:02] CHECK #1 finished - pull attempted; HEAD unchanged.
    Next GitHub check in 30s...

When an update is actually pulled:

    [14:31:04] UPDATE DETECTED:
    Pulled 5f35da9 - v0.14.2: fix ...
    Update handled successfully. Monitoring will continue.
    Next GitHub check in 30s...

UPGRADE FROM v1.0/v1.1
----------------------
1. Close the old AutoPull window.
2. Extract this ZIP.
3. Replace these files in your existing BetterSearch_AutoPull_Notify folder:
     BetterSearch-AutoPull.ps1
     Start BetterSearch AutoPull.cmd
     Reset setup.cmd
     Test notification.cmd
     README.txt
4. KEEP your existing:
     BetterSearch-AutoPull.config.json
5. KEEP your:
     autogitpull.exe
6. Double-click:
     Start BetterSearch AutoPull.cmd

You do not need to redo setup.

WHY MANUAL GIT PULL WAS MISLEADING
----------------------------------
v1.0 watched the local Git HEAD continuously. Therefore ANY process that changed
HEAD -- including you manually running "git pull" -- could cause its
"UPDATE DETECTED" notification.

v1.1/v1.2 compare HEAD immediately before and immediately after each autogitpull
single-run scan. That makes the notification much more tightly associated with
the autogitpull scan itself.

TEST NOTIFICATION
-----------------
Double-click:
  Test notification.cmd

CHANGE SETUP
------------
Double-click:
  Reset setup.cmd

STOP
----
Close the window or press Ctrl+C.

Chrome extension rebuild/reload is intentionally NOT included yet.
