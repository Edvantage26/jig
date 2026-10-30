# jig

**The jig for your coding agent: same cut, every time.**

In woodworking, a *jig* is the guide that holds the piece and leads the tool, so every cut comes out
the same no matter who makes it. `jig` does that for coding agents (Claude Code first): it holds the
repo in place with guardrails, makes the agent prove its work before calling it done, and keeps what
it learns in the repo instead of in a chat that disappears.

> **Status: early design (v0.1.0).** This repository contains the structure and the contract. The
> hooks and skills are being built and proven on real projects before they land here. Nothing below
> marked *planned* exists yet.

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
  "profile": "service",
  "trunk": "main",
  "verify": ["ruff check .", "pytest -q"],
  "prod_guards": { "mcp_servers": ["postgres-prod"], "command_patterns": ["DB_ENV=prod"] },
  "knowledge": ".okf"
}
```

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

## Planned components

- **Hooks**: `danger-guard` (confirm destructive commands), `prod-guard` (block writes to production
  resources declared in `harness.json`), `verify-gate` (run the `verify` commands before the agent
  stops), `knowledge-guard` (ask the agent to update the knowledge bundle after relevant changes).
- **Skills**: `ftd` (one short feature document with evidence, for ordinary changes), `verify`,
  `review` (independent reviewers plus a verifier that tries to refute each finding).
- **`jig doctor`**: audit a repo against its profile (knowledge bundle valid, CI present, tests,
  secrets committed, guards wired).

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
