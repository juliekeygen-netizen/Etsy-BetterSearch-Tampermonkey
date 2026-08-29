param(
    [switch]$RefreshResources
)

$ErrorActionPreference = 'Stop'

$ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ToolDir '..\..')
$ScriptSource = Join-Path $RepoRoot 'Repo_AutoPull\Repo-AutoPull.ps1'
$EmbeddedScript = Join-Path $ToolDir 'embedded.ps1'
$Output = Join-Path $RepoRoot 'Repo_AutoPull\RepoAutoPull.exe'
$Icon = Join-Path $RepoRoot 'Repo_AutoPull\assets\RepoAutoPull.ico'
$ResourceObject = Join-Path $ToolDir 'rsrc_windows_amd64.syso'

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    throw 'Go was not found on PATH.'
}
if (-not (Test-Path -LiteralPath $ScriptSource -PathType Leaf)) {
    throw "Repo AutoPull script not found: $ScriptSource"
}
if (-not (Test-Path -LiteralPath $Icon -PathType Leaf)) {
    throw "Repo AutoPull icon not found: $Icon"
}

Copy-Item -LiteralPath $ScriptSource -Destination $EmbeddedScript -Force
try {
    Push-Location $ToolDir
    try {
        $env:GOOS = 'windows'
        $env:GOARCH = 'amd64'
        $env:CGO_ENABLED = '0'

        if ($RefreshResources -or -not (Test-Path -LiteralPath $ResourceObject -PathType Leaf)) {
            Write-Host 'Refreshing embedded Windows icon/version resources...' -ForegroundColor Cyan
            & go run github.com/tc-hib/go-winres@v0.3.3 simply `
                --arch amd64 `
                --out rsrc `
                --icon $Icon `
                --manifest cli `
                --file-description 'Repo AutoPull' `
                --product-name 'Repo AutoPull' `
                --original-filename 'RepoAutoPull.exe' `
                --file-version '1.0.0.0' `
                --product-version '1.0.0.0'
            if ($LASTEXITCODE -ne 0) { throw 'go-winres resource generation failed.' }
        }

        & go vet ./...
        if ($LASTEXITCODE -ne 0) { throw 'go vet failed.' }

        # -buildvcs=false keeps the single-file EXE reproducible across commits
        # when the actual wrapper/script/resource inputs have not changed.
        & go build -buildvcs=false -trimpath -ldflags '-s -w' -o $Output .
        if ($LASTEXITCODE -ne 0) { throw 'go build failed.' }
    }
    finally { Pop-Location }
}
finally {
    Remove-Item -LiteralPath $EmbeddedScript -Force -ErrorAction SilentlyContinue
}

Write-Host "Built: $Output" -ForegroundColor Green
