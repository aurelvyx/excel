import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceCalculationService } from './attendance-calculation.service.js';
import { JustificationsController } from './justifications.controller.js';
import { JustificationsService } from './justifications.service.js';
import { AttendanceClosureController } from './attendance-closure.controller.js';
import { AttendanceClosureService } from './attendance-closure.service.js';

@Module({
  imports: [ControlModule],
  controllers: [
    SessionsController,
    AttendanceController,
    JustificationsController,
    AttendanceClosureController,
  ],
  providers: [
    SessionsService,
    AttendanceService,
    AttendanceCalculationService,
    JustificationsService,
    AttendanceClosureService,
  ],
  exports: [AttendanceCalculationService],
})
export class AsistenciaModule {}
