import { Module } from '@nestjs/common';
import { ChatGateway } from './websockets.gateway.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class WebsocketsModule {}
