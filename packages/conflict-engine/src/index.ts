import type { ConflictRecord, MemoryRecord } from '@mnemosyne/schema';

export class ConflictEngine {
  detectMissingActiveSources(memories: MemoryRecord[]): ConflictRecord[] {
    return memories
      .filter((memory) => memory.status === 'active' && !memory.source.path)
      .map((memory) => ({
        id: `conflict_${memory.id}`,
        type: 'active_memory_source_missing',
        description: `Active memory ${memory.id} is missing a source path.`,
        memoryIds: [memory.id],
        sources: [memory.source],
        recommendedResolution: 'Quarantine the memory or recover provenance before use.',
        shouldAnankeContinue: false,
        createdAt: new Date().toISOString(),
      }));
  }
}
