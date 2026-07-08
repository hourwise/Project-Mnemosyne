import type { AuditEvent, AuditEventType } from '@mnemosyne/schema';

export interface AuditStore {
  record(event: AuditEvent): void;
  list(filter?: { eventType?: AuditEventType; since?: string; limit?: number }): AuditEvent[];
}

export class InMemoryAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];

  record(event: AuditEvent): void {
    this.events.push(event);
  }

  list(filter: { eventType?: AuditEventType; since?: string; limit?: number } = {}): AuditEvent[] {
    let results = [...this.events];
    if (filter.eventType) {
      results = results.filter((event) => event.eventType === filter.eventType);
    }
    if (filter.since) {
      results = results.filter((event) => event.timestamp >= filter.since!);
    }
    return typeof filter.limit === 'number' ? results.slice(0, filter.limit) : results;
  }
}

export function createAuditEvent(
  eventType: AuditEventType,
  metadata: Record<string, unknown> = {},
): AuditEvent {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    eventType,
    metadata,
  };
}
