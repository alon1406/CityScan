import { AppException } from './app.exception.js';

/** 404 — the resource does not exist. */
export class NotFoundException extends AppException {
  constructor(message = 'Not found') {
    super(404, message);
  }
}
