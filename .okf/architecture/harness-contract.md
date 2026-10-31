---
type: Configuration
title: jig.json contract
description: The per-repo file that makes generic hooks behave correctly in each project.
tags: [config, contract, hooks]
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-10-31T12:00:00Z'
---

Each repo commits `.claude/jig.json` (template in `templates/jig.json`).

| Field | Meaning |
|---|---|
| `version` | Contract version, currently `1` |
| `features.<id>` | `true`/`false` per [feature](features.md); omitted features use their default (`okf`, `danger`: on) |
| `trunk` | Protected branch name; default `main` |
| `verify` | Commands that must pass before the agent calls a change done |
| `knowledge` | Path of the OKF bundle; default `.okf` |
| `modules.<id>` | `true`/`false` to force a module on/off, or an options object (with optional `enabled`) |

Schema: `schema/jig.schema.json` (for editors). Validation at runtime is hand-written in
`src/core/config.mjs`; unknown fields or modules make the file invalid and jig inactive.

Three levels of genericity:

- **Generic as is**: destructive-command guard, no `--no-verify`, secret scan, verify-before-done.
- **Generic with config**: everything driven by the fields above.
- **Specific**: knowledge, domain skills and MCP servers stay in the repo, never in jig.

The contract is still a draft; it is fixed once it works in three different repos
(see [roadmap](/roadmap.md)).
