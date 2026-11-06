import React, { useState } from 'react';
import { TaskStatus, PaymentStatus } from '@openproofpay/shared';
import {
  Code2,
  GitPullRequest,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  ExternalLink,
  Send,
  UserCheck,
  GitBranch
} from 'lucide-react';

interface DeveloperWorkspaceProps {
  tasks: any[];
  currentUserId?: string;
  onStartTask: (task: any) => void;
  onSubmitPR: (task: any) => void;
  onInspectEvidence: (task: any) => void;
  onClaimTask?: (task: any) => void;
}

export const DeveloperWorkspace: React.FC<DeveloperWorkspaceProps> = ({
  tasks,
  currentUserId,
  onStartTask,
  onSubmitPR,
  onInspectEvidence,
  onClaimTask
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    tasks.length > 0 ? (tasks[0].id || tasks[0]._id) : null
  );
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionSubmitted, setRevisionSubmitted] = useState(false);

  const selectedTask = tasks.find((t) => (t.id || t._id) === selectedTaskId) || tasks[0];

  const handleSendRevisionResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNotes.trim()) return;
    setRevisionSubmitted(true);
    setTimeout(() => {
      setRevisionSubmitted(false);
      setRevisionNotes('');
      alert('Revision explanation recorded for employer review.');
    }, 1000);
  };

  const isAssignedToMe = selectedTask?.assignedDeveloperId === currentUserId;
  const isUnassigned = !selectedTask?.assignedDeveloperId;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', height: '100%' }}>
      {/* Left Column: Assigned Task Queue */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code2 size={16} style={{ color: 'var(--accent-green)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              Developer Tasks ({tasks.length})
            </span>
          </div>
        </div>

        {/* Task Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {tasks.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No bounty tasks available.
            </div>
          ) : (
            tasks.map((task) => {
              const taskId = task.id || task._id;
              const isSelected = taskId === (selectedTask?.id || selectedTask?._id);
              const isApproved = task.status === TaskStatus.APPROVED || task.status === TaskStatus.PAYMENT_COMPLETED;
              const isRevision = task.status === TaskStatus.REVISION_REQUESTED;

              return (
                <div
                  key={taskId}
                  onClick={() => setSelectedTaskId(taskId)}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                    border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                      {task.title}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--accent-green)'
                      }}
                    >
                      ${task.paymentAmount ?? task.bountyAmount ?? 250}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        backgroundColor: isApproved
                          ? 'rgba(16, 185, 129, 0.2)'
                          : isRevision
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(245, 158, 11, 0.2)',
                        color: isApproved ? '#34d399' : isRevision ? '#f87171' : '#fbbf24',
                        fontWeight: 600
                      }}
                    >
                      {task.status?.replace(/_/g, ' ')}
                    </span>

                    <span style={{ color: 'var(--text-muted)' }}>
                      {!task.assignedDeveloperId ? 'Open Bounty' : 'Claimed'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Deep Task Detail & Proof-to-Pay Workflow */}
      {selectedTask ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto'
          }}
        >
          {/* GitHub Workflow Guidance Banner */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              fontSize: '12px',
              color: '#93c5fd'
            }}
          >
            <GitBranch size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ lineHeight: '1.5' }}>
              <strong>GitHub-First Workflow:</strong> You do not need to install any extension.
              Work directly on GitHub: clone repository &rarr; create your branch &rarr; satisfy acceptance criteria &rarr; open a PR referencing{' '}
              <code>Fixes #{selectedTask.githubIssueNumber || 'issue_number'}</code>.
              OpenProofPay detects your PR automatically via Webhooks, runs Gemini AI verification, and triggers container tests!
            </div>
          </div>

          {/* Milestone Header Card */}
          <div
            style={{
              padding: '20px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                  {selectedTask.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {selectedTask.description || 'No deliverable description provided.'}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent-green)' }}>
                  ${selectedTask.paymentAmount ?? selectedTask.bountyAmount ?? 250} USD
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                  <Clock size={11} />
                  Milestone Bounty
                </div>
              </div>
            </div>

            {/* Quick Actions Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-color)',
                flexWrap: 'wrap'
              }}
            >
              {/* Claim Task Button (Explicit Developer Claiming) */}
              {isUnassigned && onClaimTask && (
                <button
                  onClick={() => onClaimTask(selectedTask)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    backgroundColor: 'var(--accent-green)',
                    color: '#000',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <UserCheck size={14} />
                  Claim Bounty Task
                </button>
              )}

              {(selectedTask.status === TaskStatus.CREATED || selectedTask.status === TaskStatus.ASSIGNED) && isAssignedToMe && (
                <button
                  onClick={() => onStartTask(selectedTask)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: 'var(--accent-green)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <Play size={13} />
                  Start Milestone Task
                </button>
              )}

              <button
                onClick={() => onSubmitPR(selectedTask)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <GitPullRequest size={13} />
                Import / Submit PR
              </button>

              <button
                onClick={() => onInspectEvidence(selectedTask)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <ShieldCheck size={14} />
                Deep Verification Inspector
              </button>

              {selectedTask.githubIssueUrl && (
                <a
                  href={selectedTask.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--accent-blue)',
                    marginLeft: 'auto'
                  }}
                >
                  <ExternalLink size={13} />
                  GitHub Issue #{selectedTask.githubIssueNumber}
                </a>
              )}
            </div>
          </div>

          {/* Real-Time Payment Status Tracker */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Financial Status (PayPal Sandbox)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color:
                      selectedTask.payment?.status === PaymentStatus.CAPTURED ||
                      selectedTask.payment?.status === PaymentStatus.PAID_OUT
                        ? '#34d399'
                        : '#60a5fa'
                  }}
                >
                  {selectedTask.payment?.status === PaymentStatus.AUTHORIZED
                    ? 'BOUNTY PRE-AUTHORIZED (FUNDS RESERVED)'
                    : selectedTask.payment?.status === PaymentStatus.CAPTURED
                    ? 'CAPTURED & PAID OUT TO DEVELOPER'
                    : selectedTask.payment?.status || 'AWAITING EMPLOYER PRE-AUTHORIZATION'}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Developer Claim Status:{' '}
              <code>{selectedTask.assignedDeveloperId ? 'Assigned' : 'Unassigned (Open for Claim)'}</code>
            </div>
          </div>

          {/* Structured Acceptance Criteria Checklist */}
          <div
            style={{
              padding: '18px 20px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>
              Structured Acceptance Criteria Checklist
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedTask.acceptanceCriteria?.map((criterion: any, idx: number) => {
                return (
                  <div
                    key={criterion.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <CheckCircle2 size={16} style={{ color: 'var(--accent-blue)', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                          {criterion.title || `Criterion #${idx + 1}`}
                        </span>
                        {criterion.mandatory && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171'
                            }}
                          >
                            MANDATORY GATE
                          </span>
                        )}
                        {criterion.category && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            [{criterion.category}]
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {criterion.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Revision Response Console (if Revision Requested) */}
          {selectedTask.status === TaskStatus.REVISION_REQUESTED && (
            <div
              style={{
                padding: '18px 20px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <RotateCcw size={16} style={{ color: '#f87171' }} />
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f87171' }}>
                  Employer Revision Requested
                </h4>
              </div>

              {selectedTask.latestReview?.notes && (
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    fontSize: '12px',
                    color: '#e2e8f0',
                    marginBottom: '12px'
                  }}
                >
                  <strong>Employer Review Notes:</strong> {selectedTask.latestReview.notes}
                </div>
              )}

              <form onSubmit={handleSendRevisionResponse} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={3}
                  placeholder="Explain remediation steps, updated commits, or questions for employer..."
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={revisionSubmitted || !revisionNotes.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--accent-red)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={12} />
                    {revisionSubmitted ? 'Recorded...' : 'Submit Revision Explanation'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          Select a task to inspect details
        </div>
      )}
    </div>
  );
};
