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

No shared cross-runtime event schema is implemented in this repository.
Mnemosyne currently records only its own local notification-attempt audit:

- `ANANKE_NOTIFICATION_SENT`
- `ANANKE_NOTIFICATION_FAILED`

These are Mnemosyne audit events, not imported copies of Ananke's action audit.
The `CONFLICT_DETECTED` and other memory audit events remain local as well; an
Ananke event is not copied, acknowledged, or reconciled by this adapter.

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
- With `NoopAnankeAdapter`, the bridge returns `delivered: true` and records
  `ANANKE_NOTIFICATION_SENT` after the local no-op completes. That result means
  only that the configured adapter completed; it is not evidence that Ananke
  received a notification or made an action decision.
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

There is no implemented behavior that turns a missing Mnemosyne notification
into approval or into a particular Ananke decision. Ananke or the action caller
must apply its own policy when Mnemosyne cannot provide context. This is a
compatibility requirement, not yet a full runtime handshake or fallback
protocol.

## Supported Correlation Identifiers

Current repository evidence supports these correlation anchors, but not as
formal fields in a shared protocol:

- conflict IDs
- memory IDs
- task text in context notifications
- Mnemosyne audit timestamps

Stage-A notifications may carry safe Project Adrasteia source runtime,
request/correlation/causation, tenant/project/workspace, acting-principal and
audit-reference metadata. They do not carry raw memory text, snippets, task text
or credentials by default. The adapter remains outbound-only and does not invent
an inbound Ananke decision surface.

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

Runtime identity and protocol compatibility are now exposed by Mnemosyne's
transport-neutral inspection facade. Notification delivery still does not imply
that Ananke received, approved or executed anything.
