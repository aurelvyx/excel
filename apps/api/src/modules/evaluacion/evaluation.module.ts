import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { EvaluationController } from './evaluation.controller.js';
import { EvaluationRepository } from './evaluation.repository.js';
import { EvaluationService } from './evaluation.service.js';

@Module({
  imports: [ControlModule],
  controllers: [EvaluationController],
  providers: [EvaluationRepository, EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
