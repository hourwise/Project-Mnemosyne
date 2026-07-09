import type { MemoryRecord, MemoryStatus } from '@mnemosyne/schema';
import { scoreReliability, type ReliabilityInputs } from '@mnemosyne/scoring-engine';

export type ReliabilityReason =
  | 'SOURCE_CONFIRMED'
  | 'SOURCE_MISSING'
  | 'SOURCE_HASH_CHANGED'
  | 'SOURCE_HASH_UNCHECKED'
  | 'CONFIRMATIONS_APPLIED'
  | 'CONTRADICTIONS_FOUND'
  | 'SUPERSEDED'
  | 'AGE_DECAY_APPLIED'
  | 'CODE_DOC_AGREEMENT_APPLIED'
  | 'RISK_PENALTY_APPLIED';

export interface RevalidationOptions {
  now?: string;
  currentSourceHash?: string;
  hashStillValid?: boolean;
  sourceAvailable?: boolean;
  confirmations?: number;
  contradictions?: number;
  supersededBy?: string;
  ageDays?: number;
  authoritative?: boolean;
  codeAndDocsAgree?: boolean;
  riskLevel?: ReliabilityInputs['riskLevel'];
}

export interface ReliabilityAssessment {
  memory: MemoryRecord;
  previousReliability: number;
  reliability: number;
  previousStatus: MemoryStatus;
  status: MemoryStatus;
  hashStillValid?: boolean;
  sourceAvailable: boolean;
  ageDays: number;
  reasons: ReliabilityReason[];
}

export class ReliabilityEngine {
  assess(memory: MemoryRecord, options: RevalidationOptions = {}): ReliabilityAssessment {
    const now = options.now ?? new Date().toISOString();
    const sourceAvailable = options.sourceAvailable ?? true;
    const hashStillValid = determineHashValidity(memory, options);
    const ageDays = options.ageDays ?? daysBetween(memory.lastVerifiedAt ?? memory.createdAt, now);
    const superseded = memory.status === 'superseded' || options.supersededBy !== undefined;
    const contradictions = options.contradictions ?? 0;

    const reliability = scoreReliability({
      sourceType: memory.source.sourceType,
      kind: memory.kind,
      hashStillValid,
      sourceAvailable,
      confirmations: options.confirmations,
      contradictions,
      superseded,
      ageDays,
      authoritative: options.authoritative,
      codeAndDocsAgree: options.codeAndDocsAgree,
      riskLevel: options.riskLevel,
    });
    const status = determineStatus(memory.status, {
      sourceAvailable,
      hashStillValid,
      contradictions,
      superseded,
      reliability,
    });

    const updated: MemoryRecord = {
      ...memory,
      reliability,
      status,
      lastVerifiedAt: now,
      supersededBy: options.supersededBy ?? memory.supersededBy,
    };

    return {
      memory: updated,
      previousReliability: memory.reliability,
      reliability,
      previousStatus: memory.status,
      status,
      hashStillValid,
      sourceAvailable,
      ageDays,
      reasons: reliabilityReasons({
        sourceAvailable,
        hashStillValid,
        confirmations: options.confirmations ?? 0,
        contradictions,
        superseded,
        ageDays,
        codeAndDocsAgree: options.codeAndDocsAgree,
        riskLevel: options.riskLevel,
      }),
    };
  }

  revalidate(memory: MemoryRecord, options: RevalidationOptions = {}): MemoryRecord {
    return this.assess(memory, options).memory;
  }
}

function determineHashValidity(
  memory: MemoryRecord,
  options: RevalidationOptions,
): boolean | undefined {
  if (options.currentSourceHash) {
    return options.currentSourceHash === memory.source.contentHash;
  }
  return options.hashStillValid;
}

function determineStatus(
  previousStatus: MemoryStatus,
  inputs: {
    sourceAvailable: boolean;
    hashStillValid?: boolean;
    contradictions: number;
    superseded: boolean;
    reliability: number;
  },
): MemoryStatus {
  if (previousStatus === 'quarantined' || previousStatus === 'rejected') return previousStatus;
  if (inputs.superseded) return 'superseded';
  if (!inputs.sourceAvailable) return 'stale';
  if (inputs.contradictions > 0) return 'contradicted';
  if (inputs.hashStillValid === false) return 'stale';
  if (inputs.reliability < 0.4) return 'stale';
  if (previousStatus === 'tentative') return 'tentative';
  return 'active';
}

function reliabilityReasons(inputs: {
  sourceAvailable: boolean;
  hashStillValid?: boolean;
  confirmations: number;
  contradictions: number;
  superseded: boolean;
  ageDays: number;
  codeAndDocsAgree?: boolean;
  riskLevel?: ReliabilityInputs['riskLevel'];
}): ReliabilityReason[] {
  const reasons: ReliabilityReason[] = [];

  if (!inputs.sourceAvailable) {
    reasons.push('SOURCE_MISSING');
  } else if (inputs.hashStillValid === true) {
    reasons.push('SOURCE_CONFIRMED');
  }

  if (inputs.hashStillValid === false) reasons.push('SOURCE_HASH_CHANGED');
  if (inputs.hashStillValid === undefined) reasons.push('SOURCE_HASH_UNCHECKED');
  if (inputs.confirmations > 0) reasons.push('CONFIRMATIONS_APPLIED');
  if (inputs.contradictions > 0) reasons.push('CONTRADICTIONS_FOUND');
  if (inputs.superseded) reasons.push('SUPERSEDED');
  if (inputs.ageDays > 0) reasons.push('AGE_DECAY_APPLIED');
  if (inputs.codeAndDocsAgree !== undefined) reasons.push('CODE_DOC_AGREEMENT_APPLIED');
  if (inputs.riskLevel && inputs.riskLevel !== 'low') reasons.push('RISK_PENALTY_APPLIED');

  return reasons;
}

function daysBetween(startIso: string, endIso: string): number {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / 86_400_000);
}
