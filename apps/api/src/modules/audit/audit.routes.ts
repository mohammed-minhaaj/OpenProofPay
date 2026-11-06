import { Router } from 'express';
import { AuditController } from './audit.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// GET /api/audit-logs
router.get('/', requireAuth, AuditController.list);

export default router;
