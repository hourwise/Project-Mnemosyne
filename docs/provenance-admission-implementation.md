# Provenance admission implementation

`@mnemosyne/memory-ingest-engine` now provides a receipt-gated admission engine.
It is intentionally separate from `MemoryRecord.status`:

- `ADMITTED` is the only state that returns a persistable record.
- `REJECTED` records a non-retryable authority or validation refusal.
- `DEFERRED` records an unavailable preflight/authority or retryable failure.
- `QUARANTINED` records unsupported, failed, stale, mismatched, or insufficient
  preflight evidence.

Candidate identity is deterministic over the canonicalization version, project/
vault/trust domain, claim fields, and the sorted source identity set. Temporary
failure retries retain the candidate and admission IDs while incrementing the
attempt and creating a new history event. Idempotent repeats return the existing
result without creating another event.

Deferred and quarantined candidates live only in a bounded, expiring staging
store. They are not passed to `AlmanacStore`, retrieval, scoring, context-pack
rendering, or portable-vault export. Promotion happens only through a fresh
evaluation; there is no direct state toggle.

The engine consumes a narrow `PreflightReceiptVerifier` result rather than
redefining the shared Content Surface Preflight receipt. Until Runtime Contracts
owners publish the accepted immutable contract release, the host must provide
that verifier explicitly. `McpAlmanacServer` enables this gate through its
optional `admission` configuration and returns a safe admission summary for
deferred/quarantined writes.
