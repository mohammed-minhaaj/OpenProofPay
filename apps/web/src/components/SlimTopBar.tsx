import React, { useState } from 'react';
import { UserRole } from '@openproofpay/shared';
import { UserSession, webApi } from '../services/api.js';
import { ShieldCheck, Plus, Sun, Moon, LogOut, Github, Check, X, Loader2 } from 'lucide-react';

interface SlimTopBarProps {
  user: UserSession;
  activeScreen: string;
  theme: 'dark' | 'light';
  onNavigate: (screen: string) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  onUpdateUser?: (user: UserSession) => void;
}

export const SlimTopBar: React.FC<SlimTopBarProps> = ({
  user,
  activeScreen,
  theme,
  onNavigate,
  onToggleTheme,
  onLogout,
  onUpdateUser
}) => {
  const isAdmin = user.role === UserRole.EMPLOYER || user.role === UserRole.ADMIN;
  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubInput, setGithubInput] = useState(user.githubUsername || '');
  const [savingGithub, setSavingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const handleSaveGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubInput.trim()) return;
    setSavingGithub(true);
    setGithubError(null);
    try {
      const res = await webApi.linkGitHub(githubInput.trim());
      if (onUpdateUser && res.data?.user) {
        onUpdateUser(res.data.user);
      }
      setShowGithubModal(false);
    } catch (err: any) {
      setGithubError(err?.message || 'Failed to update GitHub profile');
    } finally {
      setSavingGithub(false);
    }
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '64px',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}
    >
      {/* Brand & Sandbox Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={() => onNavigate('home')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-accent)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            OpenProofPay
          </span>
        </button>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 9px',
            borderRadius: '999px',
            backgroundColor: 'var(--status-info-bg)',
            color: 'var(--status-info)',
            border: '1px solid var(--status-info-border)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          PayPal Sandbox
        </span>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '4px', marginLeft: '16px' }}>
          <button
            onClick={() => onNavigate('home')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              background: activeScreen === 'home' ? 'var(--card-bg)' : 'transparent',
              color: activeScreen === 'home' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: activeScreen === 'home' ? '1px solid var(--card-border)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Home
          </button>
          <button
            onClick={() => onNavigate('activity')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              background: activeScreen === 'activity' ? 'var(--card-bg)' : 'transparent',
              color: activeScreen === 'activity' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: activeScreen === 'activity' ? '1px solid var(--card-border)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Activity & Payments
          </button>
        </nav>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAdmin && (
          <button
            onClick={() => onNavigate('new-bounty')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={16} />
            New Bounty
          </button>
        )}

        {/* GitHub Account Connection Pill */}
        {user.githubConnected && user.githubUsername ? (
          <button
            onClick={() => setShowGithubModal(true)}
            title={`Connected GitHub Account: @${user.githubUsername} (Click to change)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer'
            }}
          >
            <Github size={13} />
            @{user.githubUsername}
          </button>
        ) : (
          <button
            onClick={() => setShowGithubModal(true)}
            title="Connect your GitHub account to enable AI PR verification"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              cursor: 'pointer'
            }}
          >
            <Github size={13} />
            + Connect GitHub
          </button>
        )}

        {/* Read-only Authenticated Role Pill */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 9px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            backgroundColor: isAdmin ? 'var(--status-info-bg)' : 'var(--status-success-bg)',
            color: isAdmin ? 'var(--status-info)' : 'var(--status-success)',
            border: `1px solid ${isAdmin ? 'var(--status-info-border)' : 'var(--status-success-border)'}`
          }}
        >
          {isAdmin ? 'Admin' : 'Developer'}
        </span>

        {/* Light / Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          title="Toggle Light / Dark Mode"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '6px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* User Info & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {user.name || user.email.split('@')[0]}
          </span>
          <button
            onClick={onLogout}
            title="Log Out"
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      {/* GitHub Account Connect Modal */}
      {showGithubModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGithubModal(false);
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              border: '1px solid var(--card-border)',
              boxShadow: 'var(--shadow-lg)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-primary)'
                  }}
                >
                  <Github size={18} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Connect GitHub Account
                </h3>
              </div>
              <button
                onClick={() => setShowGithubModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
              OpenProofPay uses your GitHub handle to verify pull request authorship and run Gemini AI verification before PayPal funds are released.
            </p>

            {githubError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--status-error-bg)',
                  border: '1px solid var(--status-error-border)',
                  color: 'var(--status-error)',
                  fontSize: '12px',
                  marginBottom: '14px'
                }}
              >
                {githubError}
              </div>
            )}

            <form onSubmit={handleSaveGithub}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  GitHub Username / Handle
                </label>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    @
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. your-github-handle"
                    value={githubInput}
                    onChange={(e) => setGithubInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 30px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowGithubModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGithub}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: savingGithub ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingGithub ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Save & Connect
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
