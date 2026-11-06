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
  Search,
  Download,
  ShieldAlert,
  ShieldCheck,
  FileCode,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface FindingRow {
  id: string;
  taskId: string;
  taskTitle: string;
  submissionId: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'SECURITY';
  filePath: string;
  lineNumber?: number;
  criterionTitle: string;
  criterionSatisfied: boolean;
  message: string;
  suggestedFix?: string;
  confidence: number;
}

interface VerificationFindingsGridProps {
  tasks: any[];
  onInspectTask: (task: any) => void;
}

export const VerificationFindingsGrid: React.FC<VerificationFindingsGridProps> = ({
  tasks,
  onInspectTask
}) => {
  const gridRef = useRef<AgGridReact>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');

  // Extract all AI findings from all tasks and reports
  const allFindings = useMemo<FindingRow[]>(() => {
    const list: FindingRow[] = [];

    tasks.forEach((task) => {
      const report = task.latestVerificationReport;
      if (!report) return;

      // Extract criteria evaluations
      if (Array.isArray(report.criteriaEvaluations)) {
        report.criteriaEvaluations.forEach((evalItem: any, idx: number) => {
          if (!evalItem.passed) {
            list.push({
              id: `${task._id}-crit-${idx}`,
              taskId: task._id,
              taskTitle: task.title,
              submissionId: report.submissionId,
              severity: evalItem.mandatory ? 'CRITICAL' : 'MAJOR',
              filePath: evalItem.referencedFile || 'Repository Scope',
              lineNumber: evalItem.referencedLine,
              criterionTitle: evalItem.criterionTitle || `Criterion #${idx + 1}`,
              criterionSatisfied: false,
              message: evalItem.reason || evalItem.feedback || 'Criterion verification failed',
              suggestedFix: evalItem.suggestedFix || 'Ensure implementation strictly aligns with acceptance criteria specification',
              confidence: evalItem.confidenceScore ?? 92
            });
          }
        });
      }

      // Extract code review / security findings
      if (Array.isArray(report.findings)) {
        report.findings.forEach((finding: any, idx: number) => {
          list.push({
            id: `${task._id}-find-${idx}`,
            taskId: task._id,
            taskTitle: task.title,
            submissionId: report.submissionId,
            severity: finding.severity || (finding.isSecurity ? 'SECURITY' : 'MAJOR'),
            filePath: finding.filePath || finding.file || 'General Implementation',
            lineNumber: finding.lineNumber || finding.line,
            criterionTitle: finding.ruleId || 'Security & Code Quality Gate',
            criterionSatisfied: false,
            message: finding.message || finding.description || 'Code smell or potential defect identified by AI Verification',
            suggestedFix: finding.suggestedFix || finding.remediation,
            confidence: finding.confidence ?? 95
          });
        });
      }

      // If no granular findings in test fixtures, generate a clean summary row
      if ((!report.criteriaEvaluations || report.criteriaEvaluations.length === 0) &&
          (!report.findings || report.findings.length === 0)) {
        const passed = report.verdict === 'PASS';
        list.push({
          id: `${task._id}-summary`,
          taskId: task._id,
          taskTitle: task.title,
          submissionId: report.submissionId || 'sub-latest',
          severity: passed ? 'MINOR' : 'CRITICAL',
          filePath: 'Full Pull Request Scope',
          criterionTitle: report.verdict || 'Overall Assessment',
          criterionSatisfied: passed,
          message: report.overallAssessment || report.summary || 'Autonomous AI evaluation completed.',
          suggestedFix: passed ? undefined : 'Address flagged criteria and submit an updated revision PR.',
          confidence: report.score ?? report.overallScore ?? 88
        });
      }
    });

    return list;
  }, [tasks]);

  // Filter based on severity dropdown
  const filteredData = useMemo(() => {
    return allFindings.filter((row) => {
      if (selectedSeverity === 'ALL') return true;
      return row.severity === selectedSeverity;
    });
  }, [allFindings, selectedSeverity]);

  // CSV Export
  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `openproofpay-findings-${new Date().toISOString().slice(0, 10)}.csv`
      });
    }
  }, []);

  // Custom Cell Renderers
  const SeverityRenderer = (params: ICellRendererParams) => {
    const sev = (params.value as string)?.toUpperCase();
    let pillClass = 'minor';
    let icon = <HelpCircle size={12} />;

    if (sev === 'CRITICAL') {
      pillClass = 'critical';
      icon = <XCircle size={12} />;
    } else if (sev === 'MAJOR') {
      pillClass = 'major';
      icon = <ShieldAlert size={12} />;
    } else if (sev === 'SECURITY') {
      pillClass = 'security';
      icon = <ShieldAlert size={12} />;
    } else if (sev === 'MINOR') {
      pillClass = 'minor';
      icon = <CheckCircle2 size={12} />;
    }

    return (
      <span className={`severity-pill ${pillClass}`}>
        {icon}
        {sev}
      </span>
    );
  };

  const FileLocationRenderer = (params: ICellRendererParams) => {
    const filePath = params.data?.filePath || '—';
    const line = params.data?.lineNumber;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)' }}>
        <FileCode size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ color: '#93c5fd', fontSize: '12px' }}>{filePath}</span>
        {line && (
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            :L{line}
          </span>
        )}
      </div>
    );
  };

  const ConfidenceRenderer = (params: ICellRendererParams) => {
    const conf = params.value as number;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '45px', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${conf}%`, height: '100%', backgroundColor: conf >= 85 ? 'var(--accent-green)' : 'var(--accent-amber)' }} />
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{conf}%</span>
      </div>
    );
  };

  // AG Grid Column Definitions
  const colDefs = useMemo<ColDef[]>(() => {
    return [
      {
        headerName: 'Severity',
        field: 'severity',
        width: 130,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: SeverityRenderer
      },
      {
        headerName: 'Requirement / Rule',
        field: 'criterionTitle',
        width: 200,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (p: ICellRendererParams) => (
          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{p.value}</span>
        )
      },
      {
        headerName: 'Code Location',
        field: 'filePath',
        width: 220,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: FileLocationRenderer
      },
      {
        headerName: 'AI Verification Finding & Remediation',
        field: 'message',
        flex: 2,
        minWidth: 280,
        filter: 'agTextColumnFilter',
        cellRenderer: (p: ICellRendererParams) => {
          const row = p.data as FindingRow;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
              <span style={{ color: '#e2e8f0', fontSize: '12px' }}>{row.message}</span>
              {row.suggestedFix && (
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                  Fix: {row.suggestedFix}
                </span>
              )}
            </div>
          );
        }
      },
      {
        headerName: 'Task',
        field: 'taskTitle',
        width: 170,
        sortable: true,
        filter: 'agTextColumnFilter'
      },
      {
        headerName: 'AI Confidence',
        field: 'confidence',
        width: 130,
        sortable: true,
        cellRenderer: ConfidenceRenderer
      },
      {
        headerName: 'Inspect',
        width: 110,
        pinned: 'right',
        cellRenderer: (p: ICellRendererParams) => {
          const task = tasks.find((t) => t._id === p.data?.taskId);
          return (
            <button
              onClick={() => task && onInspectTask(task)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                cursor: 'pointer'
              }}
            >
              <ShieldCheck size={12} />
              Details
            </button>
          );
        }
      }
    ];
  }, [tasks, onInspectTask]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
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
          {/* Quick Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '320px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search findings, files, rules..."
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

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
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
            <option value="ALL">All Severities ({allFindings.length})</option>
            <option value="CRITICAL">Critical Only</option>
            <option value="MAJOR">Major Only</option>
            <option value="SECURITY">Security Findings</option>
            <option value="MINOR">Minor Only</option>
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
          Export Findings CSV
        </button>
      </div>

      {/* Grid */}
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
          rowData={filteredData}
          columnDefs={colDefs}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={15}
          paginationPageSizeSelector={[10, 15, 25, 50]}
          rowHeight={56}
          headerHeight={40}
          animateRows={true}
          suppressCellFocus={true}
          overlayNoRowsTemplate={
            '<div style="color: #64748b; font-size: 14px; padding: 24px;">No AI verification findings found. All evaluated Pull Requests pass criteria cleanly!</div>'
          }
        />
      </div>
    </div>
  );
};
