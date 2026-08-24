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
import { RuntimeContractsPreflightReceiptVerifier } from './runtime-contracts-preflight-verifier.js';

const sourceHash = 'a'.repeat(64);
const surface = 'SAFE CONTENT';
const candidate = {
  id: 'memory_safe_001',
  kind: 'fact' as const,
  statement: surface,
  importance: 'high' as const,
  source: { artifactId: 'artifact_safe', path: 'docs/safe.txt', contentHash: `sha256:${sourceHash}`, sourceType: 'readme' as const },
  locator: 'SAFE.001',
  tags: [],
};

function makeReceipt(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], overrides: Record<string, unknown> = {}) {
  const body = {
    contractVersion: AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
    receiptId: 'receipt_safe_001',
    observation: {
      observationId: 'observation_safe_001',
      source: { canonicalPath: 'docs/safe.txt', contentHash: `sha256:${sourceHash}`, sizeBytes: surface.length },
      scannerRuntimeId: 'ananke',
      scannerVersion: '0.2.0',
      scannerPolicyId: 'source-aware-default',
      contractVersion: AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
      implementationVersion: '0.2.0',
      ruleSetVersion: 'ananke-source-aware-v1',
      policyProfileId: 'content-policy-v1',
      detectedType: 'text',
      observedAt: '2026-08-24T12:00:00.000Z',
      structuralFacts: { mediaType: 'text/plain', sourceTrust: 'OWNED', scanStatus: 'COMPLETE', binary: false, archiveEntryCount: 0, lineCount: 1 },
      outcome: 'PASS',
      riskFlags: [],
    },
    decision: {
      decisionId: 'decision_safe_001',
      observationId: 'observation_safe_001',
      exposureLevel: 'SELECTED_CONTENT',
      reasonCodes: ['CONTENT_ACCESS_ALLOWED'],
      requiresApproval: false,
      policyVersion: 'content-policy-v1',
      decidedAt: '2026-08-24T12:00:00.000Z',
    },
    emittedSurfaceHash: `sha256:${requireHash(canonicalizeContentSurface(surface))}`,
    truncated: false,
    issuer: { runtime: 'ananke', instanceId: 'ananke-instance-1' },
    audience: { runtime: 'mnemosyne' },
    context: {
      projectId: 'project-a',
      tenantId: 'tenant-a',
      workspaceId: 'workspace-a',
      purpose: 'persistent memory admission',
      destination: { runtime: 'mnemosyne' },
      requestId: 'request-safe-001',
      correlationId: 'correlation-safe-001',
    },
    issuedAt: '2026-08-24T12:00:00.000Z',
    expiresAt: '2026-08-24T12:05:00.000Z',
    nonce: 'nonce-safe-001',
    canonicalizationVersion: CONTENT_RECEIPT_CANONICALIZATION_VERSION,
    surfaceCanonicalizationVersion: CONTENT_SURFACE_CANONICALIZATION_VERSION,
    candidateCanonicalizationVersion: 'mnemosyne-exact-surface-v1',
    ...overrides,
  };
  const signatureValue = sign(null, Buffer.from(canonicalizeContentPreflightReceiptBody(body)), privateKey).toString('base64');
  return AuthenticatedContentPreflightReceiptSchema.parse({ ...body, signature: { algorithm: 'Ed25519', keyId: 'ananke-key-1', value: signatureValue } });
}

function requireHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('RuntimeContractsPreflightReceiptVerifier', () => {
  const keys = generateKeyPairSync('ed25519');
  const verifier = (now = '2026-08-24T12:01:00.000Z', trusted = keys.publicKey) => new RuntimeContractsPreflightReceiptVerifier({
    now: () => now,
    trustedIssuers: [{ keyId: 'ananke-key-1', publicKey: trusted, issuerRuntime: 'ananke', allowedInstanceIds: ['ananke-instance-1'] }],
  });
  const expectedContext = {
    projectId: 'project-a', tenantId: 'tenant-a', workspaceId: 'workspace-a', purpose: 'persistent memory admission', destinationRuntime: 'mnemosyne', requestId: 'request-safe-001', correlationId: 'correlation-safe-001',
  };

  it('accepts a valid Ed25519 receipt only when the exact surface and context match', () => {
    const receipt = makeReceipt(keys.privateKey);
    expect(verifier().verify({ receipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: surface, expectedContext })).toMatchObject({ kind: 'verified', receiptId: 'receipt_safe_001' });
  });

  it.each([
    ['unsigned', (receipt: Record<string, unknown>) => { delete receipt.signature; }],
    ['fake signature', (receipt: Record<string, unknown>) => { receipt.signature = 'hello'; }],
    ['changed surface hash', (receipt: Record<string, unknown>) => { receipt.emittedSurfaceHash = 'sha256:' + 'b'.repeat(64); }],
    ['changed audience', (receipt: Record<string, unknown>) => { receipt.audience = { runtime: 'memory' }; }],
    ['changed source hash', (receipt: Record<string, any>) => { receipt.observation.source.contentHash = 'sha256:' + 'b'.repeat(64); }],
    ['changed destination', (receipt: Record<string, any>) => { receipt.context.destination = { runtime: 'memory' }; }],
    ['changed purpose', (receipt: Record<string, any>) => { receipt.context.purpose = 'summarise for display'; }],
    ['changed expiry', (receipt: Record<string, unknown>) => { receipt.expiresAt = '2026-08-25T12:05:00.000Z'; }],
  ])('rejects a %s mutation', (_name, mutate) => {
    const receipt = makeReceipt(keys.privateKey) as unknown as Record<string, unknown>;
    mutate(receipt);
    expect(verifier().verify({ receipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: surface, expectedContext }).kind).toBe('unsupported');
  });

  it('rejects unknown and wrong trusted signing keys', () => {
    const other = generateKeyPairSync('ed25519');
    const receipt = makeReceipt(other.privateKey);
    expect(verifier().verify({ receipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: surface, expectedContext }).reasonCode).toBe('PREFLIGHT_SIGNATURE_INVALID');
    const unknownKeyReceipt = { ...receipt, signature: { ...receipt.signature, keyId: 'unknown-key' } };
    expect(verifier().verify({ receipt: unknownKeyReceipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: surface, expectedContext }).reasonCode).toBe('PREFLIGHT_ISSUER_UNTRUSTED');
  });

  it('rejects expired, future, cross-project, and inspect-A/store-B attempts', () => {
    const expired = makeReceipt(keys.privateKey, { expiresAt: '2026-08-24T12:00:30.000Z' });
    const future = makeReceipt(keys.privateKey, { issuedAt: '2026-08-24T12:02:00.000Z' });
    const crossProject = makeReceipt(keys.privateKey, { context: { projectId: 'project-b', tenantId: 'tenant-a', workspaceId: 'workspace-a', purpose: 'persistent memory admission', destination: { runtime: 'mnemosyne' }, requestId: 'request-safe-001', correlationId: 'correlation-safe-001' } });
    const differentCandidate = { ...candidate, statement: 'MALICIOUS DIFFERENT CONTENT' };
    const args = (receipt: unknown, extra = {}) => ({ receipt, candidate: extra === differentCandidate ? differentCandidate : candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: surface, expectedContext });
    expect(verifier().verify(args(expired)).reasonCode).toBe('PREFLIGHT_RECEIPT_EXPIRED');
    expect(verifier().verify(args(future)).reasonCode).toBe('PREFLIGHT_RECEIPT_FUTURE');
    expect(verifier().verify(args(crossProject)).reasonCode).toBe('PREFLIGHT_CONTEXT_MISMATCH');
    expect(verifier().verify(args(makeReceipt(keys.privateKey), differentCandidate)).reasonCode).toBe('PREFLIGHT_CANDIDATE_SURFACE_MISMATCH');
  });

  it('rejects altered surfaces and canonicalization versions', () => {
    const receipt = makeReceipt(keys.privateKey);
    expect(verifier().verify({ receipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'wrong-version', preflightSurface: surface, expectedContext }).reasonCode).toBe('PREFLIGHT_CANDIDATE_CANONICALIZATION_MISMATCH');
    expect(verifier().verify({ receipt, candidate, candidateContentHash: 'candidate', canonicalizationVersion: 'mnemosyne-exact-surface-v1', preflightSurface: 'SAFE CONTENT!', expectedContext }).reasonCode).toBe('PREFLIGHT_SURFACE_HASH_MISMATCH');
  });
});
