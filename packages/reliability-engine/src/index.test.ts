import { describe, expect, it } from 'vitest';
import { ReliabilityEngine } from './index.js';
import type { MemoryRecord } from '@mnemosyne/schema';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const changedHash = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const createdAt = '2026-07-01T00:00:00.000Z';
const now = '2026-07-09T00:00:00.000Z';

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_law_001',
    kind: 'law',
    statement: 'No trusted memory without provenance.',
    reliability: 0.5,
    importance: 'critical',
    status: 'active',
    source: {
      artifactId: 'doc_laws_mnemosyne',
      path: 'docs/LAWS_OF_MNEMOSYNE.md',
      heading: 'Law I - Provenance',
      lineStart: 3,
      lineEnd: 5,
      contentHash: hash,
      sourceType: 'law',
    },
    locator: 'MNEMOSYNE.LAWS.001',
    createdAt,
    tags: ['law'],
    supersedes: [],
    ...overrides,
  };
}

describe('ReliabilityEngine', () => {
  it('keeps verified law memories high confidence', () => {
    const engine = new ReliabilityEngine();

    const assessment = engine.assess(memory(), {
      now,
      currentSourceHash: hash,
      confirmations: 2,
      authoritative: true,
    });

    expect(assessment.status).toBe('active');
    expect(assessment.reliability).toBeGreaterThanOrEqual(0.99);
    expect(assessment.reasons).toContain('SOURCE_CONFIRMED');
    expect(assessment.reasons).toContain('CONFIRMATIONS_APPLIED');
    expect(assessment.memory.lastVerifiedAt).toBe(now);
  });

  it('marks changed source hashes stale and lowers reliability', () => {
    const engine = new ReliabilityEngine();

    const assessment = engine.assess(memory(), {
      now,
      currentSourceHash: changedHash,
    });

    expect(assessment.hashStillValid).toBe(false);
    expect(assessment.status).toBe('stale');
    expect(assessment.reliability).toBeLessThan(0.8);
    expect(assessment.reasons).toContain('SOURCE_HASH_CHANGED');
  });

  it('marks contradicted memories contradicted', () => {
    const engine = new ReliabilityEngine();

    const assessment = engine.assess(memory({ kind: 'decision', source: { ...memory().source, sourceType: 'adr' } }), {
      now,
      hashStillValid: true,
      contradictions: 2,
    });

    expect(assessment.status).toBe('contradicted');
    expect(assessment.reliability).toBeLessThan(0.8);
    expect(assessment.reasons).toContain('CONTRADICTIONS_FOUND');
  });

  it('marks missing sources stale and records the reason', () => {
    const engine = new ReliabilityEngine();

    const assessment = engine.assess(memory(), {
      now,
      sourceAvailable: false,
      hashStillValid: false,
    });

    expect(assessment.status).toBe('stale');
    expect(assessment.reliability).toBeLessThan(0.5);
    expect(assessment.reasons).toContain('SOURCE_MISSING');
  });

  it('applies faster age decay to model inference than laws', () => {
    const engine = new ReliabilityEngine();
    const lawAssessment = engine.assess(memory(), { now, hashStillValid: true, ageDays: 30 });
    const inferenceAssessment = engine.assess(
      memory({
        id: 'mem_hypothesis_001',
        kind: 'hypothesis',
        importance: 'medium',
        locator: 'PROJECT.HYPOTHESES.001',
        source: {
          ...memory().source,
          artifactId: 'conversation_session_001',
          path: 'journal/session-001.md',
          sourceType: 'model_inference',
        },
      }),
      { now, hashStillValid: true, ageDays: 30 },
    );

    expect(lawAssessment.reliability).toBeGreaterThan(inferenceAssessment.reliability);
    expect(inferenceAssessment.reasons).toContain('AGE_DECAY_APPLIED');
  });

  it('marks superseded memories and preserves supersession reference', () => {
    const engine = new ReliabilityEngine();

    const assessment = engine.assess(memory(), {
      now,
      hashStillValid: true,
      supersededBy: 'mem_law_002',
    });

    expect(assessment.status).toBe('superseded');
    expect(assessment.memory.supersededBy).toBe('mem_law_002');
    expect(assessment.reasons).toContain('SUPERSEDED');
  });

  it('keeps the revalidate compatibility API returning a memory record', () => {
    const engine = new ReliabilityEngine();

    const updated = engine.revalidate(memory(), { now, hashStillValid: true });

    expect(updated.id).toBe('mem_law_001');
    expect(updated.lastVerifiedAt).toBe(now);
  });
});
