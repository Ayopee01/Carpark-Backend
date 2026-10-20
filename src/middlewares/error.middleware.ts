// Import Library
import type { NextFunction, Request, Response } from 'express';
// Import Utils
import { ApiError } from '../utils/api-error';

/* -------------------------------------- Functions -------------------------------------- */

// Function middleware ตอบ 404 เมื่อไม่มี route ที่ตรงกับ request
function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: 'Route not found', code: 'ROUTE_NOT_FOUND' });
}

// Function middleware แปลง error เป็น JSON { message, code, ...details } และซ่อนรายละเอียด 5xx ใน production
function errorHandler(err: Error & { statusCode?: number; status?: number }, _req: Request, res: Response, _next: NextFunction): Response {
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    console.error(err);
  } else {
    console.warn(`${statusCode} ${err.name || 'Error'}: ${err.message}`);
  }

  const hideMessage = process.env.NODE_ENV === 'production' && statusCode >= 500;
  const message = hideMessage ? 'Internal server error' : err.message || 'Internal server error';
  if (err instanceof ApiError) {
    return res.status(statusCode).json({ ...err.details, message, code: err.code });
  }

  const code = statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  return res.status(statusCode).json({ message, code });
}

export { errorHandler, notFoundHandler };
