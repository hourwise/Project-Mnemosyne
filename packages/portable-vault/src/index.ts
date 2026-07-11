import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  ProjectRecord,
  ProjectVaultExport,
  ProjectVaultIndex,
  ProjectVaultManifest,
  type ProjectRecord as ProjectRecordModel,
  type ProjectRecordKind,
  type ProjectRecordScope,
  type ProjectVaultExport as ProjectVaultExportModel,
  type ProjectVaultIndex as ProjectVaultIndexModel,
  type ProjectVaultIndexEntry,
  type ProjectVaultManifest as ProjectVaultManifestModel,
} from '@mnemosyne/schema';

const projectFile = 'project.json';
const indexFile = 'index.json';

export interface PortableVaultStoreOptions {
  now?: () => string;
}

export interface PortableVaultRecordFilter {
  kind?: ProjectRecordKind;
  scope?: ProjectRecordScope;
}

/**
 * File-backed portability layer for project records. This class is not exposed
 * as a raw MCP filesystem tool: all paths are derived from validated record
 * data and held inside the configured `.mnemosyne` root.
 */
export class PortableVaultStore {
  readonly root: string;
  private readonly now: () => string;

  constructor(root: string, options: PortableVaultStoreOptions = {}) {
    this.root = resolve(root);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async initialize(manifest: ProjectVaultManifestModel): Promise<ProjectVaultManifestModel> {
    const parsed = ProjectVaultManifest.parse(manifest);
    await mkdir(this.root, { recursive: true });
    const existing = await this.tryReadManifest();
    if (existing) {
      if (existing.projectId !== parsed.projectId) {
        throw new Error(`Vault project mismatch: expected ${existing.projectId}, received ${parsed.projectId}.`);
      }
      return existing;
    }

    await this.writeJson(projectFile, parsed);
    await this.writeJson(indexFile, {
      projectId: parsed.projectId,
      schemaVersion: '1.0',
      generatedAt: this.now(),
      records: [],
    });
    return parsed;
  }

  async writeRecord(record: ProjectRecordModel): Promise<ProjectRecordModel> {
    const parsed = ProjectRecord.parse(record);
    const manifest = await this.requireManifest();
    if (manifest.projectId !== parsed.projectId) {
      throw new Error(`Record ${parsed.id} belongs to ${parsed.projectId}, not vault project ${manifest.projectId}.`);
    }

    const path = recordPath(parsed);
    await this.writeJson(path, parsed);
    const index = await this.readIndex(manifest.projectId);
    const entry: ProjectVaultIndexEntry = {
      id: parsed.id,
      kind: parsed.kind,
      scope: parsed.scope,
      path,
      updatedAt: this.now(),
    };
    const records = [...index.records.filter((candidate) => candidate.id !== parsed.id), entry].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    await this.writeJson(indexFile, {
      ...index,
      generatedAt: this.now(),
      records,
    });
    await this.writeJson(projectFile, { ...manifest, updatedAt: this.now() });
    return parsed;
  }

  async getManifest(): Promise<ProjectVaultManifestModel> {
    return this.requireManifest();
  }

  async readRecord(id: string): Promise<ProjectRecordModel | undefined> {
    const manifest = await this.requireManifest();
    const index = await this.readIndex(manifest.projectId);
    const entry = index.records.find((candidate) => candidate.id === id);
    if (!entry) return undefined;
    const record = ProjectRecord.parse(await this.readJson(entry.path));
    if (record.id !== id || record.projectId !== manifest.projectId) {
      throw new Error(`Vault index entry ${id} does not match its record file.`);
    }
    return record;
  }

  async listRecords(filter: PortableVaultRecordFilter = {}): Promise<ProjectRecordModel[]> {
    const manifest = await this.requireManifest();
    const index = await this.readIndex(manifest.projectId);
    const matching = index.records.filter(
      (entry) => (!filter.kind || entry.kind === filter.kind) && (!filter.scope || entry.scope === filter.scope),
    );
    const records = await Promise.all(matching.map((entry) => this.readRecord(entry.id)));
    return records.filter((record): record is ProjectRecordModel => record !== undefined);
  }

  async exportVault(): Promise<ProjectVaultExportModel> {
    const manifest = await this.requireManifest();
    const records = await this.listRecords();
    return ProjectVaultExport.parse({ manifest, records });
  }

  async importVault(bundle: ProjectVaultExportModel): Promise<ProjectVaultExportModel> {
    const parsed = ProjectVaultExport.parse(bundle);
    const ids = new Set<string>();
    for (const record of parsed.records) {
      if (record.projectId !== parsed.manifest.projectId) {
        throw new Error(`Imported record ${record.id} belongs to a different project.`);
      }
      if (ids.has(record.id)) throw new Error(`Imported vault contains duplicate record ID: ${record.id}.`);
      ids.add(record.id);
    }
    await this.initialize(parsed.manifest);
    for (const record of parsed.records) await this.writeRecord(record);
    return this.exportVault();
  }

  private async requireManifest(): Promise<ProjectVaultManifestModel> {
    const manifest = await this.tryReadManifest();
    if (!manifest) throw new Error('Portable vault is not initialized.');
    return manifest;
  }

  private async tryReadManifest(): Promise<ProjectVaultManifestModel | undefined> {
    try {
      return ProjectVaultManifest.parse(await this.readJson(projectFile));
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  private async readIndex(projectId: string): Promise<ProjectVaultIndexModel> {
    const index = ProjectVaultIndex.parse(await this.readJson(indexFile));
    if (index.projectId !== projectId) throw new Error('Vault index project ID does not match the manifest.');
    return index;
  }

  private async readJson(relativePath: string): Promise<unknown> {
    return JSON.parse(await readFile(this.safePath(relativePath), 'utf8'));
  }

  private async writeJson(relativePath: string, value: unknown): Promise<void> {
    const path = this.safePath(relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  private safePath(relativePath: string): string {
    if (isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
      throw new Error(`Unsafe portable-vault path: ${relativePath}`);
    }
    const candidate = resolve(this.root, ...relativePath.split('/'));
    const relation = relative(this.root, candidate);
    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error(`Portable-vault path escapes its root: ${relativePath}`);
    }
    return candidate;
  }
}

function recordPath(record: ProjectRecordModel): string {
  return `${recordDirectory(record)}/${record.id}.json`;
}

function recordDirectory(record: ProjectRecordModel): string {
  if (record.scope === 'task_state') return 'task-state';
  if (record.scope === 'agent_performance') return 'agent-performance';
  switch (record.kind) {
    case 'decision':
      return 'decisions';
    case 'requirement':
      return 'requirements';
    case 'constraint':
      return 'constraints';
    case 'generated-output':
      return 'generated-context';
    case 'external-reference':
      return 'references';
    case 'conflict':
      return 'conflicts';
    case 'fact':
      return 'facts';
    case 'hypothesis':
    case 'observation':
      return 'observations';
    case 'task-state':
      return 'task-state';
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
