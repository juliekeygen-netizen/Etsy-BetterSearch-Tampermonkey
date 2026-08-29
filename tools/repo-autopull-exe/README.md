# Repo AutoPull standalone EXE

This directory contains the reproducible source for `Repo_AutoPull/RepoAutoPull.exe`.

The Go wrapper embeds `Repo-AutoPull.ps1`, extracts it to a temporary directory at runtime, and launches Windows PowerShell. Settings are stored under `%APPDATA%\RepoAutoPull`.

## Build on Windows

Run:

```powershell
.\build.ps1
```

The build script copies the current `Repo_AutoPull/Repo-AutoPull.ps1` into the Go embed input, runs `go vet`, and builds `Repo_AutoPull/RepoAutoPull.exe` for Windows x64.

The standalone EXE and script edition use the same ordered custom-command list, Git, build, launch, and notification behavior.
