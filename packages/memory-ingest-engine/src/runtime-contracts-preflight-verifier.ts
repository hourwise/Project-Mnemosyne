import {
  parseContentPreflightReceipt,
  type ContentPreflightReceipt,
} from 'project-runtime-contracts';
import type { MemoryRecord as MemoryRecordModel } from '@mnemosyne/schema';
import type { PreflightReceiptVerifier, PreflightVerification } from './admission.js';

export interface RuntimeContractsPreflightReceiptVerifierOptions {
  contractVersion?: string;
  maxAgeMs?: number;
  now?: () => string;
  requireSignature?: boolean;
}

/**
 * Production Mnemosyne adapter for the released shared receipt contract.
 * Structural validity is checked by Runtime Contracts; this adapter adds
 * Mnemosyne's source binding, freshness, and signature requirements without
 * copying the receipt schema into the memory runtime.
 */
export class RuntimeContractsPreflightReceiptVerifier implements PreflightReceiptVerifier {
  private readonly contractVersion: string;
  private readonly maxAgeMs: number | undefined;
  private readonly now: () => string;
  private readonly requireSignature: boolean;

  constructor(options: RuntimeContractsPreflightReceiptVerifierOptions = {}) {
    this.contractVersion = options.contractVersion ?? '1.0.0';
    this.maxAgeMs = options.maxAgeMs;
    this.now = options.now ?? (() => new Date().toISOString());
    this.requireSignature = options.requireSignature ?? false;
    if (this.maxAgeMs !== undefined && (!Number.isInteger(this.maxAgeMs) || this.maxAgeMs < 0)) {
      throw new TypeError('maxAgeMs must be a non-negative integer');
    }
  }

  verify(input: {
    receipt: unknown;
    candidate: MemoryRecordModel;
    candidateContentHash: string;
    canonicalizationVersion: string;
  }): PreflightVerification {
    let receipt: ContentPreflightReceipt;
    try {
      receipt = parseContentPreflightReceipt(input.receipt);
    } catch {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_INVALID' };
    }

    if (receipt.observation.contractVersion !== this.contractVersion) {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CONTRACT_UNSUPPORTED' };
    }
    if (this.requireSignature && !receipt.signature) {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SIGNATURE_REQUIRED' };
    }
    if (receipt.observation.source.canonicalPath && receipt.observation.source.canonicalPath !== input.candidate.source.path) {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SOURCE_PATH_MISMATCH' };
    }
    if (this.maxAgeMs !== undefined) {
      const observedAt = Date.parse(receipt.observation.observedAt);
      const now = Date.parse(this.now());
      if (!Number.isFinite(observedAt) || !Number.isFinite(now) || now - observedAt > this.maxAgeMs || observedAt > now) {
        return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_STALE' };
      }
    }

    return {
      kind: 'verified',
      receiptId: receipt.receiptId,
      observationId: receipt.observation.observationId,
      decisionId: receipt.decision.decisionId,
      contractVersion: receipt.observation.contractVersion,
      implementationVersion: receipt.observation.implementationVersion,
      ruleSetVersion: receipt.observation.ruleSetVersion,
      policyProfileId: receipt.observation.policyProfileId,
      outcome: receipt.observation.outcome,
      exposureLevel: receipt.decision.exposureLevel,
      sourceContentHash: receipt.observation.source.contentHash,
      emittedSurfaceHash: receipt.emittedSurfaceHash,
      truncated: receipt.truncated,
    };
  }
}

