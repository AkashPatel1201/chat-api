import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MessagesService } from './messages.service.js';
import { ToggleReactionDto } from './dto/toggle-reaction.dto.js';

@ApiTags('Messages')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post(':id/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle emoji reaction on message',
    description: 'Adds or removes an emoji reaction by the current user.',
  })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  async toggleReaction(
    @CurrentUser('id') userId: string,
    @Param('id') messageId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.messagesService.toggleReaction(userId, messageId, dto.emoji);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete message',
    description: 'Deletes a message if the current user is the sender or an admin.',
  })
  @ApiParam({ name: 'id', description: 'Message UUID' })
  async deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('id') messageId: string,
  ) {
    return this.messagesService.deleteMessage(userId, messageId);
  }
}
