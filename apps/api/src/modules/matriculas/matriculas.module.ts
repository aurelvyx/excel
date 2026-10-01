import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';
import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
@Module({
  imports: [ControlModule],
  controllers: [VouchersController, EnrollmentsController],
  providers: [VouchersService, EnrollmentsService],
})
export class MatriculasModule {}
