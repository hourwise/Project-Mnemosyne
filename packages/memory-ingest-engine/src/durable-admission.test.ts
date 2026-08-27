import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DurableAdmissionHistoryStore,
  DurableAdmissionStateError,
  ProvenanceAdmissionEngine,
  type AdmissionRequest,
  type CandidateMemory,
  type PreflightReceiptVerifier,
} from './index.js';

const sourceHash = 'sha256:' + 'a'.repeat(64);
const receiptDigest = 'sha256:' + 'b'.repeat(64);

const candidate: CandidateMemory = {
  id: 'mem_fact_durable_001',
  kind: 'fact',
  statement: 'Durable admission remains source-bound.',
  importance: 'high',
  source: { artifactId: 'artifact_durable', path: 'docs/durable.md', contentHash: sourceHash, sourceType: 'adr' },
  locator: 'PROJECT.FACTS.005',
};

const verifier: PreflightReceiptVerifier = {
  verify: () => ({
    kind: 'verified',
    receiptId: 'receipt-durable-001',
    receiptDigest,
    observationId: 'observation-durable-001',
    decisionId: 'decision-durable-001',
    contractVersion: '1.0.0',
    ruleSetVersion: 'rules-durable',
    outcome: 'PASS',
    exposureLevel: 'SELECTED_CONTENT',
    sourceContentHash: sourceHash,
    truncated: false,
    expiresAt: '2026-08-27T13:00:00.000Z',
  }),
};

function request(overrides: Partial<AdmissionRequest> = {}): AdmissionRequest {
  return {
    ingestionOperation: 'memory.write',
    ingestionPath: 'governed.memory-admission',
    correlationId: 'correlation-durable-001',
    idempotencyKey: 'idempotency-durable-001',
    projectId: 'project-durable',
    trustDomain: 'trust-durable',
    tenantId: 'tenant-durable',
    workspaceId: 'workspace-durable',
    requestId: 'request-durable-001',
    purpose: 'governed.memory-admission',
    actor: { id: 'agent-durable', kind: 'agent' },
    receipt: { signed: true },
    preflightSurface: candidate.statement,
    preflight: verifier,
    authority: { evaluate: () => ({ kind: 'allowed', decisionId: 'decision-durable-001', policyVersion: 'policy-durable' }) },
    expectedContext: {
      projectId: 'project-durable',
      tenantId: 'tenant-durable',
      workspaceId: 'workspace-durable',
      purpose: 'governed.memory-admission',
      destinationRuntime: 'mnemosyne',
      requestId: 'request-durable-001',
      correlationId: 'correlation-durable-001',
    },
    ...overrides,
  };
}

function stateFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'mnemosyne-005d-durable-')), 'admission.json');
}

function engine(filePath: string, authority = request().authority): ProvenanceAdmissionEngine {
  const now = () => '2026-08-27T12:00:00.000Z';
  return new ProvenanceAdmissionEngine({
    now,
    history: new DurableAdmissionHistoryStore({ filePath, now }),
  });
}

function rewriteState(filePath: string, mutate: (document: any) => void): void {
  const document = JSON.parse(readFileSync(filePath, 'utf8'));
  mutate(document);
  const unsigned = {
    schemaVersion: document.schemaVersion,
    admissions: document.admissions,
    staged: document.staged,
    events: document.events,
    consumedReceipts: document.consumedReceipts,
  };
  document.checksum = `sha256:${createHash('sha256').update(stableJson(unsigned), 'utf8').digest('hex')}`;
  writeFileSync(filePath, JSON.stringify(document), 'utf8');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}

describe('durable admission and receipt replay', () => {
  it('reconstructs admission and receipt-consumption state in a fresh engine', () => {
    const filePath = stateFile();
    const first = engine(filePath).admit(candidate, request());
    const restarted = engine(filePath).admit(candidate, request());
    const receiptReplay = engine(filePath).admit(
      { ...candidate, id: 'mem_fact_durable_002' },
      request({ idempotencyKey: 'idempotency-durable-002', requestId: 'request-durable-002' }),
    );

    expect(first.admission.state).toBe('ADMITTED');
    expect(restarted.replayed).toBe(true);
    expect(restarted.admission.admissionId).toBe(first.admission.admissionId);
    expect(receiptReplay.admission.state).toBe('REJECTED');
    expect(receiptReplay.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_REPLAYED']);
    expect(engine(filePath).replayLedgerSize).toBe(1);
  });

  it('preserves deferred admission for governed retry after restart', () => {
    const filePath = stateFile();
    const deferredAuthority = { evaluate: () => ({ kind: 'deferred' as const, reasonCode: 'ANANKE_UNAVAILABLE' }) };
    const deferred = engine(filePath, deferredAuthority).admit(candidate, request({ authority: deferredAuthority }));
    expect(deferred.admission.state).toBe('DEFERRED');

    const retried = engine(filePath).retry(deferred.admission.admissionId, {
      receipt: { signed: true },
      preflight: verifier,
      authority: request().authority!,
    });
    expect(retried.admission.state).toBe('ADMITTED');
    expect(retried.admission.attempt).toBe(2);
  });

  it.each(['', 'not-json', '{"schemaVersion":999}'])('fails closed on corrupted admission state: %s', (contents) => {
    const filePath = stateFile();
    writeFileSync(filePath, contents, 'utf8');
    expect(() => engine(filePath).replayLedgerSize).toThrow(DurableAdmissionStateError);
  });

  it('fails closed on checksum tampering and does not start with empty replay history', () => {
    const filePath = stateFile();
    const effect = engine(filePath).admit(candidate, request());
    expect(effect.admission.state).toBe('ADMITTED');
    const document = JSON.parse(readFileSync(filePath, 'utf8'));
    document.consumedReceipts[0].entry.candidateContentHash = 'sha256:' + 'c'.repeat(64);
    writeFileSync(filePath, JSON.stringify(document), 'utf8');
    expect(() => engine(filePath).admit(candidate, request())).toThrow('checksum mismatch');
  });

  it('keeps receipt replay independent of caller-selected trust domain after restart', () => {
    const filePath = stateFile();
    expect(engine(filePath).admit(candidate, request()).admission.state).toBe('ADMITTED');
    const replay = engine(filePath).admit(candidate, request({ trustDomain: 'attacker-selected-domain', idempotencyKey: 'other-key' }));
    expect(replay.admission.state).toBe('REJECTED');
    expect(replay.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_REPLAYED']);
  });

  it('preserves completed results but rejects expired authority after a restart before admission', () => {
    const completedFile = stateFile();
    let completedNow = '2026-08-27T12:00:00.000Z';
    const completedVerifier: PreflightReceiptVerifier = {
      verify: () => ({ ...verifier.verify({} as never), expiresAt: '2026-08-27T13:00:00.000Z' }),
    };
    const completedRequest = request({ preflight: completedVerifier });
    const completed = new ProvenanceAdmissionEngine({
      now: () => completedNow,
      history: new DurableAdmissionHistoryStore({ filePath: completedFile, now: () => completedNow }),
    }).admit(candidate, completedRequest);
    expect(completed.admission.state).toBe('ADMITTED');
    completedNow = '2026-08-27T14:00:00.000Z';
    const completedReplay = new ProvenanceAdmissionEngine({
      now: () => completedNow,
      history: new DurableAdmissionHistoryStore({ filePath: completedFile, now: () => completedNow }),
    }).admit(candidate, completedRequest);
    expect(completedReplay.replayed).toBe(true);
    expect(completedReplay.admission.state).toBe('ADMITTED');

    const deferredFile = stateFile();
    let deferredNow = '2026-08-27T12:00:00.000Z';
    const deferredAuthority = { evaluate: () => ({ kind: 'deferred' as const, reasonCode: 'ANANKE_UNAVAILABLE' }) };
    const deferredRequest = request({ authority: deferredAuthority, preflight: completedVerifier });
    const deferred = new ProvenanceAdmissionEngine({
      now: () => deferredNow,
      history: new DurableAdmissionHistoryStore({ filePath: deferredFile, now: () => deferredNow, stagingTtlMs: 4 * 60 * 60 * 1000 }),
    }).admit(candidate, deferredRequest);
    expect(deferred.admission.state).toBe('DEFERRED');
    deferredNow = '2026-08-27T14:00:00.000Z';
    const expiredVerifier: PreflightReceiptVerifier = {
      verify: () => ({ kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_EXPIRED' }),
    };
    const expired = new ProvenanceAdmissionEngine({
      now: () => deferredNow,
      history: new DurableAdmissionHistoryStore({ filePath: deferredFile, now: () => deferredNow, stagingTtlMs: 4 * 60 * 60 * 1000 }),
    }).retry(deferred.admission.admissionId, {
      receipt: { signed: true },
      preflight: expiredVerifier,
      authority: request().authority!,
    });
    expect(expired.admission.state).toBe('QUARANTINED');
    expect(expired.admission.reasonCodes).toEqual(['PREFLIGHT_RECEIPT_EXPIRED']);
  });

  it.each([
    ['malformed admission result', (document: any) => { document.admissions[0].result = null; }],
    ['conflicting idempotency record', (document: any) => { document.admissions.push({ ...document.admissions[0] }); }],
    ['conflicting audit event', (document: any) => { document.events.push({ ...document.events[0] }); }],
    ['malformed receipt ledger entry', (document: any) => { document.consumedReceipts[0].entry.expiresAtMs = 'not-a-number'; }],
  ] as const)('fails closed on persisted %s', (_label, mutate) => {
    const filePath = stateFile();
    engine(filePath).admit(candidate, request());
    rewriteState(filePath, mutate);
    expect(() => engine(filePath).replayLedgerSize).toThrow(DurableAdmissionStateError);
  });
});
