import { Module } from '@nestjs/common';
import { ControlModule } from '../control/control.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [ControlModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
