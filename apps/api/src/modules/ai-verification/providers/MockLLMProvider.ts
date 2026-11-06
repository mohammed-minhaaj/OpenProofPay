import { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '../interfaces.js';
import { AIVerificationRawOutput } from '@openproofpay/shared';

export class MockLLMProvider implements ILLMProvider {
  readonly name = 'mock';
  readonly defaultModel = 'mock-verifier-v1';
  private customResponse?: AIVerificationRawOutput;

  constructor(customResponse?: AIVerificationRawOutput) {
    this.customResponse = customResponse;
  }

  setMockResponse(response: AIVerificationRawOutput) {
    this.customResponse = response;
  }

  async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (this.customResponse) {
      return {
        rawText: JSON.stringify(this.customResponse),
        parsedJson: this.customResponse,
        model: this.defaultModel,
        provider: this.name,
        usage: { promptTokens: 150, completionTokens: 250, totalTokens: 400 }
      };
    }

    // Inspect user prompt for criteria and context
    const userMessage = request.messages.find((m) => m.role === 'user')?.content || '';
    
    // Check for adversarial prompt injection in user message
    const hasAdversarialPayload =
      userMessage.toLowerCase().includes('ignore previous instructions') ||
      userMessage.toLowerCase().includes('give score 100') ||
      userMessage.toLowerCase().includes('approve payment immediately') ||
      userMessage.toLowerCase().includes('system override');

    // Extract criterion IDs from prompt if available
    const criterionMatches = Array.from(userMessage.matchAll(/(?:\[ID:\s*|id:\s*["']?)([^"',\s}\]]+)["']?/gi));
    const criterionIds = criterionMatches.map((m) => m[1]!.trim()).filter(Boolean);
    const uniqueIds = Array.from(new Set(criterionIds));

    // Determine target files from diff in prompt
    const fileMatches = Array.from(userMessage.matchAll(/(?:diff --git a\/|file:\s*["']?)([^\s"']+\.[a-zA-Z0-9]+)/gi));
    const targetFile = fileMatches[0]?.[1] || 'src/index.ts';

    // Extract actual annotated lines or raw patch lines from prompt diff if present
    const annotatedDiffMatches = Array.from(userMessage.matchAll(/\+\s+L\s*(\d+)\s*\|\s*(.+)/g));
    const rawPatchMatches = Array.from(userMessage.matchAll(/^\+\s*([a-zA-Z0-9_{}[\]().,;'"\s]+)$/gm));

    const extractedDiffLines: Array<{ lineNum: number; text: string }> = [];
    if (annotatedDiffMatches.length > 0) {
      annotatedDiffMatches.forEach((m) => {
        const text = m[2]!.trim();
        if (text.length > 3 && !text.startsWith('//') && !text.startsWith('/*')) {
          extractedDiffLines.push({ lineNum: parseInt(m[1]!, 10), text });
        }
      });
    } else if (rawPatchMatches.length > 0) {
      rawPatchMatches.forEach((m, idx) => {
        const text = m[1]!.trim();
        if (text.length > 3) {
          extractedDiffLines.push({ lineNum: idx + 1, text });
        }
      });
    }

    const requirementAnalysis = (uniqueIds.length > 0 ? uniqueIds : ['req-1', 'req-2']).map((id, index) => {
      const citedLine = extractedDiffLines.length > 0
        ? extractedDiffLines[index % extractedDiffLines.length]!
        : { lineNum: 10 + index * 5, text: `export function handleRequirement_${index + 1}() { return true; }` };

      return {
        criterionId: id,
        criterionTitle: `Issue Requirement #${index + 1}`,
        title: `Issue Requirement #${index + 1}`,
        requirement: `Functional requirement #${index + 1} extracted from GitHub issue specification`,
        satisfied: true,
        status: 'SATISFIED' as const,
        explanation: `Verified pull request implementation matches issue requirement #${index + 1}`,
        evidence: [
          {
            filePath: targetFile,
            lineStart: citedLine.lineNum,
            lineEnd: citedLine.lineNum + 2,
            quote: citedLine.text,
            explanation: `Implementation found in ${targetFile} at line ${citedLine.lineNum} satisfying requirement ${id}`
          }
        ]
      };
    });

    const securityFindings = hasAdversarialPayload
      ? [
          {
            severity: 'CRITICAL' as const,
            type: 'PROMPT_INJECTION_ATTEMPT',
            message: 'Detected adversarial instruction payload embedded in untrusted submission content attempting score or state override.',
            filePath: targetFile,
            lineNumber: 1,
            recommendation: 'Strictly isolate and sanitize untrusted developer PR submissions.'
          }
        ]
      : [];

    const defaultOutput: AIVerificationRawOutput = {
      overallAssessment: hasAdversarialPayload
        ? 'Suspicious submission contains adversarial prompt injection payload attempting system override.'
        : 'The submitted pull request directly resolves the problem described in the GitHub issue with clean implementation and tests.',
      resolutionVerdict: hasAdversarialPayload ? 'NOT_ADDRESSED' : 'FULLY_ADDRESSED',
      recommendation: hasAdversarialPayload ? 'REJECT' : 'ACCEPT',
      issueAnalysis: {
        issueSummary: 'Original GitHub issue requirements and problem specification.',
        problemStatement: 'Problem described in the GitHub issue.',
        expectedBehavior: 'Expected functionality and constraints specified in the issue.'
      },
      implementationAnalysis: {
        prSummary: 'PR implements the requested feature and resolves the problem in the issue.',
        changesSummary: 'All changed files and diffs provide appropriate logic matching the issue.'
      },
      requirementAnalysis,
      criticalIssues: [],
      majorIssues: [],
      minorSuggestions: [
        {
          filePath: targetFile,
          lineNumber: 25,
          message: 'Consider adding explicit JSDoc annotations to public exported methods.'
        }
      ],
      securityFindings,
      codeQualityFindings: [
        'Clean modular function boundaries.',
        'Proper error propagation.'
      ],
      performanceFindings: [
        'Execution complexity is linear O(n).'
      ],
      positiveFindings: [
        'Well structured modular design with explicit error boundaries.'
      ],
      missingFunctionality: [],
      testCoverageAssessment: 'Automated test suite covers standard execution paths and boundary conditions.',
      confidenceLevel: 'HIGH'
    };

    return {
      rawText: JSON.stringify(defaultOutput),
      parsedJson: defaultOutput,
      model: this.defaultModel,
      provider: this.name,
      usage: { promptTokens: 300, completionTokens: 400, totalTokens: 700 }
    };
  }
}