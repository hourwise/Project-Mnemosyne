import type { MemoryRecord } from '@mnemosyne/schema';
import { scoreReliability } from '@mnemosyne/scoring-engine';

export class ReliabilityEngine {
  revalidate(
    memory: MemoryRecord,
    options: { hashStillValid?: boolean; contradictions?: number } = {},
  ): MemoryRecord {
    return {
      ...memory,
      reliability: scoreReliability({
        sourceType: memory.source.sourceType,
        hashStillValid: options.hashStillValid,
        contradictions: options.contradictions,
        superseded: memory.status === 'superseded',
      }),
      lastVerifiedAt: new Date().toISOString(),
    };
  }
}
