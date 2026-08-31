# Codex project-context file index

Use these files together:

| File | Role | Update frequency |
|---|---|---|
| `AGENTS.md` | Stable coding-agent rules, project invariants, Git/release/test workflow | Rare; only when durable working rules change |
| `ACTIVE_WORK.md` | Highest-priority currently open branches/PRs, exact heads/CI, collision/release coordination | Update whenever in-flight work changes materially |
| `PROJECT_STATE.md` | Merged release baseline, closed/live findings, architecture status, roadmap | Update whenever a coherent task changes durable project state |
| `CODEX_HANDOFF.md` | Exact review packet for the latest coherent Codex task branch | Rewrite on every task branch before handoff |
| `docs/CODEX_NEXT_WORK_PLAN.md` | Long autonomous work sequence and candidate audit areas | Update when priorities materially change |
| `docs/CODEX_DESKTOP_SETUP.md` | Local repository/Codex Desktop setup and merged-vs-unmerged Git explanation | Rare |
| `docs/CODEX_INITIAL_PROMPT.md` | Ready-to-paste long autonomous first prompt, including active PR reconciliation | Update when workflow/priority contract changes |
| `docs/CODEX_HANDOFF_SETUP_2026-08-31.md` | Historical record of the ChatGPT → Codex workflow transition | Historical; correct factual errors if discovered during setup |

Recommended read order for a new Codex task:

```text
AGENTS.md
ACTIVE_WORK.md
PROJECT_STATE.md
CODEX_HANDOFF.md
docs/CODEX_NEXT_WORK_PLAN.md
```

`ACTIVE_WORK.md` has higher temporal priority than older roadmap prose for currently open branches/PRs. Source code, tests, current Git/PR state, CI, and verified browser evidence remain authoritative when documentation is stale.
