# Roadmap

## Current Status

Mnemosyne is an early TypeScript-first governed memory runtime.

Implemented so far:

| Area | State |
| --- | --- |
| Repository scaffold | Ananke-compatible npm workspace. |
| Core schemas | Memory, source reference, context pack, conflict, audit, graph, and result models. |
| Almanac store | In-memory and SQLite-backed store with audit event persistence. |
| Workspace guard | Canonical path checks, symlink escape resistance, delete policy checks, and audit hooks. |
| Onboarding engine | Project scan, source hashing, source typing, candidate memory extraction, optional store persistence. |
| Reliability engine | Revalidation assessment with trust-change reasons and status transitions. |
| Retrieval engine | Task-aware context-pack ranking with warnings, conflict propagation, snippets, and token budgeting. |
| Tests | Unit tests for schemas, store, workspace guard, and onboarding. |

Not production-hardened yet.

## Build Milestones

| Milestone | Status |
| --- | --- |
| 1. Core Types | Implemented. |
| 2. Almanac Store | Implemented MVP with SQLite. |
| 3. Workspace Guard | Implemented MVP with audit hooks. |
| 4. Onboarding Engine | Implemented MVP scanner and memory extractor. |
| 5. Reliability Engine | Implemented MVP with revalidation assessment. |
| 6. Retrieval Engine | Implemented MVP with task-aware context packs. |
| 7. Conflict Engine | Next. |
| 8. MCP Server | Scaffolded only. |
| 9. Ananke Adapter | Scaffolded only. |

## Next Milestone: Conflict Engine

Conflict work should turn obvious contradictions into structured conflict records that retrieval and Ananke integration can use.

Required behavior:

- Detect source hash changes.
- Detect active memories with missing sources.
- Detect contradictory status/source combinations.
- Detect simple user-instruction-vs-law keyword conflicts.
- Detect supersession markers in ADR-like text where possible.
- Return source references and recommended resolution.
- Keep conflict output structured and auditable.

Tests should cover:

- Missing source conflicts.
- Hash change conflicts.
- User-vs-law conflicts.
- Active memory with contradicted/superseded evidence.
- Conflict recommendations.
- Retrieval warning propagation from conflicts.

## Validation Roadmap

Validation is a first-class product feature.

Planned sequence:

1. Keep unit tests passing for every package.
2. Add testbench scenarios for Mnemosyne quick validation.
3. Generate local JSON validation reports.
4. Add CSV export once the JSON shape stabilizes.
5. Add demo command that proves init, onboard, store, recall, context, conflict, score, decay, and audit.
6. Add user-approved anonymised GitHub report generation.
7. Add combined Ananke/Mnemosyne compatibility tests after both runtimes expose stable runnable surfaces.

## Ecosystem Roadmap

Mnemosyne should remain a governed memory runtime, not a gateway and not an orchestrator.

Layered ecosystem model:

```text
AI Agent
  |
MCP Gateway Layer
  |
Ananke: execution governance
  |
Mnemosyne: memory and context governance
  |
MCP Servers / project sources
```

Gateway responsibilities:

- Discovery.
- Routing.
- Identity.
- Authentication.
- Quotas.
- Traffic control.
- Observability.

Mnemosyne responsibilities:

- Provenance.
- Reliability.
- Revalidation.
- Retrieval.
- Conflict detection.
- Decay.
- Session memory.
- Source-map and project-graph maintenance.

Runtime Contracts should eventually hold stable shared contracts:

- Runtime identity.
- Protocol version.
- Capability manifests.
- Health/readiness contracts.
- Validation report schemas.
- Cross-runtime audit/event field contracts.

Runtime Contracts must not contain Mnemosyne engines, stores, scoring, retrieval, conflict detection, or persistence logic.

## Future Coordination

A future coordinator may become useful for runtime registration, capability negotiation, health, policies, and version compatibility.

Do not start that project yet.

The need should emerge from real Ananke, Mnemosyne, Runtime Contracts, and Moira integration work.
