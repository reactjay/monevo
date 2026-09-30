import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

const DB_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * GET /health
 * Verifies service readiness, database connectivity, and runtime metrics.
 */
router.get('/', (_req: Request, res: Response): void => {
  const readyState = mongoose.connection.readyState;
  const dbStatus = DB_STATES[readyState] || 'unknown';
  const isHealthy = readyState === 1 || readyState === 2 || (readyState === 0 && process.env.NODE_ENV === 'test');

  const memory = process.memoryUsage();
  const heapUsedMB = Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100;
  const heapTotalMB = Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100;

  const payload = {
    status: isHealthy ? 'ok' : 'degraded',
    service: 'whatsapp-financial-agent',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      heapUsedMB,
      heapTotalMB,
    },
  };

  // Return 503 Service Unavailable if database is completely disconnected in production
  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(payload);
});

export { router as healthRouter };
