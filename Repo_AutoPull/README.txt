Repo AutoPull
=============

Repo AutoPull watches one local Git repository, checks its tracked remote branch,
and fast-forwards the local copy when new commits appear.

After a successful pull it can optionally:
  1. run npm run build
  2. run any number of custom terminal commands, in order
  3. open/run a selected file, app, or script
  4. show a Windows notification after all enabled actions finish

START / CONFIGURE
-----------------
Normal launcher:
  Start Repo AutoPull.cmd

The launcher shows the current setup and two choices:

  1. Start monitoring
  2. Configure

Pressing Enter chooses 1. If no configuration exists, first-time setup opens
automatically.

CONFIGURATION UI
----------------
Configuration is split into clear sections:
  [1/4] Repository
  [2/4] Check interval
  [3/4] Post-pull commands
  [4/4] Launch after commands

For an existing setup, pressing Enter keeps the current value.

Actual on/off settings show their real state, for example:
  Run 'npm run build' after each successful pull? [Y/N]
  (currently ON; Enter = keep)

Action questions do not use misleading ON/OFF wording. For example:
  Change repository? [Y/N] (Enter = keep current repository)
  Manage custom commands? [Y/N] (Enter = keep current commands)
  Change selected file? [Y/N] (Enter = keep current file)

CUSTOM COMMANDS
---------------
The command manager supports:
  1. Add new command
  2. Edit command
  3. Delete command
  4. Move command

Commands run from the watched repository folder in exactly the displayed order.
So a command such as:
  npm run build
runs exactly as if it were typed in a terminal opened at that repository root.

If one custom command fails, later commands and the launch step are skipped.
The dashboard and notification identify the failed command and exit code.

INTERVAL INPUT
--------------
Plain numbers mean seconds.

Accepted examples include:
  30
  30s
  30 sec
  30 seconds
  5m
  5 min
  5 minutes
  1h
  1 hr
  1 hour

The displayed/saved form is normalized, such as:
  30 seconds
  5 minutes
  1 hour

POST-PULL ORDER
---------------
Actions run in this order:

  git pull --ff-only --autostash
      -> npm run build (optional)
      -> custom command 1
      -> custom command 2
      -> ...
      -> selected file (optional)
      -> Windows notification

Both npm run build and all custom commands run with the watched repository as
their working directory.

GIT SAFETY
----------
Repo AutoPull uses the normal Git CLI. It does not use reset --hard or force
pulling. Tracked local edits are handled using --autostash during a fast-forward.
If local/remote history diverges or an autostash reapply conflicts, automatic
post-pull actions stop and the dashboard reports that manual attention is needed.

The tool prevents two monitor instances from watching the same repository at the
same time.

SCRIPT EDITION
--------------
Files:
  Start Repo AutoPull.cmd
  Repo-AutoPull.ps1
  Repo-AutoPull.config.json  (local-only / Git-ignored)

STANDALONE EXE
--------------
RepoAutoPull.exe contains the same PowerShell implementation in one Windows x64
executable. Its settings are stored at:
  %APPDATA%\RepoAutoPull\Repo-AutoPull.config.json

The EXE is unsigned, so Windows SmartScreen may show the usual unknown-publisher
warning.

REQUIREMENTS
------------
- Windows 10/11
- Git on PATH
- Windows PowerShell 5.1
- npm on PATH only when npm build or an npm custom command is enabled
