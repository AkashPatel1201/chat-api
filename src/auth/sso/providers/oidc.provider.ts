import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SsoProvider } from '@prisma/client';
import {
  ISsoProvider,
  SsoTokens,
  SsoUserProfile,
} from './sso-provider.interface.js';

@Injectable()
export class GenericOidcSsoProvider implements ISsoProvider {
  private readonly logger = new Logger(GenericOidcSsoProvider.name);
  readonly id = 'oidc';
  readonly name = process.env.OIDC_NAME || 'Enterprise OIDC';
  readonly icon = 'key';

  get isEnabled(): boolean {
    return Boolean(
      process.env.OIDC_ISSUER_URL &&
        process.env.OIDC_CLIENT_ID &&
        process.env.OIDC_CLIENT_ID !== 'your-oidc-client-id',
    );
  }

  private get issuerUrl(): string {
    return (process.env.OIDC_ISSUER_URL || '').replace(/\/$/, '');
  }

  private get clientId(): string {
    return process.env.OIDC_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.OIDC_CLIENT_SECRET || '';
  }

  private get defaultCallbackUrl(): string {
    return (
      process.env.OIDC_CALLBACK_URL ||
      'http://localhost:3000/auth/sso/oidc/callback'
    );
  }

  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const callbackUrl = redirectUri || this.defaultCallbackUrl;
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      scope: 'openid profile email',
      state,
    });
    return `${this.issuerUrl}/v1/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }> {
    const callbackUrl = redirectUri || this.defaultCallbackUrl;

    const tokenResponse = await fetch(`${this.issuerUrl}/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`OIDC token exchange failed: ${errorText}`);
      throw new BadRequestException('Failed to exchange OIDC authorization code');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
    };

    const tokens: SsoTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      idToken: tokenData.id_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    };

    const userProfile = await this.fetchUserProfile(tokenData.access_token);
    return { tokens, profile: userProfile };
  }

  async verifyToken(accessToken: string): Promise<SsoUserProfile> {
    return this.fetchUserProfile(accessToken);
  }

  private async fetchUserProfile(accessToken: string): Promise<SsoUserProfile> {
    const res = await fetch(`${this.issuerUrl}/v1/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new BadRequestException('Failed to fetch OIDC userinfo');
    }

    const data = (await res.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    return {
      provider: SsoProvider.CUSTOM_OIDC,
      providerAccountId: data.sub,
      email: data.email,
      name: data.name,
      avatarUrl: data.picture,
      emailVerified: Boolean(data.email_verified),
      rawProfile: data as unknown as Record<string, unknown>,
    };
  }
}
