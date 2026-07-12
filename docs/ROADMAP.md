# Roadmap

## Current Status

Mnemosyne is an early TypeScript-first governed memory runtime.

Implemented so far:

| Area                    | State                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository scaffold     | Ananke-compatible npm workspace.                                                                                                                           |
| Core schemas            | Memory, source reference, context pack, conflict, audit, graph, and result models.                                                                         |
| Almanac store           | In-memory and SQLite-backed store with audit event persistence.                                                                                            |
| Workspace guard         | Canonical path checks, symlink escape resistance, delete policy checks, and audit hooks.                                                                   |
| Onboarding engine       | Project scan, source hashing, source typing, candidate memory extraction, optional store persistence.                                                      |
| Reliability engine      | Revalidation assessment with trust-change reasons and status transitions.                                                                                  |
| Retrieval engine        | Task-aware context-pack ranking with warnings, conflict propagation, snippets, and token budgeting.                                                        |
| Conflict engine         | Structured checks for missing sources, hash changes, untrusted sources, supersession, and user-law conflicts.                                              |
| MCP and Ananke adapters | Governed Almanac tool surface and outbound, audited Ananke safety notifications.                                                                           |
| Portable vault          | Implemented foundation with typed records, human-readable files, validated import/export, and Restart Packs.                                               |
| Tests                   | Package tests for schemas, stores, workspace guard, onboarding, reliability, retrieval, conflicts, adapters, vault, Restart Packs, runtime, and testbench. |

Not production-hardened yet.

## Next Architecture Milestone: Provenance-Aware Content Ingestion

The next hardening milestone is to make memory admission provenance-aware.
Covered content should not enter persistent memory unless Mnemosyne can prove
what was inspected, how much of it was emitted, whether it was truncated, and
whether Ananke permitted the memory operation.

Required outcomes:

- Require a valid Content Surface Preflight receipt for covered ingestion paths.
- Bind receipt identity to the current source hash and reject stale, missing,
  failed, unsupported, or mismatched inspection results.
- Record per-claim provenance including source hash, receipt ID, observation ID,
  Ananke decision ID, exposure level, truncation state, and source location when
  available.
- Keep runtime rules, trusted configuration, untrusted source text, derived
  observations, and normalized memory claims strictly separated.
- Treat source-controlled metadata as quoted evidence by default, never silent
  configuration or policy.
- Revalidate dependent memories when a source hash changes and preserve
  superseded history.
- Preserve source separation in multi-source summaries so quarantining one
  source only suspends dependent claims.

Validation must cover prompt-injection text, secret-bearing content, stale
receipts, hash mismatches, truncated material, mixed-trust multi-source claims,
and source mutation after inspection.

## Completed Task: Provenance Admission Design Gate

[ADR-00XX: Provenance Admission Design Gate](ADR-00XX-PROVENANCE-ADMISSION-DESIGN-GATE.md)
was accepted on `2026-07-12`. It defines the admission contract, identity rules,
preflight dependency boundary, Ananke outcome mapping, expiry behavior, audit
fields, reliability separation, and portable-vault batch behavior.

The earlier [ADR-XXXX: Provenance-Aware Content Ingestion](ADR-XXXX-mnemosyne-provenance-aware-content-ingestion.md)
remains proposed and has no declared superseding relationship with ADR-00XX.

Milestone 11.1 now provides structural provenance-source schemas. Receipt-gated
admission, record-level and claim-level provenance, inbound Ananke decision
handling, and admission storage behavior remain to be implemented.

## Current Build Milestone: Milestone 11 -- Provenance Admission

Completed:

- Provenance source schemas: `ProvenanceActor`, `ProvenanceSourceKind`, and
  `ProvenanceSource` in `@mnemosyne/schema`, with focused tests.

Next build task:

1. Add claim-level source bindings.

Later slices add derivation records, admission-state and audit schemas, Content
Surface Preflight and inbound Ananke adapter contracts, admission gating,
deferred and quarantine isolation, revalidation, promotion, portable-vault
re-admission, and reliability import separation. The implementation must not
replace the Ananke policy engine or the Content Surface Preflight engine.

## Parallel Architecture Milestone: Portable Project Vault

The [research requirements](PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md)
establish model-independent project memory as a design priority. Current
governed runtime state remains under `.project-Mnemosyne/almanac/`; the
implemented `.mnemosyne/` foundation is a separate, human-readable,
version-controlled portability layer.

Foundation completed:

- Define schema-versioned `.mnemosyne/` metadata and stable record IDs.
- Store human-readable records in controlled, scope-specific directories.
- Enforce project-truth, task-state, and agent-performance boundaries.
- Support validated local export/import without a raw filesystem MCP tool.
- Generate deterministic, source-linked, stale-aware, token-budgeted restart packs.
- Integrate the vault and restart packs into the runtime and user-invoked CLI.

Remaining outcomes:

- Extend the existing typed record model with explicit conflict resolution while
  retaining both sources and historical decisions.
- Define and enforce sensitive-record export behavior, redaction, and optional
  encryption; `accessClassification` is currently stored metadata only.
- Define auditable correction and deletion semantics; no portable-vault delete or
  correction workflow is currently implemented.
- Add confirmed-only ingestion semantics for ambiguous voice records if that
  workflow becomes an accepted project scope.

Validation must cover cross-agent vault migration, import/export compatibility,
reproducibility for the explicitly selected Restart Pack inputs, and the rule
that no raw filesystem access is added to the agent-facing MCP surface.

## Build Milestones

| Milestone                              | Status                                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Core Types                          | Implemented.                                                                                                                                       |
| 2. Almanac Store                       | Implemented MVP with SQLite.                                                                                                                       |
| 3. Workspace Guard                     | Implemented MVP with audit hooks.                                                                                                                  |
| 4. Onboarding Engine                   | Implemented MVP scanner and memory extractor.                                                                                                      |
| 5. Reliability Engine                  | Implemented MVP with revalidation assessment.                                                                                                      |
| 6. Retrieval Engine                    | Implemented MVP with task-aware context packs.                                                                                                     |
| 7. Conflict Engine                     | Implemented MVP with auditable structured conflict detection.                                                                                      |
| 8. MCP Server                          | Implemented MVP with a governed, transport-neutral tool surface.                                                                                   |
| 9. Ananke Adapter                      | Implemented MVP with auditable safety notifications.                                                                                               |
| 10. Portable Project Vault             | Vault, Restart Pack, runtime, and CLI foundations implemented.                                                                                     |
| 11. Provenance-Aware Content Ingestion | In progress: provenance-source schemas implemented and tested; admission gating, claim bindings, and stale-source revalidation remain to be built. |

## Completed Milestone: Conflict Engine

The completed conflict work turns selected, explainable contradiction signals into
structured conflict records that retrieval and Ananke integration can use. It is
not a general semantic contradiction solver.

Required behavior:

- Detect source hash changes.
- Detect active memories with missing sources.
- Detect active memories with superseded or contradicted evidence where the
  current source observations or ADR markers identify it.
- Detect simple user-instruction-vs-law keyword conflicts.
- Detect supersession markers in ADR-like text where possible.
- Return source references and recommended resolution.
- Keep conflict output structured and auditable.

Current tests cover:

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
5. Add provenance-aware ingestion validation covering receipts, truncation,
   source mutation, hostile metadata, and mixed-source contamination control.
6. Add portable-record conflict lifecycle, redaction, and optional encryption;
   migration, generator, runtime, and CLI foundations are implemented, but the
   lifecycle and export controls are not.
7. Add a demo command that proves init, onboard, store, recall, context,
   conflict, score, decay, audit, and—after milestone 11—governed content
   admission.
8. Add user-approved anonymised GitHub report generation.
9. Add combined Ananke/Mnemosyne compatibility tests after both runtimes expose
   stable runnable surfaces.

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
- Covered-content admission control.
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

## Documentation Conflict

The README describes the end-to-end demo as the immediate task, while this
roadmap places governed content admission before the demo's content-admission
proof. The roadmap reflects the accepted ADR and current implementation gaps;
the README wording remains unchanged because this pass is restricted to the
roadmap and provenance design documentation.
