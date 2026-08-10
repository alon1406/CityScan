import type { Response } from 'express';
import type { UsersService } from '../logic/users.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireUser, type AuthRequest } from '../middleware/auth.middleware.js';
import { validBody } from '../middleware/validate.js';
import type { UpdateMeBoundary } from '../boundaries/user.boundary.js';

export class UserController {
  constructor(private readonly users: UsersService) {}

  getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(await this.users.getById(requireUser(req)._id));
  });

  updateMe = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = requireUser(req);
    res.json(await this.users.updateProfile(user._id, validBody<UpdateMeBoundary>(req)));
  });
}
