# Ananke Boundary

This document formalizes the current repository boundary between Mnemosyne's
memory governance and Ananke's action governance.

## Evidence Basis

- `packages/ananke-adapter/src/index.ts`
- `packages/ananke-adapter/src/index.test.ts`
- `packages/runtime-core/src/index.ts`
- [ANANKE_INTEGRATION.md](../ANANKE_INTEGRATION.md)
- [ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md](../ADR-0033-FRICTIONLESS-VALIDATION-AND-ECOSYSTEM-COMPATIBILITY.md)

## Authority Split

Mnemosyne owns:

- memory records
- provenance and source references
- reliability scoring and revalidation
- conflict detection
- context-pack construction
- restart-pack construction
- local audit of Mnemosyne notification attempts

Ananke owns:

- whether an action may proceed
- approval or blocking decisions
- action-side policy enforcement
- Ananke's own authoritative execution audit

Mnemosyne may advise Ananke. It does not grant permission, execute tools on
Ananke's behalf, or override Ananke's decision-making.

## Current Integration Shape

Current repository code implements a one-way outbound boundary:

- Mnemosyne produces memory-safety notifications.
- `AnankeSafetyBridge` translates those into `AnankeNotification` values.
- An adapter sends the notification or reports failure.

The current repository does not implement an inbound Ananke decision API inside
Mnemosyne.

## Outbound Notification Reasons

| Reason                        | Trigger in current code                                       | Metadata shape                                                                             |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CONFLICT_DETECTED`           | A surfaced conflict other than `active_memory_source_missing` | `conflictId`, `conflictType`, `memoryIds`, `shouldAnankeContinue`, `recommendedResolution` |
| `SOURCE_MISSING`              | `active_memory_source_missing` conflict                       | Same conflict metadata as above                                                            |
| `LOW_RELIABILITY_CONTEXT`     | Context-pack warnings matching `/low-reliability/i`           | `task`, `warnings`                                                                         |
| `ACTION_CONTEXT_INSUFFICIENT` | A context pack with zero relevant memories                    | `task`, `openQuestions`                                                                    |

## Shared Events And Local Audit

Mnemosyne currently records only its own local notification-attempt audit:

- `ANANKE_NOTIFICATION_SENT`
- `ANANKE_NOTIFICATION_FAILED`

These are Mnemosyne audit events, not imported copies of Ananke's action audit.

## Governed-Action References

Current repository code does not define a shared action ID, approval ID, or
governed operation reference between Mnemosyne and Ananke.

What is currently shared instead is memory-context metadata, such as:

- conflict IDs
- conflict types
- related memory IDs
- task text
- warning text
- recommended resolutions

## Behavior When Ananke Is Unavailable

Current implementation is explicit:

- `NoopAnankeAdapter` allows Mnemosyne to run without an external Ananke
  transport.
- If an adapter throws, `AnankeSafetyBridge` catches the error, records
  `ANANKE_NOTIFICATION_FAILED`, and returns `delivered: false`.
- Notification failure does not mutate Almanac memory.

This behavior is tested directly.

## Behavior When Mnemosyne Is Unavailable

The current repository does not implement a negotiated fallback protocol for
"Mnemosyne unavailable" at cross-runtime startup time.

The strongest current statement is the ecosystem rule documented in ADR-0033
and the integration docs:

- Mnemosyne failure must not bypass Ananke authority.

That is a compatibility requirement, not yet a full runtime handshake protocol.

## Supported Correlation Identifiers

Current repository evidence supports these correlation anchors:

- conflict IDs
- memory IDs
- task text in context notifications
- Mnemosyne audit timestamps

The docs mention future shared fields such as runtime identity and protocol
version, but those fields are not implemented in the current notification
payloads.

## Non-Goals In The Current Repository

Current code does not make Mnemosyne responsible for:

- action approval
- tool execution
- policy enforcement for external side effects
- copying Ananke's authoritative action audit into Mnemosyne storage
- deciding whether `shouldAnankeContinue` is binding

`shouldAnankeContinue` is forwarded as metadata, but the bridge does not act on
it locally.

## Open Questions

### Whether Ananke Events Are Copied, Referenced, Or Summarized

Current repository evidence settles only one part of this question: Mnemosyne
records local notification-attempt audit events. It does not yet define whether
Ananke's own event stream should later be copied into Mnemosyne, linked by
reference, or summarized.

### Shared Runtime Identity

Existing docs name timestamp, runtime identity, and future protocol fields as
desired correlation points, but current code exposes only timestamps and
notification metadata.
