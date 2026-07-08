import type { ConflictRecord, ContextPack, MemoryRecord } from '@mnemosyne/schema';

export class RetrievalEngine {
  buildContextPack(task: string, memories: MemoryRecord[], conflicts: ConflictRecord[] = []): ContextPack {
    const relevantMemories = memories
      .filter((memory) => memory.status === 'active' || memory.status === 'tentative')
      .sort((a, b) => b.reliability - a.reliability)
      .slice(0, 12);

    return {
      task,
      relevantMemories,
      sourceSnippets: [],
      conflicts,
      warnings: conflicts.length > 0 ? ['Conflicts detected; resolve before relying on this context.'] : [],
      openQuestions: [],
      tokenEstimate: relevantMemories.reduce(
        (total, memory) => total + Math.ceil(memory.statement.length / 4),
        0,
      ),
    };
  }
}
