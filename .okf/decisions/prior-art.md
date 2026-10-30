---
type: Decision
title: Prior art - take ideas, not code
description: What was reviewed before designing jig and what was taken from each.
tags: [decision, prior-art]
generated:
  by: process:okf-migrate
  at: '2026-10-30T12:00:00Z'
---

Reviewed on 2026-10-30 by reading the repositories.

| Project | What it is | Taken | Left out |
|---|---|---|---|
| [Superpowers](https://github.com/obra/superpowers) v7.0.1 | 14 method skills + one SessionStart hook | Verification before completion, fresh implementer + separate reviewer, "red flags" tables against rationalization, evals of skills | Enforcement is prompt-only; forced brainstorming on every task |
| [rsc-harness](https://github.com/ericrisco/rsc-harness) v3.6.0 (MIT) | Meta-harness: memory/hands/trade/reflexes, lanes answer/FTD/SDD, hooks, 269 skills | The four pieces, lanes, tools with connection tests, refuting finding-verifier, OKF as memory | Auto-update from npm every session, grants `git commit`/`git push` without asking, ~56k lines of skills |
| [rsc-factory](https://github.com/gregoryjp/rsc-factory) (unofficial) | PRD-to-product engine outside the agent | Risk classifier idea (auto vs human PR) for a future pipeline mode | Whole engine: out of scope |

No code is copied at this stage; if any is, it keeps its MIT notice and attribution.
