---
type: Component
title: okf feature
description: Project knowledge in an OKF bundle - index at session start, upkeep reminder at stop, OKF toolkit skills.
tags: [okf, knowledge, hooks, skills]
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-10-31T16:30:00Z'
sources:
  - id: okf-index
    resource: src/okf/okf-index.mjs
    title: SessionStart module
  - id: okf-upkeep
    resource: src/okf/okf-upkeep.mjs
    title: Stop module
  - id: okf-bundle
    resource: src/okf/okf-bundle.mjs
    title: Shared bundle helpers and maintenance rules
---

# What it does

- **okf-index (SessionStart):** reads `<knowledge>/index.md` (default `.okf`), injects it (up to
  12,000 characters) with the maintenance rules, and records the HEAD at session start in the
  session state. Without a bundle it suggests creating one with `/jig:okf`.
- **okf-upkeep (Stop):** blocks finishing when the session left knowledge newer than the last
  bundle update: repo files changed since the session's base HEAD (tracked diff + untracked)
  modified after the newest bundle file, or project memories (`~/.claude/projects/<path>/memory/*.md`,
  not `MEMORY.md`) written in the session. Asks once per set of pending changes (fingerprint in the
  session state). `.claude/settings.json`, `settings.local.json` and `harness.json` never count.
  `stop_hook_active` never blocks.
- **Rules given to the agent:** update the concept and `generated: { by: claude-code/<model>, at }`
  with the real current UTC time; `log.md` only for lifecycle events; validate with `/jig:validate`
  and fix errors. On a v0.1 bundle: legacy warnings are expected, the agent must not migrate the
  bundle, and in each concept it edits it replaces `timestamp` with `generated`.
- **Field test (2026-10-31, copy of a real v0.1 bundle):** after a code change the agent updated the
  right concept and left `log.md` alone, but kept `timestamp` next to `generated`, invented the time
  and skipped `/jig:validate`; the first two led to the stricter rules above. Running the validator
  from the Stop hook itself is a planned improvement.

# Skills and agents

From the [OKF pack](/packs/okf-pack.md): `/jig:okf`, `/jig:validate`, `/jig:visualize`,
`/jig:backfill`, and the agents `bundle-weaver` and `event-analyzer`.

# Coexistence with a standalone OKF setup

A machine may already have a standalone `okf@...` plugin and a global OKF guard hook. In a repo set
up with `jig init` and `okf` on, the standalone plugin is disabled in the personal
`.claude/settings.local.json` (no duplicate skills, nothing committed), and a guard hook should skip repos that have `.claude/harness.json`. Verified in
a real session on 2026-10-31: only `jig:*` skills listed, a single upkeep reminder.

# State

`${CLAUDE_PLUGIN_DATA}/state` (else `~/.cache/jig`), files `<session>-<hash(project)>.base` and
`.reminded`, removed after 7 days.
