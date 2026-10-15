import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { EvaluationController } from './evaluation.controller.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { EvaluationService } from './evaluation.service.js';
import { GradesController } from './grades.controller.js';
import { GradesRepository } from './grades.repository.js';
import { GradesService } from './grades.service.js';
import { GradeCalculationService } from './grade-calculation.service.js';

@Module({
  imports: [ControlModule],
  controllers: [EvaluationController, GradesController],
  providers: [
    EvaluationRepository,
    EvaluationService,
    GradesRepository,
    GradesService,
    GradeCalculationService,
  ],
  exports: [EvaluationService, GradeCalculationService],
})
export class EvaluationModule {}
