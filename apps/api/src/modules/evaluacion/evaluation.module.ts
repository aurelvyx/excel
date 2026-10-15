import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { EvaluationController } from './evaluation.controller.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { EvaluationService } from './evaluation.service.js';
import { GradesController } from './grades.controller.js';
import { GradesRepository } from './grades.repository.js';
import { GradesService } from './grades.service.js';
import { GradeCalculationService } from './grade-calculation.service.js';
import { AsistenciaModule } from '../asistencia/asistencia.module.js';
import { ActController } from './act.controller.js';
import { ActRepository } from './act.repository.js';
import { ActService } from './act.service.js';
import { ResultCalculationService } from './result-calculation.service.js';

@Module({
  imports: [ControlModule, AsistenciaModule],
  controllers: [EvaluationController, GradesController, ActController],
  providers: [
    EvaluationRepository,
    EvaluationService,
    GradesRepository,
    GradesService,
    GradeCalculationService,
    ActRepository,
    ActService,
    ResultCalculationService,
  ],
  exports: [EvaluationService, GradeCalculationService],
})
export class EvaluationModule {}
