# Validation And Compatibility

Mnemosyne validation must make memory governance observable, repeatable, and easy to report.

The goal is not only to know whether tests pass locally. The goal is to know which runtime versions, environments, editors, models, MCP clients, storage modes, and ecosystem combinations are compatible.

## First-Run Shape

Every release should aim for this first-run path:

```text
Install
Run demo
Run validation
Generate report
Optionally submit anonymised report
Explore architecture
```

The eventual memory demo should show:

```text
Init Almanac
Onboard fixture project
Store memory
Recall memory
Build context pack
Detect conflict
Score reliability
Apply decay
Write audit event
PASS
```

## Validation Levels

| Level | Scope |
| --- | --- |
| Quick | Install, init, status, basic SQLite write/read, basic context pack. |
| Standard | Core memory, source map, reliability, retrieval, conflict, decay, audit, workspace guard. |
| Full | Larger fixtures, restart persistence, session lifecycle, MCP adapter, Ananke adapter. |
| Hostile | Path escape, symlink escape, poisoned source text, contradictory instructions, malformed memory, stale hashes, storage corruption. |

## Test Matrix

Every public capability should eventually have tests for:

- Normal operation.
- Edge cases.
- Failure cases.
- Hostile input.
- Regression cases.
- Cross-platform behavior.
- Audit integrity.
- Persistence integrity.
- Concurrency where relevant.

New security issue means a new permanent regression test.

## Mnemosyne Suites

| Suite | Purpose |
| --- | --- |
| Almanac Store | Create, update, search, status mark, source reference fetch, audit write, restart persistence. |
| Workspace Guard | Canonical path checks, traversal denial, symlink escape denial, delete policy enforcement. |
| Onboarding | Source scan, source typing, hashing, memory extraction, summary audit event. |
| Source Map | Artifact identity, hash tracking, source-reference recovery. |
| Memory Ingest | Candidate validation, provenance, locator assignment, initial status. |
| Reliability | Source-type weights, hash validity, confirmations, contradictions, supersession. |
| Retrieval | Relevant memory selection, context-pack size, source recoverability, warning propagation. |
| Conflict | User-vs-law, memory-vs-code, README-vs-ADR, hash change, missing source. |
| Decay | Slow and fast decay, stale status transitions, revalidation recovery. |
| Session Lifecycle | Start revalidation, context pack creation, end summary, journal/audit updates. |
| MCP Adapter | Governed tool namespace and no raw filesystem exposure. |
| Ananke Adapter | Conflict and insufficient-context notifications without bypassing authority. |

## Report Requirements

Validation must emit a local report by default once reporting is implemented.

Required report shape:

```json
{
  "project": "mnemosyne",
  "version": "0.1.0",
  "commitSha": "unknown",
  "protocolVersion": "unknown",
  "testSuiteVersion": "0.1.0",
  "environment": {
    "os": "unknown",
    "osBuild": "unknown",
    "arch": "unknown",
    "node": "unknown",
    "npm": "unknown",
    "sqlite": "unknown",
    "harness": "unknown",
    "editor": "unknown",
    "model": "unknown",
    "mcpClient": "unknown"
  },
  "startedAt": "2026-07-09T00:00:00.000Z",
  "finishedAt": "2026-07-09T00:00:00.000Z",
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0
  },
  "tests": [
    {
      "id": "MNEMOSYNE-STORE-001",
      "suite": "Almanac Store",
      "category": "normal",
      "status": "passed",
      "durationMs": 0,
      "failureReason": null,
      "logPointer": null,
      "reproductionCommand": "npm test -- workspace"
    }
  ]
}
```

CSV export includes the same per-test line items. Run
`npm run bench -w @mnemosyne/testbench -- --csv` to generate the sibling CSV
alongside the JSON report, or pass a CSV path after `--csv`.

## GitHub Reporting

External report submission must be user-approved.

Before submission:

- Remove usernames.
- Remove full local paths.
- Remove secrets and environment variables.
- Preview the report.
- Ask for explicit confirmation.

Maintainers should be able to search both passing and failing test rows.

## Ecosystem Compatibility

Mnemosyne validates the immutable Project Adrasteia baseline and a read-only
pinned Ananke comparator. This is schema/adapter compatibility only; it does not
claim a live Ananke transport or inbound decision integration.

Compatibility scenarios:

- Ananke only.
- Mnemosyne only.
- Project Adrasteia contracts only.
- Ananke plus Mnemosyne.
- Ananke plus Mnemosyne plus Project Adrasteia.

Checks:

- No port conflicts.
- No SQLite lock conflicts.
- No accidental shared writes.
- No config or environment variable collisions.
- No MCP namespace collisions.
- Cross-runtime audit events can be correlated.
- Startup and shutdown order is deterministic.
- One runtime failure does not corrupt or bypass the other.

Binding rules:

- Ananke failure must not corrupt Mnemosyne memory.
- Mnemosyne failure must not bypass Ananke authority.
