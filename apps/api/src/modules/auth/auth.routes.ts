import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { authLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, AuthController.register);
router.post('/login', authLimiter, AuthController.login);
router.post('/refresh', authLimiter, AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);
router.get('/me', requireAuth, AuthController.getMe);

export default router;
