import { describe, expect, it } from 'vitest';
import { InMemoryAlmanacStore } from '@mnemosyne/almanac-store';
import { InMemoryAuditStore } from '@mnemosyne/audit-engine';
import { createTrustedOperationContext } from '@mnemosyne/adrasteia-adapter';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';
import type { ConflictRecord, MemoryRecord } from '@mnemosyne/schema';
import { McpAlmanacServer } from './index.js';

const hash = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const replacementHash = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const createdAt = '2026-07-10T00:00:00.000Z';

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 'mem_fact_001',
    kind: 'fact',
    statement: 'The Almanac stores governed project memory.',
    reliability: 0.8,
    importance: 'high',
    status: 'active',
    source: {
      artifactId: 'doc_almanac_model',
      path: 'docs/ALMANAC_MODEL.md',
      contentHash: hash,
      sourceType: 'readme',
    },
    locator: 'PROJECT.FACTS.001',
    createdAt,
    supersedes: [],
    tags: ['almanac'],
    ...overrides,
  };
}

function parsed(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe('McpAlmanacServer', () => {
  it('lists the documented governed tools without exposing raw filesystem access', () => {
    const { server } = createServer();
    const names = server.listTools().map((tool) => tool.name);

    expect(names).toEqual([
      'almanac_status',
      'mnemosyne_inspect',
      'mnemosyne_negotiate_protocol',
      'almanac_search',
      'almanac_get_context_pack',
      'almanac_read_memory',
      'almanac_request_source_context',
      'almanac_write_memory',
      'almanac_append_journal',
      'almanac_report_conflict',
      'almanac_revalidate',
    ]);
    expect(names.some((name) => name.includes('filesystem') || name.includes('file_read'))).toBe(false);
  });

  it('writes, searches, reads, and returns only injected source context', () => {
    const { server, context } = createServer({ 'docs/ALMANAC_MODEL.md': 'Injected source context.' });
    const saved = server.callTool('almanac_write_memory', { memory: memory() }, context);
    const searched = server.callTool('almanac_search', { text: 'governed' }, context);
    const read = server.callTool('almanac_read_memory', { id: 'mem_fact_001' }, context);
    const source = server.callTool('almanac_request_source_context', { memoryId: 'mem_fact_001' }, context);

    expect(saved.isError).toBeUndefined();
    expect(parsed(searched)).toMatchObject({ records: [{ id: 'mem_fact_001' }] });
    expect(parsed(read)).toMatchObject({ id: 'mem_fact_001' });
    expect(parsed(source)).toEqual({
      memoryId: 'mem_fact_001',
      source: memory().source,
      text: 'Injected source context.',
      available: true,
    });
  });

  it('builds context packs and records an audit event', () => {
    const { server, audit, context } = createServer();
    server.callTool('almanac_write_memory', { memory: memory() }, context);

    const result = server.callTool('almanac_get_context_pack', { task: 'governed memory' }, context);

    expect(parsed(result)).toMatchObject({ task: 'governed memory', relevantMemories: [{ id: 'mem_fact_001' }] });
    expect(audit.list().some((event) => event.eventType === 'CONTEXT_PACK_CREATED')).toBe(true);
  });

  it('journals and reports structured conflicts through audit hooks', () => {
    const reported: ConflictRecord[] = [];
    const { server, audit, context } = createServer(undefined, reported);
    const conflict: ConflictRecord = {
      id: 'conflict_memory_001',
      type: 'memory_vs_code',
      description: 'Memory conflicts with code.',
      memoryIds: [],
      sources: [],
      recommendedResolution: 'Revalidate.',
      shouldAnankeContinue: false,
      createdAt,
    };

    expect(server.callTool('almanac_append_journal', { entry: 'Checked memory safety.' }, context).isError).toBeUndefined();
    expect(server.callTool('almanac_report_conflict', { conflict }, context).isError).toBeUndefined();
    expect(reported).toEqual([conflict]);
    expect(audit.list().map((event) => event.eventType)).toContain('JOURNAL_APPENDED');
    expect(audit.list().map((event) => event.eventType)).toContain('CONFLICT_DETECTED');
  });

  it('revalidates a memory against supplied observations', () => {
    const { server, context } = createServer();
    server.callTool('almanac_write_memory', { memory: memory() }, context);

    const result = server.callTool('almanac_revalidate', {
      memoryId: 'mem_fact_001',
      currentSourceHash: replacementHash,
      sourceAvailable: true,
    }, context);

    expect(parsed(result)).toMatchObject({ status: 'stale', reasons: ['SOURCE_HASH_CHANGED'] });
  });

  it('returns MCP-safe errors for unknown tools and missing records', () => {
    const { server } = createServer();

    expect(server.callTool('filesystem_read', {}).isError).toBe(true);
    expect(server.callTool('almanac_read_memory', { id: 'mem_fact_404' }).isError).toBe(true);
  });
});

function createServer(sourceTextByPath?: Record<string, string>, reported: ConflictRecord[] = []) {
  const store = new InMemoryAlmanacStore();
  const audit = new InMemoryAuditStore();
  return {
    audit,
    server: new McpAlmanacServer({
      store,
      audit,
      runtimeScope: { projectId: 'project_mnemosyne', runtimeInstanceId: 'runtime_mcp_test' },
      sourceTextByPath,
      now: () => createdAt,
      onConflictReported: (conflict) => reported.push(conflict),
    }),
    context: createTrustedOperationContext({
      execution: {
        authenticatedPrincipal: { id: 'service_mcp_test', kind: PrincipalKind.Service },
        actingPrincipal: { id: 'agent_mcp_test', kind: PrincipalKind.Agent },
        runtimeId: 'mnemosyne', runtimeInstanceId: 'runtime_mcp_test', sessionId: 'session_mcp_test', projectId: 'project_mnemosyne',
      },
      scope: { mode: ResourceScopeMode.Bounded, projectId: 'project_mnemosyne' },
      purpose: 'mcp_test',
    }),
  };
}
