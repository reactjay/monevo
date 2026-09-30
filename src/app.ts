import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import { healthRouter } from './routes/health';
import { webhookRouter } from './routes/webhook';
import { adminRouter } from './routes/admin';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── Security headers ──────────────────────────────────────────
// Configure helmet with relaxed CSP to permit the admin UI assets and styles
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ─────────────────────────────────────────────────────
app.use(cors());

// ── Request logging ───────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static assets for Admin Dashboard & Demo Studio ──────────
const publicAdminPath = path.join(__dirname, '../public/admin');
const demoStudioPath = path.join(__dirname, '../demo-studio');
app.use('/admin', express.static(publicAdminPath));
app.use('/demo', express.static(demoStudioPath));

// ── Routes ────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/webhook/whatsapp', webhookRouter);
app.use('/webhook', webhookRouter);
app.use('/api/admin', adminRouter);

// ── 404 handler ───────────────────────────────────────────────
app.use(notFoundHandler);

// ── Centralized error handler ────────────────────────────────
// Must be last and must have 4 parameters for Express to treat it as an error handler
app.use(errorHandler);

export { app };

