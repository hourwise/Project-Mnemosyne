# Project Mnemosyne — Build Plan

## Purpose

Project Mnemosyne is a governed memory and context runtime for AI agents.

It solves one core problem:

> AI agents degrade when they must repeatedly consume large, stale, contradictory, or irrelevant context.

Mnemosyne maintains a local, governed project memory called **The Almanac**. The Almanac stores distilled knowledge, source references, reliability scores, conflicts, session history, and project relationships.

Mnemosyne does not replace source files. It creates a trusted index into them.

---

# Research Requirements Addendum

Mnemosyne must preserve project memory across replacement of the model, agent,
or coding interface. The durable asset is structured project state—not a chat
transcript—including requirements, decisions, constraints, task state,
conflicts, checks, outputs, and evidence.

## Portable Project Vault

Add a human-readable, version-controlled, local-first `.mnemosyne/` vault as a
portable project-memory layer:

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

The vault requires stable IDs, schema versioning, line/file references,
import/export, no proprietary chat dependency, and repository-scoped access.
It is distinct from the current governed `.project-Mnemosyne/almanac/` runtime
state: the vault is the version-controlled portability layer, while runtime
access remains governed and agents still receive no raw filesystem tool.

## Record Boundaries And Restart Packs

Records must distinguish project truth (facts, requirements, constraints, and
decisions), temporary task state, and advisory agent-performance memory. Task
state must never silently become project truth. Every durable record needs a
project ID, kind, source and evidence, timestamps and verification state,
reliability, scope, owner, validity period, supersession and contradiction
links, and access classification.

Mnemosyne should generate model-neutral restart packs that are task-scoped,
source-linked, stale-aware, reproducible, and token-budget aware. Packs must
state what is complete, outstanding, constrained, and relevant to the next
agent or interface.

## Extended Safety Requirements

Conflict resolution must retain both sources and historical decisions, preserve
the distinction between outdated and false, and audit corrections and deletes.
Future sensitive records require classification, redaction, optional
encryption, and no silent external upload. Skill/model experience is advisory
only and never grants authority. Voice records require confirmation before
ambiguous speech can become authoritative.

---

# The Laws of Mnemosyne

## Law I — Provenance

> No trusted memory without provenance.

Every trusted memory must be traceable to its originating source.

---

## Law II — Reliability

> Memory is not authority. Trust must be earned.

Every memory carries a reliability index based on source quality, verification history, freshness, contradictions, and risk.

---

## Law III — Revalidation

> Every session begins with verification.

Memory must be reassessed against current project state before use.

---

## Law IV — Minimal Context

> Retrieve only what is necessary to think.

The runtime must minimise context bloat by providing relevant context, not maximum context.

---

## Law V — Preservation

> Knowledge is preserved. Understanding evolves.

Superseded or contradicted memory must not vanish silently. It should be marked, linked, and retained historically.

---

## Law VI — Conflict

> Contradictions must be surfaced, never hidden.

If user instructions, memory, docs, code, or policy disagree, Mnemosyne must expose the conflict.

---

## Law VII — The Almanac

> The Almanac is the project’s living memory.

The Almanac contains distilled knowledge, decisions, laws, constraints, source references, active tasks, historical changes, and session records.

---

## Law VIII — Retrieval

> Remember briefly. Recover completely.

Mnemosyne should return concise memories by default, but must be able to recover the full authoritative source.

---

## Law IX — Decay

> Unverified memory loses trust over time.

Old memory must degrade unless revalidated.

---

## Law X — Stewardship

> The runtime is steward of memory, not owner of truth.

Mnemosyne curates, verifies, organises, and maintains project knowledge. It does not invent truth.

---

# Relationship to Ananke

Ananke governs actions.

Mnemosyne governs memory.

```text
Mnemosyne asks:
What should the agent believe?

Ananke asks:
What is the agent allowed to do?
```

Future joined flow:

```text
User task
↓
Mnemosyne builds trusted context pack
↓
Agent reasons
↓
Agent proposes action
↓
Ananke checks authority
↓
Action executes / waits / is denied
↓
Mnemosyne records result
↓
Audit updated
```

---

# Relationship to Moirae Code

Moirae Code is the future integrated coding environment.

Do not build Moirae Code yet.

For now:

```text
Ananke = standalone MCP/runtime
Mnemosyne = standalone MCP/runtime
Moirae Code = later VSCodium-based product that bundles both
```

Moirae Code should eventually use sidecars:

```text
MoiraeCode/
├── VSCodiumCore/
├── AppPackaging/
├── InternalMCPs/
│   ├── ananke-server/
│   └── mnemosyne-server/
├── MoiraeCodeExtension/
└── RuntimeSupervisor/
```

---

# Recommended Repository Structure

```text
project-mnemosyne/
├── README.md
├── package.json
├── tsconfig.json
├── docs/
│   ├── LAWS_OF_MNEMOSYNE.md
│   ├── ARCHITECTURE.md
│   ├── ALMANAC_MODEL.md
│   ├── SCORING_MODEL.md
│   ├── SESSION_LIFECYCLE.md
│   ├── SECURITY_MODEL.md
│   └── ANANKE_INTEGRATION.md
├── src/
│   ├── index.ts
│   ├── core/
│   │   ├── types.ts
│   │   ├── result.ts
│   │   ├── errors.ts
│   │   └── constants.ts
│   ├── engines/
│   │   ├── onboardingEngine.ts
│   │   ├── memoryIngestEngine.ts
│   │   ├── reliabilityEngine.ts
│   │   ├── retrievalEngine.ts
│   │   ├── conflictEngine.ts
│   │   ├── decayEngine.ts
│   │   ├── sourceMapEngine.ts
│   │   ├── projectGraphEngine.ts
│   │   └── sessionEngine.ts
│   ├── almanac/
│   │   ├── almanacStore.ts
│   │   ├── sqliteAlmanacStore.ts
│   │   ├── memoryRecord.ts
│   │   ├── sourceReference.ts
│   │   └── contextPack.ts
│   ├── workspace/
│   │   ├── workspacePaths.ts
│   │   ├── workspaceGuard.ts
│   │   └── pathSecurity.ts
│   ├── scoring/
│   │   ├── sourceWeights.ts
│   │   ├── scoringRules.ts
│   │   └── decayRules.ts
│   ├── audit/
│   │   ├── auditTypes.ts
│   │   └── auditStore.ts
│   ├── adapters/
│   │   ├── cliAdapter.ts
│   │   ├── mcpAdapter.ts
│   │   └── anankeAdapter.ts
│   └── cli/
│       └── mnemosyne.ts
└── tests/
    ├── onboarding.test.ts
    ├── reliability.test.ts
    ├── retrieval.test.ts
    ├── conflict.test.ts
    ├── decay.test.ts
    ├── sourceMap.test.ts
    └── workspaceGuard.test.ts
```

---

# Local Storage Area

Mnemosyne should create a local, ringfenced storage area.

Preferred shared future path:

```text
.project-Mnemosyne/
├── almanac/
├── audit/
├── approvals/
├── policies/
└── session-state/
```

Mnemosyne-specific path:

```text
.project-Mnemosyne/
└── almanac/
    ├── almanac.sqlite
    ├── source-map.sqlite
    ├── project-graph.sqlite
    ├── journal/
    ├── context-packs/
    ├── snapshots/
    ├── conflicts/
    └── quarantine/
```

The agent must never receive raw filesystem access to this folder.

All access must go through Mnemosyne APIs.

---

# Workspace Security Rules

## Rule 1 — No Raw Filesystem Tool

The agent must not receive:

```text
read_file(any_path)
write_file(any_path)
delete_file(any_path)
```

It should receive only governed tools:

```text
almanac.search
almanac.read
almanac.writeMemory
almanac.appendJournal
almanac.getContextPack
almanac.requestSourceContext
```

---

## Rule 2 — Canonical Path Check

Before any file access:

```text
requested path
↓
resolve absolute path
↓
resolve symlinks
↓
confirm path is inside Almanac root
↓
allow or deny
```

Reject:

```text
../
absolute paths outside root
symlink escape
hidden project writes
home directory access
SSH/config/secrets access
```

---

## Rule 3 — Escape Attempts Are Security Events

A path escape attempt must create an audit event.

```text
PATH_ESCAPE_DENIED
```

---

## Rule 4 — Writes Are Local to Almanac

Mnemosyne may write only to its governed storage area.

It may read project source files during onboarding and revalidation, but project writes belong to Ananke.

---

## Rule 5 — Delete Requires Explicit Runtime Policy

Deleting memory records should be rare.

Prefer:

```text
superseded
contradicted
stale
deprecated
quarantined
```

over physical deletion.

---

# The Almanac

The Almanac is the governed memory body.

Suggested chapters:

```text
Laws
Policies
Architecture
Decisions
Facts
Constraints
Active Tasks
Open Questions
Known Risks
Failed Experiments
Deprecated Knowledge
Session Journal
Source Map
Project Graph
```

---

# Memory Record Model

```ts
type MemoryKind =
  | "law"
  | "policy"
  | "decision"
  | "fact"
  | "constraint"
  | "task"
  | "hypothesis"
  | "warning"
  | "risk"
  | "deprecated";

type MemoryStatus =
  | "active"
  | "tentative"
  | "stale"
  | "contradicted"
  | "superseded"
  | "quarantined"
  | "rejected";

type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  statement: string;
  reliability: number;
  importance: "low" | "medium" | "high" | "critical";
  status: MemoryStatus;
  source: SourceReference;
  locator: string;
  createdAt: string;
  lastVerifiedAt?: string;
  supersedes?: string[];
  supersededBy?: string;
  tags: string[];
};
```

---

# Source Reference Model

Every trusted memory needs a recoverable source reference.

```ts
type SourceReference = {
  artifactId: string;
  path: string;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
  contentHash: string;
  sourceType:
    | "law"
    | "adr"
    | "readme"
    | "code"
    | "test"
    | "user_instruction"
    | "conversation"
    | "model_inference";
};
```

Example:

```json
{
  "id": "mem_law_003",
  "kind": "law",
  "statement": "Approval binds to content, not intention.",
  "reliability": 0.98,
  "status": "active",
  "locator": "ANANKE.LAWS.003",
  "source": {
    "artifactId": "doc_laws_ananke",
    "path": "docs/LAWS_OF_ANANKE.md",
    "heading": "Law III - Content Binding",
    "lineStart": 17,
    "lineEnd": 21,
    "contentHash": "sha256:abc123",
    "sourceType": "law"
  }
}
```

---

# Almanac Reference System

Mnemosyne should assign library-style references.

Examples:

```text
ANANKE.LAWS.001
MNEMOSYNE.LAWS.004
PROJECT.ARCH.012
ADR.0021.SYNC.003
CODE.AUTH.014
TEST.APPROVAL.006
```

Each locator points to:

```text
artifact
path
heading
line range
hash
current validity state
```

Retrieval should work in two stages:

```text
1. Retrieve compact memory
2. Recover full source if needed
```

---

# Reliability Scoring

Initial scoring should depend on source type.

Approximate starting scores:

```text
Law file                 0.95–1.00
ADR                      0.85–0.95
Current code             0.80–0.95
Test file                0.75–0.90
README                   0.70–0.90
User instruction         0.65–0.90
Conversation summary     0.50–0.75
Model inference          0.30–0.60
Speculation              0.10–0.40
```

Do not make every onboarding memory high-confidence.

Source matters.

---

# Reliability Inputs

Score should consider:

```text
source type
source hash still valid
recency
number of confirmations
contradictions found
risk level
whether source is authoritative
whether newer source supersedes it
whether code and docs agree
```

---

# Decay Rules

Memory should decay unless revalidated.

Slow decay:

```text
laws
ADRs
approved policy
current code
```

Faster decay:

```text
conversation notes
model inference
hypotheses
old task state
temporary plans
```

Memory never becomes false solely because it is old, but it becomes less trusted.

---

# Conflict Handling

Mnemosyne must detect conflicts between:

```text
user prompt vs law
user prompt vs policy
new instruction vs previous decision
README vs ADR
memory vs current code
old plan vs new plan
source hash vs stored source hash
```

Conflict output should include:

```text
conflict type
conflicting memories
source references
recommended resolution
whether Ananke action should continue
```

Example:

```text
Conflict detected:
User instruction conflicts with active law ANANKE.LAWS.003.

Instruction:
"Bypass approval for this write."

Law:
"Approval binds to content, not intention."

Recommended safe path:
Use dry-run mode or create explicit test policy.
```

---

# Onboarding Lifecycle

First run:

```text
mnemosyne init
mnemosyne onboard .
```

Onboarding steps:

```text
1. Create Almanac storage
2. Scan project tree
3. Identify docs, ADRs, README files, package files, source files, tests
4. Build source map
5. Extract candidate memories
6. Assign locators
7. Score reliability
8. Build initial project graph
9. Detect obvious contradictions
10. Write onboarding audit event
```

Onboarding should output:

```text
Project onboarded.

Memories created: 142
Laws found: 10
Decisions found: 18
Constraints found: 24
Source artifacts indexed: 61
Conflicts found: 2
Open questions: 5
```

---

# Session Lifecycle

## Session Start

```text
1. Load Almanac
2. Recheck source hashes
3. Revalidate affected memories
4. Decay stale memories
5. Detect conflicts
6. Build initial context pack
7. Expose warnings to agent/user
```

## During Session

```text
1. Agent requests context
2. Mnemosyne retrieves relevant memories
3. Source context recovered only when needed
4. Conflicts surfaced
5. New facts stored as tentative unless verified
6. Ananke governs all project-changing actions
```

## Session End

```text
1. Summarise session
2. Record decisions
3. Record failed approaches
4. Update task state
5. Update project graph
6. Mark superseded memories
7. Audit memory changes
```

---

# Context Pack

A context pack is what Mnemosyne gives the agent.

```ts
type ContextPack = {
  task: string;
  relevantMemories: MemoryRecord[];
  sourceSnippets: SourceSnippet[];
  conflicts: ConflictRecord[];
  warnings: string[];
  openQuestions: string[];
  tokenEstimate: number;
};
```

Goal:

```text
High relevance.
Low bloat.
Recoverable source.
No hidden contradictions.
```

---

# Project Graph

Mnemosyne should maintain relationships, not just memories.

Example:

```text
ADR-0004
↓ defines
Approval System
↓ implemented by
approvalEngine.ts
↓ tested by
approval.test.ts
↓ governed by
ANANKE.LAWS.003
```

Graph relationship types:

```text
defines
implements
tests
supersedes
depends_on
contradicts
mentions
governs
requires_approval
```

This allows better retrieval than keyword search alone.

---

# CLI MVP

Minimum useful commands:

```text
mnemosyne init
mnemosyne onboard .
mnemosyne status
mnemosyne search "approval binding"
mnemosyne context "add filesystem approval demo"
mnemosyne remember --kind law --source docs/LAWS.md "No trusted memory without provenance"
mnemosyne revalidate
mnemosyne conflicts
mnemosyne journal
```

---

# MCP Tools

Initial MCP tools:

```text
almanac_status
almanac_search
almanac_get_context_pack
almanac_read_memory
almanac_request_source_context
almanac_write_memory
almanac_append_journal
almanac_report_conflict
almanac_revalidate
```

Write tools should be governed internally and audited.

---

# Audit Events

Minimum audit event types:

```text
ALMANAC_CREATED
PROJECT_ONBOARDED
MEMORY_CREATED
MEMORY_UPDATED
MEMORY_SUPERSEDED
MEMORY_CONTRADICTED
MEMORY_REVALIDATED
MEMORY_DECAYED
SOURCE_HASH_CHANGED
CONTEXT_PACK_CREATED
CONFLICT_DETECTED
PATH_ESCAPE_DENIED
SESSION_STARTED
SESSION_ENDED
```

---

# MVP Milestones

## Milestone 1 — Core Types

Build:

```text
MemoryRecord
SourceReference
ContextPack
ConflictRecord
AuditEvent
Result type
```

Pass tests for type validation and serialisation.

---

## Milestone 2 — Almanac Store

Build local SQLite store.

Must support:

```text
create memory
update memory
mark status
search by tag/kind/text
list active memories
fetch source reference
write audit event
```

---

## Milestone 3 — Workspace Guard

Build path guard.

Must reject:

```text
../ escape
absolute path outside root
symlink escape
write outside Almanac
delete without policy
```

---

## Milestone 4 — Onboarding Engine

Scan project.

Create:

```text
source map
initial memories
initial reliability scores
initial audit
```

---

## Milestone 5 — Reliability Engine

Score and rescore memories.

Handle:

```text
source type
hash change
age
confirmation
contradiction
supersession
```

---

## Milestone 6 — Retrieval Engine

Given a task, produce a context pack.

Should prefer:

```text
active
high reliability
high relevance
low token cost
source-recoverable
```

---

## Milestone 7 — Conflict Engine

Detect obvious contradictions.

Start simple:

```text
same locator changed hash
new instruction conflicts with active law keywords
memory marked active but source missing
ADR supersedes old memory
```

---

## Milestone 8 — MCP Server

Expose Almanac tools to agents.

Do not expose raw filesystem access.

---

## Milestone 9 — Ananke Adapter

Allow Mnemosyne to notify Ananke:

```text
conflict detected
memory reliability too low
source missing
action context insufficient
```

Ananke can then block, warn, or require approval.

---

# Testing Strategy

Test against small fixture projects.

Measure:

```text
input token reduction
context pack size
retrieval relevance
memory accuracy
conflict detection
false positives
false negatives
session resume quality
path escape resistance
```

Suggested metrics:

```text
Context Efficiency Ratio
Memory Accuracy Rate
Conflict Detection Rate
Average Context Pack Tokens
Session Resume Tokens
Token Reduction vs Baseline
```

Do not claim token savings until measured.

Target hypothesis:

```text
30–70% context reduction likely.
50–90% possible in repetitive long-running coding sessions.
Quality improvement must be benchmarked.
```

---

# User Guidelines

The user should not need to behave very differently.

Good usage:

```text
Keep ADRs current.
Mark decisions clearly.
Do not leave obsolete docs unmarked.
Use session start/end.
Let Mnemosyne onboard before major work.
Use Ananke for project writes.
```

Bad usage:

```text
Treat memory as source of truth.
Let the agent write raw files.
Ignore conflicts.
Store everything as high-confidence.
Delete old memory silently.
```

---

# Build Philosophy

Mnemosyne should be:

```text
local-first
open-source friendly
agent-agnostic
TypeScript-first
auditable
modular
compatible with Ananke
ready for Moirae Code later
```

It should not be:

```text
a generic notes app
a vector database wrapper
a hidden scratchpad
a Claude-specific hack
a replacement for documentation
```

---

# Final Product Definition

Project Mnemosyne is:

> A local-first governed memory runtime that maintains a project Almanac for AI agents, allowing them to retrieve less context, trust it more carefully, trace it to source, detect contradictions, and preserve project knowledge across sessions.

Ananke governs what the agent may do.

Mnemosyne governs what the agent may believe.

Moirae Code will eventually bring both into one coding environment.
