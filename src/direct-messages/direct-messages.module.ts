import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WebsocketsModule } from '../websockets/websockets.module.js';
import { DirectMessagesController } from './direct-messages.controller.js';
import { DirectMessagesService } from './direct-messages.service.js';

@Module({
  imports: [PrismaModule, WebsocketsModule],
  controllers: [DirectMessagesController],
  providers: [DirectMessagesService],
  exports: [DirectMessagesService],
})
export class DirectMessagesModule {}
