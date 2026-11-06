import React from 'react';
import { UserSession } from '../services/api.js';
import { UserRole } from '@openproofpay/shared';
import { ShieldCheck, LogOut, User, BarChart3, Layers, DollarSign, Code2 } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter.js';

interface NavbarProps {
  user: UserSession;
  activeTab: 'tasks' | 'findings' | 'payments' | 'analytics' | 'developer';
  onTabChange: (tab: 'tasks' | 'findings' | 'payments' | 'analytics' | 'developer') => void;
  onLogout: () => void;
  onSwitchRole?: (newRole: UserRole) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  onTabChange,
  onLogout,
  onSwitchRole
}) => {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 2px 10px rgba(37, 99, 235, 0.3)'
          }}
        >
          <ShieldCheck size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
              OpenProofPay
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: 'var(--accent-blue)',
                border: '1px solid rgba(59, 130, 246, 0.4)'
              }}
            >
              PROOFTOPAY
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            AI Code Verification & Milestone PayPal Sandbox
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={() => onTabChange('tasks')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: activeTab === 'tasks' ? '1px solid var(--accent-blue)' : '1px solid transparent',
            backgroundColor: activeTab === 'tasks' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'tasks' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Layers size={16} />
          Task Grid (AG Grid)
        </button>

        <button
          onClick={() => onTabChange('findings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: activeTab === 'findings' ? '1px solid var(--accent-blue)' : '1px solid transparent',
            backgroundColor: activeTab === 'findings' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'findings' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <ShieldCheck size={16} />
          Evidence Grid
        </button>

        <button
          onClick={() => onTabChange('payments')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: activeTab === 'payments' ? '1px solid var(--accent-blue)' : '1px solid transparent',
            backgroundColor: activeTab === 'payments' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'payments' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <DollarSign size={16} />
          Payment Ledger
        </button>

        <button
          onClick={() => onTabChange('analytics')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: activeTab === 'analytics' ? '1px solid var(--accent-blue)' : '1px solid transparent',
            backgroundColor: activeTab === 'analytics' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeTab === 'analytics' ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <BarChart3 size={16} />
          Analytics (AG Charts)
        </button>

        <button
          onClick={() => onTabChange('developer')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            border: activeTab === 'developer' ? '1px solid var(--accent-green)' : '1px solid transparent',
            backgroundColor: activeTab === 'developer' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
            color: activeTab === 'developer' ? '#10b981' : 'var(--text-secondary)',
            transition: 'all 0.15s ease'
          }}
        >
          <Code2 size={16} />
          Developer Workspace
        </button>
      </nav>

      {/* User Info & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <NotificationCenter />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)'
            }}
          >
            <User size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              {user.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  backgroundColor:
                    user.role === UserRole.EMPLOYER
                      ? 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(16, 185, 129, 0.2)',
                  color:
                    user.role === UserRole.EMPLOYER
                      ? 'var(--accent-blue)'
                      : 'var(--accent-green)'
                }}
              >
                {user.role}
              </span>
              {onSwitchRole && (
                <button
                  onClick={() =>
                    onSwitchRole(
                      user.role === UserRole.EMPLOYER ? UserRole.DEVELOPER : UserRole.EMPLOYER
                    )
                  }
                  title="Toggle between Employer & Developer roles for testing"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Switch Role
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Sign out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </header>
  );
};
