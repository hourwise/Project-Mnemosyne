import Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import {
  AuditEvent,
  MemoryRecord,
  SourceReference,
  type AuditEventType,
  type MemoryKind,
  type MemoryStatus,
} from '@mnemosyne/schema';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL,
  status             TEXT NOT NULL,
  importance         TEXT NOT NULL,
  reliability        REAL NOT NULL,
  locator            TEXT NOT NULL UNIQUE,
  statement          TEXT NOT NULL,
  source_artifact_id TEXT NOT NULL,
  source_path        TEXT NOT NULL,
  source_type        TEXT NOT NULL,
  tags_json          TEXT NOT NULL,
  record_json        TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  last_verified_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_locator ON memories(locator);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_artifact_id, source_path);

CREATE TABLE IF NOT EXISTS audit_events (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  memory_id   TEXT,
  locator     TEXT,
  path        TEXT,
  metadata    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_almanac_audit_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_almanac_audit_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_almanac_audit_memory ON audit_events(memory_id);
`;

interface MemoryRow {
  record_json: string;
}

interface AuditEventRow {
  id: string;
  timestamp: string;
  event_type: string;
  memory_id: string | null;
  locator: string | null;
  path: string | null;
  metadata: string;
}

export interface AuditEventFilter {
  eventType?: AuditEventType;
  memoryId?: string;
  since?: string;
  limit?: number;
}

export interface AlmanacStore {
  createMemory(memory: MemoryRecord): MemoryRecord;
  updateMemory(memory: MemoryRecord): MemoryRecord;
  markStatus(id: string, status: MemoryStatus): MemoryRecord | undefined;
  search(query: { text?: string; tag?: string; kind?: MemoryKind }): MemoryRecord[];
  listActive(): MemoryRecord[];
  fetchSourceReference(id: string): SourceReference | undefined;
  writeAuditEvent(event: AuditEvent): AuditEvent;
  listAuditEvents(filter?: AuditEventFilter): AuditEvent[];
}

export class InMemoryAlmanacStore implements AlmanacStore {
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly auditEvents: AuditEvent[] = [];

  createMemory(memory: MemoryRecord): MemoryRecord {
    const parsed = MemoryRecord.parse(memory);
    this.memories.set(parsed.id, parsed);
    return parsed;
  }

  updateMemory(memory: MemoryRecord): MemoryRecord {
    const parsed = MemoryRecord.parse(memory);
    this.memories.set(parsed.id, parsed);
    return parsed;
  }

  markStatus(id: string, status: MemoryStatus): MemoryRecord | undefined {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    const updated = { ...memory, status };
    this.memories.set(id, updated);
    return updated;
  }

  search(query: { text?: string; tag?: string; kind?: MemoryKind }): MemoryRecord[] {
    return [...this.memories.values()].filter((memory) => {
      const textMatches = query.text
        ? memory.statement.toLowerCase().includes(query.text.toLowerCase())
        : true;
      const tagMatches = query.tag ? memory.tags.includes(query.tag) : true;
      const kindMatches = query.kind ? memory.kind === query.kind : true;
      return textMatches && tagMatches && kindMatches;
    });
  }

  listActive(): MemoryRecord[] {
    return [...this.memories.values()].filter((memory) => memory.status === 'active');
  }

  fetchSourceReference(id: string): SourceReference | undefined {
    return this.memories.get(id)?.source;
  }

  writeAuditEvent(event: AuditEvent): AuditEvent {
    const parsed = AuditEvent.parse(event);
    this.auditEvents.push(parsed);
    return parsed;
  }

  listAuditEvents(filter: AuditEventFilter = {}): AuditEvent[] {
    let results = [...this.auditEvents];
    if (filter.eventType) {
      results = results.filter((event) => event.eventType === filter.eventType);
    }
    if (filter.memoryId) {
      results = results.filter((event) => event.memoryId === filter.memoryId);
    }
    if (filter.since) {
      results = results.filter((event) => event.timestamp >= filter.since!);
    }
    return typeof filter.limit === 'number' ? results.slice(0, filter.limit) : results;
  }
}

function rowToMemory(row: MemoryRow): MemoryRecord {
  return MemoryRecord.parse(JSON.parse(row.record_json));
}

function rowToAuditEvent(row: AuditEventRow): AuditEvent {
  return AuditEvent.parse({
    id: row.id,
    timestamp: row.timestamp,
    eventType: row.event_type,
    memoryId: row.memory_id ?? undefined,
    locator: row.locator ?? undefined,
    path: row.path ?? undefined,
    metadata: JSON.parse(row.metadata),
  });
}

function memoryParams(memory: MemoryRecord): Record<string, unknown> {
  return {
    id: memory.id,
    kind: memory.kind,
    status: memory.status,
    importance: memory.importance,
    reliability: memory.reliability,
    locator: memory.locator,
    statement: memory.statement,
    source_artifact_id: memory.source.artifactId,
    source_path: memory.source.path,
    source_type: memory.source.sourceType,
    tags_json: JSON.stringify(memory.tags),
    record_json: JSON.stringify(memory),
    created_at: memory.createdAt,
    last_verified_at: memory.lastVerifiedAt ?? null,
  };
}

export class SqliteAlmanacStore implements AlmanacStore {
  private readonly db: Database.Database;
  private readonly insertMemory: Statement;
  private readonly updateMemoryStmt: Statement;
  private readonly insertAuditEvent: Statement;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);

    this.insertMemory = this.db.prepare(`
      INSERT INTO memories (
        id, kind, status, importance, reliability, locator, statement,
        source_artifact_id, source_path, source_type, tags_json, record_json,
        created_at, last_verified_at
      ) VALUES (
        @id, @kind, @status, @importance, @reliability, @locator, @statement,
        @source_artifact_id, @source_path, @source_type, @tags_json, @record_json,
        @created_at, @last_verified_at
      )
    `);

    this.updateMemoryStmt = this.db.prepare(`
      UPDATE memories SET
        kind = @kind,
        status = @status,
        importance = @importance,
        reliability = @reliability,
        locator = @locator,
        statement = @statement,
        source_artifact_id = @source_artifact_id,
        source_path = @source_path,
        source_type = @source_type,
        tags_json = @tags_json,
        record_json = @record_json,
        created_at = @created_at,
        last_verified_at = @last_verified_at
      WHERE id = @id
    `);

    this.insertAuditEvent = this.db.prepare(`
      INSERT INTO audit_events (
        id, timestamp, event_type, memory_id, locator, path, metadata
      ) VALUES (
        @id, @timestamp, @event_type, @memory_id, @locator, @path, @metadata
      )
    `);
  }

  createMemory(memory: MemoryRecord): MemoryRecord {
    this.assertOpen();
    const parsed = MemoryRecord.parse(memory);
    this.insertMemory.run(memoryParams(parsed));
    return parsed;
  }

  updateMemory(memory: MemoryRecord): MemoryRecord {
    this.assertOpen();
    const parsed = MemoryRecord.parse(memory);
    const result = this.updateMemoryStmt.run(memoryParams(parsed));
    if (result.changes === 0) {
      throw new Error(`Memory not found: ${parsed.id}`);
    }
    return parsed;
  }

  markStatus(id: string, status: MemoryStatus): MemoryRecord | undefined {
    this.assertOpen();
    const memory = this.getMemory(id);
    if (!memory) return undefined;
    return this.updateMemory({ ...memory, status });
  }

  search(query: { text?: string; tag?: string; kind?: MemoryKind }): MemoryRecord[] {
    this.assertOpen();

    let sql = 'SELECT record_json FROM memories WHERE 1 = 1';
    const params: Record<string, unknown> = {};
    if (query.kind) {
      sql += ' AND kind = @kind';
      params.kind = query.kind;
    }
    if (query.text) {
      sql += ' AND lower(statement) LIKE @text';
      params.text = `%${query.text.toLowerCase()}%`;
    }
    sql += ' ORDER BY reliability DESC, created_at DESC';

    let memories = (this.db.prepare(sql).all(params) as MemoryRow[]).map(rowToMemory);
    if (query.tag) {
      memories = memories.filter((memory) => memory.tags.includes(query.tag!));
    }
    return memories;
  }

  listActive(): MemoryRecord[] {
    this.assertOpen();
    const rows = this.db
      .prepare('SELECT record_json FROM memories WHERE status = ? ORDER BY reliability DESC, created_at DESC')
      .all('active') as MemoryRow[];
    return rows.map(rowToMemory);
  }

  fetchSourceReference(id: string): SourceReference | undefined {
    return this.getMemory(id)?.source;
  }

  writeAuditEvent(event: AuditEvent): AuditEvent {
    this.assertOpen();
    const parsed = AuditEvent.parse(event);
    this.insertAuditEvent.run({
      id: parsed.id,
      timestamp: parsed.timestamp,
      event_type: parsed.eventType,
      memory_id: parsed.memoryId ?? null,
      locator: parsed.locator ?? null,
      path: parsed.path ?? null,
      metadata: JSON.stringify(parsed.metadata),
    });
    return parsed;
  }

  listAuditEvents(filter: AuditEventFilter = {}): AuditEvent[] {
    this.assertOpen();

    let sql = 'SELECT * FROM audit_events WHERE 1 = 1';
    const params: Record<string, unknown> = {};
    if (filter.eventType) {
      sql += ' AND event_type = @eventType';
      params.eventType = filter.eventType;
    }
    if (filter.memoryId) {
      sql += ' AND memory_id = @memoryId';
      params.memoryId = filter.memoryId;
    }
    if (filter.since) {
      sql += ' AND timestamp >= @since';
      params.since = filter.since;
    }
    sql += ' ORDER BY timestamp ASC';
    if (filter.limit) {
      sql += ' LIMIT @limit';
      params.limit = filter.limit;
    }

    return (this.db.prepare(sql).all(params) as AuditEventRow[]).map(rowToAuditEvent);
  }

  getMemory(id: string): MemoryRecord | undefined {
    this.assertOpen();
    const row = this.db.prepare('SELECT record_json FROM memories WHERE id = ?').get(id) as
      | MemoryRow
      | undefined;
    return row ? rowToMemory(row) : undefined;
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('SqliteAlmanacStore is closed');
    }
  }
}
