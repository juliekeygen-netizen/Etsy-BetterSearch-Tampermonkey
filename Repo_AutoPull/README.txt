REPO AUTOPULL
=============

Repo AutoPull watches one local Git repository, checks its upstream branch at a chosen interval, safely updates it, and can run post-update actions.

START
-----
Run:
  Start Repo AutoPull.cmd

The launcher shows:
  1. Start monitoring
  2. Configure

Pressing Enter chooses Start. On first run, configuration opens automatically.

CONFIGURATION
-------------
Configuration is split into five sections:
  1. Repository
  2. Check interval
  3. Pull behavior
  4. Post-pull commands
  5. Launch after commands

Pressing Enter at an existing setting keeps it unchanged.

INTERVALS
---------
Examples accepted:
  30
  30s
  30 sec
  30 seconds
  5m
  5 min
  5 minutes
  1h
  1 hour

A number without a unit means seconds.

PULL BEHAVIOR
-------------
Two safe normal update modes are available:

1. Preserve local tracked edits automatically (recommended)
   git pull --ff-only --autostash

2. Require a clean tracked worktree
   git pull --ff-only

Interactive recovery can be enabled/disabled. When enabled, a failed pull shows the real Git error and offers:
  1. Retry
  2. Show Git status + stash list
  3. Stash tracked local changes and retry
  4. Reset tracked files to the upstream branch (DESTRUCTIVE; requires typing RESET)
  5. Skip and keep monitoring

The destructive reset is never automatic. It does not remove untracked files.

CUSTOM COMMANDS
---------------
Custom commands are ordered and each command has a shell:
  - PowerShell
  - CMD / batch

Existing pre-v5 commands are migrated as CMD commands for compatibility.

New/edit command input supports:
  1. Clipboard contents (recommended for multi-line scripts)
  2. One-line input
  3. Multi-line input (finish with .done)

PowerShell commands support variables, pipelines and cmdlets. Example:

  $apk = Get-ChildItem .\app\build\outputs\apk -Recurse -Filter *.apk |
      Where-Object FullName -Match "arm64-v8a" |
      Select-Object -First 1

  Copy-Item $apk.FullName .\Artemis-Plus-debug-arm64.apk -Force

Every custom command runs with the watched repository as its working directory.

POST-UPDATE ORDER
-----------------
  fetch
  -> pull / recovery
  -> npm run build (optional)
  -> custom command 1
  -> custom command 2
  -> ...
  -> selected file launch (optional)
  -> Windows notification

If build or a custom command fails, later post-update steps are skipped.

STANDALONE EXE
--------------
RepoAutoPull.exe contains the same PowerShell logic in one Windows x64 executable.
Its configuration is stored under:
  %APPDATA%\RepoAutoPull\Repo-AutoPull.config.json

The source launcher stores configuration beside Repo-AutoPull.ps1 instead.

SAFETY
------
Normal updates never use reset --hard or force pull. The optional recovery reset is clearly marked DESTRUCTIVE, requires an explicit menu choice plus typing RESET, and is never performed automatically.

Repo AutoPull refuses to automatically merge diverged histories.
