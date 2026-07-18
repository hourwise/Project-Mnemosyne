import {
  ADRASTEIA_BASELINE,
  MnemosyneOperationContextSchema,
  assertContextWithinRuntimeScope,
  createTrustedOperationContext,
} from '@mnemosyne/adrasteia-adapter';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';

const runtimeScope = { projectId: 'project_conformance', runtimeInstanceId: 'runtime_conformance' };
const context = createTrustedOperationContext({
  execution: {
    authenticatedPrincipal: { id: 'service_conformance', kind: PrincipalKind.Service },
    actingPrincipal: { id: 'agent_conformance', kind: PrincipalKind.Agent },
    runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_conformance', sessionId: 'session_conformance', projectId: 'project_conformance',
  },
  scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_conformance' },
  purpose: 'adrasteia_conformance',
});
MnemosyneOperationContextSchema.parse(context);
assertContextWithinRuntimeScope(context, runtimeScope);
if (ADRASTEIA_BASELINE.packageVersion !== '0.4.0' || ADRASTEIA_BASELINE.protocolVersion !== '1.4.0') throw new Error('Unexpected Project Adrasteia baseline.');
let mismatchRejected = false;
try { assertContextWithinRuntimeScope({ ...context, scope: { ...context.scope, projectId: 'project_other' } }, runtimeScope); }
catch { mismatchRejected = true; }
if (!mismatchRejected) throw new Error('Project scope mismatch was not rejected.');
console.log('Adrasteia conformance passed: canonical context, correlation and scope fail-closed checks succeeded.');
