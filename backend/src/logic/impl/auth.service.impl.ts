import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthService } from '../auth.service.js';
import type { UserEntity } from '../../data/user.entity.js';
import type { UserRepository } from '../../repositories/user.repository.js';
import type { UserConverter } from '../../converters/user.converter.js';
import type {
  RegisterBoundary,
  LoginBoundary,
  TokenBoundary,
} from '../../boundaries/auth.boundary.js';
import { config } from '../../config/env.js';
import { ConflictException, UnauthorizedException } from '../../errors/index.js';

const BCRYPT_ROUNDS = 10;

interface JwtPayload {
  userId: string;
}

/**
 * Credentials, hashing and tokens.
 *
 * The secret is read from `config` — which is only ever evaluated after `loadEnv.ts`
 * has run — instead of at module scope as the old `services/jwt.ts` did. That old read
 * happened before dotenv loaded, so `JWT_SECRET` from `.env` was never seen and every
 * token in development was signed with the hardcoded fallback string.
 */
export class AuthServiceImpl implements AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly userConverter: UserConverter
  ) {}

  async register(input: RegisterBoundary): Promise<TokenBoundary> {
    if (await this.users.existsByEmail(input.email)) {
      throw new ConflictException('Email already registered');
    }

    const created = await this.users.create({
      email: input.email,
      password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      ...(input.name && { name: input.name }),
    });

    return this.toTokenBoundary(created);
  }

  async login(input: LoginBoundary): Promise<TokenBoundary> {
    const user = await this.users.findByEmailWithPassword(input.email);

    // Same message and status whether the email is unknown or the password is wrong —
    // otherwise the endpoint becomes an account-enumeration oracle.
    if (!user || !(await bcrypt.compare(input.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.toTokenBoundary(user);
  }

  async demoLogin(role: 'admin' | 'user'): Promise<TokenBoundary> {
    const email = role === 'admin' ? config.demo.adminEmail : config.demo.userEmail;

    let user = await this.users.findByEmailWithPassword(email);

    if (!user) {
      user = await this.users.create({
        email,
        password: await bcrypt.hash(config.demo.password, BCRYPT_ROUNDS),
        name: role === 'admin' ? 'Guest Admin' : 'Guest User',
        role,
      });
    } else {
      // Self-heal: an account left over from an older seed may have a different
      // password or role. Re-align it so the demo button always works.
      const matches = await bcrypt.compare(config.demo.password, user.password);
      if (!matches) user.password = await bcrypt.hash(config.demo.password, BCRYPT_ROUNDS);
      if (user.role !== role) user.role = role;
      if (!matches || user.isModified()) await this.users.save(user);
    }

    return this.toTokenBoundary(user);
  }

  async authenticate(token: string): Promise<UserEntity | null> {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
      return await this.users.findById(payload.userId);
    } catch {
      // Malformed, tampered or expired — all equally "not authenticated".
      return null;
    }
  }

  issueToken(user: UserEntity): string {
    return jwt.sign({ userId: user._id.toString() }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as SignOptions);
  }

  private toTokenBoundary(user: UserEntity): TokenBoundary {
    return {
      token: this.issueToken(user),
      // The converter builds the response field by field, so the password hash has
      // nowhere to go even though this document was loaded with `.select('+password')`.
      user: this.userConverter.toBoundary(user),
    };
  }
}
