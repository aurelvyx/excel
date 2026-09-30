import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { VouchersController } from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';
@Module({
  imports: [ControlModule],
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class MatriculasModule {}
