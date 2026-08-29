package main

import (
    _ "embed"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
)

//go:embed embedded.ps1
var embeddedScript []byte

func main() {
    exePath, err := os.Executable()
    if err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: could not determine executable path:", err)
        os.Exit(1)
    }
    exeDir := filepath.Dir(exePath)

    appData := os.Getenv("APPDATA")
    if appData == "" {
        if cfg, cfgErr := os.UserConfigDir(); cfgErr == nil {
            appData = cfg
        }
    }
    if appData == "" {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: APPDATA is unavailable.")
        os.Exit(1)
    }

    configRoot := filepath.Join(appData, "RepoAutoPull")
    if err := os.MkdirAll(configRoot, 0o755); err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: could not create config folder:", err)
        os.Exit(1)
    }

    tempRoot, err := os.MkdirTemp("", "RepoAutoPull-")
    if err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: could not create temporary folder:", err)
        os.Exit(1)
    }
    defer os.RemoveAll(tempRoot)

    scriptPath := filepath.Join(tempRoot, "Repo-AutoPull.ps1")
    if err := os.WriteFile(scriptPath, embeddedScript, 0o600); err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: could not prepare embedded script:", err)
        os.Exit(1)
    }

    args := []string{"-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath}
    args = append(args, os.Args[1:]...)

    cmd := exec.Command("powershell.exe", args...)
    cmd.Stdin = os.Stdin
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr
    cmd.Dir = exeDir

    env := os.Environ()
    env = append(env, "REPO_AUTOPULL_CONFIG_ROOT="+configRoot)
    adjacentConfig := filepath.Join(exeDir, "Repo-AutoPull.config.json")
    if _, statErr := os.Stat(adjacentConfig); statErr == nil {
        env = append(env, "REPO_AUTOPULL_IMPORT_CONFIG="+adjacentConfig)
    }
    cmd.Env = env

    if err := cmd.Run(); err != nil {
        if exitErr, ok := err.(*exec.ExitError); ok {
            os.Exit(exitErr.ExitCode())
        }
        fmt.Fprintln(os.Stderr, "Repo AutoPull: failed to launch Windows PowerShell:", err)
        os.Exit(1)
    }
}
