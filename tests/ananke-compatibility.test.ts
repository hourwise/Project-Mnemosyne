import { describe, expect, it } from 'vitest';
import { AnankeSafetyBridge, NoopAnankeAdapter } from '@mnemosyne/ananke-adapter';
import { InMemoryAuditStore } from '@mnemosyne/audit-engine';
import { createTrustedOperationContext } from '@mnemosyne/adrasteia-adapter';
import { PrincipalIdentitySchema, ResourceScopeMode } from 'project-runtime-contracts';

describe('pinned Ananke comparator boundary', () => {
  it('round-trips real portable principal, scope and correlation surfaces', () => {
    expect(PrincipalIdentitySchema.parse({ id: 'service_ananke_test', kind: 'service' })).toMatchObject({ id: 'service_ananke_test' });
    const context = createTrustedOperationContext({
      execution: { authenticatedPrincipal: { id: 'service_ananke_test', kind: 'service' }, actingPrincipal: { id: 'agent_ananke_test', kind: 'agent' }, runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_ananke_test', sessionId: 'session_ananke_test', projectId: 'project_ananke_test' },
      scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_ananke_test' },
      purpose: 'ananke_compatibility_test',
    });
    expect(context.scope.projectId).toBe('project_ananke_test');
    expect(context.correlation.requestId).toMatch(/^req_/);
  });

  it('keeps advisory notification delivery outbound-only and safe when Ananke is unavailable', async () => {
    const audit = new InMemoryAuditStore();
    const bridge = new AnankeSafetyBridge(new NoopAnankeAdapter(), audit);
    const delivery = await bridge.notifyConflict({
      id: 'conflict_ananke_001', type: 'memory_vs_code', description: 'Conflict detected.', memoryIds: ['mem_fact_001'], sources: [], recommendedResolution: 'Review evidence.', shouldAnankeContinue: false, createdAt: '2026-07-18T00:00:00.000Z',
    });
    expect(delivery.delivered).toBe(true);
    expect('receive' in bridge).toBe(false);
    expect('decide' in bridge).toBe(false);
    expect(audit.list().map((event) => event.eventType)).toContain('ANANKE_NOTIFICATION_SENT');
  });
});
