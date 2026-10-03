import { SsoProvider } from '@prisma/client';

export interface SsoUserProfile {
  provider: SsoProvider;
  providerAccountId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  rawProfile?: Record<string, unknown>;
}

export interface SsoTokens {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  tokenType?: string;
  scope?: string;
  expiresIn?: number;
}

export interface SsoProviderPublicInfo {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  callbackUrl?: string;
  authorizationUrl?: string;
}

export interface ISsoProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly isEnabled: boolean;
  readonly clientId?: string;
  readonly callbackUrl: string;

  getAuthorizationUrl(state: string, redirectUri?: string): string;
  exchangeCode(
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }>;
  verifyToken?(token: string): Promise<SsoUserProfile>;
}
