# ADR-0034: Adoption of the Fates Dual-Principal and Compatibility Contract

## Status

Superseded

## Date

2026-07-13

## Superseded By

This decision is superseded by [ADR-0035: Project Adrasteia Stage-A Memory
Boundary](ADR-0035-ADRASTEIA-STAGE-A-MEMORY-BOUNDARY.md).

## Context

Project Mnemosyne participates in the Fates ecosystem. Project Runtime
Contracts owns shared interoperability shapes, protocol vocabulary, version
metadata, and compatibility helpers. It does not own memory, context-pack,
reliability, retrieval, policy, execution, or orchestration semantics.

Mnemosyne owns project memory records, provenance and source references,
reliability and revalidation, contradiction representation, retrieval,
context-pack construction, decay, archival, and portable-vault and Restart
Pack semantics where implemented. Ananke owns action authority and its
authoritative action audit. Horae owns orchestration semantics where provided;
Moirae Code is a host surface and does not acquire action authority through
that role.

The current Mnemosyne repository is independently buildable and testable, but
does not yet import Project Runtime Contracts or expose a versioned runtime
identity, health, capability, or protocol-negotiation interface. Its current
Ananke integration is an outbound, transport-neutral advisory notification
bridge only. It has no inbound Ananke decision API.

## Decision

Mnemosyne adopts the Fates dual-principal and compatibility boundary.

When a Mnemosyne integration carries identity, delegation, session, runtime,
health, capability, outcome, lifecycle, or audit-correlation data covered by
Project Runtime Contracts, it SHALL use the applicable shared contract rather
than redefine a competing cross-runtime shape.

Mnemosyne SHALL:

- preserve distinct human/user and agent identities where identity-bearing
  shared contracts are used;
- treat a runtime, agent, host, or tool identity as distinct from human
  authority;
- preserve scoped delegation and correlation data supplied through adopted
  shared contracts without treating it as a grant of action authority;
- remain independently installable, buildable, testable, and runnable when
  optional sibling runtimes are unavailable;
- declare supported protocol and sibling-runtime versions before claiming a
  runnable cross-runtime integration;
- use Ananke's decision through its supported interface for governed external
  actions and never use memory, tool discovery, or a host surface as a bypass;
- implement only Mnemosyne's assigned memory responsibilities; and
- add Runtime Contracts conformance and pinned compatibility tests before
  claiming compatibility with a sibling runtime.

This adoption does not make proposed integration behaviour implemented. Until
the required shared contract and Mnemosyne adapter exist, Mnemosyne SHALL
describe the relevant integration as designed, blocked, or unimplemented.

## Repository-Specific Responsibilities

Mnemosyne SHALL:

- maintain memory as evidence with provenance, reliability, conflicts, and
  source references; reliability is not action authority;
- build retrieval context and Restart Packs from its governed records without
  converting uncertain memory into authoritative truth;
- retain its own domain schemas for memory, source references, context packs,
  and reliability, while not presenting them as canonical cross-runtime
  contracts;
- keep Ananke notifications advisory. The notification bridge may report
  conflict, missing-source, low-reliability, and insufficient-context signals,
  but it may not approve actions, execute tools, or alter Ananke's action
  audit;
- expose Almanac operations through its governed MCP surface rather than raw
  filesystem access; and
- keep provider credentials, approval policy, external-side-effect policy,
  general orchestration, and IDE-host control outside Mnemosyne.

## Implementation Status

Implemented and tested today:

- standalone build, package tests, demos, and the Quick validation harness;
- local memory, vault, Restart Pack, governed MCP, and outbound Ananke
  notification behaviour; and
- a transport-neutral MCP tool surface and a local no-op Ananke adapter.

Not implemented in this repository:

- a Project Runtime Contracts package dependency or adopted shared runtime
  schemas;
- a versioned runtime identity, health, capability-registration, or protocol
  negotiation endpoint;
- a shared dual-principal or scoped-delegation payload at the Mnemosyne
  boundary;
- inbound Ananke decisions, action or approval correlation identifiers, or a
  cross-runtime audit event stream; and
- Runtime Contracts conformance tests or pinned cross-repository integration
  tests.

## Verification

Current evidence is provided by:

- standalone build and test CI;
- package tests, demos, and the Quick validation harness; and
- the authority-boundary tests for outbound Ananke notification delivery.

Before a compatibility claim is made for a specific adopted shared contract,
verification SHALL additionally include:

- Runtime Contracts schema, identifier, timestamp, outcome, and JSON
  round-trip conformance tests applicable to that contract;
- protocol-negotiation and unsupported-version tests using the shared helper;
- pinned compatibility tests against the named sibling-runtime version; and
- unavailable-optional-runtime tests that demonstrate no authority bypass.

## Documentation Conflict

The request for this ADR refers to a canonical Project Runtime Contracts ADR
named "Fates Dual-Principal and Compatibility Contract." At the Runtime
Contracts commit reviewed for this adoption, the repository contains
conformance, contract-ownership, protocol, and runtime-session documentation,
but no ADR with that exact title was located. This ADR therefore records
Mnemosyne's adoption of the stated boundary and of the applicable published
Runtime Contracts interfaces; it does not identify a non-existent external ADR
path or claim an already implemented Mnemosyne integration.

## Related Documents

- [Architecture](ARCHITECTURE.md)
- [ADR-0033: Frictionless Validation And Ecosystem Compatibility](ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md)
- [Ananke Boundary](integration/ananke-boundary.md)
- [Data Classification](data-classification.md)
- [ADR-00XX: Provenance Admission Design Gate](ADR-00XX-PROVENANCE-ADMISSION-DESIGN-GATE.md)
