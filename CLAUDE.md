# CLAUDE.md

`jig` is a **public** Claude Code plugin (and its own marketplace) that gives any repo guardrails, a
verification gate and project memory, configured per repo with `.claude/harness.json`. Full spec and
phases in [PROJECT.md](PROJECT.md).

## Knowledge (OKF)

Read `.okf/index.md` first and follow the links to the relevant concepts. After a change that affects
a documented asset (contract, hook, decision, roadmap), update its concept body and `timestamp`, and
add a dated entry to `.okf/log.md`. Validate with the OKF validator in `--strict` mode.

## Rules for this repo

- **Public repo**: never commit secrets, internal hostnames, client names or Edvantage-specific
  infrastructure. Those belong in a private pack, not here.
- **Hooks**: plain Node or POSIX shell, zero dependencies, no network calls. Fail open on internal
  errors; fail closed only on matched production writes.
- **Never grant the agent git permissions** (commit/push) from the plugin.
- Components are proven in a real project (an internal document-processing backend first) before landing here.
- Keep `.claude-plugin/plugin.json` and `marketplace.json` versions in sync; tag releases.
- README describes only what exists; anything not built yet is marked *planned*.

## Layout

- `.claude-plugin/` manifests
- `hooks/`, `scripts/`, `skills/`, `agents/` (planned)
- `templates/harness.json` per-repo contract example
