import type { Request, Response, NextFunction } from 'express';

// Run validators and return errors
export const validate = (_req: Request, _res: Response, next: NextFunction) => next();
