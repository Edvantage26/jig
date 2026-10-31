---
type: Component
title: /jig:init and the jig CLI
description: Sets up jig in a repo - asks the features, writes harness.json and settings.json deterministically.
tags: [init, cli, setup]
generated:
  by: claude-code/claude-opus-5-5
  at: '2026-10-31T12:00:00Z'
sources:
  - id: setup-repo
    resource: src/cli/setup-repo.mjs
    title: Setup logic
  - id: cli
    resource: bin/jig
    title: CLI entry point
  - id: skill
    resource: skills/init/SKILL.md
    title: /jig:init skill
---

- **CLI `jig`** (`bin/`, on the Bash PATH while the plugin is enabled):
  - `jig status [--json]`: repo root, harness present, trunk, knowledge path and bundle, features.
  - `jig init --features okf,danger [--verify "<cmd>" ...] [--knowledge <path>] [--json]`.
- **What init writes**, merging with existing files:
  - `.claude/harness.json`: `features` (every selectable feature, true/false), `trunk` (kept, else
    detected: origin/HEAD, then main/master, then current branch), `verify`, `knowledge`; other
    fields and `modules` are kept. The result is validated before writing.
  - `.claude/settings.json`: `extraKnownMarketplaces.jig` (github `Edvantage26/jig`) and
    `enabledPlugins["jig@jig"] = true`; with `okf` on, every enabled user-level `okf@...` plugin
    is set to `false` for this repo.
- **Skill `/jig:init`**: runs `jig status`, asks the features with a multi-select, runs
  `jig init`, offers `/jig:okf` when there is no bundle, and tells the person to commit and restart.
  It never commits.
