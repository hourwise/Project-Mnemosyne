import { InMemoryAlmanacStore, type AlmanacStore } from '@mnemosyne/almanac-store';
import { createAuditEvent, InMemoryAuditStore, type AuditStore } from '@mnemosyne/audit-engine';
import { OnboardingEngine } from '@mnemosyne/onboarding-engine';
import { RetrievalEngine } from '@mnemosyne/retrieval-engine';
import { McpAlmanacServer } from '@mnemosyne/mcp-adapter';
import { AnankeSafetyBridge, NoopAnankeAdapter, type AnankeAdapter } from '@mnemosyne/ananke-adapter';
import {
  PortableVaultStore,
  type PortableVaultStoreOptions,
} from '@mnemosyne/portable-vault';
import { RestartPackEngine, type RestartPackSelection } from '@mnemosyne/restart-pack-engine';
import type { ProjectRecord, ProjectVaultExport, ProjectVaultManifest, RestartPack } from '@mnemosyne/schema';
import { SessionEngine } from '@mnemosyne/session-engine';
import { WorkspaceGuard } from '@mnemosyne/workspace-guard';

export interface MnemosyneRuntimeConfig {
  projectRoot: string;
  almanacRoot?: string;
  audit?: AuditStore;
  store?: AlmanacStore;
  ananke?: AnankeAdapter;
  vaultRoot?: string;
  vaultOptions?: PortableVaultStoreOptions;
}

export class MnemosyneRuntime {
  readonly audit: AuditStore;
  readonly store: AlmanacStore;
  readonly guard: WorkspaceGuard;
  readonly onboarding: OnboardingEngine;
  readonly retrieval = new RetrievalEngine();
  readonly session: SessionEngine;
  readonly ananke: AnankeSafetyBridge;
  readonly vault: PortableVaultStore;
  readonly restartPacks = new RestartPackEngine();

  constructor(readonly config: MnemosyneRuntimeConfig) {
    this.audit = config.audit ?? new InMemoryAuditStore();
    this.store = config.store ?? new InMemoryAlmanacStore();
    this.guard = new WorkspaceGuard(config.almanacRoot ?? `${config.projectRoot}/.project-Mnemosyne/almanac`, {
      audit: this.audit,
    });
    this.onboarding = new OnboardingEngine(this.audit, this.store);
    this.session = new SessionEngine(this.audit);
    this.ananke = new AnankeSafetyBridge(config.ananke ?? new NoopAnankeAdapter(), this.audit);
    this.vault = new PortableVaultStore(config.vaultRoot ?? `${config.projectRoot}/.mnemosyne`, config.vaultOptions);
  }

  init(): void {
    this.audit.record(createAuditEvent('ALMANAC_CREATED', { almanacRoot: this.guard.almanacRoot }));
  }

  status(): { name: string; version: string; activeMemories: number; auditEvents: number } {
    return {
      name: 'Mnemosyne Runtime',
      version: '0.1.0',
      activeMemories: this.store.listActive().length,
      auditEvents: this.audit.list().length,
    };
  }

  createMcpServer(sourceTextByPath: Record<string, string> = {}): McpAlmanacServer {
    return new McpAlmanacServer({
      store: this.store,
      audit: this.audit,
      status: () => this.status(),
      sourceTextByPath,
    });
  }

  async initializeVault(manifest: ProjectVaultManifest): Promise<ProjectVaultManifest> {
    return this.vault.initialize(manifest);
  }

  async exportVault(): Promise<ProjectVaultExport> {
    return this.vault.exportVault();
  }

  async writeVaultRecord(record: ProjectRecord): Promise<ProjectRecord> {
    return this.vault.writeRecord(record);
  }

  async importVault(bundle: ProjectVaultExport): Promise<ProjectVaultExport> {
    return this.vault.importVault(bundle);
  }

  async createRestartPack(taskId: string, selection: RestartPackSelection = {}): Promise<RestartPack> {
    const task = await this.vault.readRecord(taskId);
    if (!task) throw new Error(`Vault task record not found: ${taskId}`);
    const resolveRecords = async (ids: string[] = []) =>
      Promise.all(
        ids.map(async (id) => {
          const record = await this.vault.readRecord(id);
          if (!record) throw new Error(`Vault record not found: ${id}`);
          return record;
        }),
      );
    return this.restartPacks.build(
      {
        project: await this.vault.getManifest(),
        task,
        completed: await resolveRecords(selection.completedIds),
        outstanding: await resolveRecords(selection.outstandingIds),
        relevant: await resolveRecords(selection.relevantIds),
        branch: selection.branch,
        lastVerifiedCommit: selection.lastVerifiedCommit,
      },
      { tokenBudget: selection.tokenBudget },
    );
  }
}
