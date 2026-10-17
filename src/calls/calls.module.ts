import { Module } from '@nestjs/common';
import { CallsService } from './calls.service.js';
import { CallsController } from './calls.controller.js';

@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
