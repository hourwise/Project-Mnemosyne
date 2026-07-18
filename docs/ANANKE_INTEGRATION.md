# Ananke Integration

Mnemosyne should notify Ananke when memory state affects action safety.

Initial notification reasons:

- `CONFLICT_DETECTED`
- `LOW_RELIABILITY_CONTEXT`
- `SOURCE_MISSING`
- `ACTION_CONTEXT_INSUFFICIENT`

Ananke can then block, warn, or require approval before project-changing actions proceed.

## Adapter Contract

`AnankeSafetyBridge` maps a structured `ConflictRecord` or `ContextPack` to the
reasons above and writes `ANANKE_NOTIFICATION_SENT` or
`ANANKE_NOTIFICATION_FAILED` audit events. Delivery failures are returned to the
caller as an unsuccessful delivery result; the bridge never mutates Almanac
memory or determines whether an action may proceed. Ananke remains the sole
action authority.

## Compatibility Rules

Combined Ananke and Mnemosyne validation must eventually prove these rules:

- Ananke failure must not corrupt Mnemosyne memory.
- Mnemosyne failure must not bypass Ananke authority.
- Mnemosyne storage under `.project-Mnemosyne/` must not create SQLite lock conflicts or accidental shared writes.
- MCP tool names and memory namespaces must not collide.
- Cross-runtime audit events must be correlatable by timestamp, runtime identity, and future protocol fields.

## Project Adrasteia Boundary

Project Adrasteia now supplies stable compatibility shapes used by both projects:

- Runtime identity.
- Protocol version.
- Capability manifest.
- Validation report schema.
- Health/readiness contract.
- Cross-runtime audit/event fields.

Project Adrasteia remains contracts-only. Mnemosyne does not move runtime behavior, persistence, scoring, retrieval, conflict detection, context-pack generation, or Almanac storage into that package. The current bridge is outbound advisory-only, carries safe portable correlation/scope metadata when supplied, and has no inbound Ananke decision API.

## Future Coordinator

A future coordinator may eventually manage runtime discovery, capability negotiation, health, policies, and version compatibility. That is not part of the current Mnemosyne build. Mnemosyne should first expose a stable runnable surface and compatibility report.
