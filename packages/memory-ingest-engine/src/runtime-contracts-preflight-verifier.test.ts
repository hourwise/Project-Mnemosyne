import { describe, expect, it } from 'vitest';
import { MemoryIngestEngine } from './index.js';
import { RuntimeContractsPreflightReceiptVerifier } from './runtime-contracts-preflight-verifier.js';

const sourceHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const candidate = new MemoryIngestEngine({ now: () => '2026-08-24T14:00:00.000Z' }).ingest({
  id: 'memory_receipt_001',
  kind: 'fact',
  statement: 'The shared receipt is verified before memory admission.',
  importance: 'high',
  source: { artifactId: 'artifact_001', path: 'docs/receipt.md', contentHash: sourceHash, sourceType: 'adr' },
  locator: 'MNEMOSYNE.RECEIPT.001',
});

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptId: 'receipt_shared_001',
    observation: {
      observationId: 'observation_shared_001',
      source: { canonicalPath: 'docs/receipt.md', contentHash: sourceHash, sizeBytes: 128 },
      scannerRuntimeId: 'ananke',
      scannerVersion: '0.2.0',
      contractVersion: '1.0.0',
      implementationVersion: '0.2.0',
      ruleSetVersion: 'ananke-source-aware-v1',
      policyProfileId: 'content-policy-v1',
      detectedType: 'text/markdown',
      observedAt: '2026-08-24T14:00:00.000Z',
      structuralFacts: { lineCount: 1, binary: false },
      riskFlags: [],
      outcome: 'PASS',
    },
    decision: {
      decisionId: 'decision_shared_001',
      observationId: 'observation_shared_001',
      exposureLevel: 'SELECTED_CONTENT',
      reasonCodes: ['CONTENT_ACCESS_ALLOWED'],
      requiresApproval: false,
      policyVersion: 'content-policy-v1',
      decidedAt: '2026-08-24T14:00:00.000Z',
    },
    emittedSurfaceHash: sourceHash,
    truncated: false,
    ...overrides,
  };
}

describe('RuntimeContractsPreflightReceiptVerifier', () => {
  it('parses the released shared receipt and binds its source path and hash', () => {
    const verifier = new RuntimeContractsPreflightReceiptVerifier({ now: () => '2026-08-24T14:01:00.000Z', maxAgeMs: 120_000 });
    const result = verifier.verify({ receipt: receipt(), candidate, candidateContentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', canonicalizationVersion: 'mnemosyne-candidate-v1' });

    expect(result).toMatchObject({
      kind: 'verified',
      receiptId: 'receipt_shared_001',
      observationId: 'observation_shared_001',
      decisionId: 'decision_shared_001',
      sourceContentHash: sourceHash,
      exposureLevel: 'SELECTED_CONTENT',
    });
  });

  it('fails closed for malformed, stale, and source-mismatched receipts', () => {
    const verifier = new RuntimeContractsPreflightReceiptVerifier({ now: () => '2026-08-24T15:00:00.000Z', maxAgeMs: 120_000 });
    expect(verifier.verify({ receipt: { receiptId: 'not-a-receipt' }, candidate, candidateContentHash: sourceHash, canonicalizationVersion: 'mnemosyne-candidate-v1' })).toEqual({ kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_INVALID' });
    expect(verifier.verify({ receipt: receipt(), candidate, candidateContentHash: sourceHash, canonicalizationVersion: 'mnemosyne-candidate-v1' })).toEqual({ kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_STALE' });
    expect(verifier.verify({ receipt: receipt({ observation: { ...receipt().observation, source: { canonicalPath: 'other.md', contentHash: sourceHash, sizeBytes: 128 } } }), candidate, candidateContentHash: sourceHash, canonicalizationVersion: 'mnemosyne-candidate-v1' })).toEqual({ kind: 'unsupported', reasonCode: 'PREFLIGHT_SOURCE_PATH_MISMATCH' });
  });

  it('can require a signed receipt without treating an unsigned receipt as admission evidence', () => {
    const verifier = new RuntimeContractsPreflightReceiptVerifier({ requireSignature: true });
    expect(verifier.verify({ receipt: receipt(), candidate, candidateContentHash: sourceHash, canonicalizationVersion: 'mnemosyne-candidate-v1' })).toEqual({ kind: 'unsupported', reasonCode: 'PREFLIGHT_SIGNATURE_REQUIRED' });
  });
});
