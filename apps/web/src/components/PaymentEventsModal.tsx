import React from 'react';
import { History, X, CheckCircle2 } from 'lucide-react';

interface PaymentEventsModalProps {
  payment: any;
  onClose: () => void;
}

export const PaymentEventsModal: React.FC<PaymentEventsModalProps> = ({
  payment,
  onClose
}) => {
  const events = payment?.events || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '600px',
          maxWidth: '100%',
          maxHeight: '80vh',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <History size={18} style={{ color: 'var(--accent-blue)' }} />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                Immutable Payment Audit Trail
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Order ID: {payment?.paypalOrderId || '—'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Payment Details Card */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '6px',
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px'
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>{' '}
                <strong style={{ color: '#34d399' }}>{payment?.status}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Amount:</span>{' '}
                <strong style={{ color: '#fff' }}>${payment?.amount} {payment?.currency || 'USD'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Authorization ID:</span>{' '}
                <code style={{ color: '#93c5fd' }}>{payment?.paypalAuthorizationId || 'Pending'}</code>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Capture ID:</span>{' '}
                <code style={{ color: '#a78bfa' }}>{payment?.paypalCaptureId || 'Not Captured'}</code>
              </div>
            </div>

            {/* Timeline */}
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginTop: '8px' }}>
              Transition History (State Machine)
            </h4>

            {events.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                Initial authorization record created. Real-time transitions are cryptographically logged in MongoDB.
              </div>
            ) : (
              events.map((evt: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <CheckCircle2 size={16} style={{ color: 'var(--accent-green)', marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#fff' }}>
                        {evt.previousStatus ? `${evt.previousStatus} → ` : ''}{evt.newStatus}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString() : 'Recorded'}
                      </span>
                    </div>
                    {evt.reason && (
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {evt.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--card-bg)'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
