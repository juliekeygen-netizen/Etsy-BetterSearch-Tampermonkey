param(
    [switch]$Setup,
    [switch]$TestNotification
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "Repo AutoPull" } catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "BetterSearch-AutoPull.config.json"
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
    catch {
        try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}
    }
}

function Normalize-EnteredPath {
    param([string]$PathText)
    if ($null -eq $PathText) { return "" }
    return $PathText.Trim().Trim('"').Trim("'")
}

function Read-Configuration {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return $null }
    try { return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json }
    catch { return $null }
}

function Save-Configuration {
    param(
        [string]$RepoPath,
        [string]$Interval,
        [bool]$RunNpmBuild,
        [string]$PostPullCommand,
        [string]$LaunchPath
    )

    [pscustomobject]@{
        configVersion   = 2
        repoPath        = $RepoPath
        interval        = $Interval
        runNpmBuild     = $RunNpmBuild
        postPullCommand = $PostPullCommand
        launchPath      = $LaunchPath
    } | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Convert-IntervalToSeconds {
    param([string]$Interval)

    $value = if ($null -eq $Interval) { "" } else { $Interval.Trim() }
    if ($value -match "^\d+$") { return [Math]::Max(1, [int]$value) }

    if ($value -match "^(\d+)\s*(ms|s|m|h|d|w)$") {
        $amount = [int]$Matches[1]
        switch ($Matches[2]) {
            "ms" { return [Math]::Max(1, [int][Math]::Ceiling($amount / 1000.0)) }
            "s"  { return [Math]::Max(1, $amount) }
            "m"  { return [Math]::Max(1, $amount * 60) }
            "h"  { return [Math]::Max(1, $amount * 3600) }
            "d"  { return [Math]::Max(1, $amount * 86400) }
            "w"  { return [Math]::Max(1, $amount * 604800) }
        }
    }

    throw "Unsupported interval '$Interval'. Use 30, 30s, 1m, etc."
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
    finally {
        $ErrorActionPreference = $oldPreference
    }

    $lines = @($raw | ForEach-Object {
        if ($null -ne $_) { $_.ToString() }
    })

    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines = $lines
    }
}

function Get-NonEmptyLines {
    param($Result)
    return @($Result.Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-FirstLine {
    param($Result)
    $lines = @(Get-NonEmptyLines $Result)
    if ($lines.Count -eq 0) { return "" }
    return $lines[0]
}

function Get-LastLine {
    param($Result)
    $lines = @(Get-NonEmptyLines $Result)
    if ($lines.Count -eq 0) { return "" }
    return $lines[$lines.Count - 1]
}

function Short-Hash {
    param([string]$Hash)
    if ([string]::IsNullOrWhiteSpace($Hash)) { return "unknown" }
    if ($Hash.Length -le 7) { return $Hash }
    return $Hash.Substring(0, 7)
}

function Get-HeadHash {
    param([string]$RepoPath)
    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @("rev-parse", "HEAD")
    if ($result.ExitCode -ne 0) { return $null }
    return (Get-FirstLine $result).Trim().ToLowerInvariant()
}

function Get-CommitSubject {
    param([string]$RepoPath, [string]$Hash)
    if ([string]::IsNullOrWhiteSpace($Hash)) { return "" }

    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @("show", "-s", "--format=%s", $Hash)
    if ($result.ExitCode -ne 0) { return "" }
    return (Get-FirstLine $result).Trim()
}

function Get-UpstreamInfo {
    param([string]$RepoPath)

    $branchResult = Invoke-Git -RepoPath $RepoPath -GitArgs @("branch", "--show-current")
    if ($branchResult.ExitCode -ne 0) { throw "Could not determine the current Git branch." }

    $localBranch = (Get-FirstLine $branchResult).Trim()
    if ([string]::IsNullOrWhiteSpace($localBranch)) {
        throw "Detached HEAD detected. Auto-pull is disabled."
    }

    $trackingResult = Invoke-Git -RepoPath $RepoPath -GitArgs @(
        "rev-parse", "--abbrev-ref", "--symbolic-full-name", '@{u}'
    )

    $trackingConfigured = $false
    $upstream = ""
    if ($trackingResult.ExitCode -eq 0) {
        $upstream = (Get-FirstLine $trackingResult).Trim()
        $trackingConfigured = -not [string]::IsNullOrWhiteSpace($upstream)
    }

    if (-not $trackingConfigured) {
        $upstream = "origin/$localBranch"
    }

    $slash = $upstream.IndexOf("/")
    if ($slash -lt 1 -or $slash -ge ($upstream.Length - 1)) {
        throw "Could not understand upstream '$upstream'."
    }

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
    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @(
        "merge-base", "--is-ancestor", $Older, $Newer
    )
    return ($result.ExitCode -eq 0)
}

function Get-TrackedLocalChangeCount {
    param([string]$RepoPath)

    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @(
        "status", "--porcelain", "--untracked-files=no"
    )
    if ($result.ExitCode -ne 0) { return 0 }
    return @(Get-NonEmptyLines $result).Count
}

function Get-UnmergedFiles {
    param([string]$RepoPath)

    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @(
        "diff", "--name-only", "--diff-filter=U"
    )
    if ($result.ExitCode -ne 0) { return @() }
    return @(Get-NonEmptyLines $result)
}

function Prompt-YesNo {
    param(
        [string]$Question,
        [bool]$Default = $false
    )

    $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
    while ($true) {
        $answer = (Read-Host "$Question $suffix").Trim()
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
        if ($answer -match "^[Yy]") { return $true }
        if ($answer -match "^[Nn]") { return $false }
    }
}

function Select-RepositoryFolder {
    param([string]$InitialPath)

    try {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Choose the local Git repository Repo AutoPull should watch"
        $dialog.ShowNewFolderButton = $false
        if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and
            (Test-Path -LiteralPath $InitialPath -PathType Container)) {
            $dialog.SelectedPath = $InitialPath
        }

        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            return $dialog.SelectedPath
        }
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

        if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and
            (Test-Path -LiteralPath $InitialPath -PathType Leaf)) {
            $dialog.InitialDirectory = Split-Path -Parent $InitialPath
            $dialog.FileName = Split-Path -Leaf $InitialPath
        }

        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            return $dialog.FileName
        }
    }
    catch {}

    return ""
}

function Choose-Repository {
    param([string]$CurrentRepo)

    if (-not [string]::IsNullOrWhiteSpace($CurrentRepo) -and
        (Test-Path -LiteralPath $CurrentRepo -PathType Container)) {
        Write-Host ""
        Write-Host "Current repository:" -ForegroundColor Cyan
        Write-Host "  $CurrentRepo"
        if (Prompt-YesNo -Question "Keep this repository?" -Default $true) {
            return $CurrentRepo
        }
    }

    while ($true) {
        $selected = Select-RepositoryFolder -InitialPath $CurrentRepo
        if (-not [string]::IsNullOrWhiteSpace($selected)) {
            $probe = Invoke-Git -RepoPath $selected -GitArgs @("rev-parse", "--is-inside-work-tree")
            if ($probe.ExitCode -eq 0 -and (Get-FirstLine $probe).Trim() -eq "true") {
                return $selected
            }
            Write-Host "That folder is not a Git repository." -ForegroundColor Red
        }

        $typed = Normalize-EnteredPath (Read-Host "Paste a repository folder path, or press Enter to browse again")
        if (-not [string]::IsNullOrWhiteSpace($typed) -and
            (Test-Path -LiteralPath $typed -PathType Container)) {
            $probe = Invoke-Git -RepoPath $typed -GitArgs @("rev-parse", "--is-inside-work-tree")
            if ($probe.ExitCode -eq 0 -and (Get-FirstLine $probe).Trim() -eq "true") {
                return $typed
            }
            Write-Host "That folder is not a Git repository." -ForegroundColor Red
        }
    }
}

function Run-Setup {
    $current = Read-Configuration

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull - setup"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Choose any local Git repository and optional actions to run after updates."

    $currentRepo = if ($null -ne $current) { [string]$current.repoPath } else { "" }
    $repoPath = Choose-Repository -CurrentRepo $currentRepo

    $currentInterval = if ($null -ne $current -and
        -not [string]::IsNullOrWhiteSpace([string]$current.interval)) {
        [string]$current.interval
    } else {
        "30s"
    }

    while ($true) {
        Write-Host ""
        $interval = Normalize-EnteredPath (Read-Host "Check interval [$currentInterval]")
        if ([string]::IsNullOrWhiteSpace($interval)) { $interval = $currentInterval }

        try {
            [void](Convert-IntervalToSeconds $interval)
            break
        }
        catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    }

    $currentBuild = $false
    if ($null -ne $current -and $null -ne $current.runNpmBuild) {
        $currentBuild = [bool]$current.runNpmBuild
    }

    Write-Host ""
    $runNpmBuild = Prompt-YesNo -Question "Run 'npm run build' after each successful pull?" -Default $currentBuild

    $currentCommand = if ($null -ne $current) { [string]$current.postPullCommand } else { "" }
    Write-Host ""
    if (-not [string]::IsNullOrWhiteSpace($currentCommand)) {
        Write-Host "Current custom command:" -ForegroundColor Cyan
        Write-Host "  $currentCommand"
        $commandInput = Read-Host "New command (Enter = keep it, NONE = clear it)"
        if ([string]::IsNullOrWhiteSpace($commandInput)) {
            $postPullCommand = $currentCommand
        }
        elseif ($commandInput.Trim() -ieq "NONE") {
            $postPullCommand = ""
        }
        else {
            $postPullCommand = $commandInput.Trim()
        }
    }
    else {
        $postPullCommand = (Read-Host "Optional command after pull/build (Enter = none)").Trim()
    }

    $currentLaunch = if ($null -ne $current) { [string]$current.launchPath } else { "" }
    $hasCurrentLaunch = -not [string]::IsNullOrWhiteSpace($currentLaunch)
    Write-Host ""
    $useLaunch = Prompt-YesNo -Question "Open/run a selected file after the commands finish?" -Default $hasCurrentLaunch

    $launchPath = ""
    if ($useLaunch) {
        if ($hasCurrentLaunch -and (Test-Path -LiteralPath $currentLaunch -PathType Leaf)) {
            Write-Host "Current file:" -ForegroundColor Cyan
            Write-Host "  $currentLaunch"
            if (Prompt-YesNo -Question "Keep this file?" -Default $true) {
                $launchPath = $currentLaunch
            }
        }

        while ([string]::IsNullOrWhiteSpace($launchPath)) {
            $launchPath = Select-LaunchFile -InitialPath $currentLaunch
            if (-not [string]::IsNullOrWhiteSpace($launchPath)) { break }

            $typed = Normalize-EnteredPath (Read-Host "Paste a file path, or press Enter to browse again")
            if (-not [string]::IsNullOrWhiteSpace($typed) -and
                (Test-Path -LiteralPath $typed -PathType Leaf)) {
                $launchPath = $typed
            }
        }
    }

    Save-Configuration -RepoPath $repoPath -Interval $interval `
        -RunNpmBuild $runNpmBuild -PostPullCommand $postPullCommand -LaunchPath $launchPath

    Write-Host ""
    Write-Host "Saved configuration." -ForegroundColor Green
    Write-Host "  Repo    : $repoPath"
    Write-Host "  Interval: $interval"
    Write-Host ("  Build   : {0}" -f $(if ($runNpmBuild) { "npm run build" } else { "off" }))
    Write-Host ("  Command : {0}" -f $(if ([string]::IsNullOrWhiteSpace($postPullCommand)) { "off" } else { $postPullCommand }))
    Write-Host ("  Launch  : {0}" -f $(if ([string]::IsNullOrWhiteSpace($launchPath)) { "off" } else { $launchPath }))
    Write-Host ""

    Show-DesktopNotification -Title "Repo AutoPull" -Message "Setup saved. Notifications are working."
    return Read-Configuration
}

function Invoke-NpmBuild {
    param([string]$RepoPath)

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if ($null -eq $npm) {
        return [pscustomobject]@{
            Success = $false
            Summary = "npm run build failed"
            Detail = "npm was not found on PATH."
        }
    }

    $oldPreference = $ErrorActionPreference
    Push-Location $RepoPath
    try {
        $ErrorActionPreference = "Continue"
        $raw = @(& $npm.Source run build 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
        Pop-Location
    }

    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $detail = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { "" }

    return [pscustomobject]@{
        Success = ($exitCode -eq 0)
        Summary = $(if ($exitCode -eq 0) { "Build finished" } else { "npm run build failed" })
        Detail = $detail
    }
}

function Invoke-CustomCommand {
    param([string]$RepoPath, [string]$Command)

    $oldPreference = $ErrorActionPreference
    Push-Location $RepoPath
    try {
        $ErrorActionPreference = "Continue"
        $raw = @(& $env:ComSpec /d /s /c $Command 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
        Pop-Location
    }

    $lines = @($raw | ForEach-Object { if ($null -ne $_) { $_.ToString() } } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $detail = if ($lines.Count -gt 0) { $lines[$lines.Count - 1] } else { "" }

    return [pscustomobject]@{
        Success = ($exitCode -eq 0)
        Summary = $(if ($exitCode -eq 0) { "Custom command finished" } else { "Custom command failed" })
        Detail = $detail
    }
}

function Invoke-LaunchFile {
    param([string]$RepoPath, [string]$LaunchPath)

    if (-not (Test-Path -LiteralPath $LaunchPath -PathType Leaf)) {
        return [pscustomobject]@{
            Success = $false
            Summary = "Launch failed"
            Detail = "File no longer exists: $LaunchPath"
        }
    }

    try {
        Start-Process -FilePath $LaunchPath -WorkingDirectory $RepoPath | Out-Null
        return [pscustomobject]@{
            Success = $true
            Summary = "Selected file opened"
            Detail = Split-Path -Leaf $LaunchPath
        }
    }
    catch {
        return [pscustomobject]@{
            Success = $false
            Summary = "Launch failed"
            Detail = $_.Exception.Message
        }
    }
}

function Get-ActionLabel {
    param($Config)

    $parts = @()
    if ([bool]$Config.runNpmBuild) { $parts += "build" }
    if (-not [string]::IsNullOrWhiteSpace([string]$Config.postPullCommand)) { $parts += "command" }
    if (-not [string]::IsNullOrWhiteSpace([string]$Config.launchPath)) { $parts += "launch" }

    if ($parts.Count -eq 0) { return "none" }
    return ($parts -join " -> ")
}

function Render-Dashboard {
    param(
        [string]$RepoPath,
        [int]$IntervalSeconds,
        $UpstreamInfo,
        $Config,
        [string]$HeadHash,
        [string]$HeadSubject,
        [string]$Status,
        [string]$StatusKind,
        [string]$Detail,
        [Nullable[datetime]]$LastCheck,
        [Nullable[datetime]]$NextCheck,
        [object[]]$PullHistory
    )

    Clear-Host
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " Repo AutoPull"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Repo   : $RepoPath"
    Write-Host ("Branch : {0} -> {1}   |   every {2}s" -f `
        $UpstreamInfo.LocalBranch, $UpstreamInfo.Upstream, $IntervalSeconds)
    Write-Host ("HEAD   : {0}  {1}" -f (Short-Hash $HeadHash), $HeadSubject)
    Write-Host ("After  : {0}" -f (Get-ActionLabel $Config))
    Write-Host ""

    $statusColor = switch ($StatusKind) {
        "ok"       { "Green" }
        "updated"  { "Green" }
        "checking" { "Cyan" }
        "working"  { "Cyan" }
        "warning"  { "Yellow" }
        "error"    { "Red" }
        default     { "Gray" }
    }

    Write-Host "Status : $Status" -ForegroundColor $statusColor
    if (-not [string]::IsNullOrWhiteSpace($Detail)) {
        Write-Host "         $Detail" -ForegroundColor DarkGray
    }

    $lastText = if ($LastCheck.HasValue) { $LastCheck.Value.ToString("HH:mm:ss") } else { "not yet" }
    $nextText = if ($NextCheck.HasValue) { $NextCheck.Value.ToString("HH:mm:ss") } else { "checking now" }
    Write-Host ("Last   : {0}   |   Next: {1}" -f $lastText, $nextText)

    Write-Host ""
    Write-Host "Recent pulls:" -ForegroundColor Cyan
    if ($null -eq $PullHistory -or $PullHistory.Count -eq 0) {
        Write-Host "  none yet" -ForegroundColor DarkGray
    }
    else {
        foreach ($entry in $PullHistory) {
            $suffix = if ($entry.CommitCount -eq 1) { "" } else { "s" }
            Write-Host ("  {0}  {1} -> {2}  ({3} commit{4})" -f `
                $entry.Time, $entry.Before, $entry.After, $entry.CommitCount, $suffix) -ForegroundColor Green

            foreach ($commit in $entry.Commits) {
                Write-Host ("           {0}" -f ($commit -replace "`t", "  ")) -ForegroundColor DarkGray
            }

            if (-not [string]::IsNullOrWhiteSpace([string]$entry.Actions)) {
                Write-Host ("           actions: {0}" -f $entry.Actions) -ForegroundColor DarkGray
            }
        }
    }

    Write-Host ""
    Write-Host "Close this window or press Ctrl+C to stop." -ForegroundColor DarkGray
}

$script:GitExe = Find-Git

if ($TestNotification) {
    Show-DesktopNotification -Title "Repo AutoPull" -Message "Test notification: everything is working."
    exit 0
}

$config = Read-Configuration
if ($Setup -or $null -eq $config -or
    [string]::IsNullOrWhiteSpace([string]$config.repoPath)) {
    $config = Run-Setup
}

if ($null -eq $config.runNpmBuild) { $config | Add-Member -NotePropertyName runNpmBuild -NotePropertyValue $false -Force }
if ($null -eq $config.postPullCommand) { $config | Add-Member -NotePropertyName postPullCommand -NotePropertyValue "" -Force }
if ($null -eq $config.launchPath) { $config | Add-Member -NotePropertyName launchPath -NotePropertyValue "" -Force }

$repoPath = [string]$config.repoPath
$interval = [string]$config.interval
if ([string]::IsNullOrWhiteSpace($interval)) { $interval = "30s" }

try {
    $intervalSeconds = Convert-IntervalToSeconds $interval
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Run 'Configure AutoPull.cmd' to change the setup."
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path -LiteralPath $repoPath -PathType Container)) {
    Write-Host "Saved repository folder no longer exists:" -ForegroundColor Red
    Write-Host "  $repoPath"
    Read-Host "Press Enter to close"
    exit 1
}

$probe = Invoke-Git -RepoPath $repoPath -GitArgs @("rev-parse", "--is-inside-work-tree")
if ($probe.ExitCode -ne 0) {
    Write-Host "Saved folder is not a usable Git repository:" -ForegroundColor Red
    Write-Host "  $repoPath"
    Read-Host "Press Enter to close"
    exit 1
}

try {
    $upstreamInfo = Get-UpstreamInfo -RepoPath $repoPath
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$repoName = Split-Path -Leaf $repoPath
$pullHistory = @()
$lastCheck = $null

while ($true) {
    $beforeHash = Get-HeadHash -RepoPath $repoPath
    $beforeSubject = Get-CommitSubject -RepoPath $repoPath -Hash $beforeHash

    Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
        -UpstreamInfo $upstreamInfo -Config $config -HeadHash $beforeHash -HeadSubject $beforeSubject `
        -Status "Checking GitHub..." -StatusKind "checking" -Detail "" `
        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory

    $fetchResult = Invoke-Git -RepoPath $repoPath -GitArgs @(
        "fetch", "--quiet", $upstreamInfo.Remote
    )

    if ($fetchResult.ExitCode -ne 0) {
        $status = "Fetch failed"
        $statusKind = "error"
        $detail = Get-LastLine $fetchResult
    }
    else {
        $remoteResult = Invoke-Git -RepoPath $repoPath -GitArgs @(
            "rev-parse", $upstreamInfo.Upstream
        )

        if ($remoteResult.ExitCode -ne 0) {
            $status = "Remote branch not found"
            $statusKind = "error"
            $detail = Get-LastLine $remoteResult
        }
        else {
            $remoteHash = (Get-FirstLine $remoteResult).Trim().ToLowerInvariant()
            $localHash = Get-HeadHash -RepoPath $repoPath

            if ($localHash -eq $remoteHash) {
                $status = "Up to date"
                $statusKind = "ok"
                $detail = ""
            }
            elseif (Test-IsAncestor -RepoPath $repoPath -Older $localHash -Newer $remoteHash) {
                $countResult = Invoke-Git -RepoPath $repoPath -GitArgs @(
                    "rev-list", "--count", "$localHash..$remoteHash"
                )
                $availableCount = if ($countResult.ExitCode -eq 0) {
                    [int](Get-FirstLine $countResult)
                } else {
                    1
                }

                $trackedChangeCount = Get-TrackedLocalChangeCount -RepoPath $repoPath
                $pullArgs = if ($upstreamInfo.TrackingConfigured) {
                    @("pull", "--ff-only", "--autostash", "--quiet")
                }
                else {
                    @("pull", "--ff-only", "--autostash", "--quiet",
                        $upstreamInfo.Remote, $upstreamInfo.RemoteBranch)
                }

                $pullResult = Invoke-Git -RepoPath $repoPath -GitArgs $pullArgs
                $afterHash = Get-HeadHash -RepoPath $repoPath

                if ($afterHash -and $afterHash -ne $localHash) {
                    $logResult = Invoke-Git -RepoPath $repoPath -GitArgs @(
                        "log", "--reverse", "--format=%h%x09%s", "$localHash..$afterHash"
                    )
                    $commits = @($logResult.Lines |
                        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
                    $commitCount = $commits.Count
                    if ($commitCount -eq 0) { $commitCount = $availableCount }
                    if ($commitCount -eq 0) { $commitCount = 1 }

                    $unmerged = @(Get-UnmergedFiles -RepoPath $repoPath)

                    if ($pullResult.ExitCode -ne 0 -or $unmerged.Count -gt 0) {
                        $actionSummary = "post-pull actions skipped"
                        $status = "Updated, but local changes need attention"
                        $statusKind = "warning"

                        if ($unmerged.Count -gt 0) {
                            $detail = "Git updated to $(Short-Hash $afterHash), but autostash reapply conflicted: $($unmerged -join ', ')"
                        }
                        else {
                            $detail = Get-LastLine $pullResult
                        }

                        Show-DesktopNotification -Title "$repoName updated - attention needed" `
                            -Message "Pulled $commitCount commit(s), but local changes need attention. Post-pull actions were skipped."
                    }
                    else {
                        $actionParts = @()
                        $postSuccess = $true
                        $postFailure = ""

                        if ([bool]$config.runNpmBuild) {
                            Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
                                -UpstreamInfo $upstreamInfo -Config $config -HeadHash $afterHash `
                                -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                -Status "Running npm run build..." -StatusKind "working" `
                                -Detail "Pulled $commitCount commit(s)." -LastCheck $lastCheck `
                                -NextCheck $null -PullHistory $pullHistory

                            $buildResult = Invoke-NpmBuild -RepoPath $repoPath
                            if ($buildResult.Success) {
                                $actionParts += "build OK"
                            }
                            else {
                                $postSuccess = $false
                                $postFailure = "$($buildResult.Summary): $($buildResult.Detail)"
                                $actionParts += "build FAILED"
                            }
                        }

                        if ($postSuccess -and
                            -not [string]::IsNullOrWhiteSpace([string]$config.postPullCommand)) {
                            Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
                                -UpstreamInfo $upstreamInfo -Config $config -HeadHash $afterHash `
                                -HeadSubject (Get-CommitSubject -RepoPath $repoPath -Hash $afterHash) `
                                -Status "Running custom command..." -StatusKind "working" `
                                -Detail ([string]$config.postPullCommand) -LastCheck $lastCheck `
                                -NextCheck $null -PullHistory $pullHistory

                            $commandResult = Invoke-CustomCommand -RepoPath $repoPath `
                                -Command ([string]$config.postPullCommand)

                            if ($commandResult.Success) {
                                $actionParts += "command OK"
                            }
                            else {
                                $postSuccess = $false
                                $postFailure = "$($commandResult.Summary): $($commandResult.Detail)"
                                $actionParts += "command FAILED"
                            }
                        }

                        if ($postSuccess -and
                            -not [string]::IsNullOrWhiteSpace([string]$config.launchPath)) {
                            $launchResult = Invoke-LaunchFile -RepoPath $repoPath `
                                -LaunchPath ([string]$config.launchPath)

                            if ($launchResult.Success) {
                                $actionParts += "launched $($launchResult.Detail)"
                            }
                            else {
                                $postSuccess = $false
                                $postFailure = "$($launchResult.Summary): $($launchResult.Detail)"
                                $actionParts += "launch FAILED"
                            }
                        }

                        $actionSummary = if ($actionParts.Count -eq 0) {
                            "no post-pull actions"
                        }
                        else {
                            $actionParts -join "; "
                        }

                        $latestSubject = Get-CommitSubject -RepoPath $repoPath -Hash $afterHash
                        $pullText = if ($commitCount -eq 1) {
                            "Pulled $(Short-Hash $afterHash) - $latestSubject"
                        }
                        else {
                            "Pulled $commitCount commits. Latest: $(Short-Hash $afterHash) - $latestSubject"
                        }

                        if ($postSuccess) {
                            $status = if ($actionParts.Count -gt 0) {
                                "Updated + post-pull actions finished"
                            }
                            else {
                                "Updated"
                            }
                            $statusKind = "updated"
                            $detail = "$pullText. $actionSummary."
                            Show-DesktopNotification -Title "$repoName updated" -Message $detail
                        }
                        else {
                            $status = "Updated, post-pull action failed"
                            $statusKind = "error"
                            $detail = "$pullText. $postFailure"
                            Show-DesktopNotification -Title "$repoName updated - action failed" `
                                -Message $detail
                        }
                    }

                    $entry = [pscustomobject]@{
                        Time = (Get-Date).ToString("HH:mm:ss")
                        Before = Short-Hash $localHash
                        After = Short-Hash $afterHash
                        CommitCount = $commitCount
                        Commits = $commits
                        Actions = $actionSummary
                    }
                    $pullHistory = @($entry) + @($pullHistory)
                    if ($pullHistory.Count -gt 6) {
                        $pullHistory = @($pullHistory | Select-Object -First 6)
                    }
                }
                elseif ($pullResult.ExitCode -ne 0) {
                    $status = "Pull failed"
                    $statusKind = "error"
                    $detail = Get-LastLine $pullResult
                }
                else {
                    $status = "Up to date"
                    $statusKind = "ok"
                    $detail = ""
                }
            }
            elseif (Test-IsAncestor -RepoPath $repoPath -Older $remoteHash -Newer $localHash) {
                $status = "Local branch is ahead"
                $statusKind = "warning"
                $detail = "Nothing was pulled because the local branch has commits not on $($upstreamInfo.Upstream)."
            }
            else {
                $status = "Local and remote diverged"
                $statusKind = "warning"
                $detail = "Auto-pull stopped for safety. Resolve the Git history manually."
            }
        }
    }

    $lastCheck = Get-Date
    $nextCheck = $lastCheck.AddSeconds($intervalSeconds)
    $headHash = Get-HeadHash -RepoPath $repoPath
    $headSubject = Get-CommitSubject -RepoPath $repoPath -Hash $headHash

    Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
        -UpstreamInfo $upstreamInfo -Config $config -HeadHash $headHash `
        -HeadSubject $headSubject -Status $status -StatusKind $statusKind `
        -Detail $detail -LastCheck $lastCheck -NextCheck $nextCheck `
        -PullHistory $pullHistory

    Start-Sleep -Seconds $intervalSeconds
}
