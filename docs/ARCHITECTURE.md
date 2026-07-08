# Architecture

Mnemosyne is structured as focused TypeScript workspace packages, matching Project Ananke's monorepo style.

```text
AI Client -> Mnemosyne Runtime -> Almanac Store
                      |
                      +-> Workspace Guard
                      +-> Reliability Engine
                      +-> Retrieval Engine
                      +-> Conflict Engine
                      +-> Audit Engine
                      +-> Ananke Adapter
```

The runtime exposes governed Almanac operations only. Raw filesystem reads and writes are not exposed as agent tools.
