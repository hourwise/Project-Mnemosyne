import { describe, expect, it } from 'vitest';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';
import { CompatibilityManifestSchema, RuntimeHealthSchema, RuntimeIdentitySchema, RuntimeReadinessSchema, RuntimeRegistrationSchema } from 'project-runtime-contracts';

describe('sanitized Adrasteia-valid runtime inspection', () => {
  it('returns canonical identity, health, readiness, registration and compatibility records without paths or credentials', () => {
    const runtime = new MnemosyneRuntime({ projectRoot: 'D:/not-exposed', projectId: 'project_inspection', runtimeInstanceId: 'runtime_inspection' });
    expect(RuntimeIdentitySchema.parse(runtime.runtimeIdentity()).runtime).toBe('mnemosyne');
    expect(RuntimeHealthSchema.parse(runtime.runtimeHealth()).healthy).toBe(true);
    expect(RuntimeReadinessSchema.parse(runtime.runtimeReadiness()).ready).toBe(true);
    expect(RuntimeRegistrationSchema.parse(runtime.runtimeRegistration()).standalone).toBe(true);
    expect(CompatibilityManifestSchema.parse(runtime.compatibilityManifest()).knownConstraints).toContain('Shared content preflight and provenance admission are deferred.');
    const text = JSON.stringify(runtime.inspect());
    expect(text).not.toContain('D:/not-exposed');
    expect(text).not.toMatch(/authorization|bearer|private key/i);
  });

  it('uses semantic negotiation for exact, overlap and failure cases', () => {
    const runtime = new MnemosyneRuntime({ projectRoot: '.', projectId: 'project_inspection', runtimeInstanceId: 'runtime_inspection' });
    expect(runtime.negotiateProtocol('1.4.0', '1.0.0')).toEqual({ compatible: true, negotiatedVersion: '1.4.0' });
    expect(runtime.negotiateProtocol('1.2.0', '1.0.0')).toEqual({ compatible: true, negotiatedVersion: '1.2.0' });
    expect(runtime.negotiateProtocol('2.0.0', '2.0.0')).toMatchObject({ compatible: false, reason: 'unsupported_major' });
    expect(runtime.negotiateProtocol('invalid', '1.0.0')).toMatchObject({ compatible: false, reason: 'malformed_version' });
    expect(runtime.negotiateProtocol('1.0.0', '1.4.0')).toMatchObject({ compatible: false, reason: 'invalid_range' });
  });
});
