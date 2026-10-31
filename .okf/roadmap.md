---
type: Plan
title: Roadmap
description: Phases from proving jig in a real repo to the doctor command.
tags: [roadmap]
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-10-31T12:00:00Z'
---

Order changed on 2026-10-30: build the generic structure in jig first, then prove it in real repos.

1. **Core + first guard** (done): dispatcher, config, schema, `brief`, `danger`, tests, CI.
2. **Features + okf feature + /jig:init** (done 2026-10-31): per-repo features, OKF pack, okf-index/okf-upkeep, CLI.
3. **`prod` and `secrets` guards**, driven by harness.json (MCP tools writing to production, shell
   patterns, secrets in staged files).
4. **`verify` Stop gate** (code changed and not verified).
5. **`jig doctor`**: audit a repo against its features.
6. **Method skills and reviewers**: `ftd`, `verify`, `review`, finding verifier.

After each increment, the plugin is tried in real repos of different shapes; the
[contract](architecture/harness-contract.md) is frozen once three of them run it.
