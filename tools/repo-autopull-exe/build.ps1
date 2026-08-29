$ErrorActionPreference = "Stop"

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $Here "..\..")
$CanonicalScript = Join-Path $RepoRoot "Repo_AutoPull\Repo-AutoPull.ps1"
$EmbeddedScript = Join-Path $Here "embedded.ps1"
$OutputDir = Join-Path $RepoRoot "Repo_AutoPull\Standalone"
$OutputExe = Join-Path $OutputDir "RepoAutoPull.exe"

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw "Go is not installed or not available on PATH."
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Copy-Item -LiteralPath $CanonicalScript -Destination $EmbeddedScript -Force

try {
    Push-Location $Here
    try {
        $env:GOOS = "windows"
        $env:GOARCH = "amd64"
        $env:CGO_ENABLED = "0"
        & go build -trimpath -ldflags "-s -w" -o $OutputExe .
        if ($LASTEXITCODE -ne 0) { throw "go build failed with exit code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}
finally {
    Remove-Item -LiteralPath $EmbeddedScript -Force -ErrorAction SilentlyContinue
}

Write-Host "Built: $OutputExe" -ForegroundColor Green
