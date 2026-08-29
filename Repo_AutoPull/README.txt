Repo AutoPull
=============

Repo AutoPull watches one local Git repository, checks its tracked remote branch,
and fast-forwards the local copy when new commits appear.

After a successful pull it can optionally:
  1. run: npm run build
  2. run a custom terminal command
  3. open/run any selected file, app, or script
  4. show a Windows notification after the post-pull actions finish

POWERSHELL / SCRIPT EDITION
---------------------------
Normal launcher:
  Start Repo AutoPull.cmd

There is only one launcher now. Opening it shows:

  1. Start
  2. Configure

Pressing Enter chooses 1 (Start).

If no configuration exists yet, first-time setup opens automatically.

CONFIGURE BEHAVIOR
------------------
When changing an existing setup, pressing Enter at a setting keeps its current
value. Yes/no settings use an uppercase [Y/N] prompt and explicitly show the
current/default state.

Configuration includes:
- repository folder (any local Git repository)
- check interval
- npm run build on/off
- optional custom command
- optional file/app/script to open after the commands finish

INTERVAL INPUT
--------------
Plain numbers mean seconds.

Examples accepted as seconds:
  30
  30s
  30 s
  30sec
  30 sec
  30 seconds
  30seconds

Examples accepted as minutes:
  5m
  5 m
  5min
  5 min
  5 minutes
  5minutes

Examples accepted as hours:
  1h
  1 h
  1hr
  1 hour
  1hours

The displayed/saved form is normalized, for example:
  30 seconds
  5 minutes
  1 hour

POST-PULL ORDER
---------------
The actions run in this order:

  git pull --ff-only --autostash
      -> npm run build (optional)
      -> custom command (optional)
      -> selected file (optional)
      -> Windows notification

The build and custom command run with the repository folder as their working
directory.

If the build fails, later command/file actions are skipped.
If the custom command fails, the selected file is skipped.
The dashboard and notification report the failed stage.

GIT SAFETY
----------
Repo AutoPull uses normal Git CLI commands. It does not use reset --hard or
force-pull behavior.

Tracked local edits are handled with Git's --autostash during a fast-forward.
If Git cannot reapply the local changes cleanly, post-pull actions are skipped
and the dashboard reports that attention is needed.

If local and remote history diverge, Repo AutoPull refuses to auto-merge and
asks you to resolve the Git history manually.

The tool also prevents two monitor instances from watching the same repository
at the same time.

CONFIG FILE
-----------
The script edition uses:
  Repo-AutoPull.config.json

That file is local-only and ignored by Git.

Older BetterSearch-AutoPull.config.json settings are automatically imported on
the first run of the renamed tool when available.

STANDALONE EXE EDITION
----------------------
A single-file Windows build is provided separately as RepoAutoPull.exe.

You can copy RepoAutoPull.exe anywhere and use it by itself. It contains the
same Repo AutoPull PowerShell logic internally and temporarily extracts it only
while the program is running.

The standalone EXE keeps its settings outside the EXE folder at:
  %APPDATA%\RepoAutoPull\Repo-AutoPull.config.json

So the folder containing RepoAutoPull.exe can genuinely contain only that one
file.

The EXE is an unsigned custom Windows executable, so Windows SmartScreen may
show the normal warning for an unrecognized downloaded application.

REQUIREMENTS
------------
- Windows 10/11
- Git available as `git` on PATH
- Windows PowerShell 5.1 (included with Windows 10/11)
- npm on PATH only if the npm-build option is enabled

DISPLAY
-------
The monitor uses one refreshed dashboard instead of appending every check.
It shows:
- repository + branch/upstream
- normalized check interval
- current HEAD and commit title
- enabled post-pull actions
- status / last check / next check
- a short recent-pulls history with pulled commits and action results
