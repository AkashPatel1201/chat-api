import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ToggleReactionDto {
  @ApiProperty({ example: '👍', description: 'Emoji to toggle' })
  @IsString()
  @IsNotEmpty({ message: 'Emoji is required' })
  @MaxLength(10)
  emoji: string;
}
