---
type: Plan
title: Roadmap
description: Phases from proving jig in a real repo to the doctor command.
tags: [roadmap]
generated:
  by: process:okf-migrate
  at: '2026-10-30T16:00:00Z'
---

Order changed on 2026-10-30: build the generic structure in jig first, then prove it in real repos.

1. **Core + first guard** (done): dispatcher, config, schema, `brief`, `danger`, tests, CI.
2. **`prod` and `secrets` guards**, driven by harness.json (MCP tools writing to production, shell
   patterns, secrets in staged files).
3. **Session state + Stop gates**: `verify` (code changed and not verified) and `knowledge`.
4. **`/jig:init` and `jig doctor`**: detect the stack, write harness.json with a profile, audit a repo.
5. **Method skills and reviewers**: `ftd`, `verify`, `review`, finding verifier.

After each increment, the plugin is tried in real repos of different shapes; the
[contract](architecture/harness-contract.md) is frozen once three of them run it.
