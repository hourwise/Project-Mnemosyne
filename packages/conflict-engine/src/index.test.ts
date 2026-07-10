import { describe, expect, it } from 'vitest';
import { ConflictEngine } from './index.js';
import type { AuditEvent, MemoryRecord, SourceReference } from '@mnemosyne/schema';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const replacementHash = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const createdAt = '2026-07-10T00:00:00.000Z';

function source(overrides: Partial<SourceReference> = {}): SourceReference {
  return {
    artifactId: 'doc_almanac_model',
    path: 'docs/ALMANAC_MODEL.md',
    contentHash: hash,
    sourceType: 'readme',
    ...overrides,
  };
}

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_fact_001',
    kind: 'fact',
    statement: 'The Almanac keeps governed project memory.',
    reliability: 0.8,
    importance: 'high',
    status: 'active',
    source: source(),
    locator: 'PROJECT.FACTS.001',
    createdAt,
    supersedes: [],
    tags: [],
    ...overrides,
  };
}

describe('ConflictEngine', () => {
  it('detects active memories whose checked source is missing', () => {
    const conflicts = new ConflictEngine().detect([memory()], {
      now: createdAt,
      sourceByPath: { 'docs/ALMANAC_MODEL.md': { available: false } },
    });

    expect(conflicts).toMatchObject([
      {
        type: 'active_memory_source_missing',
        memoryIds: ['mem_fact_001'],
        sources: [source()],
        shouldAnankeContinue: false,
      },
    ]);
    expect(conflicts[0]?.recommendedResolution).toContain('stale');
  });

  it('detects source hash changes and writes structured audit events', () => {
    const auditEvents: AuditEvent[] = [];
    const conflicts = new ConflictEngine().detect([memory()], {
      now: createdAt,
      sourceByPath: { 'docs/ALMANAC_MODEL.md': { available: true, contentHash: replacementHash } },
      auditSink: { writeAuditEvent: (event) => auditEvents.push(event) },
    });

    expect(conflicts[0]).toMatchObject({ type: 'source_hash_changed', memoryIds: ['mem_fact_001'] });
    expect(auditEvents[0]).toMatchObject({ eventType: 'CONFLICT_DETECTED', memoryId: 'mem_fact_001' });
  });

  it('detects simple user instruction versus law keyword conflicts', () => {
    const law = memory({
      id: 'mem_law_001',
      kind: 'law',
      statement: 'Agents must not delete project files.',
      locator: 'MNEMOSYNE.LAWS.001',
      source: source({ artifactId: 'doc_laws', path: 'docs/LAWS.md', sourceType: 'law' }),
    });
    const instructionSource = source({
      artifactId: 'usr_instruction_001',
      path: 'sessions/instruction.md',
      sourceType: 'user_instruction',
    });

    const conflicts = new ConflictEngine().detect([law], {
      now: createdAt,
      userInstructions: [{ text: 'Please delete the project files now.', source: instructionSource }],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: 'user_vs_law',
      memoryIds: ['mem_law_001'],
      sources: [instructionSource, law.source],
    });
  });

  it('flags active memories with superseding memory and ADR evidence', () => {
    const oldAdr = memory({
      id: 'mem_decision_001',
      kind: 'decision',
      locator: 'PROJECT.DECISIONS.001',
      source: source({ artifactId: 'adr_001', path: 'docs/ADR-0001-storage.md', sourceType: 'adr' }),
    });
    const newAdr = memory({
      id: 'mem_decision_002',
      kind: 'decision',
      locator: 'PROJECT.DECISIONS.002',
      source: source({ artifactId: 'adr_002', path: 'docs/ADR-0002-storage.md', sourceType: 'adr' }),
      supersedes: ['mem_decision_001'],
    });

    const conflicts = new ConflictEngine().detect([oldAdr, newAdr], {
      now: createdAt,
      sourceByPath: {
        'docs/ADR-0002-storage.md': { text: 'Status: Accepted. This supersedes ADR-0001.' },
      },
    });

    expect(conflicts.filter((conflict) => conflict.type === 'active_memory_superseded_evidence')).toHaveLength(2);
    expect(conflicts.every((conflict) => conflict.recommendedResolution.length > 0)).toBe(true);
  });

  it('flags active memories sourced only from inference or speculation', () => {
    const conflicts = new ConflictEngine().detect([
      memory({ source: source({ sourceType: 'model_inference' }) }),
    ]);

    expect(conflicts[0]).toMatchObject({ type: 'active_memory_untrusted_source' });
  });
});
