import type { MemoryKind, MemoryRecord, MemoryStatus, SourceReference } from '@mnemosyne/schema';

export interface AlmanacStore {
  createMemory(memory: MemoryRecord): MemoryRecord;
  updateMemory(memory: MemoryRecord): MemoryRecord;
  markStatus(id: string, status: MemoryStatus): MemoryRecord | undefined;
  search(query: { text?: string; tag?: string; kind?: MemoryKind }): MemoryRecord[];
  listActive(): MemoryRecord[];
  fetchSourceReference(id: string): SourceReference | undefined;
}

export class InMemoryAlmanacStore implements AlmanacStore {
  private readonly memories = new Map<string, MemoryRecord>();

  createMemory(memory: MemoryRecord): MemoryRecord {
    this.memories.set(memory.id, memory);
    return memory;
  }

  updateMemory(memory: MemoryRecord): MemoryRecord {
    this.memories.set(memory.id, memory);
    return memory;
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
}
