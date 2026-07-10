import type { AuditEvent, ConflictRecord, MemoryRecord, SourceReference } from '@mnemosyne/schema';

export interface SourceObservation {
  /** Whether the source was found during this scan. Omit when it was not checked. */
  available?: boolean;
  /** Hash calculated from the source during this scan. */
  contentHash?: string;
  /** Source text, used for ADR supersession and contradiction markers. */
  text?: string;
}

export interface UserInstruction {
  text: string;
  source: SourceReference;
}

export interface ConflictAuditSink {
  writeAuditEvent(event: AuditEvent): unknown;
}

export interface ConflictDetectionOptions {
  now?: string;
  sourceByPath?: Record<string, SourceObservation>;
  userInstructions?: UserInstruction[];
  auditSink?: ConflictAuditSink;
}

/**
 * Detects direct, explainable conflicts. It intentionally does not infer broad
 * semantic disagreement: every result is tied to a memory, source observation,
 * explicit user instruction, or ADR supersession marker.
 */
export class ConflictEngine {
  detect(memories: MemoryRecord[], options: ConflictDetectionOptions = {}): ConflictRecord[] {
    const createdAt = options.now ?? new Date().toISOString();
    const sourceByPath = options.sourceByPath ?? {};
    const conflicts: ConflictRecord[] = [];
    let sequence = 1;
    const add = (conflict: Omit<ConflictRecord, 'id' | 'createdAt'>, label: string): void => {
      const record: ConflictRecord = {
        ...conflict,
        id: `conflict_${label}_${String(sequence++).padStart(3, '0')}`,
        createdAt,
      };
      conflicts.push(record);
      options.auditSink?.writeAuditEvent({
        id: `audit_${record.id}`,
        timestamp: createdAt,
        eventType: 'CONFLICT_DETECTED',
        memoryId: record.memoryIds[0],
        path: record.sources[0]?.path,
        metadata: {
          conflictId: record.id,
          type: record.type,
          memoryIds: record.memoryIds,
          recommendedResolution: record.recommendedResolution,
        },
      });
    };

    for (const memory of memories) {
      const observation = sourceByPath[memory.source.path];
      if (memory.status === 'active' && observation?.available === false) {
        add(
          {
            type: 'active_memory_source_missing',
            description: `Active memory ${memory.id} has a source that is no longer available: ${memory.source.path}.`,
            memoryIds: [memory.id],
            sources: [memory.source],
            recommendedResolution: 'Mark the memory stale or quarantine it until its provenance is recovered.',
            shouldAnankeContinue: false,
          },
          'source_missing',
        );
      }

      if (
        observation?.contentHash !== undefined &&
        observation.contentHash !== memory.source.contentHash
      ) {
        add(
          {
            type: 'source_hash_changed',
            description: `Source content changed for memory ${memory.id}: ${memory.source.path}.`,
            memoryIds: [memory.id],
            sources: [memory.source],
            recommendedResolution: 'Revalidate the memory against the current source before relying on it.',
            shouldAnankeContinue: false,
          },
          'hash_changed',
        );
      }

      if (
        memory.status === 'active' &&
        (memory.source.sourceType === 'model_inference' || memory.source.sourceType === 'speculation')
      ) {
        add(
          {
            type: 'active_memory_untrusted_source',
            description: `Active memory ${memory.id} relies on ${memory.source.sourceType}, which is not sufficient provenance for active knowledge.`,
            memoryIds: [memory.id],
            sources: [memory.source],
            recommendedResolution: 'Downgrade the memory to tentative or attach an authoritative project source.',
            shouldAnankeContinue: false,
          },
          'untrusted_source',
        );
      }
    }

    detectMemorySupersession(memories, add);
    detectAdrMarkers(memories, sourceByPath, add);
    detectUserVsLaw(memories, options.userInstructions ?? [], add);
    return conflicts;
  }

  /** Backwards-compatible focused check for callers that only scan availability. */
  detectMissingActiveSources(
    memories: MemoryRecord[],
    sourceByPath: Record<string, SourceObservation> = {},
  ): ConflictRecord[] {
    return this.detect(memories, { sourceByPath }).filter(
      (conflict) => conflict.type === 'active_memory_source_missing',
    );
  }
}

type AddConflict = (conflict: Omit<ConflictRecord, 'id' | 'createdAt'>, label: string) => void;

function detectMemorySupersession(memories: MemoryRecord[], add: AddConflict): void {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  for (const successor of memories) {
    for (const predecessorId of successor.supersedes) {
      const predecessor = byId.get(predecessorId);
      if (!predecessor || predecessor.status !== 'active') continue;
      add(
        {
          type: 'active_memory_superseded_evidence',
          description: `Active memory ${predecessor.id} is superseded by memory ${successor.id}.`,
          memoryIds: [predecessor.id, successor.id],
          sources: uniqueSources([predecessor.source, successor.source]),
          recommendedResolution: `Mark ${predecessor.id} as superseded and revalidate any dependent context.`,
          shouldAnankeContinue: false,
        },
        'memory_superseded',
      );
    }
  }
}

function detectAdrMarkers(
  memories: MemoryRecord[],
  sourceByPath: Record<string, SourceObservation>,
  add: AddConflict,
): void {
  const adrMemories = memories.filter((memory) => isAdr(memory));
  for (const successor of adrMemories) {
    const text = sourceByPath[successor.source.path]?.text;
    if (!text) continue;

    const targetNumbers = supersededAdrNumbers(text);
    for (const number of targetNumbers) {
      for (const predecessor of adrMemories) {
        if (
          predecessor.id === successor.id ||
          predecessor.status !== 'active' ||
          adrNumber(predecessor.source.path) !== number
        ) {
          continue;
        }
        add(
          {
            type: 'active_memory_superseded_evidence',
            description: `ADR evidence in ${successor.source.path} supersedes active memory ${predecessor.id}.`,
            memoryIds: [predecessor.id, successor.id],
            sources: uniqueSources([predecessor.source, successor.source]),
            recommendedResolution: `Confirm the ADR relationship and mark ${predecessor.id} as superseded.`,
            shouldAnankeContinue: false,
          },
          'adr_superseded',
        );
      }
    }

    if (successor.status === 'active' && /\bcontradicted\b/i.test(text)) {
      add(
        {
          type: 'active_memory_contradicted_evidence',
          description: `Active memory ${successor.id} has source text marked as contradicted.`,
          memoryIds: [successor.id],
          sources: [successor.source],
          recommendedResolution: 'Revalidate the ADR and mark the memory contradicted or stale if the marker still applies.',
          shouldAnankeContinue: false,
        },
        'adr_contradicted',
      );
    }
  }
}

function detectUserVsLaw(memories: MemoryRecord[], instructions: UserInstruction[], add: AddConflict): void {
  const laws = memories.filter((memory) => memory.kind === 'law' && memory.status === 'active');
  for (const instruction of instructions) {
    for (const law of laws) {
      if (!hasKeywordConflict(instruction.text, law.statement)) continue;
      add(
        {
          type: 'user_vs_law',
          description: `User instruction conflicts with active law ${law.id}.`,
          memoryIds: [law.id],
          sources: uniqueSources([instruction.source, law.source]),
          recommendedResolution: 'Do not apply the instruction without resolving the conflict under the governing law.',
          shouldAnankeContinue: false,
        },
        'user_law',
      );
    }
  }
}

function hasKeywordConflict(instruction: string, law: string): boolean {
  const instructionTokens = meaningfulTokens(instruction);
  const lawTokens = meaningfulTokens(law);
  const sharedTerms = instructionTokens.filter((token) => lawTokens.includes(token));
  if (sharedTerms.length === 0) return false;

  return hasNegation(instruction) !== hasNegation(law);
}

function meaningfulTokens(text: string): string[] {
  const stopWords = new Set(['a', 'an', 'and', 'be', 'by', 'for', 'from', 'in', 'is', 'of', 'or', 'the', 'to']);
  return [...new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? [])].filter(
    (token) => token.length > 2 && !stopWords.has(token) && !negationWords.has(token),
  );
}

const negationWords = new Set(['not', 'never', 'no', 'forbid', 'forbidden', 'deny', 'denied', 'without']);

function hasNegation(text: string): boolean {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some((token) => negationWords.has(token));
}

function isAdr(memory: MemoryRecord): boolean {
  return memory.source.sourceType === 'adr' || /\badr[-_ ]?\d+/i.test(memory.source.path);
}

function adrNumber(path: string): string | undefined {
  const match = path.match(/\badr[-_ ]?(\d+)/i);
  return match?.[1]?.replace(/^0+(?=\d)/, '');
}

function supersededAdrNumbers(text: string): string[] {
  const matches = text.matchAll(/\bsupersedes?\s+(?:adr[-_ ]?)?(\d+)\b/gi);
  return [...new Set([...matches].map((match) => match[1]?.replace(/^0+(?=\d)/, '')).filter(Boolean) as string[])];
}

function uniqueSources(sources: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.artifactId}:${source.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
