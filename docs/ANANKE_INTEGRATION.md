# Ananke Integration

Mnemosyne should notify Ananke when memory state affects action safety.

Initial notification reasons:

- `CONFLICT_DETECTED`
- `LOW_RELIABILITY_CONTEXT`
- `SOURCE_MISSING`
- `ACTION_CONTEXT_INSUFFICIENT`

Ananke can then block, warn, or require approval before project-changing actions proceed.
