import { createHash } from 'node:crypto';
import {
  MemoryAdmission,
  MemoryRecord,
  ProvenanceAdmissionEvent,
  type AdmissionState,
  type MemoryKind,
  type MemoryRecord as MemoryRecordModel,
  type ProvenanceActor,
} from '@mnemosyne/schema';
import { MemoryIngestEngine, type CandidateMemory } from './index.js';

export const CANDIDATE_CANONICALIZATION_VERSION = 'mnemosyne-exact-surface-v1';

export type PreflightVerification =
  | {
      kind: 'verified';
      receiptId: string;
      receiptDigest?: string;
      observationId: string;
      decisionId: string;
      contractVersion: string;
      implementationVersion?: string;
      ruleSetVersion: string;
      policyProfileId?: string;
      outcome: 'PASS' | 'PASS_WITH_FLAGS' | 'DERIVED_ONLY' | 'QUARANTINED' | 'UNSUPPORTED' | 'RESOURCE_LIMIT_EXCEEDED' | 'INSPECTION_FAILED';
      exposureLevel: 'NONE' | 'DERIVED_ONLY' | 'SANITIZED_METADATA' | 'SELECTED_CONTENT' | 'FULL_CONTENT';
      sourceContentHash: string;
      emittedSurfaceHash?: string;
      truncated: boolean;
      audienceRuntime?: string;
      projectId?: string;
      tenantId?: string;
      workspaceId?: string;
      purpose?: string;
      requestId?: string;
      correlationId?: string;
      expiresAt?: string;
    }
  | { kind: 'unavailable'; reasonCode: string }
  | { kind: 'unsupported'; reasonCode: string };

/** Mnemosyne consumes normalized evidence and does not reimplement Ananke/scanner contracts. */
export interface PreflightReceiptVerifier {
  readonly securityMode?: 'AUTHENTICATED' | 'LEGACY';
  readonly trustRegistryConfigured?: boolean;
  verify(input: {
    receipt: unknown;
    candidate: MemoryRecordModel;
    candidateContentHash: string;
    canonicalizationVersion: string;
    preflightSurface?: unknown;
    expectedContext?: {
      projectId: string;
      tenantId?: string;
      workspaceId?: string;
      purpose?: string;
      destinationRuntime?: string;
      requestId?: string;
      correlationId?: string;
    };
  }): PreflightVerification;
}

export type AuthorityVerification =
  | { kind: 'allowed'; decisionId?: string; policyVersion?: string }
  | { kind: 'denied'; reasonCode: string; decisionId?: string; policyVersion?: string }
  | { kind: 'deferred'; reasonCode: string; decisionId?: string; policyVersion?: string }
  | { kind: 'failed'; reasonCode: string; retryable: boolean; decisionId?: string; policyVersion?: string };

export interface AdmissionAuthority {
  evaluate(input: {
    candidate: MemoryRecordModel;
    candidateContentHash: string;
    preflight: Extract<PreflightVerification, { kind: 'verified' }>;
    projectId: string;
    trustDomain: string;
  }): AuthorityVerification;
  /** Strict revalidation must be explicitly governed; it is not a write bypass. */
  evaluateRevalidation?(input: {
    memory: MemoryRecordModel;
    projectId: string;
    tenantId?: string;
    workspaceId?: string;
    purpose: string;
    requestId: string;
    correlationId: string;
    supersededBy?: string;
    currentSourceHash?: string;
    sourceAvailable?: boolean;
    contradictions?: number;
  }): AuthorityVerification;
}

export interface AdmissionRequest {
  ingestionOperation: string;
  ingestionPath?: string;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  projectId: string;
  vaultId?: string;
  trustDomain: string;
  tenantId?: string;
  workspaceId?: string;
  requestId?: string;
  purpose?: string;
  actor: ProvenanceActor;
  receipt?: unknown;
  preflightSurface?: unknown;
  preflight?: PreflightReceiptVerifier;
  authority?: AdmissionAuthority;
  expectedContext?: {
    projectId: string;
    tenantId?: string;
    workspaceId?: string;
    purpose?: string;
    destinationRuntime?: string;
    requestId?: string;
    correlationId?: string;
  };
}

export interface AdmissionResult {
  admission: MemoryAdmission;
  memory?: MemoryRecordModel;
  replayed: boolean;
  staged: boolean;
}

export interface StagedAdmissionSummary {
  admissionId: string;
  candidateId: string;
  state: Exclude<AdmissionState, 'ADMITTED'>;
  attempt: number;
  expiresAt: string;
  reasonCodes: string[];
}

interface StagedAdmission {
  candidate: CandidateMemory;
  request: AdmissionRequest;
  admission: MemoryAdmission;
  expiresAt: string;
}

export interface AdmissionHistoryStoreOptions {
  now?: () => string;
  maxStagedEntries?: number;
  stagingTtlMs?: number;
}

/**
 * Bounded, isolated admission history. Staged candidates never enter the
 * AlmanacStore and therefore cannot be returned by retrieval or context APIs.
 */
export class InMemoryAdmissionHistoryStore {
  private readonly now: () => string;
  private readonly maxStagedEntries: number;
  private readonly stagingTtlMs: number;
  private readonly admissions = new Map<string, AdmissionResult>();
  private readonly idempotency = new Map<string, AdmissionResult>();
  private readonly staged = new Map<string, StagedAdmission>();
  private readonly events: ProvenanceAdmissionEvent[] = [];

  constructor(options: AdmissionHistoryStoreOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxStagedEntries = options.maxStagedEntries ?? 128;
    this.stagingTtlMs = options.stagingTtlMs ?? 15 * 60 * 1000;
  }

  findByIdempotency(scope: string): AdmissionResult | undefined {
    return this.idempotency.get(scope);
  }

  get(admissionId: string): AdmissionResult | undefined {
    return this.admissions.get(admissionId);
  }

  save(scope: string, result: AdmissionResult): void {
    this.admissions.set(result.admission.admissionId, result);
    this.idempotency.set(scope, result);
  }

  stage(admissionId: string, staged: StagedAdmission): boolean {
    this.pruneExpired();
    if (this.staged.size >= this.maxStagedEntries && !this.staged.has(admissionId)) return false;
    this.staged.set(admissionId, staged);
    return true;
  }

  getStaged(admissionId: string): StagedAdmission | undefined {
    this.pruneExpired();
    return this.staged.get(admissionId);
  }

  removeStaged(admissionId: string): void {
    this.staged.delete(admissionId);
  }

  listStaged(): StagedAdmissionSummary[] {
    this.pruneExpired();
    return [...this.staged.values()].map(({ admission, expiresAt }) => ({
      admissionId: admission.admissionId,
      candidateId: admission.candidateId,
      state: admission.state as Exclude<AdmissionState, 'ADMITTED'>,
      attempt: admission.attempt,
      expiresAt,
      reasonCodes: [...admission.reasonCodes],
    }));
  }

  append(event: ProvenanceAdmissionEvent): void {
    this.events.push(ProvenanceAdmissionEvent.parse(event));
  }

  listEvents(admissionId?: string): ProvenanceAdmissionEvent[] {
    return this.events.filter((event) => !admissionId || event.admissionId === admissionId);
  }

  nextSequence(): number {
    return this.events.length + 1;
  }

  stagingExpiry(occurredAt: string): string {
    return new Date(Date.parse(occurredAt) + this.stagingTtlMs).toISOString();
  }

  private pruneExpired(): void {
    const now = Date.parse(this.now());
    for (const [admissionId, entry] of this.staged) {
      if (Date.parse(entry.expiresAt) <= now) this.staged.delete(admissionId);
    }
  }
}

export interface ProvenanceAdmissionEngineOptions {
  now?: () => string;
  history?: InMemoryAdmissionHistoryStore;
  ingest?: MemoryIngestEngine;
  maxConsumedReceipts?: number;
  replayEntryTtlMs?: number;
}

interface ConsumedReceiptEntry {
  candidateContentHash: string;
  expiresAtMs: number;
}

/** Receipt-gated persistence admission with deterministic identity and retry semantics. */
export class ProvenanceAdmissionEngine {
  readonly history: InMemoryAdmissionHistoryStore;
  private readonly now: () => string;
  private readonly ingestEngine: MemoryIngestEngine;
  /** Bounded single-process replay ledger; durable multi-process replay is not claimed. */
  private readonly consumedReceipts = new Map<string, ConsumedReceiptEntry>();
  private readonly maxConsumedReceipts: number;
  private readonly replayEntryTtlMs: number;

  constructor(options: ProvenanceAdmissionEngineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.history = options.history ?? new InMemoryAdmissionHistoryStore({ now: this.now });
    this.ingestEngine = options.ingest ?? new MemoryIngestEngine({ now: this.now });
    this.maxConsumedReceipts = options.maxConsumedReceipts ?? 4096;
    this.replayEntryTtlMs = options.replayEntryTtlMs ?? 5 * 60 * 1000;
    if (!Number.isSafeInteger(this.maxConsumedReceipts) || this.maxConsumedReceipts <= 0) throw new TypeError('maxConsumedReceipts must be a positive safe integer');
    if (!Number.isSafeInteger(this.replayEntryTtlMs) || this.replayEntryTtlMs <= 0) throw new TypeError('replayEntryTtlMs must be a positive safe integer');
  }

  get replayLedgerSize(): number {
    this.pruneConsumedReceipts();
    return this.consumedReceipts.size;
  }

  admit(candidate: CandidateMemory, request: AdmissionRequest): AdmissionResult {
    const identity = buildCandidateIdentity(candidate, request);
    const scope = idempotencyScope(request);
    const existing = this.history.findByIdempotency(scope);
    if (existing) return { ...existing, replayed: true };

    const admissionId = `admission_${identity.candidateId.slice('candidate_'.length)}_${shortHash(request.idempotencyKey)}`;
    return this.evaluate(candidate, request, identity, admissionId, 1);
  }

  retry(admissionId: string, overrides: Pick<AdmissionRequest, 'receipt' | 'preflight' | 'authority'>): AdmissionResult {
    const staged = this.history.getStaged(admissionId);
    if (!staged) throw new Error(`ADMISSION_NOT_STAGED:${admissionId}`);
    const request = { ...staged.request, ...overrides, idempotencyKey: `${staged.request.idempotencyKey}:attempt:${staged.admission.attempt + 1}` };
    const identity = buildCandidateIdentity(staged.candidate, request);
    if (identity.candidateId !== staged.admission.candidateId) throw new Error('ADMISSION_CANDIDATE_ID_CHANGED');
    return this.evaluate(staged.candidate, request, identity, admissionId, staged.admission.attempt + 1, staged.admission.state, staged.admission.admissionId);
  }

  private evaluate(
    candidate: CandidateMemory,
    request: AdmissionRequest,
    identity: CandidateIdentity,
    admissionId: string,
    attempt: number,
    previousState?: AdmissionState,
    revalidationOf?: string,
  ): AdmissionResult {
    const memory = this.ingestEngine.ingest(candidate);
    const base = {
      admissionVersion: '1.0' as const,
      admissionId,
      candidateId: identity.candidateId,
      attempt,
      idempotencyKey: request.idempotencyKey,
      projectId: request.projectId,
      vaultId: request.vaultId,
      trustDomain: request.trustDomain,
      candidateContentHash: identity.candidateContentHash,
      sourceIdentitySetHash: identity.sourceIdentitySetHash,
      canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION,
    };

    const preflight = request.preflight && request.receipt !== undefined
      ? request.preflight.verify({ receipt: request.receipt, candidate: memory, candidateContentHash: identity.candidateContentHash, canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION, preflightSurface: request.preflightSurface, expectedContext: request.expectedContext ?? { projectId: request.projectId, tenantId: request.tenantId, workspaceId: request.workspaceId, purpose: request.purpose, requestId: request.requestId, correlationId: request.correlationId } })
      : { kind: 'unavailable' as const, reasonCode: 'PREFLIGHT_REQUIRED' };

    let state: AdmissionState = 'DEFERRED';
    let reasonCodes: string[] = [];
    let preflightReference: MemoryAdmission['preflight'];
    let authorityReference: MemoryAdmission['authority'];
    let finalMemory: MemoryRecordModel | undefined;

    if (preflight.kind === 'unavailable') {
      reasonCodes = [preflight.reasonCode];
    } else if (preflight.kind === 'unsupported') {
      state = 'QUARANTINED';
      reasonCodes = [preflight.reasonCode];
    } else if (!hashesEqual(preflight.sourceContentHash, identity.primarySourceContentHash)) {
      state = 'QUARANTINED';
      reasonCodes = ['PREFLIGHT_SOURCE_HASH_MISMATCH'];
    } else if (!['PASS', 'PASS_WITH_FLAGS'].includes(preflight.outcome)) {
      state = 'QUARANTINED';
      reasonCodes = [`PREFLIGHT_${preflight.outcome}`];
    } else if (preflight.exposureLevel === 'NONE' || preflight.exposureLevel === 'DERIVED_ONLY') {
      state = 'QUARANTINED';
      reasonCodes = ['PREFLIGHT_EXPOSURE_INSUFFICIENT'];
    } else {
      preflightReference = {
        receiptId: preflight.receiptId,
        observationId: preflight.observationId,
        decisionId: preflight.decisionId,
        contractVersion: preflight.contractVersion,
        implementationVersion: preflight.implementationVersion,
        ruleSetVersion: preflight.ruleSetVersion,
        policyProfileId: preflight.policyProfileId,
      };
      const replayKey = `${request.projectId}\u0000${request.trustDomain}\u0000${preflight.audienceRuntime ?? 'mnemosyne'}\u0000${preflight.receiptDigest ?? preflight.receiptId}`;
      this.pruneConsumedReceipts();
      const consumed = this.consumedReceipts.get(replayKey);
      const ledgerFull = !consumed && this.consumedReceipts.size >= this.maxConsumedReceipts;
      if (consumed) {
        state = 'REJECTED';
        reasonCodes = ['PREFLIGHT_RECEIPT_REPLAYED'];
      } else if (ledgerFull) {
        state = 'DEFERRED';
        reasonCodes = ['PREFLIGHT_REPLAY_LEDGER_FULL'];
      }
      const authority = consumed
        ? { kind: 'denied' as const, reasonCode: 'PREFLIGHT_RECEIPT_REPLAYED' }
        : ledgerFull
          ? { kind: 'deferred' as const, reasonCode: 'PREFLIGHT_REPLAY_LEDGER_FULL' }
        : request.authority
          ? request.authority.evaluate({ candidate: memory, candidateContentHash: identity.candidateContentHash, preflight, projectId: request.projectId, trustDomain: request.trustDomain })
          : { kind: 'deferred' as const, reasonCode: 'ADMISSION_AUTHORITY_REQUIRED' };
      authorityReference = { decisionId: authority.decisionId, policyVersion: authority.policyVersion, outcome: authority.kind };
      if (consumed || ledgerFull) {
        // The receipt cannot be used again, even for the same content under a
        // different idempotency key. Same-request retries return above from
        // the idempotency index before reaching this ledger.
      } else if (authority.kind === 'denied') {
        state = 'REJECTED';
        reasonCodes = [authority.reasonCode];
      } else if (authority.kind === 'deferred' || (authority.kind === 'failed' && authority.retryable)) {
        state = 'DEFERRED';
        reasonCodes = [authority.reasonCode];
      } else if (authority.kind === 'failed') {
        state = 'REJECTED';
        reasonCodes = [authority.reasonCode];
      } else {
        state = 'ADMITTED';
        reasonCodes = preflight.outcome === 'PASS_WITH_FLAGS' ? ['PREFLIGHT_PASS_WITH_FLAGS'] : ['PREFLIGHT_PASS'];
        finalMemory = MemoryRecord.parse({ ...memory, admission: { ...base, state, reasonCodes, preflight: preflightReference, authority: authorityReference, occurredAt: this.now() } });
        this.consumedReceipts.set(replayKey, {
          candidateContentHash: identity.candidateContentHash,
          expiresAtMs: this.replayExpiry(preflight.expiresAt),
        });
      }
    }

    const admission = MemoryAdmission.parse({ ...base, state, reasonCodes, preflight: preflightReference, authority: authorityReference, occurredAt: this.now() });
    const result: AdmissionResult = { admission, memory: finalMemory, replayed: false, staged: state !== 'ADMITTED' };
    this.history.save(idempotencyScope(request), result);
    if (state === 'ADMITTED') {
      this.history.removeStaged(admissionId);
    } else {
      const expiresAt = this.history.stagingExpiry(admission.occurredAt);
      this.history.stage(admissionId, { candidate, request, admission, expiresAt });
    }
    this.history.append(this.auditEvent(candidate, request, identity, admission, previousState, revalidationOf));
    return result;
  }

  private replayExpiry(expiresAt: string | undefined): number {
    const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Date.parse(this.now()) + this.replayEntryTtlMs;
  }

  private pruneConsumedReceipts(): void {
    const now = Date.parse(this.now());
    for (const [key, entry] of this.consumedReceipts) {
      if (entry.expiresAtMs <= now) this.consumedReceipts.delete(key);
    }
  }

  private auditEvent(candidate: CandidateMemory, request: AdmissionRequest, identity: CandidateIdentity, admission: MemoryAdmission, previousState?: AdmissionState, revalidationOf?: string): ProvenanceAdmissionEvent {
    return ProvenanceAdmissionEvent.parse({
      eventId: `admission_event_${identity.candidateId.slice('candidate_'.length)}_${admission.attempt}`,
      admissionId: admission.admissionId,
      attempt: admission.attempt,
      ingestionOperation: request.ingestionOperation,
      ingestionPath: request.ingestionPath ?? 'memory-ingest-engine',
      correlationId: request.correlationId,
      causationId: request.causationId,
      idempotencyKey: request.idempotencyKey,
      projectId: request.projectId,
      vaultId: request.vaultId,
      trustDomain: request.trustDomain,
      memoryId: candidate.id,
      candidateId: admission.candidateId,
      actor: request.actor,
      sourceIds: (candidate.sources ?? [candidate.source]).map((source) => `${source.artifactId}:${source.path}:${source.contentHash}`),
      sourceIdentitySetHash: admission.sourceIdentitySetHash,
      candidateContentHash: admission.candidateContentHash,
      canonicalizationVersion: admission.canonicalizationVersion,
      previousState,
      state: admission.state,
      reasonCodes: admission.reasonCodes,
      authority: admission.authority,
      preflight: admission.preflight,
      schemaVersion: '1.0',
      occurredAt: admission.occurredAt,
      sequence: this.history.nextSequence(),
      parentEventId: previousState ? this.history.listEvents(admission.admissionId).at(-1)?.eventId : undefined,
      revalidationOf,
    });
  }
}

interface CandidateIdentity {
  candidateId: string;
  candidateContentHash: string;
  sourceIdentitySetHash: string;
  primarySourceContentHash: string;
}

function buildCandidateIdentity(candidate: CandidateMemory, request: AdmissionRequest): CandidateIdentity {
  const sources = [candidate.source, ...(candidate.sources ?? [])]
    .map((source) => ({ artifactId: source.artifactId, path: source.path, contentHash: source.contentHash, sourceType: source.sourceType }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const sourceIdentitySetHash = sha256(stableJson(sources));
  const canonical = {
    canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION,
    projectId: request.projectId,
    vaultId: request.vaultId ?? null,
    trustDomain: request.trustDomain,
    kind: candidate.kind,
    statement: candidate.statement,
    importance: candidate.importance,
    locator: candidate.locator,
    tags: [...(candidate.tags ?? [])].sort(),
    sources,
  };
  const candidateContentHash = sha256(stableJson(canonical));
  return {
    candidateId: `candidate_${candidateContentHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
    candidateContentHash,
    sourceIdentitySetHash,
    primarySourceContentHash: candidate.source.contentHash,
  };
}

function idempotencyScope(request: AdmissionRequest): string {
  return `${request.projectId}\u0000${request.trustDomain}\u0000${request.idempotencyKey}`;
}

function shortHash(value: string): string {
  return sha256(value).slice('sha256:'.length, 'sha256:'.length + 12);
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function hashesEqual(left: string, right: string): boolean {
  return left.replace(/^sha256:/, '') === right.replace(/^sha256:/, '');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
