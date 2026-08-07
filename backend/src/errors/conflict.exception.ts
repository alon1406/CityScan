import { AppException } from './app.exception.js';

/**
 * 409 — the request clashes with existing state.
 *
 * Carries `code` because the frontend branches on it: `ReportSidebar` checks for
 * `DUPLICATE_HAZARD` and shows the "already reported here" flow instead of an error.
 */
export class ConflictException extends AppException {
  constructor(message: string, code?: string, details?: unknown) {
    super(409, message, code, details);
  }
}
