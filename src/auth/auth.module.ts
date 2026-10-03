import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SsoService } from './sso/sso.service.js';
import { GoogleSsoProvider } from './sso/providers/google.provider.js';
import { GithubSsoProvider } from './sso/providers/github.provider.js';
import { MicrosoftSsoProvider } from './sso/providers/microsoft.provider.js';
import { GenericOidcSsoProvider } from './sso/providers/oidc.provider.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'chat-api-jwt-super-secret-key-change-in-production-2026',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SsoService,
    GoogleSsoProvider,
    GithubSsoProvider,
    MicrosoftSsoProvider,
    GenericOidcSsoProvider,
    JwtStrategy,
  ],
  exports: [AuthService, SsoService, JwtModule, PassportModule],
})
export class AuthModule {}
