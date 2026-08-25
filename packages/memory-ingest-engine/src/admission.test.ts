import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
  CONTENT_RECEIPT_CANONICALIZATION_VERSION,
  CONTENT_SURFACE_CANONICALIZATION_VERSION,
  AuthenticatedContentPreflightReceiptSchema,
  canonicalizeContentPreflightReceiptBody,
  canonicalizeContentSurface,
} from 'project-runtime-contracts';
import {
  MemoryIngestEngine,
  ProvenanceAdmissionEngine,
  RuntimeContractsPreflightReceiptVerifier,
  type PreflightReceiptVerifier,
} from './index.js';

const sourceHash = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const candidate = {
  id: 'mem_fact_admission_001',
  kind: 'fact' as const,
  statement: 'The admission gate binds a memory to its source and authority.',
  importance: 'high' as const,
  source: {
    artifactId: 'artifact_admission',
    path: 'docs/admission.md',
    contentHash: sourceHash,
    sourceType: 'adr' as const,
  },
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

function verifier(
  outcome: 'PASS' | 'PASS_WITH_FLAGS' = 'PASS',
  receiptId = 'receipt_admission_001',
): PreflightReceiptVerifier {
  return {
    verify: () => ({
      kind: 'verified' as const,
      receiptId,
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

const authenticatedKeys = generateKeyPairSync('ed25519');

function authenticatedReceipt() {
  const body = {
    contractVersion: AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
    receiptId: 'receipt_pre_qwen_replay_001',
    observation: {
      observationId: 'observation_pre_qwen_replay_001',
      source: {
        canonicalPath: candidate.source.path,
        contentHash: sourceHash,
        sizeBytes: candidate.statement.length,
      },
      scannerRuntimeId: 'ananke',
      scannerVersion: '0.2.0',
      scannerPolicyId: 'source-aware-default',
      contractVersion: AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
      implementationVersion: '0.2.0',
      ruleSetVersion: 'ananke-source-aware-v1',
      policyProfileId: 'content-policy-v1',
      detectedType: 'text',
      observedAt: '2026-08-24T12:00:00.000Z',
      structuralFacts: {
        mediaType: 'text/plain',
        sourceTrust: 'OWNED',
        scanStatus: 'COMPLETE',
        binary: false,
        archiveEntryCount: 0,
        lineCount: 1,
      },
      outcome: 'PASS',
      riskFlags: [],
    },
    decision: {
      decisionId: 'decision_pre_qwen_replay_001',
      observationId: 'observation_pre_qwen_replay_001',
      exposureLevel: 'SELECTED_CONTENT',
      reasonCodes: ['CONTENT_ACCESS_ALLOWED'],
      requiresApproval: false,
      policyVersion: 'content-policy-v1',
      decidedAt: '2026-08-24T12:00:00.000Z',
    },
    emittedSurfaceHash: `sha256:${createHash('sha256').update(canonicalizeContentSurface(candidate.statement), 'utf8').digest('hex')}`,
    truncated: false,
    issuer: { runtime: 'ananke', instanceId: 'ananke-instance-1' },
    audience: { runtime: 'mnemosyne' },
    context: {
      projectId: 'project_fates',
      tenantId: 'tenant-a',
      workspaceId: 'workspace-a',
      purpose: 'persistent memory admission',
      destination: { runtime: 'mnemosyne' },
      requestId: 'request-pre-qwen-replay-001',
      correlationId: 'corr-pre-qwen-replay-001',
    },
    issuedAt: '2026-08-24T12:00:00.000Z',
    expiresAt: '2026-08-24T12:05:00.000Z',
    nonce: 'nonce-pre-qwen-replay-001',
    canonicalizationVersion: CONTENT_RECEIPT_CANONICALIZATION_VERSION,
    surfaceCanonicalizationVersion: CONTENT_SURFACE_CANONICALIZATION_VERSION,
    candidateCanonicalizationVersion: 'mnemosyne-exact-surface-v1',
  };
  const signatureValue = sign(
    null,
    Buffer.from(canonicalizeContentPreflightReceiptBody(body)),
    authenticatedKeys.privateKey,
  ).toString('base64');
  return AuthenticatedContentPreflightReceiptSchema.parse({
    ...body,
    signature: { algorithm: 'Ed25519', keyId: 'ananke-key-1', value: signatureValue },
  });
}

function authenticatedRequest(trustDomain: string) {
  return request({
    trustDomain,
    tenantId: 'tenant-a',
    workspaceId: 'workspace-a',
    requestId: 'request-pre-qwen-replay-001',
    purpose: 'persistent memory admission',
    receipt: authenticatedReceipt(),
    preflight: new RuntimeContractsPreflightReceiptVerifier({
      now: () => '2026-08-24T12:01:00.000Z',
      trustedIssuers: [
        {
          keyId: 'ananke-key-1',
          publicKey: authenticatedKeys.publicKey,
          issuerRuntime: 'ananke',
          allowedInstanceIds: ['ananke-instance-1'],
        },
      ],
    }),
    preflightSurface: candidate.statement,
    expectedContext: {
      projectId: 'project_fates',
      tenantId: 'tenant-a',
      workspaceId: 'workspace-a',
      purpose: 'persistent memory admission',
      destinationRuntime: 'mnemosyne',
      requestId: 'request-pre-qwen-replay-001',
      correlationId: 'corr-pre-qwen-replay-001',
    },
    authority: {
      evaluate: () => ({
        kind: 'allowed' as const,
        decisionId: 'decision-authority-pre-qwen',
        policyVersion: 'policy-pre-qwen',
      }),
    },
  });
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
    expect(engine.history.listEvents()).toMatchObject([
      { state: 'DEFERRED', candidateId: result.admission.candidateId },
    ]);
  });

  it('admits only after preflight and authority, and replays idempotently', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const allowed = {
      evaluate: () => ({
        kind: 'allowed' as const,
        decisionId: 'decision_ananke_001',
        policyVersion: 'policy-2026-08',
      }),
    };

    const first = engine.admit(
      candidate,
      request({ receipt: { receiptId: 'opaque' }, preflight: verifier(), authority: allowed }),
    );
    const replay = engine.admit(
      candidate,
      request({ receipt: { receiptId: 'opaque' }, preflight: verifier(), authority: allowed }),
    );

    expect(first.admission.state).toBe('ADMITTED');
    expect(first.memory).toMatchObject({
      id: candidate.id,
      status: 'tentative',
      admission: { state: 'ADMITTED' },
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.admission.admissionId).toBe(first.admission.admissionId);
    expect(engine.history.listEvents()).toHaveLength(1);
  });

  it('quarantines mismatched or failed preflight results without exposing a memory', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const mismatched: PreflightReceiptVerifier = {
      verify: () => ({
        kind: 'verified',
        receiptId: 'receipt_bad',
        observationId: 'observation_bad',
        decisionId: 'decision_bad',
        contractVersion: '1.0.0',
        ruleSetVersion: 'rules-2026-08',
        outcome: 'PASS',
        exposureLevel: 'FULL_CONTENT',
        sourceContentHash:
          'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        truncated: false,
      }),
    };

    const result = engine.admit(candidate, request({ receipt: {}, preflight: mismatched }));

    expect(result.admission.state).toBe('QUARANTINED');
    expect(result.admission.reasonCodes).toEqual(['PREFLIGHT_SOURCE_HASH_MISMATCH']);
    expect(result.memory).toBeUndefined();
    expect(engine.history.listStaged()[0]?.state).toBe('QUARANTINED');
  });

  it('retries deferred authority with the same candidate and admission identity', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const deferred = {
      evaluate: () => ({ kind: 'deferred' as const, reasonCode: 'ANANKE_UNAVAILABLE' }),
    };
    const first = engine.admit(
      candidate,
      request({ receipt: {}, preflight: verifier(), authority: deferred }),
    );
    const allowed = {
      evaluate: () => ({
        kind: 'allowed' as const,
        decisionId: 'decision_retry',
        policyVersion: 'policy-2026-08',
      }),
    };
    const retry = engine.retry(first.admission.admissionId, {
      receipt: {},
      preflight: verifier('PASS_WITH_FLAGS'),
      authority: allowed,
    });

    expect(first.admission.state).toBe('DEFERRED');
    expect(retry.admission.state).toBe('ADMITTED');
    expect(retry.admission.admissionId).toBe(first.admission.admissionId);
    expect(retry.admission.candidateId).toBe(first.admission.candidateId);
    expect(retry.admission.attempt).toBe(2);
    expect(engine.history.listEvents(first.admission.admissionId)).toHaveLength(2);
    expect(engine.history.listStaged()).toHaveLength(0);
  });

  it('fails closed when authority is missing and rejects a consumed receipt on another candidate', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const noAuthority = engine.admit(
      candidate,
      request({ receipt: { opaque: true }, preflight: verifier() }),
    );
    expect(noAuthority.admission.state).toBe('DEFERRED');
    expect(noAuthority.admission.reasonCodes).toEqual(['ADMISSION_AUTHORITY_REQUIRED']);

    const allowed = { evaluate: () => ({ kind: 'allowed' as const }) };
    const first = engine.admit(
      candidate,
      request({
        idempotencyKey: 'idem-replay-a',
        receipt: { opaque: true },
        preflight: verifier(),
        authority: allowed,
      }),
    );
    const differentCandidate = {
      ...candidate,
      id: 'mem_fact_admission_002',
      statement: 'Different candidate content.',
    };
    const replay = engine.admit(
      differentCandidate,
      request({
        idempotencyKey: 'idem-replay-b',
        receipt: { opaque: true },
        preflight: verifier(),
        authority: allowed,
      }),
    );

    expect(first.admission.state).toBe('ADMITTED');
    expect(replay.admission.state).toBe('REJECTED');
    expect(replay.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_REPLAYED']);
    expect(replay.memory).toBeUndefined();
  });

  it('sweeps expired replay entries and refuses new entries when the bounded ledger is full', () => {
    let now = '2026-08-24T12:00:00.000Z';
    const engine = new ProvenanceAdmissionEngine({ now: () => now, maxConsumedReceipts: 2 });
    const allowed = { evaluate: () => ({ kind: 'allowed' as const }) };
    const receiptVerifier = (id: string): PreflightReceiptVerifier => ({
      verify: () => ({
        kind: 'verified' as const,
        receiptId: id,
        receiptDigest: id,
        observationId: id,
        decisionId: id,
        contractVersion: '1.0.0',
        ruleSetVersion: 'rules-2026-08',
        outcome: 'PASS' as const,
        exposureLevel: 'SELECTED_CONTENT' as const,
        sourceContentHash: sourceHash,
        truncated: false,
        expiresAt: id === 'receipt-4' ? '2026-08-24T12:10:00.000Z' : '2026-08-24T12:05:00.000Z',
      }),
    });

    expect(
      engine.admit(
        { ...candidate, id: 'mem_fact_bounded_001' },
        request({
          idempotencyKey: 'bounded-1',
          receipt: {},
          preflight: receiptVerifier('receipt-1'),
          authority: allowed,
        }),
      ).admission.state,
    ).toBe('ADMITTED');
    expect(
      engine.admit(
        { ...candidate, id: 'mem_fact_bounded_002' },
        request({
          idempotencyKey: 'bounded-2',
          receipt: {},
          preflight: receiptVerifier('receipt-2'),
          authority: allowed,
        }),
      ).admission.state,
    ).toBe('ADMITTED');
    const full = engine.admit(
      { ...candidate, id: 'mem_fact_bounded_003' },
      request({
        idempotencyKey: 'bounded-3',
        receipt: {},
        preflight: receiptVerifier('receipt-3'),
        authority: allowed,
      }),
    );
    expect(full.admission.state).toBe('DEFERRED');
    expect(full.admission.reasonCodes).toEqual(['PREFLIGHT_REPLAY_LEDGER_FULL']);
    expect(engine.replayLedgerSize).toBe(2);

    now = '2026-08-24T12:06:00.000Z';
    const afterExpiry = engine.admit(
      { ...candidate, id: 'mem_fact_bounded_004' },
      request({
        idempotencyKey: 'bounded-4',
        receipt: {},
        preflight: receiptVerifier('receipt-4'),
        authority: allowed,
      }),
    );
    expect(afterExpiry.admission.state).toBe('ADMITTED');
    expect(engine.replayLedgerSize).toBe(1);
  });

  it('rejects a still-valid consumed receipt before its expiry', () => {
    let now = '2026-08-24T12:00:00.000Z';
    const engine = new ProvenanceAdmissionEngine({ now: () => now });
    const allowed = { evaluate: () => ({ kind: 'allowed' as const }) };
    const receiptVerifier: PreflightReceiptVerifier = {
      verify: () => ({
        kind: 'verified' as const,
        receiptId: 'receipt-valid-replay',
        receiptDigest: 'receipt-valid-replay',
        observationId: 'observation',
        decisionId: 'decision',
        contractVersion: '1.0.0',
        ruleSetVersion: 'rules-2026-08',
        outcome: 'PASS' as const,
        exposureLevel: 'SELECTED_CONTENT' as const,
        sourceContentHash: sourceHash,
        truncated: false,
        expiresAt: '2026-08-24T12:05:00.000Z',
      }),
    };
    const first = engine.admit(
      candidate,
      request({
        idempotencyKey: 'valid-replay-1',
        receipt: {},
        preflight: receiptVerifier,
        authority: allowed,
      }),
    );
    now = '2026-08-24T12:04:00.000Z';
    const replay = engine.admit(
      { ...candidate, id: 'mem_fact_replay_target' },
      request({
        idempotencyKey: 'valid-replay-2',
        receipt: {},
        preflight: receiptVerifier,
        authority: allowed,
      }),
    );
    expect(first.admission.state).toBe('ADMITTED');
    expect(replay.admission.state).toBe('REJECTED');
    expect(replay.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_REPLAYED']);
  });

  it('P0-B rejects trustDomain-partitioned replay of one genuine authenticated receipt', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:01:00.000Z' });
    const first = engine.admit(candidate, authenticatedRequest('trust-domain-a'));
    const replays = ['trust-domain-b', 'trust-domain-c', 'trust-domain-d'].map((trustDomain) =>
      engine.admit(candidate, authenticatedRequest(trustDomain)),
    );

    expect(first.admission.state).toBe('ADMITTED');
    for (const replay of replays) {
      expect(replay.admission.state).toBe('REJECTED');
      expect(replay.replayed).toBe(false);
      expect(replay.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_REPLAYED']);
    }
  });

  it('P0-C binds admission idempotency to workspace and candidate changes', () => {
    const engine = new ProvenanceAdmissionEngine({ now: () => '2026-08-24T12:00:00.000Z' });
    const allowed = { evaluate: () => ({ kind: 'allowed' as const }) };
    const candidateB = {
      ...candidate,
      id: 'mem_fact_admission_collision_b',
      statement: 'Changed candidate content must not replay admission A.',
      source: { ...candidate.source, path: 'docs/changed-admission.md' },
    };
    const first = engine.admit(
      candidate,
      request({
        idempotencyKey: 'idem-collision-pre-qwen',
        workspaceId: 'workspace-a',
        receipt: { opaque: true },
        preflight: verifier('PASS', 'receipt-collision-a'),
        preflightSurface: candidate.statement,
        authority: allowed,
      }),
    );
    const differentWorkspace = engine.admit(
      candidateB,
      request({
        idempotencyKey: 'idem-collision-pre-qwen',
        workspaceId: 'workspace-b',
        receipt: { opaque: true },
        preflight: verifier('PASS', 'receipt-collision-b'),
        preflightSurface: candidateB.statement,
        authority: allowed,
      }),
    );
    const sameWorkspaceDifferentCandidate = engine.admit(
      { ...candidateB, id: 'mem_fact_admission_collision_c' },
      request({
        idempotencyKey: 'idem-collision-pre-qwen',
        workspaceId: 'workspace-a',
        receipt: { opaque: true },
        preflight: verifier('PASS', 'receipt-collision-c'),
        preflightSurface: candidateB.statement,
        authority: allowed,
      }),
    );

    expect(first.admission.state).toBe('ADMITTED');
    expect(differentWorkspace.admission.state).toBe('ADMITTED');
    expect(differentWorkspace.replayed).toBe(false);
    expect(differentWorkspace.admission.candidateId).not.toBe(first.admission.candidateId);
    expect(sameWorkspaceDifferentCandidate.admission.state).toBe('ADMITTED');
    expect(sameWorkspaceDifferentCandidate.replayed).toBe(false);
    expect(sameWorkspaceDifferentCandidate.admission.candidateId).not.toBe(
      first.admission.candidateId,
    );
  });
});
