# PROJECT — jig

## Goal

A public, generic harness for coding agents (Claude Code first), distributed as a Claude Code plugin
that is also its own marketplace. It gives any repo guardrails, a verification gate and project
memory, configured per repo through `.claude/harness.json`.

## Context and origin

Born from professionalizing an internal document-processing backend, where the rules ("never write to prod", "run
the regression test before calling a change done", "keep `.okf/` updated") existed only as text in
`CLAUDE.md`. The same rules apply to dozens of other repos with a similar stack, and almost none enforce them.

Prior art reviewed (2026-10-30):

- **Superpowers** (obra): 14 method skills + one SessionStart hook. Strong methodology and evals of
  skills, but enforcement is prompt-only.
- **rsc-harness** (Eric Risco, MIT): memory/hands/trade/reflexes, three lanes (answer, FTD, SDD),
  hooks in Claude Code, refuting reviewers. Too large to install as is (269 skills), auto-updates from
  npm each session and grants `git commit`/`git push` without asking.
- **rsc-factory** (gregoryjp, unofficial): a PRD-to-product engine outside the agent. Out of scope;
  useful later for a pipeline mode.

Decision: take ideas, not code; keep `jig` small, readable and enforcement-first.

## Architecture

```
jig/
├── .claude-plugin/plugin.json        plugin manifest
├── .claude-plugin/marketplace.json   the repo is its own marketplace (source "./")
├── hooks/hooks.json                  planned: guard wiring (uses ${CLAUDE_PLUGIN_ROOT})
├── scripts/                          planned: hook implementations, no dependencies
├── skills/                           planned: method skills (ftd, verify, review)
├── agents/                           planned: reviewers + finding verifier
└── templates/harness.json            per-repo contract example
```

### Per-repo contract: `.claude/harness.json`

| Field | Meaning |
|---|---|
| `profile` | `minimal`, `service` or `product`: which components apply |
| `trunk` | Protected branch name |
| `verify` | Commands that must pass before the agent stops after code changes |
| `prod_guards.mcp_servers` | MCP servers treated as production (writes blocked) |
| `prod_guards.command_patterns` | Shell patterns treated as production (blocked or confirmed) |
| `knowledge` | Path of the OKF knowledge bundle |

## Technical decisions

- **Hooks in Node or POSIX shell, zero dependencies.** They run on every tool call; startup cost and
  supply-chain risk must stay minimal.
- **Fail open on internal errors** (a broken hook must never brick the shell), **fail closed on
  matched production writes**.
- **No network, no auto-update, no git permissions granted.** Updates come only through the
  marketplace.
- **Knowledge format: OKF**, so the bundle is readable by humans, agents and other tools.

## Phases

1. **Prove in a real repo** (the document-processing backend): implement the hooks in that repo's `.claude/`, reading
   `harness.json`. Verify with real sessions.
2. **Second and third repo**: a web product (front + back) and a small service, to find what
   does not generalize.
3. **Move into jig**: hooks, scripts and templates; the first repo switches to the plugin.
4. **Method skills + reviewers**: `ftd`, `verify`, `review`, finding verifier.
5. **`jig doctor`** and an optional private pack for Edvantage-specific checks (observability,
   backups, secrets manager) that stays outside this public repo.
