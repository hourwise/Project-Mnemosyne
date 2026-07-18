# Project Adrasteia Stage-A Adoption

Mnemosyne consumes the immutable `project-runtime-contracts@0.4.0` release from
Project Adrasteia. The exact repository, tag, commit, asset URL, checksums,
deferred families and verification commands are committed in
[`adrasteia-baseline.json`](./adrasteia-baseline.json).

## Implemented Boundary

`@mnemosyne/adrasteia-adapter` is pure mapping and validation only. It composes
canonical principal identity, `AgentExecutionContext`, `ResourceScope`,
correlation and portable references into Mnemosyne's current operation context.
It also builds schema-valid runtime identity, health, readiness, registration,
compatibility and semantic negotiation records.

Mnemosyne owns its memory, provenance, reliability, retrieval, conflicts,
Context Packs, portable vault, Restart Packs and audit meanings. Ananke owns
action policy, approval and governed execution. A valid portable schema, a
remembered approval, a stored grant reference, a reliability score or a state
handle is never current authority.

Each runtime is bound to one explicit project ID, with optional tenant and
workspace. Context is supplied by a trusted host or transport, not model tool
arguments. Missing, wildcard or mismatched scope fails closed. The CLI and demo
helpers are explicitly local-only and use distinct service and agent principals.

## Classified Outputs And Credentials

Public and internal records are usable only within the configured project.
Restricted records are excluded from retrieval, Context Packs, Restart Packs and
exports by default. Sensitive inclusion needs an explicit trusted evaluator for
the exact operation and purpose. Filtering happens before token budgeting and
rendering; output can report exclusion counts but never excluded contents.

The local guard rejects high-confidence private-key blocks, authorization
headers, bearer tokens and recognised secret-bearing structured fields before
Almanac or vault persistence/import. Detection is intentionally incomplete and
pluggable; it is not complete DLP, encryption, a credential broker, or key
management.

## Runtime And Ananke

`MnemosyneRuntime` exposes transport-neutral `runtimeIdentity`, `runtimeHealth`,
`runtimeReadiness`, `runtimeRegistration`, `compatibilityManifest`, `inspect`
and `negotiateProtocol` methods. MCP also exposes sanitized inspection and
negotiation, without inventing an HTTP, stdio or SSE service.

The optional Ananke integration remains outbound advisory-only. Safe runtime,
correlation, scope, principal-reference and audit-reference metadata can be
attached. It never sends raw memory content or snippets by default, never
mutates memory on notification delivery, and has no inbound decision endpoint.
Ananke unavailability degrades only advisory integration; it never widens memory
access or action authority.

## Deferred

- Shared content preflight and full provenance admission
- Inbound Ananke decision transport and active grant verification
- Encryption/key management and a distributed state-handle service
- Multi-project service mode, Horae orchestration and Moirae transport claims
