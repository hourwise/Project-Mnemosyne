import { describe, expect, it } from 'vitest';
import {
  ADRASTEIA_BASELINE,
  MnemosyneOperationContextSchema,
  assertContextWithinRuntimeScope,
  createTrustedOperationContext,
} from '@mnemosyne/adrasteia-adapter';
import { MemoryAccessEvaluator } from '@mnemosyne/memory-boundary';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';

const runtimeScope = { projectId: 'project_conformance', tenantId: 'tenant_conformance', workspaceId: 'workspace_conformance', runtimeInstanceId: 'runtime_conformance' };

function context(overrides: Record<string, unknown> = {}) {
  return createTrustedOperationContext({
    execution: {
      authenticatedPrincipal: { id: 'human_conformance', kind: PrincipalKind.Human, tenantId: 'tenant_conformance' },
      actingPrincipal: { id: 'agent_conformance', kind: PrincipalKind.Agent, tenantId: 'tenant_conformance' },
      runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_conformance', sessionId: 'session_conformance', projectId: 'project_conformance', tenantId: 'tenant_conformance', workspaceId: 'workspace_conformance',
    },
    scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_conformance', tenantId: 'tenant_conformance', workspaceId: 'workspace_conformance' },
    purpose: 'conformance_test',
    ...overrides,
  });
}

describe('Project Adrasteia Stage-A conformance', () => {
  it('uses the verified immutable baseline with content preflight explicitly absent', () => {
    expect(ADRASTEIA_BASELINE).toMatchObject({ packageName: 'project-runtime-contracts', packageVersion: '0.4.0', protocolVersion: '1.4.0', minimumProtocolVersion: '1.0.0' });
    expect(ADRASTEIA_BASELINE.artifactSha256).toHaveLength(64);
  });

  it('preserves separate authenticated and acting principals with trusted correlation', () => {
    const parsed = MnemosyneOperationContextSchema.parse(context());
    expect(parsed.execution.authenticatedPrincipal).toMatchObject({ id: 'human_conformance', kind: PrincipalKind.Human });
    expect(parsed.execution.actingPrincipal).toMatchObject({ id: 'agent_conformance', kind: PrincipalKind.Agent });
    expect(parsed.correlation.requestId).toMatch(/^req_/);
    expect(parsed.correlation.correlationId).toMatch(/^cor_/);
  });

  it('fails closed for wildcard or tenant/project/workspace mismatch', () => {
    expect(() => MnemosyneOperationContextSchema.parse({ ...context(), scope: { ...context().scope, projectId: '*' } })).toThrow();
    expect(() => assertContextWithinRuntimeScope({ ...context(), scope: { ...context().scope, workspaceId: 'workspace_other' } }, runtimeScope)).toThrow('MNEMOSYNE_SCOPE_MISMATCH');
    expect(() => assertContextWithinRuntimeScope({ ...context(), execution: { ...context().execution, projectId: 'project_other' } }, runtimeScope)).toThrow('MNEMOSYNE_SCOPE_MISMATCH');
  });

  it('treats remembered approvals and grants as references rather than present authority', () => {
    const remembered = context({ approvalReference: { approvalId: 'approval_historical' }, grantReference: { grantId: 'grant_historical' } });
    const evaluator = new MemoryAccessEvaluator();
    expect(evaluator.allows(remembered, 'export', { id: 'record_sensitive_001', projectId: 'project_conformance', accessClassification: 'sensitive' } as never)).toBe(false);
    expect(evaluator.allows(remembered, 'export', { id: 'record_restricted_001', projectId: 'project_conformance', accessClassification: 'restricted' } as never)).toBe(false);
  });
});
