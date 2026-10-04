import 'dotenv/config';
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { DirectMessagesModule } from './direct-messages/direct-messages.module.js';
import { UsersModule } from './users/users.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { WebsocketsModule } from './websockets/websockets.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? "",
      appSecret: process.env.OBSERVE_APP_SECRET ?? "",
      serviceId: process.env.OBSERVE_SERVICE_ID ?? "",
    }),
    PrismaModule,
    AuthModule,
    WebsocketsModule,
    ChannelsModule,
    DirectMessagesModule,
    UsersModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
