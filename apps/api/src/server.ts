import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { JobWorkerService } from './modules/webhooks/JobWorkerService.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();

    // Start background durable job worker (with restart stuck-job recovery)
    JobWorkerService.startWorker(5000);

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      console.log(`[SERVER] OpenProofPay API server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`[SERVER] Received ${signal}. Gracefully shutting down...`);
      JobWorkerService.stopWorker();
      server.close(async () => {
        await disconnectDatabase();
        console.log('[SERVER] Server closed and database disconnected cleanly');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[BOOTSTRAP ERROR] Failed to start server:', err);
    process.exit(1);
  }
}

// Only start when executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
