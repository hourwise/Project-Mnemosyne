import { describe, expect, it } from 'vitest';
import { MemoryIngestEngine, ProvenanceAdmissionEngine, type PreflightReceiptVerifier } from './index.js';

const sourceHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const candidate = {
  id: 'mem_fact_admission_001',
  kind: 'fact' as const,
  statement: 'The admission gate binds a memory to its source and authority.',
  importance: 'high' as const,
  source: { artifactId: 'artifact_admission', path: 'docs/admission.md', contentHash: sourceHash, sourceType: 'adr' as const },
  locator: 'MNEMOSYNE.ADMISSION.001',
  tags: ['admission'],
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    ingestionOperation: 'memory.write',
    correlationId: 'corr_admission_001',
    idempotencyKey: 'idem_admission_001',
    projectId: 'project_fates',
    vaultId: 'vault_main',
    trustDomain: 'project_fates',
    actor: { id: 'runtime_mnemosyne', kind: 'runtime' },
    ...overrides,
  };
}

function verifier(outcome: 'PASS' | 'PASS_WITH_FLAGS' = 'PASS'): PreflightReceiptVerifier {
  return {
    verify: () => ({
      kind: 'verified' as const,
      receiptId: 'receipt_admission_001',
      observationId: 'observation_admission_001',
      decisionId: 'decision_admission_001',
      contractVersion: '1.0.0',
      ruleSetVersion: 'rules-2026-08',
      outcome,
      exposureLevel: 'SELECTED_CONTENT' as const,
      sourceContentHash: sourceHash,
      emittedSurfaceHash: sourceHash,
      truncated: false,
    }),
  };
}

describe('ProvenanceAdmissionEngine', () => {
  it('defers without a receipt and keeps the candidate out of persistence', () => {
    const engine = new ProvenanceAdmissionEngine({
      now: () => '2026-08-24T12:00:00.000Z',
      ingest: new MemoryIngestEngine({ now: () => '2026-08-24T12:00:00.000Z' }),
    });

    const result = engine.admit(candidate, request());

    expect(result.admission.state).toBe('DEFERRED');
    expect(result.admission.reasonCodes).toEqual(['PREFLIGHT_REQUIRED']);
    expect(result.memory).toBeUndefined();
    expect(result.staged).toBe(true);
    expect(engine.history.listStaged()).toMatchObject([{ state: 'DEFERRED', attempt: 1 }]);
    expect(engine.history.listEvents()).toMatchObject([{ state: 'DEFERRED', candidateId: result.admission.candidateId }]);
  });

  it('admits only after preflight and authority, and replays idempotently', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const allowed = { evaluate: () => ({ kind: 'allowed' as const, decisionId: 'decision_ananke_001', policyVersion: 'policy-2026-08' }) };

    const first = engine.admit(candidate, request({ receipt: { receiptId: 'opaque' }, preflight: verifier(), authority: allowed }));
    const replay = engine.admit(candidate, request({ receipt: { receiptId: 'opaque' }, preflight: verifier(), authority: allowed }));

    expect(first.admission.state).toBe('ADMITTED');
    expect(first.memory).toMatchObject({ id: candidate.id, status: 'tentative', admission: { state: 'ADMITTED' } });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.admission.admissionId).toBe(first.admission.admissionId);
    expect(engine.history.listEvents()).toHaveLength(1);
  });

  it('quarantines mismatched or failed preflight results without exposing a memory', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const mismatched: PreflightReceiptVerifier = { verify: () => ({
      kind: 'verified',
      receiptId: 'receipt_bad',
      observationId: 'observation_bad',
      decisionId: 'decision_bad',
      contractVersion: '1.0.0',
      ruleSetVersion: 'rules-2026-08',
      outcome: 'PASS',
      exposureLevel: 'FULL_CONTENT',
      sourceContentHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      truncated: false,
    }) };

    const result = engine.admit(candidate, request({ receipt: {}, preflight: mismatched }));

    expect(result.admission.state).toBe('QUARANTINED');
    expect(result.admission.reasonCodes).toEqual(['PREFLIGHT_SOURCE_HASH_MISMATCH']);
    expect(result.memory).toBeUndefined();
    expect(engine.history.listStaged()[0]?.state).toBe('QUARANTINED');
  });

  it('retries deferred authority with the same candidate and admission identity', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const deferred = { evaluate: () => ({ kind: 'deferred' as const, reasonCode: 'ANANKE_UNAVAILABLE' }) };
    const first = engine.admit(candidate, request({ receipt: {}, preflight: verifier(), authority: deferred }));
    const allowed = { evaluate: () => ({ kind: 'allowed' as const, decisionId: 'decision_retry', policyVersion: 'policy-2026-08' }) };
    const retry = engine.retry(first.admission.admissionId, { receipt: {}, preflight: verifier('PASS_WITH_FLAGS'), authority: allowed });

    expect(first.admission.state).toBe('DEFERRED');
    expect(retry.admission.state).toBe('ADMITTED');
    expect(retry.admission.admissionId).toBe(first.admission.admissionId);
    expect(retry.admission.candidateId).toBe(first.admission.candidateId);
    expect(retry.admission.attempt).toBe(2);
    expect(engine.history.listEvents(first.admission.admissionId)).toHaveLength(2);
    expect(engine.history.listStaged()).toHaveLength(0);
  });
});
