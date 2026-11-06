import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient.js';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import {
  GitPullRequest,
  Cpu,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  PlayCircle,
  FileCode2,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';

interface SubmissionItem {
  id: string;
  taskId: string;
  prNumber: number;
  prUrl: string;
  headSha: string;
  title: string;
  status: string;
  additions: number;
  deletions: number;
  submittedAt: string;
  verificationReport?: {
    overallScore: number;
    score?: number;
    scoreBreakdown?: {
      criteriaScore: number;
      testExecutionScore: number;
      securityScore: number;
      qualityScore: number;
      totalScore: number;
    };
    status: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW';
    verdict?: string;
    overallAssessment: string;
    summary?: string;
    isOutdated: boolean;
    isDecisionSupportOnly: boolean;
    requirementAnalysis?: Array<{
      criterionId?: string;
      criterionTitle?: string;
      requirement?: string;
      satisfied: boolean;
      status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'UNSATISFIED';
      explanation?: string;
      evidence?: Array<{
        filePath: string;
        lineStart?: number;
        lineEnd?: number;
        explanation: string;
      }>;
    }>;
    criticalIssues?: Array<{ filePath: string; lineNumber?: number; message: string }>;
    majorIssues?: Array<{ filePath: string; lineNumber?: number; message: string }>;
    minorSuggestions?: Array<{ filePath: string; lineNumber?: number; message: string }>;
    securityFindings: Array<{
      severity: string;
      type?: string;
      message: string;
      filePath?: string;
      lineNumber?: number;
    }>;
  };
  testExecution?: {
    status: 'PASSED' | 'FAILED' | 'COULD_NOT_EXECUTE' | 'NOT_CONFIGURED';
    totalTests: number;
    passedTests: number;
    failedTests: number;
    sanitizedLogs: string;
  };
}

export const SubmissionsView: React.FC = () => {
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const res = await apiClient.listSubmissions();
      setSubmissions(res.data || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleTriggerVerification = async (sub: SubmissionItem) => {
    try {
      setVerifyingId(sub.id);
      setVerifyMessage(null);
      await apiClient.triggerVerification(sub.taskId, sub.id);
      setVerifyMessage(`AI Verification completed for PR #${sub.prNumber}!`);
      setTimeout(() => setVerifyMessage(null), 4000);
      await loadSubmissions();
      setExpandedId(sub.id);
    } catch (err: unknown) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setVerifyingId(null);
    }
  };

  if (loading && submissions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="6rem" count={3} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          PR Submissions & AI Proofs
        </h2>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Multi-layer verification: Static LLM code analysis + containerized test execution.
        </p>
      </div>

      {verifyMessage && (
        <div style={{
          padding: '0.6rem 0.8rem',
          borderRadius: '0.375rem',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          color: '#10b981',
          fontSize: '0.75rem',
          fontWeight: 600
        }}>
          {verifyMessage}
        </div>
      )}

      {submissions.length === 0 ? (
        <EmptyState
          title="No PR Submissions yet"
          description="When a developer opens a Pull Request linking a milestone issue, AI verification and test execution trigger automatically."
          icon={GitPullRequest}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {submissions.map((sub) => {
            const isExpanded = expandedId === sub.id;
            const report = sub.verificationReport;
            const tests = sub.testExecution;
            const score = report?.overallScore ?? report?.score ?? 0;

            return (
              <div
                key={sub.id}
                style={{
                  borderRadius: '0.65rem',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header Card */}
                <div style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <GitPullRequest size={15} color="var(--accent-blue)" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          PR #{sub.prNumber}: {sub.title}
                        </span>
                      </div>
                      <a
                        href={sub.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--accent-blue)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          marginTop: '0.15rem'
                        }}
                      >
                        GitHub PR <ExternalLink size={10} />
                      </a>
                    </div>
                    <StatusBadge status={sub.status} />
                  </div>

                  {/* Diff Stat Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem' }}>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>+{sub.additions}</span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>-{sub.deletions}</span>
                    <span style={{ color: 'var(--text-muted)' }}>SHA: {sub.headSha.substring(0, 7)}</span>
                  </div>

                  {/* Outdated Report Warning Banner */}
                  {report?.isOutdated && (
                    <div style={{
                      padding: '0.45rem 0.65rem',
                      borderRadius: '0.35rem',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.7rem',
                      color: '#f59e0b'
                    }}>
                      <AlertTriangle size={13} />
                      <span>Notice: A newer commit exists. This assessment applies to earlier SHA.</span>
                    </div>
                  )}

                  {/* Verification Score Card */}
                  {report && (
                    <div
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '0.375rem',
                        backgroundColor: 'var(--input-bg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <ShieldCheck size={16} color={score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'} />
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            AI Verification Assessment
                          </span>
                          <span style={{
                            fontSize: '0.6rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '0.2rem',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            color: 'var(--accent-blue)',
                            fontWeight: 600
                          }}>
                            DECISION-SUPPORT
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            color: score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
                          }}
                        >
                          {score}/100 ({report.status})
                        </span>
                      </div>

                      {/* 4-Part Transparent Score Breakdown */}
                      {report.scoreBreakdown && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem', paddingTop: '0.3rem', borderTop: '1px solid var(--border-color)', fontSize: '0.65rem' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Criteria: </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.scoreBreakdown.criteriaScore}/40</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Tests: </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.scoreBreakdown.testExecutionScore}/25</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Security: </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.scoreBreakdown.securityScore}/20</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Quality: </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.scoreBreakdown.qualityScore}/15</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
                    <button
                      onClick={() => handleTriggerVerification(sub)}
                      disabled={verifyingId === sub.id}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.3rem',
                        color: 'var(--accent-blue)',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: verifyingId === sub.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem'
                      }}
                    >
                      {verifyingId === sub.id ? (
                        <><Loader2 size={12} className="animate-spin" /> Verifying...</>
                      ) : (
                        <><PlayCircle size={12} /> Run AI Verification</>
                      )}
                    </button>

                    <button
                      onClick={() => toggleExpand(sub.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-blue)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem'
                      }}
                    >
                      {isExpanded ? (
                        <>Hide Inspection <ChevronUp size={13} /></>
                      ) : (
                        <>Inspect Evidence & Logs <ChevronDown size={13} /></>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Inspection Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '0.9rem',
                      borderTop: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem'
                    }}
                  >
                    {/* 1. AI Review Summary */}
                    {report && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            ASSESSMENT EXECUTIVE SUMMARY:
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {report.overallAssessment || report.summary}
                          </p>
                        </div>

                        {/* Per-Criterion Evidence Breakdown */}
                        {report.requirementAnalysis && report.requirementAnalysis.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              CRITERIA SATISFACTION & CODE EVIDENCE:
                            </span>
                            {report.requirementAnalysis.map((c, idx) => (
                              <div
                                key={c.criterionId || idx}
                                style={{
                                  padding: '0.45rem',
                                  borderRadius: '0.35rem',
                                  backgroundColor: 'var(--input-bg)',
                                  border: '1px solid var(--card-border)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.25rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {c.satisfied ? (
                                      <CheckCircle2 size={13} color="#10b981" />
                                    ) : (
                                      <XCircle size={13} color="#ef4444" />
                                    )}
                                    <span>{c.criterionTitle || c.requirement || `Criterion #${idx + 1}`}</span>
                                  </div>
                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    color: c.satisfied ? '#10b981' : '#ef4444'
                                  }}>
                                    {c.status}
                                  </span>
                                </div>

                                {c.evidence && c.evidence.map((ev, eIdx) => (
                                  <div key={eIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                    <FileCode2 size={12} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                                    <div>
                                      <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                                        {ev.filePath}{ev.lineStart ? `:${ev.lineStart}-${ev.lineEnd}` : ''}:
                                      </span>{' '}
                                      <span>{ev.explanation}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Security Findings with Severity Badges */}
                        {report.securityFindings && report.securityFindings.length > 0 && (
                          <div style={{ marginTop: '0.35rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ef4444' }}>
                              Security Findings ({report.securityFindings.length}):
                            </span>
                            {report.securityFindings.map((f, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#f87171',
                                  marginTop: '0.2rem',
                                  padding: '0.35rem 0.5rem',
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  borderRadius: '0.25rem'
                                }}
                              >
                                <span style={{ fontWeight: 700 }}>[{f.severity}]</span> {f.type ? `${f.type}: ` : ''}{f.message}
                                {f.filePath && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                    File: {f.filePath}{f.lineNumber ? `:${f.lineNumber}` : ''}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 2. Containerized Test Execution */}
                    {tests && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Cpu size={13} /> FACT-BASED TEST EXECUTION LOGS:
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: tests.status === 'PASSED' ? '#10b981' : tests.status === 'NOT_CONFIGURED' ? 'var(--text-muted)' : '#ef4444' }}>
                            {tests.passedTests}/{tests.totalTests} Passed ({tests.status})
                          </span>
                        </div>

                        {tests.sanitizedLogs && (
                          <pre
                            style={{
                              marginTop: '0.35rem',
                              padding: '0.6rem',
                              borderRadius: '0.375rem',
                              backgroundColor: '#000000',
                              color: '#38bdf8',
                              fontSize: '0.68rem',
                              fontFamily: 'monospace',
                              overflowX: 'auto',
                              maxHeight: '120px'
                            }}
                          >
                            {tests.sanitizedLogs}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};