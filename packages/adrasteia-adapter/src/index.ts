import { randomUUID } from 'node:crypto';
import {
  AgentExecutionContextSchema,
  ApprovalReferenceSchema,
  AuditReferenceSchema,
  CapabilityCategory,
  CapabilityExposure,
  CompatibilityManifestSchema,
  CorrelationContextSchema,
  GrantReferenceSchema,
  ProtocolNegotiationResultSchema,
  RuntimeHealthSchema,
  RuntimeHealthStatus,
  RuntimeIdentitySchema,
  RuntimeKind,
  RuntimeReadinessSchema,
  RuntimeReadinessStatus,
  RuntimeRegistrationSchema,
  RuntimeTransport,
  StateHandleReferenceSchema,
  negotiateDetailed,
  type AgentExecutionContext,
  type CompatibilityManifest,
  type CorrelationContext,
  type ProtocolNegotiationResult,
  type ResourceScope,
  type RuntimeHealth,
  type RuntimeIdentity,
  type RuntimeReadiness,
  type RuntimeRegistration,
} from 'project-runtime-contracts';
import { ResourceScopeMode, ResourceScopeSchema } from 'project-runtime-contracts';
import type { MnemosyneAttribution } from '@mnemosyne/schema';
import { z } from 'zod';

export {
  AgentExecutionContextSchema,
  ApprovalReferenceSchema,
  AuditReferenceSchema,
  CorrelationContextSchema,
  GrantReferenceSchema,
  ResourceScopeMode,
  ResourceScopeSchema,
  StateHandleReferenceSchema,
};
export type { AgentExecutionContext, CorrelationContext, ResourceScope };

const PurposeSchema = z.string().trim().min(1).refine((value) => !value.includes('*'), 'purpose must not contain wildcards');

/**
 * Mnemosyne's current-operation envelope is composed exclusively from canonical
 * Adrasteia identities, scope and correlation references. Historical approval
 * and grant references are evidence only; this adapter never evaluates them.
 */
export const MnemosyneOperationContextSchema = z.object({
  execution: AgentExecutionContextSchema,
  scope: ResourceScopeSchema,
  correlation: CorrelationContextSchema,
  purpose: PurposeSchema,
  approvalReference: ApprovalReferenceSchema.optional(),
  auditReference: AuditReferenceSchema.optional(),
  grantReference: GrantReferenceSchema.optional(),
  stateHandleReference: StateHandleReferenceSchema.optional(),
}).superRefine((context, issue) => {
  if (context.scope.mode !== ResourceScopeMode.Bounded) {
    issue.addIssue({ code: z.ZodIssueCode.custom, path: ['scope', 'mode'], message: 'Mnemosyne memory operations require a bounded scope.' });
  }
  if (!context.scope.projectId) {
    issue.addIssue({ code: z.ZodIssueCode.custom, path: ['scope', 'projectId'], message: 'Mnemosyne memory operations require projectId.' });
  }
  for (const value of [
    context.scope.tenantId,
    context.scope.projectId,
    context.scope.workspaceId,
    context.execution.tenantId,
    context.execution.projectId,
    context.execution.workspaceId,
  ]) {
    if (value?.includes('*')) issue.addIssue({ code: z.ZodIssueCode.custom, message: 'wildcard scope values are not supported.' });
  }
});
export type MnemosyneOperationContext = z.infer<typeof MnemosyneOperationContextSchema>;

export const MnemosyneRuntimeScopeSchema = z.object({
  projectId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1).optional(),
  workspaceId: z.string().trim().min(1).optional(),
  runtimeInstanceId: z.string().trim().min(1),
});
export type MnemosyneRuntimeScope = z.infer<typeof MnemosyneRuntimeScopeSchema>;

export interface TrustedOperationContextInput {
  execution: AgentExecutionContext;
  scope: ResourceScope;
  purpose: string;
  correlation?: Partial<CorrelationContext>;
  approvalReference?: z.infer<typeof ApprovalReferenceSchema>;
  auditReference?: z.infer<typeof AuditReferenceSchema>;
  grantReference?: z.infer<typeof GrantReferenceSchema>;
  stateHandleReference?: z.infer<typeof StateHandleReferenceSchema>;
}

/** Generates request/correlation identifiers only at the trusted host boundary. */
export function createTrustedOperationContext(input: TrustedOperationContextInput): MnemosyneOperationContext {
  return MnemosyneOperationContextSchema.parse({
    ...input,
    correlation: {
      ...input.correlation,
      requestId: input.correlation?.requestId ?? `req_${randomUUID()}`,
      correlationId: input.correlation?.correlationId ?? `cor_${randomUUID()}`,
    },
  });
}

/** Fails closed on tenant, project, workspace, runtime-instance or scope conflicts. */
export function assertContextWithinRuntimeScope(
  value: unknown,
  runtimeScope: MnemosyneRuntimeScope,
): MnemosyneOperationContext {
  const scope = MnemosyneRuntimeScopeSchema.parse(runtimeScope);
  const context = MnemosyneOperationContextSchema.parse(value);
  const actual = context.scope;
  const execution = context.execution;
  const conflicts: string[] = [];
  if (actual.projectId !== scope.projectId || execution.projectId !== scope.projectId) conflicts.push('projectId');
  if (scope.tenantId && (actual.tenantId !== scope.tenantId || execution.tenantId !== scope.tenantId)) conflicts.push('tenantId');
  if (scope.workspaceId && (actual.workspaceId !== scope.workspaceId || execution.workspaceId !== scope.workspaceId)) conflicts.push('workspaceId');
  if (execution.runtimeInstanceId && execution.runtimeInstanceId !== scope.runtimeInstanceId) conflicts.push('runtimeInstanceId');
  if (conflicts.length > 0) throw new Error(`MNEMOSYNE_SCOPE_MISMATCH:${conflicts.join(',')}`);
  return context;
}

/** Safe, portable attribution for Mnemosyne-owned records; never a credential or authority grant. */
export function attributionFromContext(context: MnemosyneOperationContext): MnemosyneAttribution {
  const parsed = MnemosyneOperationContextSchema.parse(context);
  return {
    execution: parsed.execution,
    correlation: parsed.correlation,
    purpose: parsed.purpose,
    approvalReference: parsed.approvalReference,
    auditReference: parsed.auditReference,
    grantReference: parsed.grantReference,
  };
}

export const ADRASTEIA_BASELINE = Object.freeze({
  repository: 'https://github.com/hourwise/Project-Adrasteia',
  tag: 'adrasteia-adoption-v0.4.0-protocol-1.4.0',
  commit: '124b6aee2629a3147739934ad5f1b45b32c8ba46',
  packageName: 'project-runtime-contracts',
  packageVersion: '0.4.0',
  protocolVersion: '1.4.0',
  minimumProtocolVersion: '1.0.0',
  artifactSha256: '11ee062b079f74d2a4558af315c9b9b12a6aede291d409c48f038d93c416e2c2',
});

export interface MnemosyneInspectionInput {
  runtimeVersion: string;
  runtimeInstanceId: string;
  startedAt: number;
  projectConfigured: boolean;
  anankeAvailable: boolean;
  ready: boolean;
}

export function buildRuntimeIdentity(input: Pick<MnemosyneInspectionInput, 'runtimeVersion' | 'runtimeInstanceId'>): RuntimeIdentity {
  return RuntimeIdentitySchema.parse({
    runtime: 'mnemosyne',
    version: input.runtimeVersion,
    packageVersion: input.runtimeVersion,
    protocolVersion: ADRASTEIA_BASELINE.protocolVersion,
    minimumProtocolVersion: ADRASTEIA_BASELINE.minimumProtocolVersion,
    supportedProtocolRange: { minimum: '1.0.0', maximum: '1.4.0' },
    standalone: true,
    optionalIntegrations: ['ananke-advisory-notifications'],
    kind: RuntimeKind.Mnemosyne,
    instanceId: input.runtimeInstanceId,
    displayName: 'Mnemosyne Memory Runtime',
    capabilities: [
      { id: 'memory.governed', name: 'Governed memory', version: input.runtimeVersion, category: CapabilityCategory.Memory, exposure: CapabilityExposure.Active },
      { id: 'runtime.inspect', name: 'Runtime inspection', version: input.runtimeVersion, category: CapabilityCategory.Health, exposure: CapabilityExposure.Active },
    ],
    metadata: { adrasteiaBaseline: `${ADRASTEIA_BASELINE.packageName}@${ADRASTEIA_BASELINE.packageVersion}` },
  });
}

export function buildRuntimeHealth(input: MnemosyneInspectionInput): RuntimeHealth {
  return RuntimeHealthSchema.parse({
    healthy: input.ready,
    status: input.ready ? RuntimeHealthStatus.Healthy : RuntimeHealthStatus.Degraded,
    uptimeMs: Math.max(0, Date.now() - input.startedAt),
    warnings: input.anankeAvailable ? [] : ['Ananke advisory integration is unavailable; standalone memory remains available.'],
    checkedAt: new Date().toISOString(),
  });
}

export function buildRuntimeReadiness(input: MnemosyneInspectionInput): RuntimeReadiness {
  const status = input.ready ? (input.anankeAvailable ? RuntimeReadinessStatus.Ready : RuntimeReadinessStatus.Degraded) : RuntimeReadinessStatus.NotReady;
  return RuntimeReadinessSchema.parse({
    ready: input.ready,
    status,
    checkedAt: new Date().toISOString(),
    unavailableIntegrations: input.anankeAvailable ? [] : ['ananke-advisory-notifications'],
    dependencies: [
      { dependencyId: 'project-runtime-contracts', status: RuntimeReadinessStatus.Ready, required: true },
      { dependencyId: 'mnemosyne-project-scope', status: input.projectConfigured ? RuntimeReadinessStatus.Ready : RuntimeReadinessStatus.NotReady, required: true },
      { dependencyId: 'credential-material-guard', status: RuntimeReadinessStatus.Ready, required: true },
      { dependencyId: 'ananke-advisory-notifications', status: input.anankeAvailable ? RuntimeReadinessStatus.Ready : RuntimeReadinessStatus.Degraded, required: false },
    ],
  });
}

export function buildCompatibilityManifest(input: Pick<MnemosyneInspectionInput, 'runtimeVersion'>): CompatibilityManifest {
  return CompatibilityManifestSchema.parse({
    manifestSchemaVersion: '1.0.0',
    runtimeName: 'mnemosyne',
    runtimeVersion: input.runtimeVersion,
    packageVersion: input.runtimeVersion,
    protocolVersion: '1.4.0',
    minimumSupportedProtocolVersion: '1.0.0',
    preferredProtocolVersion: '1.4.0',
    supportedProtocolRange: { minimum: '1.0.0', maximum: '1.4.0' },
    requiredRuntimeContractsVersionRange: '0.4.0',
    supportedTransports: [RuntimeTransport.Local, RuntimeTransport.Cli, RuntimeTransport.Mcp],
    capabilities: [
      { id: 'memory.governed', name: 'Governed memory', version: input.runtimeVersion, category: CapabilityCategory.Memory, exposure: CapabilityExposure.Active },
      { id: 'runtime.inspect', name: 'Runtime inspection', version: input.runtimeVersion, category: CapabilityCategory.Health, exposure: CapabilityExposure.Active },
    ],
    standalone: true,
    optionalIntegrations: ['ananke-advisory-notifications'],
    knownConstraints: [
      'Shared content preflight and provenance admission are deferred.',
      'No inbound Ananke decision transport or active grant verification exists.',
      'Credential detection is high-confidence and incomplete; encryption is not implemented.',
      'Single-project runtime only; no state-handle service, real MCP executable, Horae or Moirae compatibility claim.',
    ],
    degradedModes: ['Ananke advisory integration unavailable; standalone memory remains available.'],
  });
}

export function buildRuntimeRegistration(input: MnemosyneInspectionInput): RuntimeRegistration {
  const identity = buildRuntimeIdentity(input);
  return RuntimeRegistrationSchema.parse({
    identity,
    capabilities: identity.capabilities,
    health: buildRuntimeHealth(input),
    readiness: buildRuntimeReadiness(input),
    endpoints: [{ id: 'local-runtime-facade', transport: RuntimeTransport.Local, protocol: 'transport-neutral' }],
    registeredAt: new Date().toISOString(),
    inspectionMechanism: 'transport-neutral runtime facade and MCP inspection tool',
    optionalIntegrations: ['ananke-advisory-notifications'],
    standalone: true,
    degradedModes: ['Ananke advisory integration unavailable; standalone memory remains available.'],
  });
}

export function negotiateProtocol(proposedVersion: string, proposedMinimumVersion: string): ProtocolNegotiationResult {
  return ProtocolNegotiationResultSchema.parse(negotiateDetailed('1.4.0', '1.0.0', proposedVersion, proposedMinimumVersion));
}
