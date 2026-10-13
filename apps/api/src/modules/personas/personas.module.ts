import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { StudentHistoryService } from './student-history.service.js';
import { AsistenciaModule } from '../asistencia/asistencia.module.js';

@Module({
  imports: [ControlModule, AsistenciaModule],
  controllers: [TeachersController, StudentsController],
  providers: [TeachersService, StudentsService, StudentHistoryService],
})
export class PersonasModule {}
