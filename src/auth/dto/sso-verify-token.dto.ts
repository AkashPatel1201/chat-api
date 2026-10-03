import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SsoVerifyTokenDto {
  @ApiProperty({
    description:
      'OAuth access token or ID token (e.g. Google One-Tap id_token) to verify directly',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
