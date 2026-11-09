import React, { useState, useEffect, useCallback } from 'react';
import { webApi, UserSession } from './services/api.js';
import { UserRole } from '@openproofpay/shared';
import { SlimTopBar } from './components/SlimTopBar.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { NewBountyScreen } from './screens/NewBountyScreen.js';
import { BountyPageScreen } from './screens/BountyPageScreen.js';
import { ReviewPageScreen } from './screens/ReviewPageScreen.js';
import { ActivityPaymentsScreen } from './screens/ActivityPaymentsScreen.js';
import { ShieldCheck, AlertCircle, Sun, Moon } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<UserRole>(UserRole.DEVELOPER);
  const [authGithubUsername, setAuthGithubUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // App Navigation & Theme State
  const [activeScreen, setActiveScreen] = useState<string>('home');
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('openproofpay_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  // Shared Data
  const [tasks, setTasks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Theme synchronization with DOM and persistent storage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('openproofpay_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Check Existing Session
  useEffect(() => {
    const checkSession = async () => {
      try {
        if (webApi.getToken()) {
          const res = await webApi.getMe();
          setUser(res.data.user);
        }
      } catch {
        webApi.setToken(null);
      } finally {
        setAuthLoading(false);
      }
    };
    checkSession();
  }, []);

  // Fetch Dashboard Data
  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const [tasksRes, projectsRes, paymentsRes] = await Promise.allSettled([
        webApi.listTasks(),
        webApi.listProjects(),
        webApi.getPaymentHistory()
      ]);

      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value.data || []);
      }
      if (projectsRes.status === 'fulfilled') {
        setProjects(projectsRes.value.data || []);
      }
      if (paymentsRes.status === 'fulfilled') {
        setPayments(paymentsRes.value.data || []);
      }
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  // Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isLogin) {
        const res = await webApi.login({
          email: authEmail.trim(),
          password: authPassword
        });
        setUser(res.user);
      } else {
        const res = await webApi.register({
          name: authName.trim(),
          email: authEmail.trim(),
          password: authPassword,
          role: authRole,
          githubUsername: authGithubUsername.trim() || undefined
        });
        setUser(res.user);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    await webApi.logout();
    setUser(null);
    setTasks([]);
    setProjects([]);
    setPayments([]);
    setActiveScreen('home');
  };

  // Screen Navigation Router
  const handleNavigate = (screen: string, taskId?: string) => {
    // Role guard: Only Admins/Employers can create bounties
    if (screen === 'new-bounty' && user?.role === UserRole.DEVELOPER) {
      setActiveScreen('home');
      return;
    }
    setActiveScreen(screen);
    if (taskId) {
      setActiveTaskId(taskId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Auth Screen if unauthenticated
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Loading OpenProofPay...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)',
          padding: '20px',
          position: 'relative'
        }}
      >
        {/* Top-Right Theme Toggle on Login Screen */}
        <button
          onClick={toggleTheme}
          title="Toggle Light / Dark Mode"
          style={{
            position: 'absolute',
            top: '20px',
            right: '24px',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            backgroundColor: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--card-border)',
            padding: '36px',
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          {/* Brand header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-accent)'
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                OpenProofPay
              </h1>
              <span style={{ fontSize: '11px', color: 'var(--secondary-accent)', fontWeight: 600 }}>
                PayPal Sandbox • Proof-to-Pay
              </span>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
            {isLogin ? 'Sign in to access your bounties and payments' : 'Create an account to fund or claim bounties'}
          </p>

          {authError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--status-error-bg)',
                border: '1px solid var(--status-error-border)',
                color: 'var(--status-error)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}
            >
              <AlertCircle size={15} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!isLogin && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Alice Developer"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            {!isLogin && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  GitHub Username <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 400 }}>(Connects your PRs for AI Verification)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. your-github-handle"
                  value={authGithubUsername}
                  onChange={(e) => setAuthGithubUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Email
              </label>
              <input
                type="email"
                required
                placeholder="alice@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            {!isLogin && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Primary Role
                </label>
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value={UserRole.EMPLOYER}>Admin / Employer (Post Bounties)</option>
                  <option value={UserRole.DEVELOPER}>Developer (Claim & Submit PRs)</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              style={{
                marginTop: '8px',
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
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Toggle Login / Register */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {isLogin ? "Don't have an account? " : 'Already registered? '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setAuthError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-accent)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0
              }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
      {/* Slim Top Bar Navigation */}
      <SlimTopBar
        user={user}
        activeScreen={activeScreen}
        theme={theme}
        onNavigate={(screen) => handleNavigate(screen)}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        onUpdateUser={(updated) => setUser(updated)}
      />

      {/* Main Screen Content (Strictly the 5 screens) */}
      <main style={{ flex: 1 }}>
        {activeScreen === 'home' && (
          <HomeScreen
            user={user}
            tasks={tasks}
            payments={payments}
            loading={dataLoading}
            onNavigate={handleNavigate}
          />
        )}

        {activeScreen === 'new-bounty' && (
          <NewBountyScreen
            user={user}
            projects={projects}
            onNavigate={handleNavigate}
            onRefreshData={loadDashboardData}
          />
        )}

        {activeScreen === 'bounty' && activeTaskId && (
          <BountyPageScreen
            taskId={activeTaskId}
            user={user}
            onNavigate={handleNavigate}
            onRefreshData={loadDashboardData}
            onUpdateUser={(updated) => setUser(updated)}
          />
        )}

        {activeScreen === 'review' && activeTaskId && (
          <ReviewPageScreen
            taskId={activeTaskId}
            user={user}
            onNavigate={handleNavigate}
            onRefreshData={loadDashboardData}
          />
        )}

        {activeScreen === 'activity' && (
          <ActivityPaymentsScreen
            user={user}
            payments={payments}
            onRefreshData={loadDashboardData}
            onNavigate={handleNavigate}
          />
        )}
      </main>
    </div>
  );
};
