import React, { useMemo, useRef, useState, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { PaymentStatus, UserRole } from '@openproofpay/shared';
import {
  Search,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  History,
  Lock,
  RotateCcw
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

interface PaymentLedgerGridProps {
  payments: any[];
  userRole: UserRole;
  onReleasePayment: (task: any) => void;
  onViewEvents: (payment: any) => void;
  onAuthorizeOrder?: (orderId: string) => void;
  onRetryPayout?: (taskId: string) => void;
}

export const PaymentLedgerGrid: React.FC<PaymentLedgerGridProps> = ({
  payments,
  userRole,
  onReleasePayment,
  onViewEvents,
  onAuthorizeOrder,
  onRetryPayout
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredData = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter === 'ALL') return true;
      return p.status === statusFilter || p.payoutStatus === statusFilter;
    });
  }, [payments, statusFilter]);

  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `openproofpay-payments-ledger-${new Date().toISOString().slice(0, 10)}.csv`
      });
    }
  }, []);

  // Custom Cell Renderers
  const PaymentStatusRenderer = (params: ICellRendererParams) => {
    const status = params.value as PaymentStatus;
    const payment = params.data;
    let bgColor = 'rgba(100, 116, 139, 0.2)';
    let textColor = '#94a3b8';
    let borderColor = 'rgba(100, 116, 139, 0.4)';
    let icon = <Clock size={12} />;

    switch (status) {
      case PaymentStatus.AUTHORIZED:
        bgColor = 'rgba(59, 130, 246, 0.2)';
        textColor = '#60a5fa';
        borderColor = 'rgba(59, 130, 246, 0.4)';
        icon = <Lock size={12} />;
        break;
      case PaymentStatus.CAPTURED:
      case PaymentStatus.PAID_OUT:
        bgColor = 'rgba(16, 185, 129, 0.2)';
        textColor = '#34d399';
        borderColor = 'rgba(16, 185, 129, 0.4)';
        icon = <CheckCircle2 size={12} />;
        break;
      case PaymentStatus.APPROVAL_PENDING:
      case PaymentStatus.CAPTURE_PENDING:
      case PaymentStatus.PAYOUT_PENDING:
        bgColor = 'rgba(245, 158, 11, 0.2)';
        textColor = '#fbbf24';
        borderColor = 'rgba(245, 158, 11, 0.4)';
        icon = <Clock size={12} />;
        break;
      case PaymentStatus.PAYOUT_FAILED:
      case PaymentStatus.FAILED:
      case PaymentStatus.CANCELLED:
      case PaymentStatus.REFUNDED:
        bgColor = 'rgba(239, 68, 68, 0.2)';
        textColor = '#f87171';
        borderColor = 'rgba(239, 68, 68, 0.4)';
        icon = <AlertCircle size={12} />;
        break;
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: bgColor,
            color: textColor,
            border: `1px solid ${borderColor}`,
            textTransform: 'uppercase'
          }}
        >
          {icon}
          {status ? status.replace(/_/g, ' ') : 'PENDING'}
        </span>

        {payment?.payoutStatus === 'FAILED' && (
          <span
            title={payment.payoutError || 'Developer payout failed'}
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)'
            }}
          >
            PAYOUT FAILED
          </span>
        )}
      </div>
    );
  };

  const ActionsRenderer = (params: ICellRendererParams) => {
    const payment = params.data;
    if (!payment) return null;

    const canRelease =
      (userRole === UserRole.EMPLOYER || userRole === UserRole.ADMIN) &&
      payment.status === PaymentStatus.AUTHORIZED;

    const canAuthorize =
      (userRole === UserRole.EMPLOYER || userRole === UserRole.ADMIN) &&
      (payment.status === PaymentStatus.CREATED || payment.status === PaymentStatus.APPROVAL_PENDING);

    const isPayoutFailed =
      payment.status === PaymentStatus.PAYOUT_FAILED ||
      payment.payoutStatus === 'FAILED';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Release Button */}
        {canRelease && (
          <button
            onClick={() => onReleasePayment({ _id: payment.taskId, payment })}
            title="Execute Proof-to-Pay capture & disbursement"
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'var(--accent-green)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Release Bounty
          </button>
        )}

        {/* Retry Payout Button */}
        {isPayoutFailed && onRetryPayout && (
          <button
            onClick={() => onRetryPayout(payment.taskId)}
            title={`Retry developer payout (${payment.payoutError || 'Last attempt failed'})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: 'rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.6)',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={11} />
            Retry Payout
          </button>
        )}

        {/* Pre-Authorize Button */}
        {canAuthorize && onAuthorizeOrder && (
          <button
            onClick={() => onAuthorizeOrder(payment.paypalOrderId)}
            title="Complete PayPal Sandbox Authorization"
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              cursor: 'pointer'
            }}
          >
            Authorize Hold
          </button>
        )}

        {/* View Events Drawer Button */}
        <button
          onClick={() => onViewEvents(payment)}
          title="Inspect immutable PaymentEvent history"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          <History size={12} />
          Events
        </button>
      </div>
    );
  };

  const colDefs = useMemo<ColDef[]>(() => {
    return [
      {
        headerName: 'Payment Status',
        field: 'status',
        width: 220,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: PaymentStatusRenderer
      },
      {
        headerName: 'Amount ($)',
        field: 'amount',
        width: 130,
        sortable: true,
        filter: 'agNumberColumnFilter',
        valueFormatter: (p) => `$${p.value?.toLocaleString() ?? 0} ${p.data?.currency || 'USD'}`
      },
      {
        headerName: 'PayPal Order ID',
        field: 'paypalOrderId',
        width: 200,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (p: ICellRendererParams) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#93c5fd' }}>
            {p.value || '—'}
          </span>
        )
      },
      {
        headerName: 'Authorization ID',
        field: 'paypalAuthorizationId',
        width: 200,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (p: ICellRendererParams) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#a78bfa' }}>
            {p.value || '—'}
          </span>
        )
      },
      {
        headerName: 'Capture / Payout ID',
        field: 'paypalCaptureId',
        width: 200,
        sortable: true,
        valueGetter: (p) => p.data?.paypalCaptureId || p.data?.paypalPayoutBatchId || '—',
        cellRenderer: (p: ICellRendererParams) => (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#34d399' }}>
            {p.value}
          </span>
        )
      },
      {
        headerName: 'Recipient Developer',
        field: 'developerPayPalEmail',
        width: 220,
        sortable: true,
        filter: 'agTextColumnFilter',
        valueGetter: (p) => p.data?.developerPayPalEmail || p.data?.developerId || 'bounty-dev@sandbox.com'
      },
      {
        headerName: 'Created Date',
        field: 'createdAt',
        width: 160,
        sortable: true,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : '—')
      },
      {
        headerName: 'Proof-to-Pay Actions',
        field: 'actions',
        width: 230,
        pinned: 'right',
        cellRenderer: ActionsRenderer
      }
    ];
  }, [userRole, onRetryPayout]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          fontSize: '12px',
          color: '#93c5fd'
        }}
      >
        <Lock size={15} style={{ flexShrink: 0 }} />
        <span>
          <strong>Three-Stage Payment Pipeline:</strong> 1. Bounty Pre-Authorization (<code>intent: AUTHORIZE</code>) &rarr;
          2. Employer Review Gate captures authorization to merchant account &rarr;
          3. Automated developer payout transfer. If a payout fails, the captured status is safely preserved with one-click retry.
        </span>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '320px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by Order ID, Authorization ID, Email..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--input-bg)',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All Payment States ({payments.length})</option>
            <option value={PaymentStatus.AUTHORIZED}>Authorized Hold</option>
            <option value={PaymentStatus.CAPTURED}>Captured</option>
            <option value={PaymentStatus.PAID_OUT}>Paid Out</option>
            <option value={PaymentStatus.PAYOUT_FAILED}>Payout Failed</option>
            <option value={PaymentStatus.APPROVAL_PENDING}>Approval Pending</option>
            <option value={PaymentStatus.REFUNDED}>Refunded</option>
          </select>
        </div>

        <button
          onClick={handleExportCsv}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            backgroundColor: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Grid Container */}
      <div
        className="ag-theme-quartz-dark"
        style={{
          flex: 1,
          width: '100%',
          minHeight: '400px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid var(--border-color)'
        }}
      >
        <AgGridReact
          ref={gridRef}
          rowData={filteredData}
          columnDefs={colDefs}
          defaultColDef={{
            resizable: true,
            filter: true
          }}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={20}
          animateRows={true}
        />
      </div>
    </div>
  );
};
