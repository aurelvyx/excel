import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { AsistenciaModule } from '../asistencia/asistencia.module.js';
import { EvaluationModule } from '../evaluacion/evaluation.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
import { ReportWorkbookService } from './report-workbook.service.js';

@Module({
  imports: [ControlModule, AsistenciaModule, EvaluationModule],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService, ReportWorkbookService],
})
export class ReportsModule {}
