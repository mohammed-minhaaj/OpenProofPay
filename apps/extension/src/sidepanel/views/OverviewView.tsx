import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient.js';
import { Skeleton } from '../../components/Skeleton.js';
import {
  Clock,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  GitPullRequest
} from 'lucide-react';

interface OverviewMetrics {
  totalProjects: number;
  activeTasks: number;
  submittedPRs: number;
  verificationsPassed: number;
  pendingApprovals: number;
  completedPayments: number;
  totalPayoutsValue: number;
}

export const OverviewView: React.FC<{ onNavigate: (section: string) => void }> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch real metrics from backend or compute from tasks/projects
        const res = await apiClient.getOverviewMetrics().catch(() => null);
        if (res?.data) {
          setMetrics(res.data);
        } else {
          // Compute live metrics from tasks and projects APIs
          const [projectsRes, tasksRes, paymentsRes] = await Promise.all([
            apiClient.listProjects().catch(() => ({ data: [] })),
            apiClient.listTasks().catch(() => ({ data: [] })),
            apiClient.listPayments().catch(() => ({ data: [] }))
          ]);

          const projects = projectsRes.data || [];
          const tasks = tasksRes.data || [];
          const payments = paymentsRes.data || [];

          setMetrics({
            totalProjects: projects.length,
            activeTasks: tasks.filter((t) => t.status !== 'CLOSED' && t.status !== 'PAYMENT_COMPLETED').length,
            submittedPRs: tasks.filter((t) => t.status === 'SUBMITTED' || t.status === 'VERIFYING').length,
            verificationsPassed: tasks.filter((t) => t.status === 'VERIFICATION_PASSED').length,
            pendingApprovals: tasks.filter((t) => t.status === 'AWAITING_EMPLOYER_APPROVAL').length,
            completedPayments: payments.filter((p) => p.status === 'CAPTURED' || p.status === 'PAID_OUT').length,
            totalPayoutsValue: payments
              .filter((p) => p.status === 'CAPTURED' || p.status === 'PAID_OUT')
              .reduce((sum, p) => sum + (p.amount || 0), 0)
          });
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <Skeleton height="5rem" count={4} />
        </div>
        <Skeleton height="10rem" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Active Tasks',
      value: metrics?.activeTasks ?? 0,
      icon: Clock,
      color: 'var(--accent-blue)',
      onClick: () => onNavigate('tasks')
    },
    {
      title: 'Pending Approvals',
      value: metrics?.pendingApprovals ?? 0,
      icon: AlertTriangle,
      color: '#f59e0b',
      onClick: () => onNavigate('tasks')
    },
    {
      title: 'PRs in Review',
      value: metrics?.submittedPRs ?? 0,
      icon: GitPullRequest,
      color: 'var(--accent-purple)',
      onClick: () => onNavigate('submissions')
    },
    {
      title: 'Completed Payments',
      value: `$${(metrics?.totalPayoutsValue ?? 0).toFixed(2)}`,
      icon: DollarSign,
      color: '#10b981',
      onClick: () => onNavigate('payments')
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={card.onClick}
              style={{
                padding: '0.9rem',
                borderRadius: '0.65rem',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {card.title}
                </span>
                <Icon size={15} style={{ color: card.color }} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Proof-to-Pay Lifecycle Banner */}
      <div
        style={{
          padding: '1rem',
          borderRadius: '0.65rem',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
          <TrendingUp size={16} color="var(--accent-blue)" />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Proof-to-Pay Trust Guarantee
          </span>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          Milestone funds are authorized securely in PayPal Sandbox. Payment captures occur ONLY after AI static verification scores $\ge 80$, isolated Docker test suites pass, and the human employer provides explicit cryptographic approval.
        </p>
      </div>

      {/* Quick Action Navigation Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Quick Navigation
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <button
            onClick={() => onNavigate('tasks')}
            style={{
              padding: '0.6rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer'
            }}
          >
            Manage Tasks
          </button>
          <button
            onClick={() => onNavigate('submissions')}
            style={{
              padding: '0.6rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer'
            }}
          >
            Inspect PRs
          </button>
          <button
            onClick={() => onNavigate('payments')}
            style={{
              padding: '0.6rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer'
            }}
          >
            Release Escrow
          </button>
        </div>
      </div>
    </div>
  );
};
