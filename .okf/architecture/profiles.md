---
type: Architecture
title: Profiles
description: Which jig components apply to each kind of repo.
tags: [profiles]
timestamp: '2026-10-30T12:00:00Z'
---

| Profile | Components | For |
|---|---|---|
| `minimal` | Guardrails + knowledge memory | Small sites, scripts |
| `service` | + verification gate, CI checks | Backends, APIs |
| `product` | + work lanes (fast change / spec-driven) and adversarial review | Products |

Principle: friction proportional to risk. A harness that annoys on the harmless 80% gets turned off
and then protects nothing.
