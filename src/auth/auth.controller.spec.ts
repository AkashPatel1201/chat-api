import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SsoService } from './sso/sso.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: Partial<AuthService>;
  let ssoServiceMock: Partial<SsoService>;

  beforeEach(() => {
    authServiceMock = {
      loginOrRegisterSso: vi.fn(),
      refreshSession: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue({ success: true }),
      getUserProfile: vi.fn().mockResolvedValue({
        id: 'u-123',
        email: 'test@example.com',
        role: 'USER',
        accounts: [],
      }),
    };

    ssoServiceMock = {
      getAvailableProviders: vi.fn().mockReturnValue([
        { id: 'google', name: 'Google', icon: 'google', enabled: true },
        { id: 'github', name: 'GitHub', icon: 'github', enabled: true },
      ]),
      getProvider: vi.fn().mockReturnValue({
        id: 'google',
        name: 'Google',
        icon: 'google',
        isEnabled: true,
        getAuthorizationUrl: vi
          .fn()
          .mockReturnValue('https://accounts.google.com/oauth'),
        exchangeCode: vi.fn(),
      }),
      generateState: vi.fn().mockReturnValue('mock-state-token'),
      verifyState: vi.fn().mockReturnValue({ providerId: 'google' }),
    };

    controller = new AuthController(
      authServiceMock as AuthService,
      ssoServiceMock as SsoService,
    );
  });

  it('should return available SSO providers', () => {
    const res = controller.getSsoProviders();
    expect(res.providers).toHaveLength(2);
    expect(ssoServiceMock.getAvailableProviders).toHaveBeenCalled();
  });

  it('should return authorization url and state', () => {
    const res = controller.getAuthorizationUrl('google');
    expect(res.provider).toBe('google');
    expect(res.url).toBe('https://accounts.google.com/oauth');
    expect(res.state).toBe('mock-state-token');
  });

  it('should call revokeSession on logout', async () => {
    const res = await controller.logout({ refreshToken: 'test-token' });
    expect(res.success).toBe(true);
    expect(authServiceMock.revokeSession).toHaveBeenCalledWith('test-token');
  });

  it('should return current user profile on /auth/me', async () => {
    const user = await controller.getMe('u-123');
    expect(user.id).toBe('u-123');
    expect(authServiceMock.getUserProfile).toHaveBeenCalledWith('u-123');
  });
});
