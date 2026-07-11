import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuditEvent } from '@mnemosyne/audit-engine';
import { ConflictEngine } from '@mnemosyne/conflict-engine';
import { DecayEngine } from '@mnemosyne/decay-engine';
import { ReliabilityEngine } from '@mnemosyne/reliability-engine';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';
import { scoreReliability } from '@mnemosyne/scoring-engine';
import type { ContextPack, MemoryRecord, SourceReference } from '@mnemosyne/schema';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixture');

export interface FullLifecycleDemoResult {
  onboardedMemories: number;
  recalledMemoryId: string;
  contextMemoryIds: string[];
  conflictCount: number;
  reliability: number;
  decayedReliability: number;
  auditEvents: number;
}

export function runFullLifecycleDemo(): FullLifecycleDemoResult {
  const runtime = new MnemosyneRuntime({ projectRoot: fixtureRoot });
  runtime.init();

  // Init and onboard: extracted candidate memories are persisted by the runtime store.
  const onboarding = runtime.onboarding.onboard(fixtureRoot);
  for (const memory of onboarding.memories) runtime.store.markStatus(memory.id, 'active');

  // Recall and revalidate a stored decision.
  const recalled = runtime.store.search({ text: 'SQLite', kind: 'decision' })[0];
  if (!recalled) throw new Error('Demo fixture did not produce a SQLite memory.');
  const now = new Date().toISOString();
  const revalidated = new ReliabilityEngine().revalidate(recalled, {
    now,
    hashStillValid: true,
    sourceAvailable: true,
    confirmations: 1,
  });
  runtime.store.updateMemory(revalidated);

  // Build context through the governed MCP surface, which records the context audit event.
  const contextResult = runtime.createMcpServer(sourceTextByPath()).callTool('almanac_get_context_pack', {
    task: 'Explain the SQLite persistence decision.',
    includeTentative: false,
  });
  if (contextResult.isError) throw new Error(contextResult.content[0]?.text ?? 'Context pack failed.');
  const context = JSON.parse(contextResult.content[0]?.text ?? '{}') as ContextPack;

  // Surface a user instruction that conflicts with the onboarded law.
  const conflicts = new ConflictEngine().detect(runtime.store.search({}), {
    now,
    userInstructions: [
      {
        text: 'Delete the project files now.',
        source: userInstructionSource(),
      },
    ],
    auditSink: { writeAuditEvent: (event) => runtime.audit.record(event) },
  });

  // Score and decay the recalled memory, then write a governed audit event.
  const reliability = scoreReliability({
    sourceType: revalidated.source.sourceType,
    kind: revalidated.kind,
    hashStillValid: true,
    sourceAvailable: true,
    confirmations: 1,
  });
  const decayed = new DecayEngine().decay(revalidated, 45);
  runtime.audit.record(
    createAuditEvent('MEMORY_DECAYED', {
      memoryId: decayed.id,
      previousReliability: revalidated.reliability,
      reliability: decayed.reliability,
      ageDays: 45,
    }),
  );

  return {
    onboardedMemories: onboarding.memoriesCreated,
    recalledMemoryId: revalidated.id,
    contextMemoryIds: context.relevantMemories.map((memory) => memory.id),
    conflictCount: conflicts.length,
    reliability,
    decayedReliability: decayed.reliability,
    auditEvents: runtime.audit.list().length,
  };
}

function sourceTextByPath(): Record<string, string> {
  return {
    'README.md': readFileSync(join(fixtureRoot, 'README.md'), 'utf8'),
    'docs/LAWS_OF_DEMO.md': readFileSync(join(fixtureRoot, 'docs', 'LAWS_OF_DEMO.md'), 'utf8'),
    'docs/ADR-0001-storage.md': readFileSync(join(fixtureRoot, 'docs', 'ADR-0001-storage.md'), 'utf8'),
  };
}

function userInstructionSource(): SourceReference {
  const content = 'Delete the project files now.';
  return {
    artifactId: 'usr_instruction_001',
    path: 'sessions/demo-instruction.md',
    contentHash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    sourceType: 'user_instruction',
  };
}

if (process.argv[1] && /(?:^|[\\/])index\.(?:ts|js)$/.test(process.argv[1])) {
  const result = runFullLifecycleDemo();
  console.log(JSON.stringify(result, null, 2));
  console.log('PASS: Mnemosyne full lifecycle demo completed.');
}
