import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Cryptographically random refresh token string',
    example: 'a6f5e4d3c2b10987...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
