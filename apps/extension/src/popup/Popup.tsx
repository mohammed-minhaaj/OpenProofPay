import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Navbar } from '../components/Navbar.js';
import { AuthView } from '../components/AuthView.js';
import { storageService, GitHubContext } from '../services/storageService.js';
import { parseGitHubUrl } from '../services/githubDetector.js';
import { apiClient } from '../services/apiClient.js';
import { UserRole } from '@openproofpay/shared';
import {
  Github,
  GitPullRequest,
  AlertCircle,
  FolderGit2,
  ExternalLink,
  CheckCircle,
  PlusCircle,
  ShieldCheck,
  ArrowRight,
  Loader2
} from 'lucide-react';

export const Popup: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [ghContext, setGhContext] = useState<GitHubContext | null>(null);
  const [activeTabTitle, setActiveTabTitle] = useState<string>('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [submittingPr, setSubmittingPr] = useState(false);
  const [prSuccess, setPrSuccess] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  useEffect(() => {
    async function detectCurrentTab() {
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url) {
            setActiveTabTitle(tab.title || '');
            const parsed = parseGitHubUrl(tab.url, tab.title);
            setGhContext(parsed);
          }
        } else {
          const ctx = await storageService.getGitHubContext();
          setGhContext(ctx);
        }
      } catch (err) {
        console.error('Failed to query active tab:', err);
      }
    }
    detectCurrentTab();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      apiClient.listTasks().then((res) => {
        if (res.data && res.data.length > 0 && res.data[0]) {
          setTasks(res.data);
          setSelectedTaskId(res.data[0].id || (res.data[0] as any)._id || '');
        }
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  const handleOpenSidePanel = () => {
    if (typeof chrome !== 'undefined') {
      if (chrome.windows && chrome.sidePanel?.open) {
        chrome.windows.getCurrent((win) => {
          if (win?.id) {
            chrome.sidePanel.open({ windowId: win.id }).catch(() => {
              chrome.runtime?.sendMessage?.({ type: 'OPEN_SIDEPANEL' });
            });
            window.close();
          } else {
            chrome.runtime?.sendMessage?.({ type: 'OPEN_SIDEPANEL' });
            window.close();
          }
        });
      } else if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
        window.close();
      }
    }
  };

  const handleSubmitPrFromPopup = async () => {
    if (!selectedTaskId || !ghContext?.url) return;
    setSubmittingPr(true);
    setPrError(null);
    setPrSuccess(null);
    try {
      await apiClient.submitPR(selectedTaskId, {
        prUrl: ghContext.url,
        prNumber: ghContext.number
      });
      // Fire-and-forget verification
      apiClient.triggerVerification(selectedTaskId).catch(() => {});
      setPrSuccess(`PR #${ghContext.number} submitted! AI verification initiated.`);
    } catch (err: any) {
      setPrError(err?.message || 'Failed to submit PR for verification');
    } finally {
      setSubmittingPr(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: '2rem', height: '2rem', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ width: '380px', minHeight: '460px', backgroundColor: 'var(--bg-primary)' }}>
        <Navbar />
        <AuthView />
      </div>
    );
  }

  return (
    <div style={{ width: '380px', minHeight: '480px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      <Navbar onOpenSidePanel={handleOpenSidePanel} isPopup={true} />

      <main style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Active GitHub Tab Context Card */}
        <section
          style={{
            padding: '1rem',
            borderRadius: '0.65rem',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Tab Detection
            </span>
            {ghContext ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
                <CheckCircle size={12} /> Connected
              </span>
            ) : (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Non-GitHub URL</span>
            )}
          </div>

          {ghContext ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                {ghContext.type === 'pull' ? (
                  <GitPullRequest size={18} color="#3b82f6" />
                ) : ghContext.type === 'issue' ? (
                  <AlertCircle size={18} color="#10b981" />
                ) : (
                  <FolderGit2 size={18} color="#8b5cf6" />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {ghContext.owner}/{ghContext.repo}
                    {ghContext.number ? ` #${ghContext.number}` : ''}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {activeTabTitle || ghContext.url}
                  </div>
                </div>
              </div>

              {/* Context-aware Quick Action */}
              <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                {user?.role === UserRole.EMPLOYER && ghContext.type === 'issue' && (
                  <button
                    onClick={handleOpenSidePanel}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      backgroundColor: 'var(--accent-blue)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <PlusCircle size={14} />
                    Convert Issue #{ghContext.number} to Bounty Task
                  </button>
                )}

                {user?.role === UserRole.DEVELOPER && ghContext.type === 'pull' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {prSuccess && (
                      <div style={{ padding: '0.4rem 0.6rem', borderRadius: '0.25rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CheckCircle size={13} />
                        <span>{prSuccess}</span>
                      </div>
                    )}

                    {prError && (
                      <div style={{ padding: '0.4rem 0.6rem', borderRadius: '0.25rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontSize: '0.72rem' }}>
                        {prError}
                      </div>
                    )}

                    {tasks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Target Milestone Task:</label>
                        <select
                          value={selectedTaskId}
                          onChange={(e) => setSelectedTaskId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            borderRadius: '0.25rem',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem'
                          }}
                        >
                          {tasks.map((t) => (
                            <option key={t.id || (t as any)._id} value={t.id || (t as any)._id}>
                              {t.title} (${t.bountyAmount || t.paymentAmount})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        No active milestone tasks found. Open side panel to claim tasks.
                      </div>
                    )}

                    <button
                      onClick={handleSubmitPrFromPopup}
                      disabled={submittingPr || !selectedTaskId}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        cursor: submittingPr || !selectedTaskId ? 'not-allowed' : 'pointer',
                        opacity: submittingPr || !selectedTaskId ? 0.7 : 1
                      }}
                    >
                      {submittingPr ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      {submittingPr ? 'Submitting & Verifying...' : `Submit PR #${ghContext.number} for Verification`}
                    </button>
                  </div>
                )}

                {ghContext.type === 'repo' && (
                  <button
                    onClick={handleOpenSidePanel}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer'
                    }}
                  >
                    <Github size={14} />
                    View Repository Milestones
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Navigate to a GitHub Issue or Pull Request to enable instant milestone actions.
              </p>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                Go to GitHub <ExternalLink size={12} />
              </a>
            </div>
          )}
        </section>

        {/* Quick Access to Side Panel Workspace */}
        <section
          style={{
            padding: '1rem',
            borderRadius: '0.65rem',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              OpenProofPay Workspace
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Access full milestone tracking, AI code verification results, container test logs, and PayPal approvals in the Chrome Side Panel.
            </div>
          </div>

          <button
            onClick={handleOpenSidePanel}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.85rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-hover)',
              cursor: 'pointer'
            }}
          >
            <span>Open Side Panel Workspace</span>
            <ArrowRight size={14} color="var(--accent-blue)" />
          </button>
        </section>
      </main>

      <footer
        style={{
          padding: '0.6rem 1rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.7rem',
          color: 'var(--text-muted)'
        }}
      >
        <span>Logged in as {user?.email}</span>
        <span>v1.0.0</span>
      </footer>
    </div>
  );
};
