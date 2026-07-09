# Project Mnemosyne

Project Mnemosyne is a governed memory and context runtime for AI agents.

Mnemosyne maintains a local project memory called **The Almanac**. The Almanac stores distilled knowledge, source references, reliability scores, conflicts, session history, and project relationships. It does not replace source files; it creates a trusted index into them.

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
```

## Packages

| Package | Purpose |
| --- | --- |
| `@mnemosyne/schema` | Shared types, schemas, constants, and result envelopes |
| `@mnemosyne/audit-engine` | Almanac audit event recording interfaces and in-memory store |
| `@mnemosyne/almanac-store` | Memory record storage interfaces and in-memory prototype |
| `@mnemosyne/workspace-guard` | Canonical path checks for the governed Almanac area |
| `@mnemosyne/scoring-engine` | Source-type score seeds and scoring rules |
| `@mnemosyne/onboarding-engine` | First-run project scan orchestration |
| `@mnemosyne/memory-ingest-engine` | Candidate memory ingestion boundaries |
| `@mnemosyne/reliability-engine` | Memory reliability scoring and revalidation hooks |
| `@mnemosyne/retrieval-engine` | Context pack retrieval boundary |
| `@mnemosyne/conflict-engine` | Conflict detection records and checks |
| `@mnemosyne/decay-engine` | Reliability decay rules |
| `@mnemosyne/source-map-engine` | Source artifact indexing boundary |
| `@mnemosyne/project-graph-engine` | Project relationship graph boundary |
| `@mnemosyne/session-engine` | Session start/end lifecycle orchestration |
| `@mnemosyne/mcp-adapter` | Initial MCP tool manifest boundary |
| `@mnemosyne/ananke-adapter` | Future notifications from Mnemosyne to Ananke |
| `@mnemosyne/runtime-core` | Runtime composition layer |
| `@mnemosyne/cli` | CLI entrypoint scaffold |
| `@mnemosyne/testbench` | Repeatable safety and retrieval scenario harness |

## Local Storage

Mnemosyne uses `.project-ananke/almanac/` for governed local state so it can coexist with Ananke's audit, approval, and policy state. Runtime databases and generated context files are ignored by git; only directory placeholders are tracked.

## Documentation

- [Laws of Mnemosyne](docs/LAWS_OF_MNEMOSYNE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Almanac Model](docs/ALMANAC_MODEL.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Ananke Integration](docs/ANANKE_INTEGRATION.md)
- [Roadmap](docs/ROADMAP.md)
- [Validation and Compatibility](docs/VALIDATION_AND_COMPATIBILITY.md)
- [ADR-0033: Frictionless Validation And Ecosystem Compatibility](docs/ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md)
