import type { Importance, MemoryKind, MemoryRecord, SourceReference } from '@mnemosyne/schema';
import { scoreReliability } from '@mnemosyne/scoring-engine';

export interface CandidateMemory {
  id: string;
  kind: MemoryKind;
  statement: string;
  importance: Importance;
  source: SourceReference;
  locator: string;
  tags?: string[];
}

export class MemoryIngestEngine {
  ingest(candidate: CandidateMemory): MemoryRecord {
    return {
      id: candidate.id,
      kind: candidate.kind,
      statement: candidate.statement,
      reliability: scoreReliability({ sourceType: candidate.source.sourceType, hashStillValid: true }),
      importance: candidate.importance,
      status: 'tentative',
      source: candidate.source,
      locator: candidate.locator,
      createdAt: new Date().toISOString(),
      tags: candidate.tags ?? [],
      supersedes: [],
    };
  }
}
