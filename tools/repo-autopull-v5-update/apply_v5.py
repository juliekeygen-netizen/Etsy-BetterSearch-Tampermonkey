from pathlib import Path
import re

PS = Path('Repo_AutoPull/Repo-AutoPull.ps1')
README = Path('Repo_AutoPull/README.txt')
text = PS.read_text(encoding='utf-8-sig')


def replace_function(name: str, body: str):
    global text
    pat = re.compile(rf'(?ms)^function {re.escape(name)} \{{.*?(?=^function [A-Za-z0-9_-]+ \{{|^\$script:GitExe\s*=|\Z)')
    m = pat.search(text)
    if not m:
        raise SystemExit(f'function not found: {name}')
    text = text[:m.start()] + body.rstrip() + '\n\n' + text[m.end():]


replace_function('New-DefaultConfiguration', r'''function New-DefaultConfiguration {
    return [pscustomobject]@{
        configVersion       = 5
        repoPath            = ""
        interval            = "30 seconds"
        pullMode            = "autostash"
        promptOnPullFailure = $true
        runNpmBuild         = $false
        customCommands      = @()
        launchPath          = ""
    }
}''')

replace_function('Convert-ToCommandArray', r'''function Convert-ToCommandArray {
    param($Value)
    $commands = @()
    if ($null -eq $Value) { return @() }

    foreach ($item in @($Value)) {
        if ($null -eq $item) { continue }

        if ($item -is [string]) {
            $commandText = ([string]$item).Trim()
            if (-not [string]::IsNullOrWhiteSpace($commandText)) {
                $commands += [pscustomobject]@{ shell = "cmd"; text = $commandText }
            }
            continue
        }

        $shell = "cmd"
        $commandText = ""
        try {
            if ($null -ne $item.shell) { $shell = ([string]$item.shell).Trim().ToLowerInvariant() }
            if ($null -ne $item.text) { $commandText = [string]$item.text }
            elseif ($null -ne $item.command) { $commandText = [string]$item.command }
        }
        catch { continue }

        if ($shell -notin @("cmd", "powershell")) { $shell = "cmd" }
        $commandText = $commandText.Trim()
        if (-not [string]::IsNullOrWhiteSpace($commandText)) {
            $commands += [pscustomobject]@{ shell = $shell; text = $commandText }
        }
    }
    return @($commands)
}''')

replace_function('Normalize-Configuration', r'''function Normalize-Configuration {
    param($Config)
    $normalized = New-DefaultConfiguration
    if ($null -eq $Config) { return $normalized }

    if ($null -ne $Config.repoPath) { $normalized.repoPath = [string]$Config.repoPath }
    if ($null -ne $Config.runNpmBuild) { $normalized.runNpmBuild = [bool]$Config.runNpmBuild }
    if ($null -ne $Config.launchPath) { $normalized.launchPath = [string]$Config.launchPath }
    if ($null -ne $Config.promptOnPullFailure) { $normalized.promptOnPullFailure = [bool]$Config.promptOnPullFailure }

    if ($null -ne $Config.pullMode) {
        $pullMode = ([string]$Config.pullMode).Trim().ToLowerInvariant()
        if ($pullMode -in @("autostash", "strict")) { $normalized.pullMode = $pullMode }
    }

    $commands = @()
    if ($null -ne $Config.customCommands) {
        $commands = @(Convert-ToCommandArray $Config.customCommands)
    }
    elseif ($null -ne $Config.postPullCommand -and -not [string]::IsNullOrWhiteSpace([string]$Config.postPullCommand)) {
        $commands = @([pscustomobject]@{ shell = "cmd"; text = ([string]$Config.postPullCommand).Trim() })
    }
    $normalized.customCommands = @($commands)

    if ($null -ne $Config.interval -and -not [string]::IsNullOrWhiteSpace([string]$Config.interval)) {
        try { $normalized.interval = (Parse-Interval ([string]$Config.interval)).Display }
        catch { $normalized.interval = "30 seconds" }
    }
    return $normalized
}''')

replace_function('Save-Configuration', r'''function Save-Configuration {
    param($Config)
    $normalized = Normalize-Configuration $Config
    [pscustomobject]@{
        configVersion       = 5
        repoPath            = [string]$normalized.repoPath
        interval            = [string]$normalized.interval
        pullMode            = [string]$normalized.pullMode
        promptOnPullFailure = [bool]$normalized.promptOnPullFailure
        runNpmBuild         = [bool]$normalized.runNpmBuild
        customCommands      = @($normalized.customCommands)
        launchPath          = [string]$normalized.launchPath
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}''')

replace_function('Read-Configuration', r'''function Read-Configuration {
    Import-LegacyConfigurationIfNeeded
    $config = Read-ConfigurationFile -Path $ConfigPath
    if ($null -eq $config) { return $null }
    $normalized = Normalize-Configuration $config

    $version = 0
    try { $version = [int]$config.configVersion } catch {}
    if ($version -lt 5 -or $null -eq $config.customCommands -or $null -eq $config.pullMode -or $null -eq $config.promptOnPullFailure) {
        Save-Configuration -Config $normalized
    }
    return $normalized
}''')

# Insert command/pull helpers before Manage-CustomCommands.
marker = 'function Manage-CustomCommands {'
idx = text.index(marker)
helpers = r'''function Get-CommandShellLabel {
    param($Command)
    $shell = ([string]$Command.shell).ToLowerInvariant()
    if ($shell -eq "powershell") { return "PowerShell" }
    return "CMD"
}

function Get-CommandDisplayText {
    param($Command, [int]$MaxLength = 92)
    $commandText = [string]$Command.text
    $lines = @($commandText -split "`r?`n")
    $first = if ($lines.Count -gt 0) { $lines[0].Trim() } else { "" }
    if ($first.Length -gt $MaxLength) { $first = $first.Substring(0, $MaxLength - 3) + "..." }
    $extra = if ($lines.Count -gt 1) { " (+$($lines.Count - 1) lines)" } else { "" }
    return "[$(Get-CommandShellLabel $Command)] $first$extra"
}

function Select-CommandShell {
    param([string]$Current = "powershell")
    $defaultChoice = if ($Current -eq "cmd") { "2" } else { "1" }
    while ($true) {
        Write-Host ""
        Write-Host "Command shell:" -ForegroundColor Cyan
        Write-Host "  1. PowerShell  - variables, pipes, Get-ChildItem, Copy-Item, etc."
        Write-Host "  2. CMD / batch - classic cmd.exe commands and batch syntax"
        $choice = (Read-Host "Choose [$defaultChoice]").Trim()
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = $defaultChoice }
        if ($choice -eq "1") { return "powershell" }
        if ($choice -eq "2") { return "cmd" }
        Write-Host "Choose 1 or 2." -ForegroundColor Yellow
    }
}

function Read-MultiLineCommand {
    Write-Host ""
    Write-Host "Paste/type the command below." -ForegroundColor Cyan
    Write-Host "Type .done on its own line when finished." -ForegroundColor DarkGray
    Write-Host "Type .cancel on its own line before entering anything to cancel." -ForegroundColor DarkGray
    $lines = New-Object System.Collections.Generic.List[string]
    while ($true) {
        $line = Read-Host
        if ($line -eq ".cancel" -and $lines.Count -eq 0) { return $null }
        if ($line -eq ".done") { break }
        [void]$lines.Add($line)
    }
    $value = ($lines.ToArray() -join "`r`n").Trim()
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    return $value
}

function Read-CommandContent {
    param([string]$CurrentText = "")
    while ($true) {
        Write-Host ""
        Write-Host "Command input:" -ForegroundColor Cyan
        Write-Host "  1. Use clipboard contents (best for multi-line scripts)"
        Write-Host "  2. Type/paste one line"
        Write-Host "  3. Type/paste multiple lines"
        Write-Host "  4. Cancel"
        $choice = (Read-Host "Choose [1]").Trim()
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
        switch ($choice) {
            "1" {
                try { $value = [string](Get-Clipboard -Raw -ErrorAction Stop) }
                catch { Write-Host "Could not read the clipboard: $($_.Exception.Message)" -ForegroundColor Red; continue }
                $value = $value.Trim()
                if ([string]::IsNullOrWhiteSpace($value)) { Write-Host "Clipboard is empty." -ForegroundColor Yellow; continue }
                Write-Host "Clipboard command:" -ForegroundColor DarkGray
                foreach ($line in @($value -split "`r?`n") | Select-Object -First 8) { Write-Host "  $line" -ForegroundColor DarkGray }
                if ((@($value -split "`r?`n")).Count -gt 8) { Write-Host "  ..." -ForegroundColor DarkGray }
                if (Prompt-BooleanSetting -Question "Use this clipboard command?" -Current $true -HasCurrent $false) { return $value }
            }
            "2" {
                $value = Read-Host "Command (Enter = cancel)"
                if ([string]::IsNullOrWhiteSpace($value)) { return $null }
                return $value.Trim()
            }
            "3" { return Read-MultiLineCommand }
            "4" { return $null }
            default { Write-Host "Choose 1, 2, 3, or 4." -ForegroundColor Yellow }
        }
    }
}

function Get-PullModeLabel {
    param([string]$PullMode)
    if ($PullMode -eq "strict") { return "Strict clean pull" }
    return "Preserve local edits (autostash)"
}

function Select-PullMode {
    param([string]$Current = "autostash", [bool]$HasCurrent = $true)
    $defaultChoice = if ($Current -eq "strict") { "2" } else { "1" }
    while ($true) {
        Write-Host "Update mode:" -ForegroundColor Cyan
        Write-Host "  1. Preserve local tracked edits automatically (recommended)"
        Write-Host "     Uses: git pull --ff-only --autostash"
        Write-Host "  2. Require a clean tracked worktree"
        Write-Host "     Uses: git pull --ff-only"
        $suffix = if ($HasCurrent) { "Enter = keep current" } else { "Enter = use recommended" }
        $choice = (Read-Host "Choose [$defaultChoice] ($suffix)").Trim()
        if ([string]::IsNullOrWhiteSpace($choice)) { $choice = $defaultChoice }
        if ($choice -eq "1") { return "autostash" }
        if ($choice -eq "2") { return "strict" }
        Write-Host "Choose 1 or 2." -ForegroundColor Yellow
    }
}

function Get-PullArguments {
    param($UpstreamInfo, [string]$PullMode)
    $args = @("pull", "--ff-only")
    if ($PullMode -ne "strict") { $args += "--autostash" }
    $args += "--quiet"
    if (-not $UpstreamInfo.TrackingConfigured) {
        $args += $UpstreamInfo.Remote
        $args += $UpstreamInfo.RemoteBranch
    }
    return @($args)
}

function Format-GitFailureDetail {
    param($Result)
    $lines = @(Get-NonEmptyLines $Result)
    if ($lines.Count -eq 0) { return "Git returned exit code $($Result.ExitCode)." }
    $important = @($lines | Where-Object { $_ -match '(?i)^(fatal:|error:|CONFLICT|hint:)|conflict|unmerged|would be overwritten|local changes' })
    $chosen = if ($important.Count -gt 0) { $important } else { $lines }
    $chosen = @($chosen | Select-Object -First 4)
    return ($chosen -join " | ")
}

function Show-GitStatusForRecovery {
    param([string]$RepoPath)
    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Git Status"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    $statusResult = Invoke-Git -RepoPath $RepoPath -GitArgs @("status")
    foreach ($line in $statusResult.Lines) { Write-Host $line }
    Write-Host ""
    $stashResult = Invoke-Git -RepoPath $RepoPath -GitArgs @("stash", "list")
    Write-Host "Stashes:" -ForegroundColor Cyan
    $stashLines = @(Get-NonEmptyLines $stashResult)
    if ($stashLines.Count -eq 0) { Write-Host "  none" -ForegroundColor DarkGray }
    else { foreach ($line in $stashLines | Select-Object -First 10) { Write-Host "  $line" } }
    Write-Host ""
    Read-Host "Press Enter to return to recovery options" | Out-Null
}

function Invoke-PullOnce {
    param([string]$RepoPath, $UpstreamInfo, [string]$PullMode)
    $args = @(Get-PullArguments -UpstreamInfo $UpstreamInfo -PullMode $PullMode)
    return Invoke-Git -RepoPath $RepoPath -GitArgs $args
}

function Invoke-PullWithRecovery {
    param([string]$RepoPath, $UpstreamInfo, [string]$PullMode, [bool]$PromptOnFailure)
    $repoName = Split-Path -Leaf $RepoPath
    $recoveryNote = ""

    while ($true) {
        $result = Invoke-PullOnce -RepoPath $RepoPath -UpstreamInfo $UpstreamInfo -PullMode $PullMode
        if ($result.ExitCode -eq 0) {
            return [pscustomobject]@{ ExitCode = 0; Lines = @($result.Lines); RecoveryNote = $recoveryNote }
        }

        $failureDetail = Format-GitFailureDetail $result
        Show-DesktopNotification -Title "$repoName pull failed" -Message $failureDetail
        if (-not $PromptOnFailure) {
            return [pscustomobject]@{ ExitCode = $result.ExitCode; Lines = @($result.Lines); RecoveryNote = $recoveryNote }
        }

        while ($true) {
            $unmerged = @(Get-UnmergedFiles -RepoPath $RepoPath)
            Clear-Host
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host " Repo AutoPull - Pull Recovery"
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Automatic pull failed." -ForegroundColor Red
            Write-Host "Reason:" -ForegroundColor Cyan
            foreach ($line in @(Get-NonEmptyLines $result | Select-Object -First 8)) { Write-Host "  $line" }
            if ($unmerged.Count -gt 0) {
                Write-Host ""
                Write-Host "Unmerged/conflicted files:" -ForegroundColor Yellow
                foreach ($file in $unmerged) { Write-Host "  $file" }
            }
            Write-Host ""
            Write-Host "1. Retry the configured pull"
            Write-Host "2. Show Git status + stash list"
            if ($unmerged.Count -eq 0) {
                Write-Host "3. Stash tracked local changes, then retry"
            } else {
                Write-Host "3. Stash tracked local changes, then retry (unavailable while files are unmerged)" -ForegroundColor DarkGray
            }
            Write-Host "4. Reset tracked files to $($UpstreamInfo.Upstream) (DESTRUCTIVE)" -ForegroundColor Red
            Write-Host "5. Skip for now and keep monitoring"
            Write-Host ""
            $choice = (Read-Host "Choose [5]").Trim()
            if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "5" }

            if ($choice -eq "1") { break }
            if ($choice -eq "2") { Show-GitStatusForRecovery -RepoPath $RepoPath; continue }
            if ($choice -eq "3") {
                if ($unmerged.Count -gt 0) {
                    Write-Host "Cannot create a normal stash while unmerged files exist." -ForegroundColor Yellow
                    Start-Sleep -Seconds 2
                    continue
                }
                $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                $stash = Invoke-Git -RepoPath $RepoPath -GitArgs @("stash", "push", "-m", "RepoAutoPull recovery $stamp")
                if ($stash.ExitCode -ne 0) {
                    Write-Host "Stash failed: $(Format-GitFailureDetail $stash)" -ForegroundColor Red
                    Start-Sleep -Seconds 2
                    continue
                }
                $recoveryNote = "local tracked changes saved in Git stash"
                Write-Host "Local tracked changes were saved in Git stash. Retrying..." -ForegroundColor Green
                Start-Sleep -Milliseconds 700
                break
            }
            if ($choice -eq "4") {
                Write-Host ""
                Write-Host "WARNING: This discards ALL tracked local changes/conflict edits in this repository." -ForegroundColor Red
                Write-Host "Untracked files are not removed." -ForegroundColor Yellow
                $confirm = (Read-Host "Type RESET to continue").Trim()
                if ($confirm -cne "RESET") { continue }
                $reset = Invoke-Git -RepoPath $RepoPath -GitArgs @("reset", "--hard", $UpstreamInfo.Upstream)
                if ($reset.ExitCode -ne 0) {
                    Write-Host "Reset failed: $(Format-GitFailureDetail $reset)" -ForegroundColor Red
                    Start-Sleep -Seconds 2
                    continue
                }
                $recoveryNote = "tracked files reset to $($UpstreamInfo.Upstream)"
                return [pscustomobject]@{ ExitCode = 0; Lines = @($reset.Lines); RecoveryNote = $recoveryNote }
            }
            if ($choice -eq "5") {
                return [pscustomobject]@{ ExitCode = $result.ExitCode; Lines = @($result.Lines); RecoveryNote = $recoveryNote }
            }
            Write-Host "Choose 1, 2, 3, 4, or 5." -ForegroundColor Yellow
            Start-Sleep -Milliseconds 650
        }
    }
}

'''
text = text[:idx] + helpers + text[idx:]

replace_function('Manage-CustomCommands', r'''function Manage-CustomCommands {
    param($CurrentCommands)
    $commands = New-Object System.Collections.Generic.List[object]
    foreach ($command in @(Convert-ToCommandArray $CurrentCommands)) { [void]$commands.Add($command) }

    while ($true) {
        Clear-Host
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host " Repo AutoPull - Custom Commands"
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Each command has its own shell: PowerShell or CMD." -ForegroundColor DarkGray
        Write-Host "Commands run from the watched repository folder, in the order shown." -ForegroundColor DarkGray
        Write-Host "If one fails, later commands and the launch step are skipped." -ForegroundColor DarkGray
        Write-Host ""

        if ($commands.Count -eq 0) { Write-Host "Current commands: none" -ForegroundColor DarkGray }
        else {
            Write-Host "Current order:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $commands.Count; $i++) {
                Write-Host ("  {0}. {1}" -f ($i + 1), (Get-CommandDisplayText $commands[$i]))
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
                $shell = Select-CommandShell -Current "powershell"
                $commandText = Read-CommandContent
                if (-not [string]::IsNullOrWhiteSpace([string]$commandText)) {
                    [void]$commands.Add([pscustomobject]@{ shell = $shell; text = $commandText })
                }
            }
            "2" {
                if ($commands.Count -eq 0) { Write-Host "There are no commands to edit." -ForegroundColor Yellow; Start-Sleep -Milliseconds 650; continue }
                $index = Read-CommandIndex -Prompt "Command number to edit (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                $currentCommand = $commands[$index]
                Write-Host ""
                Write-Host "Current: $(Get-CommandDisplayText $currentCommand)" -ForegroundColor Cyan
                foreach ($line in @(([string]$currentCommand.text) -split "`r?`n")) { Write-Host "  $line" -ForegroundColor DarkGray }
                Write-Host ""
                Write-Host "1. Replace command text"
                Write-Host "2. Change shell"
                Write-Host "3. Change shell and command text"
                $editChoice = (Read-Host "Choose (Enter = cancel)").Trim()
                if ($editChoice -eq "1") {
                    $newText = Read-CommandContent -CurrentText ([string]$currentCommand.text)
                    if ($null -ne $newText) { $commands[$index] = [pscustomobject]@{ shell = [string]$currentCommand.shell; text = $newText } }
                }
                elseif ($editChoice -eq "2") {
                    $newShell = Select-CommandShell -Current ([string]$currentCommand.shell)
                    $commands[$index] = [pscustomobject]@{ shell = $newShell; text = [string]$currentCommand.text }
                }
                elseif ($editChoice -eq "3") {
                    $newShell = Select-CommandShell -Current ([string]$currentCommand.shell)
                    $newText = Read-CommandContent -CurrentText ([string]$currentCommand.text)
                    if ($null -ne $newText) { $commands[$index] = [pscustomobject]@{ shell = $newShell; text = $newText } }
                }
            }
            "3" {
                if ($commands.Count -eq 0) { Write-Host "There are no commands to delete." -ForegroundColor Yellow; Start-Sleep -Milliseconds 650; continue }
                $index = Read-CommandIndex -Prompt "Command number to delete (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                Write-Host "Selected: $(Get-CommandDisplayText $commands[$index])" -ForegroundColor Yellow
                if (Prompt-ActionYesNo -Question "Delete this command?" -EnterMeaning "cancel") { $commands.RemoveAt($index) }
            }
            "4" {
                if ($commands.Count -lt 2) { Write-Host "At least two commands are needed to change the order." -ForegroundColor Yellow; Start-Sleep -Milliseconds 650; continue }
                $index = Read-CommandIndex -Prompt "Command number to move (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                $target = Read-CommandIndex -Prompt "Move it to position (1-$($commands.Count); Enter = cancel)" -Count $commands.Count
                if ($null -eq $target -or $target -eq $index) { continue }
                $item = $commands[$index]
                $commands.RemoveAt($index)
                $commands.Insert($target, $item)
            }
            default { Write-Host "Choose 1, 2, 3, 4, or press Enter." -ForegroundColor Yellow; Start-Sleep -Milliseconds 650 }
        }
    }
    return @($commands.ToArray())
}''')

replace_function('Run-Configuration', r'''function Run-Configuration {
    param([bool]$FirstRun = $false)
    $current = Read-Configuration
    if ($null -eq $current) { $current = New-DefaultConfiguration }
    $hasExisting = -not [string]::IsNullOrWhiteSpace([string]$current.repoPath)

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    if ($hasExisting) { Write-Host "Press Enter to keep any existing setting unchanged." -ForegroundColor DarkGray }
    else { Write-Host "First-time setup. Press Enter to accept shown defaults." -ForegroundColor DarkGray }

    Write-Host ""
    Write-Host "[1/5] Repository" -ForegroundColor Cyan
    if ($hasExisting -and (Test-GitRepository ([string]$current.repoPath))) {
        Write-Host "  $($current.repoPath)"
        $changeRepo = Prompt-ActionYesNo -Question "Change repository?" -EnterMeaning "keep current repository"
        $repoPath = if ($changeRepo) { Choose-NewRepository -InitialPath ([string]$current.repoPath) } else { [string]$current.repoPath }
    } else {
        Write-Host "Choose the local Git repository to watch." -ForegroundColor DarkGray
        $repoPath = Choose-NewRepository -InitialPath ([string]$current.repoPath)
    }

    Write-Host ""
    Write-Host "[2/5] Check interval" -ForegroundColor Cyan
    $currentInterval = Parse-Interval ([string]$current.interval)
    while ($true) {
        $intervalPrompt = if ($hasExisting) { "Check interval [$($currentInterval.Display)] (Enter = keep)" } else { "Check interval [$($currentInterval.Display)] (Enter = use default)" }
        $intervalInput = (Read-Host $intervalPrompt).Trim()
        if ([string]::IsNullOrWhiteSpace($intervalInput)) { $intervalInfo = $currentInterval; break }
        try { $intervalInfo = Parse-Interval $intervalInput; break }
        catch { Write-Host $_.Exception.Message -ForegroundColor Red }
    }
    Write-Host "  Examples: 30, 30 sec, 5 min, 1 hour" -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "[3/5] Pull behavior" -ForegroundColor Cyan
    $pullMode = Select-PullMode -Current ([string]$current.pullMode) -HasCurrent $hasExisting
    $promptOnPullFailure = Prompt-BooleanSetting -Question "Show interactive recovery options when a pull fails?" -Current ([bool]$current.promptOnPullFailure) -HasCurrent $hasExisting
    Write-Host "  Recovery never performs the destructive reset unless you explicitly choose it and type RESET." -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "[4/5] Post-pull commands" -ForegroundColor Cyan
    $runNpmBuild = Prompt-BooleanSetting -Question "Run 'npm run build' after each successful update?" -Current ([bool]$current.runNpmBuild) -HasCurrent $hasExisting
    $existingCommands = @($current.customCommands)
    if ($existingCommands.Count -eq 0) { Write-Host "Custom commands: none" -ForegroundColor DarkGray }
    else {
        Write-Host "Custom commands:" -ForegroundColor DarkGray
        for ($i = 0; $i -lt $existingCommands.Count; $i++) { Write-Host ("  {0}. {1}" -f ($i + 1), (Get-CommandDisplayText $existingCommands[$i])) -ForegroundColor DarkGray }
    }
    $manageCommands = Prompt-ActionYesNo -Question "Manage custom commands?" -EnterMeaning "keep current commands"
    $customCommands = if ($manageCommands) { @(Manage-CustomCommands -CurrentCommands $existingCommands) } else { @($existingCommands) }

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[5/5] Launch after commands" -ForegroundColor Cyan
    $currentLaunch = [string]$current.launchPath
    $currentLaunchEnabled = -not [string]::IsNullOrWhiteSpace($currentLaunch)
    $launchEnabled = Prompt-BooleanSetting -Question "Open/run a selected file after commands finish?" -Current $currentLaunchEnabled -HasCurrent $hasExisting
    $launchPath = ""
    if ($launchEnabled) {
        $launchPath = $currentLaunch
        if ($currentLaunchEnabled -and (Test-Path -LiteralPath $currentLaunch -PathType Leaf)) {
            Write-Host "Current file:" -ForegroundColor DarkGray; Write-Host "  $currentLaunch"
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
        configVersion       = 5
        repoPath            = $repoPath
        interval            = $intervalInfo.Display
        pullMode            = $pullMode
        promptOnPullFailure = $promptOnPullFailure
        runNpmBuild         = $runNpmBuild
        customCommands      = @($customCommands)
        launchPath          = $launchPath
    }
    Save-Configuration -Config $updated

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configuration Saved"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Repository : $repoPath"
    Write-Host "Interval   : $($intervalInfo.Display)"
    Write-Host "Pull mode  : $(Get-PullModeLabel $pullMode)"
    Write-Host ("Recovery   : {0}" -f $(if ($promptOnPullFailure) { "interactive" } else { "notification only" }))
    Write-Host ("Build      : {0}" -f $(if ($runNpmBuild) { "npm run build" } else { "off" }))
    if ($customCommands.Count -eq 0) { Write-Host "Commands   : none" }
    else {
        Write-Host "Commands   : $($customCommands.Count)"
        for ($i = 0; $i -lt $customCommands.Count; $i++) { Write-Host ("             {0}. {1}" -f ($i + 1), (Get-CommandDisplayText $customCommands[$i])) }
    }
    Write-Host ("Launch     : {0}" -f $(if ([string]::IsNullOrWhiteSpace($launchPath)) { "off" } else { $launchPath }))
    Write-Host ""
    Write-Host "Update order: fetch -> pull/recovery -> build -> custom commands -> launch -> notification" -ForegroundColor DarkGray
    if (-not $FirstRun) { Write-Host ""; Read-Host "Press Enter to return to the menu" | Out-Null }
    return Read-Configuration
}''')

replace_function('Invoke-CustomCommand', r'''function Invoke-CustomCommand {
    param([string]$RepoPath, $CommandEntry)

    $entry = @(Convert-ToCommandArray @($CommandEntry))
    if ($entry.Count -ne 1) {
        return [pscustomobject]@{ Success = $false; ExitCode = 1; Summary = "Custom command failed"; Detail = "Command entry is invalid." }
    }
    $shell = [string]$entry[0].shell
    $commandText = [string]$entry[0].text
    $tempFile = $null
    $oldPreference = $ErrorActionPreference
    Push-Location $RepoPath
    try {
        $ErrorActionPreference = "Continue"
        if ($shell -eq "powershell") {
            $powerShellExe = Get-Command powershell.exe -ErrorAction SilentlyContinue
            if ($null -eq $powerShellExe) {
                return [pscustomobject]@{ Success = $false; ExitCode = 1; Summary = "PowerShell command failed"; Detail = "powershell.exe was not found on PATH." }
            }
            $tempFile = Join-Path $env:TEMP ("RepoAutoPull-{0}.ps1" -f ([guid]::NewGuid().ToString("N")))
            $wrapped = @"
`$ErrorActionPreference = 'Stop'
`$global:LASTEXITCODE = 0
try {
    & {
$commandText
    }
    `$commandSucceeded = `$?
    if (`$LASTEXITCODE -ne 0) { exit `$LASTEXITCODE }
    if (-not `$commandSucceeded) { exit 1 }
    exit 0
}
catch {
    Write-Error `$_
    exit 1
}
"@
            Set-Content -LiteralPath $tempFile -Value $wrapped -Encoding UTF8
            $raw = @(& $powerShellExe.Source -NoLogo -NoProfile -ExecutionPolicy Bypass -File $tempFile 2>&1)
            $exitCode = $LASTEXITCODE
        }
        else {
            $commandProcessor = if (-not [string]::IsNullOrWhiteSpace($env:ComSpec)) { $env:ComSpec } else { "cmd.exe" }
            $tempFile = Join-Path $env:TEMP ("RepoAutoPull-{0}.cmd" -f ([guid]::NewGuid().ToString("N")))
            Set-Content -LiteralPath $tempFile -Value $commandText -Encoding ASCII
            $raw = @(& $commandProcessor /d /s /c "`"$tempFile`"" 2>&1)
            $exitCode = $LASTEXITCODE
        }
    }
    finally {
        $ErrorActionPreference = $oldPreference
        Pop-Location
        if (-not [string]::IsNullOrWhiteSpace([string]$tempFile)) { Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue }
    }

    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $detail = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { "" }
    return [pscustomobject]@{
        Success = ($exitCode -eq 0)
        ExitCode = $exitCode
        Summary = $(if ($exitCode -eq 0) { "Custom command finished" } else { "Custom command failed" })
        Detail = $detail
    }
}''')

replace_function('Get-ActionLabel', r'''function Get-ActionLabel {
    param($Config)
    $parts = @()
    if ([bool]$Config.runNpmBuild) { $parts += "build" }
    $commandCount = @($Config.customCommands).Count
    if ($commandCount -eq 1) { $parts += "1 command" }
    elseif ($commandCount -gt 1) { $parts += "$commandCount commands" }
    if (-not [string]::IsNullOrWhiteSpace([string]$Config.launchPath)) { $parts += "launch" }
    if ($parts.Count -eq 0) { return "none" }; return ($parts -join " -> ")
}''')

# Dashboard: expose pull behavior.
old = '    Write-Host ("After  : {0}" -f (Get-ActionLabel $Config))\n'
new = old + '    Write-Host ("Pull   : {0}   |   recovery: {1}" -f (Get-PullModeLabel ([string]$Config.pullMode)), $(if ([bool]$Config.promptOnPullFailure) { "prompt" } else { "notify only" }))\n'
if old not in text:
    raise SystemExit('dashboard anchor not found')
text = text.replace(old, new, 1)

# Monitor: use recovery wrapper, richer diagnostics, and typed command objects.
old = '''                        $pullArgs = if ($upstreamInfo.TrackingConfigured) {
                            @("pull", "--ff-only", "--autostash", "--quiet")
                        } else {
                            @("pull", "--ff-only", "--autostash", "--quiet", $upstreamInfo.Remote, $upstreamInfo.RemoteBranch)
                        }
                        $pullResult = Invoke-Git -RepoPath $repoPath -GitArgs $pullArgs
'''
new = '''                        $pullResult = Invoke-PullWithRecovery -RepoPath $repoPath -UpstreamInfo $upstreamInfo `
                            -PullMode ([string]$config.pullMode) -PromptOnFailure ([bool]$config.promptOnPullFailure)
'''
if old not in text:
    raise SystemExit('pull invocation anchor not found')
text = text.replace(old, new, 1)

text = text.replace('''                                $detail = if ($unmerged.Count -gt 0) { "Autostash reapply conflicted: $($unmerged -join ', ')" } else { Get-LastLine $pullResult }
''', '''                                $detail = if ($unmerged.Count -gt 0) { "Local changes/conflicts need attention: $($unmerged -join ', ')" } else { Format-GitFailureDetail $pullResult }
''', 1)

old = '''                                    $command = [string]$commands[$commandIndex]
                                    $displayNumber = $commandIndex + 1
                                    Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                                        -HeadHash $afterHash -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                        -Status "Running command $displayNumber/$($commands.Count)..." -StatusKind "working" -Detail $command `
                                        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory
                                    $commandResult = Invoke-CustomCommand -RepoPath $repoPath -Command $command
'''
new = '''                                    $command = $commands[$commandIndex]
                                    $displayNumber = $commandIndex + 1
                                    $commandDisplay = Get-CommandDisplayText $command
                                    Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                                        -HeadHash $afterHash -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                        -Status "Running command $displayNumber/$($commands.Count)..." -StatusKind "working" -Detail $commandDisplay `
                                        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory
                                    $commandResult = Invoke-CustomCommand -RepoPath $repoPath -CommandEntry $command
'''
if old not in text:
    raise SystemExit('command loop anchor not found')
text = text.replace(old, new, 1)

text = text.replace('''                                        $postFailure = "Command $displayNumber failed (exit $($commandResult.ExitCode)): $command"
''', '''                                        $postFailure = "Command $displayNumber failed (exit $($commandResult.ExitCode)): $commandDisplay"
''', 1)
text = text.replace('''                        elseif ($pullResult.ExitCode -ne 0) { $status = "Pull failed"; $statusKind = "error"; $detail = Get-LastLine $pullResult }
''', '''                        elseif ($pullResult.ExitCode -ne 0) { $status = "Pull failed"; $statusKind = "error"; $detail = Format-GitFailureDetail $pullResult }
''', 1)

# Successful recovery note should be visible after update.
text = text.replace('''                                $actionParts = @(); $postSuccess = $true; $postFailure = ""
''', '''                                $actionParts = @(); $postSuccess = $true; $postFailure = ""
                                if (-not [string]::IsNullOrWhiteSpace([string]$pullResult.RecoveryNote)) { $actionParts += [string]$pullResult.RecoveryNote }
''', 1)

# Main menu: show pull behavior.
old = '        Write-Host "  Interval   : $($config.interval)"\n        Write-Host "  After pull : $(Get-ActionLabel $config)"\n'
new = '        Write-Host "  Interval   : $($config.interval)"\n        Write-Host "  Pull mode  : $(Get-PullModeLabel ([string]$config.pullMode))"\n        Write-Host "  After pull : $(Get-ActionLabel $config)"\n'
if old not in text:
    raise SystemExit('main menu anchor not found')
text = text.replace(old, new, 1)

PS.write_text(text, encoding='utf-8')

README.write_text(r'''REPO AUTOPULL
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
''', encoding='utf-8')
