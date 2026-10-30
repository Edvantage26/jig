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
├── hooks/hooks.json                  every event -> node bin/jig-hook.mjs <Event>
├── bin/jig-hook.mjs                  single entry point (stdin JSON in, decision JSON out, exit 0)
├── src/core/                         dispatcher, config, registry, hook-io, shell-parse
├── src/context/                      SessionStart modules (brief)
├── src/guards/                       PreToolUse modules (danger; planned: prod, secrets)
├── src/gates/                        planned: Stop modules (verify, knowledge)
├── schema/harness.schema.json        contract for editors
├── templates/harness.json            contract example
├── skills/  agents/  commands/       planned
└── test/                             node:test suite, run in CI on Node 18/20/22
```

Module contract: `{ id, event, profiles, description, toolNames?, run(context) -> decision }`.
Decisions: `allow`, `ask`, `deny`, `block` (Stop), `context` (SessionStart). Detail in
`.okf/architecture/hook-runtime.md`.

### Per-repo contract: `.claude/harness.json`

| Field | Meaning |
|---|---|
| `version` | Contract version (`1`) |
| `profile` | `minimal`, `service` or `product`: which modules run by default |
| `trunk` | Protected branch name |
| `verify` | Commands that must pass before the agent calls a change done |
| `knowledge` | Path of the OKF knowledge bundle |
| `modules.<id>` | `true`/`false`, or an options object for that module |

## Technical decisions

- **Hooks in Node or POSIX shell, zero dependencies.** They run on every tool call; startup cost and
  supply-chain risk must stay minimal.
- **Fail open on internal errors** (a broken hook must never brick the shell), **fail closed on
  matched production writes**.
- **No network, no auto-update, no git permissions granted.** Updates come only through the
  marketplace.
- **Knowledge format: OKF**, so the bundle is readable by humans, agents and other tools.

## Phases

1. **Core + first guard** (done 2026-10-30): dispatcher, config, schema, `brief`, `danger`, tests, CI,
   verified in real Claude Code sessions.
2. **`prod` and `secrets` guards.**
3. **Session state + Stop gates**: `verify`, `knowledge`.
4. **`/jig:init` and `jig doctor`.**
5. **Method skills + reviewers**: `ftd`, `verify`, `review`, finding verifier.

After each increment the plugin is tried in real repos of different shapes (a document-processing
backend, a web product, a small service). The contract is frozen once three of them run it. An
optional private pack for company-specific checks stays outside this public repo.
