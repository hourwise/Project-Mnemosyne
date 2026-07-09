import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { InMemoryAuditStore } from '@mnemosyne/audit-engine';
import { InMemoryAlmanacStore } from '@mnemosyne/almanac-store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnboardingEngine } from './index.js';

describe('OnboardingEngine', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'mnemosyne-onboard-'));
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    mkdirSync(join(projectRoot, 'tests'), { recursive: true });
    mkdirSync(join(projectRoot, '.project-ananke', 'almanac'), { recursive: true });
    mkdirSync(join(projectRoot, 'node_modules', 'ignored'), { recursive: true });

    writeFileSync(
      join(projectRoot, 'docs', 'LAWS_OF_MNEMOSYNE.md'),
      [
        '# The Laws Of Mnemosyne',
        '',
        '## Law I - Provenance',
        '',
        'No trusted memory without provenance.',
        '',
        '## Law II - Reliability',
        '',
        'Memory is not authority. Trust must be earned.',
      ].join('\n'),
    );

    writeFileSync(
      join(projectRoot, 'docs', 'ADR-0001-ALMANAC-STORE.md'),
      [
        '# ADR-0001 Almanac Store',
        '',
        'Decision: Use SQLite for local Almanac persistence.',
        '',
        'The store must preserve source references.',
      ].join('\n'),
    );

    writeFileSync(
      join(projectRoot, 'README.md'),
      ['# Fixture Project', '', 'This fixture documents the project purpose.'].join('\n'),
    );

    writeFileSync(
      join(projectRoot, 'src', 'index.ts'),
      'export const rule = "Writes must stay inside the Almanac."; \n',
    );

    writeFileSync(
      join(projectRoot, 'tests', 'guard.test.ts'),
      'it("requires policy", () => expect(true).toBe(true));\n',
    );

    writeFileSync(
      join(projectRoot, '.project-ananke', 'almanac', 'ignored.md'),
      'This should not be indexed.\n',
    );
    writeFileSync(join(projectRoot, 'node_modules', 'ignored', 'README.md'), 'ignored\n');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('indexes source artifacts and extracts initial memories', () => {
    const audit = new InMemoryAuditStore();
    const engine = new OnboardingEngine(audit);

    const result = engine.onboard(projectRoot);

    expect(result.sourceArtifacts.map((artifact) => artifact.path).sort()).toEqual([
      'README.md',
      'docs/ADR-0001-ALMANAC-STORE.md',
      'docs/LAWS_OF_MNEMOSYNE.md',
      'src/index.ts',
      'tests/guard.test.ts',
    ]);
    expect(result.sourceArtifacts.every((artifact) => artifact.contentHash.startsWith('sha256:'))).toBe(
      true,
    );
    expect(result.lawsFound).toBe(2);
    expect(result.decisionsFound).toBeGreaterThanOrEqual(1);
    expect(result.constraintsFound).toBeGreaterThanOrEqual(2);
    expect(result.memoriesCreated).toBe(result.memories.length);
    expect(result.memories.every((memory) => memory.status === 'tentative')).toBe(true);
    expect(result.memories.every((memory) => memory.source.path !== '.project-ananke/almanac/ignored.md'))
      .toBe(true);
  });

  it('records a project onboarded audit event with the summary', () => {
    const audit = new InMemoryAuditStore();
    const engine = new OnboardingEngine(audit);

    const result = engine.onboard(projectRoot);
    const events = audit.list({ eventType: 'PROJECT_ONBOARDED' });

    expect(events).toHaveLength(1);
    expect(events[0]?.metadata.memoriesCreated).toBe(result.memoriesCreated);
    expect(events[0]?.metadata.sourceArtifactsIndexed).toBe(5);
  });

  it('assigns stable unique locators across files for each memory kind', () => {
    const audit = new InMemoryAuditStore();
    const engine = new OnboardingEngine(audit);

    const result = engine.onboard(projectRoot);
    const locators = result.memories.map((memory) => memory.locator);

    expect(new Set(locators).size).toBe(locators.length);
    expect(locators).toContain('MNEMOSYNE.LAWS.001');
    expect(locators).toContain('MNEMOSYNE.LAWS.002');
  });

  it('persists generated memories when an Almanac store is supplied', () => {
    const audit = new InMemoryAuditStore();
    const store = new InMemoryAlmanacStore();
    const engine = new OnboardingEngine(audit, store);

    const result = engine.onboard(projectRoot);

    expect(store.search({ tag: 'onboarding' })).toHaveLength(result.memoriesCreated);
    expect(store.fetchSourceReference('mem_law_docs_laws_of_mnemosyne_001')?.sourceType).toBe('law');
    expect(audit.list({ eventType: 'MEMORY_CREATED' })).toHaveLength(result.memoriesCreated);
  });
});
