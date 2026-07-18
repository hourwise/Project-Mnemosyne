# Restart Pack Semantics

This document defines the current restart-pack behavior implemented in
`@mnemosyne/restart-pack-engine` and exposed through the runtime and CLI.

## Evidence Basis

- `packages/schema/src/index.ts`
- `packages/restart-pack-engine/src/index.ts`
- `packages/restart-pack-engine/src/index.test.ts`
- `packages/runtime-core/src/index.ts`
- `packages/runtime-core/src/index.test.ts`
- `packages/cli/src/index.ts`

## Purpose

A restart pack is a model-neutral continuation brief derived from selected
portable-vault records.

Its purpose is to help a later session continue a task without depending on raw
chat history or direct Almanac store access.

## Inputs

The engine requires:

- a `ProjectVaultManifest`
- one task record
- optional completed records
- optional outstanding records
- optional relevant records
- optional branch name
- optional last verified commit
- optional token budget

The task record is mandatory and must be:

- `kind: task-state`
- `scope: task_state`

The runtime-level helper `createRestartPack(context, taskId, selection)` resolves
record IDs from the portable vault before calling the engine. It requires trusted
current context and matching project scope.

## Selection Model

The current implementation is explicit-selection based:

- it does not query the vault automatically for "best" records
- it accepts only the task record plus the explicit completed, outstanding, and
  relevant record sets supplied by the caller
- duplicate record IDs are deduplicated across sections after the task anchor is
  established

## Ordering

Current ordering is deterministic for the same input record set:

- sections are rendered in fixed order: task header, `Completed`, `Outstanding`,
  `Relevant records`, then `Warnings`
- each optional section is sorted by record ID before packing
- the first source reference of each record becomes the rendered source locator

This determinism is directly tested in the restart-pack engine tests.

## Token And Size Budget

Budget behavior is currently approximate and text-based:

- token estimation is `ceil(text.length / 4)`
- if no budget is provided, the engine uses an effectively unbounded budget
- if a budget is provided, it must be a positive finite number
- admission starts with an estimate for the header and adds each selected item's
  rendered text; records that would exceed the remaining admission budget are
  omitted
- omitted records trigger the warning: `Some restart records were omitted to stay within the token budget.`

The supplied budget is not a hard guarantee on the final rendered string. The
selection estimate does not include every section label or warning before
selection, while `tokenEstimate` is recalculated from the complete rendered pack.

## Inclusion And Exclusion Rules

Included by current code:

- the task record's ID and content as the task anchor (the task's source,
  reliability, and status are not copied into the `RestartPack` task fields)
- selected completed, outstanding, and relevant records from the same project
- branch and commit strings when supplied
- warnings derived from record status and reliability

Excluded by current code:

- any selected record from a different project
- duplicate record IDs already used in an earlier section
- records omitted due to the token budget
- conflict records, source snippets, and open questions unless the caller
  explicitly stored and selected them as portable records

## Stale-Data Signaling

The engine does not automatically exclude stale records. Instead it counts them
and emits warnings such as:

- `Restart pack includes 1 stale record.`

This means restart packs are stale-aware rather than stale-blocking.

## Reliability Thresholds

Current reliability threshold behavior is warning-only:

- records with `reliability < 0.6` are counted
- the pack emits `low-reliability` warnings
- those records are not filtered out solely because of low reliability

## Source References

Each `RestartPackItem` contains:

- record ID
- record content
- record status
- one `SourceReference`

The current implementation uses `record.sources[0]` as the source shown in the
pack. It does not currently render multiple source references for one record.
The task anchor is not a `RestartPackItem`, so its source reference is not carried
in the pack schema.

The pack contains status but not the selected records' numeric reliability
values. Reliability affects warning generation only; it is not a selection
threshold in the current engine.

## Rendered Form

The engine renders restart packs as plain text. The current format includes:

- task ID
- project name
- optional branch
- optional last verified commit
- task text
- completed items
- outstanding items
- relevant items
- warnings

Each list item renders as:

```text
[record_id] record content (path:lineStart-lineEnd)
```

## Relationship To Other Mnemosyne Artifacts

### Versus Raw History

A restart pack is not a transcript. It is a derived brief built from explicit
portable records.

### Versus Context Packs

A restart pack differs from a `ContextPack` in several ways:

- Restart packs use `ProjectRecord` inputs; context packs use `MemoryRecord`
  inputs.
- Restart packs are organized into completed/outstanding/relevant sections;
  context packs are relevance-ranked memory selections.
- Restart packs do not include conflict lists, source snippets, or open
  questions.
- Context packs are tuned for immediate governed retrieval; restart packs are
  tuned for cross-session continuation.

### Versus The Almanac

The Almanac is the governed memory store. A restart pack is a derived export
brief and does not replace stored memory.

### Versus The Portable Vault

The portable vault is the durable record layer. A restart pack is a rendered
summary built from selected vault records.

## Open Questions

### Determinism Scope

Current determinism is evidenced for explicit input records and a fixed `now`
value. The repository does not yet define determinism requirements for any
future automatic record-selection strategy.

### Multi-Source Records

Portable records may carry multiple source references, but restart packs
currently render only the first one. The repository does not yet define how a
multi-source record should be summarized when source separation matters.

## Stage-A Safety Boundary

Classification and the credential-material guard run before selection, token
budgeting and rendering. Restricted records are excluded; sensitive records
require a trusted evaluator. Pack text always states that it is evidence, not
instruction or authority. No credentials or reusable state handles are rendered.
