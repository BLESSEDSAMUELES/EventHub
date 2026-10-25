import { app } from './app';
import { config } from './config';
import { db } from './db/index';
import { seedDatabase } from './db/seed';
import { worker } from './worker';
import { logger } from './lib/logger';

async function startServer() {
  try {
    // Seed default records only if database is completely empty or explicit AUTO_SEED=true
    try {
      const existingTenants = await db.getTenants();
      if (process.env.AUTO_SEED === 'true' || existingTenants.length === 0) {
        logger.info(`Database has 0 tenants or AUTO_SEED=true. Seeding default data...`);
        await seedDatabase();
      } else {
        logger.info(`Found ${existingTenants.length} existing tenant(s). Preserving production data (skipping auto-truncate).`);
      }
    } catch (seedErr) {
      logger.warn('Seed verification warning (table might be initializing):', seedErr);
    }

    // Start background reservation expiration worker (Section 8.8, 17.5)
    worker.start(5000);

    const server = app.listen(config.port, () => {
      logger.info(`EventForge API server is actively running on http://localhost:${config.port}`);
      logger.info(`Health check available at http://localhost:${config.port}/health`);
    });

    process.on('SIGTERM', () => {
      worker.stop();
      server.close();
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

startServer();
