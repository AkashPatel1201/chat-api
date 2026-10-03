import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SsoProvider } from '@prisma/client';
import {
  ISsoProvider,
  SsoTokens,
  SsoUserProfile,
} from './sso-provider.interface.js';

@Injectable()
export class GithubSsoProvider implements ISsoProvider {
  private readonly logger = new Logger(GithubSsoProvider.name);
  readonly id = 'github';
  readonly name = 'GitHub';
  readonly icon = 'github';

  get isEnabled(): boolean {
    return Boolean(
      process.env.GITHUB_CLIENT_ID &&
        process.env.GITHUB_CLIENT_ID !== 'your-github-client-id',
    );
  }

  get clientId(): string {
    return process.env.GITHUB_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GITHUB_CLIENT_SECRET || '';
  }

  get callbackUrl(): string {
    return (
      process.env.GITHUB_CALLBACK_URL ||
      'http://localhost:3000/auth/sso/github/callback'
    );
  }

  getAuthorizationUrl(state: string, redirectUri?: string): string {
    const callbackUrl = redirectUri || this.callbackUrl;
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }> {
    const callbackUrl = redirectUri || this.callbackUrl;

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      this.logger.error(`GitHub token exchange failed: ${errorText}`);
      throw new BadRequestException('Failed to exchange GitHub authorization code');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      token_type?: string;
      scope?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      throw new BadRequestException(
        tokenData.error_description || 'Failed to obtain GitHub access token',
      );
    }

    const tokens: SsoTokens = {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    };

    const userProfile = await this.fetchUserProfile(tokenData.access_token);
    return { tokens, profile: userProfile };
  }

  async verifyToken(accessToken: string): Promise<SsoUserProfile> {
    return this.fetchUserProfile(accessToken);
  }

  private async fetchUserProfile(accessToken: string): Promise<SsoUserProfile> {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'chat-api-sso',
      },
    });

    if (!userRes.ok) {
      throw new BadRequestException('Failed to fetch GitHub user data');
    }

    const githubUser = (await userRes.json()) as {
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    let primaryEmail = githubUser.email;
    let isVerified = false;

    // Fetch verified email list if user.email is null (GitHub privacy setting)
    try {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'chat-api-sso',
        },
      });

      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;

        const primary = emails.find((e) => e.primary && e.verified);
        if (primary) {
          primaryEmail = primary.email;
          isVerified = true;
        } else {
          const anyVerified = emails.find((e) => e.verified);
          if (anyVerified) {
            primaryEmail = anyVerified.email;
            isVerified = true;
          }
        }
      }
    } catch (e) {
      this.logger.warn(`Could not fetch GitHub user emails: ${(e as Error).message}`);
    }

    if (!primaryEmail) {
      // Fallback synthetic email if no public/verified email provided
      primaryEmail = `${githubUser.login}@github.users.noreply`;
    }

    return {
      provider: SsoProvider.GITHUB,
      providerAccountId: String(githubUser.id),
      email: primaryEmail,
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
      emailVerified: isVerified,
      rawProfile: githubUser as unknown as Record<string, unknown>,
    };
  }
}
