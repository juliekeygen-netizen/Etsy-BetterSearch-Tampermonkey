param(
    [switch]$Configure,
    [switch]$StartDirect,
    [switch]$TestNotification
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "Repo AutoPull" } catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigRoot = if (-not [string]::IsNullOrWhiteSpace($env:REPO_AUTOPULL_CONFIG_ROOT)) {
    $env:REPO_AUTOPULL_CONFIG_ROOT
} else {
    $ScriptDir
}
if (-not (Test-Path -LiteralPath $ConfigRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $ConfigRoot -Force | Out-Null
}

$ConfigPath = Join-Path $ConfigRoot "Repo-AutoPull.config.json"
$LegacyConfigCandidates = @(
    (Join-Path $ScriptDir "BetterSearch-AutoPull.config.json"),
    (Join-Path (Split-Path -Parent $ScriptDir) "BetterSearch_AutoPull_Notify\BetterSearch-AutoPull.config.json")
)
$ImportConfigPath = [string]$env:REPO_AUTOPULL_IMPORT_CONFIG
$script:GitExe = $null

function Show-DesktopNotification {
    param([string]$Title, [string]$Message)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.Visible = $true
        $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $notify.BalloonTipTitle = $Title
        $notify.BalloonTipText = $Message
        [System.Media.SystemSounds]::Asterisk.Play()
        $notify.ShowBalloonTip(6000)
        Start-Sleep -Seconds 5
        $notify.Dispose()
    }
    catch { try { [System.Media.SystemSounds]::Asterisk.Play() } catch {} }
}

function Normalize-EnteredPath {
    param([string]$PathText)
    if ($null -eq $PathText) { return "" }
    return $PathText.Trim().Trim('"').Trim("'")
}

function Format-IntervalDisplay {
    param([int]$Amount, [string]$Unit)
    switch ($Unit) {
        "seconds" { $name = if ($Amount -eq 1) { "second" } else { "seconds" } }
        "minutes" { $name = if ($Amount -eq 1) { "minute" } else { "minutes" } }
        "hours"   { $name = if ($Amount -eq 1) { "hour" } else { "hours" } }
        default   { throw "Unsupported interval unit '$Unit'." }
    }
    return "$Amount $name"
}

function Parse-Interval {
    param([string]$Value)
    $text = if ($null -eq $Value) { "" } else { $Value.Trim() }
    if ([string]::IsNullOrWhiteSpace($text)) { throw "Interval cannot be empty." }
    if ($text -notmatch '^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?$') {
        throw "Invalid interval '$Value'. Examples: 30, 30 sec, 2 min, 1 hour."
    }

    $amount = [int]$Matches[1]
    if ($amount -lt 1) { throw "Interval must be at least 1 second." }
    $unitToken = [string]$Matches[2]
    if ([string]::IsNullOrWhiteSpace($unitToken)) { $unitToken = "s" }
    $unitToken = $unitToken.ToLowerInvariant()

    if ($unitToken -in @("s", "sec", "secs", "second", "seconds")) {
        $seconds = $amount; $displayUnit = "seconds"
    }
    elseif ($unitToken -in @("m", "min", "mins", "minute", "minutes")) {
        $seconds = $amount * 60; $displayUnit = "minutes"
    }
    elseif ($unitToken -in @("h", "hr", "hrs", "hour", "hours")) {
        $seconds = $amount * 3600; $displayUnit = "hours"
    }
    else { throw "Unsupported interval unit '$unitToken'." }

    return [pscustomobject]@{
        Seconds = [int]$seconds
        Display = (Format-IntervalDisplay -Amount $amount -Unit $displayUnit)
    }
}

function New-DefaultConfiguration {
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

function Read-ConfigurationFile {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
    catch { return $null }
}

function Save-Configuration {
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

function Import-LegacyConfigurationIfNeeded {
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) { return }
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($ImportConfigPath)) { $candidates += $ImportConfigPath }
    $candidates += $LegacyConfigCandidates
    foreach ($candidate in $candidates) {
        $legacy = Read-ConfigurationFile -Path $candidate
        if ($null -eq $legacy) { continue }
        Save-Configuration -Config (Normalize-Configuration $legacy)
        if ($LegacyConfigCandidates -contains $candidate) {
            try { (Get-Item -LiteralPath $candidate).Attributes = (Get-Item -LiteralPath $candidate).Attributes -bor [IO.FileAttributes]::Hidden } catch {}
        }
        return
    }
}

function Read-Configuration {
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

function Find-Git {
    try { return (Get-Command git -ErrorAction Stop).Source }
    catch { throw "Git was not found on PATH. Repo AutoPull uses your normal Git installation." }
}

function Invoke-Git {
    param([string]$RepoPath, [string[]]$GitArgs)
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $raw = @(& $script:GitExe -C $RepoPath @GitArgs 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $oldPreference }
    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } })
    return [pscustomobject]@{ ExitCode = $exitCode; Lines = $lines }
}

function Get-NonEmptyLines { param($Result); return @($Result.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
function Get-FirstLine {
    param($Result); $lines = @(Get-NonEmptyLines $Result)
    if ($lines.Count -eq 0) { return "" }; return $lines[0]
}
function Get-LastLine {
    param($Result); $lines = @(Get-NonEmptyLines $Result)
    if ($lines.Count -eq 0) { return "" }; return $lines[$lines.Count - 1]
}
function Short-Hash {
    param([string]$Hash)
    if ([string]::IsNullOrWhiteSpace($Hash)) { return "unknown" }
    if ($Hash.Length -le 7) { return $Hash }; return $Hash.Substring(0, 7)
}
function Get-HeadHash {
    param([string]$RepoPath)
    $r = Invoke-Git -RepoPath $RepoPath -GitArgs @("rev-parse", "HEAD")
    if ($r.ExitCode -ne 0) { return $null }; return (Get-FirstLine $r).Trim().ToLowerInvariant()
}
function Get-CommitSubject {
    param([string]$RepoPath, [string]$Hash)
    if ([string]::IsNullOrWhiteSpace($Hash)) { return "" }
    $r = Invoke-Git -RepoPath $RepoPath -GitArgs @("show", "-s", "--format=%s", $Hash)
    if ($r.ExitCode -ne 0) { return "" }; return (Get-FirstLine $r).Trim()
}

function Get-UpstreamInfo {
    param([string]$RepoPath)
    $branchResult = Invoke-Git -RepoPath $RepoPath -GitArgs @("branch", "--show-current")
    if ($branchResult.ExitCode -ne 0) { throw "Could not determine the current Git branch." }
    $localBranch = (Get-FirstLine $branchResult).Trim()
    if ([string]::IsNullOrWhiteSpace($localBranch)) { throw "Detached HEAD detected. Auto-pull is disabled." }

    $trackingResult = Invoke-Git -RepoPath $RepoPath -GitArgs @("rev-parse", "--abbrev-ref", "--symbolic-full-name", '@{u}')
    $trackingConfigured = $false; $upstream = ""
    if ($trackingResult.ExitCode -eq 0) {
        $upstream = (Get-FirstLine $trackingResult).Trim()
        $trackingConfigured = -not [string]::IsNullOrWhiteSpace($upstream)
    }
    if (-not $trackingConfigured) { $upstream = "origin/$localBranch" }
    $slash = $upstream.IndexOf("/")
    if ($slash -lt 1 -or $slash -ge ($upstream.Length - 1)) { throw "Could not understand upstream '$upstream'." }
    return [pscustomobject]@{
        LocalBranch = $localBranch
        Upstream = $upstream
        Remote = $upstream.Substring(0, $slash)
        RemoteBranch = $upstream.Substring($slash + 1)
        TrackingConfigured = $trackingConfigured
    }
}

function Test-IsAncestor {
    param([string]$RepoPath, [string]$Older, [string]$Newer)
    $r = Invoke-Git -RepoPath $RepoPath -GitArgs @("merge-base", "--is-ancestor", $Older, $Newer)
    return ($r.ExitCode -eq 0)
}
function Get-UnmergedFiles {
    param([string]$RepoPath)
    $r = Invoke-Git -RepoPath $RepoPath -GitArgs @("diff", "--name-only", "--diff-filter=U")
    if ($r.ExitCode -ne 0) { return @() }; return @(Get-NonEmptyLines $r)
}

function Prompt-YesNoSetting {
    param([string]$Question, [bool]$Current, [bool]$HasCurrent = $true)
    $hint = if ($HasCurrent) {
        "current: $(if ($Current) { 'ON' } else { 'OFF' }); Enter = keep"
    } else {
        "default: $(if ($Current) { 'YES' } else { 'NO' }); Enter = default"
    }
    while ($true) {
        $answer = (Read-Host "$Question [Y/N] ($hint)").Trim()
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Current }
        if ($answer -match '^[Yy]') { return $true }
        if ($answer -match '^[Nn]') { return $false }
        Write-Host "Type Y, N, or press Enter." -ForegroundColor Yellow
    }
}

function Select-RepositoryFolder {
    param([string]$InitialPath)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Choose the local Git repository Repo AutoPull should watch"
        $dialog.ShowNewFolderButton = $false
        if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and (Test-Path -LiteralPath $InitialPath -PathType Container)) { $dialog.SelectedPath = $InitialPath }
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
    }
    catch {}
    return ""
}

function Select-LaunchFile {
    param([string]$InitialPath)
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = "Choose a file/app/script to open or run after a successful pull"
        $dialog.Filter = "All files (*.*)|*.*"
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and (Test-Path -LiteralPath $InitialPath -PathType Leaf)) {
            $dialog.InitialDirectory = Split-Path -Parent $InitialPath
            $dialog.FileName = Split-Path -Leaf $InitialPath
        }
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    }
    catch {}
    return ""
}

function Test-GitRepository {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
    $probe = Invoke-Git -RepoPath $Path -GitArgs @("rev-parse", "--is-inside-work-tree")
    return ($probe.ExitCode -eq 0 -and (Get-FirstLine $probe).Trim() -eq "true")
}

function Choose-NewRepository {
    param([string]$InitialPath)
    while ($true) {
        $selected = Select-RepositoryFolder -InitialPath $InitialPath
        if (Test-GitRepository $selected) { return $selected }
        if (-not [string]::IsNullOrWhiteSpace($selected)) { Write-Host "That folder is not a Git repository." -ForegroundColor Red }
        $typed = Normalize-EnteredPath (Read-Host "Paste a repository path, or press Enter to browse again")
        if (Test-GitRepository $typed) { return $typed }
        if (-not [string]::IsNullOrWhiteSpace($typed)) { Write-Host "That folder is not a Git repository." -ForegroundColor Red }
    }
}

function Read-CommandIndex {
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

function Run-Configuration {
    param([bool]$FirstRun = $false)
    $current = Read-Configuration
    if ($null -eq $current) { $current = New-DefaultConfiguration }
    $hasExisting = -not [string]::IsNullOrWhiteSpace([string]$current.repoPath)

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Enter at any existing setting to keep it unchanged." -ForegroundColor DarkGray

    if ($hasExisting -and (Test-GitRepository ([string]$current.repoPath))) {
        Write-Host ""; Write-Host "Repository:" -ForegroundColor Cyan; Write-Host "  $($current.repoPath)"
        $changeRepo = Prompt-YesNoSetting -Question "Change repository?" -Current $false -HasCurrent $true
        $repoPath = if ($changeRepo) { Choose-NewRepository -InitialPath ([string]$current.repoPath) } else { [string]$current.repoPath }
    } else {
        Write-Host ""; Write-Host "Choose the repository to watch." -ForegroundColor Cyan
        $repoPath = Choose-NewRepository -InitialPath ([string]$current.repoPath)
    }

    $currentInterval = Parse-Interval ([string]$current.interval)
    while ($true) {
        Write-Host ""
        $intervalInput = (Read-Host "Check interval [$($currentInterval.Display)] (Enter = keep)").Trim()
        if ([string]::IsNullOrWhiteSpace($intervalInput)) { $intervalInfo = $currentInterval; break }
        try { $intervalInfo = Parse-Interval $intervalInput; break }
        catch { Write-Host $_.Exception.Message -ForegroundColor Red }
    }

    Write-Host ""
    $runNpmBuild = Prompt-YesNoSetting -Question "Run 'npm run build' after each successful pull?" -Current ([bool]$current.runNpmBuild) -HasCurrent $hasExisting

    $customCommands = @(Manage-CustomCommands -CurrentCommands @($current.customCommands))

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - Configure"
    Write-Host "========================================================" -ForegroundColor Cyan

    Write-Host ""
    $currentLaunch = [string]$current.launchPath
    $currentLaunchEnabled = -not [string]::IsNullOrWhiteSpace($currentLaunch)
    $launchEnabled = Prompt-YesNoSetting -Question "Open/run a selected file after commands finish?" -Current $currentLaunchEnabled -HasCurrent $hasExisting
    $launchPath = ""
    if ($launchEnabled) {
        $launchPath = $currentLaunch
        if ($currentLaunchEnabled -and (Test-Path -LiteralPath $currentLaunch -PathType Leaf)) {
            Write-Host "Current file:" -ForegroundColor Cyan; Write-Host "  $currentLaunch"
            $changeFile = Prompt-YesNoSetting -Question "Change selected file?" -Current $false -HasCurrent $true
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

    Write-Host ""
    Write-Host "Saved configuration." -ForegroundColor Green
    Write-Host "  Repo    : $repoPath"
    Write-Host "  Interval: $($intervalInfo.Display)"
    Write-Host ("  Build   : {0}" -f $(if ($runNpmBuild) { "npm run build" } else { "off" }))
    if ($customCommands.Count -eq 0) {
        Write-Host "  Commands : none"
    }
    else {
        Write-Host "  Commands : $($customCommands.Count)"
        for ($i = 0; $i -lt $customCommands.Count; $i++) { Write-Host ("             {0}. {1}" -f ($i + 1), $customCommands[$i]) }
    }
    Write-Host ("  Launch  : {0}" -f $(if ([string]::IsNullOrWhiteSpace($launchPath)) { "off" } else { $launchPath }))
    if (-not $FirstRun) { Write-Host ""; Read-Host "Press Enter to return to the menu" | Out-Null }
    return Read-Configuration
}

function Invoke-NpmBuild {
    param([string]$RepoPath)
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if ($null -eq $npm) { return [pscustomobject]@{ Success = $false; Summary = "npm run build failed"; Detail = "npm was not found on PATH." } }
    $oldPreference = $ErrorActionPreference; Push-Location $RepoPath
    try { $ErrorActionPreference = "Continue"; $raw = @(& $npm.Source run build 2>&1); $exitCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference; Pop-Location }
    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $detail = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { "" }
    return [pscustomobject]@{ Success = ($exitCode -eq 0); Summary = $(if ($exitCode -eq 0) { "Build finished" } else { "npm run build failed" }); Detail = $detail }
}

function Invoke-CustomCommand {
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

function Invoke-LaunchFile {
    param([string]$RepoPath, [string]$LaunchPath)
    if (-not (Test-Path -LiteralPath $LaunchPath -PathType Leaf)) { return [pscustomobject]@{ Success = $false; Summary = "Launch failed"; Detail = "File no longer exists: $LaunchPath" } }
    try {
        Start-Process -FilePath $LaunchPath -WorkingDirectory $RepoPath | Out-Null
        return [pscustomobject]@{ Success = $true; Summary = "Selected file opened"; Detail = Split-Path -Leaf $LaunchPath }
    }
    catch { return [pscustomobject]@{ Success = $false; Summary = "Launch failed"; Detail = $_.Exception.Message } }
}

function Get-ActionLabel {
    param($Config)
    $parts = @()
    if ([bool]$Config.runNpmBuild) { $parts += "build" }
    $commandCount = @($Config.customCommands).Count
    if ($commandCount -eq 1) { $parts += "1 command" }
    elseif ($commandCount -gt 1) { $parts += "$commandCount commands" }
    if (-not [string]::IsNullOrWhiteSpace([string]$Config.launchPath)) { $parts += "launch" }
    if ($parts.Count -eq 0) { return "none" }; return ($parts -join " -> ")
}

function Render-Dashboard {
    param(
        [string]$RepoPath, $IntervalInfo, $UpstreamInfo, $Config,
        [string]$HeadHash, [string]$HeadSubject, [string]$Status,
        [string]$StatusKind, [string]$Detail,
        [Nullable[datetime]]$LastCheck, [Nullable[datetime]]$NextCheck,
        [object[]]$PullHistory
    )
    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Repo   : $RepoPath"
    Write-Host ("Branch : {0} -> {1}   |   every {2}" -f $UpstreamInfo.LocalBranch, $UpstreamInfo.Upstream, $IntervalInfo.Display)
    Write-Host ("HEAD   : {0}  {1}" -f (Short-Hash $HeadHash), $HeadSubject)
    Write-Host ("After  : {0}" -f (Get-ActionLabel $Config))
    Write-Host ""
    $statusColor = switch ($StatusKind) {
        "ok" { "Green" }; "updated" { "Green" }; "checking" { "Cyan" }; "working" { "Cyan" }
        "warning" { "Yellow" }; "error" { "Red" }; default { "Gray" }
    }
    Write-Host "Status : $Status" -ForegroundColor $statusColor
    if (-not [string]::IsNullOrWhiteSpace($Detail)) { Write-Host "         $Detail" -ForegroundColor DarkGray }
    $lastText = if ($LastCheck.HasValue) { $LastCheck.Value.ToString("HH:mm:ss") } else { "not yet" }
    $nextText = if ($NextCheck.HasValue) { $NextCheck.Value.ToString("HH:mm:ss") } else { "checking now" }
    Write-Host ("Last   : {0}   |   Next: {1}" -f $lastText, $nextText)
    Write-Host ""; Write-Host "Recent pulls:" -ForegroundColor Cyan
    if ($null -eq $PullHistory -or $PullHistory.Count -eq 0) { Write-Host "  none yet" -ForegroundColor DarkGray }
    else {
        foreach ($entry in $PullHistory) {
            $suffix = if ($entry.CommitCount -eq 1) { "" } else { "s" }
            Write-Host ("  {0}  {1} -> {2}  ({3} commit{4})" -f $entry.Time, $entry.Before, $entry.After, $entry.CommitCount, $suffix) -ForegroundColor Green
            foreach ($commit in $entry.Commits) { Write-Host ("           {0}" -f ($commit -replace "`t", "  ")) -ForegroundColor DarkGray }
            if (-not [string]::IsNullOrWhiteSpace([string]$entry.Actions)) { Write-Host ("           actions: {0}" -f $entry.Actions) -ForegroundColor DarkGray }
        }
    }
    Write-Host ""; Write-Host "Close this window or press Ctrl+C to stop." -ForegroundColor DarkGray
}

function Get-MonitorMutex {
    param([string]$RepoPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $bytes = [Text.Encoding]::UTF8.GetBytes($RepoPath.ToLowerInvariant()); $hash = $sha.ComputeHash($bytes) }
    finally { $sha.Dispose() }
    $id = -join ($hash[0..7] | ForEach-Object { $_.ToString("x2") })
    $mutex = New-Object System.Threading.Mutex($false, "RepoAutoPull_$id")
    if (-not $mutex.WaitOne(0, $false)) { $mutex.Dispose(); return $null }
    return $mutex
}

function Start-Monitor {
    param($Config)
    $config = Normalize-Configuration $Config
    $repoPath = [string]$config.repoPath
    if (-not (Test-GitRepository $repoPath)) {
        Write-Host "Configured repository is missing or invalid:" -ForegroundColor Red; Write-Host "  $repoPath"; Write-Host ""
        Read-Host "Press Enter to return to the menu" | Out-Null; return
    }
    $intervalInfo = Parse-Interval ([string]$config.interval)
    try { $upstreamInfo = Get-UpstreamInfo -RepoPath $repoPath }
    catch { Write-Host $_.Exception.Message -ForegroundColor Red; Read-Host "Press Enter to return to the menu" | Out-Null; return }
    $mutex = Get-MonitorMutex -RepoPath $repoPath
    if ($null -eq $mutex) {
        Write-Host "Repo AutoPull is already running for this repository." -ForegroundColor Yellow; Write-Host ""
        Read-Host "Press Enter to return to the menu" | Out-Null; return
    }

    $repoName = Split-Path -Leaf $repoPath
    $pullHistory = @(); $lastCheck = $null
    try {
        while ($true) {
            $beforeHash = Get-HeadHash -RepoPath $repoPath
            $beforeSubject = Get-CommitSubject -RepoPath $repoPath -Hash $beforeHash
            Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                -HeadHash $beforeHash -HeadSubject $beforeSubject -Status "Checking remote..." -StatusKind "checking" -Detail "" `
                -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory

            $fetchResult = Invoke-Git -RepoPath $repoPath -GitArgs @("fetch", "--quiet", $upstreamInfo.Remote)
            if ($fetchResult.ExitCode -ne 0) {
                $status = "Fetch failed"; $statusKind = "error"; $detail = Get-LastLine $fetchResult
            }
            else {
                $remoteResult = Invoke-Git -RepoPath $repoPath -GitArgs @("rev-parse", $upstreamInfo.Upstream)
                if ($remoteResult.ExitCode -ne 0) {
                    $status = "Remote branch not found"; $statusKind = "error"; $detail = Get-LastLine $remoteResult
                }
                else {
                    $remoteHash = (Get-FirstLine $remoteResult).Trim().ToLowerInvariant()
                    $localHash = Get-HeadHash -RepoPath $repoPath
                    if ($localHash -eq $remoteHash) {
                        $status = "Up to date"; $statusKind = "ok"; $detail = ""
                    }
                    elseif (Test-IsAncestor -RepoPath $repoPath -Older $localHash -Newer $remoteHash) {
                        $countResult = Invoke-Git -RepoPath $repoPath -GitArgs @("rev-list", "--count", "$localHash..$remoteHash")
                        $availableCount = if ($countResult.ExitCode -eq 0) { [int](Get-FirstLine $countResult) } else { 1 }
                        $pullArgs = if ($upstreamInfo.TrackingConfigured) {
                            @("pull", "--ff-only", "--autostash", "--quiet")
                        } else {
                            @("pull", "--ff-only", "--autostash", "--quiet", $upstreamInfo.Remote, $upstreamInfo.RemoteBranch)
                        }
                        $pullResult = Invoke-Git -RepoPath $repoPath -GitArgs $pullArgs
                        $afterHash = Get-HeadHash -RepoPath $repoPath

                        if ($afterHash -and $afterHash -ne $localHash) {
                            $logResult = Invoke-Git -RepoPath $repoPath -GitArgs @("log", "--reverse", "--format=%h%x09%s", "$localHash..$afterHash")
                            $commits = @($logResult.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
                            $commitCount = $commits.Count
                            if ($commitCount -eq 0) { $commitCount = $availableCount }; if ($commitCount -eq 0) { $commitCount = 1 }
                            $unmerged = @(Get-UnmergedFiles -RepoPath $repoPath)

                            if ($pullResult.ExitCode -ne 0 -or $unmerged.Count -gt 0) {
                                $actionSummary = "post-pull actions skipped"
                                $status = "Updated, local changes need attention"; $statusKind = "warning"
                                $detail = if ($unmerged.Count -gt 0) { "Autostash reapply conflicted: $($unmerged -join ', ')" } else { Get-LastLine $pullResult }
                                Show-DesktopNotification -Title "$repoName updated - attention needed" -Message "Pulled $commitCount commit(s), but local changes need attention."
                            }
                            else {
                                $actionParts = @(); $postSuccess = $true; $postFailure = ""
                                if ([bool]$config.runNpmBuild) {
                                    Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                                        -HeadHash $afterHash -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                        -Status "Running npm run build..." -StatusKind "working" -Detail "Pulled $commitCount commit(s)." `
                                        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory
                                    $buildResult = Invoke-NpmBuild -RepoPath $repoPath
                                    if ($buildResult.Success) { $actionParts += "build OK" }
                                    else { $postSuccess = $false; $postFailure = "$($buildResult.Summary): $($buildResult.Detail)"; $actionParts += "build FAILED" }
                                }
                                $commands = @($config.customCommands)
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
                                if ($postSuccess -and -not [string]::IsNullOrWhiteSpace([string]$config.launchPath)) {
                                    $launchResult = Invoke-LaunchFile -RepoPath $repoPath -LaunchPath ([string]$config.launchPath)
                                    if ($launchResult.Success) { $actionParts += "launched $($launchResult.Detail)" }
                                    else { $postSuccess = $false; $postFailure = "$($launchResult.Summary): $($launchResult.Detail)"; $actionParts += "launch FAILED" }
                                }
                                $actionSummary = if ($actionParts.Count -eq 0) { "no post-pull actions" } else { $actionParts -join "; " }
                                $latestSubject = Get-CommitSubject -RepoPath $repoPath -Hash $afterHash
                                $pullText = if ($commitCount -eq 1) { "Pulled $(Short-Hash $afterHash) - $latestSubject" } else { "Pulled $commitCount commits. Latest: $(Short-Hash $afterHash) - $latestSubject" }
                                if ($postSuccess) {
                                    $status = if ($actionParts.Count -gt 0) { "Updated + actions finished" } else { "Updated" }
                                    $statusKind = "updated"; $detail = "$pullText. $actionSummary."
                                    Show-DesktopNotification -Title "$repoName updated" -Message $detail
                                } else {
                                    $status = "Updated, post-pull action failed"; $statusKind = "error"; $detail = "$pullText. $postFailure"
                                    Show-DesktopNotification -Title "$repoName updated - action failed" -Message $detail
                                }
                            }

                            $entry = [pscustomobject]@{
                                Time = (Get-Date).ToString("HH:mm:ss"); Before = Short-Hash $localHash; After = Short-Hash $afterHash
                                CommitCount = $commitCount; Commits = $commits; Actions = $actionSummary
                            }
                            $pullHistory = @($entry) + @($pullHistory)
                            if ($pullHistory.Count -gt 6) { $pullHistory = @($pullHistory | Select-Object -First 6) }
                        }
                        elseif ($pullResult.ExitCode -ne 0) { $status = "Pull failed"; $statusKind = "error"; $detail = Get-LastLine $pullResult }
                        else { $status = "Up to date"; $statusKind = "ok"; $detail = "" }
                    }
                    elseif (Test-IsAncestor -RepoPath $repoPath -Older $remoteHash -Newer $localHash) {
                        $status = "Local branch is ahead"; $statusKind = "warning"
                        $detail = "Nothing was pulled because the local branch has commits not on $($upstreamInfo.Upstream)."
                    }
                    else {
                        $status = "Local and remote diverged"; $statusKind = "warning"
                        $detail = "Auto-pull stopped for safety. Resolve the Git history manually."
                    }
                }
            }

            $lastCheck = Get-Date; $nextCheck = $lastCheck.AddSeconds($intervalInfo.Seconds)
            $headHash = Get-HeadHash -RepoPath $repoPath; $headSubject = Get-CommitSubject -RepoPath $repoPath -Hash $headHash
            Render-Dashboard -RepoPath $repoPath -IntervalInfo $intervalInfo -UpstreamInfo $upstreamInfo -Config $config `
                -HeadHash $headHash -HeadSubject $headSubject -Status $status -StatusKind $statusKind -Detail $detail `
                -LastCheck $lastCheck -NextCheck $nextCheck -PullHistory $pullHistory
            Start-Sleep -Seconds $intervalInfo.Seconds
        }
    }
    finally { try { $mutex.ReleaseMutex() | Out-Null } catch {}; $mutex.Dispose() }
}

function Show-MainMenu {
    while ($true) {
        $config = Read-Configuration
        if ($null -eq $config -or [string]::IsNullOrWhiteSpace([string]$config.repoPath)) {
            Clear-Host
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host " Repo AutoPull"
            Write-Host "========================================================" -ForegroundColor Cyan
            Write-Host ""; Write-Host "No configuration found. Starting first-time setup..." -ForegroundColor Yellow
            Start-Sleep -Milliseconds 500
            $config = Run-Configuration -FirstRun $true
            Start-Monitor -Config $config
            continue
        }

        Clear-Host
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host " Repo AutoPull"
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host ""; Write-Host "1. Start"; Write-Host "2. Configure"; Write-Host ""
        $choice = (Read-Host "Choose [1]").Trim()
        if ([string]::IsNullOrWhiteSpace($choice) -or $choice -eq "1") { Start-Monitor -Config $config }
        elseif ($choice -eq "2") { Run-Configuration | Out-Null }
    }
}

$script:GitExe = Find-Git
Import-LegacyConfigurationIfNeeded

if ($TestNotification) { Show-DesktopNotification -Title "Repo AutoPull" -Message "Test notification: everything is working."; exit 0 }
if ($Configure) { Run-Configuration | Out-Null; exit 0 }
if ($StartDirect) {
    $config = Read-Configuration
    if ($null -eq $config -or [string]::IsNullOrWhiteSpace([string]$config.repoPath)) { $config = Run-Configuration -FirstRun $true }
    Start-Monitor -Config $config
    exit 0
}

Show-MainMenu
