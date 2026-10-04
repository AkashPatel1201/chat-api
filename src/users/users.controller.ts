import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { IsOptional, IsString } from 'class-validator';

export class UpdateStatusDto {
  @ApiPropertyOptional({ example: 'online', enum: ['online', 'idle', 'dnd', 'offline'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Working on full-stack chat feature 🚀' })
  @IsOptional()
  @IsString()
  statusMessage?: string;
}

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'List users',
    description: 'Returns all active users for DM selection, user directory, and searching.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search term for name or email' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async listUsers(
    @CurrentUser('id') currentUserId: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listUsers(currentUserId, search);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Returns public user profile information.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  async getUser(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Patch('status')
  @ApiOperation({
    summary: 'Update user status',
    description: 'Update current user status (online/idle/dnd/offline) and statusMessage.',
  })
  async updateStatus(
    @CurrentUser('id') currentUserId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.usersService.updateStatus(currentUserId, dto);
  }
}
