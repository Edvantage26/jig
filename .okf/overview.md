---
type: Overview
title: jig overview
description: What jig is, the four pieces of a harness, and what exists today.
tags: [overview, harness]
timestamp: '2026-10-30T12:00:00Z'
---

# What it is

A *jig* is the woodworking guide that holds the piece and leads the tool so every cut comes out the
same. `jig` does that for coding agents (Claude Code first): guardrails that hold even when the agent
forgets a rule, a verification gate before the agent calls work done, and project memory that lives
in the repo.

# The four pieces

| Piece | What | Lives in |
|---|---|---|
| Memory | Project knowledge, as an OKF bundle (`.okf/`) | The repo |
| Hands | Tools (CLIs, MCP servers) with a connection test | The repo |
| Trade | Skills: method (generic) and domain (project) | Method in jig, domain in the repo |
| Reflexes | Hooks that enforce rules | jig |

The frame is generic; each repo describes itself in `.claude/harness.json`
(see [contract](architecture/harness-contract.md)).

# Status

v0.1.0 (2026-10-30): manifests, README, spec and the contract template. No hooks or skills yet;
they are proven in a real project first (see [roadmap](roadmap.md)).

# Code map

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`: see [plugin layout](architecture/plugin-layout.md).
- `templates/harness.json`: example of the per-repo contract.
- [PROJECT.md](https://github.com/Edvantage26/jig/blob/main/PROJECT.md): full spec.
