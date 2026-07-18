# Decisions Index

This index lists ADRs under `docs/` that currently shape Project Mnemosyne.
Draft notes in `docs/thoughts/` are not active ADRs.

| Number | Title | Status | Date | Supersedes | Superseded by |
| --- | --- | --- | --- | --- | --- |
| `ADR-0033` | Frictionless Validation And Ecosystem Compatibility | Accepted for ecosystem planning | Not dated | None stated | None stated |
| `ADR-0034` | Adoption of the Fates Dual-Principal and Compatibility Contract | Superseded | `2026-07-13` | None stated | `ADR-0035` |
| `ADR-0035` | Project Adrasteia Stage-A Memory Boundary | Accepted and implemented | `2026-07-18` | `ADR-0034` | None stated |
| `ADR-XXXX-dual-principal-context-without-memory-authority` | Mnemosyne Handling of Dual-Principal Context Without Memory-Derived Authority | Superseded draft | `2026-07-14` | `ADR-0034` | `ADR-0035` |
| `ADR-00XX` | Provenance Admission Design Gate | Accepted design gate | `2026-07-12` | None stated | None stated |
| `ADR-XXXX` | Provenance-Aware Content Ingestion in Mnemosyne | Proposed | `2026-07-12` | None stated | None stated |

ADR-0035 records the immutable Project Adrasteia baseline, adapter ownership,
trusted operation context, classification and credential limitations, runtime
inspection, negotiation, migration and rollback. Content preflight and
provenance admission remain deferred. Historical ADRs retain their original
context but do not claim the current implementation state.
