import type { UserEntity } from '../data/user.entity.js';
import type { RegisterBoundary, LoginBoundary, TokenBoundary } from '../boundaries/auth.boundary.js';

/**
 * Registration, login and token issuance.
 *
 * SmartCollect puts its `require*` role checks inside every service method. Here the
 * route-level role guard is `middleware/requireRole.ts` instead — Express's natural
 * place for it — and this service keeps only what is genuinely business logic:
 * credential verification, hashing and token minting.
 */
export interface AuthService {
  register(input: RegisterBoundary): Promise<TokenBoundary>;

  login(input: LoginBoundary): Promise<TokenBoundary>;

  /** Find-or-create the guest account used by the recruiter demo. */
  demoLogin(role: 'admin' | 'user'): Promise<TokenBoundary>;

  /** Verify a bearer token and load its user. Returns null when invalid or expired. */
  authenticate(token: string): Promise<UserEntity | null>;

  issueToken(user: UserEntity): string;
}
