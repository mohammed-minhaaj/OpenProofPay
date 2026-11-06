import React, { useState, useEffect } from 'react';
import { webApi, UserSession } from '../services/api.js';
import { GitHubMarkdownViewer } from '../components/GitHubMarkdownViewer.js';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Search,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface NewBountyScreenProps {
  user: UserSession;
  projects: any[];
  onNavigate: (screen: string, taskId?: string) => void;
  onRefreshData: () => void;
}

interface FetchedGitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  htmlUrl: string;
  labels: string[];
  assignees?: string[];
  author?: string;
  createdAt?: string;
}

export const NewBountyScreen: React.FC<NewBountyScreenProps> = ({
  user: _user,
  projects,
  onNavigate,
  onRefreshData
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Repo + Issue Number only
  const [repos, setRepos] = useState<any[]>([]);
  const [repoInput, setRepoInput] = useState('');
  const [selectedRepoMode, setSelectedRepoMode] = useState<'SELECT' | 'CUSTOM'>('CUSTOM');
  const [issueNumberInput, setIssueNumberInput] = useState('');
  const [fetchingIssue, setFetchingIssue] = useState(false);
  const [fetchedIssue, setFetchedIssue] = useState<FetchedGitHubIssue | null>(null);

  // Step 2: Bounty Amount & Scope
  const [amount, setAmount] = useState<number>(200);
  const [currency] = useState('USD');

  // Step 3: Created Task & Authorization
  const [createdTask, setCreatedTask] = useState<any | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [paypalApproveUrl, setPaypalApproveUrl] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  // Load connected repos on mount
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await webApi.listRepositories();
        if (res.data && res.data.length > 0) {
          setRepos(res.data);
          setSelectedRepoMode('SELECT');
          setRepoInput(`${res.data[0].owner}/${res.data[0].name}`);
        }
      } catch {
        // Fallback to custom entry if GitHub not connected or list empty
        setSelectedRepoMode('CUSTOM');
      }
    };
    fetchRepos();
  }, []);

  // Parse owner and repo from current repoInput
  const getRepoParts = (): { owner: string; repo: string } | null => {
    const clean = repoInput.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0]!, repo: parts[1]! };
    }
    return null;
  };

  // Action: Fetch Issue from GitHub automatically
  const handleFetchIssue = async () => {
    setError(null);
    const repoParts = getRepoParts();
    if (!repoParts) {
      setError('Please provide a valid repository in the format "owner/repository" (e.g. facebook/react).');
      return;
    }

    const num = parseInt(issueNumberInput.trim(), 10);
    if (!num || isNaN(num) || num <= 0) {
      setError('Please enter a valid numeric GitHub issue number (e.g. 42).');
      return;
    }

    setFetchingIssue(true);
    setFetchedIssue(null);

    try {
      const res = await webApi.getIssue(repoParts.owner, repoParts.repo, num);
      const issue = res.data;

      if (!issue || !issue.title) {
        throw new Error(`Issue #${num} could not be retrieved from ${repoParts.owner}/${repoParts.repo}.`);
      }

      if (issue.state && issue.state.toLowerCase() !== 'open') {
        throw new Error(`Issue #${num} is closed. Bounties can only be created for open GitHub issues.`);
      }

      setFetchedIssue(issue);
    } catch (err: any) {
      const msg = err?.message || 'Failed to fetch issue from GitHub.';
      setError(msg);
      setFetchedIssue(null);
    } finally {
      setFetchingIssue(false);
    }
  };

  // Step 2 Submission -> Create Task in DB using GitHub Issue as Source of Truth
  const handleProceedToAuthorization = async () => {
    setError(null);
    if (!fetchedIssue) {
      setError('Please fetch a valid open GitHub issue before continuing.');
      return;
    }
    if (!amount || amount <= 0) {
      setError('Please provide a valid positive bounty amount.');
      return;
    }

    setLoading(true);
    try {
      const repoParts = getRepoParts();
      const repoFullName = repoParts ? `${repoParts.owner}/${repoParts.repo}` : repoInput;

      // Find or create default project
      let projectId = projects[0]?._id;
      if (!projectId) {
        const projectRes = await webApi.createProject({
          title: repoFullName,
          description: `GitHub repository ${repoFullName} workspace`
        });
        projectId = projectRes.data._id;
      }

      const taskRes = await webApi.createTask({
        projectId,
        title: fetchedIssue.title,
        description: fetchedIssue.body || `Bounty for GitHub Issue #${fetchedIssue.number}`,
        paymentAmount: amount,
        currency,
        issueNumber: fetchedIssue.number,
        issueUrl: fetchedIssue.htmlUrl || `https://github.com/${repoFullName}/issues/${fetchedIssue.number}`,
        acceptanceCriteria: []
      });

      setCreatedTask(taskRes.data);
      onRefreshData();
      setStep(3);
    } catch (err: any) {
      setError(err?.message || 'Failed to create bounty task.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 Action: Authorize Hold via PayPal Sandbox
  const handleAuthorizePayPal = async (simulate = false) => {
    if (!createdTask) return;
    setLoading(true);
    setError(null);

    try {
      let orderId = paypalOrderId;
      let approveUrl = paypalApproveUrl;

      // 1. Create Orders v2 order if not already created
      if (!orderId) {
        const orderRes = await webApi.createTaskOrder(createdTask._id, 'AUTHORIZE');
        orderId = orderRes.data.order.id;
        setPaypalOrderId(orderId);

        const approveLink = orderRes.data.order.links?.find(
          (l: any) => l.rel === 'approve' || l.rel === 'payer-action'
        );
        if (approveLink?.href) {
          approveUrl = approveLink.href;
          setPaypalApproveUrl(approveLink.href);
        }
      }

      // If simulate is requested (Dev Fast-Track), record authorization directly
      if (simulate) {
        await webApi.authorizeOrder(orderId!, { simulate: true });
        setIsAuthorized(true);
        setAwaitingApproval(false);
        onRefreshData();
        return;
      }

      // If approval URL exists and not yet approved by user in PayPal window
      if (approveUrl && !awaitingApproval) {
        setAwaitingApproval(true);
        window.open(approveUrl, '_blank', 'width=600,height=700');
        return;
      }

      // 2. Authorize the order (server-side verification)
      await webApi.authorizeOrder(orderId!, { simulate: false });
      setIsAuthorized(true);
      setAwaitingApproval(false);
      onRefreshData();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('ORDER_NOT_APPROVED')) {
        setError(
          'PayPal Sandbox order requires payer checkout approval. Please click "Approve in PayPal Sandbox" below to approve in the popup window, or click "⚡ Dev Fast-Track" to simulate the hold in dev mode.'
        );
        setAwaitingApproval(true);
      } else {
        setError(msg || 'Failed to authorize PayPal Sandbox hold.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '36px 20px' }}>
      {/* Back button */}
      <button
        onClick={() => onNavigate('home')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          padding: 0,
          marginBottom: '20px'
        }}
      >
        <ArrowLeft size={16} />
        Back to bounties
      </button>

      {/* Main Card */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          border: '1px solid var(--card-border)',
          padding: '32px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Step Wizard Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          {[
            { num: 1, label: '1. Pick Repo & Issue' },
            { num: 2, label: '2. Bounty Amount & Scope' },
            { num: 3, label: '3. Authorize PayPal' }
          ].map((s) => (
            <div
              key={s.num}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: step === s.num ? 700 : 500,
                color: step === s.num ? 'var(--primary-accent)' : step > s.num ? 'var(--status-success)' : 'var(--text-muted)'
              }}
            >
              {step > s.num ? <CheckCircle2 size={16} /> : null}
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--status-error-bg)',
              border: '1px solid var(--status-error-border)',
              color: 'var(--status-error)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            {step === 1 && !fetchedIssue && (
              <button
                onClick={handleFetchIssue}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--status-error)',
                  color: 'var(--status-error)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 1: PICK REPO & ISSUE NUMBER ONLY (AUTO-FETCH ISSUE)        */}
        {/* ============================================================== */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Fetch Issue from GitHub
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Select your repository and enter the issue number. OpenProofPay retrieves the title and specifications directly from GitHub.
            </p>

            {/* Repository Input / Selector */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  GitHub Repository
                </label>
                {repos.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedRepoMode === 'SELECT') {
                        setSelectedRepoMode('CUSTOM');
                      } else {
                        setSelectedRepoMode('SELECT');
                        setRepoInput(`${repos[0].owner}/${repos[0].name}`);
                      }
                      setFetchedIssue(null);
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                  >
                    {selectedRepoMode === 'SELECT' ? 'Enter custom owner/repo' : 'Choose from connected repos'}
                  </button>
                )}
              </div>

              {selectedRepoMode === 'SELECT' && repos.length > 0 ? (
                <select
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    setFetchedIssue(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  {repos.map((r) => (
                    <option key={`${r.owner}/${r.name}`} value={`${r.owner}/${r.name}`}>
                      {r.owner}/{r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. facebook/react or vercel/next.js"
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    setFetchedIssue(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              )}
            </div>

            {/* Issue Number Input & Fetch Action */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                GitHub Issue Number
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  placeholder="e.g. 42"
                  value={issueNumberInput}
                  onChange={(e) => {
                    setIssueNumberInput(e.target.value);
                    setFetchedIssue(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetchIssue();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleFetchIssue}
                  disabled={fetchingIssue || !issueNumberInput.trim() || !repoInput.trim()}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: fetchingIssue || !issueNumberInput.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: 'var(--shadow-sm)',
                    opacity: fetchingIssue || !issueNumberInput.trim() ? 0.6 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {fetchingIssue ? (
                    <>
                      <RefreshCw size={14} className="spin-animation" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Search size={14} />
                      Fetch Issue
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Read-Only Issue Preview Card */}
            {fetchedIssue && (
              <div
                style={{
                  borderRadius: '12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '20px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--accent-green)',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      {fetchedIssue.state?.toUpperCase() || 'OPEN'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Issue #{fetchedIssue.number}
                    </span>
                    {fetchedIssue.author && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        opened by @{fetchedIssue.author}
                      </span>
                    )}
                  </div>

                  {fetchedIssue.htmlUrl && (
                    <a
                      href={fetchedIssue.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: 'var(--accent-blue)',
                        textDecoration: 'none',
                        fontWeight: 500
                      }}
                    >
                      View on GitHub <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {fetchedIssue.title}
                </h3>

                {fetchedIssue.labels && fetchedIssue.labels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {fetchedIssue.labels.map((lbl, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.5'
                  }}
                >
                  <GitHubMarkdownViewer content={fetchedIssue.body || 'No description provided in this GitHub issue.'} />
                </div>
              </div>
            )}

            {/* Step 1 Primary Action */}
            <button
              onClick={() => {
                if (fetchedIssue) {
                  setError(null);
                  setStep(2);
                } else {
                  handleFetchIssue();
                }
              }}
              disabled={fetchingIssue || (!fetchedIssue && !issueNumberInput.trim())}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: !fetchedIssue && !issueNumberInput.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm)',
                opacity: !fetchedIssue && !issueNumberInput.trim() ? 0.6 : 1,
                transition: 'all 0.15s ease'
              }}
            >
              {fetchedIssue ? 'Continue to Bounty Amount' : 'Fetch & Continue'}
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 2: SET BOUNTY AMOUNT & REVIEW ISSUE SCOPE                 */}
        {/* ============================================================== */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Set Bounty Amount & Review Issue Scope
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              The original GitHub issue will be used as the single source of truth for autonomous AI verification against submitted PRs.
            </p>

            {/* Bounty Amount */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Bounty Amount (USD)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  $
                </span>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 28px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '16px',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Read-Only Issue Specification & Scope Card */}
            {fetchedIssue && (
              <div
                style={{
                  borderRadius: '12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '20px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--accent-green)',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      SOURCE OF TRUTH
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Issue #{fetchedIssue.number}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Change Issue
                  </button>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                  {fetchedIssue.title}
                </h3>

                {fetchedIssue.labels && fetchedIssue.labels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {fetchedIssue.labels.map((lbl, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {fetchedIssue.body || 'No detailed issue body provided.'}
                </div>

                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={14} color="var(--accent-blue)" />
                  <span>
                    Gemini AI will directly compare submitted PR diffs against this issue's problem description, edge cases, and expected behaviors.
                  </span>
                </div>
              </div>
            )}

            {/* Step 2 Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
              <button
                onClick={handleProceedToAuthorization}
                disabled={loading}
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
              >
                {loading ? 'Creating Bounty...' : 'Continue to PayPal Authorization'}
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STEP 3: AUTHORIZE PAYPAL SANDBOX HOLD                           */}
        {/* ============================================================== */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Authorize Payment Hold
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Authorize a PayPal Sandbox hold. Funds remain reserved and will only be captured and paid out after human administrative approval.
            </p>

            <div
              style={{
                borderRadius: '12px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                padding: '24px',
                marginBottom: '28px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Bounty Deliverable</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                  {createdTask?.title || fetchedIssue?.title}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Verification Source</span>
                <span style={{ fontWeight: 600, color: 'var(--primary-accent)', fontSize: '14px' }}>
                  GitHub Issue #{createdTask?.githubIssueNumber || fetchedIssue?.number || ''}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Hold Amount</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary-accent)' }}>
                  ${amount}.00 {currency}
                </span>
              </div>
            </div>

            {isAuthorized ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--status-success-bg)',
                  border: '1px solid var(--status-success-border)',
                  color: 'var(--status-success)',
                  textAlign: 'center',
                  marginBottom: '24px'
                }}
              >
                <CheckCircle2 size={32} style={{ margin: '0 auto 10px auto' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
                  PayPal Sandbox Hold Authorized!
                </h4>
                <p style={{ fontSize: '13px', opacity: 0.9 }}>
                  ${amount}.00 {currency} is now safely reserved. Developers can now claim and submit PRs for this bounty.
                </p>
                {paypalOrderId && (
                  <p style={{ fontSize: '11px', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                    Order ID: {paypalOrderId}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {awaitingApproval && paypalApproveUrl && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                      <AlertCircle size={16} color="var(--accent-blue)" />
                      <span>Action Required: Approve in PayPal Sandbox</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                      We opened the PayPal checkout popup. If it didn't open or was blocked, click below to open it, approve using your PayPal Sandbox buyer account, then click "Confirm PayPal Authorization".
                    </p>
                    <a
                      href={paypalApproveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--accent-blue)',
                        fontWeight: 600,
                        fontSize: '12px',
                        textDecoration: 'underline'
                      }}
                    >
                      <ExternalLink size={13} />
                      Open PayPal Sandbox Checkout Window
                    </a>
                  </div>
                )}

                <button
                  onClick={() => handleAuthorizePayPal(false)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: '#0070ba',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(0, 112, 186, 0.3)'
                  }}
                >
                  <ShieldCheck size={18} />
                  {loading
                    ? 'Processing Authorization...'
                    : awaitingApproval
                    ? 'Confirm PayPal Authorization'
                    : `Authorize $${amount} Hold with PayPal Sandbox`}
                </button>

                {/* Dev Fast-Track Simulate Button */}
                <button
                  type="button"
                  onClick={() => handleAuthorizePayPal(true)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-secondary)',
                    border: '1px dashed var(--border-color)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  title="Simulate successful escrow authorization in development without signing into a PayPal sandbox buyer account"
                >
                  <span>⚡ Dev Fast-Track: Quick-Authorize (Simulate Hold)</span>
                </button>
              </div>
            )}

            {isAuthorized && (
              <button
                onClick={() => onNavigate('home')}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.15s ease'
                }}
              >
                View on Dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
