# Decisions Index

This index lists ADRs under `docs/` that currently shape Project Mnemosyne.

## Included Documents

This index covers ADR files in the main `docs/` directory. Draft notes under
`docs/thoughts/` are not treated as active ADRs here.

| Number                                                     | Title                                                                         | Status                            | Date              | Affected packages                                                                     | Supersedes  | Superseded by                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| `ADR-0033`                                                 | Frictionless Validation And Ecosystem Compatibility                           | Accepted for ecosystem planning   | Not dated in file | Project-wide; the ADR does not list package-specific ownership                        | None stated | None stated                                                |
| `ADR-0034`                                                 | Adoption of the Fates Dual-Principal and Compatibility Contract               | Superseded                        | `2026-07-13`      | Project-wide; future cross-runtime boundary and compatibility adapters                | None stated | `ADR-XXXX-dual-principal-context-without-memory-authority` |
| `ADR-XXXX-dual-principal-context-without-memory-authority` | Mnemosyne Handling of Dual-Principal Context Without Memory-Derived Authority | Accepted — implementation pending | `2026-07-14`      | Project-wide; request context, scoped retrieval, provenance, and authority separation | `ADR-0034`  | None stated                                                |
| `ADR-00XX`                                                 | Provenance Admission Design Gate                                              | Accepted                          | `2026-07-12`      | Project-wide; persistent memory ingestion and portable-vault import                   | None stated | None stated                                                |
| `ADR-XXXX`                                                 | Provenance-Aware Content Ingestion in Mnemosyne                               | Proposed                          | `2026-07-12`      | Project-wide; applies to Project Mnemosyne and names no package list                  | None stated | None stated                                                |

## Notes

- `ADR-0033` explicitly positions Runtime Contracts as contracts-only and keeps
  Mnemosyne runtime behavior inside this repository.
- `ADR-00XX` is the accepted Milestone 11 design gate. Its provenance-source
  schema foundation is implemented, but admission behavior is not yet
  implemented; it declares no superseding relationship with `ADR-XXXX`.
- `ADR-0034` is retained as a superseded historical decision. The accepted
  replacement remains implementation pending.
- `ADR-XXXX` depends on Project Runtime Contracts Content Surface Preflight
  types and is not yet an accepted repository decision.
