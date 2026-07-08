export interface TestbenchScenarioResult {
  scenario: string;
  passed: boolean;
  notes?: string;
}

export function summarizeScenarioResults(results: TestbenchScenarioResult[]): { total: number; passed: number } {
  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
  };
}
