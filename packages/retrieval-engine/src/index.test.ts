import { describe, expect, it } from 'vitest';
import { RetrievalEngine } from './index.js';
import type { ConflictRecord, MemoryRecord } from '@mnemosyne/schema';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const createdAt = '2026-07-10T00:00:00.000Z';

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_fact_001',
    kind: 'fact',
    statement: 'The Almanac stores governed project memory with source provenance.',
    reliability: 0.8,
    importance: 'medium',
    status: 'active',
    source: {
      artifactId: 'doc_almanac_model',
      path: 'docs/ALMANAC_MODEL.md',
      heading: 'Almanac Model',
      lineStart: 1,
      lineEnd: 1,
      contentHash: hash,
      sourceType: 'readme',
    },
    locator: 'PROJECT.FACTS.001',
    createdAt,
    tags: ['almanac', 'memory'],
    supersedes: [],
    ...overrides,
  };
}

function conflict(memoryId: string): ConflictRecord {
  return {
    id: 'conflict_memory_001',
    type: 'memory_vs_code',
    description: 'Memory disagrees with current code.',
    memoryIds: [memoryId],
    sources: [memory({ id: memoryId }).source],
    recommendedResolution: 'Revalidate source before use.',
    shouldAnankeContinue: false,
    createdAt,
  };
}

describe('RetrievalEngine', () => {
  it('ranks memories by task relevance before generic reliability', () => {
    const engine = new RetrievalEngine();
    const relevant = memory({
      id: 'mem_decision_001',
      kind: 'decision',
      statement: 'SQLite is the persistence backend for the Almanac store.',
      reliability: 0.75,
      importance: 'high',
      locator: 'PROJECT.DECISIONS.001',
      tags: ['sqlite', 'almanac'],
    });
    const generic = memory({
      id: 'mem_law_001',
      kind: 'law',
      statement: 'No trusted memory without provenance.',
      reliability: 0.99,
      importance: 'critical',
      locator: 'MNEMOSYNE.LAWS.001',
      tags: ['provenance'],
    });

    const pack = engine.buildContextPack('How does sqlite persistence work?', [generic, relevant]);

    expect(pack.relevantMemories[0]?.id).toBe('mem_decision_001');
  });

  it('filters tentative and unsafe statuses by default', () => {
    const engine = new RetrievalEngine();
    const active = memory({ id: 'mem_fact_001', locator: 'PROJECT.FACTS.001' });
    const tentative = memory({
      id: 'mem_fact_002',
      locator: 'PROJECT.FACTS.002',
      status: 'tentative',
      statement: 'Tentative Almanac memory.',
    });
    const stale = memory({
      id: 'mem_fact_003',
      locator: 'PROJECT.FACTS.003',
      status: 'stale',
      statement: 'Stale Almanac memory.',
    });

    const pack = engine.buildContextPack('Almanac memory', [tentative, stale, active]);

    expect(pack.relevantMemories.map((result) => result.id)).toEqual(['mem_fact_001']);
  });

  it('can include tentative and unsafe records with warnings', () => {
    const engine = new RetrievalEngine();
    const contradicted = memory({
      id: 'mem_fact_004',
      locator: 'PROJECT.FACTS.004',
      status: 'contradicted',
      reliability: 0.42,
      statement: 'Contradicted retrieval memory.',
    });

    const pack = engine.buildContextPack('retrieval memory', [contradicted], [], {
      includeUnsafe: true,
    });

    expect(pack.relevantMemories[0]?.id).toBe('mem_fact_004');
    expect(pack.warnings).toContain('Context includes 1 stale, contradicted, or superseded memories.');
    expect(pack.warnings).toContain('Context includes 1 low-reliability memories.');
  });

  it('propagates only conflicts tied to selected memories', () => {
    const engine = new RetrievalEngine();
    const selected = memory({
      id: 'mem_fact_005',
      locator: 'PROJECT.FACTS.005',
      statement: 'Selected retrieval memory.',
      tags: ['selected'],
    });
    const omitted = memory({
      id: 'mem_fact_006',
      locator: 'PROJECT.FACTS.006',
      statement: 'Unrelated deployment memory.',
      tags: ['deployment'],
    });

    const pack = engine.buildContextPack(
      'selected retrieval',
      [selected, omitted],
      [conflict('mem_fact_005'), { ...conflict('mem_fact_006'), id: 'conflict_memory_002' }],
      { maxMemories: 1 },
    );

    expect(pack.relevantMemories.map((result) => result.id)).toContain('mem_fact_005');
    expect(pack.conflicts.map((result) => result.id)).toEqual(['conflict_memory_001']);
    expect(pack.warnings).toContain('Conflicts detected; resolve before relying on this context.');
  });

  it('respects max memory and token budget limits', () => {
    const engine = new RetrievalEngine();
    const memories = [
      memory({ id: 'mem_fact_007', locator: 'PROJECT.FACTS.007', statement: 'alpha retrieval memory' }),
      memory({ id: 'mem_fact_008', locator: 'PROJECT.FACTS.008', statement: 'alpha second memory' }),
      memory({ id: 'mem_fact_009', locator: 'PROJECT.FACTS.009', statement: 'alpha third memory' }),
    ];

    const pack = engine.buildContextPack('alpha', memories, [], { maxMemories: 2, tokenBudget: 30 });

    expect(pack.relevantMemories.length).toBeLessThanOrEqual(2);
    expect(pack.tokenEstimate).toBeGreaterThan(0);
    expect(pack.warnings).toContain('Some candidate memories were omitted to keep the context pack compact.');
  });

  it('includes source snippets only for selected memory sources', () => {
    const engine = new RetrievalEngine();
    const selected = memory({
      id: 'mem_fact_010',
      locator: 'PROJECT.FACTS.010',
      statement: 'Source snippets recover Almanac context.',
      source: {
        ...memory().source,
        lineStart: 2,
        lineEnd: 2,
      },
    });

    const pack = engine.buildContextPack('recover context', [selected], [], {
      sourceTextByPath: {
        'docs/ALMANAC_MODEL.md': ['# Almanac Model', 'The Almanac stores governed memory.', 'Other text'].join(
          '\n',
        ),
      },
    });

    expect(pack.sourceSnippets).toHaveLength(1);
    expect(pack.sourceSnippets[0]?.text).toBe('The Almanac stores governed memory.');
    expect(pack.sourceSnippets[0]?.source.path).toBe('docs/ALMANAC_MODEL.md');
  });

  it('can rank memories without building a context pack', () => {
    const engine = new RetrievalEngine();
    const ranked = engine.rankMemories('provenance source', [
      memory({
        id: 'mem_law_002',
        kind: 'law',
        statement: 'Every trusted memory requires source provenance.',
        importance: 'critical',
        locator: 'MNEMOSYNE.LAWS.002',
        tags: ['provenance'],
      }),
    ]);

    expect(ranked[0]?.matchedTerms).toEqual(['provenance', 'source']);
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });
});
