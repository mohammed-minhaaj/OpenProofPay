import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient.js';
import { storageService, GitHubContext } from '../../services/storageService.js';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { Modal } from '../../components/Modal.js';
import { TaskStatus, TaskReviewAction, CriterionCategory } from '@openproofpay/shared';
import {
  CheckSquare,
  Plus,
  ExternalLink,
  DollarSign,
  Loader2,
  Trash2,
  Play,
  ClipboardCheck,
  AlertCircle,
  Github
} from 'lucide-react';

interface TaskItem {
  id: string;
  projectId?: any;
  title: string;
  description: string;
  status: TaskStatus;
  paymentAmount: number;
  currency: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  assignedDeveloperId?: any;
  employerId?: any;
  acceptanceCriteria: Array<{
    id: string;
    title?: string;
    description: string;
    mandatory: boolean;
    category?: string;
  }>;
  latestReview?: {
    action: string;
    reviewerId: string;
    notes?: string;
    feedback?: string;
    reason?: string;
    failedCriteriaIds?: string[];
    failedTestIds?: string[];
    reviewedAt: string;
  };
  createdAt: string;
}

export const TasksView: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [ghContext, setGhContext] = useState<GitHubContext | null>(null);

  // Create Task Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bountyAmount, setBountyAmount] = useState('150');
  const [issueNumber, setIssueNumber] = useState('');
  const [issueUrl, setIssueUrl] = useState('');
  const [criteria, setCriteria] = useState<Array<{
    id: string;
    title: string;
    description: string;
    mandatory: boolean;
    category: CriterionCategory;
  }>>([
    {
      id: 'crit-1',
      title: 'Automated Test Suite',
      description: 'Unit & integration tests passing with zero failures',
      mandatory: true,
      category: CriterionCategory.TESTING
    },
    {
      id: 'crit-2',
      title: 'Security Verification',
      description: 'No plain credentials, SQL injection, or timing attacks',
      mandatory: true,
      category: CriterionCategory.SECURITY
    }
  ]);

  // Review Modal States
  const [reviewTaskTarget, setReviewTaskTarget] = useState<TaskItem | null>(null);
  const [reviewAction, setReviewAction] = useState<TaskReviewAction>(TaskReviewAction.APPROVE);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [failedCriteriaIds, setFailedCriteriaIds] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Action feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchTasksAndProjects = async () => {
    try {
      setLoading(true);
      const [tasksRes, projectsRes, detectedGh] = await Promise.all([
        apiClient.listTasks(),
        apiClient.listProjects().catch(() => ({ data: [] })),
        storageService.getGitHubContext()
      ]);

      setTasks(tasksRes.data || []);
      setProjects(projectsRes.data || []);
      if (projectsRes.data && projectsRes.data.length > 0) {
        setSelectedProjectId(projectsRes.data[0]!.id);
      }
      setGhContext(detectedGh);
    } catch (err: unknown) {
      if (err instanceof Error) setCreateError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndProjects();
  }, []);

  const handleImportCurrentGitHubIssue = () => {
    if (ghContext && ghContext.type === 'issue' && ghContext.number !== undefined) {
      setIssueNumber(ghContext.number.toString());
      setIssueUrl(ghContext.url);
      if (ghContext.title && !title) {
        setTitle(ghContext.title);
      }
    }
  };

  const handleAddCriterion = () => {
    setCriteria([
      ...criteria,
      {
        id: `crit-${Date.now()}`,
        title: `Criterion #${criteria.length + 1}`,
        description: '',
        mandatory: true,
        category: CriterionCategory.FUNCTIONAL
      }
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      if (!selectedProjectId) {
        throw new Error('Please select or create a project workspace first');
      }

      await apiClient.createTask({
        projectId: selectedProjectId,
        title: title.trim(),
        description: description.trim(),
        paymentAmount: parseFloat(bountyAmount) || 50,
        currency: 'USD',
        issueNumber: issueNumber ? parseInt(issueNumber, 10) : undefined,
        issueUrl: issueUrl.trim() || undefined,
        acceptanceCriteria: criteria.filter((c) => c.description.trim().length > 0)
      });

      setIsCreateModalOpen(false);
      setTitle('');
      setDescription('');
      setIssueNumber('');
      setIssueUrl('');
      setActionSuccess('Milestone task created successfully!');
      setTimeout(() => setActionSuccess(null), 4000);
      fetchTasksAndProjects();
    } catch (err: unknown) {
      if (err instanceof Error) setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      setLoading(true);
      await apiClient.startTask(taskId);
      setActionSuccess('Milestone started! Task status changed to IN_PROGRESS.');
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchTasksAndProjects();
    } catch (err: unknown) {
      if (err instanceof Error) alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReviewModal = (task: TaskItem) => {
    setReviewTaskTarget(task);
    setReviewAction(TaskReviewAction.APPROVE);
    setReviewNotes('');
    setReviewFeedback('');
    setReviewReason('');
    setFailedCriteriaIds([]);
    setReviewError(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTaskTarget) return;

    setReviewing(true);
    setReviewError(null);

    try {
      await apiClient.reviewTask(reviewTaskTarget.id, {
        action: reviewAction,
        notes: reviewAction === TaskReviewAction.APPROVE ? reviewNotes.trim() : undefined,
        feedback: reviewAction === TaskReviewAction.REQUEST_REVISION ? reviewFeedback.trim() : undefined,
        reason: reviewAction === TaskReviewAction.REJECT ? reviewReason.trim() : undefined,
        failedCriteriaIds: reviewAction === TaskReviewAction.REQUEST_REVISION ? failedCriteriaIds : undefined
      });

      setReviewTaskTarget(null);
      setActionSuccess(`Review submitted: Task transitioned to ${reviewAction}!`);
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchTasksAndProjects();
    } catch (err: unknown) {
      if (err instanceof Error) setReviewError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const toggleFailedCriterion = (id: string) => {
    setFailedCriteriaIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING_APPROVAL') return t.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL;
    if (filter === 'REVISION') return t.status === TaskStatus.REVISION_REQUESTED;
    if (filter === 'ACTIVE') return t.status !== TaskStatus.CLOSED && t.status !== TaskStatus.PAYMENT_COMPLETED;
    if (filter === 'PAID') return t.status === TaskStatus.PAYMENT_COMPLETED;
    return t.status === filter;
  });

  if (loading && tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="5rem" count={3} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Action Notification Banner */}
      {actionSuccess && (
        <div style={{
          padding: '0.6rem 0.8rem',
          borderRadius: '0.375rem',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          color: '#10b981',
          fontSize: '0.75rem',
          fontWeight: 600
        }}>
          {actionSuccess}
        </div>
      )}

      {/* Header and Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Milestone Tasks
          </h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Proof-to-Pay deliverables linked to GitHub issues.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'var(--accent-blue)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <Plus size={14} /> New Task
        </button>
      </div>

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {['ALL', 'ACTIVE', 'PENDING_APPROVAL', 'REVISION', 'PAID'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: 600,
              border: `1px solid ${filter === f ? 'var(--accent-blue)' : 'var(--border-color)'}`,
              backgroundColor: filter === f ? 'rgba(59, 130, 246, 0.15)' : 'var(--card-bg)',
              color: filter === f ? 'var(--accent-blue)' : 'var(--text-muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description="Create a milestone task and link acceptance criteria."
          icon={CheckSquare}
          actionLabel="Create Task"
          onAction={() => setIsCreateModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredTasks.map((t) => (
            <div
              key={t.id}
              style={{
                padding: '0.9rem',
                borderRadius: '0.65rem',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {t.title}
                  </div>
                  {t.githubIssueNumber && (
                    <a
                      href={t.githubIssueUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        fontSize: '0.7rem',
                        color: 'var(--accent-blue)',
                        marginTop: '0.15rem'
                      }}
                    >
                      Issue #{t.githubIssueNumber} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <StatusBadge status={t.status} />
              </div>

              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {t.description}
              </p>

              {/* Revision Notice Banner */}
              {t.status === TaskStatus.REVISION_REQUESTED && t.latestReview?.feedback && (
                <div style={{
                  padding: '0.6rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f59e0b', fontSize: '0.72rem', fontWeight: 600 }}>
                    <AlertCircle size={13} /> Revision Feedback
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                    "{t.latestReview.feedback}"
                  </div>
                  {t.latestReview.failedCriteriaIds && t.latestReview.failedCriteriaIds.length > 0 && (
                    <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>
                      Failed criteria: {t.latestReview.failedCriteriaIds.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Acceptance Criteria Breakdown */}
              {t.acceptanceCriteria && t.acceptanceCriteria.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    ACCEPTANCE CRITERIA ({t.acceptanceCriteria.length}):
                  </span>
                  {t.acceptanceCriteria.map((c, i) => (
                    <div
                      key={c.id || i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        padding: '0.25rem 0.4rem',
                        borderRadius: '0.25rem',
                        backgroundColor: 'var(--input-bg)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CheckSquare size={12} color={c.mandatory ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                        <span>{c.title ? `${c.title}: ` : ''}{c.description}</span>
                      </div>
                      {c.category && (
                        <span style={{
                          fontSize: '0.62rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '0.25rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: 'var(--accent-blue)'
                        }}>
                          {c.category}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Interactive Action Gates */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#10b981', fontWeight: 600, fontSize: '0.75rem' }}>
                  <DollarSign size={13} />
                  <span>${t.paymentAmount} {t.currency} Bounty</span>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {/* Developer Start Work Button */}
                  {(t.status === TaskStatus.ASSIGNED || t.status === TaskStatus.CREATED) && (
                    <button
                      onClick={() => handleStartTask(t.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <Play size={11} fill="currentColor" /> Start Work
                    </button>
                  )}

                  {/* Employer Review Work Button */}
                  {(t.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL || t.status === TaskStatus.SUBMITTED) && (
                    <button
                      onClick={() => handleOpenReviewModal(t)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: 'var(--accent-blue)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <ClipboardCheck size={13} /> Review Work
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Task */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Milestone Task">
        {createError && (
          <div style={{ padding: '0.5rem', borderRadius: '0.375rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            {createError}
          </div>
        )}

        {/* GitHub Context Import Banner */}
        {ghContext && ghContext.type === 'issue' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderRadius: '0.375rem',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            marginBottom: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--accent-blue)' }}>
              <Github size={14} /> Active Issue #{ghContext.number} Detected
            </div>
            <button
              type="button"
              onClick={handleImportCurrentGitHubIssue}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-blue)',
                fontWeight: 600,
                fontSize: '0.72rem',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Import Details
            </button>
          </div>
        )}

        <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Project Workspace
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Milestone Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement AES-256 Token Encryption"
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Detailed Requirements & Technical Specs
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain technical expectations, architecture boundaries, and testing rules..."
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Bounty Amount (USD)
              </label>
              <input
                type="number"
                min="1"
                required
                value={bountyAmount}
                onChange={(e) => setBountyAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                GitHub Issue #
              </label>
              <input
                type="number"
                value={issueNumber}
                onChange={(e) => setIssueNumber(e.target.value)}
                placeholder="e.g. 42"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Structured Acceptance Criteria
              </label>
              <button
                type="button"
                onClick={handleAddCriterion}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Add Criterion
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '12rem', overflowY: 'auto' }}>
              {criteria.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '0.375rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <input
                      type="text"
                      value={c.title}
                      onChange={(e) => {
                        const updated = [...criteria];
                        updated[i]!.title = e.target.value;
                        setCriteria(updated);
                      }}
                      placeholder="Title"
                      style={{
                        flex: 2,
                        padding: '0.3rem 0.4rem',
                        fontSize: '0.72rem',
                        borderRadius: '0.25rem',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    />
                    <select
                      value={c.category}
                      onChange={(e) => {
                        const updated = [...criteria];
                        updated[i]!.category = e.target.value as CriterionCategory;
                        setCriteria(updated);
                      }}
                      style={{
                        flex: 1.5,
                        padding: '0.3rem 0.4rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.25rem',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--input-bg)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {Object.values(CriterionCategory).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveCriterion(i)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={c.description}
                    onChange={(e) => {
                      const updated = [...criteria];
                      updated[i]!.description = e.target.value;
                      setCriteria(updated);
                    }}
                    placeholder="Specific testable expectation..."
                    style={{
                      width: '100%',
                      padding: '0.3rem 0.4rem',
                      fontSize: '0.72rem',
                      borderRadius: '0.25rem',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                color: '#ffffff',
                border: 'none',
                cursor: creating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create Milestone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Employer Review Gate */}
      <Modal
        isOpen={!!reviewTaskTarget}
        onClose={() => setReviewTaskTarget(null)}
        title="Employer Review Decision Gate"
      >
        {reviewError && (
          <div style={{ padding: '0.5rem', borderRadius: '0.375rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
            {reviewError}
          </div>
        )}

        {reviewTaskTarget && (
          <form onSubmit={handleSubmitReview} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ padding: '0.6rem', borderRadius: '0.375rem', backgroundColor: 'var(--input-bg)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {reviewTaskTarget.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                Bounty: ${reviewTaskTarget.paymentAmount} {reviewTaskTarget.currency}
              </div>
            </div>

            {/* Decision Action Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Review Decision
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setReviewAction(TaskReviewAction.APPROVE)}
                  style={{
                    padding: '0.45rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: `1px solid ${reviewAction === TaskReviewAction.APPROVE ? '#10b981' : 'var(--border-color)'}`,
                    backgroundColor: reviewAction === TaskReviewAction.APPROVE ? 'rgba(16, 185, 129, 0.15)' : 'var(--input-bg)',
                    color: reviewAction === TaskReviewAction.APPROVE ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  ✓ Approve
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction(TaskReviewAction.REQUEST_REVISION)}
                  style={{
                    padding: '0.45rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: `1px solid ${reviewAction === TaskReviewAction.REQUEST_REVISION ? '#f59e0b' : 'var(--border-color)'}`,
                    backgroundColor: reviewAction === TaskReviewAction.REQUEST_REVISION ? 'rgba(245, 158, 11, 0.15)' : 'var(--input-bg)',
                    color: reviewAction === TaskReviewAction.REQUEST_REVISION ? '#f59e0b' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  ↻ Request Revision
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction(TaskReviewAction.REJECT)}
                  style={{
                    padding: '0.45rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: `1px solid ${reviewAction === TaskReviewAction.REJECT ? '#ef4444' : 'var(--border-color)'}`,
                    backgroundColor: reviewAction === TaskReviewAction.REJECT ? 'rgba(239, 68, 68, 0.15)' : 'var(--input-bg)',
                    color: reviewAction === TaskReviewAction.REJECT ? '#ef4444' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  ✕ Reject
                </button>
              </div>
            </div>

            {/* Action Conditional Fields */}
            {reviewAction === TaskReviewAction.APPROVE && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Approval Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Excellent work on timing safe comparison and test coverage."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>
            )}

            {reviewAction === TaskReviewAction.REQUEST_REVISION && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    Revision Feedback (Mandatory, min 5 chars)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reviewFeedback}
                    onChange={(e) => setReviewFeedback(e.target.value)}
                    placeholder="Specify exactly what needs improvement or which tests failed..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.65rem',
                      fontSize: '0.75rem',
                      borderRadius: '0.375rem',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      resize: 'none'
                    }}
                  />
                </div>

                {reviewTaskTarget.acceptanceCriteria && reviewTaskTarget.acceptanceCriteria.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      Mark Failed Criteria
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {reviewTaskTarget.acceptanceCriteria.map((c) => (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.72rem',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={failedCriteriaIds.includes(c.id)}
                            onChange={() => toggleFailedCriterion(c.id)}
                          />
                          <span>{c.title ? `${c.title} — ` : ''}{c.description}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {reviewAction === TaskReviewAction.REJECT && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Documented Reason for Rejection (Mandatory)
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="State technical justification for rejecting this milestone deliverable..."
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setReviewTaskTarget(null)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reviewing}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: reviewAction === TaskReviewAction.APPROVE ? '#10b981' : reviewAction === TaskReviewAction.REQUEST_REVISION ? '#f59e0b' : '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  cursor: reviewing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                {reviewing ? <Loader2 size={14} className="animate-spin" /> : `Confirm ${reviewAction}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};