import React, { useState, useEffect } from 'react';
import { webApi } from '../services/api.js';
import { GitPullRequest, X, Check } from 'lucide-react';

interface SubmitPRModalProps {
  task: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubmitPRModal: React.FC<SubmitPRModalProps> = ({
  task,
  onClose,
  onSuccess
}) => {
  const [prUrl, setPrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available PRs from GitHub API
  const [repoPrs, setRepoPrs] = useState<any[]>([]);

  useEffect(() => {
    const fetchRepoPRs = async () => {
      setLoadingPRs(true);
      try {
        let owner = '';
        let repo = '';

        const repoFullName = task.githubRepo || task.projectId?.githubRepo;
        if (repoFullName && repoFullName.includes('/')) {
          const parts = repoFullName.split('/');
          owner = parts[0];
          repo = parts[1];
        } else if (task.githubIssueUrl) {
          const match = task.githubIssueUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
          if (match) {
            owner = match[1];
            repo = match[2];
          }
        }

        if (!owner || !repo) {
          const reposRes = await webApi.listRepositories().catch(() => null);
          if (reposRes?.data && reposRes.data.length > 0) {
            const firstRepo = reposRes.data[0];
            const parts = (firstRepo.fullName || firstRepo.name || '').split('/');
            owner = parts[0] || 'owner';
            repo = parts[1] || parts[0] || 'repo';
          }
        }

        if (owner && repo) {
          const prsRes = await webApi.listRepoPullRequests(owner, repo).catch(() => null);
          if (prsRes?.data) {
            setRepoPrs(prsRes.data);
          }
        }
      } catch (err) {
        console.error('Could not load live GitHub PRs:', err);
      } finally {
        setLoadingPRs(false);
      }
    };
    fetchRepoPRs();
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const taskId = task.id || task._id;
      // 1. Submit PR (manual import of existing PR)
      const subRes = await webApi.submitPR(taskId, {
        prUrl: prUrl.trim()
      });

      const submissionId =
        subRes.data?.submission?.id ||
        subRes.data?.submission?._id ||
        subRes.data?.id ||
        subRes.data?._id;

      // 2. Trigger automated AI verification & container test runner
      await Promise.allSettled([
        webApi.triggerVerification(taskId, submissionId),
        webApi.triggerTaskTests(taskId, submissionId)
      ]);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit Pull Request');
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
          width: '580px',
          maxWidth: '95vw',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
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
            <GitPullRequest size={18} style={{ color: 'var(--accent-blue)' }} />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', margin: 0 }}>
                Import Existing Pull Request
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Bounty Task: {task.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Normally, OpenProofPay detects your PRs automatically via GitHub Webhooks whenever you open or update a PR mentioning <code>Fixes #{task.githubIssueNumber || task.issueNumber || 'ID'}</code>.
            Use this form to import a PR created earlier or trigger an immediate verification run.
          </div>

          {/* Quick Select from Live GitHub PRs */}
          {repoPrs.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Select from Open Pull Requests in Connected Repository:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {repoPrs.map((pr) => {
                  const targetUrl = pr.html_url || pr.url;
                  const isSelected = prUrl === targetUrl;
                  return (
                    <button
                      key={pr.id || pr.number}
                      type="button"
                      onClick={() => setPrUrl(targetUrl)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'var(--card-bg)',
                        border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                        color: '#fff',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {isSelected && <Check size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />}
                        <span style={{ fontWeight: 600, color: isSelected ? '#93c5fd' : '#fff' }}>
                          #{pr.number}:
                        </span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pr.title}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {pr.head?.ref || 'branch'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {loadingPRs && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Loading repository pull requests...
            </div>
          )}

          {/* Custom PR URL Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Pull Request URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://github.com/owner/repository/pull/12"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
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
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Gemini AI will fetch the exact PR diff, surrounding context, test suite, and evaluate acceptance criteria.
            </span>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
              disabled={loading || !prUrl.trim()}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                border: 'none',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Fetching PR & Triggering AI...' : 'Import PR & Run Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
