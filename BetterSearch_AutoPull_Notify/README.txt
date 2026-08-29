Repo AutoPull + Windows Notifications
====================================

WHAT IT DOES
------------
Repo AutoPull watches a local Git repository and uses your normal installed Git
CLI to keep its current branch fast-forwarded with its tracked remote branch.

It is no longer tied to the Etsy BetterSearch repository. During setup you can
pick ANY local Git repository.

Normal cycle:

  git fetch
      |
      v
  remote is ahead?
      |
     yes
      |
      v
  git pull --ff-only --autostash
      |
      v
  optional post-pull actions
      |
      v
  Windows notification

The terminal stays on one refreshed dashboard instead of printing an endless log
of every check.

POST-PULL ACTIONS
-----------------
Setup now supports three optional actions. They run only after an update was
successfully pulled.

Order:

  1. npm run build                (optional toggle)
  2. custom terminal command      (optional)
  3. open/run selected file       (optional)
  4. Windows notification

1) npm run build
----------------
Enable this in setup to automatically run:

  npm run build

inside the watched repository after each successful pull.

The final update notification is delayed until the build has finished. If the
build fails, the dashboard and notification report that failure and later
post-pull actions are skipped.

2) Custom terminal command
--------------------------
You can enter one custom Windows command. It runs from the watched repository
folder after the optional npm build.

Examples:

  npm test
  npm run ci
  python tools/update.py
  echo updated && npm test

Because it is executed through cmd.exe, normal Windows command syntax including
&& can be used.

If the custom command fails (non-zero exit code), the selected file launch is
skipped and the dashboard/notification reports the failure.

3) Open/run a selected file
---------------------------
Setup can show a normal Windows file picker. You can select any file type.

After the build/custom command stages finish successfully, Repo AutoPull asks
Windows to open/run that file using Start-Process. Executables/scripts may run;
normal documents open with their configured Windows application.

Examples:

  .exe
  .cmd / .bat
  .ps1
  .py
  .txt
  project files
  shortcuts

The launcher is started and Repo AutoPull immediately continues; it does not wait
for the opened program to close.

SETUP / CONFIGURE
-----------------
Recommended:

  Configure AutoPull.cmd

This keeps your current choices as defaults and lets you change:

  - watched repository
  - polling interval
  - npm run build on/off
  - custom command
  - selected file to open/run

The repository picker validates that the selected folder is actually a Git
working tree.

For the custom command:

  - Enter keeps the current command when one already exists
  - type NONE to remove an existing command

For the file launcher, a standard Windows file picker is used.

FRESH RESET
-----------

  Reset setup.cmd

This deletes the saved configuration and runs setup from scratch.

START
-----
Preferred generic launcher:

  Start Repo AutoPull.cmd

The older launcher still works too:

  Start BetterSearch AutoPull.cmd

Both start the same PowerShell helper.

DASHBOARD
---------
Example:

  ========================================================
   Repo AutoPull
  ========================================================
  Repo   : C:\Projects\MyExtension
  Branch : main -> origin/main   |   every 30s
  HEAD   : abc1234  latest commit title
  After  : build -> command -> launch

  Status : Up to date
  Last   : 17:25:30   |   Next: 17:26:00

  Recent pulls:
    17:20:02  1234567 -> abc1234  (2 commits)
             2345678  first new commit
             abc1234  second new commit
             actions: build OK; command OK; launched helper.cmd

The Recent pulls list is kept in memory for the current run only.

NOTIFICATIONS
-------------
Notifications happen AFTER configured post-pull work finishes.

Examples:

  MyExtension updated
  Pulled abc1234 - fix build. build OK.

or:

  MyExtension updated - action failed
  Pulled abc1234 - fix build. npm run build failed: <last output line>

If Git pulls successfully but reapplying autostashed local changes causes a
conflict, post-pull actions are skipped and a warning notification is shown.

LOCAL CHANGES / SAFETY
----------------------
Repo AutoPull never uses reset --hard or force-pull.

For a normal remote-ahead update it uses:

  git pull --ff-only --autostash

So tracked local edits are temporarily preserved while Git fast-forwards, then
Git reapplies them. Untracked files are left alone.

If autostash reapply creates conflicts, Repo AutoPull does NOT run the build,
custom command, or file launcher. It reports the affected files instead.

If local and remote history have diverged, Repo AutoPull does not merge or reset
anything automatically; it shows a warning for manual resolution.

OLD CONFIG COMPATIBILITY
------------------------
Existing BetterSearch-AutoPull.config.json files still work.

If the old config does not contain the new settings, Repo AutoPull defaults to:

  npm build     OFF
  custom command none
  launch file    none

Run Configure AutoPull.cmd once to set the new options.

The config filename is kept for compatibility even though the watcher is now
generic.

TEST NOTIFICATION
-----------------
Double-click:

  Test notification.cmd

STOP
----
Close the Repo AutoPull window or press Ctrl+C.

NOTE ABOUT SELF-UPDATES
-----------------------
Repo AutoPull can pull updates to its own PowerShell file while it is running,
but the already-running PowerShell process continues using the version that was
loaded when it started. After an AutoPull feature update, close and restart the
launcher once to start using the new code.
