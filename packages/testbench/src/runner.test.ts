import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runQuickValidation, writeValidationCsvReport, writeValidationReport } from './runner.js';

describe('quick validation testbench', () => {
  it('runs governed quick scenarios and produces a report compatible with the documented shape', async () => {
    const report = await runQuickValidation({
      projectRoot: process.cwd(),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });

    expect(report.summary).toEqual({ total: 3, passed: 3, failed: 0, skipped: 0 });
    expect(report.tests.map((test) => test.id)).toEqual([
      'MNEMOSYNE-QUICK-001',
      'MNEMOSYNE-QUICK-002',
      'MNEMOSYNE-QUICK-003',
    ]);
    expect(report.tests.every((test) => test.failureReason === null)).toBe(true);
  });

  it('writes a local JSON report without adding the output path to report data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-report-'));
    const outputPath = join(directory, 'validation.json');
    try {
      const report = await runQuickValidation({ projectRoot: process.cwd() });
      await writeValidationReport(report, outputPath);
      const saved = await readFile(outputPath, 'utf8');

      expect(JSON.parse(saved)).toMatchObject({ project: 'mnemosyne', summary: report.summary });
      expect(saved).not.toContain(directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('exports the JSON report test rows as escaped CSV fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mnemosyne-csv-'));
    const outputPath = join(directory, 'validation.csv');
    try {
      const report = await runQuickValidation({ projectRoot: process.cwd() });
      report.tests[0] = {
        ...report.tests[0]!,
        failureReason: 'Comma, quote " and newline\nare escaped.',
      };
      await writeValidationCsvReport(report, outputPath);
      const saved = await readFile(outputPath, 'utf8');

      expect(saved.split('\r\n')[0]).toBe(
        'id,suite,category,status,durationMs,failureReason,logPointer,reproductionCommand',
      );
      expect(saved).toContain('"Comma, quote "" and newline\nare escaped."');
      expect(saved).toContain('MNEMOSYNE-QUICK-003');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
