import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectRecord } from '@mnemosyne/schema';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';
import { MnemosyneRuntime } from './index.js';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const timestamp = '2026-07-11T00:00:00.000Z';

function record(overrides: Record<string, unknown> = {}) {
  return ProjectRecord.parse({
    id: 'record_task_001',
    projectId: 'project_mnemosyne',
    kind: 'task-state',
    scope: 'task_state',
    content: 'Integrate restart packs into the runtime.',
    sources: [
      {
        artifactId: 'doc_requirements',
        path: 'docs/PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md',
        contentHash: hash,
        sourceType: 'readme',
      },
    ],
    evidence: [],
    createdAt: timestamp,
    reliability: 0.9,
    status: 'active',
    accessClassification: 'internal',
    supersedes: [],
    contradicts: [],
    tags: [],
    ...overrides,
  });
}

describe('MnemosyneRuntime portable vault integration', () => {
  it('initializes a vault and resolves explicit record IDs into a restart pack', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-runtime-'));
    try {
      const runtime = new MnemosyneRuntime({
        projectRoot: directory,
        projectId: 'project_mnemosyne',
        vaultOptions: { now: () => timestamp },
      });
      const context = runtime.createOperationContext({
        execution: {
          authenticatedPrincipal: { id: 'service_runtime_test', kind: PrincipalKind.Service },
          actingPrincipal: { id: 'agent_runtime_test', kind: PrincipalKind.Agent },
          runtimeId: 'mnemosyne', runtimeInstanceId: runtime.runtimeScope.runtimeInstanceId, sessionId: 'session_runtime_test', projectId: 'project_mnemosyne',
        },
        scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_mnemosyne' },
        purpose: 'runtime_vault_test',
      });
      await runtime.initializeVault(context, {
        projectId: 'project_mnemosyne',
        name: 'Project Mnemosyne',
        schemaVersion: '1.0',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await runtime.writeVaultRecord(context, record());
      await runtime.writeVaultRecord(context,
        record({
          id: 'record_requirement_001',
          kind: 'requirement',
          scope: 'project_truth',
          content: 'Restart packs must remain source-linked.',
        }),
      );

      const pack = await runtime.createRestartPack(context, 'record_task_001', {
        relevantIds: ['record_requirement_001'],
        branch: 'feature/restart-packs',
      });

      expect(pack.relevant.map((item) => item.id)).toEqual(['record_requirement_001']);
      expect(runtime.renderRestartPack(pack)).toContain('Branch: feature/restart-packs');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
