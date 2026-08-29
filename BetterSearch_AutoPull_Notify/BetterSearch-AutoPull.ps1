param(
    [switch]$Setup,
    [switch]$TestNotification
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "BetterSearch AutoPull" } catch {}

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

        # Keep NotifyIcon alive long enough for Windows to display the balloon.
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
    param([string]$RepoPath, [string]$Interval)

    [pscustomobject]@{
        repoPath = $RepoPath
        interval = $Interval
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
    catch { throw "Git was not found on PATH. This helper uses the same Git CLI as your manual 'git pull'." }
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

function Get-BlockingLocalChanges {
    param([string]$RepoPath)

    # Ignore untracked files entirely. This allows harmless local-only files such
    # as the old downloaded autogitpull.exe to live beside the helper.
    $result = Invoke-Git -RepoPath $RepoPath -GitArgs @(
        "status", "--porcelain", "--untracked-files=no"
    )

    if ($result.ExitCode -ne 0) {
        return @("Could not inspect local changes")
    }

    # These two files are legacy/local runtime artifacts. They were accidentally
    # committed earlier and must not make the whole repository permanently dirty.
    $ignoredPaths = @(
        ".autogitpull.lock",
        "BetterSearch_AutoPull_Notify/BetterSearch-AutoPull.config.json"
    )

    $blocking = @()
    foreach ($line in @(Get-NonEmptyLines $result)) {
        $normalized = $line.Replace("\", "/")
        $ignore = $false
        foreach ($ignoredPath in $ignoredPaths) {
            if ($normalized.EndsWith($ignoredPath) -or $normalized.Contains(" -> $ignoredPath")) {
                $ignore = $true
                break
            }
        }
        if (-not $ignore) { $blocking += $line }
    }

    return @($blocking)
}

function Run-Setup {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " BetterSearch AutoPull - setup"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "This version uses your normal Git installation directly."
    Write-Host "autogitpull.exe is no longer needed." -ForegroundColor Green

    $repoPath = ""
    while ([string]::IsNullOrWhiteSpace($repoPath)) {
        Write-Host ""
        Write-Host "Enter the LOCAL BetterSearch repository folder." -ForegroundColor Yellow
        Write-Host "Tip: drag the folder from Explorer into this window."
        $repoPath = Normalize-EnteredPath (Read-Host "Repo folder")

        if ([string]::IsNullOrWhiteSpace($repoPath) -or
            -not (Test-Path -LiteralPath $repoPath -PathType Container)) {
            Write-Host "That folder does not exist." -ForegroundColor Red
            $repoPath = ""
            continue
        }

        $probe = Invoke-Git -RepoPath $repoPath -GitArgs @("rev-parse", "--is-inside-work-tree")
        if ($probe.ExitCode -ne 0 -or (Get-FirstLine $probe).Trim() -ne "true") {
            Write-Host "That folder is not a Git repository." -ForegroundColor Red
            $repoPath = ""
        }
    }

    while ($true) {
        Write-Host ""
        $interval = Normalize-EnteredPath (Read-Host "How often should it check? [default: 30s]")
        if ([string]::IsNullOrWhiteSpace($interval)) { $interval = "30s" }

        try {
            [void](Convert-IntervalToSeconds $interval)
            break
        }
        catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    }

    Save-Configuration -RepoPath $repoPath -Interval $interval
    Write-Host ""
    Write-Host "Saved." -ForegroundColor Green
    Show-DesktopNotification -Title "BetterSearch AutoPull" -Message "Notifications are working."
    return Read-Configuration
}

function Render-Dashboard {
    param(
        [string]$RepoPath,
        [int]$IntervalSeconds,
        $UpstreamInfo,
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
    Write-Host " BetterSearch AutoPull"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Repo   : $RepoPath"
    Write-Host ("Branch : {0} -> {1}   |   every {2}s" -f `
        $UpstreamInfo.LocalBranch, $UpstreamInfo.Upstream, $IntervalSeconds)
    Write-Host ("HEAD   : {0}  {1}" -f (Short-Hash $HeadHash), $HeadSubject)
    Write-Host ""

    $statusColor = switch ($StatusKind) {
        "ok"       { "Green" }
        "updated"  { "Green" }
        "checking" { "Cyan" }
        "warning"  { "Yellow" }
        "error"    { "Red" }
        default    { "Gray" }
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
        }
    }

    Write-Host ""
    Write-Host "Close this window or press Ctrl+C to stop." -ForegroundColor DarkGray
}

$script:GitExe = Find-Git

if ($TestNotification) {
    Show-DesktopNotification -Title "BetterSearch AutoPull" -Message "Test notification: everything is working."
    exit 0
}

$config = Read-Configuration
if ($Setup -or $null -eq $config -or
    [string]::IsNullOrWhiteSpace([string]$config.repoPath)) {
    $config = Run-Setup
}

$repoPath = [string]$config.repoPath
$interval = [string]$config.interval
if ([string]::IsNullOrWhiteSpace($interval)) { $interval = "30s" }

try {
    $intervalSeconds = Convert-IntervalToSeconds $interval
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Run 'Reset setup.cmd' to change the interval."
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

$pullHistory = @()
$lastCheck = $null

while ($true) {
    $beforeHash = Get-HeadHash -RepoPath $repoPath
    $beforeSubject = Get-CommitSubject -RepoPath $repoPath -Hash $beforeHash

    Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
        -UpstreamInfo $upstreamInfo -HeadHash $beforeHash -HeadSubject $beforeSubject `
        -Status "Checking GitHub..." -StatusKind "checking" -Detail "" `
        -LastCheck $lastCheck -NextCheck $null -PullHistory $pullHistory

    $blockingChanges = @(Get-BlockingLocalChanges -RepoPath $repoPath)
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
                }
                else {
                    1
                }

                if ($blockingChanges.Count -gt 0) {
                    $status = "Update waiting"
                    $statusKind = "warning"
                    $firstChange = $blockingChanges[0].Trim()
                    $detail = "$availableCount remote commit(s) available; tracked local change blocks auto-pull: $firstChange"
                }
                else {
                    $pullArgs = if ($upstreamInfo.TrackingConfigured) {
                        @("pull", "--ff-only", "--quiet")
                    }
                    else {
                        @("pull", "--ff-only", "--quiet", $upstreamInfo.Remote, $upstreamInfo.RemoteBranch)
                    }

                    $pullResult = Invoke-Git -RepoPath $repoPath -GitArgs $pullArgs
                    if ($pullResult.ExitCode -ne 0) {
                        $status = "Pull failed"
                        $statusKind = "error"
                        $detail = Get-LastLine $pullResult
                    }
                    else {
                        $afterHash = Get-HeadHash -RepoPath $repoPath
                        if ($afterHash -and $afterHash -ne $localHash) {
                            $logResult = Invoke-Git -RepoPath $repoPath -GitArgs @(
                                "log", "--reverse", "--format=%h%x09%s", "$localHash..$afterHash"
                            )
                            $commits = @(Get-NonEmptyLines $logResult)
                            $commitCount = $commits.Count
                            if ($commitCount -eq 0) { $commitCount = 1 }

                            $entry = [pscustomobject]@{
                                Time = (Get-Date).ToString("HH:mm:ss")
                                Before = Short-Hash $localHash
                                After = Short-Hash $afterHash
                                CommitCount = $commitCount
                                Commits = $commits
                            }

                            $pullHistory = @($entry) + @($pullHistory)
                            if ($pullHistory.Count -gt 5) {
                                $pullHistory = @($pullHistory | Select-Object -First 5)
                            }

                            $latestSubject = Get-CommitSubject -RepoPath $repoPath -Hash $afterHash
                            if ($commitCount -eq 1) {
                                $notificationMessage = "Pulled $(Short-Hash $afterHash) - $latestSubject"
                            }
                            else {
                                $notificationMessage = "Pulled $commitCount commits. Latest: $(Short-Hash $afterHash) - $latestSubject"
                            }

                            Show-DesktopNotification -Title "BetterSearch updated" -Message $notificationMessage
                            $status = "Updated"
                            $statusKind = "updated"
                            $detail = $notificationMessage
                        }
                        else {
                            $status = "Up to date"
                            $statusKind = "ok"
                            $detail = ""
                        }
                    }
                }
            }
            elseif (Test-IsAncestor -RepoPath $repoPath -Older $remoteHash -Newer $localHash) {
                $status = "Local branch ahead"
                $statusKind = "warning"
                $detail = "No pull needed; local HEAD contains commit(s) not on $($upstreamInfo.Upstream)."
            }
            else {
                $status = "Local and remote diverged"
                $statusKind = "warning"
                $detail = "Auto-pull skipped for safety. Resolve Git history manually."
            }
        }
    }

    $lastCheck = Get-Date
    $nextCheck = $lastCheck.AddSeconds($intervalSeconds)
    $headHash = Get-HeadHash -RepoPath $repoPath
    $headSubject = Get-CommitSubject -RepoPath $repoPath -Hash $headHash

    Render-Dashboard -RepoPath $repoPath -IntervalSeconds $intervalSeconds `
        -UpstreamInfo $upstreamInfo -HeadHash $headHash -HeadSubject $headSubject `
        -Status $status -StatusKind $statusKind -Detail $detail `
        -LastCheck $lastCheck -NextCheck $nextCheck -PullHistory $pullHistory

    Start-Sleep -Seconds $intervalSeconds
}
