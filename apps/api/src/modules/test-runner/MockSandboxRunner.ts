import { ISandboxRunner, TestSandboxOptions, TestSandboxResult } from './interfaces.js';

export class MockSandboxRunner implements ISandboxRunner {
  readonly runnerType = 'mock';

  private mockResult: Partial<TestSandboxResult> | null = null;
  private mockAvailable = true;
  private delayMs = 10;

  setMockResult(result: Partial<TestSandboxResult> | null): void {
    this.mockResult = result;
  }

  setMockAvailable(available: boolean): void {
    this.mockAvailable = available;
  }

  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  async isAvailable(): Promise<boolean> {
    return this.mockAvailable;
  }

  async runInSandbox(options: TestSandboxOptions): Promise<TestSandboxResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (!this.mockAvailable) {
      return {
        exitCode: 127,
        stdout: '',
        stderr: 'Docker daemon is not available.',
        durationMs: 5,
        timedOut: false,
        oomKilled: false,
        rawLogs: 'Docker daemon is not available.',
        executedInContainer: false,
        errorMessage: 'Docker daemon unavailable'
      };
    }

    if (this.mockResult) {
      return {
        exitCode: this.mockResult.exitCode ?? 0,
        stdout: this.mockResult.stdout ?? 'Tests: 5 passed, 5 total',
        stderr: this.mockResult.stderr ?? '',
        durationMs: this.mockResult.durationMs ?? 150,
        timedOut: this.mockResult.timedOut ?? false,
        oomKilled: this.mockResult.oomKilled ?? false,
        rawLogs: this.mockResult.rawLogs ?? (this.mockResult.stdout || 'Tests: 5 passed, 5 total'),
        executedInContainer: this.mockResult.executedInContainer ?? true,
        errorMessage: this.mockResult.errorMessage
      };
    }

    // Default simulated successful test run based on options
    let simulatedOutput = '✓ Test suite passed (5/5 tests passed)';
    if (options.testCommand.includes('vitest')) {
      simulatedOutput = `
 RUN  v2.0.0 /workspace
 ✓ tests/unit.test.ts (4)
 ✓ tests/integration.test.ts (1)

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  12:00:00
   Duration  420ms
`;
    } else if (options.testCommand.includes('pytest')) {
      simulatedOutput = `
rootdir: /workspace
collected 4 items

tests/test_core.py ....                                                 [100%]

============================== 4 passed in 0.15s ==============================
`;
    } else if (options.testCommand.includes('mvn') || options.testCommand.includes('gradle')) {
      simulatedOutput = `
[INFO] Running com.openproofpay.AppTest
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.42 s
[INFO] 
[INFO] Results:
[INFO] 
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0
[INFO] 
[INFO] BUILD SUCCESS
`;
    }

    return {
      exitCode: 0,
      stdout: simulatedOutput,
      stderr: '',
      durationMs: 250,
      timedOut: false,
      oomKilled: false,
      rawLogs: simulatedOutput,
      executedInContainer: true
    };
  }
}
