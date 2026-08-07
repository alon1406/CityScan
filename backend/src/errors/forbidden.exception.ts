import { AppException } from './app.exception.js';

/** 403 — authenticated, but not allowed to do this. */
export class ForbiddenException extends AppException {
  constructor(message = 'Access denied') {
    super(403, message);
  }
}
