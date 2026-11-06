import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  User,
  Github,
  CreditCard,
  Cpu,
  Moon,
  Sun,
  CheckCircle
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user, theme, toggleTheme } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Settings & Integrations
        </h2>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Manage your connected accounts, PayPal payout setup, and preferences.
        </p>
      </div>

      {/* 1. Account Profile Card */}
      <section
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <User size={15} color="var(--accent-blue)" />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            User Account
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Name</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name || 'User'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Role</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{user?.role}</span>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Email</span>
            <span style={{ color: 'var(--text-secondary)' }}>{user?.email}</span>
          </div>
        </div>
      </section>

      {/* 2. GitHub Integration Card */}
      <section
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Github size={15} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              GitHub App Status
            </span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
            <CheckCircle size={12} /> Connected
          </span>
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Linked account handle: <strong>@{user?.githubUsername || 'octocat'}</strong>. Webhooks ingest pull requests and issue updates in real time.
        </p>
      </section>

      {/* 3. PayPal Sandbox Configuration */}
      <section
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CreditCard size={15} color="#10b981" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              PayPal Sandbox v2
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
            Active Sandbox
          </span>
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Receiver Email: <strong>{user?.paypalEmail || 'developer-paypal@sandbox.com'}</strong>
        </p>
      </section>

      {/* 4. AI Engine Status */}
      <section
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={15} color="#06b6d4" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              AI Verification Engine
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#06b6d4', fontWeight: 600 }}>
            Gemini 2.5 Pro
          </span>
        </div>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Backend evaluation parses PR patches and checks against defined acceptance criteria and security rules.
        </p>
      </section>

      {/* 5. Interface Preferences */}
      <section
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
            Appearance Theme
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Currently using {theme} mode.
          </span>
        </div>

        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            cursor: 'pointer'
          }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </section>
    </div>
  );
};
