Repo AutoPull
=============

Repo AutoPull watches one local Git repository, pulls fast-forward updates, and can run ordered post-pull actions.

START / CONFIGURE
-----------------
Run:
  Start Repo AutoPull.cmd

Menu:
  1. Start
  2. Configure

Press Enter to choose Start. On first run, configuration opens automatically.

CONFIGURATION
-------------
You can configure:
- repository to watch
- check interval
- optional npm run build
- zero or more custom commands
- optional file/app/script to launch afterward

For existing settings, pressing Enter keeps the current value.

Intervals accept forms such as:
  30
  30s
  30 sec
  30 seconds
  5m
  5 min
  5 minutes
  1h
  1 hour

A bare number means seconds.

CUSTOM COMMANDS
---------------
Custom commands are an ordered list. The command manager supports:
  1. Add new command
  2. Edit command
  3. Delete command
  4. Move command

Commands execute in the exact order shown.

Every custom command runs with the watched repository as its working directory. For example, if a command is:
  npm run build

that is equivalent to opening a terminal in the watched repository and typing:
  npm run build

Shell operators supported by cmd.exe also work, for example:
  npm test && npm run build

If npm run build is also enabled as the dedicated build step and you additionally add npm run build as a custom command, it will run twice.

POST-PULL ORDER
---------------
After a successful pull:
  1. npm run build (if enabled)
  2. custom command 1
  3. custom command 2
  4. ...remaining commands in order
  5. selected file/app/script (if enabled)
  6. Windows notification

If the build or any custom command fails, later commands and the launch step are skipped. The dashboard and notification identify the failed action.

GIT SAFETY
----------
Repo AutoPull uses normal Git CLI commands and only fast-forwards:
  git fetch
  git pull --ff-only --autostash

It does not use reset --hard or discard local work. If local and remote history diverge, AutoPull stops for manual resolution. If autostash reapply conflicts, post-pull actions are skipped and the dashboard warns you.

CONFIG FILE
-----------
Script version:
  Repo_AutoPull\Repo-AutoPull.config.json

Standalone EXE version:
  %APPDATA%\RepoAutoPull\Repo-AutoPull.config.json

Config version 4 stores custom commands as an array. Older config version 3 files with a single postPullCommand are migrated automatically to command #1.

STANDALONE EXE
--------------
Repo_AutoPull\RepoAutoPull.exe is a standalone Windows x64 launcher containing the same PowerShell implementation.

Its settings live under %APPDATA%, so the EXE itself can be copied elsewhere and used alone.

Requirements:
- Windows 10/11
- Git on PATH
- npm on PATH only if npm build / npm custom commands are used

The EXE is unsigned, so Windows SmartScreen may show an unknown-publisher warning.
