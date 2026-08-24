import { describe, expect, it } from 'vitest';
import { MemoryIngestEngine } from './index.js';

const hashA = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const hashB = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const sourceA = {
  artifactId: 'artifact_a',
  path: 'docs/a.md',
  contentHash: hashA,
  sourceType: 'readme' as const,
};
const sourceB = {
  artifactId: 'artifact_b',
  path: 'docs/b.md',
  contentHash: hashB,
  sourceType: 'adr' as const,
};

describe('MemoryIngestEngine provenance', () => {
  it('binds a single source to a durable memory provenance envelope', () => {
    const engine = new MemoryIngestEngine({ now: () => '2026-08-24T10:00:00.000Z' });
    const memory = engine.ingest({
      id: 'mem_fact_001',
      kind: 'fact',
      statement: 'The source remains hash-addressed.',
      importance: 'medium',
      source: sourceA,
      locator: 'PROJECT.FACTS.001',
    });

    expect(memory.provenance).toMatchObject({
      provenanceVersion: '1.0',
      sources: [{ sourceKind: 'readme', sourceLocator: 'docs/a.md', sourceContentHash: hashA }],
      claimBindings: [],
    });
    expect(memory.provenance?.sources[0]?.metadata).toMatchObject({ artifactId: 'artifact_a' });
  });

  it('preserves every source and adds claim-level bindings for a consolidated memory', () => {
    const engine = new MemoryIngestEngine({ now: () => '2026-08-24T10:00:00.000Z' });
    const memory = engine.ingest({
      id: 'mem_fact_merged',
      kind: 'fact',
      statement: 'Two documents describe the same control.',
      importance: 'high',
      source: sourceA,
      sources: [sourceB],
      locator: 'PROJECT.FACTS.002',
    });

    expect(memory.provenance?.sources).toHaveLength(2);
    expect(memory.provenance?.derivation).toMatchObject({ method: 'MERGE', sourceIds: expect.any(Array) });
    expect(memory.provenance?.claimBindings).toEqual([
      expect.objectContaining({ claimId: 'mem_fact_merged', relation: 'SUPPORTED_BY', sourceIds: expect.any(Array) }),
    ]);
  });

  it('rejects a caller-supplied binding that points outside the source set', () => {
    const engine = new MemoryIngestEngine({ now: () => '2026-08-24T10:00:00.000Z' });

    expect(() => engine.ingest({
      id: 'mem_fact_invalid',
      kind: 'fact',
      statement: 'Invalid provenance must fail closed.',
      importance: 'medium',
      source: sourceA,
      locator: 'PROJECT.FACTS.003',
      provenance: {
        sources: [{
          sourceId: 'source_a',
          sourceKind: 'readme',
          sourceLocator: 'docs/a.md',
          sourceContentHash: hashA,
          ingestedAt: '2026-08-24T10:00:00.000Z',
          submittedBy: { id: 'test', kind: 'test' },
        }],
        claimBindings: [{ claimId: 'mem_fact_invalid', sourceIds: ['source_missing'], relation: 'SUPPORTED_BY' }],
      },
    })).toThrow();
  });

  it('enriches legacy-shaped records without changing status or identity', () => {
    const engine = new MemoryIngestEngine({ now: () => '2026-08-24T10:00:00.000Z' });
    const memory = engine.enrich({
      id: 'mem_fact_legacy',
      kind: 'fact',
      statement: 'Legacy records can be upgraded at the boundary.',
      reliability: 0.5,
      importance: 'medium',
      status: 'active',
      source: sourceA,
      locator: 'PROJECT.FACTS.004',
      createdAt: '2026-08-23T10:00:00.000Z',
    }, { submittedBy: { id: 'runtime_1', kind: 'runtime' } });

    expect(memory).toMatchObject({ id: 'mem_fact_legacy', status: 'active', provenance: { provenanceVersion: '1.0' } });
    expect(memory.provenance?.sources[0]?.submittedBy).toEqual({ id: 'runtime_1', kind: 'runtime' });
  });
});
