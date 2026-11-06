import { Request, Response, NextFunction } from 'express';
import { WebhookService } from './webhooks.service.js';
import { verifyGitHubWebhookSignature } from '../../utils/crypto.js';
import { PayPalClient } from '../payments/PayPalClient.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export class WebhookController {
  static async handleGitHub(req: RequestWithRawBody, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;
      const event = req.headers['x-github-event'] as string | undefined;

      if (!deliveryId || !event) {
        throw AppError.badRequest('Missing required GitHub webhook headers');
      }

      // Cryptographic timing-safe HMAC signature verification (Rule 4 & Phase 4 Section 4)
      const secret = env.GITHUB_WEBHOOK_SECRET;
      if (secret) {
        const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');
        const isValid = verifyGitHubWebhookSignature(rawBody, signature, secret);

        if (!isValid) {
          throw AppError.unauthorized('Invalid GitHub webhook signature HMAC-SHA256');
        }
      }

      // Durable queueing: Persist job in database before acknowledging webhook to GitHub
      const result = await WebhookService.enqueueGitHubWebhook(deliveryId, event, req.body, req.ip);

      res.status(202).json({
        success: true,
        message: 'GitHub webhook received and queued for durable processing',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async handlePayPal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authAlgo = req.headers['paypal-auth-algo'] as string | undefined;
      const certUrl = req.headers['paypal-cert-url'] as string | undefined;
      const transmissionId = req.headers['paypal-transmission-id'] as string | undefined;
      const transmissionSig = req.headers['paypal-transmission-sig'] as string | undefined;
      const transmissionTime = req.headers['paypal-transmission-time'] as string | undefined;

      if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
        throw AppError.badRequest('Missing required PayPal webhook cryptographic headers');
      }

      // Cryptographically verify PayPal signature via API (or bypass in mock test mode)
      const webhookId = env.PAYPAL_WEBHOOK_ID || 'dummy_webhook_id';
      const isValid = await PayPalClient.verifyWebhookSignature({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: req.body
      });

      if (!isValid) {
        throw AppError.unauthorized('Invalid PayPal webhook signature verification');
      }

      const result = await WebhookService.handlePayPalEvent(req.body, req.ip);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}
