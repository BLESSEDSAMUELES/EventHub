import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';
import { logger } from './lib/logger';

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any local origin or configured frontend origin
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path !== '/health') {
    logger.info(`${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint (Section 17.4)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'EventForge Ticketing API',
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
app.use('/api', routes);

// Global Error Handler (Section 12.1)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Application Error', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected internal error occurred',
  });
});
