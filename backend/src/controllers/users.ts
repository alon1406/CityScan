import type { Response } from 'express';
import User from '../models/User.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

// ========== GET ME ==========
/**
 * Return the currently logged-in user.
 * Requires authMiddleware to run first so req.user is set.
 * We send back the user document without the password field.
 */
export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    // req.user was set by authMiddleware after verifying the JWT and loading the user from DB
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    // Convert Mongoose document to plain object and remove password (in case it was selected)
    const userObj = user.toObject();
    delete (userObj as Record<string, unknown>).password;
    res.json(userObj);
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ message: 'Failed to get user' });
  }
}

// ========== UPDATE ME ==========
/**
 * Update the currently logged-in user's profile.
 * Body: { name?, email? } — only these fields are allowed to be updated.
 * Requires authMiddleware so req.user is set.
 */
export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    // Only allow updating name and email (not password or role here)
    const { name, email } = req.body as { name?: string; email?: string };

    if (name !== undefined) {
      const t = name.trim();
      if (t) user.name = t;
    }
    if (email !== undefined) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        res.status(400).json({ message: 'Email cannot be empty' });
        return;
      }
      const existing = await User.findOne({ email: trimmed, _id: { $ne: user._id } });
      if (existing) {
        res.status(409).json({ message: 'Email already in use' });
        return;
      }
      user.email = trimmed;
    }

    await user.save();

    const userObj = user.toObject();
    delete (userObj as Record<string, unknown>).password;
    res.json(userObj);
  } catch (err) {
    console.error('UpdateMe error:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
}
