import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlimTopBar } from './components/SlimTopBar.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { NewBountyScreen } from './screens/NewBountyScreen.js';
import { BountyPageScreen } from './screens/BountyPageScreen.js';
import { ReviewPageScreen } from './screens/ReviewPageScreen.js';
import { ActivityPaymentsScreen } from './screens/ActivityPaymentsScreen.js';
import { UserRole } from '@openproofpay/shared';

describe('Frontend Smoke Test: Strictly 5 Calm Screens & TopBar', () => {
  const mockAdminUser = {
    id: 'user-admin-1',
    email: 'admin@proofpay.io',
    name: 'Admin Alice',
    role: UserRole.EMPLOYER
  };

  const mockDevUser = {
    id: 'user-dev-1',
    email: 'dev@proofpay.io',
    name: 'Dev Bob',
    role: UserRole.DEVELOPER
  };

  const mockTasks = [
    {
      _id: 'task-1',
      id: 'task-1',
      title: 'Fix issue #42: JWT Rotation',
      description: 'Implement token rotation with secure cookie storage',
      status: 'OPEN',
      bountyAmount: 250,
      paymentAmount: 250,
      bountyCurrency: 'USD',
      acceptanceCriteria: [
        { id: 'c1', title: 'Criterion 1', description: 'Mandatory bcrypt hash check', mandatory: true },
        { id: 'c2', title: 'Criterion 2', description: 'Rotate refresh token on use', mandatory: true }
      ],
      createdAt: new Date().toISOString()
    },
    {
      _id: 'task-2',
      id: 'task-2',
      title: 'Fix issue #99: Anti-IDOR Checks',
      description: 'Add anti-IDOR checks on payment release routes',
      status: 'AWAITING_REVIEW',
      bountyAmount: 500,
      paymentAmount: 500,
      bountyCurrency: 'USD',
      acceptanceCriteria: [
        { id: 'c1', title: 'Criterion 1', description: 'Prevent unauthorized user access', mandatory: true }
      ],
      createdAt: new Date().toISOString()
    }
  ];

  const mockReport = {
    _id: 'rep-1',
    taskId: 'task-2',
    commitSha: 'a1b2c3d4e5f67890',
    currentHeadSha: 'a1b2c3d4e5f67890',
    isOutdated: false,
    score: 92,
    deterministicScore: 92,
    recommendation: 'ACCEPT',
    aiRecommendation: 'ACCEPT',
    adminSummary: 'All mandatory criteria are verified with valid line ranges.',
    ciTestStatus: 'PASSED',
    criteriaEvaluations: [
      {
        criterionId: 'c1',
        title: 'Prevent unauthorized user access',
        status: 'satisfied',
        explanation: 'Ownership checked before payment release',
        confidence: 0.95,
        evidence: [
          {
            filePath: 'src/modules/payments/payments.service.ts',
            startLine: 40,
            endLine: 45,
            codeExcerpt: 'if (task.employerId !== caller.id) throw new ForbiddenException();',
            isVerified: true
          }
        ]
      }
    ],
    securityFindings: [],
    codeQualityFindings: []
  };

  it('1. SlimTopBar renders branding, role pill, and navigation links', () => {
    const html = renderToStaticMarkup(
      React.createElement(SlimTopBar, {
        user: mockAdminUser,
        activeScreen: 'home',
        theme: 'dark',
        onNavigate: vi.fn(),
        onToggleTheme: vi.fn(),
        onLogout: vi.fn()
      })
    );

    expect(html).toContain('OpenProofPay');
    expect(html).toContain('PayPal Sandbox');
    expect(html).toContain('Home');
    expect(html).toContain('Activity &amp; Payments');
    expect(html).toContain('Admin Alice');
    expect(html).toContain('Admin');
  });

  it('2. HomeScreen renders 3 stat cards, filter controls, and role-specific primary CTA', () => {
    // Admin view
    const adminHtml = renderToStaticMarkup(
      React.createElement(HomeScreen, {
        user: mockAdminUser,
        tasks: mockTasks,
        payments: [],
        loading: false,
        onNavigate: vi.fn()
      })
    );
    expect(adminHtml).toContain('Open Bounties');
    expect(adminHtml).toContain('Awaiting Review');
    expect(adminHtml).toContain('Paid Out');
    expect(adminHtml).toContain('New Bounty');

    // Developer view
    const devHtml = renderToStaticMarkup(
      React.createElement(HomeScreen, {
        user: mockDevUser,
        tasks: mockTasks,
        payments: [],
        loading: false,
        onNavigate: vi.fn()
      })
    );
    expect(devHtml).toContain('Browse Open Bounties');
  });

  it('3. NewBountyScreen renders the 3-step guided wizard (Repo -> Criteria -> PayPal Hold)', () => {
    const html = renderToStaticMarkup(
      React.createElement(NewBountyScreen, {
        user: mockAdminUser,
        projects: [],
        onNavigate: vi.fn(),
        onRefreshData: vi.fn()
      })
    );

    expect(html).toContain('Back to bounties');
    expect(html).toContain('1. Pick Repo &amp; Issue');
    expect(html).toContain('2. Bounty Amount &amp; Scope');
    expect(html).toContain('3. Authorize PayPal');
    expect(html).toContain('Fetch Issue');
    expect(html).toContain('Fetch &amp; Continue');
  });

  it('4. BountyPageScreen renders issue details, criteria checklist, and single contextual action', () => {
    const html = renderToStaticMarkup(
      React.createElement(BountyPageScreen, {
        taskId: 'task-1',
        user: mockDevUser,
        initialTask: mockTasks[0],
        onNavigate: vi.fn(),
        onRefreshData: vi.fn()
      })
    );

    expect(html).toContain('Fix issue #42: JWT Rotation');
    expect(html).toContain('Implement token rotation with secure cookie storage');
    expect(html).toContain('Acceptance Criteria Checklist');
    expect(html).toContain('Mandatory bcrypt hash check');
    expect(html).toContain('Claim Bounty');
  });

  it('5. ReviewPageScreen renders unified review hub (AI summary, criteria evidence, findings, CI checks, diff, decision bar)', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewPageScreen, {
        taskId: 'task-2',
        user: mockAdminUser,
        initialTask: mockTasks[1],
        initialReport: mockReport,
        onNavigate: vi.fn(),
        onRefreshData: vi.fn()
      })
    );

    expect(html).toContain('Fix issue #99: Anti-IDOR Checks');
    expect(html).toContain('Autonomous AI Recommendation');
    expect(html).toContain('Score / 100');
    expect(html).toContain('92');
    expect(html).toContain('Issue vs. PR Analysis');
    expect(html).toContain('Automated Sandbox Testing &amp; CI Status');
    expect(html).toContain('Approve &amp; Pay ($500)');
    expect(html).toContain('Request Changes');
    expect(html).toContain('Reject');
  });

  it('6. ActivityPaymentsScreen renders ledger with AG Grid Community container and filter controls', () => {
    const mockPayments = [
      {
        _id: 'pay-1',
        taskId: 'task-1',
        amount: 250,
        currency: 'USD',
        status: 'PAID_OUT',
        paypalOrderId: 'ORD-123',
        paypalAuthorizationId: 'AUTH-456',
        paypalCaptureId: 'CAP-789',
        paypalPayoutBatchId: 'BATCH-001',
        recipientEmail: 'dev@proofpay.io',
        createdAt: new Date().toISOString()
      }
    ];

    const html = renderToStaticMarkup(
      React.createElement(ActivityPaymentsScreen, {
        user: mockAdminUser,
        payments: mockPayments,
        onRefreshData: vi.fn(),
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain('Activity &amp; Payments');
    expect(html).toContain('AG Grid Community');
    expect(html).toContain('Export CSV');
    expect(html).toContain('Payment Ledger');
  });
});
