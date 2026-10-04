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
import { ChannelsService } from './channels.service.js';
import { CreateChannelDto } from './dto/create-channel.dto.js';
import { SendChannelMessageDto } from './dto/send-channel-message.dto.js';

@ApiTags('Channels')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({
    summary: 'List accessible channels',
    description: 'Returns all public channels and private channels the current user is a member of.',
  })
  @ApiResponse({ status: 200, description: 'List of channels' })
  async getChannels(@CurrentUser('id') userId: string) {
    return this.channelsService.getChannels(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new channel',
    description: 'Creates a new public or private channel and adds the creator as OWNER.',
  })
  @ApiResponse({ status: 201, description: 'Channel successfully created' })
  async createChannel(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.createChannel(userId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get channel details',
    description: 'Returns channel info, members list, and current user membership status.',
  })
  @ApiParam({ name: 'id', description: 'Channel ID or channel name' })
  async getChannel(
    @CurrentUser('id') userId: string,
    @Param('id') channelId: string,
  ) {
    return this.channelsService.getChannel(userId, channelId);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join channel',
    description: 'Adds the authenticated user to a public channel.',
  })
  @ApiParam({ name: 'id', description: 'Channel ID or channel name' })
  async joinChannel(
    @CurrentUser('id') userId: string,
    @Param('id') channelId: string,
  ) {
    return this.channelsService.joinChannel(userId, channelId);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Get channel messages',
    description: 'Returns message history with sender info, attachments, and emoji reactions.',
  })
  @ApiParam({ name: 'id', description: 'Channel ID or channel name' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max number of messages (default 100)' })
  async getMessages(
    @CurrentUser('id') userId: string,
    @Param('id') channelId: string,
    @Query('limit') limit?: number,
  ) {
    return this.channelsService.getMessages(userId, channelId, limit ? Number(limit) : 100);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send channel message',
    description: 'Posts a message to the specified channel with optional attachments.',
  })
  @ApiParam({ name: 'id', description: 'Channel ID or channel name' })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id') channelId: string,
    @Body() dto: SendChannelMessageDto,
  ) {
    return this.channelsService.sendMessage(userId, channelId, dto);
  }
}
