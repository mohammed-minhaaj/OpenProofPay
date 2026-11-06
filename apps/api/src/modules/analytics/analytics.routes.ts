import { Router } from 'express';
import { AnalyticsController } from './analytics.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// GET /api/analytics/overview
router.get('/overview', requireAuth, AnalyticsController.getOverview);

export default router;
