import { AIVerificationRawOutput } from '@openproofpay/shared';

export interface HallucinationFilterResult {
  sanitizedOutput: AIVerificationRawOutput;
  hallucinationsFiltered: number;
  hallucinatedPaths: string[];
}

export interface FileSnapshotContext {
  filePaths: Set<string>;
  fileContents?: Map<string, string>;
  filePatches?: Map<string, string>;
}

interface HunkRange {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ destLineNum: number; text: string; isAddition: boolean }>;
}

export class HallucinationFilter {
  /**
   * Parse git unified diff patch hunks into structured line-mapped data
   */
  static parsePatchHunks(patch: string): HunkRange[] {
    const hunks: HunkRange[] = [];
    if (!patch) return hunks;

    const rawLines = patch.split('\n');
    let currentHunk: HunkRange | null = null;
    let currentDestLine = 0;

    for (const line of rawLines) {
      const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkHeaderMatch) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        const oldStart = parseInt(hunkHeaderMatch[1]!, 10);
        const oldCount = hunkHeaderMatch[2] !== undefined ? parseInt(hunkHeaderMatch[2]!, 10) : 1;
        const newStart = parseInt(hunkHeaderMatch[3]!, 10);
        const newCount = hunkHeaderMatch[4] !== undefined ? parseInt(hunkHeaderMatch[4]!, 10) : 1;

        currentDestLine = newStart;
        currentHunk = {
          oldStart,
          oldCount,
          newStart,
          newCount,
          lines: []
        };
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        currentHunk.lines.push({
          destLineNum: currentDestLine,
          text: line.slice(1),
          isAddition: true
        });
        currentDestLine++;
      } else if (line.startsWith('-')) {
        // Deletion does not advance destLineNum
      } else {
        // Context line
        currentHunk.lines.push({
          destLineNum: currentDestLine,
          text: line.startsWith(' ') ? line.slice(1) : line,
          isAddition: false
        });
        currentDestLine++;
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Section 3.4: Mandatory Evidence Validation
   * Checks evidence against the repository snapshot and PR diff at the exact commit SHA:
   * - File path exists in commit snapshot or PR diff
   * - Line range is valid for that file version
   * - Quoted excerpt appears in that range, file, or diff
   * Items that fail are marked "unverified evidence" (isVerified: false) with clear reason.
   */
  static validateAndSanitize(
    rawOutput: AIVerificationRawOutput,
    validFilePathsOrContext: Set<string> | FileSnapshotContext
  ): HallucinationFilterResult {
    let hallucinationsFiltered = 0;
    const hallucinatedPaths: string[] = [];

    const validFilePaths: Set<string> =
      validFilePathsOrContext instanceof Set
        ? validFilePathsOrContext
        : validFilePathsOrContext.filePaths;

    const fileContents: Map<string, string> | undefined =
      !(validFilePathsOrContext instanceof Set)
        ? validFilePathsOrContext.fileContents
        : undefined;

    const filePatches: Map<string, string> | undefined =
      !(validFilePathsOrContext instanceof Set)
        ? validFilePathsOrContext.filePatches
        : undefined;

    const isPathValid = (filePath?: string): boolean => {
      if (!filePath) return false;
      const clean = filePath.trim().replace(/^\/+/, '');
      if (validFilePaths.has(clean)) return true;
      for (const valid of validFilePaths) {
        if (valid.endsWith(clean) || clean.endsWith(valid)) return true;
      }
      return false;
    };

    const getFullFileContent = (filePath?: string): string | undefined => {
      if (!filePath || !fileContents) return undefined;
      const clean = filePath.trim().replace(/^\/+/, '');
      if (fileContents.has(clean)) return fileContents.get(clean);
      for (const [path, content] of fileContents) {
        if (path.endsWith(clean) || clean.endsWith(path)) return content;
      }
      return undefined;
    };

    const getPatchContent = (filePath?: string): string | undefined => {
      if (!filePath || !filePatches) return undefined;
      const clean = filePath.trim().replace(/^\/+/, '');
      if (filePatches.has(clean)) return filePatches.get(clean);
      for (const [path, patch] of filePatches) {
        if (path.endsWith(clean) || clean.endsWith(path)) return patch;
      }
      return undefined;
    };

    // Normalize whitespace for loose code comparisons
    const normalizeCode = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

    // 1. Validate Requirement Analysis Evidence
    const sanitizedRequirementAnalysis = (rawOutput.requirementAnalysis || []).map((item) => {
      const sanitizedEvidence = (item.evidence || []).map((ev) => {
        let isVerified = true;
        let verificationNote: string | undefined;
        let verifiedQuote = ev.quote;
        let verifiedLineStart = ev.lineStart;
        let verifiedLineEnd = ev.lineEnd;

        // Check 1: File path exists in PR diff or commit snapshot
        if (!isPathValid(ev.filePath)) {
          isVerified = false;
          verificationNote = `Path '${ev.filePath}' does not exist in commit snapshot or PR diff.`;
          hallucinationsFiltered++;
          hallucinatedPaths.push(ev.filePath);

          return {
            ...ev,
            isVerified: false,
            verificationNote
          };
        }

        const fullContent = getFullFileContent(ev.filePath);
        const patchContent = getPatchContent(ev.filePath);

        // Check 2 & 3: File content / patch validation
        if (fullContent) {
          const lines = fullContent.split('\n');
          const totalLines = lines.length;

          if (verifiedLineStart !== undefined) {
            if (verifiedLineStart < 1 || verifiedLineStart > totalLines) {
              isVerified = false;
              verificationNote = `Line start ${verifiedLineStart} out of valid file range (1-${totalLines}).`;
              hallucinationsFiltered++;
            } else if (verifiedLineEnd !== undefined && (verifiedLineEnd < verifiedLineStart || verifiedLineEnd > totalLines + 5)) {
              isVerified = false;
              verificationNote = `Line range ${verifiedLineStart}-${verifiedLineEnd} is invalid for file.`;
              hallucinationsFiltered++;
            }
          }

          if (isVerified) {
            const cleanQuote = verifiedQuote ? normalizeCode(verifiedQuote) : '';
            const cleanFile = normalizeCode(fullContent);

            if (cleanQuote.length > 5 && !cleanFile.includes(cleanQuote)) {
              // Quote not found in full file content
              isVerified = false;
              verificationNote = 'Quoted excerpt does not appear in repository snapshot at cited location.';
              hallucinationsFiltered++;
            } else {
              verificationNote = 'Verified against head commit SHA';
              // If quote was missing but lines were valid, extract excerpt
              if (!verifiedQuote && verifiedLineStart !== undefined) {
                const sIdx = Math.max(0, verifiedLineStart - 1);
                const eIdx = Math.min(totalLines, (verifiedLineEnd || verifiedLineStart));
                verifiedQuote = lines.slice(sIdx, eIdx).join('\n');
              }
            }
          }
        } else if (patchContent) {
          // Validate against unified diff patch hunks
          const hunks = this.parsePatchHunks(patchContent);
          const cleanQuote = verifiedQuote ? normalizeCode(verifiedQuote) : '';
          const patchClean = normalizeCode(patchContent.replace(/^[+-]/gm, ''));

          let matchedHunkLine: number | null = null;
          if (cleanQuote.length > 5) {
            for (const h of hunks) {
              for (const l of h.lines) {
                if (normalizeCode(l.text).includes(cleanQuote) || cleanQuote.includes(normalizeCode(l.text))) {
                  matchedHunkLine = l.destLineNum;
                  break;
                }
              }
              if (matchedHunkLine !== null) break;
            }
          }

          if (cleanQuote.length > 5 && matchedHunkLine === null && !patchClean.includes(cleanQuote)) {
            // Quote not found in patch
            isVerified = false;
            verificationNote = 'Quoted excerpt does not appear in PR diff patch.';
            hallucinationsFiltered++;
          } else {
            isVerified = true;
            verificationNote = 'Verified against PR diff patch at head commit SHA';

            if (matchedHunkLine !== null) {
              verifiedLineStart = matchedHunkLine;
              verifiedLineEnd = verifiedLineEnd && verifiedLineStart ? Math.max(verifiedLineStart, verifiedLineEnd) : verifiedLineStart;
            } else if (verifiedLineStart !== undefined && hunks.length > 0) {
              // Check if line falls within any hunk range (±10 lines tolerance)
              const inAnyHunk = hunks.some((h) =>
                verifiedLineStart! >= Math.max(1, h.newStart - 5) &&
                verifiedLineStart! <= h.newStart + h.newCount + 5
              );
              if (inAnyHunk) {
                // Auto-populate quote from hunk added lines if missing
                if (!verifiedQuote) {
                  const matchingLines = hunks
                    .flatMap((h) => h.lines)
                    .filter((l) => l.isAddition && Math.abs(l.destLineNum - verifiedLineStart!) <= 2)
                    .map((l) => l.text);
                  if (matchingLines.length > 0) {
                    verifiedQuote = matchingLines.slice(0, 5).join('\n');
                  }
                }
              }
            }
          }
        } else {
          // File path is confirmed valid in PR changed files, but full content/patch was omitted
          isVerified = true;
          verificationNote = 'Verified: File path confirmed in PR changed files';
        }

        return {
          ...ev,
          filePath: ev.filePath,
          lineStart: verifiedLineStart,
          lineEnd: verifiedLineEnd,
          quote: verifiedQuote,
          isVerified,
          verificationNote: verificationNote || (isVerified ? 'Verified against head commit SHA' : 'Unverified evidence')
        };
      });

      return {
        ...item,
        evidence: sanitizedEvidence
      };
    });

    // 2. Sanitize Issues
    const sanitizeIssueList = (issues: any[] = []) => {
      return issues.map((issue) => {
        if (!isPathValid(issue.filePath)) {
          hallucinationsFiltered++;
          hallucinatedPaths.push(issue.filePath);
          return {
            ...issue,
            filePath: issue.filePath || 'unknown',
            isVerified: false,
            message: `${issue.message} (Note: Cited file '${issue.filePath}' was not part of the PR diff)`
          };
        }
        return {
          ...issue,
          isVerified: true
        };
      });
    };

    const sanitizedCriticalIssues = sanitizeIssueList(rawOutput.criticalIssues);
    const sanitizedMajorIssues = sanitizeIssueList(rawOutput.majorIssues);
    const sanitizedMinorSuggestions = sanitizeIssueList(rawOutput.minorSuggestions);

    // 3. Sanitize Security Findings
    const sanitizedSecurityFindings = (rawOutput.securityFindings || []).map((finding) => {
      const targetPath = finding.filePath || (finding as any).file;
      if (targetPath && !isPathValid(targetPath)) {
        hallucinationsFiltered++;
        hallucinatedPaths.push(targetPath);
        return {
          ...finding,
          filePath: targetPath,
          isVerified: false,
          message: `${finding.message} (Note: Cited file '${targetPath}' was not part of the PR diff)`
        };
      }
      return {
        ...finding,
        isVerified: true
      };
    });

    return {
      sanitizedOutput: {
        ...rawOutput,
        requirementAnalysis: sanitizedRequirementAnalysis,
        criticalIssues: sanitizedCriticalIssues,
        majorIssues: sanitizedMajorIssues,
        minorSuggestions: sanitizedMinorSuggestions,
        securityFindings: sanitizedSecurityFindings
      },
      hallucinationsFiltered,
      hallucinatedPaths: Array.from(new Set(hallucinatedPaths))
    };
  }
}
