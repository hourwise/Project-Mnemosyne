import { MnemosyneRuntime } from '@mnemosyne/runtime-core';
import { CompatibilityManifestSchema, RuntimeHealthSchema, RuntimeIdentitySchema, RuntimeReadinessSchema, RuntimeRegistrationSchema } from 'project-runtime-contracts';

const runtime = new MnemosyneRuntime({ projectRoot: '.', projectId: 'project_inspection_smoke', runtimeInstanceId: 'runtime_inspection_smoke' });
RuntimeIdentitySchema.parse(runtime.runtimeIdentity());
RuntimeHealthSchema.parse(runtime.runtimeHealth());
RuntimeReadinessSchema.parse(runtime.runtimeReadiness());
RuntimeRegistrationSchema.parse(runtime.runtimeRegistration());
CompatibilityManifestSchema.parse(runtime.compatibilityManifest());
const result = runtime.negotiateProtocol('1.4.0', '1.0.0');
if (!result.compatible || result.negotiatedVersion !== '1.4.0') throw new Error('Protocol negotiation smoke failed.');
const inspection = JSON.stringify(runtime.inspect());
if (/projectRoot|authorization|bearer|private key/i.test(inspection)) throw new Error('Runtime inspection exposed unsafe configuration or credential material.');
console.log('MCP/runtime inspection smoke passed.');
