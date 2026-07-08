import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';
import type { ContextPack, MemoryRecord } from '@mnemosyne/schema';
import { RetrievalEngine } from '@mnemosyne/retrieval-engine';

export class SessionEngine {
  private readonly retrieval = new RetrievalEngine();

  constructor(private readonly audit: AuditStore) {}

  start(task: string, memories: MemoryRecord[]): ContextPack {
    this.audit.record(createAuditEvent('SESSION_STARTED', { task }));
    return this.retrieval.buildContextPack(task, memories);
  }

  end(summary: Record<string, unknown> = {}): void {
    this.audit.record(createAuditEvent('SESSION_ENDED', summary));
  }
}
