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
import {
  TaskStatus,
  PaymentStatus,
  UserRole
} from '@openproofpay/shared';
import {
  Search,
  Download,
  Plus,
  ExternalLink,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  Play
} from 'lucide-react';

// Register All Community Modules (Sorting, Filters, CsvExport, etc.)
ModuleRegistry.registerModules([AllCommunityModule]);

interface TaskGridProps {
  tasks: any[];
  projects: any[];
  loading?: boolean;
  userRole: UserRole;
  onRefresh?: () => void;
  onInspectEvidence: (task: any) => void;
  onReviewTask: (task: any) => void;
  onReleasePayment: (task: any) => void;
  onOpenDispute?: (task: any) => void;
  onStartTask?: (task: any) => void;
  onCreateTask: () => void;
  onCreateProject: () => void;
}

export const TaskManagementGrid: React.FC<TaskGridProps> = ({
  tasks,
  projects,
  userRole,
  onInspectEvidence,
  onReviewTask,
  onReleasePayment,
  onOpenDispute,
  onStartTask,
  onCreateTask,
  onCreateProject
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Filter tasks based on UI toolbar controls
  const rowData = useMemo(() => {
    return tasks.filter((t) => {
      const taskProjId = t.projectId?._id || t.projectId?.id || (typeof t.projectId === 'string' ? t.projectId : '');
      const matchesProject =
        selectedProjectFilter === 'ALL' || taskProjId === selectedProjectFilter;
      const matchesStatus =
        selectedStatusFilter === 'ALL' || t.status === selectedStatusFilter;
      return matchesProject && matchesStatus;
    });
  }, [tasks, selectedProjectFilter, selectedStatusFilter]);

  // Export to CSV
  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `openproofpay-tasks-export-${new Date().toISOString().slice(0, 10)}.csv`
      });
    }
  }, []);

  // Custom Cell Renderers
  const StatusCellRenderer = (params: ICellRendererParams) => {
    const status = params.value as TaskStatus;
    let bgColor = 'rgba(100, 116, 139, 0.2)';
    let textColor = '#94a3b8';
    let borderColor = 'rgba(100, 116, 139, 0.4)';

    switch (status) {
      case TaskStatus.APPROVED:
        bgColor = 'rgba(16, 185, 129, 0.2)';
        textColor = '#34d399';
        borderColor = 'rgba(16, 185, 129, 0.4)';
        break;
      case TaskStatus.PAYMENT_COMPLETED:
        bgColor = 'rgba(37, 99, 235, 0.25)';
        textColor = '#60a5fa';
        borderColor = 'rgba(37, 99, 235, 0.5)';
        break;
      case TaskStatus.SUBMITTED:
      case TaskStatus.VERIFYING:
      case TaskStatus.AWAITING_EMPLOYER_APPROVAL:
        bgColor = 'rgba(245, 158, 11, 0.2)';
        textColor = '#fbbf24';
        borderColor = 'rgba(245, 158, 11, 0.4)';
        break;
      case TaskStatus.REVISION_REQUESTED:
      case TaskStatus.REJECTED:
        bgColor = 'rgba(239, 68, 68, 0.2)';
        textColor = '#f87171';
        borderColor = 'rgba(239, 68, 68, 0.4)';
        break;
      case TaskStatus.IN_PROGRESS:
        bgColor = 'rgba(139, 92, 246, 0.2)';
        textColor = '#a78bfa';
        borderColor = 'rgba(139, 92, 246, 0.4)';
        break;
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '4px',
            backgroundColor: bgColor,
            color: textColor,
            border: `1px solid ${borderColor}`,
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}
        >
          {status ? status.replace(/_/g, ' ') : 'NOT_CONFIGURED'}
        </span>
      </div>
    );
  };

  const PaymentStatusRenderer = (params: ICellRendererParams) => {
    const payment = params.data?.payment;
    const paymentStatus = payment?.status || PaymentStatus.NOT_CONFIGURED;

    let color = '#94a3b8';
    let icon = <Clock size={12} />;

    if (paymentStatus === PaymentStatus.CAPTURED || paymentStatus === PaymentStatus.PAID_OUT) {
      color = '#34d399';
      icon = <CheckCircle size={12} />;
    } else if (paymentStatus === PaymentStatus.AUTHORIZED) {
      color = '#60a5fa';
      icon = <DollarSign size={12} />;
    } else if (paymentStatus === PaymentStatus.FAILED || paymentStatus === PaymentStatus.REFUNDED) {
      color = '#f87171';
      icon = <AlertTriangle size={12} />;
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color }}>
        {icon}
        <span style={{ fontWeight: 500 }}>
          {paymentStatus === PaymentStatus.AUTHORIZED ? 'HELD IN ESCROW' : paymentStatus.replace(/_/g, ' ')}
        </span>
      </div>
    );
  };

  const AiScoreGaugeRenderer = (params: ICellRendererParams) => {
    const report = params.data?.latestVerificationReport;
    const score = report?.score ?? report?.overallScore;

    if (score === undefined || score === null) {
      return (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Not Verified
        </span>
      );
    }

    let fillColor = 'var(--accent-red)';
    if (score >= 90) fillColor = 'var(--accent-green)';
    else if (score >= 70) fillColor = 'var(--accent-amber)';

    return (
      <div style={{ width: '100%', paddingRight: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
          <span style={{ color: fillColor }}>{score}/100</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {score >= 90 ? 'PASSED' : score >= 70 ? 'REVIEW' : 'FAIL'}
          </span>
        </div>
        <div className="score-gauge-bar">
          <div
            className="score-gauge-fill"
            style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: fillColor }}
          />
        </div>
      </div>
    );
  };

  const TestExecutionRenderer = (params: ICellRendererParams) => {
    const testExec = params.data?.latestTestExecution;
    if (!testExec) {
      return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No Run</span>;
    }

    const passed = testExec.status === 'PASSED';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: passed ? '#34d399' : '#f87171',
            border: `1px solid ${passed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
          }}
        >
          {passed ? `PASSED (${testExec.passedTests ?? 0})` : 'FAILED'}
        </span>
      </div>
    );
  };

  const GitHubPrRenderer = (params: ICellRendererParams) => {
    const prUrl = params.data?.githubPrUrl || params.data?.githubIssueUrl;
    if (!prUrl) {
      return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>;
    }
    return (
      <a
        href={prUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--accent-blue)',
          textDecoration: 'none'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={13} />
        <span>PR / Issue</span>
      </a>
    );
  };

  const ActionsRenderer = (params: ICellRendererParams) => {
    const task = params.data;
    if (!task) return null;

    const isEmployer = userRole === UserRole.EMPLOYER || userRole === UserRole.ADMIN;
    const canApprove = isEmployer && (task.status === TaskStatus.AWAITING_EMPLOYER_APPROVAL || task.status === TaskStatus.SUBMITTED);
    const canRelease = isEmployer && task.status === TaskStatus.APPROVED;
    const canStart = !isEmployer && (task.status === TaskStatus.CREATED || task.status === TaskStatus.ASSIGNED);

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Inspect Evidence Button */}
        <button
          onClick={() => onInspectEvidence(task)}
          title="Inspect AI Verification findings and test runner logs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 500,
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            cursor: 'pointer'
          }}
        >
          <ShieldCheck size={12} />
          Evidence
        </button>

        {/* Employer Review Button */}
        {canApprove && (
          <button
            onClick={() => onReviewTask(task)}
            title="Perform human employer decision gate"
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              cursor: 'pointer'
            }}
          >
            Review
          </button>
        )}

        {/* Proof-to-Pay Release Button */}
        {canRelease && (
          <button
            onClick={() => onReleasePayment(task)}
            title="Execute Proof-to-Pay release and capture PayPal authorization"
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'var(--accent-green)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(16, 185, 129, 0.4)'
            }}
          >
            Release Bounty
          </button>
        )}

        {/* Dispute Button */}
        {onOpenDispute && (
          <button
            onClick={() => onOpenDispute(task)}
            title={task.status === TaskStatus.DISPUTED ? 'View active dispute' : 'Raise dispute'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: task.status === TaskStatus.DISPUTED ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              cursor: 'pointer'
            }}
          >
            <AlertTriangle size={12} />
            {task.status === TaskStatus.DISPUTED ? 'Disputed' : 'Dispute'}
          </button>
        )}

        {/* Developer Start Button */}
        {canStart && onStartTask && (
          <button
            onClick={() => onStartTask(task)}
            title="Accept milestone task and begin development"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: 'rgba(139, 92, 246, 0.2)',
              color: '#c4b5fd',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              cursor: 'pointer'
            }}
          >
            <Play size={11} />
            Start
          </button>
        )}
      </div>
    );
  };

  // AG Grid Column Definitions
  const colDefs = useMemo<ColDef[]>(() => {
    return [
      {
        headerName: 'Task Title & Deliverable',
        field: 'title',
        flex: 2,
        minWidth: 220,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params: ICellRendererParams) => {
          return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, color: '#fff' }}>{params.value}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                ID: {params.data?._id?.slice(-8) ?? '—'}
              </span>
            </div>
          );
        }
      },
      {
        headerName: 'Status',
        field: 'status',
        width: 160,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: StatusCellRenderer
      },
      {
        headerName: 'Bounty ($)',
        field: 'bountyAmount',
        width: 120,
        sortable: true,
        filter: 'agNumberColumnFilter',
        valueGetter: (params) => params.data?.paymentAmount ?? params.data?.bountyAmount ?? 0,
        valueFormatter: (params) => `$${params.value?.toLocaleString()}`
      },
      {
        headerName: 'Payment State',
        field: 'payment.status',
        width: 170,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: PaymentStatusRenderer
      },
      {
        headerName: 'AI Verification',
        field: 'latestVerificationReport.overallScore',
        width: 160,
        sortable: true,
        filter: 'agNumberColumnFilter',
        cellRenderer: AiScoreGaugeRenderer
      },
      {
        headerName: 'Sandbox Tests',
        field: 'latestTestExecution.status',
        width: 140,
        sortable: true,
        cellRenderer: TestExecutionRenderer
      },
      {
        headerName: 'Criteria',
        field: 'acceptanceCriteria',
        width: 110,
        sortable: true,
        valueGetter: (params) => {
          const list = params.data?.acceptanceCriteria || [];
          const mand = list.filter((c: any) => c.mandatory).length;
          return `${mand}/${list.length}`;
        },
        cellRenderer: (params: ICellRendererParams) => (
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {params.value} mandatory
          </span>
        )
      },
      {
        headerName: 'GitHub PR',
        field: 'githubPrUrl',
        width: 120,
        cellRenderer: GitHubPrRenderer
      },
      {
        headerName: 'Proof-to-Pay Actions',
        field: 'actions',
        width: 220,
        pinned: 'right',
        cellRenderer: ActionsRenderer
      }
    ];
  }, [userRole]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Grid Toolbar */}
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
        {/* Left: Quick Search & Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px' }}>
          {/* Quick Search */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              maxWidth: '300px'
            }}
          >
            <Search
              size={15}
              style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search tasks, deliverables, IDs..."
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

          {/* Project Filter */}
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
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
            <option value="ALL">All Projects ({projects.length})</option>
            {projects.map((p) => {
              const id = p.id || p._id;
              return (
                <option key={id} value={id}>
                  {p.name}
                </option>
              );
            })}
          </select>

          {/* Status Quick Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
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
            <option value="ALL">All Statuses</option>
            <option value={TaskStatus.CREATED}>Created</option>
            <option value={TaskStatus.ASSIGNED}>Assigned</option>
            <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
            <option value={TaskStatus.SUBMITTED}>Submitted</option>
            <option value={TaskStatus.AWAITING_EMPLOYER_APPROVAL}>Awaiting Employer Approval</option>
            <option value={TaskStatus.APPROVED}>Approved</option>
            <option value={TaskStatus.PAYMENT_COMPLETED}>Payment Completed</option>
            <option value={TaskStatus.REVISION_REQUESTED}>Revision Requested</option>
          </select>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Export to CSV */}
          <button
            onClick={handleExportCsv}
            title="Export filtered tasks to CSV"
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

          {/* Create Project Button */}
          {userRole === UserRole.EMPLOYER && (
            <button
              onClick={onCreateProject}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
                cursor: 'pointer'
              }}
            >
              <Plus size={14} />
              New Project
            </button>
          )}

          {/* Create Task Button */}
          {userRole === UserRole.EMPLOYER && (
            <button
              onClick={onCreateTask}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'var(--accent-blue)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)'
              }}
            >
              <Plus size={14} />
              Create Milestone Task
            </button>
          )}
        </div>
      </div>

      {/* AG Grid Container */}
      <div
        className="ag-theme-quartz-dark"
        style={{
          flex: 1,
          width: '100%',
          minHeight: '520px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
        }}
      >
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={colDefs}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={15}
          paginationPageSizeSelector={[10, 15, 25, 50]}
          rowHeight={48}
          headerHeight={40}
          animateRows={true}
          suppressCellFocus={true}
          overlayLoadingTemplate={
            '<div style="color: #94a3b8; font-size: 14px;">Loading milestone deliverables...</div>'
          }
          overlayNoRowsTemplate={
            '<div style="color: #64748b; font-size: 14px; padding: 24px;">No milestone tasks found. Create a project and milestone task to get started!</div>'
          }
        />
      </div>
    </div>
  );
};
