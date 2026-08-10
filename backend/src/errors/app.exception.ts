/**
 * Base class for every exception that carries its own HTTP status.
 *
 * Mirrors SmartCollect's `errors` package, where each exception is annotated with
 * `@ResponseStatus(code = HttpStatus.X)`. Here the status travels on the instance
 * instead of an annotation, and `middleware/errorHandler.ts` is what turns it into
 * a response — the Express equivalent of Spring's `@ControllerAdvice`.
 *
 * Throw these from anywhere in `logic/`; never build an error response by hand.
 */
export abstract class AppException extends Error {
  /** HTTP status this exception maps to. */
  readonly status: number;

  /** Optional machine-readable code the client can branch on (e.g. DUPLICATE_HAZARD). */
  readonly code?: string | undefined;

  /** Extra fields merged into the response body — used for validation field lists. */
  readonly details?: unknown;

  /**
   * True for errors we threw deliberately. The handler logs these quietly;
   * anything else is an unexpected bug and gets a full stack trace.
   */
  readonly isOperational = true;

  protected constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}
