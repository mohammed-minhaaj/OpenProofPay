import React, { useEffect, useState } from 'react';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Activity, Shield, CheckCircle, GitPullRequest, DollarSign } from 'lucide-react';

interface AuditItem {
  id: string;
  action: string;
  actorRole?: string;
  resourceType: string;
  timestamp: string;
  details?: string;
}

export const ActivityView: React.FC = () => {
  const [events, setEvents] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate chronological audit stream
    const timer = setTimeout(() => {
      setEvents([
        {
          id: 'evt-1',
          action: 'PAYMENT_CAPTURED',
          actorRole: 'EMPLOYER',
          resourceType: 'Payment',
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
          details: 'Released $250.00 USD via PayPal Sandbox'
        },
        {
          id: 'evt-2',
          action: 'TASK_APPROVED',
          actorRole: 'EMPLOYER',
          resourceType: 'Task',
          timestamp: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
          details: 'Employer confirmed PR #105 satisfied milestone acceptance criteria'
        },
        {
          id: 'evt-3',
          action: 'SANDBOX_TEST_COMPLETED',
          actorRole: 'SYSTEM',
          resourceType: 'TestExecution',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          details: 'Docker runner: 14/14 tests passed in 4.2s (Exit 0)'
        },
        {
          id: 'evt-4',
          action: 'AI_VERIFICATION_COMPLETED',
          actorRole: 'SYSTEM',
          resourceType: 'VerificationReport',
          timestamp: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
          details: 'Gemini 2.5 Pro: Score 92/100 (Verdict: PASS)'
        },
        {
          id: 'evt-5',
          action: 'PR_SUBMITTED',
          actorRole: 'DEVELOPER',
          resourceType: 'Task',
          timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
          details: 'Developer submitted PR #105 linking Issue #42'
        }
      ]);
      setLoading(false);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  const getActionIcon = (action: string) => {
    if (action.includes('PAYMENT')) return <DollarSign size={14} color="#10b981" />;
    if (action.includes('APPROVED')) return <CheckCircle size={14} color="#3b82f6" />;
    if (action.includes('TEST')) return <Activity size={14} color="#8b5cf6" />;
    if (action.includes('AI')) return <Shield size={14} color="#06b6d4" />;
    return <GitPullRequest size={14} color="#f59e0b" />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="3.5rem" count={4} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Immutable Audit Trail
        </h2>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Full chronological compliance stream of verification and payment events.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No activity recorded yet"
          description="Actions performed by developers, employers, and automated runners will appear here."
          icon={Activity}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {events.map((ev) => (
            <div
              key={ev.id}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem'
              }}
            >
              <div
                style={{
                  width: '1.8rem',
                  height: '1.8rem',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '0.1rem'
                }}
              >
                {getActionIcon(ev.action)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {ev.action.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {ev.details && (
                  <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    {ev.details}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.3rem' }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      padding: '0.05rem 0.35rem',
                      borderRadius: '0.2rem',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {ev.actorRole || 'SYSTEM'}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Target: {ev.resourceType}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
