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
