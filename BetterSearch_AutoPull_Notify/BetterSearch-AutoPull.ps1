param(
    [switch]$Setup,
    [switch]$TestNotification
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "BetterSearch AutoPull + Notifications v1.2"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptDir "BetterSearch-AutoPull.config.json"

function Show-DesktopNotification {
    param(
        [string]$Title,
        [string]$Message
    )

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
        $notify.ShowBalloonTip(7000)

        Start-Sleep -Seconds 7
        $notify.Dispose()
    }
    catch {
        Write-Warning "Could not show desktop notification: $($_.Exception.Message)"
        try { [System.Media.SystemSounds]::Asterisk.Play() } catch {}
    }
}

function Normalize-EnteredPath {
    param([string]$PathText)
    if ($null -eq $PathText) { return "" }
    return $PathText.Trim().Trim('"').Trim("'")
}

function Find-AutoGitPullExe {
    $candidate = Get-ChildItem -LiteralPath $ScriptDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -ieq ".exe" -and $_.Name -match "autogitpull" } |
        Select-Object -First 1

    if ($candidate) { return $candidate.FullName }
    return ""
}

function Read-Configuration {
    if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    }
    catch {
        Write-Warning "The saved config could not be read. Setup will run again."
        return $null
    }
}

function Save-Configuration {
    param(
        [string]$AutoGitPullExe,
        [string]$RepoPath,
        [string]$Interval
    )

    [pscustomobject]@{
        autogitpullExe = $AutoGitPullExe
        repoPath       = $RepoPath
        interval       = $Interval
    } | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
}

function Convert-IntervalToSeconds {
    param([string]$Interval)

    $value = if ($null -eq $Interval) { "" } else { $Interval.Trim() }

    # Plain "30" means 30 seconds, matching autogitpull's behavior.
    if ($value -match "^\d+$") {
        return [Math]::Max(1, [int]$value)
    }

    if ($value -match "^(\d+)\s*(ms|s|m|h|d|w)$") {
        $amount = [int]$Matches[1]
        $unit = $Matches[2]

        switch ($unit) {
            "ms" { return [Math]::Max(1, [int][Math]::Ceiling($amount / 1000.0)) }
            "s"  { return [Math]::Max(1, $amount) }
            "m"  { return [Math]::Max(1, $amount * 60) }
            "h"  { return [Math]::Max(1, $amount * 3600) }
            "d"  { return [Math]::Max(1, $amount * 86400) }
            "w"  { return [Math]::Max(1, $amount * 604800) }
        }
    }

    throw "Unsupported interval '$Interval'. Use values like 30, 30s, 1m, or 5m."
}

function Run-Setup {
    $detectedExe = Find-AutoGitPullExe
    $exePath = ""

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host " BetterSearch AutoPull + Notifications v1.2 - setup"
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host ""

    if ($detectedExe) {
        Write-Host "Found autogitpull automatically:" -ForegroundColor Green
        Write-Host "  $detectedExe"
        $answer = Read-Host "Use this EXE? [Y/n]"
        if ([string]::IsNullOrWhiteSpace($answer) -or $answer -match "^[Yy]") {
            $exePath = $detectedExe
        }
    }

    while ([string]::IsNullOrWhiteSpace($exePath) -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        Write-Host ""
        Write-Host "Enter the full path to the autogitpull .exe." -ForegroundColor Yellow
        Write-Host "Tip: drag the EXE from Explorer into this window."
        $exePath = Normalize-EnteredPath (Read-Host "autogitpull.exe path")
        if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
            Write-Host "That file does not exist. Try again." -ForegroundColor Red
            $exePath = ""
        }
    }

    $repoPath = ""
    while ([string]::IsNullOrWhiteSpace($repoPath) -or -not (Test-Path -LiteralPath (Join-Path $repoPath ".git"))) {
        Write-Host ""
        Write-Host "Enter the LOCAL folder containing your Etsy BetterSearch repository." -ForegroundColor Yellow
        Write-Host "It must be the folder containing .git."
        Write-Host "Tip: drag the repo folder from Explorer into this window."
        $repoPath = Normalize-EnteredPath (Read-Host "Repo folder")
        if (-not (Test-Path -LiteralPath (Join-Path $repoPath ".git"))) {
            Write-Host "I couldn't find .git in that folder. Try again." -ForegroundColor Red
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

    Save-Configuration -AutoGitPullExe $exePath -RepoPath $repoPath -Interval $interval

    Write-Host ""
    Write-Host "Saved configuration:" -ForegroundColor Green
    Write-Host "  autogitpull: $exePath"
    Write-Host "  repository : $repoPath"
    Write-Host "  interval   : $interval"
    Write-Host ""
    Write-Host "Showing a test notification now..." -ForegroundColor Cyan
    Show-DesktopNotification -Title "BetterSearch AutoPull" -Message "Notifications are working. You'll get one whenever a new commit is pulled."

    return Read-Configuration
}

function Get-HeadHash {
    param([string]$RepoPath)

    # Use Git when available. This handles normal repos, worktrees, packed refs, etc.
    try {
        $git = Get-Command git -ErrorAction Stop
        $hash = & $git.Source -C $RepoPath rev-parse HEAD 2>$null
        if ($LASTEXITCODE -eq 0 -and $hash) {
            return ($hash | Select-Object -First 1).Trim().ToLowerInvariant()
        }
    }
    catch {}

    # Fallback for a standard non-worktree .git directory.
    $gitDir = Join-Path $RepoPath ".git"
    $headPath = Join-Path $gitDir "HEAD"
    if (-not (Test-Path -LiteralPath $headPath -PathType Leaf)) { return $null }

    $head = (Get-Content -LiteralPath $headPath -Raw).Trim()

    if ($head -notmatch "^ref:\s+(.+)$") {
        if ($head -match "^[0-9a-fA-F]{7,40}$") { return $head.ToLowerInvariant() }
        return $null
    }

    $refName = $Matches[1].Trim()
    $looseRefPath = Join-Path $gitDir ($refName -replace "/", "\")

    if (Test-Path -LiteralPath $looseRefPath -PathType Leaf) {
        $hash = (Get-Content -LiteralPath $looseRefPath -Raw).Trim()
        if ($hash -match "^[0-9a-fA-F]{7,40}$") { return $hash.ToLowerInvariant() }
    }

    $packedRefs = Join-Path $gitDir "packed-refs"
    if (Test-Path -LiteralPath $packedRefs -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $packedRefs) {
            if ($line -match "^([0-9a-fA-F]{40})\s+(.+)$" -and $Matches[2] -eq $refName) {
                return $Matches[1].ToLowerInvariant()
            }
        }
    }

    return $null
}

function Get-CommitSubject {
    param(
        [string]$RepoPath,
        [string]$Hash
    )

    try {
        $git = Get-Command git -ErrorAction Stop
        $subject = & $git.Source -C $RepoPath show -s --format=%s $Hash 2>$null
        if ($LASTEXITCODE -eq 0 -and $subject) {
            return ($subject | Select-Object -First 1).Trim()
        }
    }
    catch {}

    return ""
}

function Quote-ProcessArgument {
    param([string]$Value)
    return '"' + $Value + '"'
}

function Start-OneAutoGitPullScan {
    param(
        [string]$ExePath,
        [string]$RepoPath
    )

    # --single-run: one scan cycle, then exit.
    # --no-hash-check: force autogitpull to attempt the pull operation each scan
    #                  instead of relying on its preliminary remote hash check.
    # --include-private: also allows GitHub remotes that require authentication
    #                    (for example an SSH-authenticated GitHub remote).
    # --show-skipped: if autogitpull refuses a repo (dirty/auth/etc.), SHOW WHY.
    #
    # We intentionally DO NOT use --force-pull / --discard-dirty.
    $arguments =
        "--root " + (Quote-ProcessArgument $RepoPath) +
        " --single-repo" +
        " --single-run" +
        " --no-hash-check" +
        " --include-private" +
        " --show-skipped" +
        " --cli"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $ExePath
    $psi.Arguments = $arguments
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $false

    return [System.Diagnostics.Process]::Start($psi)
}

function Wait-Countdown {
    param([int]$Seconds)

    for ($remaining = $Seconds; $remaining -gt 0; $remaining--) {
        $next = (Get-Date).AddSeconds($remaining).ToString("HH:mm:ss")
        Write-Host ("`rNext GitHub check in {0}s  (about {1})   " -f $remaining, $next) -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 1
    }
    Write-Host "`rStarting next GitHub check...                         " -ForegroundColor Cyan
}

if ($TestNotification) {
    Show-DesktopNotification -Title "BetterSearch AutoPull" -Message "Test notification: everything is working."
    exit 0
}

$config = Read-Configuration
if ($Setup -or $null -eq $config) {
    $config = Run-Setup
}

$exePath = [string]$config.autogitpullExe
$repoPath = [string]$config.repoPath
$interval = [string]$config.interval

if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    Write-Host "Saved autogitpull EXE no longer exists:" -ForegroundColor Red
    Write-Host "  $exePath"
    Write-Host ""
    Write-Host "Run 'Reset setup.cmd' and configure it again."
    Read-Host "Press Enter to close"
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $repoPath ".git"))) {
    Write-Host "Saved repository folder is no longer valid:" -ForegroundColor Red
    Write-Host "  $repoPath"
    Write-Host ""
    Write-Host "Run 'Reset setup.cmd' and configure it again."
    Read-Host "Press Enter to close"
    exit 1
}

try {
    $intervalSeconds = Convert-IntervalToSeconds $interval
}
catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Run 'Reset setup.cmd' and enter a valid interval."
    Read-Host "Press Enter to close"
    exit 1
}

$lastHash = Get-HeadHash -RepoPath $repoPath
$checkNumber = 0

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " BetterSearch AutoPull + Notifications v1.2"
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Repository : $repoPath"
Write-Host "Check every: $intervalSeconds seconds"
if ($lastHash) {
    Write-Host "Current HEAD: $($lastHash.Substring(0, [Math]::Min(7, $lastHash.Length)))"
}
Write-Host ""
Write-Host "This version runs ONE real autogitpull scan at a time." -ForegroundColor Green
Write-Host "After each scan you'll see exactly when the next one runs."
Write-Host "Close this window or press Ctrl+C to stop."
Write-Host ""

while ($true) {
    $checkNumber++
    $startedAt = Get-Date
    $beforeHash = Get-HeadHash -RepoPath $repoPath
    if ($beforeHash) { $lastHash = $beforeHash }

    Write-Host ""
    Write-Host ("[{0}] CHECK #{1} - contacting Git remote..." -f $startedAt.ToString("HH:mm:ss"), $checkNumber) -ForegroundColor Cyan

    try {
        $process = Start-OneAutoGitPullScan -ExePath $exePath -RepoPath $repoPath

        while (-not $process.HasExited) {
            Start-Sleep -Milliseconds 250
        }

        $exitCode = $process.ExitCode
    }
    catch {
        Write-Host ("CHECK #{0} could not start autogitpull: {1}" -f $checkNumber, $_.Exception.Message) -ForegroundColor Red
        $exitCode = -1
    }

    $afterHash = Get-HeadHash -RepoPath $repoPath

    if ($afterHash -and $lastHash -and $afterHash -ne $lastHash) {
        $shortHash = $afterHash.Substring(0, [Math]::Min(7, $afterHash.Length))
        $subject = Get-CommitSubject -RepoPath $repoPath -Hash $afterHash

        if ($subject) {
            $message = "Pulled $shortHash - $subject"
        }
        else {
            $message = "Repository updated to $shortHash"
        }

        Write-Host ("[{0}] UPDATE DETECTED: {1}" -f (Get-Date).ToString("HH:mm:ss"), $message) -ForegroundColor Green
        Show-DesktopNotification -Title "BetterSearch updated" -Message $message
        $lastHash = $afterHash
        Write-Host "Update handled successfully. Monitoring will continue." -ForegroundColor Green
    }
    elseif ($afterHash -and -not $lastHash) {
        $lastHash = $afterHash
        Write-Host ("[{0}] CHECK #{1} finished. HEAD is {2}." -f (Get-Date).ToString("HH:mm:ss"), $checkNumber, $afterHash.Substring(0,7)) -ForegroundColor DarkGray
    }
    else {
        if ($exitCode -eq 0) {
            Write-Host ("[{0}] CHECK #{1} finished - pull attempted; HEAD unchanged." -f (Get-Date).ToString("HH:mm:ss"), $checkNumber) -ForegroundColor DarkGray
        }
        else {
            Write-Host ("[{0}] CHECK #{1} finished with autogitpull exit code {2}." -f (Get-Date).ToString("HH:mm:ss"), $checkNumber, $exitCode) -ForegroundColor Yellow
        }
    }

    Wait-Countdown -Seconds $intervalSeconds
}
