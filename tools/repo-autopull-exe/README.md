# Repo AutoPull standalone EXE

This directory contains the reproducible source for `Repo_AutoPull/RepoAutoPull.exe`.

The Go wrapper embeds `Repo-AutoPull.ps1`, extracts it to a temporary directory at runtime, and launches Windows PowerShell.

## Portable configuration

Each physical EXE copy uses its own adjacent configuration file:

```text
RepoAutoPull.exe
RepoAutoPull.config.json
```

The wrapper passes that exact local path to the embedded PowerShell script. Different EXE copies in different folders therefore keep independent repository/settings state.

If the local portable config does not exist, the wrapper performs one-time migration from:

1. `Repo-AutoPull.config.json` beside the EXE
2. `%APPDATA%\RepoAutoPull\Repo-AutoPull.config.json`

The EXE does not fall back to a shared AppData config if its own folder is not writable; it exits with a clear message instead.

## Windows resources

`Repo_AutoPull/assets/RepoAutoPull.ico` is embedded into the EXE together with:

- Product name: `Repo AutoPull`
- File description: `Repo AutoPull`
- Original filename: `RepoAutoPull.exe`
- as-invoker CLI manifest

The generated `rsrc_windows_amd64.syso` is committed so ordinary builds do not need to download a resource compiler.

## Build on Windows

Run:

```powershell
.\build.ps1
```

The normal build reuses the committed `.syso` resource object.

If the icon or Windows metadata changes, regenerate the resource object with:

```powershell
.\build.ps1 -RefreshResources
```

Resource regeneration uses the pinned `github.com/tc-hib/go-winres@v0.3.3` tool, then the build script runs `go vet` and produces `Repo_AutoPull/RepoAutoPull.exe` for Windows x64.

The standalone EXE and script edition use the same ordered custom-command list, Git, build, launch, recovery, and notification behavior.
