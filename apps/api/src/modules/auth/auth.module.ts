import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ControlModule } from '../control/control.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AccessGuard } from './access.guard.js';

@Module({
  imports: [
    ControlModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [AuthService],
})
export class AuthModule {}
