# ADR-XXXX: Mnemosyne Handling of Dual-Principal Context Without Memory-Derived Authority

> **Historical status override:** Superseded by [ADR-0035](ADR-0035-ADRASTEIA-STAGE-A-MEMORY-BOUNDARY.md) on 2026-07-18.

- **Status:** Accepted — implementation pending
- **Date:** 2026-07-14
- **Parent decision:** Dual-Principal Identity, Scoped MCP Delegation, and Cross-Runtime Compatibility
- **Supersedes:** ADR-0034: Adoption of the Fates Dual-Principal and Compatibility Contract
- **Related decision:** MCP 2026-07-28 Stateless Compatibility Architecture
- **Project:** Project Mnemosyne
- **Decision scope:** Governed memory ingestion, retrieval, provenance, context handles, and authority separation

## Context

Mnemosyne stores evidence, prior outcomes, user preferences, provenance, and workflow history. Those records may describe previous permission or approval, but they are not current authority.

Stateless MCP also means project, tenant, user, agent, and retrieval scope cannot be assumed from a previous protocol session or process connection.

## Decision

Every Mnemosyne operation SHALL receive or resolve explicit current request context containing:

- authenticated or delegating principal;
- acting agent/runtime principal;
- represented principal where applicable;
- tenant, project, workspace, and resource scope;
- purpose;
- workflow and correlation identifiers;
- compatibility and protocol-era metadata;
- applicable current Ananke decision where required.

Mnemosyne MAY store and retrieve evidence about authority. It SHALL NOT mint, renew, reconstruct, or enlarge authority.

## Memory is evidence, not permission

Mnemosyne may remember:

- prior approvals;
- prior grants;
- tool history;
- policy decisions;
- user preferences;
- workflow outcomes;
- reliability assessments.

It MUST NOT interpret those records as current permission.

A new governed action requires current validation by Ananke even when an identical action was approved previously.

## Context and state handles

Mnemosyne MAY expose opaque handles for:

- retrieval contexts;
- context packs;
- vault operations;
- long-running ingestion;
- revalidation jobs.

A handle SHALL:

- be high entropy and opaque;
- be bound to tenant, project, and intended use;
- expire or be revocable where practical;
- be independently authorised on every use;
- never be accepted solely because the caller possesses it;
- be redacted from model context and logs where unnecessary.

## Request-explicit retrieval

Retrieval SHALL not rely on:

- MCP session state;
- stdio process identity alone;
- a previous workspace selection;
- remembered user preference;
- a state handle without current scope validation.

Retrieval results SHALL be filtered to current tenant, project, access classification, purpose, and policy context.

## Provenance and correlation

Every memory record created from a governed workflow SHOULD retain:

- request and correlation identifiers;
- workflow, execution, step, and attempt references;
- source runtime and acting principal;
- delegating or represented principal where appropriate;
- tenant and project scope;
- source operation;
- preflight and admission receipt references;
- Ananke decision and approval references, as historical evidence only;
- protocol version and era where useful for reconstruction.

Secrets and reusable credentials SHALL never be stored.

## Admission boundary

A memory record SHALL not be admitted merely because:

- the source tool call succeeded;
- the source action was approved;
- the content came from a known MCP server;
- the content was returned through a trusted transport.

Content Surface Preflight, provenance admission, and authority remain separate checks.

## Resumption and stale state

When a memory context is resumed through a handle, Mnemosyne SHALL verify:

- handle validity;
- current principal binding;
- tenant/project/resource scope;
- current access policy;
- content and provenance freshness;
- applicable expiry or revocation.

A mismatched or stale handle SHALL produce a typed failure, not an empty or broader retrieval.

## Security invariants

1. No memory record grants current authority.
2. No prior approval is silently renewed.
3. No state handle acts as a bearer credential.
4. No cross-tenant retrieval occurs from handle possession or cached context.
5. No secret, capability token, or reusable credential enters persistent memory.
6. Reliability score does not imply admission or authority.
7. Unavailable Ananke does not cause Mnemosyne to infer permission.

## Implementation sequence

1. Import canonical principal, request, scope, correlation, and handle contracts.
2. Add request-explicit scope to public adapters.
3. Add handle binding, expiry, and mismatch checks.
4. Add provenance fields for workflow and principal attribution.
5. Add tests proving remembered approval cannot authorise a new action.
6. Add tests for leaked, stale, cross-project, and cross-tenant handles.
7. Add protocol-era compatibility metadata without coupling memory logic to MCP transport.

## Acceptance criteria

- Every retrieval and ingestion operation has explicit current scope.
- Remembered approval cannot be converted into an active grant.
- State handles fail on principal, tenant, project, purpose, or expiry mismatch.
- Provenance can trace records to exact workflow attempts.
- Mnemosyne remains usable standalone with an explicit local authority policy or deny-by-default adapter.
