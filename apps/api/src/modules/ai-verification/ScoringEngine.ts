import { AIVerificationRawOutput, ScoreBreakdown, VerificationVerdict } from '@openproofpay/shared';

export interface ScoringInput {
  rawOutput: AIVerificationRawOutput;
  testExecution?: {
    status: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
  ciTestStatus?: 'PASSED' | 'FAILED' | 'PENDING' | 'IN_PROGRESS' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR';
  mandatoryCriteriaIds: Set<string>;
  minVerificationScore?: number;
}

export interface ScoringResult {
  scoreBreakdown: ScoreBreakdown;
  overallScore: number;
  verdict: VerificationVerdict;
  status: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW';
}

export class ScoringEngine {
  /**
   * Section 3.5: Deterministic scoring in backend code
   * Documented weights:
   * - Unevaluated CI tests (NOT_CONFIGURED, UNAVAILABLE, PENDING): Acceptance criteria 50%, Security 25%, Code Quality 25%
   * - Evaluated CI tests (PASSED, FAILED): Acceptance criteria 40%, Security 20%, Code Quality 20%, Test results 20%
   * - Hard caps: Any failed mandatory criterion or critical security finding caps the verdict at WARN/FAIL with an explained rule.
   */
  static calculateScore(input: ScoringInput): ScoringResult {
    const { rawOutput, testExecution, ciTestStatus, mandatoryCriteriaIds, minVerificationScore = 80 } = input;

    // Check if CI test results were actually evaluated (PASSED or FAILED)
    const effectiveStatus = testExecution?.status || ciTestStatus;
    const isCIEvaluated = Boolean(
      effectiveStatus === 'PASSED' || effectiveStatus === 'FAILED'
    );

    // Weights allocation
    const criteriaWeight = isCIEvaluated ? 40 : 50;
    const testWeight = isCIEvaluated ? 20 : 0;
    const securityWeight = isCIEvaluated ? 20 : 25;
    const qualityWeight = isCIEvaluated ? 20 : 25;

    // =========================================================================
    // 1. Acceptance Criteria Coverage
    // =========================================================================
    let criteriaScore = criteriaWeight;
    let hasFailedMandatory = false;
    const totalMandatory = mandatoryCriteriaIds.size;

    if (totalMandatory > 0) {
      let satisfiedMandatory = 0;
      let partiallySatisfiedMandatory = 0;

      for (const item of rawOutput.requirementAnalysis) {
        const itemStatus = (item.status || '').toUpperCase();
        const isSatisfied = item.satisfied || itemStatus === 'SATISFIED';
        const isPartial = itemStatus === 'PARTIALLY_SATISFIED' || itemStatus === 'PARTIAL';

        const critId = item.criterionId || item.id;
        if (critId && mandatoryCriteriaIds.has(critId)) {
          if (isSatisfied) {
            satisfiedMandatory++;
          } else if (isPartial) {
            partiallySatisfiedMandatory++;
            hasFailedMandatory = true;
          } else {
            hasFailedMandatory = true;
          }
        }
      }

      const ratio = (satisfiedMandatory + partiallySatisfiedMandatory * 0.5) / totalMandatory;
      criteriaScore = Math.round(ratio * criteriaWeight);
    } else {
      const total = rawOutput.requirementAnalysis.length;
      if (total > 0) {
        let satisfiedCount = 0;
        let partialCount = 0;
        for (const r of rawOutput.requirementAnalysis) {
          const s = (r.status || '').toUpperCase();
          if (r.satisfied || s === 'SATISFIED') {
            satisfiedCount++;
          } else if (s === 'PARTIALLY_SATISFIED' || s === 'PARTIAL') {
            partialCount++;
          }
        }
        const ratio = (satisfiedCount + partialCount * 0.5) / total;
        criteriaScore = Math.round(ratio * criteriaWeight);
      }
    }

    // =========================================================================
    // 2. Deterministic Automated Test Execution (Only when evaluated)
    // =========================================================================
    let testExecutionScore = 0;

    if (isCIEvaluated) {
      if (testExecution && testExecution.totalTests > 0) {
        const passRatio = testExecution.passedTests / testExecution.totalTests;
        testExecutionScore = Math.round(passRatio * testWeight);
      } else if (effectiveStatus === 'PASSED') {
        testExecutionScore = testWeight;
      } else if (effectiveStatus === 'FAILED') {
        testExecutionScore = Math.round(testWeight * 0.2);
      }
    }

    // =========================================================================
    // 3. Security Findings
    // =========================================================================
    let securityDeduction = 0;
    let hasCriticalSecurity = false;

    for (const finding of rawOutput.securityFindings || []) {
      const severity = finding.severity.toUpperCase();
      if (severity === 'CRITICAL') {
        securityDeduction += securityWeight;
        hasCriticalSecurity = true;
      } else if (severity === 'HIGH') {
        securityDeduction += Math.round(securityWeight * 0.5);
      } else if (severity === 'MEDIUM') {
        securityDeduction += Math.round(securityWeight * 0.25);
      } else if (severity === 'LOW') {
        securityDeduction += Math.round(securityWeight * 0.1);
      }
    }

    const securityScore = Math.max(0, securityWeight - securityDeduction);

    // =========================================================================
    // 4. Code Quality Findings
    // =========================================================================
    let qualityDeduction = 0;
    qualityDeduction += (rawOutput.criticalIssues || []).length * 8;
    qualityDeduction += (rawOutput.majorIssues || []).length * 4;
    qualityDeduction += (rawOutput.minorSuggestions || []).length * 1;

    const qualityScore = Math.max(0, qualityWeight - qualityDeduction);

    // =========================================================================
    // 5. Final Score & Capping Rules
    // =========================================================================
    const rawTotal = criteriaScore + testExecutionScore + securityScore + qualityScore;
    let overallScore = Math.min(100, Math.max(0, rawTotal));

    let ruleApplied: string | undefined;

    if (hasCriticalSecurity) {
      ruleApplied = 'Verdict capped at FAIL: Critical security finding detected.';
      if (overallScore > 50) overallScore = 50;
    } else if (hasFailedMandatory) {
      ruleApplied = 'Verdict capped at FAIL: One or more mandatory acceptance criteria failed.';
      if (overallScore > 60) overallScore = 60;
    }

    // Determine verdict
    let verdict: VerificationVerdict = VerificationVerdict.WARN;
    let status: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';

    if (hasCriticalSecurity || hasFailedMandatory || overallScore < 60) {
      verdict = VerificationVerdict.FAIL;
      status = 'FAILED';
    } else if (overallScore >= minVerificationScore && !hasFailedMandatory && !hasCriticalSecurity) {
      verdict = VerificationVerdict.PASS;
      status = 'PASSED';
    } else {
      verdict = VerificationVerdict.WARN;
      status = 'NEEDS_REVIEW';
    }

    return {
      scoreBreakdown: {
        criteriaScore,
        testExecutionScore,
        securityScore,
        qualityScore,
        totalScore: overallScore,
        ruleApplied
      },
      overallScore,
      verdict,
      status
    };
  }
}