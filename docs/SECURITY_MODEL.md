# Security Model

Mnemosyne exposes governed Almanac tools instead of raw filesystem access.

## Canonical Path Rule

Before file access, resolve the requested path, resolve symlinks, confirm it is inside the Almanac root, and deny otherwise.

Denied path escapes must create a `PATH_ESCAPE_DENIED` audit event.

## Write Rule

Mnemosyne writes only to its governed storage area. Project writes belong to Ananke.
