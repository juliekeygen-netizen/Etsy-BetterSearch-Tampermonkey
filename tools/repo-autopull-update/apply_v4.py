from pathlib import Path
import re

path = Path('Repo_AutoPull/Repo-AutoPull.ps1')
text = path.read_text(encoding='utf-8-sig')
original = text


def sub(pattern: str, replacement: str, label: str, flags=re.S):
    global text
    text2, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')
    text = text2

# Config v4 + migration from the v3 single-command field.
sub(
    r'function New-DefaultConfiguration \{.*?\n\}\n\nfunction Normalize-Configuration \{.*?\n\}\n\nfunction Read-ConfigurationFile',
    r'''function New-DefaultConfiguration {
    return [pscustomobject]@{
        configVersion  = 4
        repoPath       = ""
        interval       = "30 seconds"
        runNpmBuild    = $false
        customCommands = @()
        launchPath     = ""
    }
}

function Convert-ToCommandArray {
    param($Value)
    $commands = @()
    if ($null -eq $Value) { return @() }
    foreach ($item in @($Value)) {
        if ($null -eq $item) { continue }
        $valueText = [string]$item
        if (-not [string]::IsNullOrWhiteSpace($valueText)) { $commands += $valueText.Trim() }
    }
    return @($commands)
}

function Normalize-Configuration {
    param($Config)
    $normalized = New-DefaultConfiguration
    if ($null -eq $Config) { return $normalized }
    if ($null -ne $Config.repoPath) { $normalized.repoPath = [string]$Config.repoPath }
    if ($null -ne $Config.runNpmBuild) { $normalized.runNpmBuild = [bool]$Config.runNpmBuild }
    if ($null -ne $Config.launchPath) { $normalized.launchPath = [string]$Config.launchPath }

    $commands = @()
    if ($null -ne $Config.customCommands) {
        $commands = @(Convert-ToCommandArray $Config.customCommands)
    }
    elseif ($null -ne $Config.postPullCommand -and -not [string]::IsNullOrWhiteSpace([string]$Config.postPullCommand)) {
        $commands = @(([string]$Config.postPullCommand).Trim())
    }
    $normalized.customCommands = @($commands)

    if ($null -ne $Config.interval -and -not [string]::IsNullOrWhiteSpace([string]$Config.interval)) {
        try { $normalized.interval = (Parse-Interval ([string]$Config.interval)).Display }
        catch { $normalized.interval = "30 seconds" }
    }
    return $normalized
}

function Read-ConfigurationFile''',
    'config normalization',
)

sub(
    r'function Save-Configuration \{.*?\n\}\n\nfunction Import-LegacyConfigurationIfNeeded',
    r'''function Save-Configuration {
    param($Config)
    $normalized = Normalize-Configuration $Config
    [pscustomobject]@{
        configVersion  = 4
        repoPath       = [string]$normalized.repoPath
        interval       = [string]$normalized.interval
        runNpmBuild    = [bool]$normalized.runNpmBuild
        customCommands = @($normalized.customCommands)
        launchPath     = [string]$normalized.launchPath
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Import-LegacyConfigurationIfNeeded''',
    'save config',
)

sub(
    r'function Read-Configuration \{.*?\n\}\n\nfunction Find-Git',
    r'''function Read-Configuration {
    Import-LegacyConfigurationIfNeeded
    $config = Read-ConfigurationFile -Path $ConfigPath
    if ($null -eq $config) { return $null }
    $normalized = Normalize-Configuration $config

    $version = 0
    try { $version = [int]$config.configVersion } catch {}
    if ($version -lt 4 -or $null -eq $config.customCommands) {
        Save-Configuration -Config $normalized
    }
    return $normalized
}

function Find-Git''',
    'read config migration',
)

manager = r'''function Read-CommandIndex {
    param([string]$Prompt, [int]$Count, [bool]$AllowCancel = $true)
    if ($Count -lt 1) { return $null }
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        if ($AllowCancel -and [string]::IsNullOrWhiteSpace($value)) { return $null }
        $index = 0
        if ([int]::TryParse($value, [ref]$index) -and $index -ge 1 -and $index -le $Count) { return ($index - 1) }
        Write-Host "Enter a number from 1 to $Count$(if ($AllowCancel) { ', or press Enter to cancel' } else { '' })." -ForegroundColor Yellow
    }
}

function Manage-CustomCommands {
    param([string[]]$CurrentCommands)
    $commands = New-Object System.Collections.Generic.List[string]
    foreach ($command in @(Convert-ToCommandArray $CurrentCommands)) { [void]$commands.Add($command) }

    while ($true) {
        Clear-Host
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host " Repo AutoPull - Custom Commands"
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Commands run from the watched repository folder, in this exact order." -ForegroundColor DarkGray
        Write-Host "If one command fails, later commands and the launch step are skipped." -ForegroundColor DarkGray
        Write-Host ""

        if ($commands.Count -eq 0) { Write-Host "Custom commands: none" -ForegroundColor DarkGray }
        else {
            Write-Host "Custom commands:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $commands.Count; $i++) { Write-Host ("  {0}. {1}" -f ($i + 1), $commands[$i]) }
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
                if ($commands.Count -eq 0) { continue }
                $index = Read-CommandIndex -Prompt "Command number to edit (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                Write-Host "Current: $($commands[$index])" -ForegroundColor DarkGray
                $replacement = Read-Host "New command (Enter = keep)"
                if (-not [string]::IsNullOrWhiteSpace($replacement)) { $commands[$index] = $replacement.Trim() }
            }
            "3" {
                if ($commands.Count -eq 0) { continue }
                $index = Read-CommandIndex -Prompt "Command number to delete (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                Write-Host "Delete: $($commands[$index])" -ForegroundColor Yellow
                $confirm = (Read-Host "Delete this command? [Y/N] (Enter = cancel)").Trim()
                if ($confirm -match '^[Yy]') { $commands.RemoveAt($index) }
            }
            "4" {
                if ($commands.Count -lt 2) { continue }
                $index = Read-CommandIndex -Prompt "Command number to move (Enter = cancel)" -Count $commands.Count
                if ($null -eq $index) { continue }
                $target = Read-CommandIndex -Prompt "Move it to position (1-$($commands.Count); Enter = cancel)" -Count $commands.Count
                if ($null -eq $target -or $target -eq $index) { continue }
                $item = $commands[$index]
                $commands.RemoveAt($index)
                $commands.Insert($target, $item)
            }
            default { Write-Host "Choose 1, 2, 3, 4, or press Enter." -ForegroundColor Yellow; Start-Sleep -Milliseconds 700 }
        }
    }
    return @($commands.ToArray())
}

'''
if 'function Run-Configuration {' not in text:
    raise SystemExit('run config marker missing')
text = text.replace('function Run-Configuration {', manager + 'function Run-Configuration {', 1)

sub(
    r'    Write-Host ""\n    \$currentCommand = \[string\]\$current\.postPullCommand.*?\n    Write-Host ""\n    \$currentLaunch =',
    r'''    $customCommands = @(Manage-CustomCommands -CurrentCommands @($current.customCommands))

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan

    Write-Host ""
    $currentLaunch =''',
    'configuration command editor',
)

sub(
    r'    \$updated = \[pscustomobject\]@\{\n        configVersion\s+= 3\n        repoPath\s+= \$repoPath\n        interval\s+= \$intervalInfo\.Display\n        runNpmBuild\s+= \$runNpmBuild\n        postPullCommand = \$postPullCommand\n        launchPath\s+= \$launchPath\n    \}',
    r'''    $updated = [pscustomobject]@{
        configVersion  = 4
        repoPath       = $repoPath
        interval       = $intervalInfo.Display
        runNpmBuild    = $runNpmBuild
        customCommands = @($customCommands)
        launchPath     = $launchPath
    }''',
    'updated config object',
)

sub(
    r'    Write-Host \("  Command : \{0\}" -f \$\(if \(\[string\]::IsNullOrWhiteSpace\(\$postPullCommand\)\) \{ "off" \} else \{ \$postPullCommand \}\)\)',
    r'''    if ($customCommands.Count -eq 0) {
        Write-Host "  Commands : none"
    }
    else {
        Write-Host "  Commands : $($customCommands.Count)"
        for ($i = 0; $i -lt $customCommands.Count; $i++) { Write-Host ("             {0}. {1}" -f ($i + 1), $customCommands[$i]) }
    }''',
    'saved config summary',
    flags=0,
)

sub(
    r'function Invoke-CustomCommand \{.*?\n\}\n\nfunction Invoke-LaunchFile',
    r'''function Invoke-CustomCommand {
    param([string]$RepoPath, [string]$Command)

    # Commands intentionally run with the watched repository as CWD. For example,
    # `npm run build` behaves exactly as if typed into a terminal opened in the repo.
    $commandProcessor = if (-not [string]::IsNullOrWhiteSpace($env:ComSpec)) { $env:ComSpec } else { "cmd.exe" }
    $oldPreference = $ErrorActionPreference
    Push-Location $RepoPath
    try {
        $ErrorActionPreference = "Continue"
        $raw = @(& $commandProcessor /d /s /c $Command 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $oldPreference; Pop-Location }
    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $detail = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { "" }
    return [pscustomobject]@{
        Success = ($exitCode -eq 0)
        ExitCode = $exitCode
        Summary = $(if ($exitCode -eq 0) { "Custom command finished" } else { "Custom command failed" })
        Detail = $detail
    }
}

function Invoke-LaunchFile''',
    'custom command runner',
)

sub(
    r'function Get-ActionLabel \{.*?\n\}\n\nfunction Render-Dashboard',
    r'''function Get-ActionLabel {
    param($Config)
    $parts = @()
    if ([bool]$Config.runNpmBuild) { $parts += "build" }
    $commandCount = @($Config.customCommands).Count
    if ($commandCount -eq 1) { $parts += "1 command" }
    elseif ($commandCount -gt 1) { $parts += "$commandCount commands" }
    if (-not [string]::IsNullOrWhiteSpace([string]$Config.launchPath)) { $parts += "launch" }
    if ($parts.Count -eq 0) { return "none" }; return ($parts -join " -> ")
}

function Render-Dashboard''',
    'action label',
)

sub(
    r'                                if \(\$postSuccess -and -not \[string\]::IsNullOrWhiteSpace\(\[string\]\$config\.postPullCommand\)\) \{.*?\n                                \}\n                                if \(\$postSuccess -and -not \[string\]::IsNullOrWhiteSpace\(\[string\]\$config\.launchPath\)\) \{',
    r'''                                $commands = @($config.customCommands)
                                for ($commandIndex = 0; $postSuccess -and $commandIndex -lt $commands.Count; $commandIndex++) {
                                    $command = [string]$commands[$commandIndex]
                                    $displayNumber = $commandIndex + 1
                                    Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                                        -HeadHash $afterHash -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                        -Status "Running command $displayNumber/$($commands.Count)..." -StatusKind "working" -Detail $command `
                                        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory
                                    $commandResult = Invoke-CustomCommand -RepoPath $repoPath -Command $command
                                    if ($commandResult.Success) { $actionParts += "command $displayNumber OK" }
                                    else {
                                        $postSuccess = $false
                                        $postFailure = "Command $displayNumber failed (exit $($commandResult.ExitCode)): $command"
                                        if (-not [string]::IsNullOrWhiteSpace($commandResult.Detail)) { $postFailure += " - $($commandResult.Detail)" }
                                        $actionParts += "command $displayNumber FAILED"
                                    }
                                }
                                if ($postSuccess -and -not [string]::IsNullOrWhiteSpace([string]$config.launchPath)) {''',
    'ordered command execution',
)

# Safety: there should be no active v3 command field references left except migration.
active_refs = [line for line in text.splitlines() if 'postPullCommand' in line and 'Config.postPullCommand' not in line]
if active_refs:
    raise SystemExit('unexpected postPullCommand refs remain: ' + repr(active_refs))

if text == original:
    raise SystemExit('no changes produced')

path.write_text(text, encoding='utf-8')
print('Repo AutoPull v4 transformation complete')
