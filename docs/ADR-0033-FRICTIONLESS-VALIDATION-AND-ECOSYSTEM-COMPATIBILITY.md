# ADR-0033: Frictionless Validation And Ecosystem Compatibility

## Status

Accepted for ecosystem planning.

## Context

Project Mnemosyne is part of a broader governed AI runtime ecosystem:

- Project Ananke governs execution, approval binding, auditability, and recoverable outcomes.
- Project Mnemosyne governs memory, provenance, reliability, retrieval, conflict detection, and context packs.
- Project Runtime Contracts is expected to hold stable shared protocol contracts once they are proven.
- Moira Code may later bundle these runtimes into an integrated coding environment.

Mnemosyne should not be designed as an isolated memory demo. It must be easy to validate alone, and eventually easy to validate beside Ananke and Runtime Contracts.

Adoption depends on a low-friction first-run path:

1. Install.
2. Run demo.
3. Run validation.
4. Generate a portable report.
5. Optionally submit an anonymised report.
6. Explore architecture.

The project should demonstrate its purpose quickly. A new user should be able to run a memory demo that stores, recalls, scores, detects conflict, and reports results without first reading all architecture documents.

The source discussion also distinguishes gateways from governed runtimes:

- Gateways handle discovery, routing, identity, auth, quotas, traffic control, and observability.
- Ananke handles governed execution after a request reaches a tool boundary.
- Mnemosyne handles governed memory and context before and after reasoning.
- A future coordinator may become useful, but should not be started until real ecosystem coordination needs appear.

Mnemosyne should therefore remain complementary to gateways and Ananke, not compete with them.

## Decision

Mnemosyne will adopt the ecosystem validation strategy from Ananke ADR-0033, adapted to governed memory.

Validation is a product feature, not a secondary test script.

Mnemosyne validation should eventually support levels:

| Level | Purpose |
| --- | --- |
| Quick | Confirms basic install, init, store, recall, and status in under a minute. |
| Standard | Runs normal memory, scoring, retrieval, conflict, decay, audit, and workspace guard tests. |
| Full | Adds larger fixtures, persistence restart checks, source-map coverage, and session lifecycle checks. |
| Hostile | Exercises path escapes, poisoned source text, contradictory instructions, malformed records, stale hashes, and corrupted storage cases. |

Every validation run should produce a portable report. JSON is required first; CSV should follow once report fields stabilize.

Reports should include passing tests as searchable line items, not only failures. This allows future compatibility analysis across editors, models, operating systems, MCP clients, and runtime combinations.

Minimum Mnemosyne validation report fields:

- Project name.
- Project version and commit SHA.
- Protocol version when Runtime Contracts exists.
- Test suite version.
- Operating system, OS build, CPU architecture.
- Node, npm, SQLite, and package versions.
- Harness/editor/client context when known.
- Model context when known.
- MCP client/server context when relevant.
- Start and finish timestamps.
- Total, passed, failed, and skipped counts.
- Per-test ID, suite, category, status, duration, failure reason, log pointer, and reproduction command.

Mnemosyne-specific validation suites should cover:

- Almanac init.
- SQLite persistence and restart.
- Source map creation.
- Memory ingestion.
- Provenance enforcement.
- Reliability scoring.
- Retrieval relevance and context-pack size.
- Conflict detection.
- Decay rules.
- Session start/end.
- Workspace guard escape resistance.
- Audit event recording.
- Ananke notification behavior.
- MCP tool namespace safety.

Combined ecosystem validation should eventually cover:

- Ananke only.
- Mnemosyne only.
- Runtime Contracts only.
- Ananke plus Mnemosyne.
- Ananke plus Mnemosyne plus Runtime Contracts.

Compatibility tests should check:

- Port conflicts.
- SQLite lock and database conflicts.
- Shared config conflicts.
- MCP namespace and tool-name collisions.
- Memory access boundaries.
- Audit/event ordering.
- Startup and shutdown ordering.
- Resource usage.
- Concurrent requests.
- Failure isolation.

Two ecosystem safety rules are binding:

- Ananke failure must not corrupt Mnemosyne memory.
- Mnemosyne failure must not bypass Ananke authority.

Runtime Contracts should become the shared home for stable compatibility contracts once those contracts are proven. It must remain contracts-only: no engines, databases, persistence, policies, retrieval logic, reliability scoring, context-pack generation, or memory stores.

Likely future shared contracts:

- Runtime identity.
- Runtime name.
- Protocol version.
- Capability manifest.
- Health/readiness contract.
- Validation report schema.
- Cross-runtime audit/event fields.

## Consequences

- Mnemosyne should add validation reporting before claiming production readiness or token-savings results.
- New security bugs must become permanent regression tests.
- Demo and validation commands should become first-class npm scripts and eventually first-class CLI commands.
- CI should run unit tests first, then scenario validation as the testbench matures.
- Combined Ananke/Mnemosyne validation should wait until both runtimes expose stable runnable surfaces.
- Runtime Contracts must not absorb Mnemosyne runtime behavior.
- Protocol compatibility must be checked early, before combined runtime startup or execution.
- A future orchestrator remains possible, but is explicitly not part of the current Mnemosyne build.

## Non-Goals

- This ADR does not implement validation reporting.
- This ADR does not introduce telemetry.
- This ADR does not require users to submit reports.
- This ADR does not start a gateway or coordinator project.
- This ADR does not move Mnemosyne schemas into Runtime Contracts yet.
