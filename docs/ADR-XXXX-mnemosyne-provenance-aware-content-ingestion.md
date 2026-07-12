# ADR-XXXX: Provenance-Aware Content Ingestion in Mnemosyne

- **Status:** Proposed
- **Date:** 2026-07-12
- **Decision owners:** Project Mnemosyne maintainers
- **Applies to:** Project Mnemosyne
- **Depends on:** Project Runtime Contracts Content Surface Preflight types

## Status Boundary

This ADR is a proposed design. It does not describe current runtime behavior
and must not be treated as an accepted admission contract.

The current repository does the following instead:

- `MemoryIngestEngine.ingest()` constructs a `MemoryRecord` with status
  `tentative`, source metadata, and a source-type-based reliability score.
- `MemoryRecord` contains a single `SourceReference`; it has no preflight receipt,
  observation ID, Ananke decision ID, exposure level, or truncation field.
- `AnankeSafetyBridge` sends outbound safety notifications. It has no inbound
  Ananke decision API.
- `ReliabilityEngine` can compare a supplied current source hash and mark a
  memory `stale`, but it does not validate a Content Surface Preflight receipt.

The referenced Project Runtime Contracts types are an external/planned
dependency, not a dependency currently imported by this repository.

## Context

Mnemosyne converts project evidence into persistent, scored memory. Unsafe content
admitted here can influence future sessions and is therefore more persistent than
temporary prompt contamination.

Risks include persistent prompt injection, secret retention, hostile metadata
becoming trusted context, stale-source memory, and truncated material being
remembered as complete.

## Proposed Decision

If this ADR is accepted and implemented, covered content admission will require a
valid Content Surface Preflight receipt and an Ananke decision permitting the
memory operation.

The proposal distinguishes:

1. source evidence;
2. derived observations;
3. normalized memory claims; and
4. provenance links.

Untrusted source strings remain evidence. They are not runtime instructions and
cannot change Mnemosyne behavior.

This proposal does not grant Mnemosyne action authority. Ananke supplies the
external decision; Mnemosyne only validates and records the admission evidence.

## Proposed Admission Rules

The exact definition of a covered ingestion path remains an open contract
question. For a path that is covered, admission would require all of the
following:

- preflight completed successfully;
- the receipt is bound to the current source hash;
- an Ananke decision permits the memory operation;
- the emitted surface and truncation state are known;
- the source trust class is known;
- blocking risks are resolved; and
- the content has not changed since inspection.

Stale, missing, unsupported, failed, or mismatched receipts would be rejected or
deferred according to the status semantics resolved before implementation. The
current repository has no `deferred` memory status, so this ADR does not silently
introduce one.

Admission would not by itself promote a record to `active`. The current ingestion
path creates `tentative` records, and the repository has no dedicated promotion
workflow.

## Proposed Claim-Level Provenance

The proposal requires one provenance link for each source that contributes to a
memory claim. The following is a proposed shape, not an exported current type:

```ts
interface MemoryProvenance {
  sourceContentHash: string;
  preflightReceiptId: string;
  observationId: string;
  decisionId: string;
  exposureLevel: ContentExposureLevel;
  emittedSurfaceHash?: string;
  sourceLocation?: {
    path?: string;
    page?: number;
    lineStart?: number;
    lineEnd?: number;
    section?: string;
  };
  truncated: boolean;
  ingestedAt: string;
}
```

The eventual schema must decide whether these links are embedded in
`MemoryRecord`, stored in a separate record, or represented through another
existing project type. That placement is not decided by this proposed ADR.

## Proposed Admission Sequence

The intended sequence is:

1. Inspect the covered source and obtain a Content Surface Preflight receipt.
2. Bind the receipt to the inspected source hash and emitted-surface metadata.
3. Keep source evidence separate from derived observations and candidate claims.
4. Obtain the external Ananke decision for the memory operation.
5. Validate receipt, hash, decision, exposure, and truncation data together.
6. Persist only an admitted claim with its complete provenance links.
7. Revalidate dependent claims when source evidence changes.

Steps 1–6 are proposed behavior. Current onboarding and ingestion do not run
this sequence.

## Source-Controlled Metadata

Filenames, document titles, author fields, PDF producers, EXIF descriptions, sheet
names, archive member names, comments, and embedded labels are not trusted by
default.

They may be stored as quoted source data, but cannot silently become runtime
configuration, policy, project identity, authorship proof, execution instructions,
or memory classification rules.

## Instruction Separation

The proposed ingestion boundary keeps separate:

- runtime/system rules;
- user-approved project rules;
- trusted configuration;
- untrusted source text;
- derived observations and summaries; and
- candidate memory claims.

Instructions inside source files cannot modify Mnemosyne behavior.

## Reliability And Authority

Preflight evidence may become an input to reliability assessment, but this ADR
does not define new numeric weights or reliability portability rules. Current
scoring uses source type, source availability, hash validity, confirmations,
contradictions, supersession, age, and other existing inputs.

The following are proposed evidence considerations, not current scoring rules:

- source and receipt hash agreement;
- known exposure and truncation state;
- preflight handling risks;
- source-type and trust-class information; and
- an external Ananke admission decision.

Reliability remains distinct from authority. A score or admission record cannot
grant permission, execute a tool, or overrule Ananke.

## Staleness And Revalidation

If an inspected source hash changes, the intended behavior is:

1. the receipt is treated as stale;
2. dependent claims are marked for revalidation;
3. the source is inspected again;
4. Ananke supplies a new decision; and
5. Mnemosyne updates, supersedes, or retires affected claims according to the
   accepted lifecycle rules.

Current `ReliabilityEngine` supports supplied hash comparison and stale status
transitions. It does not yet track receipt freshness or automatically discover
all dependent claims.

The current store updates records in place and retains audit events; it does not
yet provide the revision-history mechanism required to claim that superseded
claim history is preserved for this proposed workflow.

## Multi-Source Contamination Control

Each contributing source must retain its own provenance link. A future
implementation must not collapse multiple source decisions, hashes, or exposure
states into one unqualified claim.

Selective suspension of claims when one source is invalidated, and regeneration
of affected summaries, remain proposed behavior. They are not implemented by the
current `MemoryRecord`, `ProjectRecord`, or retrieval pipeline.

## Dependency And Acceptance Gates

Implementation should not begin until the following gates are resolved:

- the Content Surface Preflight types and their versioning are available from the
  external dependency or an accepted local contract;
- the Ananke decision input and its expiry, identity, and replay semantics are
  defined;
- the covered-ingestion boundary is identified;
- provenance field placement and multi-source representation are accepted;
- rejection, deferral, quarantine, and promotion behavior use defined existing
  or newly accepted statuses;
- audit-event and correlation requirements are defined; and
- reliability scoring and portable-vault treatment of provenance are specified.

## Acceptance Criteria

The ADR may move beyond `Proposed` only when the following are accepted and
implemented with tests:

- covered ingestion requires a valid receipt;
- receipt identity is bound to the inspected source hash;
- entries retain source hash, receipt, observation, decision, exposure, and
  truncation information at the accepted schema boundary;
- source metadata cannot become runtime instruction;
- changed hashes trigger the accepted stale/revalidation behavior;
- multi-source claims retain per-source provenance;
- failed, missing, unsupported, stale, and mismatched admission evidence has a
  defined outcome; and
- tests cover injection text, secrets, stale receipts, truncation, mixed sources,
  and source mutation.

## Open Questions

### Covered-Path Definition

The repository does not define which content surfaces require preflight. The
external contract must identify covered, unsupported, and exempt paths without
making untrusted source metadata authoritative.

### Rejection, Deferral, Or Quarantine

The proposal names rejection or deferral, while current memory statuses include
`tentative`, `quarantined`, and `rejected` but not `deferred`. The mapping must be
accepted before implementation.

### Ananke Decision Semantics

The current adapter has no inbound decision type. The decision's identity, expiry,
scope, replay behavior, and failure behavior remain undefined.

### Provenance Placement And Multi-Source Claims

`MemoryRecord` currently has one `SourceReference`, while `ProjectRecord` can
contain multiple `sources` and `evidence`. The repository does not yet decide how
claim-level provenance maps onto these models.

### Reliability And Portability

The repository does not decide how preflight flags affect numeric reliability or
whether receipt and decision evidence must round-trip through the portable vault.

### Audit And Correlation

Existing audit events can record memory IDs, source paths, and arbitrary metadata,
but no admission-specific event or cross-runtime decision reference is currently
defined.

## Evidence Basis

- `packages/schema/src/index.ts`
- `packages/memory-ingest-engine/src/index.ts`
- `packages/reliability-engine/src/index.ts`
- `packages/ananke-adapter/src/index.ts`
- `packages/conflict-engine/src/index.ts`
- `packages/almanac-store/src/index.ts`
- `packages/portable-vault/src/index.ts`
- `packages/*/src/*.test.ts` relevant to the current behaviors
- [Memory Lifecycle](memory-lifecycle.md)
- [Data Classification](data-classification.md)
- [Ananke Boundary](integration/ananke-boundary.md)
- [Roadmap](ROADMAP.md)
