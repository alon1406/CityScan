import type { Request, Response } from 'express';
import type { AuthService } from '../logic/auth.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validBody } from '../middleware/validate.js';
import type {
  RegisterBoundary,
  LoginBoundary,
  DemoLoginBoundary,
} from '../boundaries/auth.boundary.js';

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.auth.register(validBody<RegisterBoundary>(req));
    res.status(201).json(result);
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.auth.login(validBody<LoginBoundary>(req)));
  });

  demoLogin = asyncHandler(async (req: Request, res: Response) => {
    const { role } = validBody<DemoLoginBoundary>(req);
    res.json(await this.auth.demoLogin(role));
  });
}
