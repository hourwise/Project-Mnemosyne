# ADR-0035: Project Adrasteia Stage-A Memory Boundary

## Status

Accepted and implemented

## Date

2026-07-18

## Supersedes

[ADR-0034: Adoption of the Fates Dual-Principal and Compatibility Contract](ADR-0034-ADOPTION-OF-THE-FATES-DUAL-PRINCIPAL-AND-COMPATIBILITY-CONTRACT.md)
and the implementation-pending `ADR-XXXX-dual-principal-context-without-memory-authority`.

## Decision

Mnemosyne pins Project Adrasteia `project-runtime-contracts@0.4.0` from tag
`adrasteia-adoption-v0.4.0-protocol-1.4.0`, commit
`124b6aee2629a3147739934ad5f1b45b32c8ba46`. The release artifact SHA-256 is
`11ee062b079f74d2a4558af315c9b9b12a6aede291d409c48f038d93c416e2c2`.

Adrasteia validates portable representation. Mnemosyne governs memory. Ananke
governs actions. The adapter owns only pure canonical mapping, composition and
validation. Mnemosyne retains all domain records and algorithms.

Every governed operation receives trusted current context: distinct
authenticated human/service and acting agent principals, bounded resource scope,
correlation, purpose and historical portable references. The runtime binds to
one explicit project. References to approvals, grants, previous success,
reliability and state handles are evidence, never authorization.

Memory and portable outputs are classified and credential-filtered before
selection or rendering. Restricted data is excluded by default; sensitive data
requires an explicit trusted local evaluator. The credential detector is
high-confidence and incomplete. No encryption is introduced.

Runtime inspection and negotiation are canonical and sanitized. Ananke remains
an optional outbound advisory peer with no inbound decision API. Its absence
cannot broaden access.

## Deferred And Rollback

Content preflight is explicitly absent from the pinned Adrasteia baseline.
Provenance admission, active grant verification, inbound Ananke decisions,
encryption, multi-project mode and a state-handle service remain deferred.

Rollback removes the adapter and its focused boundary facade together, restores
the previous context-free APIs only in a separately reviewed migration, and
does not reinterpret historical approvals or grants as authority.

## Verification

`npm run verify:adrasteia`, `npm run test:adrasteia`, `npm run test:ananke`,
the complete test suite, inspection smoke, testbench and demos provide the
Stage-A evidence. The Ananke comparator is tested read-only at tag
`ananke-adrasteia-adoption-v0.1.0-protocol-1.4.0`, commit
`dcbb115c5798072221afdd2e4fdd36e786defddf`.
