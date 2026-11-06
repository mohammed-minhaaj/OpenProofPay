import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        left: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((t) => {
        const getBg = () => {
          switch (t.type) {
            case 'success':
              return { border: '#10b981', icon: <CheckCircle2 size={16} color="#10b981" /> };
            case 'error':
              return { border: '#ef4444', icon: <XCircle size={16} color="#ef4444" /> };
            case 'warning':
              return { border: '#f59e0b', icon: <AlertTriangle size={16} color="#f59e0b" /> };
            default:
              return { border: '#3b82f6', icon: <Info size={16} color="#3b82f6" /> };
          }
        };

        const { border, icon } = getBg();

        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'flex-start',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              backgroundColor: 'var(--bg-secondary)',
              border: `1px solid ${border}`,
              boxShadow: 'var(--shadow-md)',
              gap: '0.6rem'
            }}
          >
            <div style={{ marginTop: '0.1rem' }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              {t.message && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  {t.message}
                </div>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.1rem'
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
