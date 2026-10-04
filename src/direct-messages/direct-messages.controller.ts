import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { DirectMessagesService } from './direct-messages.service.js';
import { SendDirectMessageDto } from './dto/send-direct-message.dto.js';

@ApiTags('Direct Messages')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('direct-messages')
export class DirectMessagesController {
  constructor(private readonly dmService: DirectMessagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List recent direct message conversations',
    description: 'Returns all 1-on-1 conversations the user has participated in with the latest message and timestamp.',
  })
  @ApiResponse({ status: 200, description: 'List of direct message conversations' })
  async getConversations(@CurrentUser('id') userId: string) {
    return this.dmService.getConversations(userId);
  }

  @Get(':userId/messages')
  @ApiOperation({
    summary: 'Get message history with specific user',
    description: 'Returns direct messages between current user and target user.',
  })
  @ApiParam({ name: 'userId', description: 'ID of target user' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of messages' })
  async getMessages(
    @CurrentUser('id') userId: string,
    @Param('userId') targetUserId: string,
    @Query('limit') limit?: number,
  ) {
    return this.dmService.getMessages(userId, targetUserId, limit ? Number(limit) : 100);
  }

  @Post(':userId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send direct message to a user',
    description: 'Creates a direct message to target user with optional attachments.',
  })
  @ApiParam({ name: 'userId', description: 'ID of recipient user' })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('userId') recipientId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.dmService.sendMessage(userId, recipientId, dto);
  }
}
