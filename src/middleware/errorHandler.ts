import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[Error] ${statusCode}: ${message}`);
    if (statusCode === 500) {
      console.error(err.stack);
    }
  }

  res.status(statusCode).json({
    status: 'error',
    message,
  });
}
