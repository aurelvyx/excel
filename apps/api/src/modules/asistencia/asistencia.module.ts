import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [ControlModule],
  controllers: [SessionsController, AttendanceController],
  providers: [SessionsService, AttendanceService],
})
export class AsistenciaModule {}
