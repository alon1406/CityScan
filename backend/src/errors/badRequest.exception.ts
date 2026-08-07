import { AppException } from './app.exception.js';

/** 400 — the request itself is malformed: bad field, wrong type, failed validation. */
export class BadRequestException extends AppException {
  constructor(message: string, details?: unknown) {
    super(400, message, undefined, details);
  }
}
