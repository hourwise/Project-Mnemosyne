import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import {
  AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION,
  CONTENT_RECEIPT_CANONICALIZATION_VERSION,
  CONTENT_SURFACE_CANONICALIZATION_VERSION,
  AuthenticatedContentPreflightReceiptSchema,
  canonicalizeContentPreflightReceiptBody,
  canonicalizeContentSurface,
  parseContentPreflightReceipt,
  type AuthenticatedContentPreflightReceipt,
  type ContentPreflightReceipt,
} from 'project-runtime-contracts';
import type { MemoryRecord as MemoryRecordModel } from '@mnemosyne/schema';
import type { PreflightReceiptVerifier, PreflightVerification } from './admission.js';

export interface TrustedReceiptIssuer {
  keyId: string;
  publicKey: KeyObject | string | Buffer;
  issuerRuntime: string;
  allowedInstanceIds?: readonly string[];
}

export interface ReceiptExpectedContext {
  projectId: string;
  tenantId?: string;
  workspaceId?: string;
  purpose?: string;
  destinationRuntime?: string;
  requestId?: string;
  correlationId?: string;
}

export interface RuntimeContractsPreflightReceiptVerifierOptions {
  strict?: boolean;
  contractVersion?: string;
  /** Compatibility-only input; strict mode uses the signed issuedAt/expiresAt window. */
  maxAgeMs?: number;
  maxLifetimeMs?: number;
  now?: () => string;
  requireSignature?: boolean;
  expectedAudienceRuntime?: string;
  trustedIssuers?: ReadonlyMap<string, TrustedReceiptIssuer> | readonly TrustedReceiptIssuer[];
}

/** Production verifier for authenticated Runtime Contracts receipts. */
export class RuntimeContractsPreflightReceiptVerifier implements PreflightReceiptVerifier {
  readonly securityMode = 'AUTHENTICATED' as const;
  private readonly strict: boolean;
  private readonly contractVersion: string;
  private readonly maxAgeMs: number | undefined;
  private readonly maxLifetimeMs: number;
  private readonly now: () => string;
  private readonly expectedAudienceRuntime: string;
  private readonly trustedIssuers: ReadonlyMap<string, TrustedReceiptIssuer>;

  constructor(options: RuntimeContractsPreflightReceiptVerifierOptions = {}) {
    this.strict = options.strict ?? true;
    this.contractVersion = options.contractVersion ?? AUTHENTICATED_CONTENT_PREFLIGHT_CONTRACT_VERSION;
    this.maxAgeMs = options.maxAgeMs;
    this.maxLifetimeMs = options.maxLifetimeMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date().toISOString());
    this.expectedAudienceRuntime = options.expectedAudienceRuntime ?? 'mnemosyne';
    this.trustedIssuers = normalizeIssuers(options.trustedIssuers);
    if (this.maxAgeMs !== undefined && (!Number.isInteger(this.maxAgeMs) || this.maxAgeMs < 0)) {
      throw new TypeError('maxAgeMs must be a non-negative integer');
    }
    if (!Number.isInteger(this.maxLifetimeMs) || this.maxLifetimeMs <= 0 || this.maxLifetimeMs > 15 * 60 * 1000) {
      throw new TypeError('maxLifetimeMs must be a positive integer no greater than fifteen minutes');
    }
    if (this.strict && this.trustedIssuers.size === 0) {
      throw new Error('STRICT_PREFLIGHT_VERIFIER_REQUIRES_TRUSTED_ISSUER');
    }
  }

  verify(input: {
    receipt: unknown;
    candidate: MemoryRecordModel;
    candidateContentHash: string;
    canonicalizationVersion: string;
    preflightSurface?: unknown;
    expectedContext?: ReceiptExpectedContext;
  }): PreflightVerification {
    if (!this.strict) return this.verifyDevelopment(input);

    const parsed = AuthenticatedContentPreflightReceiptSchema.safeParse(input.receipt);
    if (!parsed.success) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_INVALID' };
    const receipt = parsed.data;

    if (receipt.contractVersion !== this.contractVersion) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CONTRACT_UNSUPPORTED' };
    if (input.canonicalizationVersion !== receipt.candidateCanonicalizationVersion) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CANDIDATE_CANONICALIZATION_MISMATCH' };
    if (receipt.canonicalizationVersion !== CONTENT_RECEIPT_CANONICALIZATION_VERSION) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CANONICALIZATION_UNSUPPORTED' };
    if (receipt.surfaceCanonicalizationVersion !== CONTENT_SURFACE_CANONICALIZATION_VERSION) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SURFACE_CANONICALIZATION_UNSUPPORTED' };
    if (receipt.signature.algorithm !== 'Ed25519') return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SIGNATURE_ALGORITHM_UNSUPPORTED' };

    const issuer = this.trustedIssuers.get(receipt.signature.keyId);
    if (!issuer || issuer.issuerRuntime !== receipt.issuer.runtime || issuer.keyId !== receipt.signature.keyId) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_ISSUER_UNTRUSTED' };
    if (issuer.allowedInstanceIds && !issuer.allowedInstanceIds.includes(receipt.issuer.instanceId)) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_ISSUER_INSTANCE_UNTRUSTED' };
    if (!verifyReceiptSignature(receipt, issuer.publicKey)) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SIGNATURE_INVALID' };
    if (receipt.audience.runtime !== this.expectedAudienceRuntime) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_AUDIENCE_MISMATCH' };

    const issuedAt = Date.parse(receipt.issuedAt);
    const expiresAt = Date.parse(receipt.expiresAt);
    const now = Date.parse(this.now());
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now)) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_FRESHNESS_INVALID' };
    if (issuedAt > now) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_FUTURE' };
    if (now >= expiresAt) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_EXPIRED' };
    if (expiresAt <= issuedAt || expiresAt - issuedAt > this.maxLifetimeMs) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_LIFETIME_INVALID' };

    if (!input.expectedContext || !contextMatches(receipt, input.expectedContext)) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CONTEXT_MISMATCH' };
    if (receipt.observation.source.canonicalPath && receipt.observation.source.canonicalPath !== input.candidate.source.path) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SOURCE_PATH_MISMATCH' };
    if (!hashesEqual(receipt.observation.source.contentHash, input.candidate.source.contentHash)) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SOURCE_HASH_MISMATCH' };
    if (receipt.emittedSurfaceHash === undefined || input.preflightSurface === undefined) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SURFACE_REQUIRED' };

    let surfaceCanonical: string;
    try {
      surfaceCanonical = canonicalizeContentSurface(input.preflightSurface);
    } catch {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SURFACE_INVALID' };
    }
    if (sha256(surfaceCanonical) !== receipt.emittedSurfaceHash) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SURFACE_HASH_MISMATCH' };
    if (deriveExactSurfaceStatement(input.preflightSurface) !== input.candidate.statement) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_CANDIDATE_SURFACE_MISMATCH' };

    return normalized(receipt);
  }

  private verifyDevelopment(input: Parameters<PreflightReceiptVerifier['verify']>[0]): PreflightVerification {
    let receipt: ContentPreflightReceipt;
    try {
      receipt = parseContentPreflightReceipt(input.receipt);
    } catch {
      return { kind: 'unsupported', reasonCode: 'PREFLIGHT_RECEIPT_INVALID' };
    }
    if (receipt.observation.source.canonicalPath && receipt.observation.source.canonicalPath !== input.candidate.source.path) return { kind: 'unsupported', reasonCode: 'PREFLIGHT_SOURCE_PATH_MISMATCH' };
    return normalized(receipt);
  }
}

export function deriveExactSurfaceStatement(surface: unknown): string {
  if (typeof surface === 'string') return surface;
  if (surface && typeof surface === 'object' && typeof (surface as { text?: unknown }).text === 'string') return (surface as { text: string }).text;
  return stableJson(surface);
}

function normalized(receipt: AuthenticatedContentPreflightReceipt | ContentPreflightReceipt): Extract<PreflightVerification, { kind: 'verified' }> {
  return {
    kind: 'verified',
    receiptId: receipt.receiptId,
    receiptDigest: receiptDigest(receipt),
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
    audienceRuntime: 'audience' in receipt ? receipt.audience.runtime : undefined,
    projectId: 'context' in receipt ? receipt.context.projectId : undefined,
    purpose: 'context' in receipt ? receipt.context.purpose : undefined,
  };
}

function verifyReceiptSignature(receipt: AuthenticatedContentPreflightReceipt, publicKey: KeyObject | string | Buffer): boolean {
  try {
    const key = publicKey instanceof Object && 'type' in publicKey ? publicKey as KeyObject : createPublicKey(publicKey);
    const { signature: _signature, ...body } = receipt;
    return verifySignature(null, Buffer.from(canonicalizeContentPreflightReceiptBody(body)), key, Buffer.from(receipt.signature.value, 'base64'));
  } catch {
    return false;
  }
}

function normalizeIssuers(issuers: RuntimeContractsPreflightReceiptVerifierOptions['trustedIssuers']): ReadonlyMap<string, TrustedReceiptIssuer> {
  if (issuers && !Array.isArray(issuers)) return issuers as ReadonlyMap<string, TrustedReceiptIssuer>;
  return new Map((issuers ?? []).map((issuer: TrustedReceiptIssuer) => [issuer.keyId, issuer]));
}

function contextMatches(receipt: AuthenticatedContentPreflightReceipt, expected: ReceiptExpectedContext): boolean {
  const context = receipt.context;
  return context.projectId === expected.projectId
    && optionalEqual(context.tenantId, expected.tenantId)
    && optionalEqual(context.workspaceId, expected.workspaceId)
    && optionalEqual(context.purpose, expected.purpose)
    && (!expected.destinationRuntime || context.destination.runtime === expected.destinationRuntime)
    && optionalEqual(context.requestId, expected.requestId)
    && optionalEqual(context.correlationId, expected.correlationId);
}

function optionalEqual(actual: string | undefined, expected: string | undefined): boolean { return expected === undefined || actual === expected; }
function hashesEqual(left: string, right: string): boolean { return left.replace(/^sha256:/, '') === right.replace(/^sha256:/, ''); }

function receiptDigest(receipt: AuthenticatedContentPreflightReceipt | ContentPreflightReceipt): string {
  const material = 'signature' in receipt
    ? canonicalizeContentPreflightReceiptBody((() => { const { signature: _signature, ...body } = receipt; return body; })())
    : stableJson(receipt);
  return sha256(material);
}

function sha256(value: string): string { return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`; }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
