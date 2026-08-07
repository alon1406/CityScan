import { AppException } from './app.exception.js';

/** 503 — a dependency we need (the AI service) is down or not configured. */
export class ServiceUnavailableException extends AppException {
  constructor(message = 'Service unavailable') {
    super(503, message);
  }
}
