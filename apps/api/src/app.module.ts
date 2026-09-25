import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/usuarios/users.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}
