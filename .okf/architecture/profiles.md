---
type: Architecture
title: Profiles
description: Which jig components apply to each kind of repo.
tags: [profiles]
status: deprecated
generated:
  by: process:okf-migrate
  at: '2026-10-30T12:00:00Z'
---

> Deprecated on 2026-10-31: replaced by [features](features.md). Kept for history.

| Profile | Components | For |
|---|---|---|
| `minimal` | Guardrails + knowledge memory | Small sites, scripts |
| `service` | + verification gate, CI checks | Backends, APIs |
| `product` | + work lanes (fast change / spec-driven) and adversarial review | Products |

Principle: friction proportional to risk. A harness that annoys on the harmless 80% gets turned off
and then protects nothing.
