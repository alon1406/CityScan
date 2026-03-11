import jwt, { type SignOptions } from 'jsonwebtoken';

const rawSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!rawSecret || rawSecret.trim() === '')) {
  throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = rawSecret?.trim() || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

/** Payload we store inside the JWT (e.g. userId for looking up the user later) */
export interface JwtPayload {
  userId: string;
}

/**
 * Create a new JWT for the given user id.
 * Used after login/register to send a token back to the client.
 */
export function sign(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as SignOptions);
}

/**
 * Verify a JWT and return the payload (e.g. { userId }).
 * Throws if the token is invalid or expired.
 */
export function verify(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
