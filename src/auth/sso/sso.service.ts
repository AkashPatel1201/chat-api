import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import {
  ISsoProvider,
  SsoProviderPublicInfo,
  SsoTokens,
  SsoUserProfile,
} from './providers/sso-provider.interface.js';
import { GoogleSsoProvider } from './providers/google.provider.js';
import { GithubSsoProvider } from './providers/github.provider.js';
import { MicrosoftSsoProvider } from './providers/microsoft.provider.js';
import { GenericOidcSsoProvider } from './providers/oidc.provider.js';

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly providers: Map<string, ISsoProvider> = new Map();
  private readonly stateSecret =
    process.env.JWT_SECRET || 'sso-state-secret-2026';

  constructor(
    googleProvider: GoogleSsoProvider,
    githubProvider: GithubSsoProvider,
    microsoftProvider: MicrosoftSsoProvider,
    oidcProvider: GenericOidcSsoProvider,
  ) {
    this.registerProvider(googleProvider);
    this.registerProvider(githubProvider);
    this.registerProvider(microsoftProvider);
    this.registerProvider(oidcProvider);
  }

  private registerProvider(provider: ISsoProvider) {
    this.providers.set(provider.id.toLowerCase(), provider);
    this.logger.log(
      `Registered SSO provider: ${provider.name} (${provider.id}) - enabled: ${provider.isEnabled}`,
    );
  }

  getProvider(providerId: string): ISsoProvider {
    const provider = this.providers.get(providerId.toLowerCase());
    if (!provider) {
      const valid = Array.from(this.providers.keys()).join(', ');
      throw new NotFoundException(
        `SSO Provider '${providerId}' is not supported. Available: ${valid}`,
      );
    }
    return provider;
  }

  getAvailableProviders(): SsoProviderPublicInfo[] {
    return Array.from(this.providers.values()).map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      enabled: provider.isEnabled,
      callbackUrl: provider.callbackUrl,
    }));
  }

  generateState(providerId: string, redirectUri?: string): string {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const payload = JSON.stringify({
      providerId: providerId.toLowerCase(),
      redirectUri: redirectUri || null,
      nonce,
      timestamp,
    });
    const hmac = createHmac('sha256', this.stateSecret)
      .update(payload)
      .digest('hex');
    return Buffer.from(JSON.stringify({ payload, hmac })).toString('base64url');
  }

  verifyState(state: string): {
    providerId: string;
    redirectUri?: string;
  } {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      const { payload, hmac } = JSON.parse(decoded) as {
        payload: string;
        hmac: string;
      };

      const expectedHmac = createHmac('sha256', this.stateSecret)
        .update(payload)
        .digest('hex');

      if (hmac !== expectedHmac) {
        throw new BadRequestException('Invalid SSO state token signature');
      }

      const data = JSON.parse(payload) as {
        providerId: string;
        redirectUri?: string;
        timestamp: number;
      };

      // State token expires after 15 minutes
      if (Date.now() - data.timestamp > 15 * 60 * 1000) {
        throw new BadRequestException('SSO state token has expired');
      }

      return {
        providerId: data.providerId,
        redirectUri: data.redirectUri,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Malformed SSO state parameter');
    }
  }

  async handleCodeExchange(
    providerId: string,
    code: string,
    redirectUri?: string,
  ): Promise<{ tokens: SsoTokens; profile: SsoUserProfile }> {
    const provider = this.getProvider(providerId);
    return provider.exchangeCode(code, redirectUri);
  }

  async handleTokenVerification(
    providerId: string,
    token: string,
  ): Promise<SsoUserProfile> {
    const provider = this.getProvider(providerId);
    if (!provider.verifyToken) {
      throw new BadRequestException(
        `Direct token verification is not supported for ${provider.name}`,
      );
    }
    return provider.verifyToken(token);
  }
}
