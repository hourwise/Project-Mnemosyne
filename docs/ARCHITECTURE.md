# Architecture

Mnemosyne is structured as focused TypeScript workspace packages, matching Project Ananke's monorepo style.

```text
AI Client -> Mnemosyne Runtime -> Almanac Store
                      |
                      +-> Workspace Guard
                      +-> Reliability Engine
                      +-> Retrieval Engine
                      +-> Conflict Engine
                      +-> Audit Engine
                      +-> Ananke Adapter
```

The runtime exposes governed Almanac operations only. Raw filesystem reads and writes are not exposed as agent tools.

## Ecosystem Position

Mnemosyne is a governed memory runtime, not a gateway.

Gateway layer responsibilities include discovery, routing, identity, authentication, quotas, traffic control, and observability. Mnemosyne begins after the project and runtime context are known: it decides what memory should be trusted, retrieved, revalidated, preserved, decayed, or flagged as conflicting.

Ananke and Mnemosyne are complementary:

```text
Ananke governs what may execute.
Mnemosyne governs what may be believed and remembered.
```

Project Adrasteia now provides the adopted stable portable contracts for runtime
identity, protocol version, capability manifests, health, readiness,
registration, correlation, principal identity and resource scope. The pure
`@mnemosyne/adrasteia-adapter` sits at the runtime boundary; the local
`@mnemosyne/memory-boundary` enforces classification and credential safeguards.
Project Adrasteia contains no Mnemosyne behavior, engines, persistence, scoring,
retrieval or memory stores.

See also:

- [ADR-0033](./ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md)
- [Validation And Compatibility](./VALIDATION_AND_COMPATIBILITY.md)
- [Roadmap](./ROADMAP.md)
