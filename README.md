# Project Mnemosyne

Project Mnemosyne is a governed memory and context runtime for AI agents.

Mnemosyne maintains a local project memory called **The Almanac**. The Almanac stores distilled knowledge, source references, reliability scores, conflicts, session history, and project relationships. It does not replace source files; it creates a trusted index into them.

Mnemosyne's next ingestion boundary is provenance-aware by design: covered
content will require a valid Content Surface Preflight receipt plus an Ananke
decision before it can influence persistent memory. Untrusted source text stays
source evidence, never runtime instruction.

## Relationship To Ananke

Ananke governs actions. Mnemosyne governs memory.

```text
Mnemosyne asks: What should the agent believe?
Ananke asks: What is the agent allowed to do?
```

This repository follows the same TypeScript workspace shape as Project Ananke so both projects can later share a repo and operate together.

## Quick Start

```bash
npm install
npm run build
npm test
npm run demo:basic
npm run demo:full
```

Run the Quick validation harness and write its local JSON report:

```bash
npm run test:bench
```

Add `-- --csv` to write a matching per-test CSV report. By default, reports are
stored under `.project-Mnemosyne/almanac/validation/` and are not tracked by Git.

## Current Progress

Mnemosyne has working MVP implementations for its core governed-memory path:

- Almanac storage with in-memory and SQLite implementations, audit persistence, and workspace protection.
- Project onboarding, reliability scoring and revalidation, retrieval, decay, and structured conflict detection.
- A governed, transport-neutral MCP tool surface. It exposes Almanac operations only and never raw filesystem access.
- Ananke safety notifications for conflicts, missing sources, low-reliability context, and insufficient context. Delivery outcomes are audited and cannot mutate Almanac memory.
- A Quick validation testbench that checks runtime initialisation, SQLite persistence, and governed context retrieval, then emits JSON and optional CSV reports.
- A portable-vault foundation with schema-versioned project metadata, human-readable `.mnemosyne/` records, strict project-truth/task-state/performance boundaries, and validated import/export.
- A model-neutral Restart Pack generator with explicit task scope, source links, stale/low-reliability warnings, deterministic ordering, and token-budget awareness.
- A provenance-source schema foundation for Milestone 11; admission gating, preflight validation, and inbound Ananke decisions are not implemented yet.

This is an MVP, not a production-hardened runtime. The detailed implementation
status is maintained in the [roadmap](docs/ROADMAP.md).

## Next And Future Work

The runtime and CLI now integrate the portable, version-controlled `.mnemosyne/`
vault and Restart Pack generator. The immediate task is an end-to-end demo that
proves the full governed-memory lifecycle.
The vault already provides human-readable project records, stable identifiers,
schema versioning, source and evidence links, and import/export without tying
project memory to a particular chat model or interface.

In parallel, the next ingestion hardening step is provenance-aware content
admission: bind memory claims to source hashes, preflight receipts, exposure and
truncation state, and Ananke decisions so stale or hostile source material
cannot silently become trusted memory.

The vault will strictly separate long-lived project truth from temporary task
state and advisory agent-performance memory. Restart packs will then provide
task-scoped, source-linked, stale-aware context for resuming work across models
or coding environments.

The CLI supports `vault-init`, `vault-list`, `vault-write`, `vault-export`,
`vault-import`, and `restart-pack`; run `mnemosyne help` for the explicit
record-ID arguments.

After that, planned work includes:

- Provenance-aware content ingestion with preflight receipt checks, per-claim
  provenance links, instruction separation, and deterministic stale-source
  revalidation.
- An end-to-end demo proving initialise, onboard, store and recall memory,
  build context, detect conflict, score reliability, apply decay, and audit.
- Portable-vault migration, cross-agent import/export, and restart-pack tests.
- Explicit conflict-resolution lifecycle, sensitive-record classification,
  redaction, and optional encryption.
- Advisory skill/model experience records and confirmed-only voice records for
  future Atlas and voice workflows.
- User-approved, anonymised GitHub validation-report generation.
- Standard, full, and hostile validation scenarios.
- Combined Ananke/Mnemosyne compatibility testing once both runtimes have stable runnable surfaces.
- Potential runtime coordination only if it emerges from real integration needs; Mnemosyne remains a memory runtime, not a gateway or orchestrator.

## Packages

| Package                           | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `@mnemosyne/schema`               | Shared types, schemas, constants, and result envelopes                  |
| `@mnemosyne/portable-vault`       | Human-readable `.mnemosyne` project records and validated import/export |
| `@mnemosyne/restart-pack-engine`  | Model-neutral, source-linked, token-budgeted task continuation packs    |
| `@mnemosyne/audit-engine`         | Almanac audit event recording interfaces and in-memory store            |
| `@mnemosyne/almanac-store`        | Memory record storage interfaces and in-memory prototype                |
| `@mnemosyne/workspace-guard`      | Canonical path checks for the governed Almanac area                     |
| `@mnemosyne/scoring-engine`       | Source-type score seeds and scoring rules                               |
| `@mnemosyne/onboarding-engine`    | First-run project scan orchestration                                    |
| `@mnemosyne/memory-ingest-engine` | Candidate memory ingestion boundaries                                   |
| `@mnemosyne/reliability-engine`   | Memory reliability scoring and revalidation hooks                       |
| `@mnemosyne/retrieval-engine`     | Context pack retrieval boundary                                         |
| `@mnemosyne/conflict-engine`      | Conflict detection records and checks                                   |
| `@mnemosyne/decay-engine`         | Reliability decay rules                                                 |
| `@mnemosyne/source-map-engine`    | Source artifact indexing boundary                                       |
| `@mnemosyne/project-graph-engine` | Project relationship graph boundary                                     |
| `@mnemosyne/session-engine`       | Session start/end lifecycle orchestration                               |
| `@mnemosyne/mcp-adapter`          | Governed transport-neutral MCP tool surface                             |
| `@mnemosyne/ananke-adapter`       | Auditable Mnemosyne safety notifications to Ananke                      |
| `@mnemosyne/runtime-core`         | Runtime composition layer                                               |
| `@mnemosyne/cli`                  | CLI entrypoint scaffold                                                 |
| `@mnemosyne/testbench`            | Quick validation harness with JSON and CSV reports                      |

## Local Storage

Mnemosyne uses `.project-Mnemosyne/almanac/` for governed local state. Runtime databases, generated context, and local validation reports are ignored by Git; only directory placeholders are tracked.

The `.mnemosyne/` vault is a separate, human-readable portability layer for
version-controlled project records. It does not expose raw filesystem access to
agents or replace the governed runtime boundary.

The `.mnemosyne/` vault foundation is now implemented in the runtime and CLI;
the remaining work is to expand record semantics, conflict handling, and
portability behavior without weakening the governed boundary.

## Documentation

- [Memory Lifecycle](docs/memory-lifecycle.md)
- [Data Classification](docs/data-classification.md)
- [Portable Vault Specification](docs/portable-vault-specification.md)
- [Restart Pack Semantics](docs/restart-pack-semantics.md)
- [Ananke Boundary](docs/integration/ananke-boundary.md)
- [Decisions Index](docs/decisions/README.md)
- [Laws of Mnemosyne](docs/LAWS_OF_MNEMOSYNE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Almanac Model](docs/ALMANAC_MODEL.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Ananke Integration](docs/ANANKE_INTEGRATION.md)
- [Roadmap](docs/ROADMAP.md)
- [Validation and Compatibility](docs/VALIDATION_AND_COMPATIBILITY.md)
- [Research Additions and Requirements](docs/PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md)
- [ADR-0033: Frictionless Validation And Ecosystem Compatibility](docs/ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md)
- [ADR-XXXX: Dual-Principal Context Without Memory-Derived Authority](docs/ADR-XXXX-dual-principal-context-without-memory-authority.md)
- [ADR-0034 (Superseded): Fates Dual-Principal And Compatibility Contract](docs/ADR-0034-ADOPTION-OF-THE-FATES-DUAL-PRINCIPAL-AND-COMPATIBILITY-CONTRACT.md)
- [ADR-00XX: Provenance Admission Design Gate](docs/ADR-00XX-PROVENANCE-ADMISSION-DESIGN-GATE.md)
- [ADR-XXXX: Provenance-Aware Content Ingestion](docs/ADR-XXXX-mnemosyne-provenance-aware-content-ingestion.md)
