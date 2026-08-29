from pathlib import Path

root = Path(__file__).resolve().parents[2]
ps1_path = root / "Repo_AutoPull" / "Repo-AutoPull.ps1"
readme_path = root / "Repo_AutoPull" / "README.txt"
text = ps1_path.read_text(encoding="utf-8-sig")


def replace_between(source: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[:start] + replacement.rstrip() + "\n\n" + source[end:]


prompt_helpers = r'''function Prompt-BooleanSetting {
    param([string]$Question, [bool]$Current, [bool]$HasCurrent = $true)
    $state = if ($Current) { "ON" } else { "OFF" }
    $hint = if ($HasCurrent) { "currently $state; Enter = keep" } else { "default $state; Enter = use default" }
    while ($true) {
        $answer = (Read-Host "$Question [Y/N] ($hint)").Trim()
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Current }
        if ($answer -match '^[Yy]') { return $true }
        if ($answer -match '^[Nn]') { return $false }
        Write-Host "Type Y, N, or press Enter." -ForegroundColor Yellow
    }
}

function Prompt-ActionYesNo {
    param([string]$Question, [string]$EnterMeaning = "cancel")
    while ($true) {
        $answer = (Read-Host "$Question [Y/N] (Enter = $EnterMeaning)").Trim()
        if ([string]::IsNullOrWhiteSpace($answer)) { return $false }
        if ($answer -match '^[Yy]') { return $true }
        if ($answer -match '^[Nn]') { return $false }
        Write-Host "Type Y, N, or press Enter." -ForegroundColor Yellow
    }
}'''

text = replace_between(text, "function Prompt-YesNoSetting {", "function Select-RepositoryFolder {", prompt_helpers)

command_manager = r'''function Manage-CustomCommands {
    param([string[]]$CurrentCommands)
    $commands = New-Object System.Collections.Generic.List[string]
    foreach ($command in @(Convert-ToCommandArray $CurrentCommands)) { [void]$commands.Add($command) }

    while ($true) {
        Clear-Host
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host " Repo AutoPull - Custom Commands"
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "These commands run from the watched repository folder." -ForegroundColor DarkGray
        Write-Host "They run in the order shown, after the optional npm build." -ForegroundColor DarkGray
        Write-Host "If one fails, later commands and the launch step are skipped." -ForegroundColor DarkGray
        Write-Host ""

        if ($commands.Count -eq 0) {
            Write-Host "Current commands: none" -ForegroundColor DarkGray
        }
        else {
            Write-Host "Current order:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $commands.Count; $i++) {
                Write-Host ("  {0}. {1}" -f ($i + 1), $commands[$i])
            }
        }

        Write-Host ""
        Write-Host "1. Add new command"
        Write-Host "2. Edit command"
        Write-Host "3. Delete command"
        Write-Host "4. Move command"
        Write-Host ""
        $choice = (Read-Host "Choose an action (Enter = done)").Trim()
        if ([string]::IsNullOrWhiteSpace($choice)) { break }

        switch ($choice) {
            "1" {
                $newCommand = (Read-Host "New command (Enter = cancel)").Trim()
                if (-not [string]::IsNullOrWhiteSpace($newCommand)) { [void]$commands.Add($newCommand) }
            }
            "2" {
                if ($commands.Count -eq 0) {
                    Write-Host "There are no commands to edit." -ForegroundColor Yellow
                    Start-Sleep -Milliseconds 650
                    continue
                }
                $index = Read-CommandIndex -Prompt "Command number to edit (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                Write-Host "Current: $($commands[$index])" -ForegroundColor DarkGray
                $replacement = Read-Host "New command (Enter = keep current)"
                if (-not [string]::IsNullOrWhiteSpace($replacement)) { $commands[$index] = $replacement.Trim() }
            }
            "3" {
                if ($commands.Count -eq 0) {
                    Write-Host "There are no commands to delete." -ForegroundColor Yellow
                    Start-Sleep -Milliseconds 650
                    continue
                }
                $index = Read-CommandIndex -Prompt "Command number to delete (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                Write-Host "Selected: $($commands[$index])" -ForegroundColor Yellow
                if (Prompt-ActionYesNo -Question "Delete this command?" -EnterMeaning "cancel") { $commands.RemoveAt($index) }
            }
            "4" {
                if ($commands.Count -lt 2) {
                    Write-Host "At least two commands are needed to change the order." -ForegroundColor Yellow
                    Start-Sleep -Milliseconds 650
                    continue
                }
                $index = Read-CommandIndex -Prompt "Command number to move (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                $target = Read-CommandIndex -Prompt "Move it to position (1-$($commands.Count); Enter = cancel)" -Count $commands.Count
                if ($null -eq $target -or $target -eq $index) { continue }
                $item = $commands[$index]
                $commands.RemoveAt($index)
                $commands.Insert($target, $item)
            }
            default {
                Write-Host "Choose 1, 2, 3, 4, or press Enter." -ForegroundColor Yellow
                Start-Sleep -Milliseconds 650
            }
        }
    }
    return @($commands.ToArray())
}'''
text = replace_between(text, "function Manage-CustomCommands {", "function Run-Configuration {", command_manager)

configuration = r'''function Run-Configuration {
    param([bool]$FirstRun = $false)
    $current = Read-Configuration
    if ($null -eq $current) { $current = New-DefaultConfiguration }
    $hasExisting = -not [string]::IsNullOrWhiteSpace([string]$current.repoPath)

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    if ($hasExisting) {
        Write-Host "Press Enter to keep any existing setting unchanged." -ForegroundColor DarkGray
    } else {
        Write-Host "First-time setup. Press Enter to accept shown defaults." -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "[1/4] Repository" -ForegroundColor Cyan
    if ($hasExisting -and (Test-GitRepository ([string]$current.repoPath))) {
        Write-Host "  $($current.repoPath)"
        $changeRepo = Prompt-ActionYesNo -Question "Change repository?" -EnterMeaning "keep current repository"
        $repoPath = if ($changeRepo) { Choose-NewRepository -InitialPath ([string]$current.repoPath) } else { [string]$current.repoPath }
    } else {
        Write-Host "Choose the local Git repository to watch." -ForegroundColor DarkGray
        $repoPath = Choose-NewRepository -InitialPath ([string]$current.repoPath)
    }

    Write-Host ""
    Write-Host "[2/4] Check interval" -ForegroundColor Cyan
    $currentInterval = Parse-Interval ([string]$current.interval)
    while ($true) {
        $intervalPrompt = if ($hasExisting) {
            "Check interval [$($currentInterval.Display)] (Enter = keep)"
        } else {
            "Check interval [$($currentInterval.Display)] (Enter = use default)"
        }
        $intervalInput = (Read-Host $intervalPrompt).Trim()
        if ([string]::IsNullOrWhiteSpace($intervalInput)) { $intervalInfo = $currentInterval; break }
        try { $intervalInfo = Parse-Interval $intervalInput; break }
        catch { Write-Host $_.Exception.Message -ForegroundColor Red }
    }
    Write-Host "  Examples: 30, 30 sec, 5 min, 1 hour" -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "[3/4] Post-pull commands" -ForegroundColor Cyan
    $runNpmBuild = Prompt-BooleanSetting -Question "Run 'npm run build' after each successful pull?" -Current ([bool]$current.runNpmBuild) -HasCurrent $hasExisting

    $existingCommands = @($current.customCommands)
    if ($existingCommands.Count -eq 0) {
        Write-Host "Custom commands: none" -ForegroundColor DarkGray
    } else {
        Write-Host "Custom commands:" -ForegroundColor DarkGray
        for ($i = 0; $i -lt $existingCommands.Count; $i++) {
            Write-Host ("  {0}. {1}" -f ($i + 1), $existingCommands[$i]) -ForegroundColor DarkGray
        }
    }
    $manageCommands = Prompt-ActionYesNo -Question "Manage custom commands?" -EnterMeaning "keep current commands"
    $customCommands = if ($manageCommands) {
        @(Manage-CustomCommands -CurrentCommands $existingCommands)
    } else {
        @($existingCommands)
    }

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[4/4] Launch after commands" -ForegroundColor Cyan
    $currentLaunch = [string]$current.launchPath
    $currentLaunchEnabled = -not [string]::IsNullOrWhiteSpace($currentLaunch)
    $launchEnabled = Prompt-BooleanSetting -Question "Open/run a selected file after commands finish?" -Current $currentLaunchEnabled -HasCurrent $hasExisting
    $launchPath = ""
    if ($launchEnabled) {
        $launchPath = $currentLaunch
        if ($currentLaunchEnabled -and (Test-Path -LiteralPath $currentLaunch -PathType Leaf)) {
            Write-Host "Current file:" -ForegroundColor DarkGray
            Write-Host "  $currentLaunch"
            $changeFile = Prompt-ActionYesNo -Question "Change selected file?" -EnterMeaning "keep current file"
            if ($changeFile) { $launchPath = "" }
        }
        while ([string]::IsNullOrWhiteSpace($launchPath) -or -not (Test-Path -LiteralPath $launchPath -PathType Leaf)) {
            $picked = Select-LaunchFile -InitialPath $currentLaunch
            if (-not [string]::IsNullOrWhiteSpace($picked)) { $launchPath = $picked; break }
            $typed = Normalize-EnteredPath (Read-Host "Paste a file path, or press Enter to browse again")
            if (-not [string]::IsNullOrWhiteSpace($typed) -and (Test-Path -LiteralPath $typed -PathType Leaf)) { $launchPath = $typed; break }
        }
    }

    $updated = [pscustomobject]@{
        configVersion  = 4
        repoPath       = $repoPath
        interval       = $intervalInfo.Display
        runNpmBuild    = $runNpmBuild
        customCommands = @($customCommands)
        launchPath     = $launchPath
    }
    Save-Configuration -Config $updated

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configuration Saved"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Repository : $repoPath"
    Write-Host "Interval   : $($intervalInfo.Display)"
    Write-Host ("Build      : {0}" -f $(if ($runNpmBuild) { "npm run build" } else { "off" }))
    if ($customCommands.Count -eq 0) {
        Write-Host "Commands   : none"
    }
    else {
        Write-Host "Commands   : $($customCommands.Count)"
        for ($i = 0; $i -lt $customCommands.Count; $i++) {
            Write-Host ("             {0}. {1}" -f ($i + 1), $customCommands[$i])
        }
    }
    Write-Host ("Launch     : {0}" -f $(if ([string]::IsNullOrWhiteSpace($launchPath)) { "off" } else { $launchPath }))
    Write-Host ""
    Write-Host "Post-pull order: pull -> build -> custom commands -> launch -> notification" -ForegroundColor DarkGray
    if (-not $FirstRun) { Write-Host ""; Read-Host "Press Enter to return to the menu" | Out-Null }
    return Read-Configuration
}'''
text = replace_between(text, "function Run-Configuration {", "function Invoke-NpmBuild {", configuration)

main_menu = r'''function Show-MainMenu {
    while ($true) {
        $config = Read-Configuration
        if ($null -eq $config -or [string]::IsNullOrWhiteSpace([string]$config.repoPath)) {
            Clear-Host
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host " Repo AutoPull"
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "No configuration found. Starting first-time setup..." -ForegroundColor Yellow
            Start-Sleep -Milliseconds 500
            $config = Run-Configuration -FirstRun $true
            Start-Monitor -Config $config
            continue
        }

        Clear-Host
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host " Repo AutoPull"
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Current setup:" -ForegroundColor Cyan
        Write-Host "  Repository : $($config.repoPath)"
        Write-Host "  Interval   : $($config.interval)"
        Write-Host "  After pull : $(Get-ActionLabel $config)"
        Write-Host ""
        Write-Host "1. Start monitoring"
        Write-Host "2. Configure"
        Write-Host ""
        $choice = (Read-Host "Choose [1]").Trim()
        if ([string]::IsNullOrWhiteSpace($choice) -or $choice -eq "1") {
            Start-Monitor -Config $config
        }
        elseif ($choice -eq "2") {
            Run-Configuration | Out-Null
        }
        else {
            Write-Host "Choose 1 or 2." -ForegroundColor Yellow
            Start-Sleep -Milliseconds 650
        }
    }
}'''
text = replace_between(text, "function Show-MainMenu {", "$script:GitExe = Find-Git", main_menu)

# Guard against accidental leftovers from the old generic prompt helper.
if "Prompt-YesNoSetting" in text:
    raise SystemExit("old Prompt-YesNoSetting reference remains")

ps1_path.write_text(text, encoding="utf-8-sig")

readme = r'''Repo AutoPull
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
'''
readme_path.write_text(readme, encoding="utf-8")
