import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

@Module({
  imports: [ControlModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class PersonasModule {}
