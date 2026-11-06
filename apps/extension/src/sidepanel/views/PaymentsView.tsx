import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient.js';
import { Skeleton } from '../../components/Skeleton.js';
import { EmptyState } from '../../components/EmptyState.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { Modal } from '../../components/Modal.js';
import { PaymentStatus, TaskStatus, UserRole } from '@openproofpay/shared';
import { useAuth } from '../../context/AuthContext.js';
import {
  CreditCard,
  DollarSign,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';

interface PaymentItem {
  id: string;
  taskId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  idempotencyKey: string;
  createdAt: string;
}

interface PendingApprovalTask {
  id: string;
  title: string;
  paymentAmount: number;
  currency: string;
  acceptedSubmissionId?: string;
}

export const PaymentsView: React.FC = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [paymentsRes, tasksRes] = await Promise.all([
        apiClient.listPayments().catch(() => ({ data: [] })),
        apiClient.listTasks({ status: TaskStatus.AWAITING_EMPLOYER_APPROVAL }).catch(() => ({ data: [] }))
      ]);

      setPayments(paymentsRes.data || []);
      setPendingTasks(
        (tasksRes.data || []).map((t) => ({
          id: t.id,
          title: t.title,
          paymentAmount: t.paymentAmount,
          currency: t.currency,
          acceptedSubmissionId: 'sub-latest'
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApprovePayment = async () => {
    if (!approvingTaskId) return;
    setApproving(true);
    setFeedbackMessage(null);

    try {
      // 1. Explicit Human Employer Task Approval
      const idempotencyKey = crypto.randomUUID();
      await apiClient.approveTask(approvingTaskId, 'sub-latest', idempotencyKey, approvalNotes.trim() || undefined);

      // 2. Proof-to-Pay Gate: Release & Capture Payment via PayPal
      await apiClient.releasePayment(approvingTaskId);

      setFeedbackMessage({
        type: 'success',
        text: 'Milestone approved and PayPal payment captured successfully!'
      });
      setApprovingTaskId(null);
      setApprovalNotes('');
      loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFeedbackMessage({ type: 'error', text: err.message });
      } else {
        setFeedbackMessage({ type: 'error', text: 'Failed to release payment.' });
      }
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="5rem" count={3} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          PayPal Escrow & Payout Center
        </h2>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Immutable financial records guaranteed by PayPal Sandbox v2 and server-side state machines.
        </p>
      </div>

      {feedbackMessage && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: '0.375rem',
            backgroundColor: feedbackMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${feedbackMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: feedbackMessage.type === 'success' ? '#10b981' : '#ef4444',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          {feedbackMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Human Sovereign Gate: Pending Employer Approvals */}
      {user?.role === UserRole.EMPLOYER && pendingTasks.length > 0 && (
        <section
          style={{
            padding: '1rem',
            borderRadius: '0.65rem',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <AlertCircle size={16} color="#f59e0b" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Action Required: Verified Milestones Awaiting Release ({pendingTasks.length})
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            These PR submissions have passed AI evaluation and sandbox testing. Under <strong>Rule 13</strong>, AI cannot capture funds; your explicit human approval is required.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                    ${task.paymentAmount} {task.currency} Escrow Locked
                  </div>
                </div>

                <button
                  onClick={() => setApprovingTaskId(task.id)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  <ShieldCheck size={14} /> Approve & Release
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Payment Records Stream */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Transaction Ledger
        </span>

        {payments.length === 0 ? (
          <EmptyState
            title="No payment records yet"
            description="When milestone bounties are locked and released, transactions appear here with PayPal order & capture tracking."
            icon={CreditCard}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {payments.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <DollarSign size={15} color="#10b981" />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ${p.amount.toFixed(2)} {p.currency}
                    </span>
                  </div>
                  <StatusBadge status={p.status} />
                </div>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  {p.paypalOrderId && (
                    <span>PayPal Order ID: <code>{p.paypalOrderId}</code></span>
                  )}
                  {p.paypalCaptureId && (
                    <span style={{ color: '#10b981', fontWeight: 600 }}>
                      Capture ID: <code>{p.paypalCaptureId}</code>
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)' }}>
                    Idempotency: <code>{p.idempotencyKey.substring(0, 18)}...</code>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Confirm Release */}
      <Modal isOpen={!!approvingTaskId} onClose={() => setApprovingTaskId(null)} title="Confirm Sovereign Payment Release">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981' }}>
            <Lock size={18} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Releasing Escrow via PayPal Sandbox v2
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            You are authorizing the irrevocable capture of funds to the assigned developer. A verifiable immutable event will be logged in the OpenProofPay audit ledger.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Approval Feedback (Optional)
            </label>
            <textarea
              rows={2}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Code meets all specs and test coverage is complete."
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setApprovingTaskId(null)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApprovePayment}
              disabled={approving}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                cursor: approving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              {approving ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Release'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
