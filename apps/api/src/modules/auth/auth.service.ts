import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { RegisterUserInput, LoginUserInput, UserRole } from '@openproofpay/shared';
import { UserModel, IUserDocument } from '../../models/User.js';
import { AuditLogModel } from '../../models/AuditLog.js';
import { AppError } from '../../errors/AppError.js';
import { env } from '../../config/env.js';
import { AuditAction } from '@openproofpay/shared';

const BCRYPT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  role: UserRole;
  email: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    githubConnected: boolean;
    githubUsername?: string;
    paypalEmail?: string;
    paypalMerchantId?: string;
    createdAt: Date;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export class AuthService {
  /**
   * Register a new user with bcrypt-hashed password (12 rounds)
   */
  static async register(input: RegisterUserInput, ipAddress?: string): Promise<AuthResult> {
    const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      throw AppError.conflict('An account with this email address already exists');
    }

    if (input.githubUsername) {
      const existingGh = await UserModel.findOne({ githubUsername: input.githubUsername });
      if (existingGh) {
        throw AppError.conflict('GitHub username is already linked to another account');
      }
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await UserModel.create({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: input.role,
      githubConnected: !!input.githubUsername,
      githubUsername: input.githubUsername,
      paypalEmail: input.paypalReceiverEmail
    });

    const tokens = await this.generateTokens(user);

    // Audit log
    await AuditLogModel.create({
      actorId: user._id,
      actorRole: user.role,
      action: AuditAction.USER_REGISTERED,
      resourceType: 'User',
      resourceId: user._id.toString(),
      ipAddress
    });

    return {
      user: this.formatUser(user),
      tokens
    };
  }

  /**
   * Authenticate user with password comparison
   */
  static async login(input: LoginUserInput, ipAddress?: string): Promise<AuthResult> {
    const user = await UserModel.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.isActive) {
      throw AppError.forbidden('This account has been deactivated');
    }

    const tokens = await this.generateTokens(user);

    await AuditLogModel.create({
      actorId: user._id,
      actorRole: user.role,
      action: AuditAction.USER_LOGIN,
      resourceType: 'User',
      resourceId: user._id.toString(),
      ipAddress
    });

    return {
      user: this.formatUser(user),
      tokens
    };
  }

  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Rotate and verify refresh token
   */
  static async refreshToken(oldRefreshToken: string): Promise<AuthResult['tokens']> {
    let payload: TokenPayload;
    try {
      payload = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET) as TokenPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const user = await UserModel.findById(payload.userId).select('+refreshTokenHash');
    if (!user || !user.refreshTokenHash) {
      throw AppError.unauthorized('Refresh token revoked or invalid session');
    }

    const tokenPrehash = this.hashToken(oldRefreshToken);
    const isMatch = await bcrypt.compare(tokenPrehash, user.refreshTokenHash);

    if (!isMatch) {
      // Token reuse detected - immediately revoke active session for protection
      await UserModel.findByIdAndUpdate(user._id, { $unset: { refreshTokenHash: 1 } });
      throw AppError.unauthorized('Refresh token reuse detected. Please log in again.');
    }

    return this.generateTokens(user);
  }

  /**
   * Revoke active refresh token on logout
   */
  static async logout(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
  }

  /**
   * Switch user role and issue new access & refresh tokens
   */
  static async switchRole(userId: string, targetRole: UserRole): Promise<AuthResult> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    user.role = targetRole;
    await user.save();
    const tokens = await this.generateTokens(user);
    return {
      user: this.formatUser(user),
      tokens
    };
  }

  /**
   * Return authenticated user profile
   */
  static async getMe(userId: string): Promise<AuthResult['user']> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    return this.formatUser(user);
  }

  private static async generateTokens(user: IUserDocument): Promise<AuthResult['tokens']> {
    const payload: TokenPayload = {
      userId: user._id.toString(),
      role: user.role,
      email: user.email
    };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRATION as jwt.SignOptions['expiresIn']
    });

    const refreshToken = jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      env.JWT_REFRESH_SECRET,
      {
        expiresIn: env.JWT_REFRESH_EXPIRATION as jwt.SignOptions['expiresIn']
      }
    );

    // Hash refresh token (via SHA256 pre-hash to avoid bcrypt 72-byte truncation)
    const tokenPrehash = this.hashToken(refreshToken);
    const refreshTokenHash = await bcrypt.hash(tokenPrehash, 10);
    await UserModel.findByIdAndUpdate(user._id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutes in seconds
    };
  }

  private static formatUser(user: IUserDocument): AuthResult['user'] {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      githubConnected: user.githubConnected,
      githubUsername: user.githubUsername,
      paypalEmail: user.paypalEmail,
      paypalMerchantId: user.paypalMerchantId,
      createdAt: user.createdAt
    };
  }
}
