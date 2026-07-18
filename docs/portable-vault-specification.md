# Portable Vault Specification

This document describes the portable-vault behavior implemented in the current
repository.

## Scope

The portable vault is a human-readable, file-backed storage layer for
`ProjectRecord` data. It is separate from `.project-Mnemosyne/almanac/` and is
used by the runtime and CLI through validated record operations rather than raw
filesystem exposure.

## Evidence Basis

- `packages/schema/src/index.ts`
- `packages/portable-vault/src/index.ts`
- `packages/runtime-core/src/index.ts`
- `packages/cli/src/index.ts`
- `packages/portable-vault/src/index.test.ts`
- `packages/runtime-core/src/index.test.ts`

## Default Location

`MnemosyneRuntime` defaults the vault root to:

```text
<projectRoot>/.mnemosyne
```

The CLI exposes:

- `mnemosyne vault-init`
- `mnemosyne vault-list`
- `mnemosyne vault-write`
- `mnemosyne vault-export`
- `mnemosyne vault-import`

## Implemented Directory Layout

The current store creates `project.json`, `index.json`, and per-record
directories derived from record kind and scope.

```text
.mnemosyne/
|- project.json
|- index.json
|- agent-performance/
|- conflicts/
|- constraints/
|- decisions/
|- facts/
|- generated-context/
|- observations/
|- references/
|- requirements/
`- task-state/
```

Directory selection is currently implemented as follows:

- `scope: task_state` -> `task-state/`
- `scope: agent_performance` -> `agent-performance/`
- `kind: decision` -> `decisions/`
- `kind: requirement` -> `requirements/`
- `kind: constraint` -> `constraints/`
- `kind: generated-output` -> `generated-context/`
- `kind: external-reference` -> `references/`
- `kind: conflict` -> `conflicts/`
- `kind: fact` -> `facts/`
- `kind: hypothesis` or `kind: observation` -> `observations/`

## Record Identity

Portable-vault identity is record-centric:

- The vault manifest is keyed by `projectId`.
- Every record has an `id` and `projectId`.
- `writeRecord()` rejects records whose `projectId` does not match the manifest.
- `index.json` maintains one entry per record ID and requires IDs to be unique.

The ID format is enforced by `EntityId`:

```text
^[a-z][a-z0-9_]*_[a-z0-9][a-z0-9_-]*$
```

## Schema Versioning

Current vault schema version is fixed to:

```text
1.0
```

Both `ProjectVaultManifest` and `ProjectVaultIndex` require `schemaVersion:
"1.0"`.

## Record Content

Each `ProjectRecord` currently contains:

- Record identity and project identity
- Kind and scope
- Primary `content`
- `sources` and optional `evidence`
- `createdAt` and optional `lastVerifiedAt`
- `reliability`
- `status`
- Optional `owner`, `validFrom`, `validUntil`
- Supersession and contradiction links
- `accessClassification`
- Tags

## Source References

Portable-vault records do not copy source files into the vault. Instead, they
retain `SourceReference` values conventionally interpreted as project-relative
source locations with:

- `artifactId`
- `path`
- `contentHash`
- `sourceType`
- Optional `heading`, `lineStart`, and `lineEnd`

`SourceReference.path` must remain relative and may not contain absolute paths or
`..` traversal. The schema does not verify that the referenced file exists beneath
a configured project root.

## Initialization

`initialize()`:

- creates the vault root if needed
- writes `project.json` and `index.json` when the vault is new
- returns the existing manifest unchanged if the vault already exists for the
  same project
- rejects initialization against an existing vault with a different `projectId`

When a vault already exists for the same project, `initialize()` does not replace
its manifest with the supplied manifest. Later import writes therefore use the
existing manifest's project identity, name, and creation timestamp; each record
write refreshes the manifest's `updatedAt` value.

## Import And Export Validation

`exportVault()` currently returns:

```json
{
  "manifest": {
    "projectId": "project_mnemosyne",
    "name": "Project Mnemosyne",
    "schemaVersion": "1.0",
    "createdAt": "2026-07-11T00:00:00.000Z",
    "updatedAt": "2026-07-11T00:00:00.000Z"
  },
  "records": []
}
```

`importVault()` validates that:

- the bundle matches `ProjectVaultExport`
- every imported record matches the bundle manifest `projectId`
- record IDs are unique inside the bundle

Import then writes each record through the normal `writeRecord()` path, so the
same schema and path checks apply during import as during local writes.

Bundle validation and duplicate-ID checks happen before the first write. Records
are then written sequentially; the repository does not provide a transaction or
rollback if a later write fails. Import also does not check that referenced source
files exist or that their current hashes match.

## Path Restrictions

The portable-vault store never accepts a caller-supplied output path for a
record. Instead it derives the destination from validated record data.

Internal path safety rules:

- absolute paths are rejected
- `..` path traversal is rejected
- resolved paths must remain inside the configured vault root

## Unknown-Field Behavior

This behavior is inferred from the current implementation.

`PortableVaultStore` parses records and manifests with Zod object schemas before
writing them back to disk. Because those schemas are not declared with
`.strict()`, unknown object fields are not preserved by the parse-then-write
flow. In practice, extra fields should be treated as non-portable unless the
schema is extended to include them.

## Merge And Conflict Behavior

Current import behavior is per-record overwrite-by-ID, not merge-by-history:

- if a record ID already exists, `writeRecord()` overwrites that record file and
  refreshes the matching index entry
- no three-way merge is attempted
- no automatic `ConflictRecord` is created during import
- duplicate IDs inside an import bundle are rejected before writing
- records absent from the import bundle are not deleted

## Secrets And Exclusions

The current repository does not implement:

- secret detection
- redaction during export
- access-classification-based export filtering
- encryption of vault files

`accessClassification` is enforced at the public vault boundary. Every
initialize, read, list, write, export and import call requires trusted current
context that matches the runtime's configured project. Restricted records are
excluded from export; sensitive records require an exact trusted evaluator;
public/internal records remain limited to the matching project. Filtering and
credential inspection occur before data is returned or rendered.

## Portability Guarantees

Current repository evidence supports these guarantees for a new vault or a
matching existing vault:

- portable-vault files are human-readable JSON
- record IDs and known schema fields round-trip through export and import; a new
  target preserves the exported manifest, while a matching existing target keeps
  its existing project identity, name, and creation timestamp and refreshes
  `updatedAt` as records are written
- record scope boundaries are schema-validated
- source references remain relative, source-linked metadata rather than copied
  source blobs
- all stored paths stay inside the configured vault root

## Portability Non-Guarantees

The current repository does not guarantee:

- merge conflict resolution during import
- preservation of unknown fields
- complete secret detection or encryption
- copied source content availability outside the originating project
- automatic recomputation of reliability after import
- automatic handling for renamed or moved source files
- replacement of an existing manifest's metadata during import

## Open Questions

### Moved-Source Handling

The vault stores relative source paths and content hashes, but current code does
not define a repair or remapping flow when a source file moves without changing
its meaning.

### Reliability Portability

Reliability is part of the stored record and round-trips through export/import,
but current repository evidence does not define whether importers should trust
that score as-is or recompute it locally. Imported reliability remains evidence,
not current authority.
