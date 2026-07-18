import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqliteAlmanacStore } from '@mnemosyne/almanac-store';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';
import type { MemoryRecord } from '@mnemosyne/schema';
import {
  summarizeValidationResults,
  type ValidationReport,
  type ValidationTestResult,
} from './index.js';

const reportVersion = '0.1.0';

export interface QuickValidationOptions {
  projectRoot?: string;
  now?: () => Date;
  temporaryDirectory?: string;
}

export async function runQuickValidation(
  options: QuickValidationOptions = {},
): Promise<ValidationReport> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const projectRoot = options.projectRoot ?? process.cwd();
  const results = await Promise.all([
    executeScenario('MNEMOSYNE-QUICK-001', 'Runtime', 'Initialises the Almanac and returns status.', async () => {
      const runtime = new MnemosyneRuntime({ projectRoot, projectId: 'project_testbench' });
      runtime.init();
      const status = runtime.status();
      if (status.activeMemories !== 0 || status.auditEvents < 1) {
        throw new Error('Runtime status did not reflect Almanac initialisation.');
      }
    }),
    executeScenario('MNEMOSYNE-QUICK-002', 'Almanac Store', 'Persists a memory through a SQLite reopen.', async () => {
      await validateSqlitePersistence(options.temporaryDirectory);
    }),
    executeScenario('MNEMOSYNE-QUICK-003', 'MCP Adapter', 'Builds a governed context pack without raw filesystem access.', async () => {
      const runtime = new MnemosyneRuntime({ projectRoot, projectId: 'project_testbench' });
      const trustedContext = localContext(runtime, 'project_testbench');
      const server = runtime.createMcpServer({
        'docs/ALMANAC_MODEL.md': 'The Almanac stores governed project memory.',
      });
      const write = server.callTool('almanac_write_memory', { memory: validationMemory() }, trustedContext);
      if (write.isError) throw new Error(write.content[0]?.text ?? 'Memory write failed.');
      const result = server.callTool('almanac_get_context_pack', { task: 'governed project memory' }, trustedContext);
      if (result.isError) throw new Error(result.content[0]?.text ?? 'Context tool failed.');
      const context = JSON.parse(result.content[0]?.text ?? '{}') as { relevantMemories?: Array<{ id: string }> };
      if (context.relevantMemories?.[0]?.id !== 'mem_fact_validation') {
        throw new Error('Context pack did not include the governed memory.');
      }
      if (server.listTools().some((tool) => /filesystem|file_read/i.test(tool.name))) {
        throw new Error('MCP adapter exposed a raw filesystem tool.');
      }
    }),
  ]);
  const finishedAt = now().toISOString();

  return {
    project: 'mnemosyne',
    version: reportVersion,
    commitSha: process.env.GITHUB_SHA ?? 'unknown',
    protocolVersion: 'unknown',
    testSuiteVersion: reportVersion,
    environment: {
      os: process.platform,
      osBuild: release(),
      arch: process.arch,
      node: process.version,
      npm: process.env.npm_version ?? 'unknown',
      sqlite: 'better-sqlite3',
      harness: '@mnemosyne/testbench',
      editor: 'unknown',
      model: 'unknown',
      mcpClient: 'unknown',
    },
    startedAt,
    finishedAt,
    summary: summarizeValidationResults(results),
    tests: results,
  };
}

function localContext(runtime: MnemosyneRuntime, projectId: string) {
  return runtime.createOperationContext({
    execution: {
      authenticatedPrincipal: { id: 'service_testbench', kind: PrincipalKind.Service },
      actingPrincipal: { id: 'agent_testbench', kind: PrincipalKind.Agent },
      runtimeId: 'mnemosyne',
      runtimeInstanceId: runtime.runtimeScope.runtimeInstanceId,
      sessionId: 'session_testbench',
      projectId,
    },
    scope: { mode: ResourceScopeMode.Bounded, projectId },
    purpose: 'local_testbench_validation',
  });
}

export async function writeValidationReport(report: ValidationReport, outputPath: string): Promise<void> {
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

/** Exports the same per-test rows as the JSON report in RFC 4180-compatible CSV. */
export async function writeValidationCsvReport(report: ValidationReport, outputPath: string): Promise<void> {
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  const columns: Array<keyof ValidationTestResult> = [
    'id',
    'suite',
    'category',
    'status',
    'durationMs',
    'failureReason',
    'logPointer',
    'reproductionCommand',
  ];
  const rows = [
    columns.join(','),
    ...report.tests.map((test) => columns.map((column) => csvCell(test[column])).join(',')),
  ];
  await writeFile(outputPath, `${rows.join('\r\n')}\r\n`, 'utf8');
}

async function executeScenario(
  id: string,
  suite: string,
  description: string,
  run: () => Promise<void>,
): Promise<ValidationTestResult> {
  const started = performance.now();
  try {
    await run();
    return testResult(id, suite, 'passed', started, null, description);
  } catch (error) {
    return testResult(
      id,
      suite,
      'failed',
      started,
      error instanceof Error ? error.message : 'Unknown validation failure.',
      description,
    );
  }
}

function testResult(
  id: string,
  suite: string,
  status: ValidationTestResult['status'],
  started: number,
  failureReason: string | null,
  description: string,
): ValidationTestResult {
  return {
    id,
    suite,
    category: 'normal',
    status,
    durationMs: Math.round(performance.now() - started),
    failureReason,
    logPointer: null,
    reproductionCommand: `npm run bench -w @mnemosyne/testbench # ${description}`,
  };
}

async function validateSqlitePersistence(temporaryDirectory?: string): Promise<void> {
  const directory = await mkdtemp(join(temporaryDirectory ?? tmpdir(), 'mnemosyne-validation-'));
  const dbPath = join(directory, 'almanac.db');
  try {
    const first = new SqliteAlmanacStore(dbPath);
    first.createMemory(validationMemory());
    first.close();

    const reopened = new SqliteAlmanacStore(dbPath);
    const persisted = reopened.search({ text: 'governed project memory' });
    reopened.close();
    if (persisted[0]?.id !== 'mem_fact_validation') {
      throw new Error('SQLite memory was not present after reopening the Almanac.');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function validationMemory(): MemoryRecord {
  return {
    id: 'mem_fact_validation',
    kind: 'fact',
    statement: 'The Almanac stores governed project memory.',
    reliability: 0.9,
    importance: 'high',
    status: 'active',
    source: {
      artifactId: 'doc_almanac_model',
      path: 'docs/ALMANAC_MODEL.md',
      contentHash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sourceType: 'readme',
    },
    locator: 'MNEMOSYNE.VALIDATION.001',
    createdAt: '2026-07-11T00:00:00.000Z',
    supersedes: [],
    tags: ['validation', 'almanac'],
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function defaultCsvPath(jsonPath: string): string {
  return jsonPath.endsWith('.json') ? `${jsonPath.slice(0, -5)}.csv` : `${jsonPath}.csv`;
}

function parseCliPaths(args: string[]): { jsonPath: string; csvPath?: string } {
  const positional = args.find((arg) => arg !== '--csv' && !arg.startsWith('--'));
  const jsonPath = positional
    ? resolve(positional)
    : resolve(process.cwd(), '.project-Mnemosyne', 'almanac', 'validation', 'mnemosyne-validation.json');
  const csvIndex = args.indexOf('--csv');
  if (csvIndex < 0) return { jsonPath };
  const requestedPath = args[csvIndex + 1];
  return {
    jsonPath,
    csvPath: requestedPath && !requestedPath.startsWith('--') ? resolve(requestedPath) : defaultCsvPath(jsonPath),
  };
}

if (process.argv[1] && /(?:^|[\\/])runner\.(?:ts|js)$/.test(process.argv[1])) {
  const report = await runQuickValidation();
  const paths = parseCliPaths(process.argv.slice(2));
  await writeValidationReport(report, paths.jsonPath);
  if (paths.csvPath) await writeValidationCsvReport(report, paths.csvPath);
  console.log(JSON.stringify({ reportPath: paths.jsonPath, csvPath: paths.csvPath, summary: report.summary }, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}
