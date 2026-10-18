import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCallHistoryDto {
  @ApiProperty({
    example: 'call_1729234567890',
    description: 'Unique client-generated call ID for idempotency',
  })
  @IsString()
  @IsNotEmpty({ message: 'callId is required' })
  callId!: string;

  @ApiProperty({
    example: 'voice',
    enum: ['voice', 'video'],
    description: 'Type of call: voice or video',
  })
  @IsString()
  @IsIn(['voice', 'video'], {
    message: 'callType must be either "voice" or "video"',
  })
  callType!: 'voice' | 'video';

  @ApiProperty({
    example: 'ended',
    description: 'Call status: ended, missed, declined, outgoing',
  })
  @IsString()
  @IsNotEmpty({ message: 'status is required' })
  status!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this was a 1-on-1 direct call',
  })
  @IsBoolean()
  isDirect!: boolean;

  @ApiPropertyOptional({
    example: 'usr_123',
    description: 'ID of the caller user',
  })
  @IsOptional()
  @IsString()
  callerId?: string;

  @ApiPropertyOptional({
    example: 'usr_456',
    description: 'ID of the recipient user (for direct calls)',
  })
  @IsOptional()
  @IsString()
  recipientId?: string;

  @ApiPropertyOptional({
    example: 'general',
    description: 'Channel name for group calls',
  })
  @IsOptional()
  @IsString()
  channelName?: string;

  @ApiPropertyOptional({
    example: 45,
    description: 'Call duration in seconds',
  })
  @IsOptional()
  @IsInt({ message: 'durationSeconds must be an integer' })
  @Min(0, { message: 'durationSeconds cannot be negative' })
  durationSeconds?: number;
}
