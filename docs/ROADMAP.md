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
| Portable vault | Implemented foundation with typed records, human-readable files, and validated import/export. |
| Tests | Unit tests for schemas, store, workspace guard, and onboarding. |

Not production-hardened yet.

## Next Architecture Milestone: Portable Project Vault

The [research requirements](PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md)
establish model-independent project memory as the next design priority. Current
governed runtime state remains under
`.project-ananke/almanac/`; the planned `.mnemosyne/` vault is a separate,
human-readable, version-controlled portability layer.

Foundation completed:

- Define schema-versioned `.mnemosyne/` metadata and stable record IDs.
- Store human-readable records in controlled, scope-specific directories.
- Enforce project-truth, task-state, and agent-performance boundaries.
- Support validated local export/import without a raw filesystem MCP tool.

Remaining outcomes:

- Add record kinds and fields for requirements, constraints, task state,
  generated outputs, external references, observations, evidence, scope,
  ownership, validity periods, contradiction links, and access classification.
- Keep project truth, temporary task state, and advisory agent-performance
  memory distinct; temporary state must not silently become project truth.
- Generate reproducible, token-budgeted, source-linked, stale-aware restart
  packs for task continuation across models and interfaces.
- Extend conflict handling with explicit resolution while retaining both sources
  and historical decisions.
- Support sensitive-record classification, redaction, auditable corrections and
  deletes, optional encryption, and confirmed-only ingestion of ambiguous voice
  records.

Validation must cover cross-agent vault migration, import/export compatibility,
restart-pack reproducibility, and the rule that no raw filesystem access is
added to the agent-facing MCP surface.

## Build Milestones

| Milestone | Status |
| --- | --- |
| 1. Core Types | Implemented. |
| 2. Almanac Store | Implemented MVP with SQLite. |
| 3. Workspace Guard | Implemented MVP with audit hooks. |
| 4. Onboarding Engine | Implemented MVP scanner and memory extractor. |
| 5. Reliability Engine | Implemented MVP with revalidation assessment. |
| 6. Retrieval Engine | Implemented MVP with task-aware context packs. |
| 7. Conflict Engine | Implemented MVP with auditable structured conflict detection. |
| 8. MCP Server | Implemented MVP with a governed, transport-neutral tool surface. |
| 9. Ananke Adapter | Implemented MVP with auditable safety notifications. |
| 10. Portable Project Vault | Implemented foundation; restart packs and runtime/CLI integration remain. |

## Completed Milestone: Conflict Engine

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
2. Add testbench scenarios for Mnemosyne quick validation. Implemented MVP.
3. Generate local JSON validation reports. Implemented MVP.
4. Add CSV export once the JSON shape stabilizes. Implemented MVP.
5. Add restart-pack generation and portable-vault runtime/CLI integration; portable-vault migration tests are implemented.
6. Add demo command that proves init, onboard, store, recall, context, conflict, score, decay, and audit.
7. Add user-approved anonymised GitHub report generation.
8. Add combined Ananke/Mnemosyne compatibility tests after both runtimes expose stable runnable surfaces.

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

The need should emerge from real Ananke, Mnemosyne, Runtime Contracts, and Moirae Code integration work.
