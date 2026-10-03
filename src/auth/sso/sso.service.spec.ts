import { describe, it, expect, beforeEach } from 'vitest';
import { SsoService } from './sso.service.js';
import { GoogleSsoProvider } from './providers/google.provider.js';
import { GithubSsoProvider } from './providers/github.provider.js';
import { MicrosoftSsoProvider } from './providers/microsoft.provider.js';
import { GenericOidcSsoProvider } from './providers/oidc.provider.js';

describe('SsoService', () => {
  let ssoService: SsoService;
  let googleProvider: GoogleSsoProvider;
  let githubProvider: GithubSsoProvider;
  let microsoftProvider: MicrosoftSsoProvider;
  let oidcProvider: GenericOidcSsoProvider;

  beforeEach(() => {
    googleProvider = new GoogleSsoProvider();
    githubProvider = new GithubSsoProvider();
    microsoftProvider = new MicrosoftSsoProvider();
    oidcProvider = new GenericOidcSsoProvider();

    ssoService = new SsoService(
      googleProvider,
      githubProvider,
      microsoftProvider,
      oidcProvider,
    );
  });

  it('should list all registered SSO providers', () => {
    const providers = ssoService.getAvailableProviders();
    expect(providers.length).toBe(4);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('google');
    expect(ids).toContain('github');
    expect(ids).toContain('microsoft');
    expect(ids).toContain('oidc');
  });

  it('should generate and verify valid HMAC state tokens', () => {
    const state = ssoService.generateState(
      'google',
      'http://localhost:3001/dashboard',
    );
    expect(state).toBeDefined();

    const decoded = ssoService.verifyState(state);
    expect(decoded.providerId).toBe('google');
    expect(decoded.redirectUri).toBe('http://localhost:3001/dashboard');
  });

  it('should throw error for invalid state token', () => {
    expect(() => ssoService.verifyState('invalid-state-payload')).toThrow();
  });

  it('should retrieve a provider by id', () => {
    const provider = ssoService.getProvider('github');
    expect(provider.id).toBe('github');
    expect(provider.name).toBe('GitHub');
  });

  it('should throw NotFoundException for unknown provider', () => {
    expect(() => ssoService.getProvider('unsupported-sso')).toThrow();
  });
});
