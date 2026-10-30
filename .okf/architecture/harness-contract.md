---
type: Configuration
title: harness.json contract
description: The per-repo file that makes generic hooks behave correctly in each project.
tags: [config, contract, hooks]
timestamp: '2026-10-30T12:00:00Z'
---

Each repo commits `.claude/harness.json` (template in `templates/harness.json`).

| Field | Meaning |
|---|---|
| `profile` | `minimal`, `service` or `product` (see [profiles](profiles.md)) |
| `trunk` | Protected branch name |
| `verify` | Commands that must pass before the agent stops after code changes |
| `prod_guards.mcp_servers` | MCP servers treated as production: writes blocked |
| `prod_guards.command_patterns` | Shell patterns treated as production: blocked or confirmed |
| `knowledge` | Path of the OKF bundle |

Three levels of genericity:

- **Generic as is**: destructive-command guard, no `--no-verify`, secret scan, verify-before-done.
- **Generic with config**: everything driven by the fields above.
- **Specific**: knowledge, domain skills and MCP servers stay in the repo, never in jig.

The contract is still a draft; it is fixed once it works in three different repos
(see [roadmap](/roadmap.md)).
