import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [ControlModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class AsistenciaModule {}
