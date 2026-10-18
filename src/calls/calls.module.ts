import { Module } from '@nestjs/common';
import { CallsService } from './calls.service.js';
import { CallsController } from './calls.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
