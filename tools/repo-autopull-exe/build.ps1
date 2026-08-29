$ErrorActionPreference = 'Stop'

$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ToolDir '..\..')
$ScriptSource = Join-Path $RepoRoot 'Repo_AutoPull\Repo-AutoPull.ps1'
$EmbeddedScript = Join-Path $ToolDir 'embedded.ps1'
$Output = Join-Path $RepoRoot 'Repo_AutoPull\RepoAutoPull.exe'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw 'Go was not found on PATH.'
}
if (-not (Test-Path -LiteralPath $ScriptSource -PathType Leaf)) {
    throw "Repo AutoPull script not found: $ScriptSource"
}

Copy-Item -LiteralPath $ScriptSource -Destination $EmbeddedScript -Force
try {
    Push-Location $ToolDir
    try {
        $env:GOOS = 'windows'
        $env:GOARCH = 'amd64'
        $env:CGO_ENABLED = '0'
        & go vet ./...
        if ($LASTEXITCODE -ne 0) { throw 'go vet failed.' }
        & go build -trimpath -ldflags '-s -w' -o $Output .
        if ($LASTEXITCODE -ne 0) { throw 'go build failed.' }
    }
    finally { Pop-Location }
}
finally {
    Remove-Item -LiteralPath $EmbeddedScript -Force -ErrorAction SilentlyContinue
}

Write-Host "Built: $Output" -ForegroundColor Green
