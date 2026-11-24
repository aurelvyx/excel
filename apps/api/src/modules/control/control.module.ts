import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';

@Module({
  controllers: [AuditController, BackupsController],
  providers: [AuditService, BackupsService],
  exports: [AuditService],
})
export class ControlModule {}
