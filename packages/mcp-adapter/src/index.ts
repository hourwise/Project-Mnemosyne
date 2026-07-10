import type { AlmanacStore } from '@mnemosyne/almanac-store';
import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';
import { ReliabilityEngine } from '@mnemosyne/reliability-engine';
import { RetrievalEngine } from '@mnemosyne/retrieval-engine';
import { ConflictRecord, MemoryKind, MemoryRecord } from '@mnemosyne/schema';
import { z } from 'zod';

export interface McpToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpAlmanacServerConfig {
  store: AlmanacStore;
  audit: AuditStore;
  status?: () => Record<string, unknown>;
  sourceTextByPath?: Record<string, string>;
  conflicts?: ConflictRecord[] | (() => ConflictRecord[]);
  onConflictReported?: (conflict: ConflictRecord) => void;
  now?: () => string;
}

const emptyObjectSchema = { type: 'object', additionalProperties: false };

/**
 * A transport-neutral MCP server surface. An stdio, HTTP, or SDK transport can
 * delegate `tools/list` to listTools and `tools/call` to callTool. The server
 * deliberately receives source text by injection, so agents never gain a raw
 * filesystem read capability through Mnemosyne.
 */
export class McpAlmanacServer {
  private readonly retrieval = new RetrievalEngine();
  private readonly reliability = new ReliabilityEngine();

  constructor(private readonly config: McpAlmanacServerConfig) {}

  listTools(): McpToolDefinition[] {
    return almanacTools;
  }

  callTool(name: string, args: unknown = {}): McpToolResult {
    try {
      switch (name) {
        case 'almanac_status':
          emptyArgs.parse(args);
          return success(this.config.status?.() ?? defaultStatus(this.config));
        case 'almanac_search':
          return success(this.config.store.search(searchArgs.parse(args)));
        case 'almanac_get_context_pack':
          return this.getContextPack(args);
        case 'almanac_read_memory':
          return this.readMemory(args);
        case 'almanac_request_source_context':
          return this.requestSourceContext(args);
        case 'almanac_write_memory':
          return this.writeMemory(args);
        case 'almanac_append_journal':
          return this.appendJournal(args);
        case 'almanac_report_conflict':
          return this.reportConflict(args);
        case 'almanac_revalidate':
          return this.revalidate(args);
        default:
          return failure(`Unknown governed MCP tool: ${name}`);
      }
    } catch (error) {
      return failure(error instanceof Error ? error.message : 'Invalid tool request.');
    }
  }

  private getContextPack(args: unknown): McpToolResult {
    const input = contextPackArgs.parse(args);
    const pack = this.retrieval.buildContextPack(
      input.task,
      this.config.store.search({}),
      resolveConflicts(this.config.conflicts),
      {
        maxMemories: input.maxMemories,
        tokenBudget: input.tokenBudget,
        includeTentative: input.includeTentative,
        includeUnsafe: input.includeUnsafe,
        includeSourceSnippets: input.includeSourceSnippets,
        sourceTextByPath: this.config.sourceTextByPath,
      },
    );
    this.config.audit.record(createAuditEvent('CONTEXT_PACK_CREATED', { task: input.task }));
    return success(pack);
  }

  private readMemory(args: unknown): McpToolResult {
    const { id } = memoryIdArgs.parse(args);
    const memory = findMemory(this.config.store, id);
    return memory ? success(memory) : failure(`Memory not found: ${id}`);
  }

  private requestSourceContext(args: unknown): McpToolResult {
    const { memoryId } = sourceContextArgs.parse(args);
    const memory = findMemory(this.config.store, memoryId);
    if (!memory) return failure(`Memory not found: ${memoryId}`);

    return success({
      memoryId,
      source: memory.source,
      text: this.config.sourceTextByPath?.[memory.source.path] ?? null,
      available: this.config.sourceTextByPath?.[memory.source.path] !== undefined,
    });
  }

  private writeMemory(args: unknown): McpToolResult {
    const { memory } = writeMemoryArgs.parse(args);
    const saved = findMemory(this.config.store, memory.id)
      ? this.config.store.updateMemory(memory)
      : this.config.store.createMemory(memory);
    this.config.audit.record(createAuditEvent('MEMORY_UPDATED', { memoryId: saved.id }));
    return success(saved);
  }

  private appendJournal(args: unknown): McpToolResult {
    const { entry } = journalArgs.parse(args);
    const event = createAuditEvent('JOURNAL_APPENDED', { entry });
    this.config.audit.record(event);
    return success({ id: event.id, timestamp: event.timestamp });
  }

  private reportConflict(args: unknown): McpToolResult {
    const { conflict } = reportConflictArgs.parse(args);
    this.config.onConflictReported?.(conflict);
    this.config.audit.record(
      createAuditEvent('CONFLICT_DETECTED', {
        conflictId: conflict.id,
        type: conflict.type,
        memoryIds: conflict.memoryIds,
      }),
    );
    return success(conflict);
  }

  private revalidate(args: unknown): McpToolResult {
    const input = revalidateArgs.parse(args);
    const memory = findMemory(this.config.store, input.memoryId);
    if (!memory) return failure(`Memory not found: ${input.memoryId}`);

    const assessment = this.reliability.assess(memory, {
      now: this.config.now?.(),
      currentSourceHash: input.currentSourceHash,
      sourceAvailable: input.sourceAvailable,
      contradictions: input.contradictions,
      supersededBy: input.supersededBy,
    });
    const saved = this.config.store.updateMemory(assessment.memory);
    this.config.audit.record(
      createAuditEvent('MEMORY_REVALIDATED', { memoryId: saved.id, reasons: assessment.reasons }),
    );
    return success(assessment);
  }
}

export const almanacTools: McpToolDefinition[] = [
  { name: 'almanac_status', description: 'Return Almanac health and storage status.', readOnly: true, inputSchema: emptyObjectSchema },
  { name: 'almanac_search', description: 'Search governed memory records.', readOnly: true, inputSchema: { type: 'object', properties: { text: { type: 'string' }, tag: { type: 'string' }, kind: { type: 'string' } } } },
  { name: 'almanac_get_context_pack', description: 'Build a task-specific context pack.', readOnly: true, inputSchema: { type: 'object', required: ['task'], properties: { task: { type: 'string' } } } },
  { name: 'almanac_read_memory', description: 'Read one governed memory record.', readOnly: true, inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'almanac_request_source_context', description: 'Recover injected source context for a memory.', readOnly: true, inputSchema: { type: 'object', required: ['memoryId'], properties: { memoryId: { type: 'string' } } } },
  { name: 'almanac_write_memory', description: 'Create or update a memory record.', readOnly: false, inputSchema: { type: 'object', required: ['memory'], properties: { memory: { type: 'object' } } } },
  { name: 'almanac_append_journal', description: 'Append to the governed session journal.', readOnly: false, inputSchema: { type: 'object', required: ['entry'], properties: { entry: { type: 'string' } } } },
  { name: 'almanac_report_conflict', description: 'Record a surfaced conflict.', readOnly: false, inputSchema: { type: 'object', required: ['conflict'], properties: { conflict: { type: 'object' } } } },
  { name: 'almanac_revalidate', description: 'Revalidate a memory against supplied source observations.', readOnly: false, inputSchema: { type: 'object', required: ['memoryId'], properties: { memoryId: { type: 'string' } } } },
];

const emptyArgs = z.object({}).strict();
const searchArgs = z.object({ text: z.string().optional(), tag: z.string().optional(), kind: MemoryKind.optional() }).strict();
const contextPackArgs = z.object({
  task: z.string().trim().min(1),
  maxMemories: z.number().int().positive().optional(),
  tokenBudget: z.number().int().positive().optional(),
  includeTentative: z.boolean().optional(),
  includeUnsafe: z.boolean().optional(),
  includeSourceSnippets: z.boolean().optional(),
}).strict();
const memoryIdArgs = z.object({ id: z.string().trim().min(1) }).strict();
const sourceContextArgs = z.object({ memoryId: z.string().trim().min(1) }).strict();
const writeMemoryArgs = z.object({ memory: MemoryRecord });
const journalArgs = z.object({ entry: z.string().trim().min(1) }).strict();
const reportConflictArgs = z.object({ conflict: ConflictRecord });
const revalidateArgs = z.object({
  memoryId: z.string().trim().min(1),
  currentSourceHash: z.string().optional(),
  sourceAvailable: z.boolean().optional(),
  contradictions: z.number().int().nonnegative().optional(),
  supersededBy: z.string().optional(),
}).strict();

function defaultStatus(config: McpAlmanacServerConfig): Record<string, unknown> {
  return { name: 'Mnemosyne MCP', activeMemories: config.store.listActive().length, auditEvents: config.audit.list().length };
}

function findMemory(store: AlmanacStore, id: string): MemoryRecord | undefined {
  return store.search({}).find((memory) => memory.id === id);
}

function resolveConflicts(conflicts: McpAlmanacServerConfig['conflicts']): ConflictRecord[] {
  return typeof conflicts === 'function' ? conflicts() : conflicts ?? [];
}

function success(value: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function failure(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
