import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';

@Module({
  controllers: [BackupsController],
  providers: [AuditService, BackupsService],
  exports: [AuditService],
})
export class ControlModule {}
