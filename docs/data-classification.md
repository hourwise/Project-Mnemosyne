# Data Classification

This document defines how the current repository separates long-lived project
knowledge, temporary task state, derived material, and advisory signals.

## Evidence Basis

- `packages/schema/src/index.ts`
- `packages/portable-vault/src/index.ts`
- `packages/restart-pack-engine/src/index.ts`
- `packages/retrieval-engine/src/index.ts`
- `packages/conflict-engine/src/index.ts`
- `packages/ananke-adapter/src/index.ts`
- [LAWS_OF_MNEMOSYNE.md](./LAWS_OF_MNEMOSYNE.md)
- [PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md](./PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md)

## Core Rule

Reliability is not authority.

The repository stores reliability scores, stale and contradicted states, and
conflict records, but none of those fields grant execution authority or convert
advisory memory into project truth. Action authority remains outside Mnemosyne's
scope and is delegated to Ananke where integrated.

## Classification Table

| Class                          | Repository shape                                                                                                                               | Persistence                                                                                                        | Provenance requirement                                                      | Decay or trust change                                                                          | Promotion limits                                                             | Export behavior                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Durable project truth          | `ProjectRecord` with `scope: project_truth`; commonly `fact`, `decision`, `requirement`, `constraint`                                          | Portable vault and any serialized export bundle                                                                    | At least one `SourceReference` in `sources`                                 | Reliability is stored and may become `stale`, `contradicted`, or `superseded`                  | Task-state and agent-performance data must not silently become project truth | Exported by `exportVault()` today                                     |
| Task state                     | `ProjectRecord` with `kind: task-state` and `scope: task_state`                                                                                | Portable vault and export bundle                                                                                   | At least one `SourceReference`                                              | Same status fields as other project records                                                    | Schema prevents task-state from being stored as project truth                | Exported by `exportVault()` today                                     |
| User instruction               | `SourceType.user_instruction`; `UserInstruction` input to `ConflictEngine`                                                                     | Not defined as a first-class portable-vault record in the current repo                                             | Must carry a `SourceReference` when used for conflict detection             | No decay model implemented for raw instructions                                                | Not auto-promoted into durable memory by any built-in workflow               | No built-in export path                                               |
| Inferred information           | `SourceType.model_inference` or `SourceType.speculation`; often represented as `MemoryRecord` or `ProjectRecord` content with explicit sources | Possible if a caller writes it, but current conflict rules treat active use as risky                               | Must still carry a `SourceReference`                                        | Lower base reliability; faster decay; active use is flagged as untrusted in conflict detection | Current repo does not define inference as authoritative project truth        | Exported only if a caller stored it as a vault record                 |
| Advisory performance memory    | `ProjectRecord` with `scope: agent_performance` and `kind: observation`                                                                        | Portable vault and export bundle                                                                                   | At least one `SourceReference`                                              | Reliability and status fields exist, but no dedicated scoring workflow is implemented          | Schema prevents non-observation records from entering this scope             | Exported by `exportVault()` today                                     |
| Preference                     | No first-class schema or lifecycle                                                                                                             | Not standardized                                                                                                   | Not standardized                                                            | Not standardized                                                                               | Open question                                                                | Open question                                                         |
| Generated summary              | Derived `ContextPack`, rendered `RestartPack`, `JOURNAL_APPENDED` audit metadata, or `ProjectRecord` with `kind: generated-output`             | Context packs and restart packs are derived outputs; `generated-output` records persist only if explicitly written | Derived outputs still refer back to stored memory or `SourceReference` data | Warnings may signal stale or low-reliability inputs                                            | No automatic promotion into durable truth is implemented                     | Restart packs are not vault exports; `generated-output` records are   |
| Source reference               | `SourceReference`                                                                                                                              | Embedded in memory, conflict, context, and vault records                                                           | Required for `MemoryRecord` and for `ProjectRecord.sources`                 | Hash and availability changes drive revalidation                                               | A source reference alone is not a memory claim                               | Included wherever the parent record is exported                       |
| Contradiction record           | `ConflictRecord` or `ProjectRecord` with `kind: conflict`                                                                                      | `ConflictRecord` is transient unless separately stored; portable-vault `conflict` records persist when written     | Contains explicit sources and affected memory IDs when available            | Conflict status is surfaced, not auto-resolved                                                 | A conflict does not itself rewrite project truth                             | Transient conflicts are not exported unless stored as project records |
| Sensitive or excluded material | `accessClassification` values `public`, `internal`, `sensitive`, `restricted`                                                                  | Classification field persists on `ProjectRecord`                                                                   | Same source rules apply                                                     | No automatic redaction or secret scanning is implemented                                       | Classification does not yet enforce storage or export filtering              | Current export includes classified records unchanged                  |

## Durable Project Truth

Current repository evidence treats project truth as portable-vault data under
`scope: project_truth`. The schema does not limit that scope to only facts and
decisions, but the research and README material consistently frame durable truth
as the long-lived project layer rather than temporary work tracking.

## Task State

Task state is the only record class with both a dedicated kind and a dedicated
scope:

- `kind: task-state`
- `scope: task_state`

The restart-pack engine depends on this distinction and rejects any other record
kind as the task anchor.

## User Instructions

User instructions currently exist as conflict evidence, not as a standalone
portable-memory model. The conflict engine compares explicit user instruction
text against active law memories and emits `user_vs_law` conflicts when the
keyword-level rule detects disagreement.

## Inferred Information

The repository already distinguishes inference from stronger source classes:

- `model_inference` starts with a lower base reliability than laws, ADRs, code,
  tests, and README material.
- `speculation` starts lower still.
- `ConflictEngine` flags active memories whose only source type is
  `model_inference` or `speculation`.

Inference can therefore be stored only with explicit provenance, but current
repository evidence does not support treating it as authoritative project truth
merely because it was persisted.

## Generated Material

Current generated artifacts fall into three groups:

- `ContextPack`: task-specific Almanac retrieval output for model use
- `RestartPack`: model-neutral continuation brief built from explicit vault
  records
- `generated-output` portable records: durable project artifacts when a caller
  chooses to store them

None of these are automatically promoted back into durable fact or decision
records by built-in code.

## Reliability Versus Authority

Reliability answers "how much trust should this record receive right now?"

Authority answers "who or what may decide, approve, or execute?"

Current repository evidence places these responsibilities apart:

- Mnemosyne stores reliability numbers, stale states, contradictions, and
  provenance.
- Ananke, when connected, receives advisory notifications about safety-relevant
  memory conditions.
- Mnemosyne does not decide whether an action may proceed.

## Open Questions

### Preferences

The current repo does not define a first-class preference model. Any attempt to
store preferences today would be a caller convention rather than a repository
standard.

### Portability Of Reliability Scores

`ProjectRecord.reliability` is exported and imported unchanged by the
portable-vault store. The repository does not yet define whether that numeric
score should be treated as portable truth, a cached local assessment, or a
value that must be recomputed after import.

### Sensitive And Excluded Material

The schema carries `accessClassification`, but current export/import behavior
does not enforce exclusion, redaction, or encryption. Secret-handling semantics
remain future work rather than a current guarantee.

### Separation Of Generated Conclusions From Source Facts

The schema distinguishes `generated-output`, `observation`, `fact`, and
`decision`, but the repository does not yet define a formal promotion workflow
for moving a generated conclusion into a durable fact or decision record.
