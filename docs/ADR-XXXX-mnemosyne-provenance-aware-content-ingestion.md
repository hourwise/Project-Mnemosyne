# ADR-XXXX: Provenance-Aware Content Ingestion in Mnemosyne

- **Status:** Proposed
- **Date:** 2026-07-12
- **Decision owners:** Project Mnemosyne maintainers
- **Applies to:** Project Mnemosyne
- **Depends on:** Project Runtime Contracts Content Surface Preflight types

## Context

Mnemosyne converts project evidence into persistent, scored memory. Unsafe content admitted here can influence future sessions and is therefore more dangerous than temporary prompt contamination.

Risks include persistent prompt injection, secret retention, hostile metadata becoming trusted context, stale-source memory, and truncated material being remembered as complete.

## Decision

Mnemosyne will not ingest covered content without a valid Content Surface Preflight receipt and an Ananke decision permitting memory use.

It will distinguish:

1. source evidence;
2. derived observations;
3. normalized memory claims;
4. provenance links.

Untrusted source strings are evidence, never runtime instructions.

## Admission Rules

A source is eligible only when:

- preflight completed successfully;
- the receipt binds to the current source hash;
- Ananke permits the memory operation;
- emitted surface and truncation state are known;
- source trust class is known;
- blocking risks are resolved;
- content has not changed since inspection.

Stale, missing, unsupported, failed, or mismatched receipts must cause rejection or deferral.

## Memory Provenance

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

Multi-source claims retain every relevant provenance link.

## Source-Controlled Metadata

Filenames, document titles, author fields, PDF producers, EXIF descriptions, sheet names, archive member names, comments, and embedded labels are not trusted by default.

They may be stored as quoted source data but cannot silently become runtime configuration, policy, project identity, authorship proof, execution instructions, or memory classification rules.

## Instruction Separation

The ingestion pipeline must keep separate:

- runtime/system rules;
- user-approved project rules;
- trusted configuration;
- untrusted source text;
- derived summaries;
- candidate memory claims.

Instructions inside source files cannot modify Mnemosyne behaviour.

## Reliability Scoring

Preflight evidence influences confidence:

- owned version-controlled ADR: higher initial reliability;
- remote selected excerpt: lower confidence;
- truncated source: confidence ceiling;
- advisory injection flags: reduced trust;
- type mismatch: quarantine or low confidence;
- changed source hash: dependent memory becomes stale.

Flags are evidence of handling risk, not proof that content is false.

## Staleness and Revalidation

When a source hash changes:

1. the receipt becomes stale;
2. dependent memories are marked for revalidation;
3. the source is re-inspected;
4. Ananke issues a new decision;
5. Mnemosyne updates, supersedes, or retires affected claims.

Revision history must be preserved.

## Contamination Control

Multi-source summaries preserve source separation. If one source is later quarantined, only claims dependent on it are suspended, and affected combined summaries are regenerated.

## Consequences

### Positive

- Prevents persistent prompt injection.
- Gives every memory claim inspectable provenance.
- Makes stale-source handling deterministic.
- Limits contamination from invalidated sources.

### Negative

- Adds provenance metadata to memory entries.
- Requires revalidation on source changes.
- Existing memories may need migration.

## Acceptance Criteria

- Covered ingestion requires a valid receipt.
- Entries retain hash, receipt, decision, exposure, and truncation state.
- Source metadata cannot become runtime instruction.
- Changed hashes mark dependent memories stale.
- Multi-source claims retain per-source provenance.
- Tests cover injection text, secrets, stale receipts, truncation, mixed sources, and source mutation.
