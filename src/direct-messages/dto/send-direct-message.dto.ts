import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendDirectMessageDto {
  @ApiProperty({
    example: 'Hey there! How is the project going?',
    description: 'Direct message content text',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(5000, { message: 'Message content cannot exceed 5000 characters' })
  content: string;

  @ApiPropertyOptional({
    example: [],
    description: 'Optional file or image attachments',
  })
  @IsOptional()
  @IsArray()
  attachments?: Array<{
    name: string;
    url: string;
    size?: string;
    type?: string;
  }>;
}
