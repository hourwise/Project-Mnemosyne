import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';
import type { AlmanacStore } from '@mnemosyne/almanac-store';
import { MemoryIngestEngine, type CandidateMemory } from '@mnemosyne/memory-ingest-engine';
import { SourceMapEngine, type SourceArtifact } from '@mnemosyne/source-map-engine';
import type { MemoryKind, MemoryRecord, SourceReference, SourceType } from '@mnemosyne/schema';

const ignoredDirectories = new Set([
  '.git',
  '.idea',
  '.project-Mnemosyne',
  'coverage',
  'dist',
  'node_modules',
]);

const indexedExtensions = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.jsx']);
const constraintPattern = /\b(must|must not|should|should not|never|do not|only|requires?)\b/i;

export interface OnboardingSummary {
  projectRoot: string;
  memoriesCreated: number;
  lawsFound: number;
  decisionsFound: number;
  constraintsFound: number;
  sourceArtifactsIndexed: number;
  conflictsFound: number;
  openQuestions: number;
}

export interface OnboardingResult extends OnboardingSummary {
  sourceArtifacts: SourceArtifact[];
  memories: MemoryRecord[];
}

interface MemoryCounters {
  law: number;
  decision: number;
  constraint: number;
  fact: number;
}

export class OnboardingEngine {
  private readonly sourceMap = new SourceMapEngine();
  private readonly ingest = new MemoryIngestEngine();

  constructor(
    private readonly audit: AuditStore,
    private readonly store?: AlmanacStore,
  ) {}

  onboard(projectRoot: string): OnboardingResult {
    const sourceArtifacts = scanSourceArtifacts(projectRoot);
    const counters: MemoryCounters = { law: 0, decision: 0, constraint: 0, fact: 0 };
    const candidates = sourceArtifacts.flatMap((artifact) =>
      extractCandidateMemories(
        this.sourceMap.toReference(artifact),
        readText(projectRoot, artifact.path),
        counters,
      ),
    );
    const memories = candidates.map((candidate) => this.ingest.ingest(candidate));
    for (const memory of memories) {
      this.store?.createMemory(memory);
      if (this.store) {
        this.audit.record(
          createAuditEvent('MEMORY_CREATED', {
            memoryId: memory.id,
            locator: memory.locator,
            sourcePath: memory.source.path,
            sourceType: memory.source.sourceType,
          }),
        );
      }
    }

    const summary: OnboardingSummary = {
      projectRoot,
      memoriesCreated: memories.length,
      lawsFound: memories.filter((memory) => memory.kind === 'law').length,
      decisionsFound: memories.filter((memory) => memory.kind === 'decision').length,
      constraintsFound: memories.filter((memory) => memory.kind === 'constraint').length,
      sourceArtifactsIndexed: sourceArtifacts.length,
      conflictsFound: 0,
      openQuestions: 0,
    };

    this.audit.record(createAuditEvent('PROJECT_ONBOARDED', { ...summary }));

    return {
      ...summary,
      sourceArtifacts,
      memories,
    };
  }
}

function scanSourceArtifacts(projectRoot: string): SourceArtifact[] {
  const files: string[] = [];
  walk(projectRoot, projectRoot, files);

  return files.map((path, index) => {
    const content = readFileSync(join(projectRoot, path));
    return {
      artifactId: `artifact_${sanitizeIdStem(path)}_${String(index + 1).padStart(3, '0')}`,
      path,
      sourceType: classifySourceType(path),
      contentHash: `sha256:${createHash('sha256').update(content).digest('hex')}`,
    };
  });
}

function walk(projectRoot: string, directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(projectRoot, join(directory, entry.name), files);
      }
      continue;
    }

    if (!entry.isFile()) continue;
    const fullPath = join(directory, entry.name);
    const ext = extname(entry.name).toLowerCase();
    if (!indexedExtensions.has(ext)) continue;
    if (statSync(fullPath).size > 512_000) continue;

    files.push(toRelativeProjectPath(projectRoot, fullPath));
  }

  files.sort();
}

function classifySourceType(path: string): SourceType {
  const normalized = path.toLowerCase();
  const name = basename(normalized);

  if (name.includes('laws_of_') || name.includes('the_laws_of_')) return 'law';
  if (name.startsWith('adr-') || normalized.includes('/adr-')) return 'adr';
  if (name === 'readme.md') return 'readme';
  if (normalized.includes('/tests/') || /\.(test|spec)\.[tj]sx?$/.test(normalized)) return 'test';
  if (/\.[tj]sx?$/.test(normalized) || name === 'package.json' || name === 'tsconfig.json') return 'code';
  return 'readme';
}

function extractCandidateMemories(
  source: SourceReference,
  content: string,
  counters: MemoryCounters,
): CandidateMemory[] {
  const lines = content.split(/\r?\n/);
  const candidates: CandidateMemory[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();
    if (!line) continue;

    const heading = parseMarkdownHeading(line);
    if (heading && source.sourceType === 'law' && /\blaw\b/i.test(heading.text)) {
      const statement = nextMeaningfulLine(lines, index + 1) ?? heading.text;
      candidates.push(
        candidate('law', statement, source, counters, index + 1, heading.text, ['law', 'onboarding']),
      );
      continue;
    }

    if (heading && source.sourceType === 'adr') {
      candidates.push(
        candidate('decision', heading.text, source, counters, index + 1, heading.text, [
          'adr',
          'decision',
          'onboarding',
        ]),
      );
      continue;
    }

    if (/^decision\s*:/i.test(line)) {
      candidates.push(
        candidate(
          'decision',
          stripListMarker(line.replace(/^decision\s*:/i, '').trim()),
          source,
          counters,
          index + 1,
          undefined,
          ['decision', 'onboarding'],
        ),
      );
      continue;
    }

    if (constraintPattern.test(line) && isMemoryBearingLine(line)) {
      candidates.push(
        candidate('constraint', stripListMarker(line), source, counters, index + 1, undefined, [
          'constraint',
          'onboarding',
        ]),
      );
    }
  }

  if (candidates.length === 0 && source.sourceType === 'readme') {
    const firstParagraph = firstMeaningfulParagraph(lines);
    if (firstParagraph) {
      candidates.push(
        candidate('fact', firstParagraph, source, counters, 1, undefined, ['readme', 'onboarding']),
      );
    }
  }

  return candidates;
}

function candidate(
  kind: MemoryKind,
  statement: string,
  source: SourceReference,
  counters: MemoryCounters,
  lineStart: number,
  heading: string | undefined,
  tags: string[],
): CandidateMemory {
  counters[kind as keyof MemoryCounters] += 1;
  const ordinal = counters[kind as keyof MemoryCounters];
  const sourceWithLocator = {
    ...source,
    heading,
    lineStart,
    lineEnd: lineStart,
  };

  return {
    id: `mem_${kind}_${sanitizeIdStem(source.path)}_${String(ordinal).padStart(3, '0')}`,
    kind,
    statement: normalizeStatement(statement),
    importance: kind === 'law' ? 'critical' : kind === 'decision' ? 'high' : 'medium',
    source: sourceWithLocator,
    locator: locatorFor(kind, source.path, ordinal),
    tags,
  };
}

function locatorFor(kind: MemoryKind, sourcePath: string, ordinal: number): string {
  const projectPrefix = sourcePath.toLowerCase().includes('mnemosyne') ? 'MNEMOSYNE' : 'PROJECT';
  const chapter =
    kind === 'law'
      ? 'LAWS'
      : kind === 'decision'
        ? 'DECISIONS'
        : kind === 'constraint'
          ? 'CONSTRAINTS'
          : 'FACTS';
  return `${projectPrefix}.${chapter}.${String(ordinal).padStart(3, '0')}`;
}

function parseMarkdownHeading(line: string): { depth: number; text: string } | undefined {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!match) return undefined;
  return { depth: match[1]!.length, text: match[2]!.trim() };
}

function nextMeaningfulLine(lines: string[], startIndex: number): string | undefined {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripListMarker((lines[index] ?? '').trim());
    if (!line || line === '---' || line.startsWith('```')) continue;
    if (line.startsWith('#')) return undefined;
    return line;
  }
  return undefined;
}

function firstMeaningfulParagraph(lines: string[]): string | undefined {
  const paragraph: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line === '---') {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(stripListMarker(line));
  }
  return paragraph.length > 0 ? normalizeStatement(paragraph.join(' ')) : undefined;
}

function isMemoryBearingLine(line: string): boolean {
  if (line.startsWith('```')) return false;
  if (/^[{}[\],"]+$/.test(line)) return false;
  return stripListMarker(line).length >= 12;
}

function stripListMarker(line: string): string {
  return line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
}

function normalizeStatement(statement: string): string {
  return statement.replace(/^>\s*/, '').replace(/\s+/g, ' ').trim();
}

function readText(projectRoot: string, path: string): string {
  return readFileSync(join(projectRoot, path), 'utf8');
}

function toRelativeProjectPath(projectRoot: string, fullPath: string): string {
  return relative(projectRoot, fullPath).split(sep).join('/');
}

function sanitizeIdStem(input: string): string {
  const stem = input
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return stem || 'source';
}
