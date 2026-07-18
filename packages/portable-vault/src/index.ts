import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { assertContextWithinRuntimeScope, attributionFromContext, type MnemosyneOperationContext, type MnemosyneRuntimeScope } from '@mnemosyne/adrasteia-adapter';
import { CredentialMaterialDetectedError, CredentialMaterialGuard, MemoryAccessEvaluator, safeCredentialAuditMetadata } from '@mnemosyne/memory-boundary';
import { ProjectRecord, ProjectVaultExport, ProjectVaultIndex, ProjectVaultManifest, type ProjectRecord as ProjectRecordModel, type ProjectRecordKind, type ProjectRecordScope, type ProjectVaultExport as ProjectVaultExportModel, type ProjectVaultIndex as ProjectVaultIndexModel, type ProjectVaultIndexEntry, type ProjectVaultManifest as ProjectVaultManifestModel } from '@mnemosyne/schema';

const projectFile = 'project.json';
const indexFile = 'index.json';

export interface PortableVaultStoreOptions {
  now?: () => string;
  runtimeScope: MnemosyneRuntimeScope;
  accessEvaluator?: MemoryAccessEvaluator;
  credentialGuard?: CredentialMaterialGuard;
  onCredentialMaterialRejected?: (metadata: Record<string, unknown>) => void;
}
export interface PortableVaultRecordFilter { kind?: ProjectRecordKind; scope?: ProjectRecordScope; }

/** File-backed portable records with scope, classification and credential checks at every public boundary. */
export class PortableVaultStore {
  readonly root: string;
  private readonly now: () => string;
  private readonly access: MemoryAccessEvaluator;
  private readonly guard: CredentialMaterialGuard;

  constructor(root: string, private readonly options: PortableVaultStoreOptions) {
    this.root = resolve(root);
    this.now = options.now ?? (() => new Date().toISOString());
    this.access = options.accessEvaluator ?? new MemoryAccessEvaluator();
    this.guard = options.credentialGuard ?? new CredentialMaterialGuard();
  }

  async initialize(contextValue: unknown, manifest: ProjectVaultManifestModel): Promise<ProjectVaultManifestModel> {
    const context = this.context(contextValue);
    const parsed = ProjectVaultManifest.parse(manifest);
    this.assertProject(context, parsed.projectId);
    await mkdir(this.root, { recursive: true });
    const existing = await this.tryReadManifest();
    if (existing) {
      if (existing.projectId !== parsed.projectId) throw new Error(`MNEMOSYNE_VAULT_PROJECT_MISMATCH:${existing.projectId}`);
      return existing;
    }
    await this.writeJson(projectFile, parsed);
    await this.writeJson(indexFile, { projectId: parsed.projectId, schemaVersion: '1.0', generatedAt: this.now(), records: [] });
    return parsed;
  }

  async writeRecord(contextValue: unknown, record: ProjectRecordModel): Promise<ProjectRecordModel> {
    const context = this.context(contextValue);
    const parsed = ProjectRecord.parse({ ...record, attribution: attributionFromContext(context) });
    this.assertProject(context, parsed.projectId);
    this.access.assertAllowed(context, 'write', parsed);
    this.assertCredentialSafe(parsed);
    const manifest = await this.requireManifest();
    if (manifest.projectId !== parsed.projectId) throw new Error(`MNEMOSYNE_VAULT_PROJECT_MISMATCH:${parsed.projectId}`);
    const path = recordPath(parsed);
    await this.writeJson(path, parsed);
    const index = await this.readIndex(manifest.projectId);
    const entry: ProjectVaultIndexEntry = { id: parsed.id, kind: parsed.kind, scope: parsed.scope, path, updatedAt: this.now() };
    const records = [...index.records.filter((candidate) => candidate.id !== parsed.id), entry].sort((a, b) => a.id.localeCompare(b.id));
    await this.writeJson(indexFile, { ...index, generatedAt: this.now(), records });
    await this.writeJson(projectFile, { ...manifest, updatedAt: this.now() });
    return parsed;
  }

  async getManifest(contextValue: unknown): Promise<ProjectVaultManifestModel> {
    const context = this.context(contextValue);
    const manifest = await this.requireManifest();
    this.assertProject(context, manifest.projectId);
    return manifest;
  }

  async readRecord(contextValue: unknown, id: string): Promise<ProjectRecordModel | undefined> {
    const context = this.context(contextValue);
    const record = await this.readRecordUnchecked(id);
    if (!record) return undefined;
    this.assertProject(context, record.projectId);
    this.access.assertAllowed(context, 'read', record);
    return record;
  }

  async listRecords(contextValue: unknown, filter: PortableVaultRecordFilter = {}): Promise<ProjectRecordModel[]> {
    const context = this.context(contextValue);
    const records = await this.listRecordsUnchecked(filter);
    return this.access.filter(context, 'read', records.filter((record) => record.projectId === context.scope.projectId)).records;
  }

  async exportVault(contextValue: unknown): Promise<ProjectVaultExportModel> {
    const context = this.context(contextValue);
    const manifest = await this.requireManifest();
    this.assertProject(context, manifest.projectId);
    const filtered = this.access.filter(context, 'export', await this.listRecordsUnchecked());
    for (const record of filtered.records) this.assertCredentialSafe(record);
    return ProjectVaultExport.parse({ manifest, records: filtered.records, exclusions: filtered.excluded });
  }

  /** Every record is validated before writes. A later filesystem failure can leave a documented partial import. */
  async importVault(contextValue: unknown, bundle: ProjectVaultExportModel): Promise<ProjectVaultExportModel> {
    const context = this.context(contextValue);
    const parsed = ProjectVaultExport.parse(bundle);
    this.assertProject(context, parsed.manifest.projectId);
    const ids = new Set<string>();
    for (const record of parsed.records) {
      if (record.projectId !== parsed.manifest.projectId) throw new Error(`MNEMOSYNE_IMPORT_CROSS_PROJECT:${record.id}`);
      if (ids.has(record.id)) throw new Error(`MNEMOSYNE_IMPORT_DUPLICATE_ID:${record.id}`);
      ids.add(record.id);
      this.access.assertAllowed(context, 'import', record);
      this.assertCredentialSafe(record);
    }
    await this.initialize(context, parsed.manifest);
    for (const record of parsed.records) await this.writeRecord(context, record);
    return this.exportVault(context);
  }

  private context(value: unknown): MnemosyneOperationContext { return assertContextWithinRuntimeScope(value, this.options.runtimeScope); }
  private assertProject(context: MnemosyneOperationContext, projectId: string): void { if (context.scope.projectId !== projectId) throw new Error('MNEMOSYNE_SCOPE_MISMATCH:projectId'); }
  private assertCredentialSafe(value: unknown): void {
    try { this.guard.assertSafe(value); }
    catch (error) {
      if (error instanceof CredentialMaterialDetectedError) this.options.onCredentialMaterialRejected?.(safeCredentialAuditMetadata(error));
      throw error;
    }
  }
  private async requireManifest(): Promise<ProjectVaultManifestModel> {
    const manifest = await this.tryReadManifest();
    if (!manifest) throw new Error('MNEMOSYNE_VAULT_NOT_INITIALIZED');
    return manifest;
  }
  private async tryReadManifest(): Promise<ProjectVaultManifestModel | undefined> {
    try { return ProjectVaultManifest.parse(await this.readJson(projectFile)); }
    catch (error) { if (isMissingFile(error)) return undefined; throw error; }
  }
  private async readRecordUnchecked(id: string): Promise<ProjectRecordModel | undefined> {
    const manifest = await this.requireManifest();
    const index = await this.readIndex(manifest.projectId);
    const entry = index.records.find((candidate) => candidate.id === id);
    if (!entry) return undefined;
    const record = ProjectRecord.parse(await this.readJson(entry.path));
    if (record.id !== id || record.projectId !== manifest.projectId) throw new Error(`MNEMOSYNE_VAULT_INDEX_MISMATCH:${id}`);
    return record;
  }
  private async listRecordsUnchecked(filter: PortableVaultRecordFilter = {}): Promise<ProjectRecordModel[]> {
    const manifest = await this.requireManifest();
    const index = await this.readIndex(manifest.projectId);
    const matching = index.records.filter((entry) => (!filter.kind || entry.kind === filter.kind) && (!filter.scope || entry.scope === filter.scope));
    const records = await Promise.all(matching.map((entry) => this.readRecordUnchecked(entry.id)));
    return records.filter((record): record is ProjectRecordModel => record !== undefined);
  }
  private async readIndex(projectId: string): Promise<ProjectVaultIndexModel> {
    const index = ProjectVaultIndex.parse(await this.readJson(indexFile));
    if (index.projectId !== projectId) throw new Error('MNEMOSYNE_VAULT_INDEX_PROJECT_MISMATCH');
    return index;
  }
  private async readJson(relativePath: string): Promise<unknown> { return JSON.parse(await readFile(this.safePath(relativePath), 'utf8')); }
  private async writeJson(relativePath: string, value: unknown): Promise<void> {
    const path = this.safePath(relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  private safePath(relativePath: string): string {
    if (isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) throw new Error(`MNEMOSYNE_VAULT_UNSAFE_PATH:${relativePath}`);
    const candidate = resolve(this.root, ...relativePath.split('/'));
    const relation = relative(this.root, candidate);
    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error(`MNEMOSYNE_VAULT_PATH_ESCAPE:${relativePath}`);
    return candidate;
  }
}

function recordPath(record: ProjectRecordModel): string { return `${recordDirectory(record)}/${record.id}.json`; }
function recordDirectory(record: ProjectRecordModel): string {
  if (record.scope === 'task_state') return 'task-state';
  if (record.scope === 'agent_performance') return 'agent-performance';
  switch (record.kind) {
    case 'decision': return 'decisions';
    case 'requirement': return 'requirements';
    case 'constraint': return 'constraints';
    case 'generated-output': return 'generated-context';
    case 'external-reference': return 'references';
    case 'conflict': return 'conflicts';
    case 'fact': return 'facts';
    case 'hypothesis':
    case 'observation': return 'observations';
    case 'task-state': return 'task-state';
  }
}
function isMissingFile(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'; }
