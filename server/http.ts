import type { ErrorRequestHandler } from 'express';
import multer from 'multer';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const notFound = (message = 'Document not found') => new HttpError(404, 'not_found', message);
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : `Upload failed: ${err.message}`;
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: 'upload_error', message } });
    return;
  }
  // express.json() parse errors and payload-too-large carry a status.
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: 'bad_request', message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
};
