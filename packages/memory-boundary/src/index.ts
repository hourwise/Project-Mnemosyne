import type { MnemosyneOperationContext } from '@mnemosyne/adrasteia-adapter';
import type { AccessClassification, MemoryRecord, ProjectRecord } from '@mnemosyne/schema';

export type GovernedRecord = MemoryRecord | ProjectRecord;
export type MemoryOperation = 'read' | 'search' | 'write' | 'update' | 'export' | 'import' | 'context-pack' | 'restart-pack' | 'source-context' | 'revalidate' | 'conflict-report' | 'journal-append';

export interface TrustedSensitiveAccessEvaluator {
  allows(input: { context: MnemosyneOperationContext; operation: MemoryOperation; classification: 'sensitive'; recordId?: string; projectId?: string }): boolean;
}

/** Local classification policy: public/internal stay within project scope, restricted never leaves by default. */
export class MemoryAccessEvaluator {
  constructor(private readonly trustedSensitiveEvaluator?: TrustedSensitiveAccessEvaluator) {}

  allows(context: MnemosyneOperationContext, operation: MemoryOperation, record: GovernedRecord): boolean {
    if (context.scope.projectId !== recordProjectId(record)) return false;
    const classification = record.accessClassification ?? 'internal';
    if (classification === 'public' || classification === 'internal') return true;
    if (classification === 'restricted') return false;
    return this.trustedSensitiveEvaluator?.allows({
      context,
      operation,
      classification,
      recordId: record.id,
      projectId: recordProjectId(record),
    }) ?? false;
  }

  assertAllowed(context: MnemosyneOperationContext, operation: MemoryOperation, record: GovernedRecord): void {
    if (!this.allows(context, operation, record)) throw new Error(`MNEMOSYNE_ACCESS_DENIED:${record.accessClassification ?? 'internal'}`);
  }

  filter<T extends GovernedRecord>(context: MnemosyneOperationContext, operation: MemoryOperation, records: readonly T[]): { records: T[]; excluded: Record<AccessClassification, number> } {
    const excluded: Record<AccessClassification, number> = { public: 0, internal: 0, sensitive: 0, restricted: 0 };
    const allowed: T[] = [];
    for (const record of records) {
      if (this.allows(context, operation, record)) allowed.push(record);
      else excluded[record.accessClassification ?? 'internal'] += 1;
    }
    return { records: allowed, excluded };
  }
}

export type CredentialMaterialCategory = 'private_key' | 'authorization_header' | 'bearer_token' | 'secret_field';
export interface CredentialMaterialMatch { category: CredentialMaterialCategory; location: string; }

/**
 * Deliberately small, high-confidence defence in depth. It is not a complete DLP system
 * and must never log the detected value.
 */
export class CredentialMaterialGuard {
  inspect(value: unknown): CredentialMaterialMatch[] {
    const matches: CredentialMaterialMatch[] = [];
    visit(value, '$', matches, new Set<unknown>());
    return dedupe(matches);
  }

  assertSafe(value: unknown): void {
    const matches = this.inspect(value);
    if (matches.length > 0) throw new CredentialMaterialDetectedError(matches);
  }
}

export class CredentialMaterialDetectedError extends Error {
  readonly categories: CredentialMaterialCategory[];
  constructor(readonly matches: CredentialMaterialMatch[]) {
    super(`MNEMOSYNE_CREDENTIAL_MATERIAL_REJECTED:${matches.map((match) => match.category).join(',')}`);
    this.categories = [...new Set(matches.map((match) => match.category))];
  }
}

export function safeCredentialAuditMetadata(error: CredentialMaterialDetectedError): Record<string, unknown> {
  return { categories: error.categories, matchCount: error.matches.length };
}

function recordProjectId(record: GovernedRecord): string {
  return 'projectId' in record ? record.projectId : record.attribution?.execution.projectId ?? '';
}

function visit(value: unknown, location: string, matches: CredentialMaterialMatch[], seen: Set<unknown>): void {
  if (typeof value === 'string') {
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i.test(value)) matches.push({ category: 'private_key', location });
    if (/^\s*authorization\s*:/im.test(value) || /^\s*(?:basic|bearer)\s+[A-Za-z0-9._~+\/-]{16,}/im.test(value)) matches.push({ category: 'authorization_header', location });
    if (/\bbearer\s+[A-Za-z0-9._~+\/-]{16,}/i.test(value)) matches.push({ category: 'bearer_token', location });
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${location}[${index}]`, matches, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|private[_-]?key)/i.test(key) && typeof nested === 'string' && nested.trim().length > 0) {
      matches.push({ category: 'secret_field', location: `${location}.${key}` });
    }
    visit(nested, `${location}.${key}`, matches, seen);
  }
}

function dedupe(matches: CredentialMaterialMatch[]): CredentialMaterialMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.category}:${match.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
