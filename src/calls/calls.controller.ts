import {
  Controller,
  Get,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CallsService } from './calls.service.js';

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
}
