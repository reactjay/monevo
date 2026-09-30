import { app } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import {
  startWeeklyReportScheduler,
  stopWeeklyReportScheduler,
} from './jobs/weeklyReportJob';

async function start(): Promise<void> {
  await connectDatabase();

  if (env.NODE_ENV !== 'test') {
    startWeeklyReportScheduler();
  }

  const port = Number(env.PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${port} [${env.NODE_ENV}]`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received — shutting down gracefully`);
    stopWeeklyReportScheduler();
    server.close(async () => {
      await disconnectDatabase();
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
