import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteAlmanacStore } from './index.js';
import type { AuditEvent, MemoryRecord } from '@mnemosyne/schema';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const createdAt = '2026-07-08T00:00:00.000Z';

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_law_001',
    kind: 'law',
    statement: 'No trusted memory without provenance.',
    reliability: 0.98,
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
    tags: ['law', 'provenance'],
    supersedes: [],
    ...overrides,
  };
}

function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit_event_001',
    timestamp: createdAt,
    eventType: 'MEMORY_CREATED',
    memoryId: 'mem_law_001',
    locator: 'MNEMOSYNE.LAWS.001',
    path: 'docs/LAWS_OF_MNEMOSYNE.md',
    metadata: { reason: 'phase_2_test' },
    ...overrides,
  };
}

describe('SqliteAlmanacStore', () => {
  let tempDir: string;
  let dbPath: string;
  let store: SqliteAlmanacStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mnemosyne-almanac-'));
    dbPath = join(tempDir, 'almanac.sqlite');
    store = new SqliteAlmanacStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates memories and persists them across reopen', () => {
    store.createMemory(memory());
    store.close();

    store = new SqliteAlmanacStore(dbPath);

    expect(store.listActive()).toHaveLength(1);
    expect(store.fetchSourceReference('mem_law_001')?.contentHash).toBe(hash);
  });

  it('updates memories and marks statuses', () => {
    store.createMemory(memory());

    const updated = store.updateMemory(memory({ statement: 'Trusted memory requires provenance.' }));
    const stale = store.markStatus(updated.id, 'stale');

    expect(stale?.status).toBe('stale');
    expect(store.listActive()).toEqual([]);
    expect(store.search({ text: 'trusted' })[0]?.statement).toBe(
      'Trusted memory requires provenance.',
    );
  });

  it('searches by text, tag, and kind', () => {
    store.createMemory(memory());
    store.createMemory(
      memory({
        id: 'mem_task_001',
        kind: 'task',
        statement: 'Build the SQLite Almanac store.',
        reliability: 0.7,
        importance: 'high',
        locator: 'PROJECT.TASKS.001',
        tags: ['phase-2', 'sqlite'],
      }),
    );

    expect(store.search({ text: 'sqlite' }).map((result) => result.id)).toEqual(['mem_task_001']);
    expect(store.search({ tag: 'provenance' }).map((result) => result.id)).toEqual([
      'mem_law_001',
    ]);
    expect(store.search({ kind: 'law' }).map((result) => result.id)).toEqual(['mem_law_001']);
  });

  it('writes and filters audit events', () => {
    store.createMemory(memory());
    store.writeAuditEvent(auditEvent());
    store.writeAuditEvent(
      auditEvent({
        id: 'audit_event_002',
        eventType: 'MEMORY_REVALIDATED',
        timestamp: '2026-07-08T00:01:00.000Z',
      }),
    );

    expect(store.listAuditEvents()).toHaveLength(2);
    expect(store.listAuditEvents({ eventType: 'MEMORY_CREATED' })).toHaveLength(1);
    expect(store.listAuditEvents({ memoryId: 'mem_law_001', limit: 1 })).toHaveLength(1);
  });

  it('rejects invalid records before persistence', () => {
    expect(() =>
      store.createMemory(memory({ reliability: 2, locator: 'MNEMOSYNE.LAWS.999' })),
    ).toThrow();
  });
});
