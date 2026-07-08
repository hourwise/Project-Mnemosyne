import { describe, expect, it } from 'vitest';
import {
  AuditEvent,
  ConflictRecord,
  ContextPack,
  MemoryRecord,
  ProjectGraphEdge,
  ResultEnvelope,
  SourceReference,
  SourceSnippet,
  err,
  ok,
} from './index.js';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const createdAt = '2026-07-08T00:00:00.000Z';

const source = {
  artifactId: 'doc_laws_mnemosyne',
  path: 'docs/LAWS_OF_MNEMOSYNE.md',
  heading: 'Law I - Provenance',
  lineStart: 3,
  lineEnd: 5,
  contentHash: hash,
  sourceType: 'law',
} as const;

const memory = {
  id: 'mem_law_001',
  kind: 'law',
  statement: 'No trusted memory without provenance.',
  reliability: 0.98,
  importance: 'critical',
  status: 'active',
  locator: 'MNEMOSYNE.LAWS.001',
  createdAt,
  source,
  tags: ['law', 'provenance'],
} as const;

describe('SourceReference', () => {
  it('serializes and parses a recoverable source reference', () => {
    const parsed = SourceReference.parse(JSON.parse(JSON.stringify(source)));

    expect(parsed).toEqual(source);
  });

  it('rejects malformed hashes and path escapes', () => {
    expect(() => SourceReference.parse({ ...source, contentHash: 'sha256:abc123' })).toThrow();
    expect(() => SourceReference.parse({ ...source, path: '../secrets.txt' })).toThrow();
    expect(() => SourceReference.parse({ ...source, path: 'C:\\Users\\secret.txt' })).toThrow();
  });

  it('rejects invalid source line ranges', () => {
    expect(() => SourceReference.parse({ ...source, lineStart: 12, lineEnd: 4 })).toThrow();
    expect(() => SourceReference.parse({ ...source, lineStart: undefined, lineEnd: 4 })).toThrow();
  });
});

describe('MemoryRecord', () => {
  it('serializes and parses a sourced memory record', () => {
    const parsed = MemoryRecord.parse(JSON.parse(JSON.stringify(memory)));

    expect(parsed.locator).toBe('MNEMOSYNE.LAWS.001');
    expect(parsed.supersedes).toEqual([]);
    expect(parsed.tags).toEqual(['law', 'provenance']);
  });

  it('rejects missing provenance and bad reliability', () => {
    expect(() => MemoryRecord.parse({ ...memory, source: undefined })).toThrow();
    expect(() => MemoryRecord.parse({ ...memory, reliability: 1.1 })).toThrow();
    expect(() => MemoryRecord.parse({ ...memory, reliability: -0.01 })).toThrow();
  });

  it('rejects malformed locators and inconsistent supersession', () => {
    expect(() => MemoryRecord.parse({ ...memory, locator: 'law-1' })).toThrow();
    expect(() => MemoryRecord.parse({ ...memory, supersededBy: 'mem_law_002' })).toThrow();
  });

  it('accepts explicit supersession when status matches', () => {
    const parsed = MemoryRecord.parse({
      ...memory,
      status: 'superseded',
      supersededBy: 'mem_law_002',
    });

    expect(parsed.supersededBy).toBe('mem_law_002');
  });
});

describe('ConflictRecord', () => {
  it('serializes and parses a conflict with source references', () => {
    const conflict = {
      id: 'conflict_law_001',
      type: 'user_vs_law',
      description: 'User instruction conflicts with active law.',
      memoryIds: ['mem_law_001'],
      sources: [source],
      recommendedResolution: 'Follow the active law or create an explicit policy change.',
      shouldAnankeContinue: false,
      createdAt,
    } as const;

    expect(ConflictRecord.parse(JSON.parse(JSON.stringify(conflict)))).toEqual(conflict);
  });
});

describe('ContextPack', () => {
  it('serializes and parses a compact context pack', () => {
    const parsedMemory = MemoryRecord.parse(memory);
    const contextPack = {
      task: 'Explain provenance rules.',
      relevantMemories: [parsedMemory],
      sourceSnippets: [{ source, text: 'No trusted memory without provenance.' }],
      conflicts: [],
      warnings: [],
      openQuestions: [],
      tokenEstimate: 9,
    };

    expect(ContextPack.parse(JSON.parse(JSON.stringify(contextPack)))).toEqual(contextPack);
  });

  it('rejects source snippets that are not tied to relevant memory sources', () => {
    const unrelatedSnippet = SourceSnippet.parse({
      source: { ...source, artifactId: 'doc_other_laws' },
      text: 'Unrelated source text.',
    });

    expect(() =>
      ContextPack.parse({
        task: 'Explain provenance rules.',
        relevantMemories: [MemoryRecord.parse(memory)],
        sourceSnippets: [unrelatedSnippet],
        tokenEstimate: 9,
      }),
    ).toThrow();
  });
});

describe('AuditEvent', () => {
  it('serializes and parses an audit event', () => {
    const event = {
      id: 'audit_event_001',
      timestamp: createdAt,
      eventType: 'MEMORY_CREATED',
      memoryId: 'mem_law_001',
      locator: 'MNEMOSYNE.LAWS.001',
      path: 'docs/LAWS_OF_MNEMOSYNE.md',
      metadata: { sourceType: 'law' },
    } as const;

    expect(AuditEvent.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });
});

describe('ProjectGraphEdge', () => {
  it('serializes and parses a project graph relationship', () => {
    const edge = {
      from: 'MNEMOSYNE.LAWS.001',
      to: 'packages/schema/src/index.ts',
      relationship: 'governs',
      source,
    } as const;

    expect(ProjectGraphEdge.parse(JSON.parse(JSON.stringify(edge)))).toEqual(edge);
  });
});

describe('Result', () => {
  it('creates typed success and failure results', () => {
    expect(ok('value')).toEqual({ ok: true, value: 'value' });
    expect(err(new Error('failed')).ok).toBe(false);
  });

  it('validates serializable result envelopes', () => {
    const schema = ResultEnvelope(MemoryRecord);

    expect(schema.parse({ ok: true, value: memory }).ok).toBe(true);
    expect(
      schema.parse({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid memory record.' },
      }).ok,
    ).toBe(false);
  });
});
