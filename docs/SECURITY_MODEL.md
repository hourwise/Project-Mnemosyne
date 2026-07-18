# Security Model

Mnemosyne exposes governed Almanac tools instead of raw filesystem access.

## Canonical Path Rule

Before file access, resolve the requested path, resolve symlinks, confirm it is inside the Almanac root, and deny otherwise.

Denied path escapes must create a `PATH_ESCAPE_DENIED` audit event.

## Write Rule

Mnemosyne writes only to its governed storage area. Project writes belong to Ananke.

## Stage-A Memory Boundary

Memory and portable-vault operations require trusted current context with a
bounded configured project scope. Model-visible MCP arguments cannot supply
identity. Tenant, project and workspace mismatch fails closed; remembered
approval/grant references, reliability and previous success never authorize an
operation. Ananke unavailability cannot widen access.

Records are classified before read, retrieval, context, Restart Pack, import and
export. Restricted material is excluded by default, sensitive material needs a
trusted local evaluator, and high-confidence credential material is rejected
before persistence. The detector is not complete DLP and encryption is deferred.
