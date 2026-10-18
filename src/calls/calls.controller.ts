import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CallsService } from './calls.service.js';
import { CreateCallHistoryDto } from './dto/create-call-history.dto.js';

@ApiTags('Calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get Agora public configuration',
    description: 'Returns Agora App ID and environment availability.',
  })
  @ApiResponse({ status: 200, description: 'Agora configuration' })
  getConfig() {
    return this.callsService.getConfig();
  }

  @Get('token')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Generate Agora RTC token for Voice / Video call',
    description: 'Generates an Agora RTC token for joining a real-time call channel.',
  })
  @ApiQuery({ name: 'channelName', required: true, type: String })
  @ApiQuery({ name: 'role', required: false, enum: ['publisher', 'subscriber'] })
  @ApiResponse({ status: 200, description: 'Agora token and channel credentials' })
  getToken(
    @CurrentUser('id') userId: string,
    @Query('channelName') channelName: string,
    @Query('role') role?: 'publisher' | 'subscriber',
  ) {
    if (!channelName || !channelName.trim()) {
      throw new BadRequestException('channelName query parameter is required');
    }

    return this.callsService.generateToken(
      channelName.trim(),
      userId,
      role || 'publisher',
    );
  }

  // ─── Call History ──────────────────────────────────────────────────────────

  @Post('history')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Save a call history record',
    description: 'Persists an audio/video call event (ended, missed, declined) to the database.',
  })
  @ApiBody({ description: 'Call history payload' })
  @ApiResponse({ status: 201, description: 'Call history record saved' })
  saveCallHistory(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCallHistoryDto,
  ) {
    return this.callsService.createCallHistory(userId, dto);
  }

  @Get('history')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get call history for a conversation',
    description:
      'Fetches call history for a DM (pass otherUserId) or a channel (pass channelName).',
  })
  @ApiQuery({ name: 'otherUserId', required: false, type: String })
  @ApiQuery({ name: 'channelName', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of call history records' })
  getCallHistory(
    @CurrentUser('id') userId: string,
    @Query('otherUserId') otherUserId?: string,
    @Query('channelName') channelName?: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50;

    if (otherUserId) {
      return this.callsService.getDirectCallHistory(userId, otherUserId, take);
    }
    if (channelName) {
      return this.callsService.getChannelCallHistory(channelName, take);
    }

    throw new BadRequestException('Provide either otherUserId or channelName');
  }
}
