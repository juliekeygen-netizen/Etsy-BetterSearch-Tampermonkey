# RepoAutoPull standalone EXE wrapper

`RepoAutoPull.exe` is a small Go wrapper around the canonical `Repo_AutoPull/Repo-AutoPull.ps1` implementation.

The wrapper embeds the PowerShell implementation into the executable, writes it to a temporary directory while running, and launches Windows PowerShell in the same console. Persistent settings are redirected to `%APPDATA%\RepoAutoPull`, so the distributed EXE remains a true single-file tool.

Build on Windows with Go installed:

```powershell
.\build.ps1
```

The build script copies the canonical PowerShell implementation to a temporary `embedded.ps1`, builds a Windows x64 single executable, then removes the temporary embedded source. Output goes to `Repo_AutoPull\Standalone\RepoAutoPull.exe` and is ignored by Git because repository-wide `*.exe` artifacts are ignored.
