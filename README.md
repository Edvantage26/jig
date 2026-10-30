# jig

**The jig for your coding agent: same cut, every time.**

In woodworking, a *jig* is the guide that holds the piece and leads the tool, so every cut comes out
the same no matter who makes it. `jig` does that for coding agents (Claude Code first): it holds the
repo in place with guardrails, makes the agent prove its work before calling it done, and keeps what
it learns in the repo instead of in a chat that disappears.

> **Status: early (v0.1.0).** The hook runtime, the session brief and the `danger` guard work and are
> tested. Everything marked *planned* does not exist yet.

## Why

Agents are good at writing code and bad at three things:

1. **Remembering.** Every session starts from zero, so they guess, and a plausible guess is worse
   than an obvious error.
2. **Respecting rules.** A rule written in `CLAUDE.md` is a suggestion. The agent can forget it
   mid-session.
3. **Proving they are done.** "It should work now" is not evidence.

Hand-made fixes end up as a pile of loose skills, hooks and instructions with no owner. `jig` gives
that pile a fixed shape.

## The shape: four pieces

| Piece | What it is | Where it lives |
|---|---|---|
| **Memory** | Project knowledge the agent reads before working and updates after | The repo, as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) bundle (`.okf/`) |
| **Hands** | Tools the agent can use (CLIs, MCP servers), each with a connection test | The repo |
| **Trade** | Skills: how work is done (method) and what the domain needs (project) | Method in `jig`, domain in the repo |
| **Reflexes** | Hooks that enforce rules even when the agent forgets them | `jig` |

## Generic frame, project content

`jig` is generic because it only ships the frame. Each repo describes itself in one file,
`.claude/harness.json`, and the same hooks behave correctly everywhere:

```json
{
  "$schema": "https://raw.githubusercontent.com/Edvantage26/jig/main/schema/harness.schema.json",
  "version": 1,
  "profile": "service",
  "trunk": "main",
  "verify": ["npm test"],
  "knowledge": ".okf",
  "modules": {
    "danger": { "ignore_rules": [] }
  }
}
```

Without this file jig stays inactive. If the file is invalid, jig stays inactive and tells the agent
why at session start.

| Level | Examples | Lives in |
|---|---|---|
| Generic as is | Destructive-command guard, no `--no-verify`, secret scan, "verify before done" | `jig` |
| Generic with config | Verification command, what counts as production, trunk branch | `jig` + `harness.json` |
| Specific | Knowledge, domain skills, MCP servers | The repo |

### Profiles

Not every repo needs the same weight.

- `minimal`: guardrails + knowledge memory. For small sites and scripts.
- `service`: + verification gate and CI checks. For backends and APIs.
- `product`: + work lanes (fast change vs. spec-driven) and adversarial review. For products.

## Components

| Component | Event | Status |
|---|---|---|
| `brief`: tells the agent at session start which harness runs here | SessionStart | works |
| `danger`: confirms or refuses commands that destroy work or data (`git reset --hard`, force push, `rm -rf`, `--no-verify`, `DROP TABLE`...) | PreToolUse | works |
| `prod`: blocks writes to production resources declared in `harness.json` | PreToolUse | planned |
| `secrets`: refuses committing secrets | PreToolUse | planned |
| `verify-gate`: no "done" after code changes without running `verify` | Stop | planned |
| `knowledge-guard`: asks to update the knowledge bundle after relevant changes | Stop | planned |
| `/jig:init`, `jig doctor`: configure and audit a repo | command | planned |
| Skills `ftd`, `verify`, `review` and a finding verifier | skills | planned |

### How it works

Every hook event calls one entry point, `bin/jig-hook.mjs`. It loads `.claude/harness.json`, runs the
modules enabled for that event and profile, and combines their decisions (refuse > ask > allow).
A module is one file with `{ id, event, profiles, run() }`; adding one does not touch the hook
wiring. Internal errors never block the agent; a matched rule does.

Requirements: Node 18 or later.

## Development

```bash
npm test                                  # node:test, no dependencies
claude --plugin-dir . -p "..."            # try the plugin in a real session without installing it
claude plugin validate .
```

## Principles

- **Mechanisms over prompts.** If a rule matters, a hook enforces it.
- **Friction proportional to risk.** Silence for the trivial, ceremony only where failure is
  expensive.
- **Evidence before claims.** Work is done when a command shows it, not when the agent says so.
- **No surprises on your machine.** Hooks are plain, readable scripts. No network calls, no
  auto-update, and no permission to commit or push on your behalf.

## Install

```text
/plugin marketplace add Edvantage26/jig
/plugin install jig@jig
```

To offer it to everyone who clones a project, commit this in the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "jig": { "source": { "source": "github", "repo": "Edvantage26/jig" } }
  },
  "enabledPlugins": { "jig@jig": true }
}
```

## Credits

The design draws on ideas from [Superpowers](https://github.com/obra/superpowers) (methodology as
skills, verification before completion) and [rsc-harness](https://github.com/ericrisco/rsc-harness)
(memory/hands/trade/reflexes, work lanes, refuting reviewers). Both are MIT licensed. No code from
them is included at this stage.

## License

[MIT](LICENSE)
