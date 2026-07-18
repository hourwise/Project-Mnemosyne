import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InMemoryAlmanacStore } from '@mnemosyne/almanac-store';
import { attributionFromContext } from '@mnemosyne/adrasteia-adapter';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';
import { MemoryRecord, ProjectRecord } from '@mnemosyne/schema';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const createdAt = '2026-07-18T00:00:00.000Z';

function runtimeWithContext(store = new InMemoryAlmanacStore()) {
  const runtime = new MnemosyneRuntime({ projectRoot: '.', projectId: 'project_boundary', runtimeInstanceId: 'runtime_boundary', store });
  const context = runtime.createOperationContext({
    execution: { authenticatedPrincipal: { id: 'service_boundary', kind: PrincipalKind.Service }, actingPrincipal: { id: 'agent_boundary', kind: PrincipalKind.Agent }, runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_boundary', sessionId: 'session_boundary', projectId: 'project_boundary' },
    scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_boundary' },
    purpose: 'memory_boundary_test',
  });
  return { runtime, context, store };
}

function memory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_fact_boundary', kind: 'fact', statement: 'Boundary test memory.', reliability: 0.95, importance: 'high', status: 'active',
    source: { artifactId: 'doc_boundary', path: 'docs/BOUNDARY.md', contentHash: hash, sourceType: 'readme' }, locator: 'BOUNDARY.FACT.001', createdAt, supersedes: [], tags: [],
    ...overrides,
  };
}

describe('classified memory and credential boundaries', () => {
  it('excludes restricted Almanac memory before retrieval and context rendering', () => {
    const { runtime, context, store } = runtimeWithContext();
    store.createMemory(MemoryRecord.parse({ ...memory(), accessClassification: 'restricted', attribution: attributionFromContext(context) }));
    const server = runtime.createMcpServer({ 'docs/BOUNDARY.md': 'restricted source text' });
    expect(server.callTool('almanac_search', {}, context).content[0]?.text).toContain('"restricted":1');
    const pack = server.callTool('almanac_get_context_pack', { task: 'boundary' }, context).content[0]?.text ?? '';
    expect(pack).not.toContain('Boundary test memory.');
    expect(pack).not.toContain('restricted source text');
  });

  it('rejects credential material before Almanac persistence and audits only categories', () => {
    const { runtime, context, store } = runtimeWithContext();
    const result = runtime.createMcpServer().callTool('almanac_write_memory', { memory: memory({ statement: 'Authorization: Bearer verylongcredentialmaterialvalue' }) }, context);
    expect(result.isError).toBe(true);
    expect(store.search({ text: 'credentialmaterialvalue' })).toHaveLength(0);
    const audit = runtime.audit.list().find((event) => event.eventType === 'CREDENTIAL_MATERIAL_REJECTED');
    expect(audit?.metadata).toMatchObject({ categories: expect.any(Array) });
    expect(JSON.stringify(audit?.metadata)).not.toContain('verylongcredentialmaterialvalue');
  });

  it('rejects secret-bearing portable records before vault persistence or export', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-boundary-'));
    try {
      const runtime = new MnemosyneRuntime({ projectRoot: directory, projectId: 'project_boundary', runtimeInstanceId: 'runtime_boundary' });
      const context = runtime.createOperationContext({
        execution: { authenticatedPrincipal: { id: 'service_boundary', kind: PrincipalKind.Service }, actingPrincipal: { id: 'agent_boundary', kind: PrincipalKind.Agent }, runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_boundary', sessionId: 'session_boundary', projectId: 'project_boundary' },
        scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_boundary' }, purpose: 'portable_boundary_test',
      });
      await runtime.initializeVault(context, { projectId: 'project_boundary', name: 'Boundary', schemaVersion: '1.0', createdAt, updatedAt: createdAt });
      const secretRecord = ProjectRecord.parse({
        id: 'record_fact_boundary', projectId: 'project_boundary', kind: 'fact', scope: 'project_truth', content: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key', sources: [{ artifactId: 'doc_boundary', path: 'docs/BOUNDARY.md', contentHash: hash, sourceType: 'readme' }], evidence: [], createdAt, reliability: 0.9, status: 'active', accessClassification: 'internal', supersedes: [], contradicts: [], tags: [],
      });
      await expect(runtime.writeVaultRecord(context, secretRecord)).rejects.toThrow('MNEMOSYNE_CREDENTIAL_MATERIAL_REJECTED');
      expect((await runtime.exportVault(context)).records).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
