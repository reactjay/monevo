import { Request } from 'express';

export interface ApiResponse<T = unknown> {
  status: 'ok' | 'error';
  message?: string;
  data?: T;
}

export interface AppError extends Error {
  statusCode?: number;
}

export interface AuthenticatedRequest extends Request {
  whatsappId?: string;
}
