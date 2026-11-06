import { Router } from 'express';
import { WebhookController } from './webhooks.controller.js';
import { webhookLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.post('/github', webhookLimiter, WebhookController.handleGitHub);
router.post('/paypal', webhookLimiter, WebhookController.handlePayPal);

export default router;
