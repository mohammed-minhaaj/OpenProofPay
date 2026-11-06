import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Send, CheckCircle } from 'lucide-react';
import { api, UserSession } from '../services/api.js';
import { UserRole, DisputeStatus } from '@openproofpay/shared';

interface DisputeModalProps {
  task: any;
  user: UserSession;
  isOpen: boolean;
  onClose: () => void;
  onDisputeUpdated?: () => void;
}

export const DisputeModal: React.FC<DisputeModalProps> = ({
  task,
  user,
  isOpen,
  onClose,
  onDisputeUpdated
}) => {
  const [dispute, setDispute] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form states for raising dispute
  const [reason, setReason] = useState<string>('');
  const [evidenceSummary, setEvidenceSummary] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');

  // Form state for adding message
  const [newMessage, setNewMessage] = useState<string>('');

  // Form states for Admin resolution
  const [adminVerdict, setAdminVerdict] = useState<DisputeStatus>(DisputeStatus.RESOLVED_FOR_EMPLOYER);
  const [adminExplanation, setAdminExplanation] = useState<string>('');
  const [processRefund, setProcessRefund] = useState<boolean>(true);

  const fetchDispute = async () => {
    if (!task) return;
    setLoading(true);
    setError(null);
    try {
      // Find disputes matching this taskId
      const res = await api.get('/disputes');
      if (res.data?.success) {
        const matching = res.data.data.find(
          (d: any) =>
            (d.taskId?._id || d.taskId?.id || d.taskId) === (task._id || task.id)
        );
        setDispute(matching || null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load dispute data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && task) {
      fetchDispute();
    }
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleRaiseDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A documented reason is mandatory to raise a dispute');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const taskId = task._id || task.id;
      const attachments = attachmentUrl.trim()
        ? [{ title: 'Evidence Attachment', url: attachmentUrl.trim() }]
        : [];

      await api.post(`/tasks/${taskId}/disputes`, {
        reason: reason.trim(),
        evidenceSummary: evidenceSummary.trim(),
        attachments
      });

      await fetchDispute();
      onDisputeUpdated?.();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to raise dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !dispute) return;

    setSubmitting(true);
    setError(null);
    try {
      const disputeId = dispute._id || dispute.id;
      await api.post(`/disputes/${disputeId}/messages`, {
        message: newMessage.trim()
      });

      setNewMessage('');
      await fetchDispute();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to submit counter-evidence');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminExplanation.trim() || !dispute) {
      setError('Documented administrator rationale is mandatory for resolution');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const disputeId = dispute._id || dispute.id;
      await api.post(`/disputes/${disputeId}/resolve`, {
        verdict: adminVerdict,
        explanation: adminExplanation.trim(),
        processRefund: adminVerdict === DisputeStatus.RESOLVED_FOR_EMPLOYER ? processRefund : false
      });

      await fetchDispute();
      onDisputeUpdated?.();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case DisputeStatus.OPEN:
      case DisputeStatus.UNDER_REVIEW:
        return { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', text: '#fca5a5' };
      case DisputeStatus.RESOLVED_FOR_EMPLOYER:
      case DisputeStatus.RESOLVED_FOR_DEVELOPER:
        return { bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', text: '#6ee7b7' };
      case DisputeStatus.REVISION_ORDERED:
        return { bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b', text: '#fcd34d' };
      default:
        return { bg: 'rgba(107, 114, 128, 0.2)', border: '#6b7280', text: '#d1d5db' };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          backgroundColor: '#161922',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                Dispute Resolution Gate
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Milestone: {task.title} (${task.paymentAmount || task.bountyAmount || 0} {task.currency || 'USD'})
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '12px',
                marginBottom: '16px'
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Loading dispute history...
            </div>
          ) : dispute ? (
            /* Existing Dispute View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Dispute Status Card */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dispute ID</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>
                    {dispute._id || dispute.id}
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: getStatusBadge(dispute.status).bg,
                      color: getStatusBadge(dispute.status).text,
                      border: `1px solid ${getStatusBadge(dispute.status).border}`
                    }}
                  >
                    {dispute.status}
                  </span>
                </div>
              </div>

              {/* Initial Claim */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5', marginBottom: '4px' }}>
                  Original Claim (Initiator: {dispute.initiatorRole})
                </div>
                <div style={{ fontSize: '13px', color: '#fff', marginBottom: '6px' }}>{dispute.reason}</div>
                {dispute.evidenceSummary && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {dispute.evidenceSummary}
                  </div>
                )}
              </div>

              {/* Resolution details if resolved */}
              {dispute.resolution && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6ee7b7', fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                    <CheckCircle size={16} /> Official Administrative Resolution
                  </div>
                  <div style={{ fontSize: '12px', color: '#fff', marginBottom: '4px' }}>
                    Verdict: <strong>{dispute.resolution.verdict}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Rationale: {dispute.resolution.explanation}
                  </div>
                  {dispute.resolution.refundTransactionId && (
                    <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '6px' }}>
                      PayPal Refund ID: {dispute.resolution.refundTransactionId}
                    </div>
                  )}
                </div>
              )}

              {/* Threaded Dialogue Messages */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>
                  Counter-Evidence & Dialogue Thread
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {(!dispute.messages || dispute.messages.length === 0) ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No messages or counter-evidence submitted yet.
                    </div>
                  ) : (
                    dispute.messages.map((m: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.06)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                          <span>{m.senderRole}</span>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#fff' }}>{m.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add message input if dispute is still active */}
              {dispute.status === DisputeStatus.OPEN && (
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Submit counter-evidence or reply to claim..."
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !newMessage.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--accent-blue)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={13} /> Send
                  </button>
                </form>
              )}

              {/* Human Admin Resolution Gate (Only visible to ADMIN role) */}
              {user.role === UserRole.ADMIN && dispute.status === DisputeStatus.OPEN && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '10px' }}>
                    Administrator Resolution Gate (Financial Safety Governed)
                  </div>

                  <form onSubmit={handleAdminResolve} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Verdict Decision
                      </label>
                      <select
                        value={adminVerdict}
                        onChange={(e) => setAdminVerdict(e.target.value as DisputeStatus)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          backgroundColor: '#1e2230',
                          border: '1px solid var(--border-color)',
                          color: '#fff',
                          fontSize: '12px'
                        }}
                      >
                        <option value={DisputeStatus.RESOLVED_FOR_EMPLOYER}>RESOLVED_FOR_EMPLOYER (Refund funds to Employer)</option>
                        <option value={DisputeStatus.RESOLVED_FOR_DEVELOPER}>RESOLVED_FOR_DEVELOPER (Release payout to Developer)</option>
                        <option value={DisputeStatus.REVISION_ORDERED}>REVISION_ORDERED (Reset task to IN_PROGRESS)</option>
                      </select>
                    </div>

                    {adminVerdict === DisputeStatus.RESOLVED_FOR_EMPLOYER && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#fff' }}>
                        <input
                          type="checkbox"
                          checked={processRefund}
                          onChange={(e) => setProcessRefund(e.target.checked)}
                        />
                        Execute PayPal Capture Refund (/v2/payments/captures/{'{id}'}/refund)
                      </label>
                    )}

                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Documented Administrative Explanation (Required)
                      </label>
                      <textarea
                        rows={2}
                        value={adminExplanation}
                        onChange={(e) => setAdminExplanation(e.target.value)}
                        placeholder="State findings and reason for resolution..."
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          backgroundColor: '#1e2230',
                          border: '1px solid var(--border-color)',
                          color: '#fff',
                          fontSize: '12px',
                          resize: 'none'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !adminExplanation.trim()}
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: '#2563eb',
                        border: 'none',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {submitting ? 'Executing Decision...' : 'Commit Administrative Resolution'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            /* Raise Dispute Form */
            <form onSubmit={handleRaiseDispute} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '12px',
                  color: '#fca5a5'
                }}
              >
                Raising a dispute freezes the milestone task status to <strong>DISPUTED</strong> and pauses all automated financial escrow transitions until an independent administrator evaluates the evidence.
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '4px' }}>
                  Reason for Dispute *
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Acceptance criteria not satisfied, critical security vulnerability"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '4px' }}>
                  Evidence Summary
                </label>
                <textarea
                  rows={3}
                  value={evidenceSummary}
                  onChange={(e) => setEvidenceSummary(e.target.value)}
                  placeholder="Detail test log failures, spec deviations, or discrepancy..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '13px',
                    resize: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '4px' }}>
                  Attachment URL (Logs, Screenshot, or PR Diff)
                </label>
                <input
                  type="url"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="https://github.com/... or https://cdn.example.com/log.txt"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    color: '#fff',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !reason.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    backgroundColor: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {submitting ? 'Raising Dispute...' : 'Confirm & Freeze Milestone'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
