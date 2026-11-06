import React from 'react';
import { UserRole } from '@openproofpay/shared';
import { UserSession } from '../services/api.js';
import { ShieldCheck, Plus, Sun, Moon, LogOut } from 'lucide-react';

interface SlimTopBarProps {
  user: UserSession;
  activeScreen: string;
  theme: 'dark' | 'light';
  onNavigate: (screen: string) => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export const SlimTopBar: React.FC<SlimTopBarProps> = ({
  user,
  activeScreen,
  theme,
  onNavigate,
  onToggleTheme,
  onLogout
}) => {
  const isAdmin = user.role === UserRole.EMPLOYER || user.role === UserRole.ADMIN;

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
    </header>
  );
};
