import { AppException } from './app.exception.js';

/** 401 — no credentials, or credentials that don't check out. */
export class UnauthorizedException extends AppException {
  constructor(message = 'Not authenticated') {
    super(401, message);
  }
}
