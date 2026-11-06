import React, { useState, useMemo } from 'react';
import { UserRole, TaskStatus } from '@openproofpay/shared';
import { UserSession } from '../services/api.js';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  Search,
  ChevronRight
} from 'lucide-react';

interface HomeScreenProps {
  user: UserSession;
  tasks: any[];
  payments: any[];
  loading: boolean;
  onNavigate: (screen: string, taskId?: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  tasks = [],
  payments = [],
  loading = false,
  onNavigate
}) => {
  const isAdmin = user.role === UserRole.EMPLOYER || user.role === UserRole.ADMIN;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'AWAITING_REVIEW' | 'PAID'>('ALL');

  // Compute 3 stat cards
  const stats = useMemo(() => {
    const openTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.OPEN ||
        t.status === TaskStatus.CREATED ||
        t.status === 'ASSIGNED' ||
        t.status === 'IN_PROGRESS' ||
        t.status === TaskStatus.CLAIMED
    );
    const openValue = openTasks.reduce((sum, t) => sum + (t.paymentAmount || 0), 0);

    const reviewTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.AWAITING_REVIEW ||
        t.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL ||
        t.status === TaskStatus.SUBMITTED ||
        t.status === TaskStatus.VERIFYING
    );

    const paidTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.PAID ||
        t.status === TaskStatus.PAYMENT_COMPLETED
    );
    const paidValue = payments
      .filter((p) => p.status === 'PAID_OUT' || p.status === 'CAPTURED')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      openCount: openTasks.length,
      openValue,
      reviewCount: reviewTasks.length,
      paidCount: paidTasks.length,
      paidValue
    };
  }, [tasks, payments]);

  // Filtered task cards
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Text search
      const matchesSearch =
        !searchQuery ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.projectName && t.projectName.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status chip
      if (!matchesSearch) return false;
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'OPEN') {
        return (
          t.status === TaskStatus.OPEN ||
          t.status === TaskStatus.CREATED ||
          t.status === 'ASSIGNED' ||
          t.status === 'IN_PROGRESS' ||
          t.status === TaskStatus.CLAIMED
        );
      }
      if (statusFilter === 'AWAITING_REVIEW') {
        return (
          t.status === TaskStatus.AWAITING_REVIEW ||
          t.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL ||
          t.status === TaskStatus.SUBMITTED ||
          t.status === TaskStatus.VERIFYING
        );
      }
      if (statusFilter === 'PAID') {
        return (
          t.status === TaskStatus.PAID ||
          t.status === TaskStatus.PAYMENT_COMPLETED
        );
      }
      return true;
    });
  }, [tasks, searchQuery, statusFilter]);

  // Helper for status badge styling
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case TaskStatus.OPEN:
      case TaskStatus.CREATED:
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)', border: '1px solid var(--status-info-border)' }}>
            Open Bounty
          </span>
        );
      case TaskStatus.CLAIMED:
      case 'IN_PROGRESS':
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning-border)' }}>
            Claimed
          </span>
        );
      case TaskStatus.SUBMITTED:
      case TaskStatus.VERIFYING:
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'rgba(120, 183, 220, 0.16)', color: 'var(--secondary-accent)', border: '1px solid rgba(120, 183, 220, 0.32)' }}>
            AI Verifying
          </span>
        );
      case TaskStatus.AWAITING_REVIEW:
      case TaskStatus.AWAITING_EMPLOYER_APPROVAL:
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)', border: '1px solid var(--status-warning-border)' }}>
            Awaiting Review
          </span>
        );
      case TaskStatus.APPROVED:
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-border)' }}>
            Approved
          </span>
        );
      case TaskStatus.PAID:
      case TaskStatus.PAYMENT_COMPLETED:
        return (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '999px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)', border: '1px solid var(--status-success-border)' }}>
            Paid Out ($)
          </span>
        );
      default:
        return (
          <span style={{ fontSize: '12px', fontWeight: 500, padding: '3px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>
            {status}
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            {isAdmin ? 'Bounties & Deliverables' : 'Available Bounties'}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            GitHub PR verification backed by autonomous AI decision support & PayPal Sandbox payments.
          </p>
        </div>

        {isAdmin ? (
          <button
            onClick={() => onNavigate('new-bounty')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all 0.15s ease'
            }}
          >
            <Plus size={18} />
            New Bounty
          </button>
        ) : (
          <button
            onClick={() => setStatusFilter('OPEN')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--card-border)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Browse Open Bounties
          </button>
        )}
      </div>

      {/* 3 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {/* Stat 1: Open Bounties */}
        <div
          onClick={() => setStatusFilter('OPEN')}
          style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Open Bounties
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {stats.openCount}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            ${stats.openValue.toLocaleString()} USD in active authorization holds
          </div>
        </div>

        {/* Stat 2: Awaiting Review */}
        <div
          onClick={() => setStatusFilter('AWAITING_REVIEW')}
          style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Awaiting Review
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {stats.reviewCount}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            PRs verified & ready for human approval
          </div>
        </div>

        {/* Stat 3: Paid Out */}
        <div
          onClick={() => setStatusFilter('PAID')}
          style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Paid Out
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            ${stats.paidValue.toLocaleString()}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {stats.paidCount} milestones completed via PayPal Payout
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {(['ALL', 'OPEN', 'AWAITING_REVIEW', 'PAID'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: statusFilter === key ? 600 : 500,
                backgroundColor: statusFilter === key ? 'var(--card-bg)' : 'transparent',
                color: statusFilter === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: statusFilter === key ? '1px solid var(--card-border)' : '1px solid transparent',
                cursor: 'pointer'
              }}
            >
              {key === 'ALL' && 'All'}
              {key === 'OPEN' && 'Open'}
              {key === 'AWAITING_REVIEW' && 'Awaiting Review'}
              {key === 'PAID' && 'Paid'}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search bounties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              borderRadius: '6px',
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--card-border)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Card List of Bounties */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading bounties...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div
          style={{
            padding: '50px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--card-border)'
          }}
        >
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            No bounties match your current filter.
          </p>
          {isAdmin && (
            <button
              onClick={() => onNavigate('new-bounty')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Create New Bounty
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTasks.map((task) => {
            const criteriaCount = task.acceptanceCriteria?.length || 0;
            const mandatoryCount = (task.acceptanceCriteria || []).filter((c: any) => c.mandatory !== false).length;
            const isAwaitingReview =
              task.status === TaskStatus.AWAITING_REVIEW ||
              task.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL;

            return (
              <div
                key={task._id}
                onClick={() => {
                  if (isAdmin && isAwaitingReview) {
                    onNavigate('review', task._id);
                  } else {
                    onNavigate('bounty', task._id);
                  }
                }}
                style={{
                  padding: '20px 24px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  cursor: 'pointer',
                  transition: 'transform 0.12s ease, border-color 0.12s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {/* Left: Info */}
                <div style={{ flex: 1, paddingRight: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    {renderStatusBadge(task.status)}
                    {task.githubIssueNumber && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        #{task.githubIssueNumber}
                      </span>
                    )}
                    {task.projectName && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        • {task.projectName}
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {task.title}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span>
                      Criteria: <strong>{criteriaCount}</strong> ({mandatoryCount} mandatory)
                    </span>
                    {task.assignedDeveloperId ? (
                      <span style={{ color: 'var(--status-warning)' }}>
                        Claimed by developer
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-success)' }}>
                        Available to claim
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Bounty Amount & CTA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ${task.paymentAmount} {task.currency || 'USD'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      PayPal Sandbox
                    </div>
                  </div>

                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <ChevronRight size={18} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
