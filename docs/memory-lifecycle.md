# Memory Lifecycle

This document describes the repository-supported lifecycle for Mnemosyne memory,
project records, and derived retrieval artifacts as implemented or explicitly
accepted today.

## Evidence Basis

- `packages/memory-ingest-engine/src/index.ts`
- `packages/onboarding-engine/src/index.ts`
- `packages/reliability-engine/src/index.ts`
- `packages/retrieval-engine/src/index.ts`
- `packages/conflict-engine/src/index.ts`
- `packages/decay-engine/src/index.ts`
- `packages/almanac-store/src/index.ts`
- `packages/portable-vault/src/index.ts`
- `packages/schema/src/index.ts`
- Matching `*.test.ts` files
- [LAWS_OF_MNEMOSYNE.md](./LAWS_OF_MNEMOSYNE.md)
- [ADR-XXXX-mnemosyne-provenance-aware-content-ingestion.md](./ADR-XXXX-mnemosyne-provenance-aware-content-ingestion.md)

## Lifecycle Stages

| Stage       | Current support                                                                                                                                                                          | Evidence                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Candidate   | Implemented and tested as a transient `CandidateMemory` input to ingestion.                                                                                                              | `MemoryIngestEngine`, onboarding tests                             |
| Ingested    | Implemented and tested. Ingestion creates a `MemoryRecord` with status `tentative`.                                                                                                      | `packages/memory-ingest-engine/src/index.ts`                       |
| Sourced     | Implemented and tested as a required `SourceReference` attached to every `MemoryRecord` and `ProjectRecord`. It is not a separate persisted status.                                      | `packages/schema/src/index.ts`, schema tests                       |
| Scored      | Implemented and tested. Reliability is assigned at ingestion and recalculated during revalidation. It is not a separate persisted status.                                                | `scoring-engine`, `reliability-engine`, tests                      |
| Indexed     | Implemented for source artifacts during onboarding and for portable-vault records through `index.json`.                                                                                  | `onboarding-engine`, `source-map-engine`, `portable-vault`         |
| Retrieved   | Implemented and tested through `ContextPack` creation.                                                                                                                                   | `retrieval-engine`, MCP adapter tests                              |
| Revalidated | Implemented and tested through `ReliabilityEngine` and MCP `almanac_revalidate`.                                                                                                         | `reliability-engine`, `mcp-adapter` tests                          |
| Decayed     | Implemented in code. Age decay is applied during reliability assessment, and a standalone `DecayEngine` also lowers reliability. Dedicated runtime orchestration is not yet implemented. | `reliability-engine`, `decay-engine`                               |
| Conflicted  | Implemented and tested through `ConflictRecord` generation and retrieval warnings.                                                                                                       | `conflict-engine`, `retrieval-engine` tests                        |
| Resolved    | Not implemented as an explicit workflow. Current conflicts carry only `recommendedResolution` text.                                                                                      | `ConflictRecord`, conflict engine                                  |
| Archived    | Schema-supported for `ProjectRecordStatus`, but no dedicated archive API, CLI flow, or tests exist.                                                                                      | `packages/schema/src/index.ts`                                     |
| Deleted     | Not implemented for memories or portable-vault records.                                                                                                                                  | No delete method in Almanac store, portable vault, runtime, or CLI |

## Almanac Memory Statuses

`MemoryRecord.status` currently supports:

- `active`
- `tentative`
- `stale`
- `contradicted`
- `superseded`
- `quarantined`
- `rejected`

Current retrieval behavior is status-sensitive:

- `tentative` is excluded by default and included only when `includeTentative` is set.
- `stale`, `contradicted`, and `superseded` are excluded by default and included only when `includeUnsafe` is set.
- `quarantined` and `rejected` are always excluded by the retrieval engine.

## Portable Vault Record Statuses

`ProjectRecord.status` currently supports:

- `active`
- `tentative`
- `stale`
- `contradicted`
- `superseded`
- `archived`

The portable-vault store persists whichever valid status is supplied, but the
repository does not yet implement a dedicated archive or resolution workflow.

## Supported Transitions

| Transition                                     | Initiator                                                                 | Evidence used                                                                                                         | Validation                                                                                              | Audit or event record                                                                                                      | Reversible                                                           | Retrieval effect                                                                                  | Governance notes                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Source file scanned -> source artifact indexed | `OnboardingEngine.onboard()`                                              | File contents, relative path, classified source type, SHA-256 content hash                                            | Ignores `.git`, `.idea`, `.project-Mnemosyne`, `coverage`, `dist`, `node_modules`, files over 512,000 bytes, and non-indexed extensions | `PROJECT_ONBOARDED` summary audit event                                                                                    | Re-run onboarding with new sources                                   | None by itself                                                                                    | Indexing does not grant trust; it only establishes source identity                               |
| Source artifact -> candidate memory            | Onboarding extraction                                                     | Markdown headings, decision markers, constraint-like lines, README paragraph fallback                                 | Source path and hash already normalized into a `SourceReference`                                        | No dedicated audit event for candidates                                                                                    | Yes, because candidates are transient and recomputed                 | None until ingested                                                                               | Candidate extraction is heuristic and does not create active memory                              |
| Candidate memory -> ingested memory            | `MemoryIngestEngine.ingest()`                                             | Candidate kind, statement, importance, source, locator                                                                | Candidate data is used to construct a `MemoryRecord`; the ingest method does not itself call `MemoryRecord.parse()`. Stores and MCP inputs do parse records. | None inside ingest itself; onboarding with a store writes `MEMORY_CREATED` events                                          | Yes, by overwriting or changing status later                         | Result stays out of retrieval by default because status is `tentative`                            | Current ingestion assigns provenance and a score, but it does not promote the record to `active` |
| Ingested memory -> persisted Almanac memory    | `AlmanacStore.createMemory()` or MCP `almanac_write_memory`               | Full `MemoryRecord`                                                                                                   | `MemoryRecord.parse()`                                                                                  | Store writes are separate from audit; MCP write records `MEMORY_UPDATED`; onboarding with a store records `MEMORY_CREATED` | Yes, via `updateMemory()` or `markStatus()`                          | Depends on stored status                                                                          | Store persistence does not itself prove the memory is authoritative                              |
| Memory -> retrieved context pack               | `RetrievalEngine.buildContextPack()` or MCP `almanac_get_context_pack`    | Relevant memories, optional source text, optional conflict list                                                       | Status filters, ranking, token budget, `ContextPack` schema                                             | `CONTEXT_PACK_CREATED` when called through the MCP server                                                                  | Yes, rerun retrieval with different options or newer memory state    | Produces model-facing context                                                                     | Retrieval is advisory context selection, not authority                                           |
| Memory -> revalidated memory                   | `ReliabilityEngine.assess()` or `revalidate()`; MCP `almanac_revalidate`  | Current hash, source availability, contradictions, supersession, age, confirmations, risk inputs                      | Recomputes reliability and status; updates `lastVerifiedAt`                                             | `MEMORY_REVALIDATED` when called through the MCP server                                                                    | Yes, future revalidation can raise or lower trust again              | Can move a record into or out of default retrieval eligibility                                    | Revalidation changes trust, not source truth                                                     |
| Memory -> decayed memory                       | `ReliabilityEngine.assess()` with age input, or `DecayEngine.decay()`     | Elapsed age in days                                                                                                   | Reliability floor at `0`; `ReliabilityEngine` can also mark low-trust records `stale`                   | No dedicated audit event in the standalone `DecayEngine`                                                                   | Yes, later confirmation or revalidation can improve trust            | Lower reliability may add warnings or make a record `stale`                                       | Decay is a trust change, not deletion                                                            |
| Memory -> conflicted state outside the record  | `ConflictEngine.detect()`                                                 | Source availability, source hash changes, user instructions, ADR markers, memory supersession, untrusted source types | Structured `ConflictRecord` generation                                                                  | `CONFLICT_DETECTED` audit events when an audit sink is supplied or when reported through MCP                               | Yes, conflicts can disappear after revalidation or manual correction | Retrieval includes relevant conflicts as warnings; conflicts do not automatically block retrieval | Current conflict handling surfaces disagreement rather than silently rewriting memory            |
| Memory -> superseded status                    | `ReliabilityEngine.assess()` with `supersededBy`, or manual record update | Superseding memory ID or prior status                                                                                 | `MemoryRecord` schema requires `supersededBy` only when status is `superseded`                          | `MEMORY_REVALIDATED` when produced through MCP revalidation                                                                | Partially; a later update could change status again                  | Excluded from retrieval by default unless `includeUnsafe` is set                                  | Supersession is explicit, not inferred from time alone                                           |
| Portable record -> indexed vault record        | `PortableVaultStore.writeRecord()`                                        | Full `ProjectRecord` plus derived directory path                                                                      | `ProjectRecord.parse()`, project ID match, safe path check, `index.json` rewrite                        | No separate audit package is wired here                                                                                    | Yes, another write replaces the same record ID                       | Not used directly by Almanac retrieval; may later feed restart packs                              | Vault writes preserve record identity and scope boundaries                                       |
| Portable records -> restart pack               | `RestartPackEngine.build()` or runtime `createRestartPack()`              | Task record plus explicit completed/outstanding/relevant record sets                                                  | Task must be `kind: task-state` and `scope: task_state`; all records must share the manifest project ID | No dedicated audit event                                                                                                   | Yes, rebuild from the same or different selected IDs                 | Produces a derived continuation brief, not live memory                                            | Restart packs summarize selected vault records; they do not mutate the vault                     |

## Documentation Conflict

[SESSION_LIFECYCLE.md](./SESSION_LIFECYCLE.md) describes a broader session-start
sequence including revalidation, decay, and conflict detection. The current
`SessionEngine` implementation records `SESSION_STARTED`, builds a context pack,
and records `SESSION_ENDED`. The broader lifecycle remains design intent rather
than current runtime orchestration.

## Open Questions

### Promotion From `tentative` To `active`

The repository defines `tentative` and `active` statuses, but it does not yet
define a dedicated promotion workflow or approval rule for moving an ingested
memory into active use.

The proposed provenance-aware ingestion ADR describes receipt- and decision-gated
admission for covered content, but that ADR is not accepted and its receipt,
decision, exposure, and truncation fields are not part of the current
`MemoryRecord` schema or `MemoryIngestEngine` result.

### Whether Contradictions Block Retrieval

Current retrieval behavior warns about relevant conflicts and excludes
`contradicted` memories by default, but it can still return a context pack that
contains conflict records. The repository does not yet define a universal
"conflict blocks retrieval" rule.

### Missing-Source Behavior

Current behavior is split across packages:

- `ConflictEngine` emits `active_memory_source_missing`.
- `ReliabilityEngine` marks missing-source memories `stale`.
- `AnankeSafetyBridge` notifies Ananke with `SOURCE_MISSING`.

The repository does not yet define a single end-to-end automatic workflow that
must run these steps in one runtime transaction.

### Resolved, Archived, And Deleted Semantics

- `resolved` is not a current status or record type.
- `archived` exists only in `ProjectRecordStatus`.
- Memory and vault deletion semantics are not currently defined by a dedicated
  API or audit workflow.

## Project Adrasteia Stage-A Boundary

Public lifecycle entry points now require trusted current operation context and
matching project scope. Canonical principal, correlation and historical
approval/grant/audit references are stored as attribution evidence only. Shared
content preflight and provenance admission remain deferred; no inbound Ananke
decision is interpreted by the lifecycle.
