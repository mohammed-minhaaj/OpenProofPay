import React from 'react';
import { TaskStatus, PaymentStatus } from '@openproofpay/shared';

interface StatusBadgeProps {
  status: TaskStatus | PaymentStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getBadgeStyle = (val: string) => {
    switch (val) {
      case TaskStatus.PAYMENT_COMPLETED:
      case PaymentStatus.CAPTURED:
      case PaymentStatus.PAID_OUT:
      case 'PASSED':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          text: '#10b981',
          border: 'rgba(16, 185, 129, 0.3)'
        };
      case TaskStatus.AWAITING_EMPLOYER_APPROVAL:
      case PaymentStatus.AWAITING_EMPLOYER_APPROVAL:
      case PaymentStatus.APPROVAL_PENDING:
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          text: '#f59e0b',
          border: 'rgba(245, 158, 11, 0.3)'
        };
      case TaskStatus.VERIFYING:
      case TaskStatus.PAYMENT_PROCESSING:
      case PaymentStatus.CAPTURE_PENDING:
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          text: '#3b82f6',
          border: 'rgba(59, 130, 246, 0.3)'
        };
      case TaskStatus.VERIFICATION_FAILED:
      case TaskStatus.PAYMENT_FAILED:
      case TaskStatus.REJECTED:
      case PaymentStatus.FAILED:
      case 'FAILED':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          text: '#ef4444',
          border: 'rgba(239, 68, 68, 0.3)'
        };
      case TaskStatus.IN_PROGRESS:
      case TaskStatus.ASSIGNED:
        return {
          bg: 'rgba(139, 92, 246, 0.15)',
          text: '#8b5cf6',
          border: 'rgba(139, 92, 246, 0.3)'
        };
      default:
        return {
          bg: 'rgba(100, 116, 139, 0.15)',
          text: '#94a3b8',
          border: 'rgba(100, 116, 139, 0.3)'
        };
    }
  };

  const style = getBadgeStyle(status);
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClass}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
        letterSpacing: '0.02em',
        fontSize: '0.72rem',
        fontWeight: 600
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};
