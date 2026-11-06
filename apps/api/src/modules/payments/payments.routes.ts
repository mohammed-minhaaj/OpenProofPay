import { Router } from 'express';
import { PaymentsController } from './payments.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@openproofpay/shared';
import { paymentLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Order creation & authorization (Employer or Admin only)
router.post(
  '/tasks/:taskId/create-order',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  paymentLimiter,
  PaymentsController.createOrder
);
router.post(
  '/orders/:orderId/authorize',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  paymentLimiter,
  PaymentsController.authorizeOrder
);

// Proof-to-Pay release gate (Employer or Admin only)
router.post(
  '/tasks/:taskId/release',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  paymentLimiter,
  PaymentsController.releasePayment
);
router.post(
  '/tasks/:taskId/retry-payout',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  paymentLimiter,
  PaymentsController.retryPayout
);

// Order cancellation (Employer or Admin only)
router.post(
  '/orders/:orderId/cancel',
  requireAuth,
  requireRole([UserRole.EMPLOYER, UserRole.ADMIN]),
  paymentLimiter,
  PaymentsController.cancelOrder
);

// Read payment details & history
router.get('/tasks/:taskId', requireAuth, PaymentsController.getTaskPayment);
router.get('/history', requireAuth, PaymentsController.getPaymentHistory);

export default router;
