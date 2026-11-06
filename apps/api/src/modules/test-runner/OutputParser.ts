import { ParsedOutput } from './interfaces.js';

export class OutputParser {
  /**
   * Parse test runner logs into structured counts
   */
  static parse(logs: string, hintFramework?: string): ParsedOutput {
    if (!logs || typeof logs !== 'string') {
      return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
    }

    const cleanLogs = logs.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

    // 1. Vitest / Jest Parser
    if (hintFramework === 'vitest' || hintFramework === 'jest' || /Jest|Vitest|Test Suites|Tests:\s+/i.test(cleanLogs)) {
      const parsed = this.parseJestVitest(cleanLogs);
      if (parsed.totalTests > 0) return parsed;
    }

    // 2. Pytest Parser
    if (hintFramework === 'pytest' || /pytest|===.*in\s+[\d\.]+s\s*===/i.test(cleanLogs)) {
      const parsed = this.parsePytest(cleanLogs);
      if (parsed.totalTests > 0) return parsed;
    }

    // 3. Maven / JUnit / Gradle Parser
    if (hintFramework === 'junit' || /Tests run:\s*\d+,\s*Failures:\s*\d+/i.test(cleanLogs)) {
      const parsed = this.parseJUnit(cleanLogs);
      if (parsed.totalTests > 0) return parsed;
    }

    // 4. CTest Parser
    if (hintFramework === 'ctest' || /tests passed,\s*\d+\s+tests failed out of/i.test(cleanLogs)) {
      const parsed = this.parseCTest(cleanLogs);
      if (parsed.totalTests > 0) return parsed;
    }

    // 5. Generic / Symbol fallback
    return this.parseGeneric(cleanLogs);
  }

  /**
   * Parse Jest / Vitest output:
   * e.g. "Tests:       2 failed, 10 passed, 1 skipped, 13 total"
   * e.g. "Tests:       15 passed, 15 total"
   */
  private static parseJestVitest(logs: string): ParsedOutput {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let total = 0;

    const testsLineMatch = logs.match(/Tests:\s+([^\n\r]+)/i);
    if (testsLineMatch) {
      const line = testsLineMatch[1]!;

      const failedMatch = line.match(/(\d+)\s+failed/i);
      if (failedMatch) failed = parseInt(failedMatch[1]!, 10);

      const passedMatch = line.match(/(\d+)\s+passed/i);
      if (passedMatch) passed = parseInt(passedMatch[1]!, 10);

      const skippedMatch = line.match(/(\d+)\s+skipped/i);
      if (skippedMatch) skipped = parseInt(skippedMatch[1]!, 10);

      const totalMatch = line.match(/(\d+)\s+total/i);
      if (totalMatch) {
        total = parseInt(totalMatch[1]!, 10);
      } else {
        total = passed + failed + skipped;
      }

      return {
        totalTests: total,
        passedTests: passed,
        failedTests: failed,
        skippedTests: skipped,
        detectedFramework: 'vitest/jest'
      };
    }

    // Check individual test match items like "✓ passed test" and "× failed test"
    const passMatches = logs.match(/(?:✓|√|\bPASS\b)/g) || [];
    const failMatches = logs.match(/(?:×|✕|\bFAIL\b)/g) || [];

    if (passMatches.length > 0 || failMatches.length > 0) {
      passed = passMatches.length;
      failed = failMatches.length;
      total = passed + failed;
      return {
        totalTests: total,
        passedTests: passed,
        failedTests: failed,
        skippedTests: 0,
        detectedFramework: 'vitest/jest'
      };
    }

    return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
  }

  /**
   * Parse Pytest summary output:
   * e.g. "=== 2 failed, 8 passed, 1 skipped in 1.45s ==="
   * e.g. "=== 10 passed in 0.23s ==="
   */
  private static parsePytest(logs: string): ParsedOutput {
    const summaryMatch = logs.match(/=+ (.*?) in [0-9.]+s =+/i);
    if (summaryMatch) {
      const summaryText = summaryMatch[1]!;
      let passed = 0;
      let failed = 0;
      let skipped = 0;

      const failedMatch = summaryText.match(/(\d+)\s+failed/i);
      if (failedMatch) failed = parseInt(failedMatch[1]!, 10);

      const passedMatch = summaryText.match(/(\d+)\s+passed/i);
      if (passedMatch) passed = parseInt(passedMatch[1]!, 10);

      const skippedMatch = summaryText.match(/(\d+)\s+skipped/i);
      if (skippedMatch) skipped = parseInt(skippedMatch[1]!, 10);

      return {
        totalTests: passed + failed + skipped,
        passedTests: passed,
        failedTests: failed,
        skippedTests: skipped,
        detectedFramework: 'pytest'
      };
    }

    return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
  }

  /**
   * Parse JUnit / Maven / Gradle output:
   * e.g. "Tests run: 12, Failures: 0, Errors: 0, Skipped: 1"
   */
  private static parseJUnit(logs: string): ParsedOutput {
    const regex = /Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)(?:,\s*Skipped:\s*(\d+))?/gi;
    let total = 0;
    let failures = 0;
    let errors = 0;
    let skipped = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(logs)) !== null) {
      total += parseInt(match[1]!, 10);
      failures += parseInt(match[2]!, 10);
      errors += parseInt(match[3]!, 10);
      if (match[4]) skipped += parseInt(match[4], 10);
    }

    const failed = failures + errors;
    const passed = Math.max(0, total - failed - skipped);

    if (total > 0) {
      return {
        totalTests: total,
        passedTests: passed,
        failedTests: failed,
        skippedTests: skipped,
        detectedFramework: 'junit'
      };
    }

    return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
  }

  /**
   * Parse CTest output:
   * e.g. "100% tests passed, 0 tests failed out of 10"
   * e.g. "80% tests passed, 2 tests failed out of 10"
   */
  private static parseCTest(logs: string): ParsedOutput {
    const match = logs.match(/(\d+)%\s+tests passed,\s*(\d+)\s+tests failed out of\s+(\d+)/i);
    if (match) {
      const failed = parseInt(match[2]!, 10);
      const total = parseInt(match[3]!, 10);
      const passed = Math.max(0, total - failed);
      return {
        totalTests: total,
        passedTests: passed,
        failedTests: failed,
        skippedTests: 0,
        detectedFramework: 'ctest'
      };
    }

    return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
  }

  /**
   * Generic fallback counting passed and failed markers
   */
  private static parseGeneric(logs: string): ParsedOutput {
    const passMatches = logs.match(/(?:✓|PASS|PASSED|ok\b)/gi) || [];
    const failMatches = logs.match(/(?:×|FAIL|FAILED|not ok\b)/gi) || [];

    if (passMatches.length === 0 && failMatches.length === 0) {
      return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0 };
    }

    const passed = passMatches.length;
    const failed = failMatches.length;

    return {
      totalTests: passed + failed,
      passedTests: passed,
      failedTests: failed,
      skippedTests: 0,
      detectedFramework: 'generic'
    };
  }
}
