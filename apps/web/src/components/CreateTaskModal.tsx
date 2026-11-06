import React, { useState, useEffect } from 'react';
import { webApi } from '../services/api.js';
import {
  IAcceptanceCriterion,
  CriterionCategory
} from '@openproofpay/shared';
import { Plus, Trash2, X, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

interface CreateTaskModalProps {
  projects: any[];
  onClose: () => void;
  onSuccess: () => void;
  onCreateProject?: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  projects,
  onClose,
  onSuccess,
  onCreateProject
}) => {
  const [projectId, setProjectId] = useState(projects[0]?.id || projects[0]?._id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('250');
  const [minScore, setMinScore] = useState('80');
  const [issueNumber, setIssueNumber] = useState('');
  const [issueUrl, setIssueUrl] = useState('');
  const [criteria, setCriteria] = useState<IAcceptanceCriterion[]>([
    {
      id: 'crit-1',
      title: 'Automated CI/CD Validation',
      description: 'Unit and integration tests run in container with 0 failures',
      mandatory: true,
      category: CriterionCategory.TESTING
    },
    {
      id: 'crit-2',
      title: 'Security Vulnerability Gate',
      description: 'Zero hardcoded credentials, plain tokens, or timing leaks',
      mandatory: true,
      category: CriterionCategory.SECURITY
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoIssues, setRepoIssues] = useState<any[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // Sync selected projectId whenever projects array updates & load repo issues
  useEffect(() => {
    const validFirstId = projects[0]?.id || projects[0]?._id || '';
    if ((!projectId || !projects.some((p) => (p.id || p._id) === projectId)) && validFirstId) {
      setProjectId(validFirstId);
    }
  }, [projects, projectId]);

  // Fetch open issues from linked repository when project changes
  useEffect(() => {
    const selectedProj = projects.find((p) => (p.id || p._id) === projectId);
    const repoStr = selectedProj?.githubRepo || selectedProj?.githubRepoId?.fullName || selectedProj?.name;

    if (repoStr && repoStr.includes('/')) {
      const [owner, repo] = repoStr.split('/');
      setLoadingIssues(true);
      webApi
        .listRepoIssues(owner, repo)
        .then((res) => {
          if (res.data && Array.isArray(res.data)) {
            setRepoIssues(res.data);
          } else {
            setRepoIssues([]);
          }
        })
        .catch(() => setRepoIssues([]))
        .finally(() => setLoadingIssues(false));
    } else {
      setRepoIssues([]);
    }
  }, [projectId, projects]);

  const handleSelectGitHubIssue = (selectedIssueNumber: string) => {
    if (!selectedIssueNumber) return;
    const issue = repoIssues.find((i) => String(i.number) === selectedIssueNumber);
    if (issue) {
      setTitle(issue.title || '');
      setDescription(issue.body ? issue.body.substring(0, 1500) : issue.title || '');
      setIssueNumber(String(issue.number));
      setIssueUrl(issue.htmlUrl || `https://github.com/issues/${issue.number}`);

      // Add a dedicated criterion for this issue if not already present
      const hasIssueCriterion = criteria.some((c) => c.title?.includes(`Issue #${issue.number}`));
      if (!hasIssueCriterion) {
        setCriteria([
          {
            id: `crit-issue-${issue.number}`,
            title: `Resolve Issue #${issue.number}: ${issue.title.substring(0, 50)}`,
            description: `Full implementation resolving all explicit and implicit requirements of GitHub Issue #${issue.number}`,
            mandatory: true,
            category: CriterionCategory.FUNCTIONAL
          },
          ...criteria
        ]);
      }
    }
  };

  const handleAddCriterion = () => {
    const newId = `crit-${criteria.length + 1}`;
    setCriteria([
      ...criteria,
      {
        id: newId,
        title: '',
        description: '',
        mandatory: true,
        category: CriterionCategory.FUNCTIONAL
      }
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (criteria.length <= 1) return;
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleCriterionChange = (index: number, field: keyof IAcceptanceCriterion, value: any) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value } as IAcceptanceCriterion;
    setCriteria(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (projects.length === 0 || !projectId) {
      setError('You must create and select a Parent Project before publishing milestone tasks.');
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      setError('Task deliverable title must be at least 3 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError('Deliverable description must be at least 5 characters.');
      return;
    }

    // Auto-prefix URL scheme if user forgot https://
    let formattedIssueUrl = issueUrl.trim() || undefined;
    if (formattedIssueUrl && !/^https?:\/\//i.test(formattedIssueUrl)) {
      formattedIssueUrl = `https://${formattedIssueUrl}`;
    }

    // Filter valid criteria and ensure min length
    const validCriteria = criteria
      .filter((c) => c.description && c.description.trim().length > 0)
      .map((c, idx) => ({
        id: c.id || `crit-${idx + 1}`,
        title: c.title?.trim() || `Criterion #${idx + 1}`,
        description: c.description.trim().length < 3 ? `${c.description.trim()} requirement` : c.description.trim(),
        mandatory: Boolean(c.mandatory),
        category: c.category || CriterionCategory.FUNCTIONAL
      }));

    setLoading(true);
    setError(null);

    try {
      await webApi.createTask({
        projectId,
        title: title.trim(),
        description: description.trim(),
        paymentAmount: Number(paymentAmount) || 250,
        bountyAmount: Number(paymentAmount) || 250,
        currency: 'USD',
        minVerificationScore: Number(minScore) || 80,
        issueNumber: issueNumber ? Number(issueNumber) : undefined,
        issueUrl: formattedIssueUrl,
        acceptanceCriteria: validCriteria
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '720px',
          maxWidth: '100%',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--accent-blue)' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
              Create Milestone Task & Structured Criteria
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          {projects.length === 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.35)',
                color: '#fef08a',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} style={{ color: '#eab308', flexShrink: 0 }} />
                <span>
                  <strong>No Projects Found:</strong> You must create an Engineering Project first before publishing milestone tasks.
                </span>
              </div>
              {onCreateProject && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCreateProject();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '5px',
                    backgroundColor: '#eab308',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Layers size={13} />
                  + Create Project First
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Parent Project *
              </label>
              <select
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              >
                {projects.length === 0 ? (
                  <option value="">No projects available (Create one first)</option>
                ) : (
                  projects.map((p) => {
                    const id = p.id || p._id;
                    return (
                      <option key={id} value={id}>
                        {p.name}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Bounty ($ USD) *
              </label>
              <input
                type="number"
                required
                min="1"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Min AI Score (0-100)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* GitHub Issue Selector */}
          {repoIssues.length > 0 && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#93c5fd' }}>
                Import from Repository Issue (Auto-populates title, description &amp; issue URL):
              </label>
              <select
                onChange={(e) => handleSelectGitHubIssue(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              >
                <option value="">-- Choose an open issue from GitHub ({repoIssues.length} available) --</option>
                {repoIssues.map((issue) => (
                  <option key={issue.number} value={issue.number}>
                    #{issue.number}: {issue.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loadingIssues && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Fetching open issues from connected GitHub repository...
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Task Deliverable Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Implement OAuth2 client credentials caching in PayPalClient"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Deliverable Description & Requirements *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Detail the technical expectations, API contracts, and edge cases to handle..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          {/* GitHub Issue Link (Optional) */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                GitHub Issue #
              </label>
              <input
                type="number"
                placeholder="42"
                value={issueNumber}
                onChange={(e) => setIssueNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                GitHub Issue URL
              </label>
              <input
                type="url"
                placeholder="https://github.com/org/repo/issues/42"
                value={issueUrl}
                onChange={(e) => setIssueUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: '#fff',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* Structured Acceptance Criteria Builder */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                  Structured Acceptance Criteria (Proof-to-Pay Gates)
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Criteria evaluated by the autonomous AI Verification Engine and containerized test runner
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddCriterion}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  cursor: 'pointer'
                }}
              >
                <Plus size={12} />
                Add Criterion
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {criteria.map((c, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Criterion Title (e.g. Zero credential leak)"
                      value={c.title || ''}
                      onChange={(e) => handleCriterionChange(index, 'title', e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--input-bg)',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                    />

                    <select
                      value={c.category || CriterionCategory.FUNCTIONAL}
                      onChange={(e) => handleCriterionChange(index, 'category', e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--input-bg)',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                    >
                      <option value={CriterionCategory.FUNCTIONAL}>FUNCTIONAL</option>
                      <option value={CriterionCategory.SECURITY}>SECURITY</option>
                      <option value={CriterionCategory.TESTING}>TESTING</option>
                      <option value={CriterionCategory.PERFORMANCE}>PERFORMANCE</option>
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={c.mandatory}
                        onChange={(e) => handleCriterionChange(index, 'mandatory', e.target.checked)}
                      />
                      Mandatory
                    </label>

                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="Specific verifiable description (e.g. Secrets must only be read from process.env)"
                    value={c.description}
                    onChange={(e) => handleCriterionChange(index, 'description', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || projects.length === 0}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: projects.length === 0 ? 'rgba(59, 130, 246, 0.4)' : 'var(--accent-blue)',
                border: 'none',
                color: '#fff',
                cursor: loading || projects.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {loading
                ? 'Creating Task...'
                : projects.length === 0
                ? 'Project Required'
                : 'Publish Milestone Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
