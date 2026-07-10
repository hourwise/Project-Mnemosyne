import { InMemoryAlmanacStore, type AlmanacStore } from '@mnemosyne/almanac-store';
import { createAuditEvent, InMemoryAuditStore, type AuditStore } from '@mnemosyne/audit-engine';
import { OnboardingEngine } from '@mnemosyne/onboarding-engine';
import { RetrievalEngine } from '@mnemosyne/retrieval-engine';
import { McpAlmanacServer } from '@mnemosyne/mcp-adapter';
import { AnankeSafetyBridge, NoopAnankeAdapter, type AnankeAdapter } from '@mnemosyne/ananke-adapter';
import { SessionEngine } from '@mnemosyne/session-engine';
import { WorkspaceGuard } from '@mnemosyne/workspace-guard';

export interface MnemosyneRuntimeConfig {
  projectRoot: string;
  almanacRoot?: string;
  audit?: AuditStore;
  store?: AlmanacStore;
  ananke?: AnankeAdapter;
}

export class MnemosyneRuntime {
  readonly audit: AuditStore;
  readonly store: AlmanacStore;
  readonly guard: WorkspaceGuard;
  readonly onboarding: OnboardingEngine;
  readonly retrieval = new RetrievalEngine();
  readonly session: SessionEngine;
  readonly ananke: AnankeSafetyBridge;

  constructor(readonly config: MnemosyneRuntimeConfig) {
    this.audit = config.audit ?? new InMemoryAuditStore();
    this.store = config.store ?? new InMemoryAlmanacStore();
    this.guard = new WorkspaceGuard(config.almanacRoot ?? `${config.projectRoot}/.project-ananke/almanac`, {
      audit: this.audit,
    });
    this.onboarding = new OnboardingEngine(this.audit);
    this.session = new SessionEngine(this.audit);
    this.ananke = new AnankeSafetyBridge(config.ananke ?? new NoopAnankeAdapter(), this.audit);
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
}
