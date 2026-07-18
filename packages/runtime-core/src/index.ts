import { randomUUID } from 'node:crypto';
import { InMemoryAlmanacStore, type AlmanacStore } from '@mnemosyne/almanac-store';
import { assertContextWithinRuntimeScope, buildCompatibilityManifest, buildRuntimeHealth, buildRuntimeIdentity, buildRuntimeReadiness, buildRuntimeRegistration, createTrustedOperationContext, negotiateProtocol, type MnemosyneOperationContext, type MnemosyneRuntimeScope, type TrustedOperationContextInput } from '@mnemosyne/adrasteia-adapter';
import { createAuditEvent, InMemoryAuditStore, type AuditStore } from '@mnemosyne/audit-engine';
import { AnankeSafetyBridge, NoopAnankeAdapter, type AnankeAdapter } from '@mnemosyne/ananke-adapter';
import { CredentialMaterialGuard, MemoryAccessEvaluator, type TrustedSensitiveAccessEvaluator } from '@mnemosyne/memory-boundary';
import { McpAlmanacServer } from '@mnemosyne/mcp-adapter';
import { OnboardingEngine } from '@mnemosyne/onboarding-engine';
import { PortableVaultStore, type PortableVaultStoreOptions } from '@mnemosyne/portable-vault';
import { RestartPackEngine, type RestartPackSelection } from '@mnemosyne/restart-pack-engine';
import { MemoryRecord, type MemoryKind, type MemoryRecord as MemoryRecordModel, type ProjectRecord, type ProjectVaultExport, type ProjectVaultManifest, type RestartPack } from '@mnemosyne/schema';
import { attributionFromContext } from '@mnemosyne/adrasteia-adapter';
import { SessionEngine } from '@mnemosyne/session-engine';
import { WorkspaceGuard } from '@mnemosyne/workspace-guard';

export interface MnemosyneRuntimeConfig {
  projectRoot: string;
  /** One runtime is bound to one explicit project. Multi-project service mode is deferred. */
  projectId: string;
  tenantId?: string;
  workspaceId?: string;
  runtimeInstanceId?: string;
  version?: string;
  almanacRoot?: string;
  audit?: AuditStore;
  store?: AlmanacStore;
  ananke?: AnankeAdapter;
  vaultRoot?: string;
  vaultOptions?: Pick<PortableVaultStoreOptions, 'now'>;
  sensitiveAccessEvaluator?: TrustedSensitiveAccessEvaluator;
}

/** Scoped composition facade. All memory and portable-output methods require current trusted context. */
export class MnemosyneRuntime {
  readonly audit: AuditStore;
  readonly guard: WorkspaceGuard;
  readonly ananke: AnankeSafetyBridge;
  readonly runtimeScope: MnemosyneRuntimeScope;
  private readonly store: AlmanacStore;
  private readonly access: MemoryAccessEvaluator;
  private readonly credentialGuard = new CredentialMaterialGuard();
  private readonly onboarding: OnboardingEngine;
  private readonly session: SessionEngine;
  private readonly vault: PortableVaultStore;
  private readonly restartPacks: RestartPackEngine;
  private readonly startedAt = Date.now();
  private readonly anankeAvailable: boolean;
  private readonly version: string;

  constructor(readonly config: MnemosyneRuntimeConfig) {
    this.version = config.version ?? '0.1.0';
    this.runtimeScope = { projectId: config.projectId, tenantId: config.tenantId, workspaceId: config.workspaceId, runtimeInstanceId: config.runtimeInstanceId ?? `mnemosyne_${randomUUID()}` };
    this.audit = config.audit ?? new InMemoryAuditStore();
    this.store = config.store ?? new InMemoryAlmanacStore();
    this.access = new MemoryAccessEvaluator(config.sensitiveAccessEvaluator);
    this.guard = new WorkspaceGuard(config.almanacRoot ?? `${config.projectRoot}/.project-Mnemosyne/almanac`, { audit: this.audit });
    this.onboarding = new OnboardingEngine(this.audit, this.store);
    this.session = new SessionEngine(this.audit);
    this.anankeAvailable = config.ananke !== undefined;
    this.ananke = new AnankeSafetyBridge(config.ananke ?? new NoopAnankeAdapter(), this.audit);
    this.vault = new PortableVaultStore(config.vaultRoot ?? `${config.projectRoot}/.mnemosyne`, {
      now: config.vaultOptions?.now,
      runtimeScope: this.runtimeScope,
      accessEvaluator: this.access,
      credentialGuard: this.credentialGuard,
      onCredentialMaterialRejected: (metadata) => this.audit.record(createAuditEvent('CREDENTIAL_MATERIAL_REJECTED', metadata)),
    });
    this.restartPacks = new RestartPackEngine(this.access, this.credentialGuard);
  }

  init(): void { this.audit.record(createAuditEvent('ALMANAC_CREATED', { projectId: this.runtimeScope.projectId })); }
  /** Trusted hosts inject principals; model-visible tool arguments never become identity. */
  createOperationContext(input: TrustedOperationContextInput): MnemosyneOperationContext { return assertContextWithinRuntimeScope(createTrustedOperationContext(input), this.runtimeScope); }
  assertOperationContext(value: unknown): MnemosyneOperationContext { return assertContextWithinRuntimeScope(value, this.runtimeScope); }
  status(): { name: string; version: string; projectId: string; activeMemories: number; auditEvents: number } {
    return { name: 'Mnemosyne Runtime', version: this.version, projectId: this.runtimeScope.projectId, activeMemories: this.store.listActive().length, auditEvents: this.audit.list().length };
  }
  runtimeIdentity() { return buildRuntimeIdentity({ runtimeVersion: this.version, runtimeInstanceId: this.runtimeScope.runtimeInstanceId }); }
  runtimeHealth() { return buildRuntimeHealth(this.inspectionInput()); }
  runtimeReadiness() { return buildRuntimeReadiness(this.inspectionInput()); }
  runtimeRegistration() { return buildRuntimeRegistration(this.inspectionInput()); }
  compatibilityManifest() { return buildCompatibilityManifest({ runtimeVersion: this.version }); }
  negotiateProtocol(protocolVersion: string, minimumSupportedProtocolVersion: string) { return negotiateProtocol(protocolVersion, minimumSupportedProtocolVersion); }
  inspect(): Record<string, unknown> { return { identity: this.runtimeIdentity(), health: this.runtimeHealth(), readiness: this.runtimeReadiness(), registration: this.runtimeRegistration(), compatibility: this.compatibilityManifest() }; }
  createMcpServer(sourceTextByPath: Record<string, string> = {}): McpAlmanacServer {
    return new McpAlmanacServer({ store: this.store, audit: this.audit, runtimeScope: this.runtimeScope, accessEvaluator: this.access, credentialGuard: this.credentialGuard, inspection: () => this.inspect(), negotiateProtocol: (version, minimum) => this.negotiateProtocol(version, minimum), sourceTextByPath });
  }
  /** Explicit local-demo helper; it still requires distinct trusted principals and bounded scope. */
  onboardLocalDemo(contextValue: unknown, projectRoot: string): ReturnType<OnboardingEngine['onboard']> {
    const context = this.assertOperationContext(contextValue);
    const result = this.onboarding.onboard(projectRoot);
    for (const memory of result.memories) {
      const attributed = MemoryRecord.parse({ ...memory, status: 'active', attribution: attributionFromContext(context) });
      this.access.assertAllowed(context, 'write', attributed);
      this.credentialGuard.assertSafe(attributed);
      this.store.updateMemory(attributed);
    }
    return result;
  }
  searchMemories(contextValue: unknown, query: { text?: string; tag?: string; kind?: MemoryKind } = {}): MemoryRecordModel[] {
    const context = this.assertOperationContext(contextValue);
    return this.access.filter(context, 'search', this.store.search(query)).records;
  }
  async initializeVault(context: unknown, manifest: ProjectVaultManifest): Promise<ProjectVaultManifest> { return this.vault.initialize(this.assertOperationContext(context), manifest); }
  async readVaultRecord(context: unknown, id: string): Promise<ProjectRecord | undefined> { return this.vault.readRecord(this.assertOperationContext(context), id); }
  async listVaultRecords(context: unknown): Promise<ProjectRecord[]> { return this.vault.listRecords(this.assertOperationContext(context)); }
  async exportVault(context: unknown): Promise<ProjectVaultExport> { return this.vault.exportVault(this.assertOperationContext(context)); }
  async writeVaultRecord(context: unknown, record: ProjectRecord): Promise<ProjectRecord> { return this.vault.writeRecord(this.assertOperationContext(context), record); }
  async importVault(context: unknown, bundle: ProjectVaultExport): Promise<ProjectVaultExport> { return this.vault.importVault(this.assertOperationContext(context), bundle); }
  async createRestartPack(contextValue: unknown, taskId: string, selection: RestartPackSelection = {}): Promise<RestartPack> {
    const context = this.assertOperationContext(contextValue);
    const task = await this.vault.readRecord(context, taskId);
    if (!task) throw new Error(`MNEMOSYNE_VAULT_RECORD_NOT_FOUND:${taskId}`);
    const resolveRecords = async (ids: string[] = []) => Promise.all(ids.map(async (id) => {
      const record = await this.vault.readRecord(context, id);
      if (!record) throw new Error(`MNEMOSYNE_VAULT_RECORD_NOT_FOUND:${id}`);
      return record;
    }));
    return this.restartPacks.build(context, {
      project: await this.vault.getManifest(context), task,
      completed: await resolveRecords(selection.completedIds), outstanding: await resolveRecords(selection.outstandingIds), relevant: await resolveRecords(selection.relevantIds),
      branch: selection.branch, lastVerifiedCommit: selection.lastVerifiedCommit,
    }, { tokenBudget: selection.tokenBudget });
  }
  renderRestartPack(pack: RestartPack): string { return this.restartPacks.render(pack); }
  /** Existing domain engines stay private until a context-enforcing facade is provided. */
  private inspectionInput() {
    return { runtimeVersion: this.version, runtimeInstanceId: this.runtimeScope.runtimeInstanceId, startedAt: this.startedAt, projectConfigured: Boolean(this.runtimeScope.projectId), anankeAvailable: this.anankeAvailable, ready: Boolean(this.runtimeScope.projectId && this.audit && this.store && this.access && this.credentialGuard) };
  }
}
