import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requireRole } from '../auth/auth.middleware.js';
import { UserRole, TaskStatus, PaymentStatus } from '@openproofpay/shared';
import { AppError } from '../../errors/AppError.js';
import paymentRouter from '../payments/payments.routes.js';
import taskRouter from './tasks.routes.js';
import { PaymentGuardService } from '../payments/PaymentGuardService.js';
import { AIVerificationController } from '../ai-verification/ai-verification.controller.js';
import { AIVerificationService } from '../ai-verification/ai-verification.service.js';
import { TaskModel } from '../../models/Task.js';
import { PaymentModel } from '../../models/Payment.js';
import { PullRequestSubmissionModel } from '../../models/PullRequestSubmission.js';
import { VerificationReportModel } from '../../models/VerificationReport.js';

describe('OpenProofPay — Security, Developer Permissions & Review Gates Unit Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRes = {
      status: vi.fn(),
      json: vi.fn()
    } as any;
    (mockRes.status as any).mockReturnValue(mockRes);
    (mockRes.json as any).mockReturnValue(mockRes);
    mockNext = vi.fn();
  });

  // =========================================================================
  // 1. RBAC MIDDLEWARE TESTS
  // =========================================================================
  describe('1. Role-Based Access Control Middleware (requireRole)', () => {
    const employerOrAdminOnly = requireRole([UserRole.EMPLOYER, UserRole.ADMIN]);
    const developerOrAdminOnly = requireRole([UserRole.DEVELOPER, UserRole.ADMIN]);

    it('strictly forbids DEVELOPER from employer/admin routes with 403 Forbidden', () => {
      mockReq = {
        user: { userId: 'dev-123', email: 'dev@openproofpay.test', role: UserRole.DEVELOPER }
      };

      employerOrAdminOnly(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = vi.mocked(mockNext).mock.calls[0]![0] as unknown as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('Access forbidden');
    });

    it('permits EMPLOYER on employer/admin routes', () => {
      mockReq = {
        user: { userId: 'emp-456', email: 'emp@openproofpay.test', role: UserRole.EMPLOYER }
      };

      employerOrAdminOnly(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('permits ADMIN on employer/admin routes', () => {
      mockReq = {
        user: { userId: 'admin-999', email: 'admin@openproofpay.test', role: UserRole.ADMIN }
      };

      employerOrAdminOnly(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('strictly forbids EMPLOYER from developer-only routes with 403 Forbidden', () => {
      mockReq = {
        user: { userId: 'emp-456', email: 'emp@openproofpay.test', role: UserRole.EMPLOYER }
      };

      developerOrAdminOnly(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = vi.mocked(mockNext).mock.calls[0]![0] as unknown as AppError;
      expect(error.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // 2. ROUTE CONTRACT & MIDDLEWARE AUDIT
  // =========================================================================
  describe('2. Route Middleware Definition Audit', () => {
    it('verifies all critical payment release & mutate routes enforce employer/admin roles', () => {
      const routes = paymentRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
          stack: layer.route.stack
        }));

      const criticalRoutes = [
        '/tasks/:taskId/release',
        '/tasks/:taskId/retry-payout',
        '/tasks/:taskId/create-order',
        '/orders/:orderId/authorize',
        '/orders/:orderId/cancel'
      ];

      for (const targetPath of criticalRoutes) {
        const found = routes.find((r) => r.path === targetPath && r.methods.includes('post'));
        expect(found, `Route ${targetPath} must be defined`).toBeDefined();
        expect(found!.stack.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('verifies task review and decision routes enforce employer/admin roles', () => {
      const routes = taskRouter.stack
        .filter((layer: any) => layer.route)
        .map((layer: any) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
          stack: layer.route.stack
        }));

      const adminDecisionRoutes = [
        '/:id/review',
        '/:id/approve',
        '/:id/request-revision'
      ];

      for (const targetPath of adminDecisionRoutes) {
        const found = routes.find((r) => r.path === targetPath && r.methods.includes('post'));
        expect(found, `Route ${targetPath} must be defined`).toBeDefined();
        expect(found!.stack.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  // =========================================================================
  // 3. PAYMENT GUARD SERVICE (PROOF-TO-PAY GATE ENFORCEMENT)
  // =========================================================================
  describe('3. PaymentGuardService Proof-to-Pay Gate Enforcement', () => {
    const mockTaskId = '6728eb7a9d3148479e000001';
    const mockEmployerId = '6728eb7a9d3148479e000002';
    const mockDeveloperId = '6728eb7a9d3148479e000003';
    const mockSubId = '6728eb7a9d3148479e000004';

    it('rejects developer attempting to release payment with NOT_TASK_EMPLOYER (403)', async () => {
      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        status: TaskStatus.APPROVED
      } as any);

      await expect(
        PaymentGuardService.validateReleasePrerequisites(
          mockTaskId,
          mockDeveloperId,
          UserRole.DEVELOPER
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: 'NOT_TASK_EMPLOYER'
        })
      );
    });

    it('blocks release if task is not in APPROVED status (TASK_NOT_APPROVED 400)', async () => {
      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        status: TaskStatus.VERIFYING
      } as any);

      vi.spyOn(PaymentModel, 'findOne').mockResolvedValue({
        _id: 'pay-1',
        taskId: mockTaskId,
        status: PaymentStatus.AUTHORIZED
      } as any);

      await expect(
        PaymentGuardService.validateReleasePrerequisites(
          mockTaskId,
          mockEmployerId,
          UserRole.EMPLOYER
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: 'TASK_NOT_APPROVED'
        })
      );
    });

    it('blocks double-capture if payment is already CAPTURED (409 Conflict)', async () => {
      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        status: TaskStatus.APPROVED
      } as any);

      vi.spyOn(PaymentModel, 'findOne').mockResolvedValue({
        _id: 'pay-1',
        taskId: mockTaskId,
        status: PaymentStatus.CAPTURED
      } as any);

      await expect(
        PaymentGuardService.validateReleasePrerequisites(
          mockTaskId,
          mockEmployerId,
          UserRole.EMPLOYER
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: 'PAYMENT_ALREADY_CAPTURED'
        })
      );
    });

    it('blocks release if verification report commit SHA does not match PR head SHA (SHA_MISMATCH 400)', async () => {
      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        status: TaskStatus.APPROVED,
        acceptedSubmissionId: mockSubId
      } as any);

      vi.spyOn(PaymentModel, 'findOne').mockResolvedValue({
        _id: 'pay-1',
        taskId: mockTaskId,
        status: PaymentStatus.AUTHORIZED
      } as any);

      vi.spyOn(PullRequestSubmissionModel, 'findById').mockResolvedValue({
        _id: mockSubId,
        taskId: mockTaskId,
        headSha: 'commitaaaaa11111'
      } as any);

      vi.spyOn(VerificationReportModel, 'findOne').mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: 'report-1',
          commitSha: 'commitbbbbb22222',
          isOutdated: false
        })
      } as any);

      await expect(
        PaymentGuardService.validateReleasePrerequisites(
          mockTaskId,
          mockEmployerId,
          UserRole.EMPLOYER
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: 'SHA_MISMATCH'
        })
      );
    });

    it('blocks release if verification report is marked outdated (OUTDATED_REPORT 400)', async () => {
      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        status: TaskStatus.APPROVED,
        acceptedSubmissionId: mockSubId
      } as any);

      vi.spyOn(PaymentModel, 'findOne').mockResolvedValue({
        _id: 'pay-1',
        taskId: mockTaskId,
        status: PaymentStatus.AUTHORIZED
      } as any);

      vi.spyOn(PullRequestSubmissionModel, 'findById').mockResolvedValue({
        _id: mockSubId,
        taskId: mockTaskId,
        headSha: 'commitaaaaa11111'
      } as any);

      vi.spyOn(VerificationReportModel, 'findOne').mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: 'report-1',
          commitSha: 'commitaaaaa11111',
          isOutdated: true
        })
      } as any);

      await expect(
        PaymentGuardService.validateReleasePrerequisites(
          mockTaskId,
          mockEmployerId,
          UserRole.EMPLOYER
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: 'OUTDATED_REPORT'
        })
      );
    });
  });

  // =========================================================================
  // 4. ANTI-IDOR VERIFICATION REPORT ACCESS CONTROL
  // =========================================================================
  describe('4. Anti-IDOR Verification Report Access Control', () => {
    const mockTaskId = '6728eb7a9d3148479e000001';
    const mockEmployerId = '6728eb7a9d3148479e000002';
    const mockDevAliceId = '6728eb7a9d3148479e000003';
    const mockDevBobId = '6728eb7a9d3148479e000004';

    it('blocks developer Bob from accessing Alice report (FORBIDDEN_REPORT_ACCESS 403)', async () => {
      mockReq = {
        params: { taskId: mockTaskId },
        user: { userId: mockDevBobId, role: UserRole.DEVELOPER, email: 'bob@dev.com' }
      };

      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        assignedDeveloperId: { toString: () => mockDevAliceId }
      } as any);

      vi.spyOn(PullRequestSubmissionModel, 'exists').mockResolvedValue(null);

      await AIVerificationController.getTaskReport(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = vi.mocked(mockNext).mock.calls[0]![0] as unknown as AppError;
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN_REPORT_ACCESS');
    });

    it('permits developer Alice to access her own verification report', async () => {
      mockReq = {
        params: { taskId: mockTaskId },
        user: { userId: mockDevAliceId, role: UserRole.DEVELOPER, email: 'alice@dev.com' }
      };

      vi.spyOn(TaskModel, 'findById').mockResolvedValue({
        _id: mockTaskId,
        employerId: { toString: () => mockEmployerId },
        assignedDeveloperId: { toString: () => mockDevAliceId }
      } as any);

      vi.spyOn(AIVerificationService, 'getLatestReportForTask').mockResolvedValue({
        _id: 'report-1',
        overallScore: 92,
        verdict: 'PASS'
      } as any);

      await AIVerificationController.getTaskReport(mockReq as Request, mockRes as Response, mockNext);

      if (vi.mocked(mockNext).mock.calls.length > 0) {
        throw vi.mocked(mockNext).mock.calls[0]![0];
      }

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ overallScore: 92 })
        })
      );
    });

    it('permits Admin to access any report without restriction', async () => {
      mockReq = {
        params: { taskId: mockTaskId },
        user: { userId: 'admin-1', role: UserRole.ADMIN, email: 'admin@system.com' }
      };

      vi.spyOn(AIVerificationService, 'getLatestReportForTask').mockResolvedValue({
        _id: 'report-1',
        overallScore: 85
      } as any);

      await AIVerificationController.getTaskReport(mockReq as Request, mockRes as Response, mockNext);

      if (vi.mocked(mockNext).mock.calls.length > 0) {
        throw vi.mocked(mockNext).mock.calls[0]![0];
      }

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
