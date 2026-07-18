import { MemoryRecord } from '@mnemosyne/schema';
import type {
  ConflictRecord,
  ContextPack,
  MemoryStatus,
  SourceSnippet,
} from '@mnemosyne/schema';

const defaultStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'to',
  'what',
  'when',
  'with',
]);

const excludedStatuses = new Set<MemoryStatus>(['quarantined', 'rejected']);
const unsafeStatuses = new Set<MemoryStatus>(['stale', 'contradicted', 'superseded']);

export interface RetrievalOptions {
  maxMemories?: number;
  tokenBudget?: number;
  includeTentative?: boolean;
  includeUnsafe?: boolean;
  includeSourceSnippets?: boolean;
  sourceTextByPath?: Record<string, string>;
  openQuestions?: string[];
  now?: string;
}

export interface RankedMemory {
  memory: MemoryRecord;
  score: number;
  matchedTerms: string[];
  tokenEstimate: number;
}

export class RetrievalEngine {
  rankMemories(task: string, memories: MemoryRecord[], options: RetrievalOptions = {}): RankedMemory[] {
    const terms = tokenize(task);

    return memories
      .filter((memory) => isEligible(memory, options))
      .map((memory) => scoreMemory(memory, terms))
      .filter((ranked) => ranked.score > 0 || ranked.memory.importance === 'critical')
      .sort((a, b) => b.score - a.score || b.memory.reliability - a.memory.reliability)
      .map((ranked) => ({
        ...ranked,
        score: Number(ranked.score.toFixed(4)),
      }));
  }

  buildContextPack(
    task: string,
    memories: MemoryRecord[],
    conflicts: ConflictRecord[] = [],
    options: RetrievalOptions = {},
  ): ContextPack {
    const maxMemories = options.maxMemories ?? 12;
    const tokenBudget = options.tokenBudget ?? Number.POSITIVE_INFINITY;
    const ranked = this.rankMemories(task, memories, options);
    const selected = selectWithinBudget(ranked, maxMemories, tokenBudget);
    const relevantMemories = selected.map((rankedMemory) => MemoryRecord.parse(rankedMemory.memory));
    const relevantMemoryIds = new Set(relevantMemories.map((memory) => memory.id));
    const relevantConflicts = conflicts.filter((conflict) =>
      conflict.memoryIds.length === 0 || conflict.memoryIds.some((id) => relevantMemoryIds.has(id)),
    );

    const warnings = buildWarnings(relevantMemories, relevantConflicts, selected, ranked.length);
    const sourceSnippets =
      options.includeSourceSnippets === false
        ? []
        : buildSourceSnippets(relevantMemories, options.sourceTextByPath ?? {});

    return {
      task,
      relevantMemories,
      sourceSnippets,
      conflicts: relevantConflicts,
      warnings,
      openQuestions: options.openQuestions ?? [],
      tokenEstimate: estimateContextTokens(relevantMemories, sourceSnippets, relevantConflicts, warnings),
    };
  }
}

function isEligible(memory: MemoryRecord, options: RetrievalOptions): boolean {
  if (excludedStatuses.has(memory.status)) return false;
  if (!options.includeTentative && memory.status === 'tentative') return false;
  if (!options.includeUnsafe && unsafeStatuses.has(memory.status)) return false;
  return true;
}

function scoreMemory(memory: MemoryRecord, terms: string[]): RankedMemory {
  const haystack = [
    memory.statement,
    memory.kind,
    memory.importance,
    memory.status,
    memory.locator,
    memory.source.path,
    memory.source.heading ?? '',
    memory.source.sourceType,
    ...memory.tags,
  ]
    .join(' ')
    .toLowerCase();

  const matchedTerms = unique(terms.filter((term) => haystack.includes(term)));
  const termScore = terms.length > 0 ? matchedTerms.length / terms.length : 0;
  const importanceScore = importanceWeight(memory.importance);
  const statusScore = statusWeight(memory.status);
  const sourceRecoverabilityScore = memory.source.contentHash && memory.source.path ? 0.08 : -0.2;
  const tagScore = matchedTerms.some((term) => memory.tags.some((tag) => tag.toLowerCase().includes(term)))
    ? 0.08
    : 0;

  const score =
    termScore * 0.5 +
    memory.reliability * 0.25 +
    importanceScore +
    statusScore +
    sourceRecoverabilityScore +
    tagScore;

  return {
    memory,
    score,
    matchedTerms,
    tokenEstimate: estimateMemoryTokens(memory),
  };
}

function selectWithinBudget(
  rankedMemories: RankedMemory[],
  maxMemories: number,
  tokenBudget: number,
): RankedMemory[] {
  const selected: RankedMemory[] = [];
  let usedTokens = 0;

  for (const ranked of rankedMemories) {
    if (selected.length >= maxMemories) break;
    if (usedTokens + ranked.tokenEstimate > tokenBudget) {
      if (selected.length > 0) continue;
      if (ranked.tokenEstimate > tokenBudget) continue;
    }

    selected.push(ranked);
    usedTokens += ranked.tokenEstimate;
  }

  return selected;
}

function buildWarnings(
  memories: MemoryRecord[],
  conflicts: ConflictRecord[],
  selected: RankedMemory[],
  candidateCount: number,
): string[] {
  const warnings: string[] = [];

  if (conflicts.length > 0) {
    warnings.push('Conflicts detected; resolve before relying on this context.');
  }

  const unsafe = memories.filter((memory) => unsafeStatuses.has(memory.status));
  if (unsafe.length > 0) {
    warnings.push(`Context includes ${unsafe.length} stale, contradicted, or superseded memories.`);
  }

  const lowReliability = memories.filter((memory) => memory.reliability < 0.6);
  if (lowReliability.length > 0) {
    warnings.push(`Context includes ${lowReliability.length} low-reliability memories.`);
  }

  if (selected.length < candidateCount) {
    warnings.push('Some candidate memories were omitted to keep the context pack compact.');
  }

  return warnings;
}

function buildSourceSnippets(
  memories: MemoryRecord[],
  sourceTextByPath: Record<string, string>,
): SourceSnippet[] {
  const snippets: SourceSnippet[] = [];
  const seen = new Set<string>();

  for (const memory of memories) {
    const sourceText = sourceTextByPath[memory.source.path];
    if (!sourceText) continue;

    const key = `${memory.source.artifactId}:${memory.source.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    snippets.push({
      source: memory.source,
      text: extractSnippet(sourceText, memory.source.lineStart, memory.source.lineEnd),
    });
  }

  return snippets;
}

function extractSnippet(sourceText: string, lineStart?: number, lineEnd?: number): string {
  const lines = sourceText.split(/\r?\n/);
  if (!lineStart) return sourceText.slice(0, 600).trim();

  const start = Math.max(0, lineStart - 1);
  const end = Math.min(lines.length, lineEnd ?? lineStart);
  return lines.slice(start, end).join('\n').trim() || sourceText.slice(0, 600).trim();
}

function estimateContextTokens(
  memories: MemoryRecord[],
  snippets: SourceSnippet[],
  conflicts: ConflictRecord[],
  warnings: string[],
): number {
  const memoryTokens = memories.reduce((total, memory) => total + estimateMemoryTokens(memory), 0);
  const snippetTokens = snippets.reduce((total, snippet) => total + estimateTextTokens(snippet.text), 0);
  const conflictTokens = conflicts.reduce(
    (total, conflict) => total + estimateTextTokens(conflict.description + conflict.recommendedResolution),
    0,
  );
  const warningTokens = warnings.reduce((total, warning) => total + estimateTextTokens(warning), 0);
  return memoryTokens + snippetTokens + conflictTokens + warningTokens;
}

function estimateMemoryTokens(memory: MemoryRecord): number {
  return estimateTextTokens(`${memory.locator} ${memory.kind} ${memory.statement} ${memory.tags.join(' ')}`);
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function tokenize(text: string): string[] {
  return unique(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3 && !defaultStopWords.has(term)),
  );
}

function importanceWeight(importance: MemoryRecord['importance']): number {
  switch (importance) {
    case 'critical':
      return 0.18;
    case 'high':
      return 0.12;
    case 'medium':
      return 0.06;
    case 'low':
      return 0.02;
  }
}

function statusWeight(status: MemoryStatus): number {
  switch (status) {
    case 'active':
      return 0.18;
    case 'tentative':
      return 0.05;
    case 'stale':
      return -0.2;
    case 'contradicted':
      return -0.35;
    case 'superseded':
      return -0.3;
    case 'quarantined':
    case 'rejected':
      return -1;
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
