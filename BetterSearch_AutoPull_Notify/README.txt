BetterSearch AutoPull + Windows Notifications v1.3
======================================================

v1.3 FIX
--------
The autogitpull.exe integration has been removed from the actual update path.

Your tests showed that:
- the watcher loop itself was running every 30 seconds;
- autogitpull kept reporting the local commit it already saw;
- it did not move the local worktree to the new GitHub commit;
- a normal manual "git pull" DID work immediately.

So v1.3 uses the same normal Git CLI that already works on your PC.

Every cycle is now:

  git fetch <remote>
       |
       v
  compare local HEAD with the tracked remote branch
       |
       +-- same ---------> Up to date
       |
       +-- remote ahead -> git pull --ff-only
       |                        |
       |                        +--> Windows notification
       |
       +-- dirty/diverged -> do NOT overwrite anything; show a warning

autogitpull.exe is no longer required.

SAFETY
------
The helper never uses reset --hard, force-pull, or any command intended to
discard local work.

If the worktree contains local changes and an update is available, it reports
"Update waiting" and skips the pull.

If local and remote history have diverged, it also stops and asks for manual Git
resolution instead of attempting an unsafe merge.

DISPLAY
-------
The console is now a single refreshed status screen instead of an ever-growing
wall of checks.

It shows:
- repo
- current branch/upstream
- current HEAD + commit title
- last check time
- next check time
- current status
- recent successful pulls and the commits included in them

Example:

  ========================================================
   BetterSearch AutoPull + Notifications v1.3
  ========================================================
  Repo   : C:\...\Etsy-BetterSearch-Tampermonkey
  Branch : main -> origin/main
  Every  : 30s
  HEAD   : 220995e  test: add AutoPull verification file

  Status : Up to date
  Checked: 15:22:30
  Next   : 15:23:00

  Recent pulls:
    15:20:31  71d27e4 -> 220995e  (1 commit)
             220995e  test: add AutoPull verification file

NOTIFICATIONS
-------------
After a successful automatic pull, Windows shows:

  BetterSearch updated
  Pulled <commit> - <commit title>

If several commits arrived together, the notification says how many were
pulled and shows the newest commit.

EXISTING CONFIG
---------------
Your existing BetterSearch-AutoPull.config.json still works.

The old autogitpullExe field may remain in it; v1.3 simply ignores it.

If you run Reset setup.cmd, the new setup only asks for:
- local repository folder
- check interval

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

IMPORTANT FOR THIS v1.3 UPGRADE
-------------------------------
Because v1.2 is the broken version that cannot pull this fix automatically, you
need to do ONE FINAL manual "git pull" to receive v1.3.

After v1.3 is running, normal future repository updates should be pulled by this
helper itself.

Chrome extension rebuild/reload is intentionally NOT included yet.
