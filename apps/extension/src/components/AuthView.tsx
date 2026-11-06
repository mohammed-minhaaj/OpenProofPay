import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { UserRole } from '@openproofpay/shared';
import { Shield, ArrowRight, Loader2, KeyRound, Mail, User, Github } from 'lucide-react';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.DEVELOPER);
  const [githubUsername, setGithubUsername] = useState('');
  const [paypalReceiverEmail, setPaypalReceiverEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          email: email.trim(),
          password,
          name: name.trim(),
          role,
          githubUsername: githubUsername.trim() || undefined,
          paypalReceiverEmail: paypalReceiverEmail.trim() || undefined
        });
      } else {
        await login({
          email: email.trim(),
          password
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '1.5rem',
        minHeight: '100%',
        backgroundColor: 'var(--bg-primary)'
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2.75rem',
            height: '2.75rem',
            borderRadius: '0.75rem',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            color: '#ffffff',
            marginBottom: '0.75rem',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <Shield size={24} />
        </div>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {isRegister ? 'Create OpenProofPay Account' : 'Sign in to OpenProofPay'}
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          {isRegister
            ? 'Connect your GitHub workspace with verified PayPal milestones'
            : 'Access proof-to-pay verification & milestone approvals'}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '0.375rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.75rem',
            marginBottom: '1rem'
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {isRegister && (
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Developer"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem 0.5rem 2rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <User size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Email Address
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem 0.5rem 2rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
            <Mail size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem 0.5rem 2rem',
                fontSize: '0.8rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
            <KeyRound size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>
        </div>

        {isRegister && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Account Role
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.DEVELOPER)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${role === UserRole.DEVELOPER ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    backgroundColor: role === UserRole.DEVELOPER ? 'rgba(59, 130, 246, 0.15)' : 'var(--input-bg)',
                    color: role === UserRole.DEVELOPER ? 'var(--accent-blue)' : 'var(--text-secondary)'
                  }}
                >
                  Developer (Earn)
                </button>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.EMPLOYER)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${role === UserRole.EMPLOYER ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    backgroundColor: role === UserRole.EMPLOYER ? 'rgba(59, 130, 246, 0.15)' : 'var(--input-bg)',
                    color: role === UserRole.EMPLOYER ? 'var(--accent-blue)' : 'var(--text-secondary)'
                  }}
                >
                  Employer (Pay)
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                GitHub Username (Optional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  placeholder="octocat"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem 0.5rem 2rem',
                    fontSize: '0.8rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
                <Github size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            {role === UserRole.DEVELOPER && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  PayPal Payout Email (Optional)
                </label>
                <input
                  type="email"
                  value={paypalReceiverEmail}
                  onChange={(e) => setPaypalReceiverEmail(e.target.value)}
                  placeholder="paypal@domain.com"
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
            )}
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem',
            borderRadius: '0.375rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            backgroundColor: 'var(--accent-blue)',
            color: '#ffffff',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {isRegister ? 'Create Account' : 'Sign In'}
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </form>

      <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => {
            setIsRegister(!isRegister);
            setError(null);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent-blue)',
            fontSize: '0.76rem',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
};
