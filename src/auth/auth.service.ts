import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SsoProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SsoTokens,
  SsoUserProfile,
} from './sso/providers/sso-provider.interface.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: string;
    status?: string;
    statusMessage?: string | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  async loginOrRegisterSso(
    profile: SsoUserProfile,
    tokens: SsoTokens,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    let user;

    if (existingAccount) {
      user = existingAccount.user;

      // Update tokens in linked account
      await this.prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? existingAccount.refreshToken,
          idToken: tokens.idToken ?? existingAccount.idToken,
          tokenType: tokens.tokenType ?? existingAccount.tokenType,
          scope: tokens.scope ?? existingAccount.scope,
          expiresAt: tokens.expiresIn
            ? BigInt(Math.floor(Date.now() / 1000) + tokens.expiresIn)
            : existingAccount.expiresAt,
          profileData: profile.rawProfile as any,
        },
      });

      // Update profile info if changed
      if (
        (profile.name && !user.name) ||
        (profile.avatarUrl && !user.avatarUrl)
      ) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            name: user.name || profile.name,
            avatarUrl: user.avatarUrl || profile.avatarUrl,
          },
        });
      }
    } else {
      // Check if user with this email exists
      let existingUser = await this.prisma.user.findUnique({
        where: { email: profile.email.toLowerCase() },
      });

      if (existingUser) {
        // Link new SSO provider to existing user
        await this.prisma.account.create({
          data: {
            userId: existingUser.id,
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            idToken: tokens.idToken,
            tokenType: tokens.tokenType,
            scope: tokens.scope,
            expiresAt: tokens.expiresIn
              ? BigInt(Math.floor(Date.now() / 1000) + tokens.expiresIn)
              : null,
            profileData: profile.rawProfile as any,
          },
        });

        user = existingUser;
      } else {
        // Create brand new user and link SSO account
        user = await this.prisma.user.create({
          data: {
            email: profile.email.toLowerCase(),
            name: profile.name,
            avatarUrl: profile.avatarUrl,
            emailVerified: profile.emailVerified ?? true,
            accounts: {
              create: {
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                idToken: tokens.idToken,
                tokenType: tokens.tokenType,
                scope: tokens.scope,
                expiresAt: tokens.expiresIn
                  ? BigInt(Math.floor(Date.now() / 1000) + tokens.expiresIn)
                  : null,
                profileData: profile.rawProfile as any,
              },
            },
          },
        });
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const sessionTokens = await this.createSession(user.id, meta);

    return {
      ...sessionTokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        statusMessage: user.statusMessage,
      },
    };
  }

  async linkSsoAccount(
    userId: string,
    profile: SsoUserProfile,
    tokens: SsoTokens,
  ) {
    const existing = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
    });

    if (existing) {
      if (existing.userId === userId) {
        throw new BadRequestException('This account is already linked to your profile');
      }
      throw new BadRequestException(
        'This SSO account is already linked to another user',
      );
    }

    await this.prisma.account.create({
      data: {
        userId,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        expiresAt: tokens.expiresIn
          ? BigInt(Math.floor(Date.now() / 1000) + tokens.expiresIn)
          : null,
        profileData: profile.rawProfile as any,
      },
    });

    return this.getUserProfile(userId);
  }

  async unlinkSsoAccount(userId: string, providerName: string) {
    const providerEnum = providerName.toUpperCase() as SsoProvider;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const hasPassword = Boolean(user.passwordHash);
    const hasMultipleAccounts = user.accounts.length > 1;

    if (!hasPassword && !hasMultipleAccounts) {
      throw new BadRequestException(
        'Cannot unlink the only login method. Set a password or link another SSO provider first.',
      );
    }

    const accountToDelete = user.accounts.find(
      (acc) => acc.provider === providerEnum,
    );

    if (!accountToDelete) {
      throw new BadRequestException(
        `SSO provider ${providerName} is not linked to your account`,
      );
    }

    await this.prisma.account.delete({
      where: { id: accountToDelete.id },
    });

    return {
      success: true,
      message: `Unlinked ${providerName} successfully`,
    };
  }

  async register(
    dto: { email: string; password: string; name?: string },
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        passwordHash,
        emailVerified: false,
      },
    });

    const sessionTokens = await this.createSession(user.id, meta);

    return {
      ...sessionTokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        statusMessage: user.statusMessage,
      },
    };
  }

  async login(
    dto: { email: string; password: string },
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionTokens = await this.createSession(user.id, meta);

    return {
      ...sessionTokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        statusMessage: user.statusMessage,
      },
    };
  }

  async createSession(
    userId: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const rawRefreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const refreshExpiresInDays = 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpiresInDays);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: meta?.userAgent,
        ipAddress: meta?.ipAddress,
        expiresAt,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret:
        process.env.JWT_SECRET ||
        'chat-api-jwt-super-secret-key-change-in-production-2026',
      expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  async refreshSession(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // Revoke old session (Rotation)
    await this.prisma.session.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Create new session
    return this.createSession(session.userId, meta);
  }

  async revokeSession(rawRefreshToken: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { tokenHash },
      data: { isRevoked: true },
    });
    return { success: true };
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        status: true,
        statusMessage: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        accounts: {
          select: {
            id: true,
            provider: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
