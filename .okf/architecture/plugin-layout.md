---
type: Architecture
title: Plugin layout and distribution
description: jig is a Claude Code plugin and its own marketplace in the same repo.
tags: [plugin, marketplace, distribution]
timestamp: '2026-10-30T12:00:00Z'
---

# Layout

```
.claude-plugin/plugin.json        manifest (name, version, author, license)
.claude-plugin/marketplace.json   marketplace "jig" with one plugin, source "./"
hooks/hooks.json                  planned: guard wiring via ${CLAUDE_PLUGIN_ROOT}
scripts/                          planned: hook implementations, zero dependencies
skills/  agents/                  planned: method skills and reviewers
templates/harness.json            per-repo contract example
```

`CLAUDE.md` at the root is for developing jig; Claude Code does not load it as plugin context
(`claude plugin validate .` warns about it, which is expected).

# Install

- Per user: `/plugin marketplace add Edvantage26/jig` then `/plugin install jig@jig`.
- Per project (offered to whoever clones): commit `extraKnownMarketplaces` (github source
  `Edvantage26/jig`) and `enabledPlugins: {"jig@jig": true}` in the project's `.claude/settings.json`.

# Versioning

`plugin.json` and `marketplace.json` versions move together; releases are git tags. Validate with
`claude plugin validate .` before tagging.
