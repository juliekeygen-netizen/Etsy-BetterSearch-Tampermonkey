package main

import (
    _ "embed"
    "fmt"
    "io"
    "os"
    "os/exec"
    "path/filepath"
)

const (
    portableConfigName = "RepoAutoPull.config.json"
    legacyConfigName   = "Repo-AutoPull.config.json"
)

//go:embed embedded.ps1
var embeddedScript []byte

func fileExists(path string) bool {
    info, err := os.Stat(path)
    return err == nil && !info.IsDir()
}

func copyFile(src, dst string) error {
    in, err := os.Open(src)
    if err != nil {
        return err
    }
    defer in.Close()

    out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
    if err != nil {
        return err
    }
    ok := false
    defer func() {
        _ = out.Close()
        if !ok {
            _ = os.Remove(dst)
        }
    }()

    if _, err := io.Copy(out, in); err != nil {
        return err
    }
    if err := out.Sync(); err != nil {
        return err
    }
    if err := out.Close(); err != nil {
        return err
    }
    ok = true
    return nil
}

func configCandidates(exeDir string) []string {
    candidates := []string{
        filepath.Join(exeDir, legacyConfigName),
    }

    appData := os.Getenv("APPDATA")
    if appData == "" {
        if cfg, err := os.UserConfigDir(); err == nil {
            appData = cfg
        }
    }
    if appData != "" {
        candidates = append(candidates, filepath.Join(appData, "RepoAutoPull", legacyConfigName))
    }
    return candidates
}

func ensurePortableConfig(exeDir string) (string, error) {
    configPath := filepath.Join(exeDir, portableConfigName)

    // Repo AutoPull must remain portable. Refuse to silently fall back to a
    // shared profile when the EXE folder cannot be written.
    probe, err := os.CreateTemp(exeDir, ".repoautopull-write-test-*")
    if err != nil {
        return "", fmt.Errorf("the folder containing RepoAutoPull.exe is not writable (%s). Move/copy the EXE to a writable folder: %w", exeDir, err)
    }
    probePath := probe.Name()
    _ = probe.Close()
    _ = os.Remove(probePath)

    if fileExists(configPath) {
        return configPath, nil
    }

    for _, legacyPath := range configCandidates(exeDir) {
        if !fileExists(legacyPath) {
            continue
        }
        if err := copyFile(legacyPath, configPath); err != nil {
            return "", fmt.Errorf("could not migrate legacy configuration from %s: %w", legacyPath, err)
        }
        fmt.Printf("Repo AutoPull: migrated configuration to %s\n", configPath)
        return configPath, nil
    }

    return configPath, nil
}

func main() {
    exePath, err := os.Executable()
    if err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull: could not determine executable path:", err)
        os.Exit(1)
    }
    exeDir := filepath.Dir(exePath)

    configPath, err := ensurePortableConfig(exeDir)
    if err != nil {
        fmt.Fprintln(os.Stderr, "Repo AutoPull:", err)
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
    env = append(env,
        "REPO_AUTOPULL_CONFIG_ROOT="+exeDir,
        "REPO_AUTOPULL_CONFIG_PATH="+configPath,
    )
    cmd.Env = env

    if err := cmd.Run(); err != nil {
        if exitErr, ok := err.(*exec.ExitError); ok {
            os.Exit(exitErr.ExitCode())
        }
        fmt.Fprintln(os.Stderr, "Repo AutoPull: failed to launch Windows PowerShell:", err)
        os.Exit(1)
    }
}
