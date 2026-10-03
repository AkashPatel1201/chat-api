import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { SsoService } from './sso/sso.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { SsoExchangeDto } from './dto/sso-exchange.dto.js';
import { SsoVerifyTokenDto } from './dto/sso-verify-token.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('Authentication & Multi-SSO')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
  ) {}

  /**
   * Register with Email and Password
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register with Email and Password',
    description: 'Creates a new user account with hashed password and generates session JWT tokens.',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered and session tokens created',
  })
  @ApiResponse({ status: 400, description: 'Email already exists or invalid payload' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.register(dto, { userAgent, ipAddress });
  }

  /**
   * Login with Email and Password
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with Email and Password',
    description: 'Authenticates user with email and password and returns session JWT tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
  })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.login(dto, { userAgent, ipAddress });
  }

  /**
   * List all configured SSO providers and their availability
   */
  @Get('sso/providers')
  @ApiOperation({
    summary: 'List available SSO providers',
    description:
      'Returns a list of all supported SSO providers (Google, GitHub, Microsoft, OIDC) with their configuration status and icons.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of SSO identity providers',
  })
  getSsoProviders() {
    return {
      providers: this.ssoService.getAvailableProviders(),
    };
  }

  /**
   * Get SSO authorization URL and CSRF state token
   */
  @Get('sso/:provider/url')
  @ApiOperation({
    summary: 'Get SSO authorization URL',
    description:
      'Generates a cryptographically signed HMAC state token and authorization URL to initiate SSO login with the specified provider.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description: 'Optional custom redirect URI',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL and CSRF state',
  })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  getAuthorizationUrl(
    @Param('provider') providerId: string,
    @Query('redirectUri') redirectUri?: string,
  ) {
    const provider = this.ssoService.getProvider(providerId);
    const effectiveRedirectUri = redirectUri || provider.callbackUrl;
    const state = this.ssoService.generateState(providerId, effectiveRedirectUri);
    const url = provider.getAuthorizationUrl(state, effectiveRedirectUri);

    return {
      provider: providerId,
      url,
      state,
      clientId: provider.clientId,
      redirectUri: effectiveRedirectUri,
    };
  }

  /**
   * Direct browser redirect to SSO provider
   */
  @Get('sso/:provider/login')
  @ApiOperation({
    summary: 'Direct browser redirect to SSO login',
    description:
      'Redirects the browser directly to the SSO identity provider consent page.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier',
  })
  @ApiQuery({
    name: 'redirectUri',
    required: false,
    description: 'Optional custom redirect URI',
  })
  @ApiResponse({ status: 302, description: 'Redirect to SSO provider' })
  redirectToProvider(
    @Param('provider') providerId: string,
    @Query('redirectUri') redirectUri: string | undefined,
    @Res() res: Response,
  ) {
    const provider = this.ssoService.getProvider(providerId);
    const effectiveRedirectUri = redirectUri || provider.callbackUrl;
    const state = this.ssoService.generateState(providerId, effectiveRedirectUri);
    const url = provider.getAuthorizationUrl(state, effectiveRedirectUri);
    return res.redirect(url);
  }

  /**
   * OAuth2 callback endpoint from SSO Identity Provider
   */
  @Get('sso/:provider/callback')
  @ApiOperation({
    summary: 'OAuth2 callback endpoint',
    description:
      'Receives the authorization code and state from the SSO provider, exchanges it for profile data, logs in or registers the user in PostgreSQL, and redirects to frontend or returns session tokens.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier',
  })
  @ApiQuery({ name: 'code', description: 'Authorization code from provider' })
  @ApiQuery({ name: 'state', description: 'CSRF state token' })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful with JWT tokens and user info',
  })
  @ApiResponse({ status: 400, description: 'Code missing or exchange failed' })
  async handleCallback(
    @Param('provider') providerId: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL;
    const queryError = req.query.error as string | undefined;
    const errorDescription = req.query.error_description as string | undefined;

    if (queryError) {
      if (frontendUrl) {
        const errorUrl = new URL(`${frontendUrl}/auth/sso/${providerId}/callback`);
        errorUrl.searchParams.set('error', queryError);
        if (errorDescription) {
          errorUrl.searchParams.set('error_description', errorDescription);
        }
        return res.redirect(errorUrl.toString());
      }
      throw new BadRequestException(errorDescription || queryError);
    }

    if (!code) {
      throw new BadRequestException('Authorization code is missing');
    }

    let redirectUri: string | undefined;
    if (state) {
      try {
        const stateData = this.ssoService.verifyState(state);
        redirectUri = stateData.redirectUri;
      } catch {
        // Fall back to provider default if state could not be verified
      }
    }
    if (!redirectUri) {
      const provider = this.ssoService.getProvider(providerId);
      redirectUri = provider.callbackUrl;
    }

    try {
      const { tokens, profile } = await this.ssoService.handleCodeExchange(
        providerId,
        code,
        redirectUri,
      );

      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;

      const authResult = await this.authService.loginOrRegisterSso(
        profile,
        tokens,
        { userAgent, ipAddress },
      );

      if (frontendUrl) {
        const targetUrl = new URL(`${frontendUrl}/auth/sso/${providerId}/callback`);
        targetUrl.searchParams.set('accessToken', authResult.accessToken);
        targetUrl.searchParams.set('refreshToken', authResult.refreshToken);
        targetUrl.searchParams.set('userId', authResult.user.id);
        targetUrl.searchParams.set('provider', providerId);
        return res.redirect(targetUrl.toString());
      }

      return res.status(HttpStatus.OK).json(authResult);
    } catch (err: any) {
      if (frontendUrl) {
        const errorUrl = new URL(`${frontendUrl}/auth/sso/${providerId}/callback`);
        errorUrl.searchParams.set('error', 'oauth_exchange_failed');
        errorUrl.searchParams.set(
          'error_description',
          err.message || 'Failed to exchange authorization code with SSO provider',
        );
        return res.redirect(errorUrl.toString());
      }
      throw err;
    }
  }

  /**
   * SPA / Mobile API code exchange
   */
  @Post('sso/:provider/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange SSO authorization code (SPA / Mobile)',
    description:
      'POST endpoint for SPAs and mobile apps to exchange authorization code for application JWT and refresh tokens.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens successfully issued',
  })
  @ApiResponse({ status: 400, description: 'Code exchange failed' })
  async exchangeCode(
    @Param('provider') providerId: string,
    @Body() dto: SsoExchangeDto,
    @Req() req: Request,
  ) {
    let effectiveRedirectUri = dto.redirectUri;
    if (dto.state) {
      try {
        const stateData = this.ssoService.verifyState(dto.state);
        if (!effectiveRedirectUri && stateData.redirectUri) {
          effectiveRedirectUri = stateData.redirectUri;
        }
      } catch {
        // Fall back to provider default if state could not be verified
      }
    }

    if (!effectiveRedirectUri) {
      const provider = this.ssoService.getProvider(providerId);
      effectiveRedirectUri = provider.callbackUrl;
    }

    const { tokens, profile } = await this.ssoService.handleCodeExchange(
      providerId,
      dto.code,
      effectiveRedirectUri,
    );

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    return this.authService.loginOrRegisterSso(profile, tokens, {
      userAgent,
      ipAddress,
    });
  }

  /**
   * Direct token verification (e.g. Google One Tap / Mobile SDK ID tokens)
   */
  @Post('sso/:provider/verify-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Direct token login (Google One-Tap / Mobile ID token)',
    description:
      'Validates ID token or provider access token directly, logs in the user, and issues API session tokens.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Direct token authentication successful',
  })
  @ApiResponse({ status: 400, description: 'Token invalid or expired' })
  async verifyToken(
    @Param('provider') providerId: string,
    @Body() dto: SsoVerifyTokenDto,
    @Req() req: Request,
  ) {
    const profile = await this.ssoService.handleTokenVerification(
      providerId,
      dto.token,
    );

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    return this.authService.loginOrRegisterSso(
      profile,
      { accessToken: dto.token },
      { userAgent, ipAddress },
    );
  }

  /**
   * Link an additional SSO provider to current authenticated user
   */
  @Post('sso/:provider/link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Link additional SSO provider to logged-in user',
    description:
      'Links a new identity provider to the currently authenticated account. Requires JWT Bearer token.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier to link',
  })
  @ApiResponse({
    status: 200,
    description: 'SSO provider successfully linked',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async linkAccount(
    @Param('provider') providerId: string,
    @Body() dto: SsoExchangeDto,
    @CurrentUser('id') userId: string,
  ) {
    const { tokens, profile } = await this.ssoService.handleCodeExchange(
      providerId,
      dto.code,
      dto.redirectUri,
    );

    return this.authService.linkSsoAccount(userId, profile, tokens);
  }

  /**
   * Unlink an SSO provider from current user account
   */
  @Delete('sso/:provider/unlink')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlink SSO provider from account',
    description:
      'Removes a linked identity provider from the current account. Requires at least one remaining login method.',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'github', 'microsoft', 'oidc'],
    description: 'The SSO provider identifier to unlink',
  })
  @ApiResponse({
    status: 200,
    description: 'SSO provider unlinked successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot unlink only login method' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unlinkAccount(
    @Param('provider') providerId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.unlinkSsoAccount(userId, providerId);
  }

  /**
   * Refresh session tokens
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh session tokens',
    description:
      'Rotates the refresh token and issues a new access token and refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access and refresh tokens returned',
  })
  @ApiResponse({ status: 401, description: 'Invalid or revoked refresh token' })
  async refreshSession(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return this.authService.refreshSession(dto.refreshToken, {
      userAgent,
      ipAddress,
    });
  }

  /**
   * Revoke session (Logout)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out and revoke session',
    description:
      'Marks the refresh token session as revoked in PostgreSQL.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session successfully revoked',
  })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.revokeSession(dto.refreshToken);
  }

  /**
   * Get current authenticated user profile + connected SSO providers
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user details and all linked SSO accounts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user profile with linked providers',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getUserProfile(userId);
  }
}
