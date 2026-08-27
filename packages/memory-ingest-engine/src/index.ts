import { MemoryProvenance, MemoryRecord, type Importance, type MemoryKind, type MnemosyneAttribution, type ProvenanceActor, type ProvenanceClaimBinding, type ProvenanceDerivation, type ProvenanceSource, type SourceReference } from '@mnemosyne/schema';
import { scoreReliability } from '@mnemosyne/scoring-engine';

export * from './admission.js';
export * from './durable-admission.js';
export * from './runtime-contracts-preflight-verifier.js';

export interface CandidateMemory {
  id: string;
  kind: MemoryKind;
  statement: string;
  importance: Importance;
  source: SourceReference;
  /** Additional sources are preserved for derived or consolidated memories. */
  sources?: SourceReference[];
  locator: string;
  tags?: string[];
  provenance?: CandidateProvenance;
}

export interface CandidateProvenance {
  sources: ProvenanceSource[];
  derivation?: ProvenanceDerivation;
  claimBindings?: ProvenanceClaimBinding[];
}

export interface MemoryIngestEngineOptions {
  now?: () => string;
  defaultSubmitter?: ProvenanceActor;
}

export interface ProvenanceEnrichmentOptions {
  now?: string;
  submittedBy?: ProvenanceActor;
  attribution?: MnemosyneAttribution;
  sources?: SourceReference[];
}

export class MemoryIngestEngine {
  private readonly now: () => string;
  private readonly defaultSubmitter: ProvenanceActor;

  constructor(options: MemoryIngestEngineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.defaultSubmitter = options.defaultSubmitter ?? { id: 'mnemosyne_ingest_engine', kind: 'system' };
  }

  ingest(candidate: CandidateMemory): MemoryRecord {
    const createdAt = this.now();
    const sourceReferences = uniqueSourceReferences([candidate.source, ...(candidate.sources ?? [])]);
    const provenance = candidate.provenance
      ? MemoryProvenance.parse({ provenanceVersion: '1.0', ...candidate.provenance })
      : buildProvenance(sourceReferences, {
        now: createdAt,
        submittedBy: this.defaultSubmitter,
        memoryId: candidate.id,
      });

    return MemoryRecord.parse({
      id: candidate.id,
      kind: candidate.kind,
      statement: candidate.statement,
      reliability: scoreReliability({ sourceType: candidate.source.sourceType, hashStillValid: true }),
      importance: candidate.importance,
      status: 'tentative',
      source: candidate.source,
      locator: candidate.locator,
      createdAt,
      tags: candidate.tags ?? [],
      supersedes: [],
      provenance,
    });
  }

  /** Adds durable provenance to legacy-shaped records without changing their identity or status. */
  enrich(memory: MemoryRecord, options: ProvenanceEnrichmentOptions = {}): MemoryRecord {
    const parsed = MemoryRecord.parse(memory);
    if (parsed.provenance) return parsed;

    const provenance = buildProvenance(uniqueSourceReferences([parsed.source, ...(options.sources ?? [])]), {
      now: options.now ?? parsed.createdAt,
      submittedBy: options.submittedBy ?? this.defaultSubmitter,
      attribution: options.attribution ?? parsed.attribution,
      memoryId: parsed.id,
    });
    return MemoryRecord.parse({ ...parsed, provenance });
  }
}

function buildProvenance(
  sourceReferences: SourceReference[],
  options: { now: string; submittedBy: ProvenanceActor; attribution?: MnemosyneAttribution; memoryId: string },
): MemoryProvenance {
  const sources = sourceReferences.map((source) => ({
    sourceId: provenanceSourceId(source),
    sourceKind: source.sourceType,
    sourceLocator: source.path,
    sourceContentHash: source.contentHash,
    ingestedAt: options.now,
    submittedBy: options.submittedBy,
    attribution: options.attribution,
    metadata: {
      artifactId: source.artifactId,
      heading: source.heading,
      lineStart: source.lineStart,
      lineEnd: source.lineEnd,
    },
  }));
  const sourceIds = sources.map((source) => source.sourceId);
  const derivation = sources.length > 1
    ? {
      derivationId: `derivation_${options.memoryId}`,
      method: 'MERGE' as const,
      sourceIds,
      createdAt: options.now,
    }
    : undefined;

  return MemoryProvenance.parse({
    provenanceVersion: '1.0',
    sources,
    derivation,
    claimBindings: sources.length > 1
      ? [{ claimId: options.memoryId, sourceIds, relation: 'SUPPORTED_BY' as const }]
      : [],
  });
}

function uniqueSourceReferences(sources: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const identity = `${source.artifactId}\u0000${source.path}\u0000${source.contentHash}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function provenanceSourceId(source: SourceReference): string {
  return `source_${source.artifactId}_${source.contentHash.slice('sha256:'.length, 'sha256:'.length + 16)}`;
}
