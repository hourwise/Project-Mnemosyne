import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectRecord } from '@mnemosyne/schema';
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
        vaultOptions: { now: () => timestamp },
      });
      await runtime.initializeVault({
        projectId: 'project_mnemosyne',
        name: 'Project Mnemosyne',
        schemaVersion: '1.0',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await runtime.writeVaultRecord(record());
      await runtime.writeVaultRecord(
        record({
          id: 'record_requirement_001',
          kind: 'requirement',
          scope: 'project_truth',
          content: 'Restart packs must remain source-linked.',
        }),
      );

      const pack = await runtime.createRestartPack('record_task_001', {
        relevantIds: ['record_requirement_001'],
        branch: 'feature/restart-packs',
      });

      expect(pack.relevant.map((item) => item.id)).toEqual(['record_requirement_001']);
      expect(runtime.restartPacks.render(pack)).toContain('Branch: feature/restart-packs');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
