import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class AddChannelMemberDto {
  @ApiPropertyOptional({
    example: ['user-id-1', 'user-id-2'],
    description: 'Array of user IDs to add to the channel',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    example: 'user-id-1',
    description: 'Single user ID to add to the channel',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
