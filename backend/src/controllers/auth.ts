import type { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { sign } from '../services/jwt.js';

const registerValidations = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').optional().trim().isLength({ max: 200 }).withMessage('Name too long'),
];

const loginValidations = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ========== REGISTER ==========
/**
 * Register a new user.
 * Body: { email, password, name? }
 * - Hash password, save user, return JWT + user (without password).
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    await Promise.all(registerValidations.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      return;
    }

    const { email, password, name } = req.body as { email: string; password: string; name?: string };

    // Check if a user with this email already exists (emails must be unique)
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      res.status(409).json({ message: 'Email already registered' });
      return;
    }

    // Hash the password so we never store it in plain text (bcrypt, 10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Build create payload — only include name when present (exactOptionalPropertyTypes)
    const createData: { email: string; password: string; name?: string } = {
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    };
    if (name?.trim()) {
      createData.name = name.trim();
    }

    // Create and save the new user in MongoDB
    const user = await User.create(createData);

    // Build a JWT containing the user id so the client can send it back on later requests
    const token = sign({ userId: user._id.toString() });

    // Send back the token and user info (exclude password: toJSON or manual pick)
    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    res.status(201).json({ token, user: userObj });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Registration failed' });
  }
}

// ========== LOGIN ==========
/**
 * Log in an existing user.
 * Body: { email, password }
 * - Find user, compare password with hash, return JWT + user (without password).
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    await Promise.all(loginValidations.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      return;
    }

    const { email, password } = req.body as { email: string; password: string };

    // .select('+password') is needed because the User schema has password with select: false
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // Compare the plain password from the request with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = sign({ userId: user._id.toString() });

    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    res.json({ token, user: userObj });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
}

// ========== DEMO LOGIN ==========
const DEMO_ADMIN_EMAIL = 'guest_admin@cityscan.com';
const DEMO_USER_EMAIL = 'guest_user@cityscan.com';
const DEMO_PASSWORD = 'demo123';

/**
 * POST /auth/demo or /auth/demo-login — sign in as demo admin or user for recruiters.
 * Body: { role: 'admin' | 'user' }
 * Finds or creates guest_user@cityscan.com (user) or guest_admin@cityscan.com (admin), returns JWT + user.
 */
export async function demoLogin(req: Request, res: Response): Promise<void> {
  try {
    const { role } = req.body as { role?: string };
    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ message: 'Body must include role: "admin" or "user"' });
      return;
    }
    const email = role === 'admin' ? DEMO_ADMIN_EMAIL : DEMO_USER_EMAIL;
    let user = await User.findOne({ email }).select('+password');
    if (!user) {
      const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
      user = await User.create({
        email,
        password: hashedPassword,
        name: role === 'admin' ? 'Guest Admin' : 'Guest User',
        role: role === 'admin' ? 'admin' : 'user',
      });
    } else {
      // Ensure demo password works (in case user was created with different password)
      const isMatch = await bcrypt.compare(DEMO_PASSWORD, user.password);
      if (!isMatch) {
        const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
        user.password = hashedPassword;
        await user.save();
      }
    }
    const token = sign({ userId: user._id.toString() });
    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    res.json({ token, user: userObj });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ message: 'Demo login failed' });
  }
}
