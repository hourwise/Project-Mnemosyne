import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  MemoryAdmission,
  MemoryRecord,
  ProvenanceAdmissionEvent,
} from '@mnemosyne/schema';
import type {
  AdmissionHistoryStore,
  AdmissionResult,
  ConsumedReceiptEntry,
  StagedAdmission,
  StagedAdmissionSummary,
} from './admission.js';

const SCHEMA_VERSION = 1;

interface DurableAdmissionDocument {
  schemaVersion: number;
  admissions: Array<{ scope: string; result: AdmissionResult }>;
  staged: Array<{ admissionId: string; value: StagedAdmission }>;
  events: ProvenanceAdmissionEvent[];
  consumedReceipts: Array<{ replayKey: string; entry: ConsumedReceiptEntry }>;
  checksum: string;
}

export interface DurableAdmissionHistoryStoreOptions {
  filePath: string;
  now?: () => string;
  maxStagedEntries?: number;
  stagingTtlMs?: number;
  maxLockWaitMs?: number;
}

export class DurableAdmissionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DurableAdmissionStateError';
  }
}

/**
 * Atomic, checksummed local admission state. The entire admission decision,
 * staged evidence, audit sequence and receipt-consumption ledger are loaded
 * for every fresh engine instance, and mutations are serialized across Node
 * processes. This is intentionally local durability, not a distributed store.
 */
export class DurableAdmissionHistoryStore implements AdmissionHistoryStore {
  private readonly filePath: string;
  private readonly lockPath: string;
  private readonly now: () => string;
  private readonly maxStagedEntries: number;
  private readonly stagingTtlMs: number;
  private readonly maxLockWaitMs: number;
  private transactionDepth = 0;
  private state?: DurableAdmissionState;

  constructor(options: DurableAdmissionHistoryStoreOptions) {
    if (!options.filePath.trim()) throw new TypeError('durable admission filePath is required');
    this.filePath = options.filePath;
    this.lockPath = `${options.filePath}.lock`;
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxStagedEntries = options.maxStagedEntries ?? 128;
    this.stagingTtlMs = options.stagingTtlMs ?? 15 * 60 * 1000;
    this.maxLockWaitMs = options.maxLockWaitMs ?? 5_000;
    if (!Number.isSafeInteger(this.maxStagedEntries) || this.maxStagedEntries <= 0) throw new TypeError('maxStagedEntries must be a positive safe integer');
    if (!Number.isSafeInteger(this.stagingTtlMs) || this.stagingTtlMs <= 0) throw new TypeError('stagingTtlMs must be a positive safe integer');
    if (!Number.isSafeInteger(this.maxLockWaitMs) || this.maxLockWaitMs <= 0) throw new TypeError('maxLockWaitMs must be a positive safe integer');
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  transaction<T>(operation: () => T): T {
    if (this.transactionDepth > 0) return operation();
    const release = acquireLock(this.lockPath, this.maxLockWaitMs);
    this.transactionDepth = 1;
    this.state = this.readState();
    try {
      const result = operation();
      this.writeState(this.state);
      return result;
    } finally {
      this.transactionDepth = 0;
      this.state = undefined;
      release();
    }
  }

  findByIdempotency(scope: string): AdmissionResult | undefined {
    return this.current().idempotency.get(scope);
  }

  get(admissionId: string): AdmissionResult | undefined {
    return this.current().admissions.get(admissionId);
  }

  save(scope: string, result: AdmissionResult): void {
    const mutate = () => {
      validateResult(result);
      const state = this.current();
      state.admissions.set(result.admission.admissionId, clone(result));
      state.idempotency.set(scope, clone(result));
    };
    this.mutate(mutate);
  }

  stage(admissionId: string, staged: StagedAdmission): boolean {
    const mutate = () => {
      const state = this.current();
      pruneStaged(state, this.now);
      if (state.staged.size >= this.maxStagedEntries && !state.staged.has(admissionId)) return false;
      state.staged.set(admissionId, cloneStaged(staged));
      return true;
    };
    return this.mutate(mutate);
  }

  getStaged(admissionId: string): StagedAdmission | undefined {
    const state = this.current();
    pruneStaged(state, this.now);
    const value = state.staged.get(admissionId);
    return value ? cloneStaged(value) : undefined;
  }

  removeStaged(admissionId: string): void {
    this.mutate(() => { this.current().staged.delete(admissionId); });
  }

  listStaged(): StagedAdmissionSummary[] {
    const state = this.current();
    pruneStaged(state, this.now);
    return [...state.staged.values()].map(({ admission, expiresAt }) => ({
      admissionId: admission.admissionId,
      candidateId: admission.candidateId,
      state: admission.state as Exclude<StagedAdmissionSummary['state'], 'ADMITTED'>,
      attempt: admission.attempt,
      expiresAt,
      reasonCodes: [...admission.reasonCodes],
    }));
  }

  append(event: ProvenanceAdmissionEvent): void {
    this.mutate(() => { this.current().events.push(ProvenanceAdmissionEvent.parse(event)); });
  }

  listEvents(admissionId?: string): ProvenanceAdmissionEvent[] {
    return this.current().events.filter((event) => !admissionId || event.admissionId === admissionId).map(clone);
  }

  nextSequence(): number {
    return this.current().events.length + 1;
  }

  stagingExpiry(occurredAt: string): string {
    return new Date(Date.parse(occurredAt) + this.stagingTtlMs).toISOString();
  }

  getConsumedReceipt(replayKey: string): ConsumedReceiptEntry | undefined {
    const state = this.current();
    pruneReceipts(state, Date.parse(this.now()));
    const entry = state.consumedReceipts.get(replayKey);
    return entry ? { ...entry } : undefined;
  }

  consumeReceipt(replayKey: string, entry: ConsumedReceiptEntry, maxEntries: number): boolean {
    return this.mutate(() => {
      const state = this.current();
      pruneReceipts(state, Date.parse(this.now()));
      if (state.consumedReceipts.has(replayKey) || state.consumedReceipts.size >= maxEntries) return false;
      state.consumedReceipts.set(replayKey, { ...entry });
      return true;
    });
  }

  pruneConsumedReceipts(nowMs: number): void {
    this.mutate(() => pruneReceipts(this.current(), nowMs));
  }

  replayLedgerSize(nowMs: number): number {
    const state = this.current();
    pruneReceipts(state, nowMs);
    return state.consumedReceipts.size;
  }

  private current(): DurableAdmissionState {
    if (this.state) return this.state;
    return this.readState();
  }

  private mutate<T>(operation: () => T): T {
    if (this.transactionDepth > 0) return operation();
    return this.transaction(operation);
  }

  private readState(): DurableAdmissionState {
    if (!existsSync(this.filePath)) return emptyState();
    let document: unknown;
    try { document = JSON.parse(readFileSync(this.filePath, 'utf8')); }
    catch (error) { throw new DurableAdmissionStateError(`durable admission state is unreadable: ${error instanceof Error ? error.message : String(error)}`); }
    if (!isObject(document) || document.schemaVersion !== SCHEMA_VERSION || !Array.isArray(document.admissions) || !Array.isArray(document.staged) || !Array.isArray(document.events) || !Array.isArray(document.consumedReceipts) || typeof document.checksum !== 'string') {
      throw new DurableAdmissionStateError('durable admission state has an unsupported schema');
    }
    const unsigned = {
      schemaVersion: document.schemaVersion,
      admissions: document.admissions,
      staged: document.staged,
      events: document.events,
      consumedReceipts: document.consumedReceipts,
    };
    if (digest(unsigned) !== document.checksum) throw new DurableAdmissionStateError('durable admission state checksum mismatch');
    const state = emptyState();
    for (const entry of document.admissions) {
      if (!isObject(entry) || typeof entry.scope !== 'string' || state.idempotency.has(entry.scope)) throw new DurableAdmissionStateError('durable admission state contains conflicting idempotency records');
      validateResult(entry.result);
      if (state.admissions.has(entry.result.admission.admissionId)) throw new DurableAdmissionStateError('durable admission state contains conflicting admission records');
      state.idempotency.set(entry.scope, clone(entry.result));
      state.admissions.set(entry.result.admission.admissionId, clone(entry.result));
    }
    for (const entry of document.staged) {
      if (!isObject(entry) || typeof entry.admissionId !== 'string' || state.staged.has(entry.admissionId)) throw new DurableAdmissionStateError('durable admission state contains conflicting staged records');
      validateStaged(entry.value);
      state.staged.set(entry.admissionId, cloneStaged(entry.value));
    }
    const eventIds = new Set<string>();
    for (const event of document.events) {
      const parsed = ProvenanceAdmissionEvent.parse(event);
      if (eventIds.has(parsed.eventId)) throw new DurableAdmissionStateError('durable admission state contains conflicting audit events');
      eventIds.add(parsed.eventId);
      state.events.push(parsed);
    }
    for (const entry of document.consumedReceipts) {
      if (!isObject(entry) || typeof entry.replayKey !== 'string' || state.consumedReceipts.has(entry.replayKey) || !isObject(entry.entry) || typeof entry.entry.candidateContentHash !== 'string' || !Number.isFinite(entry.entry.expiresAtMs)) throw new DurableAdmissionStateError('durable admission state contains a malformed receipt ledger entry');
      state.consumedReceipts.set(entry.replayKey, { candidateContentHash: entry.entry.candidateContentHash, expiresAtMs: entry.entry.expiresAtMs });
    }
    return state;
  }

  private writeState(state: DurableAdmissionState): void {
    const unsigned = {
      schemaVersion: SCHEMA_VERSION,
      admissions: [...state.idempotency.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([scope, result]) => ({ scope, result: clone(result) })),
      staged: [...state.staged.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([admissionId, value]) => ({ admissionId, value: cloneStaged(value) })),
      events: state.events.map(clone),
      consumedReceipts: [...state.consumedReceipts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([replayKey, entry]) => ({ replayKey, entry: { ...entry } })),
    };
    const document = { ...unsigned, checksum: digest(unsigned) };
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(document), { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, this.filePath);
  }
}

interface DurableAdmissionState {
  admissions: Map<string, AdmissionResult>;
  idempotency: Map<string, AdmissionResult>;
  staged: Map<string, StagedAdmission>;
  events: ProvenanceAdmissionEvent[];
  consumedReceipts: Map<string, ConsumedReceiptEntry>;
}

function emptyState(): DurableAdmissionState {
  return { admissions: new Map(), idempotency: new Map(), staged: new Map(), events: [], consumedReceipts: new Map() };
}

function validateResult(result: unknown): asserts result is AdmissionResult {
  if (!isObject(result)) throw new DurableAdmissionStateError('durable admission result is malformed');
  MemoryAdmission.parse(result.admission);
  if (result.memory !== undefined) MemoryRecord.parse(result.memory);
  if (typeof result.replayed !== 'boolean' || typeof result.staged !== 'boolean') throw new DurableAdmissionStateError('durable admission result flags are malformed');
}

function validateStaged(staged: unknown): asserts staged is StagedAdmission {
  if (!isObject(staged) || !isObject(staged.candidate) || !isObject(staged.request) || !isObject(staged.admission) || typeof staged.expiresAt !== 'string') throw new DurableAdmissionStateError('durable staged admission is malformed');
  validateResult({ admission: staged.admission, replayed: false, staged: true });
}

function pruneStaged(state: DurableAdmissionState, now: () => string): void {
  const nowMs = Date.parse(now());
  for (const [admissionId, entry] of state.staged) if (Date.parse(entry.expiresAt) <= nowMs) state.staged.delete(admissionId);
}

function pruneReceipts(state: DurableAdmissionState, nowMs: number): void {
  for (const [key, entry] of state.consumedReceipts) if (entry.expiresAtMs <= nowMs) state.consumedReceipts.delete(key);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function cloneStaged(value: StagedAdmission): StagedAdmission {
  const request = { ...value.request };
  delete request.preflight;
  delete request.authority;
  return { candidate: clone(value.candidate), request: clone(request), admission: clone(value.admission), expiresAt: value.expiresAt };
}
function digest(value: unknown): string { return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}`; }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
function isObject(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

function acquireLock(lockPath: string, maxWaitMs: number): () => void {
  mkdirSync(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid }), { encoding: 'utf8', flag: 'wx' });
      return () => {
        try { unlinkSync(join(lockPath, 'owner.json')); } catch { /* stale lock cleanup is safe */ }
        try { rmdirSync(lockPath); } catch { /* another process recovered the lock */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let pid: number | undefined;
      try { pid = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8')).pid; } catch { /* owner is being initialized */ }
      if (pid && !isProcessAlive(pid)) {
        try { unlinkSync(join(lockPath, 'owner.json')); } catch { /* raced */ }
        try { rmdirSync(lockPath); } catch { /* raced */ }
        continue;
      }
      if (Date.now() - startedAt >= maxWaitMs) throw new DurableAdmissionStateError('timed out waiting for durable admission state lock');
      Atomics.wait(sleeper, 0, 0, 5);
    }
  }
}
function isProcessAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
