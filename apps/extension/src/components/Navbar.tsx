import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { ShieldCheck, Moon, Sun, LogOut, ExternalLink } from 'lucide-react';
import { UserRole } from '@openproofpay/shared';

interface NavbarProps {
  onOpenSidePanel?: () => void;
  isPopup?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSidePanel, isPopup = false }) => {
  const { user, logout, theme, toggleTheme } = useAuth();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        userSelect: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div
          style={{
            width: '1.75rem',
            height: '1.75rem',
            borderRadius: '0.375rem',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}
        >
          <ShieldCheck size={16} />
        </div>
        <div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            OpenProof<span style={{ color: 'var(--accent-blue)' }}>Pay</span>
          </span>
          <span
            style={{
              marginLeft: '0.35rem',
              fontSize: '0.65rem',
              fontWeight: 600,
              padding: '0.1rem 0.35rem',
              borderRadius: '0.25rem',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--accent-blue)'
            }}
          >
            MV3
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {user && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              backgroundColor: user.role === UserRole.EMPLOYER ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: user.role === UserRole.EMPLOYER ? '#60a5fa' : '#34d399',
              border: `1px solid ${user.role === UserRole.EMPLOYER ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
            }}
          >
            {user.role}
          </span>
        )}

        <button
          onClick={toggleTheme}
          title="Toggle Light/Dark Theme"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.35rem',
            borderRadius: '0.375rem',
            display: 'flex'
          }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {isPopup && onOpenSidePanel && (
          <button
            onClick={onOpenSidePanel}
            title="Expand into Chrome Side Panel"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '0.375rem',
              display: 'flex'
            }}
          >
            <ExternalLink size={15} />
          </button>
        )}

        {user && (
          <button
            onClick={logout}
            title="Log Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.35rem',
              borderRadius: '0.375rem',
              display: 'flex'
            }}
          >
            <LogOut size={15} />
          </button>
        )}
      </div>
    </header>
  );
};
