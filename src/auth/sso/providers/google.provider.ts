import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SsoProvider } from '@prisma/client';
import {
  ISsoProvider,
  SsoTokens,
  SsoUserProfile,
} from './sso-provider.interface.js';

@Injectable()
export class GoogleSsoProvider implements ISsoProvider {
  private readonly logger = new Logger(GoogleSsoProvider.name);
  readonly id = 'google';
  readonly name = 'Google';
  readonly icon = 'google';

  get isEnabled(): boolean {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_ID !==
          'your-google-client-id.apps.googleusercontent.com',
    );
  }

  get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET || '';
  }

  private get defaultCallbackUrl(): string {
    return (
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/sso/google/callback'
    );
  }

  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const callbackUrl = redirectUri || this.defaultCallbackUrl;
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }> {
    const callbackUrl = redirectUri || this.defaultCallbackUrl;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`Google token exchange failed: ${errorText}`);
      throw new BadRequestException('Failed to exchange Google authorization code');
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

  async verifyToken(token: string): Promise<SsoUserProfile> {
    // Supports either an id_token or an access_token
    const isIdToken = token.split('.').length === 3;
    if (isIdToken) {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      );
      if (!res.ok) {
        throw new BadRequestException('Invalid Google ID token');
      }
      const data = (await res.json()) as {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
        email_verified?: string | boolean;
      };

      return {
        provider: SsoProvider.GOOGLE,
        providerAccountId: data.sub,
        email: data.email,
        name: data.name,
        avatarUrl: data.picture,
        emailVerified:
          data.email_verified === 'true' || data.email_verified === true,
        rawProfile: data as unknown as Record<string, unknown>,
      };
    }

    return this.fetchUserProfile(token);
  }

  private async fetchUserProfile(accessToken: string): Promise<SsoUserProfile> {
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      throw new BadRequestException('Failed to fetch Google user profile');
    }

    const info = (await userInfoResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    return {
      provider: SsoProvider.GOOGLE,
      providerAccountId: info.sub,
      email: info.email,
      name: info.name,
      avatarUrl: info.picture,
      emailVerified: Boolean(info.email_verified),
      rawProfile: info as unknown as Record<string, unknown>,
    };
  }
}
