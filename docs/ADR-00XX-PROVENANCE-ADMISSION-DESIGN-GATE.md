# ADR-00XX: Provenance Admission Design Gate

- **Status:** Accepted
- **Accepted:** 2026-07-12
- **Project:** Project Mnemosyne
- **Decision scope:** Persistent memory ingestion and portable-vault import
- **Required before:** Milestone 11 -- Provenance Admission
- **Related systems:** Content Surface Preflight, Project Ananke, Runtime Contracts
- **Supersedes:** None

This ADR records an accepted design for future implementation. It does not
describe current runtime behavior until implemented.

## Implementation Status

Milestone 11 implementation has started with item 14.1, provenance source
schemas. `@mnemosyne/schema` now exports `ProvenanceActor`,
`ProvenanceSourceKind`, and `ProvenanceSource`, with focused schema tests.

This is structural support only. `MemoryRecord` and `ProjectRecord` do not yet
carry a provenance envelope, and the repository does not yet implement Content
Surface Preflight, inbound Ananke decisions, admission states, storage isolation,
or admission gating.

## 1. Context

Mnemosyne accepts content from users, agents, project files, external systems,
restored vaults, derived summaries, and other runtimes.

Persisting content without first establishing its origin, authority, integrity,
and admission state creates several risks:

- Untrusted or unauthorised content may enter project memory.
- Tool output or imported content may be treated as user instruction.
- Provenance may be lost when several sources contribute to one memory.
- Imported vaults may carry reliability scores that are not valid in the receiving trust domain.
- Approval decisions may be reused after content changes.
- Deferred or quarantined content may accidentally become available to retrieval.
- Revalidation may overwrite or obscure the original admission history.

Milestone 11 will introduce schema changes, admission gating, revalidation, and
tests. Those changes may begin now that the admission contract and its
boundaries are accepted.

This ADR defines those accepted design decisions. It does not implement the Content
Surface Preflight service, the Ananke policy engine, or a general-purpose
content-truth engine.

## 2. Decision Summary

Mnemosyne SHALL place every item intended for persistent memory through a
provenance admission gate.

Admission requires:

1. A successful Content Surface Preflight result compatible with the supported contract version.
2. An applicable Ananke authority decision where the ingestion path requires authority evaluation.
3. Valid provenance for every contributing source.
4. Integrity binding between the evaluated content, the authority decision, and the stored content.
5. An explicit admission outcome:

   - `ADMITTED`
   - `REJECTED`
   - `DEFERRED`
   - `QUARANTINED`

Only `ADMITTED` content may enter normal retrieval, scoring, contradiction
analysis, compaction, or memory-derived prompting.

Promotion from `DEFERRED` or `QUARANTINED` to `ADMITTED` requires a fresh
validation pass. It is not a direct status toggle.

Admission and reliability are separate concepts:

- Admission determines whether content may participate in memory.
- Reliability estimates how strongly admitted content should be trusted.
- An authorised item is not necessarily reliable.
- A reliable-looking item is not necessarily authorised.

### 2.1 Candidate, admission, and attempt identity

`candidateId` identifies one immutable combination of:

- Canonical content.
- Source identity set.
- Target project or vault.

`admissionId` identifies one admission or revalidation cycle for that immutable
candidate in one trust domain.

`admissionAttempt` counts technical retries of the same admission cycle.

Therefore:

- A temporary dependency failure with unchanged content retains the same
  `candidateId` and `admissionId`, and increments `admissionAttempt`.
- Revalidation under a new policy or rule set retains the same `candidateId` and
  creates a new `admissionId`.
- A content or source change creates a new `candidateId` and a new `admissionId`.
- Replacement of an existing memory records `supersedesMemoryId`.
- Revalidation retains `revalidationOfAdmissionId`.

This prevents changed content from retaining an approval or preflight result
bound to an earlier candidate.

## 3. Content Surface Preflight Dependency and Versioning

### 3.1 Dependency direction

Mnemosyne SHALL depend on the Content Surface Preflight contract, not directly on
a specific preflight implementation.

The shared Content Surface Preflight request and result types SHALL be owned by
the shared Runtime Contracts package or by a dedicated independently versioned
contract package. Mnemosyne SHALL NOT define a structurally similar local copy.

The dependency SHALL be exposed through a narrow adapter interface.

Conceptually:

```ts
interface ContentSurfacePreflight {
  inspect(candidate: PreflightCandidate, context: PreflightContext): Promise<PreflightResult>;
}
```

Mnemosyne MUST NOT:

- Import private implementation modules from the preflight runtime.
- Reimplement preflight rules inside the admission service.
- Interpret absence of the preflight service as approval.
- Silently bypass preflight after an error or timeout.

The preflight implementation may run:

- In-process.
- As a local sidecar.
- Through an MCP or runtime adapter.
- Through another supported transport.

Transport choice is outside this ADR.

### 3.2 Required version fields

Every preflight result used for admission SHALL record:

```ts
interface PreflightVersionReference {
  contractVersion: string;
  implementationVersion?: string;
  ruleSetVersion: string;
  policyProfileId?: string;
}

interface SupportedPreflightContract {
  supportedContractRange: string;
}
```

The following meanings apply:

- `contractVersion` identifies the result schema and semantic contract.
- `implementationVersion` identifies the implementation that produced the result and is informational; it may use semantic versioning.
- `ruleSetVersion` identifies the actual checks applied and is an immutable identifier; it does not have to use semantic versioning.
- `policyProfileId` identifies an optional configured inspection profile.
- `supportedContractRange` identifies the semantic-version range accepted by the Mnemosyne adapter.

`contractVersion` uses semantic versioning. Every result records the exact
contract and rule-set versions used; a supported range is not a substitute for
those exact versions.

### 3.3 Compatibility rules

Mnemosyne SHALL use semantic-version compatibility for the preflight contract.

- Patch-version differences are compatible.
- Minor-version additions are compatible when all required fields remain present.
- Major-version differences require explicit adapter support.
- Unknown enum values SHALL be preserved during deserialization where possible and treated conservatively.
- An unsupported major version SHALL NOT be automatically admitted.

An unsupported or incomplete result normally produces:

```text
QUARANTINED / PREFLIGHT_VERSION_UNSUPPORTED
```

A temporarily unavailable preflight dependency normally produces:

```text
DEFERRED / PREFLIGHT_UNAVAILABLE
```

### 3.4 Integrity binding

The preflight result SHALL be bound to the canonical hash of the inspected
content.

```ts
interface PreflightBinding {
  candidateContentHash: string;
  canonicalizationVersion: string;
}
```

Any mutation that changes the canonical content hash invalidates the preflight
result and requires reinspection.

## 4. Covered Ingestion Paths

The admission gate applies to every path that can create or materially replace
persistent Mnemosyne content.

Covered paths include:

1. Initial project onboarding and repository ingestion.
2. Manual user-created memory.
3. Agent- or runtime-created memory.
4. File, document, image, archive, or dataset imports.
5. Connector and external-service imports.
6. Inter-project memory transfer.
7. Shared memory received from another runtime.
8. Portable-vault import or restoration.
9. Replication, backup recovery, and rehydration.
10. Migration or legacy-memory backfill.
11. Generated summaries, consolidations, and compaction outputs.
12. Derived memories created from one or more existing records.
13. Replacements or material edits to existing memory content.
14. Re-admission following policy, schema, or provenance changes.

The gate does not apply to:

- Read-only retrieval of already admitted memory.
- Transient context that is never persisted.
- Internal indexes that contain no new semantic content.
- Purely mechanical storage relocation where content, provenance, hashes, and admission state remain unchanged.

A content replacement is treated as a new candidate with a new `candidateId` and
`admissionId`. Existing admission does not transfer to changed content. The
replacement event records `supersedesMemoryId` when it replaces an existing
memory.

No persistence path may bypass admission by writing directly into the
admitted-memory store.

## 5. Inbound Ananke Decision Semantics

### 5.1 Responsibility boundary

Ananke decides whether an actor or runtime is authorised to perform the
ingestion operation.

Ananke does not decide:

- Whether the content is factually true.
- Whether a source is reliable.
- Whether two memories contradict one another.
- The final reliability score.
- How long a memory should remain useful.

Mnemosyne remains responsible for provenance completeness, admission state,
reliability, contradiction handling, decay, and retrieval eligibility.

### 5.2 Required decision binding

An Ananke decision used for admission SHALL be bound to:

- The canonical content hash.
- The requested ingestion operation.
- The target project or vault.
- The submitting actor or runtime.
- The relevant source identities.
- The policy version.
- Any approval identity.
- The decision expiry or validity window, when applicable.

A content mutation, target change, source substitution, or expired approval
invalidates the decision.

### 5.3 Outcome mapping

Inbound Ananke outcomes SHALL be interpreted as follows:

Mnemosyne SHALL consume a machine-readable Ananke reason-code classification for
failure retryability. It SHALL NOT infer permanence or retryability from a
human-readable message.

| Ananke outcome                                                          | Mnemosyne admission effect                          |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `COMPLETED`, with an explicit authorised decision                       | Continue provenance and preflight admission checks  |
| `DENIED`                                                                | `REJECTED`                                          |
| `WAITING_FOR_APPROVAL`                                                  | `DEFERRED`                                          |
| `APPROVAL_INVALIDATED`                                                  | `DEFERRED`, pending a new authority decision        |
| `STALE_STATE`                                                           | `DEFERRED`, pending state refresh and re-evaluation |
| `TIMED_OUT`                                                             | `DEFERRED`                                          |
| `FAILED` with explicitly retryable reason                               | `DEFERRED`                                          |
| `FAILED` with explicitly non-retryable reason                           | `REJECTED`                                          |
| `FAILED` with unknown retryability                                      | `QUARANTINED`                                       |
| `PARTIAL_SUCCESS` with an explicitly outstanding temporary prerequisite | `DEFERRED`                                          |
| Any other `PARTIAL_SUCCESS`                                             | `QUARANTINED`                                       |
| Missing or unrecognised outcome                                         | Fail closed; `QUARANTINED`                          |

Ananke authorisation is necessary where configured, but it is never sufficient
by itself for admission.

### 5.4 Fail-closed rule

Mnemosyne SHALL NOT convert an Ananke timeout, transport error, malformed
response, or missing decision into an implicit allow.

### 5.5 Previously approved content

An approval is not portable authority.

When content moves into another project, vault, tenant, machine trust domain, or
policy domain:

- The original Ananke decision SHALL be preserved as provenance and audit evidence.
- The receiving domain SHALL make a new local authority decision.
- The previous approval SHALL NOT automatically authorise local admission.

## 6. Single- and Multi-Source Provenance Placement

### 6.1 Record-level provenance

Every persistent memory record SHALL contain a provenance envelope.

```ts
interface MemoryProvenance {
  provenanceVersion: string;
  sources: ProvenanceSource[];
  derivation?: ProvenanceDerivation;
  claimBindings?: ProvenanceClaimBinding[];
  importedFrom?: PortableVaultOrigin;
}
```

Provenance SHALL be part of the memory record's durable schema rather than an
optional external annotation.

### 6.2 Single-source memory

A single-source memory SHALL contain exactly one source entry.

```ts
interface ProvenanceSource {
  sourceId: string;
  sourceKind: ProvenanceSourceKind;
  sourceLocator?: string;
  sourceContentHash?: string;
  sourceObservedAt?: string;
  ingestedAt: string;
  submittedBy: ProvenanceActor;
  title?: string;
  author?: string;
  publisher?: string;
  sourceVersion?: string;
  trustDomain?: string;
  metadata?: Readonly<Record<string, unknown>>;
}
```

A source locator may identify a file, repository path, URL, connector object,
runtime record, user statement, or other supported origin.

Credentials, access tokens, and secret connector parameters MUST NOT be stored in
provenance.

### 6.3 Multi-source memory

A multi-source memory SHALL preserve every contributing source independently.

It MUST NOT collapse several sources into a synthetic value such as:

```text
source: "multiple"
```

The record SHALL contain:

- One `ProvenanceSource` entry per contributing source.
- Stable source identifiers.
- Derivation information describing how the sources were combined.
- Claim-level source bindings when different claims depend on different sources.

Claim-level binding is required when:

- Sources disagree.
- A memory contains several independently sourced claims.
- Only part of a generated summary is supported by a particular source.
- Reliability needs to be calculated differently for separate claims.

```ts
interface ProvenanceClaimBinding {
  claimId: string;
  sourceIds: string[];
  relation: 'SUPPORTED_BY' | 'DERIVED_FROM' | 'CONTRADICTED_BY' | 'QUOTED_FROM' | 'REPORTED_BY';
}
```

### 6.4 Derived memory

Generated summaries, consolidations, transformations, and inferred memories
SHALL record a derivation object.

```ts
interface ProvenanceDerivation {
  derivationId: string;
  method:
    'SUMMARY' | 'EXTRACTION' | 'TRANSFORMATION' | 'INFERENCE' | 'MERGE' | 'MIGRATION' | 'USER_EDIT';
  parentMemoryIds?: string[];
  sourceIds: string[];
  runtimeId?: string;
  runtimeInstanceId?: string;
  modelProvider?: string;
  modelId?: string;
  toolId?: string;
  instructionHash?: string;
  createdAt: string;
}
```

Generated content does not become a primary source merely because it has been
stored by Mnemosyne.

## 7. Admission States and Behaviour

```ts
type ProvenanceAdmissionState = 'ADMITTED' | 'REJECTED' | 'DEFERRED' | 'QUARANTINED';
```

These admission states are defined by this accepted design. They are not current
`MemoryRecord.status` values.

### 7.1 Admitted

`ADMITTED` means the candidate has passed all currently required checks.

Admitted content may participate in:

- Retrieval.
- Ranking.
- Reliability scoring.
- Contradiction detection.
- Consolidation.
- Summarisation.
- Decay.
- Runtime context construction.

Admission does not assert factual correctness.

### 7.2 Rejected

`REJECTED` means a definitive rule or authority decision prevents admission.

Examples include:

- Explicit Ananke denial.
- Prohibited source class.
- Disallowed project boundary crossing.
- Known malicious or impermissible content.
- Permanent schema or policy violation.
- Invalid operation that cannot be remedied without resubmission.

Rejected content SHALL NOT enter the normal memory vault.

Mnemosyne SHALL retain a minimal rejection audit record containing:

- Candidate hash.
- Source identifiers where permitted.
- Decision and reason code.
- Actor and runtime identity.
- Correlation fields.
- Relevant policy and contract versions.
- Timestamp.

The rejected payload itself SHALL only be retained when policy explicitly permits
it.

A rejected candidate cannot be directly promoted. It must be submitted again as a
new admission attempt.

### 7.3 Deferred

`DEFERRED` means admission cannot yet be decided because an external or temporary
prerequisite is unresolved.

Examples include:

- Waiting for approval.
- Ananke timeout.
- Preflight service unavailable.
- Temporary connector failure.
- Stale authority state.
- Required metadata expected but not yet available.

Deferred content SHALL:

- Be stored only in a bounded staging area.
- Be excluded from retrieval and reliability scoring.
- Retain its original canonical hash.
- Retain its original admission attempt.
- Be safely retryable using the same idempotency key.
- Have an expiry or review policy.

A retry caused by a temporary dependency failure with unchanged content retains
the same `candidateId` and `admissionId`, and increments `admissionAttempt`.
Revalidation under a new policy or rule set retains the same `candidateId` but
creates a new `admissionId`. A content or source change creates a new
`candidateId` and `admissionId`.

### 7.4 Quarantined

`QUARANTINED` means the candidate exists and may be inspectable, but its content,
integrity, provenance, or compatibility is uncertain.

Examples include:

- Missing or contradictory provenance.
- Unsupported contract version.
- Invalid signature or hash mismatch.
- Suspicious instruction-bearing content.
- Unknown source type.
- Partial or malformed import.
- Imported reliability that cannot be locally verified.
- Vault manifest mismatch.
- An unrecognised Ananke response.
- An ingestion path that violated the expected admission protocol.

Quarantined content SHALL:

- Be isolated from admitted storage.
- Be excluded from retrieval, summarisation, scoring, and agent context.
- Preserve the full reason and evidence needed for review.
- Retain its original source and admission history.
- Be immutable apart from review metadata.

### 7.5 Expiry

Deferred and quarantined payloads SHALL have a configured retention deadline.
When that deadline expires without successful promotion, Mnemosyne SHALL append
a terminal `REJECTED` event using `DEFERRED_EXPIRED` or
`QUARANTINE_REVIEW_EXPIRED`, delete the retained candidate payload according to
policy, and preserve the minimal immutable audit record.

Any later ingestion requires a new `candidateId` and admission cycle.

### 7.6 Promotion

Promotion means moving a deferred or quarantined candidate into `ADMITTED`.

Promotion SHALL require:

1. A fresh preflight evaluation using a currently supported rule set.
2. A currently valid Ananke decision where required.
3. A canonical content-hash match.
4. Complete and valid provenance.
5. Any required local trust-domain validation.
6. A new immutable admission event.

Promotion SHALL NOT:

- Delete the prior deferred or quarantine event.
- Replace the original timestamps.
- Hide earlier failures.
- Reuse an invalidated content-bound approval.
- Directly mutate a rejected record into an admitted record.

If content changes during remediation, the corrected content is a new candidate
with a new content hash and admission attempt.

## 8. Revalidation

Admitted content may require revalidation when:

- The canonical content changes.
- The provenance changes.
- A source is replaced or withdrawn.
- A relevant preflight contract receives an unsupported major-version change.
- A preflight rule set is declared security-critical.
- The Ananke policy binding becomes invalid.
- Content crosses a project, tenant, or trust-domain boundary.
- A portable vault is imported.
- Integrity verification fails.
- A migration materially changes semantic content.
- A source is newly identified as compromised.
- Local policy explicitly requires periodic review.

Revalidation under a new policy or rule set SHALL retain the same `candidateId`,
create a new `admissionId`, and create a new admission event linked to the
earlier event through `revalidationOfAdmissionId`.

It SHALL NOT overwrite historical admission evidence.

Content that is under revalidation may remain admitted only where local policy
explicitly permits continued use. Security- or integrity-triggered revalidation
SHALL default to quarantine.

## 9. Audit, Idempotency, and Correlation Fields

### 9.1 Required admission event fields

Every admission-state event SHALL contain:

```ts
interface ProvenanceAdmissionEvent {
  eventId: string;
  admissionId: string;
  admissionAttempt: number;

  ingestionOperation: string;
  ingestionPath: string;

  correlationId: string;
  causationId: string;
  idempotencyKey: string;

  projectId: string;
  vaultId?: string;
  trustDomainId: string;
  memoryId?: string;
  candidateId: string;
  supersedesMemoryId?: string;

  runtimeId?: string;
  runtimeInstanceId?: string;
  sessionId?: string;
  taskId?: string;
  executionId?: string;

  actor: ProvenanceActor;

  sourceIds: string[];
  sourceIdentitySetHash: string;
  candidateContentHash: string;
  canonicalizationVersion: string;

  previousState?: ProvenanceAdmissionState;
  state: ProvenanceAdmissionState;
  decisionReasonCode: string;

  anankeDecisionId?: string;
  anankePolicyVersion?: string;
  anankeApprovalId?: string;
  anankeDecisionExpiresAt?: string;

  preflightResultId?: string;
  preflightContractVersion?: string;
  preflightImplementationVersion?: string;
  preflightRuleSetVersion?: string;
  preflightPolicyProfileId?: string;

  schemaVersion: string;
  occurredAt: string;
  sequence: number;

  parentAdmissionEventId?: string;
  revalidationOfAdmissionId?: string;
}
```

### 9.2 Field meanings

- `eventId` uniquely identifies the immutable event.
- `admissionId` identifies the logical admission process for one candidate.
- `admissionAttempt` increments for a technical retry of the same admission cycle.
- `ingestionOperation` records the operation used in the admission attempt.
- `ingestionPath` records which covered persistence entry point was used.
- `correlationId` links the admission to the wider task, workflow, or import.
- `causationId` identifies the immediate command or event that caused it.
- `idempotencyKey` prevents duplicate application of the same admission operation.
- `candidateId` identifies the staged candidate independently of an admitted memory.
- `trustDomainId` identifies the authority and reliability domain for the admission.
- `sourceIdentitySetHash` is an order-independent binding to the complete source set.
- `anankeDecisionExpiresAt` proves the authority result was valid when used.
- `supersedesMemoryId` distinguishes replacement from ordinary new ingestion.
- `memoryId` is present only after a memory identity has been assigned.
- `sequence` provides local ordering within the admission process.
- `parentAdmissionEventId` links state progression.
- `revalidationOfAdmissionId` links a new validation cycle to an earlier admission.

### 9.3 Idempotency scope

The default idempotency scope SHALL be:

```text
projectId
+ ingestion operation
+ candidate content hash
+ source identity set
+ trustDomainId
+ idempotencyKey
```

Where an operation targets an existing memory, `memoryId` SHALL also be included.

The same request repeated within this scope SHALL return the existing admission
result rather than creating duplicate memory.

Changing the content hash, source set, target project, or operation creates a new
idempotency scope.

`sourceIdentitySetHash` SHALL be calculated from the complete source identity set
using a canonical order-independent representation. It binds the admission to
the set of sources rather than to the order in which sources were presented.

### 9.4 Audit immutability

Admission events SHALL be append-only.

Corrections SHALL be represented through superseding events, not edits to
historical decisions.

Sensitive source metadata may be redacted according to policy, but the existence
and reason for the redaction SHALL remain auditable.

## 10. Reliability Treatment

### 10.1 Separation from admission

Reliability SHALL NOT be encoded into the admission state.

The following are invalid assumptions:

- `ADMITTED` means true.
- Ananke approval means reliable.
- Passing preflight means trustworthy.
- Multiple sources automatically mean high reliability.
- Imported reliability scores are locally authoritative.

Only admitted content may receive an effective Mnemosyne reliability score.

Rejected, deferred, and quarantined candidates SHALL have:

```text
reliabilityStatus: UNASSESSED
```

They SHALL be excluded from normal retrieval and ranking.

### 10.2 Reliability inputs

Reliability may consider:

- Source class.
- Source history.
- Directness of evidence.
- Corroboration.
- Contradiction.
- Recency.
- Stability over time.
- Whether content is quoted, extracted, inferred, or generated.
- Verification status.
- Human confirmation.
- Integrity and signature verification.

Preflight and authority results may constrain reliability, but SHALL NOT
independently establish it.

### 10.3 Multi-source reliability

Multi-source reliability SHALL be evaluated per claim where claim-level
provenance is available.

Mnemosyne SHALL NOT use a naive average of source scores where:

- Sources support different claims.
- Sources contradict each other.
- Several sources repeat the same upstream origin.
- One source is merely quoting another.
- Several generated summaries derive from the same primary source.

Source independence should be considered where the information is available.

Contradictory evidence SHALL produce or update contradiction records rather than
being silently averaged away.

### 10.4 Derived content

Derived memories SHALL have reliability bounded by:

- The reliability of their supporting sources.
- The quality and transparency of the derivation.
- Any unresolved contradictions.
- The extent to which the output adds unsupported inference.

A generated summary cannot have greater evidential reliability than its sources
merely because the summary is internally coherent.

## 11. Portable-Vault Treatment

### 11.1 Required portable data

A portable vault SHALL preserve:

- Memory content.
- Canonical content hashes.
- Full provenance envelopes.
- Claim-to-source bindings.
- Derivation records.
- Admission history.
- Reliability history.
- Contradiction records.
- Schema and contract versions.
- Source observation timestamps.
- Reliability-decay reference timestamps.
- Integrity manifest.
- Optional signatures.
- Redaction declarations.

These are accepted portability requirements; the current vault schema does not
contain all of these fields yet.

### 11.2 Reported and effective reliability

Imported memories SHALL distinguish between:

```ts
interface PortableReliability {
  reportedReliability?: number;
  reportedReliabilityModelVersion?: string;
  effectiveReliability?: number;
  effectiveReliabilityModelVersion?: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'VERIFICATION_FAILED';
}
```

`reportedReliability` is the score supplied by the originating vault.

`effectiveReliability` is the score accepted or recalculated by the receiving
Mnemosyne instance.

The receiving instance SHALL NOT silently copy the reported score into the
effective score.

### 11.3 Local re-admission

Every imported vault crosses an admission boundary.

The receiving instance SHALL:

1. Verify the vault manifest and hashes.
2. Preserve the original admission and reliability history.
3. Run local Content Surface Preflight checks.
4. Obtain a local Ananke decision where required.
5. Validate provenance compatibility.
6. Calculate or confirm local effective reliability.
7. Admit, defer, reject, or quarantine each imported record.

A valid signature may improve verification status but does not bypass local
admission policy.

### 11.4 Missing or invalid provenance

An imported record with missing, incompatible, or unverifiable provenance SHALL
default to:

```text
QUARANTINED / PORTABLE_PROVENANCE_UNVERIFIED
```

A vault-level integrity failure SHALL quarantine the affected import batch until
the scope of the failure is known.

A vault-manifest or batch-integrity failure SHALL quarantine the entire import
batch. Once the batch manifest is valid, record-specific admission failures SHALL
be isolated per record; valid records may be admitted independently while the
import batch reports a partial outcome.

### 11.5 Decay continuity

Portability SHALL preserve the original observation and reliability timestamps so
that moving a vault does not reset reliability decay.

A receiving instance may apply a different local decay policy, but it SHALL not
represent old content as newly observed merely because it was recently imported.

### 11.6 Secrets

Portable vaults MUST NOT include:

- API keys.
- OAuth tokens.
- Connector credentials.
- Private runtime secrets.
- Unredacted authentication material.

Portable provenance may contain stable source references, but credential
resolution remains local.

## 12. Storage Boundaries

Mnemosyne SHALL maintain logically distinct storage areas for:

- Admitted memory.
- Deferred candidates.
- Quarantined candidates.
- Admission and revalidation audit events.
- Minimal rejection records.

Deferred and quarantined content MUST NOT be accessible through the normal memory
query API.

Internal repository APIs SHALL make the distinction explicit. A generic "list all
memories" method MUST NOT accidentally include non-admitted candidates.

## 13. Reason-Code Families

Milestone 11 SHOULD define stable reason-code families including:

```text
AUTHORITY_*
PREFLIGHT_*
PROVENANCE_*
INTEGRITY_*
SCHEMA_*
PORTABLE_*
POLICY_*
SOURCE_*
REVALIDATION_*
INGESTION_*
```

Initial reason codes SHOULD include:

```text
AUTHORITY_DENIED
AUTHORITY_APPROVAL_REQUIRED
AUTHORITY_APPROVAL_INVALIDATED
AUTHORITY_STALE_STATE
AUTHORITY_UNAVAILABLE

PREFLIGHT_REJECTED
PREFLIGHT_UNAVAILABLE
PREFLIGHT_RESULT_INVALID
PREFLIGHT_VERSION_UNSUPPORTED

PROVENANCE_MISSING
PROVENANCE_INCOMPLETE
PROVENANCE_CONTRADICTORY
PROVENANCE_SOURCE_UNKNOWN

INTEGRITY_HASH_MISMATCH
INTEGRITY_SIGNATURE_INVALID
INTEGRITY_CANONICALIZATION_UNSUPPORTED

PORTABLE_MANIFEST_INVALID
PORTABLE_PROVENANCE_UNVERIFIED
PORTABLE_RELIABILITY_UNVERIFIED
PORTABLE_TRUST_DOMAIN_CHANGED

SCHEMA_VERSION_UNSUPPORTED
INGESTION_PATH_UNAUTHORISED
REVALIDATION_REQUIRED
DEFERRED_EXPIRED
QUARANTINE_REVIEW_EXPIRED
```

Reason codes SHALL be machine-readable and stable. Human-readable messages may
be added separately.

## 14. Milestone 11 Implementation Scope

Under this accepted ADR, Milestone 11 may implement:

1. Provenance source schemas.
2. Claim-level source bindings.
3. Derivation records.
4. Admission-state schemas.
5. Admission audit events.
6. Content-hash and idempotency binding.
7. Content Surface Preflight adapter integration.
8. Ananke decision mapping.
9. Covered-path admission gating.
10. Deferred and quarantine storage isolation.
11. Promotion and revalidation workflows.
12. Portable-vault re-admission.
13. Reliability import separation.
14. Serialization and schema tests.
15. Integration tests proving all persistent ingestion paths pass through admission.

Milestone 11 SHALL NOT implement:

- A replacement Ananke policy engine.
- A replacement Content Surface Preflight engine.
- Automatic factual truth determination.
- Generic malware analysis beyond the preflight contract.
- Cross-project authority inheritance.
- Automatic trust of portable-vault reliability.
- Direct querying of quarantined or deferred content by normal memory consumers.

## 15. Required Tests

Milestone 11 acceptance tests SHALL demonstrate:

### Schema and serialization

- Single-source provenance round-trips without loss.
- Multi-source provenance round-trips without source collapse.
- Claim bindings preserve source relationships.
- Unknown additive fields do not corrupt compatible records.
- Unsupported major versions fail conservatively.

### Ingestion gating

- Every covered persistent ingestion path invokes admission.
- Direct admitted-store writes are prevented.
- Transient, non-persisted context does not create admission records.
- Modified content invalidates prior preflight and authority bindings.

### Ananke mapping

- `DENIED` produces rejection.
- `WAITING_FOR_APPROVAL` produces deferral.
- Invalidated approval produces deferral and re-evaluation.
- Missing or malformed authority results fail closed.
- Previous-domain approval does not authorise portable-vault import.

### State isolation

- Deferred content is not returned by normal retrieval.
- Quarantined content is not returned by normal retrieval.
- Rejected payloads are not retained unless policy permits.
- Promotion creates a new event and preserves earlier history.
- Rejected content cannot be directly promoted.

### Idempotency and correlation

- Repeating an identical request does not create duplicate memory.
- Changed content creates a new admission attempt.
- Admission events retain correlation and causation links.
- Revalidation links to the prior admission without overwriting it.

### Reliability

- Admission does not automatically assign high reliability.
- Non-admitted content remains unassessed.
- Imported reported reliability is distinct from effective reliability.
- Multi-source contradictions are not hidden by averaging.
- Vault import preserves original decay timestamps.

### Portable vaults

- Valid manifests preserve provenance and history.
- Hash mismatch causes quarantine.
- Missing provenance causes quarantine.
- Local re-admission is required.
- Secrets are excluded from exported portable-vault data.

## 16. Consequences

### Positive

- Every persistent memory has inspectable lineage.
- Ananke authority decisions remain separate from factual reliability.
- Multi-source and derived memories retain meaningful evidence chains.
- Portable vaults remain auditable without becoming implicitly trusted.
- Deferred and suspicious content cannot contaminate retrieval.
- Approval mutation and replay risks are reduced through content binding.
- Revalidation preserves historical decisions rather than rewriting them.
- Mnemosyne gains a stable foundation for future trust, contradiction, and memory-quality work.

### Costs

- Ingestion becomes more complex.
- Additional schemas and storage areas are required.
- Imports may be slower because they require local revalidation.
- Provenance and audit records increase storage use.
- Some existing memory will require migration or quarantine.
- Integrations must supply stronger source identity and correlation data.

These costs are accepted trade-offs because silent admission of
untraceable memory would undermine Mnemosyne's primary purpose.

## 17. Final Decision

Mnemosyne will use a fail-closed provenance admission gate for all persistent
semantic content once Milestone 11 implements it.

Content Surface Preflight supplies content-surface inspection under a versioned
contract.

Ananke supplies content-bound authority decisions.

Mnemosyne owns:

- Provenance representation.
- Admission state.
- Storage isolation.
- Revalidation.
- Promotion.
- Reliability.
- Contradiction treatment.
- Portable-vault interpretation.

Only fully admitted content may participate in ordinary memory operations.

This accepted ADR authorises Milestone 11 schema, gating, revalidation, migration,
and test implementation.
