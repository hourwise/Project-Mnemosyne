import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';
import type { ConflictRecord, ContextPack } from '@mnemosyne/schema';

export type AnankeNotificationReason =
  | 'CONFLICT_DETECTED'
  | 'LOW_RELIABILITY_CONTEXT'
  | 'SOURCE_MISSING'
  | 'ACTION_CONTEXT_INSUFFICIENT';

export interface AnankeNotification {
  reason: AnankeNotificationReason;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AnankeAdapter {
  notify(notification: AnankeNotification): Promise<void>;
}

export class NoopAnankeAdapter implements AnankeAdapter {
  async notify(_notification: AnankeNotification): Promise<void> {
    return;
  }
}

export class CallbackAnankeAdapter implements AnankeAdapter {
  constructor(private readonly callback: (notification: AnankeNotification) => Promise<void>) {}

  notify(notification: AnankeNotification): Promise<void> {
    return this.callback(notification);
  }
}

export interface AnankeNotificationDelivery {
  notification: AnankeNotification;
  delivered: boolean;
  error?: string;
}

/**
 * Translates Mnemosyne safety signals into notifications Ananke can evaluate.
 * It intentionally catches transport errors: a notification failure is audited
 * and surfaced to the caller, but can never modify Almanac memory state.
 */
export class AnankeSafetyBridge {
  constructor(
    private readonly adapter: AnankeAdapter,
    private readonly audit: AuditStore,
  ) {}

  async notifyConflict(conflict: ConflictRecord): Promise<AnankeNotificationDelivery> {
    const sourceMissing = conflict.type === 'active_memory_source_missing';
    return this.deliver({
      reason: sourceMissing ? 'SOURCE_MISSING' : 'CONFLICT_DETECTED',
      message: sourceMissing
        ? `Required source evidence is missing for ${conflict.memoryIds.join(', ') || 'the current context'}.`
        : `Mnemosyne detected a ${conflict.type} conflict that requires resolution.`,
      metadata: {
        conflictId: conflict.id,
        conflictType: conflict.type,
        memoryIds: conflict.memoryIds,
        shouldAnankeContinue: conflict.shouldAnankeContinue,
        recommendedResolution: conflict.recommendedResolution,
      },
    });
  }

  async notifyContextSafety(context: ContextPack): Promise<AnankeNotificationDelivery[]> {
    const deliveries: AnankeNotificationDelivery[] = [];
    for (const conflict of context.conflicts) {
      deliveries.push(await this.notifyConflict(conflict));
    }

    if (context.warnings.some((warning) => /low-reliability/i.test(warning))) {
      deliveries.push(
        await this.deliver({
          reason: 'LOW_RELIABILITY_CONTEXT',
          message: 'Mnemosyne context contains low-reliability memory.',
          metadata: { task: context.task, warnings: context.warnings },
        }),
      );
    }

    if (context.relevantMemories.length === 0) {
      deliveries.push(
        await this.deliver({
          reason: 'ACTION_CONTEXT_INSUFFICIENT',
          message: 'Mnemosyne could not provide governed memory for the requested task.',
          metadata: { task: context.task, openQuestions: context.openQuestions },
        }),
      );
    }

    return deliveries;
  }

  private async deliver(notification: AnankeNotification): Promise<AnankeNotificationDelivery> {
    try {
      await this.adapter.notify(notification);
      this.audit.record(createAuditEvent('ANANKE_NOTIFICATION_SENT', { reason: notification.reason }));
      return { notification, delivered: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ananke notification failed.';
      this.audit.record(
        createAuditEvent('ANANKE_NOTIFICATION_FAILED', { reason: notification.reason, error: message }),
      );
      return { notification, delivered: false, error: message };
    }
  }
}
