---
type: Plan
title: Roadmap
description: Phases from proving jig in a real repo to the doctor command.
tags: [roadmap]
timestamp: '2026-10-30T12:00:00Z'
---

1. **Prove in a real repo** (a document-processing backend): hooks in its `.claude/`
   reading `harness.json`, verified in real sessions.
2. **Two more repos** of different shape (a web product, a small service) to find what does not
   generalize. Then freeze the [contract](architecture/harness-contract.md).
3. **Move into jig**: hooks, scripts, templates; the source repo switches to the plugin.
4. **Method skills and reviewers**: `ftd`, `verify`, `review`, finding verifier.
5. **`jig doctor`**: audit a repo against its [profile](architecture/profiles.md); optional private
   pack for company-specific checks.
