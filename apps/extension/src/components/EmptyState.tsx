import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = Inbox,
  actionLabel,
  onAction
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        textAlign: 'center',
        borderRadius: '0.75rem',
        border: '1px dashed var(--border-color)',
        backgroundColor: 'var(--card-bg)'
      }}
    >
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: '50%',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          color: 'var(--text-muted)'
        }}
      >
        <Icon size={24} />
      </div>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '280px', marginBottom: actionLabel ? '1rem' : '0' }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: '0.75rem',
            padding: '0.4rem 0.85rem',
            borderRadius: '0.375rem',
            fontSize: '0.8rem',
            fontWeight: 500,
            backgroundColor: 'var(--accent-blue)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
