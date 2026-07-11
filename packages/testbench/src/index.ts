export interface TestbenchScenarioResult {
  scenario: string;
  passed: boolean;
  notes?: string;
}

export type ValidationTestStatus = 'passed' | 'failed' | 'skipped';

export interface ValidationTestResult {
  id: string;
  suite: string;
  category: 'normal' | 'edge' | 'failure' | 'hostile' | 'regression';
  status: ValidationTestStatus;
  durationMs: number;
  failureReason: string | null;
  logPointer: string | null;
  reproductionCommand: string;
}

export interface ValidationReport {
  project: 'mnemosyne';
  version: string;
  commitSha: string;
  protocolVersion: string;
  testSuiteVersion: string;
  environment: {
    os: string;
    osBuild: string;
    arch: string;
    node: string;
    npm: string;
    sqlite: string;
    harness: string;
    editor: string;
    model: string;
    mcpClient: string;
  };
  startedAt: string;
  finishedAt: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  tests: ValidationTestResult[];
}

export function summarizeScenarioResults(results: TestbenchScenarioResult[]): { total: number; passed: number } {
  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
  };
}

export function summarizeValidationResults(
  results: ValidationTestResult[],
): ValidationReport['summary'] {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  };
}
