# Project Mnemosyne — Research Additions and Requirements

## Purpose

Mnemosyne is a persistent, model-independent project-memory runtime.

> **Your model may change. Your project memory should not.**

The durable project asset is not the chat transcript. It is the structured state around the work: requirements, decisions, constraints, references, checks, outputs, task state, conflicts, and evidence.

## Portable project vault

```text
.mnemosyne/
├── project.json
├── index.json
├── decisions/
├── requirements/
├── constraints/
├── task-state/
├── handoffs/
├── evidence/
├── conflicts/
├── references/
└── generated-context/
```

Requirements:
- human-readable
- version-controlled
- local-first
- model-neutral
- stable identifiers
- schema versioning
- line/file references
- import/export support
- no proprietary chat dependency

## Record kinds

```ts
export type ProjectRecordKind =
  | "fact"
  | "decision"
  | "requirement"
  | "constraint"
  | "hypothesis"
  | "task-state"
  | "generated-output"
  | "external-reference"
  | "observation"
  | "conflict";
```

Each record should retain:
- ID and project ID
- record kind
- source and evidence
- timestamp and last verification
- reliability/confidence
- scope and owner
- validity period
- supersession links
- contradiction links
- access classification

## Restart packs

Mnemosyne should generate model-neutral restart packs:

```text
Continue task TASK-042.
Project: Project Horae
Branch: feature/runtime-registration
Last verified commit: abc123

Completed:
- Runtime registration schema
- Initial tests

Outstanding:
- Persistence adapter
- Conflict tests

Do not alter:
- Existing public package names

Relevant decisions:
- ADR-006
- ADR-011
```

Restart packs should be task-scoped, source-linked, stale-aware, reproducible, and token-budget aware.

## Separate three kinds of memory

### Project truth
Long-lived facts, requirements, constraints, and decisions.

### Task state
Current branch, pending tests, temporary hypotheses, and incomplete work.

### Agent performance memory
Observed strengths and failures of a model, skill, or runtime.

Temporary task state must never silently become project truth.

## Conflict and staleness

Mnemosyne must:
- detect contradictions
- preserve both sources
- show reliability and recency
- mark unresolved conflict
- support explicit resolution
- retain historical decisions
- decay unsupported observations
- require re-verification for stale records
- distinguish outdated from false

## Skill and runtime experience

Mnemosyne may record which skills and models perform well in a project, but this is advisory and never grants authority.

```json
{
  "skillId": "frontend-accessibility-review",
  "runtime": "claude-code",
  "runs": 12,
  "successRate": 0.92,
  "knownFailures": ["Misses some dynamic dialog labels"]
}
```

## Voice records

For Atlas and future voice workflows, records may include transcript, confidence, alternatives, confirmed interpretation, action taken, and source-audio reference. Ambiguous speech must not become authoritative without confirmation.

## Security

- strict path boundaries
- deny-by-default write scope
- no silent external upload
- optional encryption
- sensitive-record classification
- redaction
- auditable writes, corrections, and deletes
- repository-scoped access
- no silent history rewrite

## Laws of Mnemosyne

1. Memory is not truth merely because it was stored.
2. Every durable record retains its source.
3. Facts, decisions, hypotheses, and outputs remain distinct.
4. Contradictions are surfaced, not concealed.
5. Stale memory is marked before reuse.
6. Agents receive only the minimum required context.
7. Project memory survives replacement of the model or interface.
8. Temporary task state does not silently become project truth.
9. Corrections and deletions remain auditable.
10. Human-readable project files are the portability layer.

## Recommended next work

- portable vault schema
- record-kind schema
- restart-pack generator
- conflict lifecycle
- project-truth/task-state separation
- source and evidence references
- skill/model performance records
- cross-agent migration tests
