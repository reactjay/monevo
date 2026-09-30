import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────
app.use(cors());

// ── Request logging ───────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/webhook/whatsapp', webhookRouter);
app.use('/webhook', webhookRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use(notFoundHandler);

// ── Centralized error handler ────────────────────────────────
// Must be last and must have 4 parameters for Express to treat it as an error handler
app.use(errorHandler);

export { app };
