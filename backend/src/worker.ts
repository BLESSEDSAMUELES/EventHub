import { db } from './db';
import { reservationService } from './services/reservationService';
import { logger } from './lib/logger';

export class ExpirationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  start(intervalMs: number = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting Reservation Expiration Worker...');

    this.timer = setInterval(async () => {
      try {
        await this.sweepExpiredReservations();
      } catch (err) {
        logger.error('Worker encountered an error during sweep', err);
      }
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('Reservation Expiration Worker stopped.');
  }

  async sweepExpiredReservations(): Promise<number> {
    const expiredList = await db.getExpiredActiveReservations();
    let releasedCount = 0;

    for (const res of expiredList) {
      const success = await reservationService.releaseExpiredReservation(res.id);
      if (success) {
        releasedCount++;
      }
    }

    if (releasedCount > 0) {
      logger.info(`Worker swept and released ${releasedCount} expired reservation(s).`);
    }

    return releasedCount;
  }
}

export const worker = new ExpirationWorker();

if (require.main === module) {
  const standaloneWorker = new ExpirationWorker();
  standaloneWorker.start(3000);
  console.log('EventForge Expiry Worker is running in standalone mode.');

  process.on('SIGINT', () => {
    standaloneWorker.stop();
    process.exit(0);
  });
}
