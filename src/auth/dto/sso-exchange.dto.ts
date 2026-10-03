import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SsoExchangeDto {
  @ApiProperty({
    description: 'Authorization code returned by the SSO provider callback',
    example: '4/0AX4XfWh...',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({
    description: 'Redirect URI matching the initial OAuth request (optional)',
    example: 'http://localhost:3000/auth/sso/google/callback',
  })
  @IsString()
  @IsOptional()
  redirectUri?: string;

  @ApiPropertyOptional({
    description: 'CSRF state token returned by provider for verification',
    example: 'eyJwYXlsb2FkIjoie1wicHJvdmlk...',
  })
  @IsString()
  @IsOptional()
  state?: string;
}
