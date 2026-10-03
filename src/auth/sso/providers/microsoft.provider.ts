import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SsoProvider } from '@prisma/client';
import {
  ISsoProvider,
  SsoTokens,
  SsoUserProfile,
} from './sso-provider.interface.js';

@Injectable()
export class MicrosoftSsoProvider implements ISsoProvider {
  private readonly logger = new Logger(MicrosoftSsoProvider.name);
  readonly id = 'microsoft';
  readonly name = 'Microsoft';
  readonly icon = 'microsoft';

  get isEnabled(): boolean {
    return Boolean(
      process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_ID !== 'your-microsoft-client-id',
    );
  }

  get clientId(): string {
    return process.env.MICROSOFT_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.MICROSOFT_CLIENT_SECRET || '';
  }

  private get tenantId(): string {
    return process.env.MICROSOFT_TENANT_ID || 'common';
  }

  get callbackUrl(): string {
    return (
      process.env.MICROSOFT_CALLBACK_URL ||
      'http://localhost:3000/auth/sso/microsoft/callback'
    );
  }

  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const callbackUrl = redirectUri || this.callbackUrl;
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      response_mode: 'query',
      scope: 'openid profile email User.Read',
      state,
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }> {
    const callbackUrl = redirectUri || this.callbackUrl;

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
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
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`Microsoft token exchange failed: ${errorText}`);
      throw new BadRequestException(
        'Failed to exchange Microsoft authorization code',
      );
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
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new BadRequestException('Failed to fetch Microsoft profile');
    }

    const data = (await res.json()) as {
      id: string;
      displayName?: string;
      mail?: string;
      userPrincipalName?: string;
    };

    const email = data.mail || data.userPrincipalName;
    if (!email) {
      throw new BadRequestException('Microsoft account has no associated email');
    }

    return {
      provider: SsoProvider.MICROSOFT,
      providerAccountId: data.id,
      email,
      name: data.displayName,
      emailVerified: true,
      rawProfile: data as unknown as Record<string, unknown>,
    };
  }
}
