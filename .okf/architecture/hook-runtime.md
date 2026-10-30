---
type: Architecture
title: Hook runtime (dispatcher and modules)
description: One entry point per hook event that loads harness.json and runs the enabled modules.
tags: [hooks, runtime, modules]
timestamp: '2026-10-30T16:00:00Z'
---

# Flow

`hooks/hooks.json` wires every event to the same command:
`node "${CLAUDE_PLUGIN_ROOT}/bin/jig-hook.mjs" <Event>`.

1. `bin/jig-hook.mjs` reads the hook input JSON from stdin. Always exits 0.
2. `src/core/dispatcher.mjs` resolves the project root (`CLAUDE_PROJECT_DIR`, else input `cwd`) and
   loads `.claude/harness.json` with `src/core/config.mjs`.
   - Missing: jig is inactive; only a one-line note at SessionStart.
   - Invalid: inactive; SessionStart tells the agent why.
3. It picks the modules for the event (`src/core/registry.mjs`), filtered by profile, per-repo
   switches and `toolNames`, and runs each one.
4. `src/core/hook-io.mjs` combines decisions (deny/block > ask > context > allow) and prints the
   JSON each event expects (PreToolUse `permissionDecision`, Stop `decision: block`,
   SessionStart `additionalContext`).

# Module contract

`{ id, event, profiles, description, toolNames?, run(moduleContext) -> decision }`, where
`moduleContext` has `hookInput`, `config`, `projectRoot`, `enabledModules` and `moduleOptions`
(`modules.<id>` from harness.json minus `enabled`). Decisions: `allow`, `ask`, `deny`, `block`,
`context`. A reason always says how to carry on.

Adding a module = one file + one line in the registry + its entry in the schema
(`test/config.test.mjs` fails if the schema and the registry disagree).

# Failure policy

A module that throws is reported on stderr (visible in verbose mode) and skipped; the others still
decide. Garbage input makes the entry point exit 0 with no output.

# Current modules

| Module | Event | Profiles |
|---|---|---|
| `brief` | SessionStart | all |
| `danger` | PreToolUse (Bash) | all |

See [danger guard](/guards/danger.md).

# Verified

- `npm test`: 65 tests (parser, rules, config, dispatcher, entry point, manifests).
- Real Claude Code sessions with `--plugin-dir` (2026-10-30): SessionStart brief injected;
  `git reset --hard` stopped by `ask` (headless = refused, work kept); `git commit --no-verify`
  refused by `deny`. Headless `claude -p` on the dev server needs the account wrapper for auth.
