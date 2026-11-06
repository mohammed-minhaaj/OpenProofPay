import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { webApi, UserSession } from '../services/api.js';
import {
  Download,
  Search,
  RefreshCw
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

interface ActivityPaymentsScreenProps {
  user: UserSession;
  payments: any[];
  onRefreshData: () => void;
  onNavigate: (screen: string, taskId?: string) => void;
}

export const ActivityPaymentsScreen: React.FC<ActivityPaymentsScreenProps> = ({
  user: _user,
  payments,
  onRefreshData,
  onNavigate
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'PAYMENTS' | 'AUDIT'>('PAYMENTS');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [_loadingAudit, setLoadingAudit] = useState(false);

  // Load audit logs if viewing audit tab
  useEffect(() => {
    if (viewMode === 'AUDIT') {
      const fetchAudit = async () => {
        setLoadingAudit(true);
        try {
          // Endpoint for audit log
          const res = await webApi.get('/audit-logs').catch(() => ({ data: [] }));
          setAuditLogs(res?.data || []);
        } catch {
          setAuditLogs([]);
        } finally {
          setLoadingAudit(false);
        }
      };
      fetchAudit();
    }
  }, [viewMode]);

  // Aggregate stats
  const totals = useMemo(() => {
    let disbursed = 0;
    let authorized = 0;

    for (const p of payments) {
      if (p.status === 'PAID_OUT' || p.payoutStatus === 'SUCCESS') {
        disbursed += p.amount || 0;
      } else if (p.status === 'AUTHORIZED' || p.status === 'CAPTURED') {
        authorized += p.amount || 0;
      }
    }

    return {
      disbursed,
      authorized,
      count: payments.length
    };
  }, [payments]);

  // Filtered rows for AG Grid
  const rowData = useMemo(() => {
    if (viewMode === 'AUDIT') {
      return auditLogs.map((log: any) => ({
        id: log._id || log.id,
        timestamp: new Date(log.createdAt || Date.now()).toLocaleString(),
        action: log.action || 'AUDIT_EVENT',
        resourceType: log.resourceType || 'Task',
        resourceId: log.resourceId || '-',
        actorRole: log.actorRole || 'SYSTEM',
        ipAddress: log.ipAddress || '127.0.0.1',
        details: log.metadata ? JSON.stringify(log.metadata) : ''
      }));
    }

    return payments
      .filter((p) => {
        if (statusFilter === 'ALL') return true;
        return p.status === statusFilter || p.payoutStatus === statusFilter;
      })
      .map((p) => ({
        id: p._id || p.id,
        timestamp: new Date(p.createdAt).toLocaleString(),
        taskTitle: p.taskTitle || (p.taskId ? `Task #${p.taskId.slice(-4)}` : 'Milestone Bounty'),
        taskId: p.taskId,
        amount: `$${p.amount} ${p.currency || 'USD'}`,
        rawAmount: p.amount,
        status: p.status,
        payoutStatus: p.payoutStatus || 'N/A',
        paypalOrderId: p.paypalOrderId || '-',
        paypalAuthorizationId: p.paypalAuthorizationId || '-',
        paypalCaptureId: p.paypalCaptureId || '-',
        paypalPayoutBatchId: p.paypalPayoutBatchId || '-',
        idempotencyKey: p.idempotencyKey || '-'
      }));
  }, [payments, statusFilter, viewMode, auditLogs]);

  // AG Grid Column Definitions
  const paymentColumnDefs = useMemo<ColDef[]>(
    () => ([
      {
        headerName: 'Date / Time',
        field: 'timestamp',
        width: 170,
        sortable: true,
        filter: true
      },
      {
        headerName: 'Bounty / Deliverable',
        field: 'taskTitle',
        flex: 1,
        minWidth: 180,
        cellRenderer: (params: any) => {
          return (
            <div
              style={{ color: 'var(--primary-accent)', cursor: 'pointer', fontWeight: 500 }}
              onClick={() => params.data.taskId && onNavigate('bounty', params.data.taskId)}
            >
              {params.value}
            </div>
          );
        }
      },
      {
        headerName: 'Amount',
        field: 'amount',
        width: 120,
        sortable: true,
        cellStyle: { fontWeight: '600' }
      },
      {
        headerName: 'Status',
        field: 'status',
        width: 140,
        cellRenderer: (params: any) => {
          const val = params.value;
          let bg = 'var(--status-info-bg)';
          let color = 'var(--status-info)';
          let border = '1px solid var(--status-info-border)';
          if (val === 'PAID_OUT' || val === 'CAPTURED') {
            bg = 'var(--status-success-bg)';
            color = 'var(--status-success)';
            border = '1px solid var(--status-success-border)';
          } else if (val === 'AUTHORIZED') {
            bg = 'var(--status-info-bg)';
            color = 'var(--status-info)';
            border = '1px solid var(--status-info-border)';
          } else if (val === 'FAILED' || val === 'CANCELLED') {
            bg = 'var(--status-error-bg)';
            color = 'var(--status-error)';
            border = '1px solid var(--status-error-border)';
          }
          return (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: bg,
                color,
                border
              }}
            >
              {val}
            </span>
          );
        }
      },
      {
        headerName: 'Payout Status',
        field: 'payoutStatus',
        width: 130,
        cellRenderer: (params: any) => {
          const val = params.value;
          let color = 'var(--text-muted)';
          if (val === 'SUCCESS') color = 'var(--status-success)';
          if (val === 'FAILED') color = 'var(--status-error)';
          if (val === 'PENDING') color = 'var(--status-warning)';
          return <span style={{ fontSize: '11px', fontWeight: 600, color }}>{val}</span>;
        }
      },
      {
        headerName: 'PayPal Order ID',
        field: 'paypalOrderId',
        width: 150,
        cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '11px' }
      },
      {
        headerName: 'Auth ID',
        field: 'paypalAuthorizationId',
        width: 150,
        cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '11px' }
      },
      {
        headerName: 'Capture ID',
        field: 'paypalCaptureId',
        width: 150,
        cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '11px' }
      },
      {
        headerName: 'Payout Batch ID',
        field: 'paypalPayoutBatchId',
        width: 160,
        cellStyle: { fontFamily: 'var(--font-mono)', fontSize: '11px' }
      }
    ] as ColDef[]),
    [onNavigate]
  );

  const auditColumnDefs = useMemo<ColDef[]>(
    () => ([
      { headerName: 'Timestamp', field: 'timestamp', width: 170, sortable: true },
      { headerName: 'Action', field: 'action', width: 220, cellStyle: { fontWeight: '600' } },
      { headerName: 'Resource', field: 'resourceType', width: 130 },
      { headerName: 'Resource ID', field: 'resourceId', width: 140, cellStyle: { fontFamily: 'var(--font-mono)' } },
      { headerName: 'Actor Role', field: 'actorRole', width: 120 },
      { headerName: 'IP Address', field: 'ipAddress', width: 130 },
      { headerName: 'Metadata', field: 'details', flex: 1, minWidth: 200 }
    ] as ColDef[]),
    []
  );

  // CSV Export Handler
  const handleExportCsv = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({
      fileName: `openproofpay-${viewMode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`
    });
  }, [viewMode]);

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Title & Description */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Activity & Payments
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Financial ledger, PayPal Sandbox transaction IDs, and immutable append-only audit trail.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--card-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
          <button
            onClick={() => setViewMode('PAYMENTS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: viewMode === 'PAYMENTS' ? 600 : 500,
              backgroundColor: viewMode === 'PAYMENTS' ? 'var(--btn-primary-bg)' : 'transparent',
              color: viewMode === 'PAYMENTS' ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Payment Ledger
          </button>
          <button
            onClick={() => setViewMode('AUDIT')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: viewMode === 'AUDIT' ? 600 : 500,
              backgroundColor: viewMode === 'AUDIT' ? 'var(--btn-primary-bg)' : 'transparent',
              color: viewMode === 'AUDIT' ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Audit Trail
          </button>
        </div>
      </div>

      {/* 3 Summary Stat Mini-Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderRadius: '10px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Disbursed
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px' }}>
            ${totals.disbursed.toLocaleString()} USD
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Captured & paid via PayPal Payout
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRadius: '10px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Authorization Holds
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-accent)', marginTop: '4px' }}>
            ${totals.authorized.toLocaleString()} USD
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Held in escrow pending PR approval
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderRadius: '10px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Transactions
          </span>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            {totals.count}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Server-verified PayPal Sandbox events
          </div>
        </div>
      </div>

      {/* Grid Controls (Search + Filters + Export) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                borderRadius: '6px',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {viewMode === 'PAYMENTS' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none'
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID_OUT">Paid Out</option>
              <option value="CAPTURED">Captured</option>
              <option value="AUTHORIZED">Authorized</option>
              <option value="FAILED">Failed</option>
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onRefreshData}
            title="Refresh grid data"
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button
            onClick={handleExportCsv}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* AG Grid Container (Sponsor component strictly on Activity screen) */}
      <div
        className="ag-theme-quartz-dark"
        style={{
          height: '520px',
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
      >
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={viewMode === 'PAYMENTS' ? paymentColumnDefs : auditColumnDefs}
          quickFilterText={quickFilterText}
          animateRows={true}
          pagination={true}
          paginationPageSize={15}
          paginationPageSizeSelector={[15, 30, 50]}
          domLayout="normal"
        />
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'right' }}>
        Powered by AG Grid Community • PayPal Sandbox v2 REST Integration
      </p>
    </div>
  );
};
