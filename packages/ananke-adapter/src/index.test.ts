import { describe, expect, it } from 'vitest';
import { InMemoryAuditStore } from '@mnemosyne/audit-engine';
import type { ConflictRecord, ContextPack } from '@mnemosyne/schema';
import { AnankeSafetyBridge, CallbackAnankeAdapter, CallbackAnankeAdmissionAuthority } from './index.js';

const createdAt = '2026-07-10T00:00:00.000Z';

function conflict(type: ConflictRecord['type'] = 'memory_vs_code'): ConflictRecord {
  return {
    id: 'conflict_memory_001',
    type,
    description: 'Memory conflicts with the current source.',
    memoryIds: ['mem_fact_001'],
    sources: [],
    recommendedResolution: 'Revalidate before use.',
    shouldAnankeContinue: false,
    createdAt,
  };
}

function context(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    task: 'change the project',
    relevantMemories: [],
    sourceSnippets: [],
    conflicts: [],
    warnings: [],
    openQuestions: [],
    tokenEstimate: 0,
    ...overrides,
  };
}

describe('AnankeSafetyBridge', () => {
  it('maps conflicts to auditable Ananke notifications', async () => {
    const notifications: string[] = [];
    const audit = new InMemoryAuditStore();
    const bridge = new AnankeSafetyBridge(
      new CallbackAnankeAdapter(async (notification) => notifications.push(notification.reason)),
      audit,
    );

    const delivery = await bridge.notifyConflict(conflict());

    expect(delivery.delivered).toBe(true);
    expect(notifications).toEqual(['CONFLICT_DETECTED']);
    expect(audit.list()[0]).toMatchObject({ eventType: 'ANANKE_NOTIFICATION_SENT' });
  });

  it('elevates missing sources using the dedicated notification reason', async () => {
    const notifications: string[] = [];
    const bridge = new AnankeSafetyBridge(
      new CallbackAnankeAdapter(async (notification) => notifications.push(notification.reason)),
      new InMemoryAuditStore(),
    );

    await bridge.notifyConflict(conflict('active_memory_source_missing'));

    expect(notifications).toEqual(['SOURCE_MISSING']);
  });

  it('reports conflicts, low reliability, and insufficient context independently', async () => {
    const notifications: string[] = [];
    const bridge = new AnankeSafetyBridge(
      new CallbackAnankeAdapter(async (notification) => notifications.push(notification.reason)),
      new InMemoryAuditStore(),
    );

    const deliveries = await bridge.notifyContextSafety(
      context({ conflicts: [conflict()], warnings: ['Context includes 1 low-reliability memories.'] }),
    );

    expect(deliveries.every((delivery) => delivery.delivered)).toBe(true);
    expect(notifications).toEqual([
      'CONFLICT_DETECTED',
      'LOW_RELIABILITY_CONTEXT',
      'ACTION_CONTEXT_INSUFFICIENT',
    ]);
  });

  it('contains Ananke transport failures without changing external state', async () => {
    const audit = new InMemoryAuditStore();
    const bridge = new AnankeSafetyBridge(
      new CallbackAnankeAdapter(async () => Promise.reject(new Error('Ananke offline'))),
      audit,
    );

    const delivery = await bridge.notifyConflict(conflict());

    expect(delivery).toMatchObject({ delivered: false, error: 'Ananke offline' });
    expect(audit.list()[0]).toMatchObject({ eventType: 'ANANKE_NOTIFICATION_FAILED' });
  });
});

describe('CallbackAnankeAdmissionAuthority', () => {
  it('maps inbound Ananke allow/deny/defer decisions without changing their meaning', () => {
    const authority = new CallbackAnankeAdmissionAuthority((input) => {
      expect(input.projectId).toBe('project_fates');
      return { state: 'DEFER', reasonCode: 'APPROVAL_REQUIRED', decisionId: 'decision_001', policyVersion: 'policy-2026-08' };
    });

    expect(authority.evaluate({
      candidate: {} as never,
      candidateContentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      preflight: {
        kind: 'verified', receiptId: 'receipt_001', observationId: 'observation_001', decisionId: 'preflight_decision_001',
        contractVersion: '1.0.0', ruleSetVersion: 'rules-2026-08', outcome: 'PASS', exposureLevel: 'SELECTED_CONTENT',
        sourceContentHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', truncated: false,
      },
      projectId: 'project_fates', trustDomain: 'project_fates',
    })).toEqual({ kind: 'deferred', reasonCode: 'APPROVAL_REQUIRED', decisionId: 'decision_001', policyVersion: 'policy-2026-08' });
  });
});
