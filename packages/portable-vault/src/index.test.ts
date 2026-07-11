import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectRecord } from '@mnemosyne/schema';
import { PortableVaultStore } from './index.js';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const timestamp = '2026-07-11T00:00:00.000Z';

const manifest = {
  projectId: 'project_mnemosyne',
  name: 'Project Mnemosyne',
  schemaVersion: '1.0' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function record(overrides: Record<string, unknown> = {}) {
  return ProjectRecord.parse({
    id: 'record_requirement_001',
    projectId: 'project_mnemosyne',
    kind: 'requirement',
    scope: 'project_truth',
    content: 'Portable records retain source evidence.',
    sources: [source()],
    evidence: [],
    createdAt: timestamp,
    reliability: 0.9,
    status: 'active',
    accessClassification: 'internal',
    supersedes: [],
    contradicts: [],
    tags: ['portable-vault'],
    ...overrides,
  });
}

function source() {
  return {
    artifactId: 'doc_requirements',
    path: 'docs/PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md',
    contentHash: hash,
    sourceType: 'readme' as const,
  };
}

describe('ProjectRecord', () => {
  it('keeps task state and advisory experience outside project truth', () => {
    expect(() => record({ kind: 'task-state', scope: 'project_truth' })).toThrow();
    expect(() => record({ kind: 'requirement', scope: 'task_state' })).toThrow();
    expect(() => record({ kind: 'fact', scope: 'agent_performance' })).toThrow();
    expect(record({ kind: 'task-state', scope: 'task_state', id: 'record_task_001' }).scope).toBe('task_state');
  });
});

describe('PortableVaultStore', () => {
  it('writes human-readable project-truth and task-state records to separate locations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-vault-'));
    try {
      const store = new PortableVaultStore(directory, { now: () => timestamp });
      await store.initialize(manifest);
      await store.writeRecord(record());
      await store.writeRecord(
        record({
          id: 'record_task_001',
          kind: 'task-state',
          scope: 'task_state',
          content: 'Run portable-vault migration tests.',
        }),
      );

      expect(await store.listRecords({ scope: 'project_truth' })).toHaveLength(1);
      expect(await store.listRecords({ scope: 'task_state' })).toHaveLength(1);
      expect(JSON.parse(await readFile(join(directory, 'requirements', 'record_requirement_001.json'), 'utf8'))).toMatchObject({
        kind: 'requirement',
      });
      expect(JSON.parse(await readFile(join(directory, 'task-state', 'record_task_001.json'), 'utf8'))).toMatchObject({
        scope: 'task_state',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('exports and imports a validated vault without changing record identity', async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'mnemosyne-vault-source-'));
    const targetDirectory = await mkdtemp(join(tmpdir(), 'mnemosyne-vault-target-'));
    try {
      const sourceVault = new PortableVaultStore(sourceDirectory, { now: () => timestamp });
      await sourceVault.initialize(manifest);
      await sourceVault.writeRecord(record());
      const bundle = await sourceVault.exportVault();

      const targetVault = new PortableVaultStore(targetDirectory, { now: () => timestamp });
      const imported = await targetVault.importVault(bundle);

      expect(imported).toEqual(bundle);
      expect((await targetVault.readRecord('record_requirement_001'))?.content).toContain('source evidence');
    } finally {
      await rm(sourceDirectory, { recursive: true, force: true });
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it('rejects records for a different project', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-vault-mismatch-'));
    try {
      const store = new PortableVaultStore(directory, { now: () => timestamp });
      await store.initialize(manifest);
      await expect(store.writeRecord(record({ projectId: 'project_other' }))).rejects.toThrow('belongs to');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
