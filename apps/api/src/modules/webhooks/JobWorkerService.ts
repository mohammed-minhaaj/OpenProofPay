import { WebhookJobModel } from '../../models/WebhookJob.js';
import { WebhookService } from './webhooks.service.js';
import { WebhookJobStatus } from '@openproofpay/shared';

export class JobWorkerService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Recover stuck jobs on worker/server startup
   * If a previous process crashed or restarted while a job was PROCESSING,
   * reset it to QUEUED with backoff so it can be retried cleanly.
   */
  static async recoverStuckJobs(): Promise<number> {
    try {
      // Find jobs in PROCESSING state (interrupted by server restart)
      const stuckJobs = await WebhookJobModel.find({
        status: WebhookJobStatus.PROCESSING,
        retries: { $lt: 3 }
      });

      let recovered = 0;
      for (const job of stuckJobs) {
        job.status = WebhookJobStatus.QUEUED;
        job.retries += 1;
        job.backoffMs = Math.min(60000, 1000 * Math.pow(2, job.retries));
        job.lastError = 'Job recovered after server restart / crash';
        await job.save();
        recovered++;
        console.info(`[JobWorker] Recovered stuck job ${job.deliveryId} (retry ${job.retries})`);
      }

      return recovered;
    } catch (err) {
      console.error('[JobWorker] Error recovering stuck jobs:', err);
      return 0;
    }
  }

  /**
   * Process all queued jobs ready for execution
   */
  static async processQueuedJobs(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;

    let processedCount = 0;
    try {
      const pendingJobs = await WebhookJobModel.find({
        status: WebhookJobStatus.QUEUED,
        retries: { $lt: 3 }
      })
        .sort({ createdAt: 1 })
        .limit(10);

      for (const job of pendingJobs) {
        try {
          await WebhookService.processJob(job._id.toString());
          processedCount++;
        } catch (jobErr: any) {
          console.error(`[JobWorker] Job ${job.deliveryId} processing error:`, jobErr?.message);
        }
      }
    } catch (err) {
      console.error('[JobWorker] Error in job queue processor:', err);
    } finally {
      this.isRunning = false;
    }

    return processedCount;
  }

  /**
   * Start background worker loop
   */
  static startWorker(intervalMs = 5000): void {
    if (this.workerInterval) return;

    // Run immediate startup recovery
    this.recoverStuckJobs().catch(() => {});

    this.workerInterval = setInterval(() => {
      this.processQueuedJobs().catch(() => {});
    }, intervalMs);

    console.info(`[JobWorker] Durable background job worker active (polling every ${intervalMs}ms)`);
  }

  /**
   * Stop background worker loop cleanly
   */
  static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.info('[JobWorker] Background job worker stopped');
    }
  }
}
