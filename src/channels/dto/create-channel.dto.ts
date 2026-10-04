import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({
    example: 'general',
    description: 'Unique channel name (letters, numbers, hyphens)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Channel name is required' })
  @MinLength(2, { message: 'Channel name must be at least 2 characters' })
  @MaxLength(50, { message: 'Channel name cannot exceed 50 characters' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Channel name must contain only lowercase letters, numbers, and hyphens',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'General workspace discussions and announcements',
    description: 'Channel description or topic',
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the channel is private to invited members only',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({
    example: 'text',
    description: 'Category for the channel (text, voice, announcements)',
    default: 'text',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
