import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL === 'true',
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'eventforge-jwt-secret-dev-2026',
  mockWebhookSecret: process.env.MOCK_PAYMENT_WEBHOOK_SECRET || 'eventforge-mock-webhook-secret-xyz',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  holdMinutes: parseInt(process.env.HOLD_MINUTES || '10', 10),
};
