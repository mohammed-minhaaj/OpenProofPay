import { describe, it, expect } from 'vitest';
import { HallucinationFilter } from './HallucinationFilter.js';
import { ScoringEngine } from './ScoringEngine.js';
import { AIVerificationRawOutput, VerificationVerdict } from '@openproofpay/shared';

describe('Phase 3: Verification Engine - Evidence Validation & Deterministic Scoring Unit Tests', () => {
  const sampleRawOutput: AIVerificationRawOutput = {
    overallAssessment: 'Comprehensive analysis of PR changes against criteria.',
    recommendation: 'ACCEPT',
    resolutionVerdict: 'FULLY_ADDRESSED',
    positiveFindings: ['Clean architecture'],
    missingFunctionality: [],
    requirementAnalysis: [
      {
        criterionId: 'crit-1',
        criterionTitle: 'HMAC Webhook verification',
        satisfied: true,
        status: 'SATISFIED',
        evidence: [
          {
            filePath: 'src/webhook.ts',
            lineStart: 12,
            lineEnd: 18,
            quote: 'crypto.timingSafeEqual',
            explanation: 'HMAC signature verification with constant-time comparison'
          }
        ]
      },
      {
        criterionId: 'crit-2',
        criterionTitle: 'Sanitize logs',
        satisfied: true,
        status: 'SATISFIED',
        evidence: [
          {
            filePath: 'src/logger.ts',
            lineStart: 5,
            lineEnd: 10,
            quote: 'redactSecrets',
            explanation: 'Redacts secrets from logs'
          }
        ]
      }
    ],
    criticalIssues: [],
    majorIssues: [],
    minorSuggestions: [],
    securityFindings: [],
    codeQualityFindings: ['Modular code structure', 'Strong type safety'],
    performanceFindings: [],
    testCoverageAssessment: 'Test suite covers webhook scenarios',
    confidenceLevel: 'HIGH'
  };

  describe('Section 3.4: Mandatory Evidence Validation', () => {
    it('verifies evidence when file path exists, line range is valid, and quote is present', () => {
      const fileContents = new Map<string, string>();
      fileContents.set('src/webhook.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nconst valid = crypto.timingSafeEqual(a, b);\nline 13\nline 14\nline 15\nline 16\nline 17\nline 18\nline 19\nline 20');
      fileContents.set('src/logger.ts', 'line 1\nline 2\nline 3\nline 4\nfunction redactSecrets(data) {}\nline 6\nline 7\nline 8\nline 9\nline 10');

      const result = HallucinationFilter.validateAndSanitize(sampleRawOutput, {
        filePaths: new Set(['src/webhook.ts', 'src/logger.ts']),
        fileContents
      });

      const ev1 = result.sanitizedOutput.requirementAnalysis[0]!.evidence[0]!;
      expect(ev1.isVerified).toBe(true);
      expect(ev1.verificationNote).toBe('Verified against head commit SHA');
      expect(result.hallucinationsFiltered).toBe(0);
    });

    it('marks evidence as unverified when file path does not exist in commit snapshot', () => {
      const result = HallucinationFilter.validateAndSanitize(sampleRawOutput, {
        filePaths: new Set(['src/other-file.ts'])
      });

      const ev1 = result.sanitizedOutput.requirementAnalysis[0]!.evidence[0]!;
      expect(ev1.isVerified).toBe(false);
      expect(ev1.verificationNote).toContain("Path 'src/webhook.ts' does not exist in commit snapshot or PR diff");
      expect(result.hallucinationsFiltered).toBeGreaterThan(0);
      expect(result.hallucinatedPaths).toContain('src/webhook.ts');
    });

    it('marks evidence as unverified when line range exceeds file boundaries', () => {
      const fileContents = new Map<string, string>();
      fileContents.set('src/webhook.ts', 'line 1\nline 2\nline 3'); // Only 3 lines!

      const result = HallucinationFilter.validateAndSanitize(sampleRawOutput, {
        filePaths: new Set(['src/webhook.ts', 'src/logger.ts']),
        fileContents
      });

      const ev1 = result.sanitizedOutput.requirementAnalysis[0]!.evidence[0]!;
      expect(ev1.isVerified).toBe(false);
      expect(ev1.verificationNote).toContain('Line start 12 out of valid file range');
      expect(result.hallucinationsFiltered).toBeGreaterThan(0);
    });

    it('marks evidence as unverified when quoted excerpt is not found in file snapshot', () => {
      const fileContents = new Map<string, string>();
      fileContents.set('src/webhook.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nline 12\nline 13\nline 14\nline 15\nline 16\nline 17\nline 18\nline 19\nline 20');
      fileContents.set('src/logger.ts', 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10');

      const result = HallucinationFilter.validateAndSanitize(sampleRawOutput, {
        filePaths: new Set(['src/webhook.ts', 'src/logger.ts']),
        fileContents
      });

      // Quote 'crypto.timingSafeEqual' does not appear in the dummy content above
      const ev1 = result.sanitizedOutput.requirementAnalysis[0]!.evidence[0]!;
      expect(ev1.isVerified).toBe(false);
      expect(ev1.verificationNote).toContain('Quoted excerpt does not appear in repository snapshot');
    });
  });

  describe('Section 3.5: Deterministic Scoring Engine Formula', () => {
    it('scores unevaluated CI (NOT_CONFIGURED, UNAVAILABLE, PENDING) with 50/25/25 weights without penalty', () => {
      const unevaluatedStatuses: Array<'NOT_CONFIGURED' | 'UNAVAILABLE' | 'PENDING'> = [
        'NOT_CONFIGURED',
        'UNAVAILABLE',
        'PENDING'
      ];

      for (const ciStatus of unevaluatedStatuses) {
        const result = ScoringEngine.calculateScore({
          rawOutput: sampleRawOutput,
          ciTestStatus: ciStatus,
          mandatoryCriteriaIds: new Set(['crit-1', 'crit-2']),
          minVerificationScore: 80
        });

        expect(result.overallScore).toBe(100);
        expect(result.scoreBreakdown.criteriaScore).toBe(50);
        expect(result.scoreBreakdown.securityScore).toBe(25);
        expect(result.scoreBreakdown.qualityScore).toBe(25);
        expect(result.scoreBreakdown.testExecutionScore).toBe(0);
        expect(result.verdict).toBe(VerificationVerdict.PASS);
        expect(result.status).toBe('PASSED');
      }
    });

    it('scores evaluated CI (PASSED) with 40/20/20/20 weights', () => {
      const result = ScoringEngine.calculateScore({
        rawOutput: sampleRawOutput,
        ciTestStatus: 'PASSED',
        mandatoryCriteriaIds: new Set(['crit-1', 'crit-2']),
        minVerificationScore: 80
      });

      expect(result.overallScore).toBe(100);
      expect(result.scoreBreakdown.criteriaScore).toBe(40);
      expect(result.scoreBreakdown.securityScore).toBe(20);
      expect(result.scoreBreakdown.qualityScore).toBe(20);
      expect(result.scoreBreakdown.testExecutionScore).toBe(20);
      expect(result.verdict).toBe(VerificationVerdict.PASS);
      expect(result.status).toBe('PASSED');
    });

    it('caps score at <= 60 and enforces FAIL verdict when a mandatory criterion fails', () => {
      const failingRawOutput: AIVerificationRawOutput = {
        ...sampleRawOutput,
        requirementAnalysis: [
          {
            criterionId: 'crit-1',
            satisfied: true,
            status: 'SATISFIED',
            evidence: []
          },
          {
            criterionId: 'crit-2',
            satisfied: false,
            status: 'UNSATISFIED',
            evidence: []
          }
        ]
      };

      const result = ScoringEngine.calculateScore({
        rawOutput: failingRawOutput,
        ciTestStatus: 'NOT_CONFIGURED',
        mandatoryCriteriaIds: new Set(['crit-1', 'crit-2']),
        minVerificationScore: 80
      });

      expect(result.overallScore).toBeLessThanOrEqual(60);
      expect(result.verdict).toBe(VerificationVerdict.FAIL);
      expect(result.status).toBe('FAILED');
      expect(result.scoreBreakdown.ruleApplied).toContain('mandatory acceptance criteria failed');
    });

    it('caps score at <= 50 and enforces FAIL verdict on CRITICAL security finding', () => {
      const securityRawOutput: AIVerificationRawOutput = {
        ...sampleRawOutput,
        securityFindings: [
          {
            severity: 'CRITICAL',
            type: 'SQL_INJECTION',
            message: 'Unsanitized input directly concatenated into SQL query string'
          }
        ]
      };

      const result = ScoringEngine.calculateScore({
        rawOutput: securityRawOutput,
        ciTestStatus: 'PASSED',
        mandatoryCriteriaIds: new Set(['crit-1', 'crit-2']),
        minVerificationScore: 80
      });

      expect(result.overallScore).toBeLessThanOrEqual(50);
      expect(result.verdict).toBe(VerificationVerdict.FAIL);
      expect(result.status).toBe('FAILED');
      expect(result.scoreBreakdown.ruleApplied).toContain('Critical security finding detected');
    });
  });
});
