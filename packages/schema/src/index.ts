import { z } from 'zod';

export const ISODateTime = z.string().datetime({ offset: true });
export const NonEmptyString = z.string().trim().min(1);
export const EntityId = z.string().regex(/^[a-z][a-z0-9_]*_[a-z0-9][a-z0-9_-]*$/);
export const Locator = z.string().regex(/^[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+(?:\.[0-9]{3,})$/);
export const ContentHash = z.string().regex(/^sha256:[a-fA-F0-9]{64}$/);
export const RelativeSourcePath = z
  .string()
  .trim()
  .min(1)
  .refine((path) => !/^[a-zA-Z]:[\\/]/.test(path), 'path must not be a Windows absolute path')
  .refine((path) => !path.startsWith('/'), 'path must not be an absolute path')
  .refine((path) => !path.split(/[\\/]+/).includes('..'), 'path must not contain parent traversal');

export const MemoryKind = z.enum([
  'law',
  'policy',
  'decision',
  'fact',
  'constraint',
  'task',
  'hypothesis',
  'warning',
  'risk',
  'deprecated',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryStatus = z.enum([
  'active',
  'tentative',
  'stale',
  'contradicted',
  'superseded',
  'quarantined',
  'rejected',
]);
export type MemoryStatus = z.infer<typeof MemoryStatus>;

export const Importance = z.enum(['low', 'medium', 'high', 'critical']);
export type Importance = z.infer<typeof Importance>;

export const SourceType = z.enum([
  'law',
  'adr',
  'readme',
  'code',
  'test',
  'user_instruction',
  'conversation',
  'model_inference',
  'speculation',
]);
export type SourceType = z.infer<typeof SourceType>;

export const SourceReference = z.object({
  artifactId: EntityId,
  path: RelativeSourcePath,
  heading: NonEmptyString.optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  contentHash: ContentHash,
  sourceType: SourceType,
}).superRefine((source, ctx) => {
  if (source.lineEnd !== undefined && source.lineStart === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lineEnd'],
      message: 'lineEnd requires lineStart',
    });
  }

  if (
    source.lineStart !== undefined &&
    source.lineEnd !== undefined &&
    source.lineEnd < source.lineStart
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lineEnd'],
      message: 'lineEnd must be greater than or equal to lineStart',
    });
  }
});
export type SourceReference = z.infer<typeof SourceReference>;

export const MemoryRecord = z.object({
  id: EntityId,
  kind: MemoryKind,
  statement: NonEmptyString,
  reliability: z.number().min(0).max(1),
  importance: Importance,
  status: MemoryStatus,
  source: SourceReference,
  locator: Locator,
  createdAt: ISODateTime,
  lastVerifiedAt: ISODateTime.optional(),
  supersedes: z.array(EntityId).default([]),
  supersededBy: EntityId.optional(),
  tags: z.array(NonEmptyString).default([]),
}).superRefine((memory, ctx) => {
  if (memory.lastVerifiedAt && memory.lastVerifiedAt < memory.createdAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lastVerifiedAt'],
      message: 'lastVerifiedAt must not be earlier than createdAt',
    });
  }

  if (memory.supersededBy && memory.status !== 'superseded') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['supersededBy'],
      message: 'supersededBy requires superseded status',
    });
  }
});
export type MemoryRecord = z.infer<typeof MemoryRecord>;

/** Record kinds stored in the portable, human-readable project vault. */
export const ProjectRecordKind = z.enum([
  'fact',
  'decision',
  'requirement',
  'constraint',
  'hypothesis',
  'task-state',
  'generated-output',
  'external-reference',
  'observation',
  'conflict',
]);
export type ProjectRecordKind = z.infer<typeof ProjectRecordKind>;

/** Prevents temporary work and advisory experience from silently becoming project truth. */
export const ProjectRecordScope = z.enum(['project_truth', 'task_state', 'agent_performance']);
export type ProjectRecordScope = z.infer<typeof ProjectRecordScope>;

export const AccessClassification = z.enum(['public', 'internal', 'sensitive', 'restricted']);
export type AccessClassification = z.infer<typeof AccessClassification>;

export const ProjectRecordStatus = z.enum([
  'active',
  'tentative',
  'stale',
  'contradicted',
  'superseded',
  'archived',
]);
export type ProjectRecordStatus = z.infer<typeof ProjectRecordStatus>;

export const ProjectRecord = z
  .object({
    id: EntityId,
    projectId: EntityId,
    kind: ProjectRecordKind,
    scope: ProjectRecordScope,
    content: NonEmptyString,
    sources: z.array(SourceReference).min(1),
    evidence: z.array(SourceReference).default([]),
    createdAt: ISODateTime,
    lastVerifiedAt: ISODateTime.optional(),
    reliability: z.number().min(0).max(1),
    status: ProjectRecordStatus.default('active'),
    owner: NonEmptyString.optional(),
    validFrom: ISODateTime.optional(),
    validUntil: ISODateTime.optional(),
    supersedes: z.array(EntityId).default([]),
    supersededBy: EntityId.optional(),
    contradicts: z.array(EntityId).default([]),
    accessClassification: AccessClassification.default('internal'),
    tags: z.array(NonEmptyString).default([]),
  })
  .superRefine((record, ctx) => {
    if (record.kind === 'task-state' && record.scope !== 'task_state') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'task-state records must use task_state scope',
      });
    }
    if (record.scope === 'task_state' && record.kind !== 'task-state') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kind'],
        message: 'task_state scope may contain only task-state records',
      });
    }
    if (record.scope === 'agent_performance' && record.kind !== 'observation') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kind'],
        message: 'agent_performance scope may contain only observation records',
      });
    }
    if (record.lastVerifiedAt && record.lastVerifiedAt < record.createdAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lastVerifiedAt'],
        message: 'lastVerifiedAt must not be earlier than createdAt',
      });
    }
    if (record.validFrom && record.validUntil && record.validUntil < record.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'validUntil must not be earlier than validFrom',
      });
    }
    if (record.supersededBy && record.status !== 'superseded') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supersededBy'],
        message: 'supersededBy requires superseded status',
      });
    }
  });
export type ProjectRecord = z.infer<typeof ProjectRecord>;

export const ProjectVaultManifest = z.object({
  projectId: EntityId,
  name: NonEmptyString,
  schemaVersion: z.literal('1.0'),
  createdAt: ISODateTime,
  updatedAt: ISODateTime,
});
export type ProjectVaultManifest = z.infer<typeof ProjectVaultManifest>;

export const ProjectVaultIndexEntry = z.object({
  id: EntityId,
  kind: ProjectRecordKind,
  scope: ProjectRecordScope,
  path: RelativeSourcePath,
  updatedAt: ISODateTime,
});
export type ProjectVaultIndexEntry = z.infer<typeof ProjectVaultIndexEntry>;

export const ProjectVaultIndex = z.object({
  projectId: EntityId,
  schemaVersion: z.literal('1.0'),
  generatedAt: ISODateTime,
  records: z.array(ProjectVaultIndexEntry).default([]),
}).superRefine((index, ctx) => {
  const ids = new Set<string>();
  for (const [position, entry] of index.records.entries()) {
    if (ids.has(entry.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['records', position, 'id'],
        message: 'vault index record IDs must be unique',
      });
    }
    ids.add(entry.id);
  }
});
export type ProjectVaultIndex = z.infer<typeof ProjectVaultIndex>;

export const ProjectVaultExport = z.object({
  manifest: ProjectVaultManifest,
  records: z.array(ProjectRecord),
});
export type ProjectVaultExport = z.infer<typeof ProjectVaultExport>;

export const ConflictType = z.enum([
  'user_vs_law',
  'user_vs_policy',
  'instruction_vs_decision',
  'readme_vs_adr',
  'memory_vs_code',
  'source_hash_changed',
  'active_memory_source_missing',
  'active_memory_untrusted_source',
  'active_memory_contradicted_evidence',
  'active_memory_superseded_evidence',
  'other',
]);
export type ConflictType = z.infer<typeof ConflictType>;

export const ConflictRecord = z.object({
  id: EntityId,
  type: ConflictType,
  description: NonEmptyString,
  memoryIds: z.array(EntityId).default([]),
  sources: z.array(SourceReference).default([]),
  recommendedResolution: NonEmptyString,
  shouldAnankeContinue: z.boolean().default(false),
  createdAt: ISODateTime,
});
export type ConflictRecord = z.infer<typeof ConflictRecord>;

export const SourceSnippet = z.object({
  source: SourceReference,
  text: NonEmptyString,
});
export type SourceSnippet = z.infer<typeof SourceSnippet>;

export const ContextPack = z.object({
  task: NonEmptyString,
  relevantMemories: z.array(MemoryRecord),
  sourceSnippets: z.array(SourceSnippet).default([]),
  conflicts: z.array(ConflictRecord).default([]),
  warnings: z.array(NonEmptyString).default([]),
  openQuestions: z.array(NonEmptyString).default([]),
  tokenEstimate: z.number().int().nonnegative(),
}).superRefine((contextPack, ctx) => {
  const memorySourceKeys = new Set(
    contextPack.relevantMemories.map((memory) => `${memory.source.artifactId}:${memory.source.path}`),
  );

  for (const [index, snippet] of contextPack.sourceSnippets.entries()) {
    const key = `${snippet.source.artifactId}:${snippet.source.path}`;
    if (!memorySourceKeys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceSnippets', index],
        message: 'source snippet must correspond to a relevant memory source',
      });
    }
  }
});
export type ContextPack = z.infer<typeof ContextPack>;

export const AuditEventType = z.enum([
  'ALMANAC_CREATED',
  'PROJECT_ONBOARDED',
  'MEMORY_CREATED',
  'MEMORY_UPDATED',
  'MEMORY_SUPERSEDED',
  'MEMORY_CONTRADICTED',
  'MEMORY_REVALIDATED',
  'MEMORY_DECAYED',
  'SOURCE_HASH_CHANGED',
  'CONTEXT_PACK_CREATED',
  'CONFLICT_DETECTED',
  'JOURNAL_APPENDED',
  'ANANKE_NOTIFICATION_SENT',
  'ANANKE_NOTIFICATION_FAILED',
  'PATH_ESCAPE_DENIED',
  'SESSION_STARTED',
  'SESSION_ENDED',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

export const AuditEvent = z.object({
  id: EntityId,
  timestamp: ISODateTime,
  eventType: AuditEventType,
  memoryId: EntityId.optional(),
  locator: z.string().optional(),
  path: RelativeSourcePath.optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const ProjectGraphRelationship = z.enum([
  'defines',
  'implements',
  'tests',
  'supersedes',
  'depends_on',
  'contradicts',
  'mentions',
  'governs',
  'requires_approval',
]);
export type ProjectGraphRelationship = z.infer<typeof ProjectGraphRelationship>;

export const ProjectGraphEdge = z.object({
  from: NonEmptyString,
  to: NonEmptyString,
  relationship: ProjectGraphRelationship,
  source: SourceReference.optional(),
});
export type ProjectGraphEdge = z.infer<typeof ProjectGraphEdge>;

export const ResultError = z.object({
  code: NonEmptyString,
  message: NonEmptyString,
  metadata: z.record(z.unknown()).default({}),
});
export type ResultError = z.infer<typeof ResultError>;

export const ResultEnvelope = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: valueSchema }),
    z.object({ ok: z.literal(false), error: ResultError }),
  ]);

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E = Error>(error: E): Result<never, E> => ({ ok: false, error });
