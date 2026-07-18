import { describe, expect, it } from 'vitest';
import { ProjectRecord } from '@mnemosyne/schema';
import { createTrustedOperationContext } from '@mnemosyne/adrasteia-adapter';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';
import { RestartPackEngine } from './index.js';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const timestamp = '2026-07-11T00:00:00.000Z';
const project = {
  projectId: 'project_mnemosyne',
  name: 'Project Mnemosyne',
  schemaVersion: '1.0' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const context = createTrustedOperationContext({
  execution: {
    authenticatedPrincipal: { id: 'service_restart_test', kind: PrincipalKind.Service },
    actingPrincipal: { id: 'agent_restart_test', kind: PrincipalKind.Agent },
    runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_restart_test', sessionId: 'session_restart_test', projectId: 'project_mnemosyne',
  },
  scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_mnemosyne' },
  purpose: 'restart_pack_test',
});

function record(overrides: Record<string, unknown> = {}) {
  return ProjectRecord.parse({
    id: 'record_task_042',
    projectId: 'project_mnemosyne',
    kind: 'task-state',
    scope: 'task_state',
    content: 'Complete portable vault runtime integration.',
    sources: [source()],
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

function source() {
  return {
    artifactId: 'doc_requirements',
    path: 'docs/PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md',
    lineStart: 31,
    lineEnd: 42,
    contentHash: hash,
    sourceType: 'readme' as const,
  };
}

describe('RestartPackEngine', () => {
  it('renders deterministic, source-linked, stale-aware restart context', () => {
    const engine = new RestartPackEngine();
    const pack = engine.build(context,
      {
        project,
        task: record(),
        branch: 'feature/portable-vault',
        lastVerifiedCommit: 'abc123',
        completed: [
          record({
            id: 'record_decision_002',
            kind: 'decision',
            scope: 'project_truth',
            content: 'Portable vault schemas are versioned.',
          }),
        ],
        outstanding: [
          record({
            id: 'record_requirement_003',
            kind: 'requirement',
            scope: 'project_truth',
            content: 'Add runtime integration for restart packs.',
            status: 'stale',
          }),
        ],
      },
      { now: () => timestamp },
    );

    expect(pack.warnings).toContain('Restart pack includes 1 stale record.');
    expect(engine.render(pack)).toContain('docs/PROJECT_MNEMOSYNE_RESEARCH_AND_REQUIREMENTS.md:31-42');
    expect(engine.render(pack)).toContain('Branch: feature/portable-vault');
    expect(pack.tokenEstimate).toBeGreaterThan(0);
  });

  it('requires a task-state record and rejects cross-project records', () => {
    const engine = new RestartPackEngine();
    expect(() => engine.build(context, { project, task: record({ kind: 'requirement', scope: 'project_truth' }) })).toThrow(
      'task-state',
    );
    expect(() =>
      engine.build(context, {
        project,
        task: record(),
        relevant: [record({ id: 'record_fact_001', projectId: 'project_other', kind: 'fact', scope: 'project_truth' })],
      }),
    ).toThrow('different project');
  });

  it('omits optional records deterministically when constrained by token budget', () => {
    const engine = new RestartPackEngine();
    const pack = engine.build(context,
      {
        project,
        task: record(),
        relevant: [
          record({ id: 'record_fact_002', kind: 'fact', scope: 'project_truth', content: 'A'.repeat(200) }),
          record({ id: 'record_fact_001', kind: 'fact', scope: 'project_truth', content: 'B'.repeat(200) }),
        ],
      },
      { tokenBudget: 80, now: () => timestamp },
    );

    expect(pack.relevant).toEqual([]);
    expect(pack.warnings).toContain('Some restart records were omitted to stay within the token budget.');
  });
});
