import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendChannelMessageDto {
  @ApiProperty({
    example: 'Hello everyone in #general! 🚀',
    description: 'Message content text',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty' })
  @MaxLength(5000, { message: 'Message content cannot exceed 5000 characters' })
  content: string;

  @ApiPropertyOptional({
    example: [
      {
        name: 'architecture.png',
        url: 'https://example.com/architecture.png',
        size: '1.2MB',
        type: 'image',
      },
    ],
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
